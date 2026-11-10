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
  ClipboardCheck,
  Cpu,
  Flame,
  Monitor,
  Repeat,
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
  TRADE_IN_CHECKLIST,
  buildEquipmentLines,
  getDocumentedOffers,
  offerKindLabel,
  offerTotal,
  offerValue,
  summarizeEvidence,
  type EquipmentLine,
} from './equipmentInsights';

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
    /\bems\b|rescue|ambulance/.test(type);
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

const Fig: React.FC<Figure> = ({ label, value, unit, period, icon: Icon, testId }) => (
  <div className="aib-figure" data-testid={testId} data-label-tone={dataLabelTone(inferDataLabelKind(label))}>
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
  const items = Array.from(new Set(fields)).map((f) => summarizeEvidence(agency, f));
  const labels: Partial<Record<AgencyFactEvidenceKey, string>> = {
    defibrillatorBiomedicalFleet: 'Monitor / defibrillator', verifiedHardware: 'Clinical hardware',
    epcrSystem: 'ePCR / CAD record', communicationsSystems: 'Dispatch communications',
    billingSoftware: 'Billing software', maintenanceContracts: 'Warranty / service',
  };
  return (
    <details className="aib-sources" data-testid="equipment-source-basis">
      <summary>Source basis &amp; review state</summary>
      <ul>
        {items.map((e) => (
          <li key={e.field} data-state={e.state}>
            <p className="aib-eq-label">{labels[e.field] || 'Equipment record'}</p>
            <p className="aib-src-state">{e.stateLabel}</p>
            {e.state !== 'none' && (
              <p className="aib-src-meta">
                {e.sourceUrl
                  ? <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">{e.sourceName}</a>
                  : e.sourceName}
                {[e.period && `Period ${e.period}`, e.scope && `Scope ${e.scope}`, e.reviewedAt && `Marker ${e.reviewedAt.slice(0, 10)}`]
                  .filter(Boolean).map((t) => <span key={String(t)}> · {t}</span>)}
              </p>
            )}
            {e.note && <p className="aib-src-meta">{e.note}</p>}
          </li>
        ))}
      </ul>
      <p className="aib-src-meta">A source or review marker shows where a value came from; it does not prove the equipment is in current use.</p>
    </details>
  );
};

const EquipmentSummary: React.FC<{ agency: Agency; renderFactTag: AgencyIntelligenceBriefProps['renderFactTag'] }> = ({ agency, renderFactTag }) => {
  const lines = buildEquipmentLines(agency);
  const f = agency.installedFleet ?? ({} as Agency['installedFleet']);
  const warranty = (f.defibWarrantyStatus || '').trim() || NOT_REPORTED;
  const warrantyAlert = hasAgencyFactEvidence(agency, 'maintenanceContracts') && warranty.includes('Expired');
  const hardware = lines.filter((l) => l.category !== 'software');
  const software = lines.filter((l) => l.category === 'software');
  const line = (l: EquipmentLine) => {
    const Icon = categoryIcon[l.category];
    const missing = l.value === NOT_REPORTED;
    return (
      <li key={l.key} className="aib-eq" data-testid={`equipment-line-${l.key}`}>
        <Icon className="aib-icon" aria-hidden="true" />
        <div className="min-w-0">
          <p className="aib-eq-label">{l.label}</p>
          <p className={`aib-eq-value${missing ? ' is-missing' : ''}`}>{l.value}</p>
        </div>
        {l.quantity && <p className={`aib-eq-qty${l.quantity === NOT_REPORTED ? ' is-missing' : ''}`}>{l.quantity === NOT_REPORTED ? 'Qty not reported' : l.quantity}</p>}
      </li>
    );
  };
  return (
    <section className="aib-block aib-tech" data-testid="profile-equipment-summary" aria-labelledby="aib-tech-title">
      <h3 id="aib-tech-title" className="aib-label"><Cpu className="aib-icon" aria-hidden="true" />Technology &amp; equipment in use</h3>
      <p className="aib-scope">Reported installed equipment as recorded in this profile. Not a record of historical purchases, planned replacements or confirmed current deployment.</p>
      <div className="aib-tags">
        {renderFactTag('defibrillatorBiomedicalFleet')}
        {renderFactTag('verifiedHardware')}
        {renderFactTag('epcrSystem')}
        {renderFactTag('maintenanceContracts')}
      </div>
      <dl className="aib-keyfacts">
        <div><dt><CalendarClock className="aib-icon" aria-hidden="true" />Monitor fleet age</dt><dd className={isNum(f.defibAgeYears) ? '' : 'is-missing'}>{isNum(f.defibAgeYears) ? `${f.defibAgeYears.toLocaleString()} years` : NOT_REPORTED}</dd></div>
        <div><dt><ShieldCheck className="aib-icon" aria-hidden="true" />Warranty / support</dt><dd className={warrantyAlert ? 'is-alert' : warranty === NOT_REPORTED ? 'is-missing' : ''}>{warranty}</dd></div>
      </dl>
      <p className="aib-sub">Clinical hardware</p>
      <ul className="aib-eqlist">{hardware.map(line)}</ul>
      <p className="aib-sub">Software</p>
      <ul className="aib-eqlist">{software.map(line)}</ul>
      <SourceBasis agency={agency} fields={lines.flatMap((l) => l.evidenceKeys).concat('maintenanceContracts')} />
    </section>
  );
};

const BuybackInsights: React.FC<{ agency: Agency }> = ({ agency }) => {
  const offers = getDocumentedOffers(agency);
  return (
    <section className="aib-block aib-buyback" data-testid="profile-buyback-insights" aria-labelledby="aib-buyback-title">
      <h3 id="aib-buyback-title" className="aib-label"><Repeat className="aib-icon" aria-hidden="true" />Buy-back &amp; trade-in</h3>
      <p className="aib-sub">Agency-specific offer records</p>
      {offers.length === 0 ? (
        <p className="aib-noquote" data-testid="text-no-current-quote">No current quote recorded</p>
      ) : (
        <ul className="aib-offers">
          {offers.map((o) => {
            const total = offerTotal(o);
            return (
              <li key={o.id} className="aib-offer" data-testid={`offer-${o.id}`}>
                <p className="aib-eq-label">{offerKindLabel(o.kind)} · {o.provider}</p>
                <dl className="aib-rows">
                  <Row label="Eligible device" kind="equipment">{o.eligibleDevice || NOT_REPORTED}</Row>
                  <Row label="Offer date" kind="period">{o.offerDate || NOT_REPORTED}</Row>
                  <Row label="Expires" kind="expiration">{o.expiryDate || 'Not stated'}</Row>
                  <Row label="Per-unit value" kind="funding">{offerValue(o.perUnitValue, o.currency)}</Row>
                  <Row label="Eligible quantity" kind="equipment">{fmt(o.eligibleQuantity)}</Row>
                  <Row label="Quoted total" kind="funding" tone={total == null ? 'muted' : undefined}>{total == null ? 'Not calculated: device, currency, unit value and eligible quantity required' : offerValue(total, o.currency)}</Row>
                  <Row label="Conditions" kind="notes">{o.conditions || 'Not stated; confirm with offer provider'}</Row>
                  <Row label="Source" kind="source">{o.sourceUrl ? <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer">{o.sourceName || 'Offer document'}</a> : o.sourceName || 'Source not stated'}</Row>
                </dl>
                <p className="aib-scope">Recorded quote, not a guarantee of current eligibility. Confirm dates and terms with the provider before use.</p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="aib-scope">Confirm the recorded model and units with the equipment lead, then request separate cash and replacement-credit quotes. Inventory alone does not establish eligibility.</p>
      <details className="aib-sources">
        <summary><ClipboardCheck className="aib-icon" aria-hidden="true" /> Prepare for a quote · 8 checks</summary>
        <ul className="aib-check">{TRADE_IN_CHECKLIST.map((c) => <li key={c}>{c}</li>)}</ul>
      </details>
      <details className="aib-sources">
        <summary>General knowledge: cash vs credit</summary>
        <ul className="aib-explain">
          <li><strong>Cash buy-back</strong> is a payment for retired units, often from a reseller or refurbisher. It usually does not depend on buying new equipment.</li>
          <li><strong>Vendor replacement credit</strong> reduces the price of a new purchase from that vendor. It has no value without the purchase and should not also be counted as savings.</li>
          <li><strong>Illustrative scenarios</strong> in Purchasing use planning assumptions only. They are not current, guaranteed or agency-confirmed offers.</li>
        </ul>
      </details>
    </section>
  );
};

export interface AgencyIntelligenceBriefProps {
  agency: Agency;
  /** Renders the existing per-field source status tag. */
  renderFactTag: (field: AgencyFactEvidenceKey) => React.ReactNode;
  onOpenSources?: () => void;
}

export const AgencyIntelligenceBrief: React.FC<AgencyIntelligenceBriefProps> = ({ agency, renderFactTag, onOpenSources }) => {
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
      aria-labelledby="agency-operational-baseline-title"
    >
      <header className="aib-top">
        <div className="min-w-0">
          <h2 id="agency-operational-baseline-title" className="aib-title">Agency intelligence</h2>
          <p className="aib-note">{modeLabel} · Reported values; confirm current use with the agency.</p>
        </div>
        {onOpenSources && (
          <button type="button" className="aib-link" onClick={onOpenSources} data-testid="button-brief-open-sources">
            <ShieldCheck className="aib-icon" aria-hidden="true" />
            Sources
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="aib-equipment-row">
        <EquipmentSummary agency={agency} renderFactTag={renderFactTag} />
        <BuybackInsights agency={agency} />
      </div>

      <div className="aib-grid">
        <section className="aib-block aib-snapshot" data-testid="baseline-operational-metrics" aria-labelledby="aib-snapshot-title">
          <h3 id="aib-snapshot-title" className="aib-label"><DataLabel kind="calls">Operational volume &amp; acuity</DataLabel></h3>
          <div className="aib-tags">
            {renderFactTag('stationCount')}
            {renderFactTag('frontlineApparatusStations')}
            {renderFactTag('annualCallsReceived')}
            {renderFactTag('annualEmergencyVolume')}
            {renderFactTag('clinicalOutcomes')}
          </div>
          <dl className="aib-figures">
            {figures.map((f) => <Fig key={f.id} {...f} />)}
            {contextFigures.map((f) => <Fig key={f.id} {...f} />)}
          </dl>
        </section>

        <section className="aib-block aib-findings-block" aria-labelledby="aib-findings-title">
          <h3 id="aib-findings-title" className="aib-label"><DataLabel kind="notes">Findings to discuss</DataLabel></h3>
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
            <p className="aib-empty">No contract, grant or budget-cycle records are present yet. Add or confirm them in source records.</p>
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
      </div>
    </section>
  );
};

export default AgencyIntelligenceBrief;
