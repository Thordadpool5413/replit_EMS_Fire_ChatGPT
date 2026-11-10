/**
 * Agency operational baseline, presented as an intelligence brief:
 * snapshot figures -> findings (finding / basis / next step) -> equipment and contract facts.
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
  HeartPulse,
  Landmark,
  Map as MapIcon,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { Agency, AgencyFactEvidenceKey } from '../../types';
import { hasAgencyFactEvidence } from '../../data/agencyFactEvidence';
import { DataLabel, type DataLabelKind } from '../DataLabel';

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
  <div className="aib-figure" data-testid={testId}>
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
  const fleet = agency.installedFleet;
  if (fleet && isNum(fleet.defibAgeYears)) {
    out.push({
      key: 'defib',
      icon: HeartPulse,
      finding: `Monitor/defibrillator fleet recorded at ${fleet.defibAgeYears.toLocaleString()} years${fleet.defibBrand && fleet.defibBrand !== 'Not reported' ? ` (${fleet.defibBrand})` : ''}.`,
      basis: `Installed fleet record · ${isNum(fleet.defibUnitsCount) ? `${fleet.defibUnitsCount.toLocaleString()} units` : 'unit count not reported'} · warranty ${fleet.defibWarrantyStatus || 'not reported'}`,
      next: 'Confirm age, unit count and replacement timing with the equipment lead.',
    });
  }
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
  const fleet = agency.installedFleet;
  const warrantyExpired = hasAgencyFactEvidence(agency, 'maintenanceContracts') && (fleet.defibWarrantyStatus || '').includes('Expired');
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
          <p className="aib-eyebrow"><Activity className="aib-icon" aria-hidden="true" />Operational baseline · {modeLabel}</p>
          <h2 id="agency-operational-baseline-title" className="aib-title">Operations &amp; agency intelligence</h2>
          <p className="aib-note">Values as recorded in this profile; source, period and scope appear where mapped. Address and license sources do not verify operational metrics.</p>
        </div>
        {onOpenSources && (
          <button type="button" className="aib-link" onClick={onOpenSources} data-testid="button-brief-open-sources">
            <ShieldCheck className="aib-icon" aria-hidden="true" />
            Source records
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </header>

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
            <p className="aib-empty">No fleet age, contract, grant or budget-cycle records are present yet. Add or confirm them in source records.</p>
          )}

          <div className="aib-facts">
            <section aria-labelledby="aib-equipment-title">
              <h3 id="aib-equipment-title" className="aib-label"><Cpu className="aib-icon" aria-hidden="true" />Fleet &amp; hardware</h3>
              <div className="aib-tags">
                {renderFactTag('defibrillatorBiomedicalFleet')}
                {renderFactTag('verifiedHardware')}
                {renderFactTag('epcrSystem')}
                {renderFactTag('maintenanceContracts')}
              </div>
              <dl className="aib-rows">
                <Row label="Monitor brand" kind="monitor">{fleet.defibBrand || 'Not reported'}</Row>
                <Row label="Deployed fleet age" kind="period">{isNum(fleet.defibAgeYears) ? `${fleet.defibAgeYears.toLocaleString()} years` : 'Not reported'}</Row>
                <Row label="Defibrillator units" kind="equipment">{isNum(fleet.defibUnitsCount) ? `${fleet.defibUnitsCount.toLocaleString()} units` : 'Not reported'}</Row>
                <Row label="Warranty support" kind="warranty" tone={warrantyExpired ? 'alert' : undefined}>{fleet.defibWarrantyStatus || 'Not reported'}</Row>
                <Row label="ePCR system" kind="equipment">{fleet.epcrCadSoftware || 'Not reported'}</Row>
              </dl>
            </section>
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
