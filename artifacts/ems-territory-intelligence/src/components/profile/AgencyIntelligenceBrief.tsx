/**
 * Agency operational baseline, presented as an intelligence brief:
 * equipment in use + buy-back -> snapshot figures -> findings (finding / basis / next step) -> equipment and contract facts.
 * Presentation only; every value comes from the existing agency record.
 * Missing values render "Not reported"; reported zeros are preserved.
 * Provider-scope claim denial figures are intentionally not shown here.
 */
import React from 'react';
import {
  Activity,
  Ambulance,
  ArrowRight,
  Building2,
  CalendarClock,
  Cpu,
  Flame,
  Monitor,
  Wind,
  HeartPulse,
  Landmark,
  Map as MapIcon,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { Agency, AgencyFactEvidenceKey } from '../../types';
import { hasAgencyFactEvidence } from '../../data/agencyFactEvidence';
import { DataLabel, dataLabelTone, inferDataLabelKind, type DataLabelKind } from '../DataLabel';
import {
  NOT_REPORTED,
  buildEquipmentLines,
  summarizeEvidence,
  type EquipmentLine,
} from './equipmentInsights';
import { useProfileResearch, type ProfileResearchState } from './useProfileResearch';
import { ProfileDecisionSupport } from './ProfileDecisionSupport';
import { BuybackDecisionSupport } from './BuybackDecisionSupport';
import { MeetingBriefPanel } from './MeetingBriefPanel';

type IconType = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;

const isNum = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const fmt = (v: number | null | undefined) => (isNum(v) ? v.toLocaleString() : 'Not reported');
const money = (v: number | null | undefined) => (isNum(v) ? `$${v.toLocaleString()}` : 'Not reported');

export type ServiceMode = 'ems' | 'fire' | 'combined';

export const getAgencyServiceMode = (agency: Agency): ServiceMode => {
  const type = `${agency.agencyType ?? ''}`.toLowerCase();
  const fire = agency.providerCategory === 'FIRE' || type.includes('fire');
  if (!fire) return 'ems';
  const transports =
    (isNum(agency.totalAmbulances) && agency.totalAmbulances > 0) ||
    (isNum(agency.annual911Transports) && agency.annual911Transports > 0) ||
    // 'Rescue' alone does not imply patient transport; only explicit transport evidence counts.
    /\bems\b|ambulance|transport/.test(type);
  return transports ? 'combined' : 'fire';
};

type Figure = {
  id: string;
  label: string;
  value: number | null | undefined;
  unit?: string;
  period?: string;
  icon: IconType;
  testId?: string;
};

const Fig: React.FC<Figure & { lead?: boolean }> = ({ label, value, unit, period, icon: Icon, testId, lead }) => (
  <div className="aib-figure" data-lead={lead || undefined} data-testid={testId} data-label-tone={dataLabelTone(inferDataLabelKind(label))}>
    <dt><Icon className="aib-icon" aria-hidden="true" />{label}</dt>
    <dd className={isNum(value) ? '' : 'is-missing'}>
      <span className="aib-num">{fmt(value)}</span>
      {isNum(value) && (unit || period) && (
        <span className="aib-unit">{[unit, period].filter(Boolean).join(' · ')}</span>
      )}
    </dd>
  </div>
);

const Row: React.FC<{ label: string; kind: DataLabelKind; children: React.ReactNode; tone?: 'muted' | 'alert' }> = ({ label, kind, children, tone }) => (
  <div className="aib-row">
    <dt><DataLabel kind={kind}>{label}</DataLabel></dt>
    <dd className={tone ? `is-${tone}` : ''}>{children}</dd>
  </div>
);

type Finding = { key: string; icon: IconType; finding: string; basis: string; next: string };

const buildFindings = (agency: Agency): Finding[] => {
  const out: Finding[] = [];
  const contract = agency.competitorContract;
  if (contract?.contractEndDate) {
    out.push({
      key: 'contract',
      icon: CalendarClock,
      finding: `${contract.vendor || 'Service'} contract recorded as ending ${contract.contractEndDate}.`,
      basis: `Contract record · status ${contract.status || 'not reported'}${contract.contractNumber ? ` · no. ${contract.contractNumber}` : ''}`,
      next: contract.actionRecommendation || 'Confirm the end date and renewal process with purchasing.',
    });
  }
  const grants = agency.femaGrantHistory ?? [];
  const latest = [...grants].filter((g) => isNum(g.fiscalYear)).sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
  if (latest) {
    out.push({
      key: 'grant',
      icon: Landmark,
      finding: `${latest.programName} award recorded for FY${latest.fiscalYear}${isNum(latest.awardAmount) ? ` (${money(latest.awardAmount)})` : ''}.`,
      basis: `FEMA grant history · ${grants.length.toLocaleString()} record${grants.length === 1 ? '' : 's'} · ${latest.purpose}`,
      next: 'Ask how grant-funded purchases are planned and who prepares applications.',
    });
  }
  if (agency.budgetCycleEndMonth) {
    out.push({
      key: 'budget',
      icon: CalendarClock,
      finding: `Budget cycle recorded as ending in ${agency.budgetCycleEndMonth}.`,
      basis: 'Agency record · budget cycle field',
      next: 'Confirm request deadlines for the next capital budget.',
    });
  }
  return out;
};

const categoryIcon: Record<EquipmentLine['category'], IconType> = {
  monitor: Monitor, cpr: HeartPulse, ventilator: Wind, software: Cpu,
};

const SourceBasis: React.FC<{ agency: Agency; fields: AgencyFactEvidenceKey[] }> = ({ agency, fields }) => {
  const items = Array.from(new Set(fields)).map((f) => summarizeEvidence(agency, f)).filter((e) => e.state !== 'none');
  const labels: Partial<Record<AgencyFactEvidenceKey, string>> = {
    defibrillatorBiomedicalFleet: 'Monitor / defibrillator', verifiedHardware: 'Clinical hardware',
    epcrSystem: 'ePCR / CAD record', communicationsSystems: 'Dispatch communications',
    billingSoftware: 'Billing software', maintenanceContracts: 'Warranty / service',
  };
  return (
    <details className="aib-sources" data-testid="equipment-source-basis">
      <summary>Source details{items.length > 0 && <span className="aib-sources-count">{items.length}</span>}</summary>
      {items.length > 0 && <ul>
        {items.map((e) => (
          <li key={e.field} data-state={e.state}>
            <p className="aib-eq-label">{labels[e.field] || 'Equipment record'}</p>
            {e.state !== 'none' && (
              <p className="aib-src-meta">
                {e.sourceUrl
                  ? <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">{e.sourceName}</a>
                  : e.sourceName}
                {[e.period && `Period ${e.period}`, e.scope && `Scope ${e.scope}`]
                  .filter(Boolean).map((t) => <span key={String(t)}> · {t}</span>)}
              </p>
            )}
            {e.note && <p className="aib-src-meta">{e.note}</p>}
          </li>
        ))}
      </ul>}
    </details>
  );
};

const EquipmentSummary: React.FC<{ agency: Agency; renderFactTag: AgencyIntelligenceBriefProps['renderFactTag'] }> = ({ agency, renderFactTag }) => {
  const lines = buildEquipmentLines(agency);
  const f = agency.installedFleet ?? ({} as Agency['installedFleet']);
  const warranty = (f.defibWarrantyStatus || '').trim() || NOT_REPORTED;
  const warrantyAlert = hasAgencyFactEvidence(agency, 'maintenanceContracts') && warranty.includes('Expired');
  const hardware = lines.filter((l) => l.category !== 'software');
  const featured = hardware[0];
  const otherHardware = hardware.slice(1);
  const software = lines.filter((l) => l.category === 'software');
  const line = (l: EquipmentLine) => {
    const Icon = categoryIcon[l.category];
    const missing = l.value === NOT_REPORTED;
    const ev = summarizeEvidence(agency, l.evidenceKeys[0]);
    return (
      <li key={l.key} className="aib-eq" data-testid={`equipment-line-${l.key}`}>
        <div className="min-w-0">
          <p className="aib-eq-label"><span className="aib-eq-ico" data-category={l.category} aria-hidden="true"><Icon className="aib-icon" aria-hidden="true" /></span>{l.label}</p>
          <p className={`aib-eq-value${missing ? ' is-missing' : ''}`}>{l.value}</p>
          {ev.state !== 'none' && (
            <p className="aib-eq-src" data-state={ev.state} data-testid={`equipment-source-${l.key}`}>
              {ev.sourceName && <>{ev.sourceUrl ? <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer">{ev.sourceName}</a> : ev.sourceName}</>}
            </p>
          )}
        </div>
        {l.quantity && <p className={`aib-eq-qty${l.quantity === NOT_REPORTED ? ' is-missing' : ''}`}>{l.quantity === NOT_REPORTED ? 'Qty not reported' : l.quantity}</p>}
      </li>
    );
  };
  return (
    <section className="aib-block aib-tech" data-testid="profile-equipment-summary" aria-labelledby="aib-tech-title">
      <h3 id="aib-tech-title" className="aib-label"><Cpu className="aib-icon" aria-hidden="true" />Recorded inventory</h3>
      <p className="aib-scope">Recorded inventory</p>
      <div className="aib-device-feature" data-testid="equipment-featured-device">
        {featured && <ul className="aib-eqlist aib-eqlist--feature">{line(featured)}</ul>}
        <dl className="aib-keyfacts">
          <div><dt><CalendarClock className="aib-icon" aria-hidden="true" />Monitor fleet age</dt><dd className={isNum(f.defibAgeYears) ? '' : 'is-missing'}>{isNum(f.defibAgeYears) ? `${f.defibAgeYears.toLocaleString()} years` : NOT_REPORTED}</dd></div>
          <div><dt><ShieldCheck className="aib-icon" aria-hidden="true" />Warranty / support</dt><dd className={warrantyAlert ? 'is-alert' : warranty === NOT_REPORTED ? 'is-missing' : ''}>{warranty}</dd></div>
        </dl>
        <p className="aib-device-note">Age describes the record, not buying intent.</p>
      </div>
      {otherHardware.length > 0 && <>
        <p className="aib-sub"><HeartPulse className="aib-icon" aria-hidden="true" />Other clinical hardware</p>
        <ul className="aib-eqlist">{otherHardware.map(line)}</ul>
      </>}
      <p className="aib-sub"><Monitor className="aib-icon" aria-hidden="true" />Software</p>
      <ul className="aib-eqlist">{software.map(line)}</ul>
      <div className="aib-tags">
        {renderFactTag('defibrillatorBiomedicalFleet')}
        {renderFactTag('verifiedHardware')}
        {renderFactTag('epcrSystem')}
        {renderFactTag('maintenanceContracts')}
      </div>
      <SourceBasis agency={agency} fields={lines.flatMap((l) => l.evidenceKeys).concat('maintenanceContracts')} />
    </section>
  );
};

/** Shares one browser-local research record across decision support, buy-back and meeting brief. Keyed by agency id. */
const DecisionSupportStack: React.FC<{ agency: Agency; children: (r: ProfileResearchState) => React.ReactNode }> = ({ agency, children }) => {
  const research = useProfileResearch(agency.id);
  return <>{children(research)}</>;
};

export interface AgencyIntelligenceBriefProps {
  agency: Agency;
  /** Renders the existing per-field source status tag. */
  renderFactTag: (field: AgencyFactEvidenceKey) => React.ReactNode;
  onOpenSources?: () => void;
  /** Which slice of the brief to render. Each profile section renders only its own slice, so nothing repeats. */
  view?: BriefView;
}

export type BriefView = 'overview' | 'equipment' | 'purchasing' | 'operations';

export const AgencyIntelligenceBrief: React.FC<AgencyIntelligenceBriefProps> = ({ agency, renderFactTag, onOpenSources, view = 'overview' }) => {
  const mode = getAgencyServiceMode(agency);
  const isFire = mode !== 'ems';
  const findings = buildFindings(agency);
  const modeLabel = mode === 'combined' ? 'Fire & EMS' : mode === 'fire' ? 'Fire department' : 'EMS provider';

  const callsFigure: Figure = {
    id: 'calls', testId: 'baseline-annual-calls', icon: Radio, period: 'per year',
    label: isFire ? 'Reported fire-rescue calls' : 'Reported EMS calls',
    value: agency.annualCallVolume,
  };
  const transportsFigure: Figure = { id: 'transports', icon: Ambulance, label: 'EMS transports', value: agency.annual911Transports, period: 'per year' };
  const stationsFigure: Figure = { id: 'stations', testId: 'baseline-stations', icon: Building2, label: 'Stations', value: agency.stationsCount };
  const ambulancesFigure: Figure = { id: 'ambulances', icon: Ambulance, label: 'Active ambulances', value: agency.totalAmbulances, unit: 'units' };
  const enginesFigure: Figure = { id: 'engines', testId: 'baseline-fire-engines', icon: Flame, label: 'Fire suppression engines', value: agency.totalFireEngines, unit: 'units' };
  const arrestFigure: Figure = { id: 'arrest', icon: HeartPulse, label: 'Cardiac-arrest responses', value: agency.annualCardiacArrestCalls, period: 'per year' };
  const survivalFigure: Figure = { id: 'survival', icon: Activity, label: 'Utstein survival rate', value: agency.utsteinSurvivalRate, unit: '%' };
  const contextFigures: Figure[] = [
    { id: 'staff', icon: Users, label: 'EMS personnel', value: agency.totalEMSStaff },
    { id: 'population', icon: Users, label: 'Population served', value: agency.populationServed },
    { id: 'area', icon: MapIcon, label: 'Response area', value: agency.responseAreaSqMiles, unit: 'sq mi' },
  ];

  const figures: Figure[] =
    mode === 'ems'
      ? [callsFigure, transportsFigure, ambulancesFigure, stationsFigure, arrestFigure, survivalFigure]
      : mode === 'combined'
        ? [callsFigure, transportsFigure, stationsFigure, enginesFigure, ambulancesFigure, arrestFigure, survivalFigure]
        : [callsFigure, stationsFigure, enginesFigure, ambulancesFigure, transportsFigure, arrestFigure, survivalFigure];

  return (
    <section
      className="aib pi-surface"
      data-testid="agency-operational-baseline"
      data-service-mode={mode}
      data-brief-view={view}
      aria-labelledby="agency-operational-baseline-title"
    >
      <header className="aib-top">
        <div className="min-w-0">
          <h2 id={`agency-operational-baseline-title`} className="aib-title">{view === 'equipment' ? 'Recorded equipment & buy-back' : view === 'purchasing' ? 'Findings, contracts & funding' : view === 'operations' ? 'Operational volume' : 'Account findings & meeting preparation'}</h2>
          <p className="aib-note">{modeLabel}</p>
        </div>
        {onOpenSources && (
          <button type="button" className="aib-link" onClick={onOpenSources} data-testid="button-brief-open-sources">
            <ShieldCheck className="aib-icon" aria-hidden="true" />
            Sources
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </header>

      {view === 'overview' && (
        <DecisionSupportStack key={agency.id} agency={agency}>
          {(research) => (
            <div className="pds-row">
              <ProfileDecisionSupport agency={agency} research={research} />
              <MeetingBriefPanel agency={agency} research={research.data} />
            </div>
          )}
        </DecisionSupportStack>
      )}
      {view === 'equipment' && (
        <DecisionSupportStack key={agency.id} agency={agency}>
          {(research) => (
            <div className="aib-equipment-row">
              <EquipmentSummary agency={agency} renderFactTag={renderFactTag} />
              <BuybackDecisionSupport agency={agency} research={research} />
            </div>
          )}
        </DecisionSupportStack>
      )}
      {view === 'operations' && (
        <section className="aib-block aib-snapshot" data-testid="baseline-operational-metrics" aria-labelledby="aib-snapshot-title">
          <h3 id="aib-snapshot-title" className="aib-label"><DataLabel kind="calls">Operational volume &amp; acuity</DataLabel></h3>
          <div className="aib-tags">
            {renderFactTag('stationCount')}
            {renderFactTag('frontlineApparatusStations')}
            {renderFactTag('annualCallsReceived')}
            {renderFactTag('annualEmergencyVolume')}
            {renderFactTag('clinicalOutcomes')}
          </div>
          <dl className="aib-figures aib-figures--cards">
            {figures.map((f, i) => <Fig key={f.id} {...f} lead={i < 2} />)}
          </dl>
          <h4 className="aib-sub aib-footprint-title"><MapIcon className="aib-icon" aria-hidden="true" />Service footprint</h4>
          <dl className="aib-figures aib-figures--cards aib-figures--footprint">
            {contextFigures.map((f) => <Fig key={f.id} {...f} />)}
          </dl>
        </section>

      )}
      {(view === 'purchasing' || view === 'overview') && (
        <section className="aib-block aib-findings-block" aria-labelledby="aib-findings-title">
          <h3 id="aib-findings-title" className="aib-label"><DataLabel kind="notes">Findings to discuss</DataLabel>{findings.length > 0 && <span className="aib-count">{findings.length}</span>}</h3>
          {findings.length > 0 ? (
            <ol className="aib-findings">
              <li className="aib-findings-cols" aria-hidden="true"><span>Finding</span><span>Basis</span><span>Next step</span></li>
              {findings.map(({ key, icon: Icon, finding, basis, next }) => (
                <li key={key} className="aib-finding" data-testid={`brief-finding-${key}`}>
                  <p className="aib-f"><Icon className="aib-icon" aria-hidden="true" />{finding}</p>
                  <p className="aib-b"><span className="aib-tag">Basis</span>{basis}</p>
                  <p className="aib-n"><span className="aib-tag">Next</span>{next}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="aib-empty">No contract, grant or budget-cycle records are present yet. Add records in the source section.</p>
          )}

          <div className="aib-facts">
            <section aria-labelledby="aib-contracts-title">
              <h3 id="aib-contracts-title" className="aib-label"><Landmark className="aib-icon" aria-hidden="true" />Contracts &amp; funding</h3>
              <div className="aib-tags">
                {renderFactTag('maintenanceContracts')}
                {renderFactTag('cmsClaims')}
                {renderFactTag('federalGrant')}
              </div>
              <dl className="aib-rows">
                <Row label="Contract end date" kind="expiration">{agency.competitorContract.contractEndDate || 'Not reported'}</Row>
                <Row label="Contract status" kind="contract">{agency.competitorContract.status || 'Not reported'}</Row>
                <Row label="Lost claim revenue" kind="claims" tone="muted">Not reported with a reproducible method</Row>
                <Row label="FEMA AFG grants" kind="funding">
                  {agency.grantStatus.afgAwarded
                    ? `${money(agency.grantStatus.afgAwardAmount)} (FY${fmt(agency.grantStatus.afgFiscalYear)})`
                    : 'No award indicated in this record'}
                </Row>
              </dl>
            </section>
          </div>
        </section>
      )}
    </section>
  );
};

export default AgencyIntelligenceBrief;
