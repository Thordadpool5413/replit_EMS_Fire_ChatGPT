/**
 * Curated Overview for a single agency profile.
 * Region C: equipment ledger (all six categories) beside operating scale, purchasing and people. Region D: asymmetric workspace
 * (concise attention summary on the left; contact, dates, gaps on the right).
 * Every value comes from the agency record; missing values stay "Not reported".
 */
import React from 'react';
import {
  Activity,
  ArrowRight,
  ChevronRight,
  FileText,
  Gauge,
  HeartPulse,
  Receipt,
  Wind,
  CalendarClock,
  Cpu,
  Landmark,
  Phone,
  Mail,
  Radio,
  SearchCheck,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { Agency } from '../../types';
import { AGENCY_FACT_EVIDENCE_FIELDS, hasMappedAgencyFactEvidence } from '../../data/agencyFactEvidence';
import { NOT_REPORTED, buildEquipmentLines } from './equipmentInsights';
import { getAgencyServiceMode } from './AgencyIntelligenceBrief';

export type CommandSection =
  | 'overview'
  | 'equipment'
  | 'purchasing'
  | 'decision_makers'
  | 'operations'
  | 'medicare'
  | 'meeting'
  | 'deal_story'
  | 'evidence';

const isNum = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const num = (v: number | null | undefined) => (isNum(v) ? v.toLocaleString() : NOT_REPORTED);
const real = (v?: string | null) => Boolean(v && v.trim() && !/^not (reported|selected|calculated|listed)/i.test(v.trim()));

const todayIso = () => new Date().toISOString().slice(0, 10);
const displayDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(date);
};

/** Classifies a recorded date honestly: past dates are history, not deadlines. */
const dateState = (value?: string) => {
  if (!real(value)) return 'unknown' as const;
  const t = Date.parse(value as string);
  if (Number.isNaN(t)) return 'unknown' as const;
  return new Date(t).toISOString().slice(0, 10) < todayIso() ? 'past' as const : 'upcoming' as const;
};

type IconT = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
const LINE_ICON: Record<string, IconT> = {
  monitor: HeartPulse, cpr: Activity, vent: Wind, epcrcad: FileText, dispatch: Radio, billing: Receipt,
};

interface ContextRowProps {
  tone: 'buy' | 'people' | 'risk';
  icon: IconT;
  label: string;
  value: string;
  missing?: boolean;
  detail: string;
  action: string;
  onAction: () => void;
  testId: string;
}

const ContextRow: React.FC<ContextRowProps> = ({ tone, icon: Icon, label, value, missing, detail, action, onAction, testId }) => (
  <div className="acp-ctx" data-tone={tone} data-testid={testId}>
    <Icon aria-hidden="true" className="acp-ctx-ico" />
    <div className="acp-ctx-body">
      <p className="acp-ctx-label">{label}</p>
      <p className={`acp-ctx-value${missing ? ' is-missing' : ''}`}>{value}</p>
      <p className="acp-ctx-detail">{detail}</p>
    </div>
    <button type="button" className="acp-ctx-open" onClick={onAction} data-testid={`${testId}-open`} aria-label={action}>
      <span>{action}</span><ChevronRight aria-hidden="true" className="h-4 w-4" />
    </button>
  </div>
);

export interface ProfileCommandOverviewProps {
  agency: Agency;
  onNavigate: (section: CommandSection) => void;
  onOpenSources: () => void;
  /** Concise agency focus summary; detailed preparation lives in its own topic. */
  children: React.ReactNode;
}

export const ProfileCommandOverview: React.FC<ProfileCommandOverviewProps> = ({ agency, onNavigate, onOpenSources, children }) => {
  const mode = getAgencyServiceMode(agency);
  const lines = buildEquipmentLines(agency);
  const knownEquipment = lines.filter((l) => l.value !== NOT_REPORTED);
  const monitorLine = lines.find((line) => line.key === 'monitor')!;
  const clinicalLines = lines.filter((line) => line.key !== 'monitor' && line.category !== 'software');
  const softwareLines = lines.filter((line) => line.category === 'software');
  const contacts = (agency.keyContacts ?? []).filter((c) => real(c.name));
  const lead = contacts[0];
  const contract = agency.competitorContract;
  const contractState = dateState(contract?.contractEndDate);
  const grants = agency.femaGrantHistory ?? [];
  const latestGrant = [...grants].filter((g) => isNum(g.fiscalYear)).sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
  const notes = [...(agency.fieldNotes ?? [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latestNote = notes[0];

  const purchasingValue = contract?.contractEndDate
    ? displayDate(contract.contractEndDate)
    : latestGrant
      ? `FY${latestGrant.fiscalYear} grant`
      : agency.budgetCycleEndMonth
        ? `Budget ends ${agency.budgetCycleEndMonth}`
        : 'No signal recorded';

  const opsPrimary = mode === 'fire'
    ? { value: num(agency.annualCallVolume), label: 'reported fire-rescue calls / yr' }
    : { value: num(agency.annualCallVolume ?? agency.annual911Transports), label: isNum(agency.annualCallVolume) ? 'reported calls / yr' : 'reported transports / yr' };

  const dates: Array<{ label: string; value: string; state: 'past' | 'upcoming' | 'unknown' }> = [];
  if (contract?.contractEndDate) dates.push({ label: `${contract.vendor || 'Service'} contract end`, value: contract.contractEndDate, state: contractState });
  if (agency.budgetCycleEndMonth) dates.push({ label: 'Budget cycle end', value: agency.budgetCycleEndMonth, state: 'unknown' });
  if (agency.stateLicenseExpiration) dates.push({ label: 'State license expires', value: agency.stateLicenseExpiration, state: dateState(agency.stateLicenseExpiration) });
  if (latestNote?.dueDate) dates.push({ label: 'Field note follow-up', value: latestNote.dueDate, state: dateState(latestNote.dueDate) });

  const gaps: Array<{ label: string; section: CommandSection }> = [];
  if (!real(agency.installedFleet?.defibBrand)) gaps.push({ label: 'Monitor / defibrillator model', section: 'equipment' });
  if (!isNum(agency.installedFleet?.defibAgeYears)) gaps.push({ label: 'Monitor fleet age', section: 'equipment' });
  if (contacts.length === 0) gaps.push({ label: 'Decision makers', section: 'decision_makers' });
  if (!contract?.contractEndDate) gaps.push({ label: 'Service contract dates', section: 'purchasing' });
  if (!isNum(agency.annualCallVolume)) gaps.push({ label: 'Annual call volume', section: 'operations' });

  const evidenceCount = AGENCY_FACT_EVIDENCE_FIELDS.filter(({ key }) => hasMappedAgencyFactEvidence(agency, key)).length;
  const renderEquipmentLine = (line: typeof lines[number]) => {
    const Icon = LINE_ICON[line.key] ?? Cpu;
    const missing = line.value === NOT_REPORTED;
    return (
      <li key={line.key} className="acp-ledger-row" data-category={line.category} data-missing={missing || undefined} data-testid={`row-overview-equipment-${line.key}`}>
        <Icon aria-hidden="true" className="acp-ledger-ico" />
        <span className="acp-ledger-label">{line.label}</span>
        <span className={`acp-ledger-value${missing ? ' is-missing' : ''}`}>{line.value}</span>
        <span className={`acp-ledger-qty${!line.quantity || line.quantity === NOT_REPORTED ? ' is-missing' : ''}`}>
          {line.quantity && line.quantity !== NOT_REPORTED ? line.quantity : line.category !== 'software' ? 'Units not reported' : ''}
        </span>
      </li>
    );
  };

  return (
    <div className="acp-overview" data-testid="profile-command-overview">
      <div className="acp-hero">
        <section className="acp-ledger" data-testid="summary-equipment" aria-labelledby="acp-ledger-title">
          <header className="acp-ledger-head">
            <div>
              <p className="acp-ledger-overline">Agency inventory · as recorded</p>
              <h2 id="acp-ledger-title" className="acp-ledger-title"><Cpu aria-hidden="true" className="h-[18px] w-[18px]" />Equipment record</h2>
              <p className="acp-ledger-meta">
                <span className="acp-num-inline">{knownEquipment.length}</span> of {lines.length} categories recorded
              </p>
            </div>
            <button type="button" className="acp-link" onClick={() => onNavigate('equipment')} data-testid="summary-equipment-open" aria-label="View equipment">
              Details<ArrowRight aria-hidden="true" className="h-3 w-3" />
            </button>
          </header>
          {knownEquipment.length === 0 && <p className="acp-ledger-empty">No equipment recorded yet. Confirm the devices and software currently used by the agency.</p>}
          <div className="acp-monitor-feature" data-category="monitor" data-testid="row-overview-equipment-monitor">
            <div className="acp-monitor-art" aria-hidden="true">
              <svg viewBox="0 0 180 150" role="presentation" focusable="false">
                <path className="monitor-cable" d="M129 111c13 8 21 6 28-2" />
                <path className="monitor-base" d="M66 121h49l9 9H57z" />
                <path className="monitor-stand" d="M86 106h11v15H86z" />
                <rect className="monitor-shell" x="26" y="20" width="112" height="88" rx="10" />
                <rect className="monitor-screen" x="36" y="30" width="92" height="62" rx="4" />
                <path className="monitor-trace monitor-trace-one" d="M43 61h14l5-11 8 23 8-17 5 5h12l5-9 8 19 7-10h10" />
                <path className="monitor-trace monitor-trace-two" d="M44 77h17m6 0h13m6 0h13m7 0h19" />
                <circle className="monitor-control" cx="119" cy="101" r="2.5" />
                <path className="monitor-foot" d="M72 136h40" />
              </svg>
            </div>
            <div className="acp-monitor-copy">
              <p className="acp-monitor-kicker"><HeartPulse aria-hidden="true" />Clinical device · monitor</p>
              <p className="acp-monitor-label">{monitorLine.label}</p>
              <p className={`acp-monitor-model${monitorLine.value === NOT_REPORTED ? ' is-missing' : ''}`} data-testid="text-overview-monitor-model">{monitorLine.value}</p>
              <div className="acp-monitor-facts">
                <div>
                  <span>Recorded unit count</span>
                  <strong className={!monitorLine.quantity || monitorLine.quantity === NOT_REPORTED ? 'is-missing' : ''} data-testid="text-overview-monitor-quantity">
                    {monitorLine.quantity && monitorLine.quantity !== NOT_REPORTED ? monitorLine.quantity : 'Units not reported'}
                  </strong>
                </div>
                <div>
                  <span>Monitor age on record</span>
                  <strong className={isNum(agency.installedFleet?.defibAgeYears) ? '' : 'is-missing'} data-testid="text-overview-monitor-age">
                    {isNum(agency.installedFleet?.defibAgeYears) ? `${agency.installedFleet.defibAgeYears} yrs` : NOT_REPORTED}
                  </strong>
                </div>
              </div>
            </div>
          </div>
          <div className="acp-ledger-catalog">
            <section className="acp-equipment-group" aria-label="Other clinical devices">
              <h3><Activity aria-hidden="true" />Other clinical devices</h3>
              <ul className="acp-ledger-list">{clinicalLines.map(renderEquipmentLine)}</ul>
            </section>
            <section className="acp-equipment-group acp-equipment-group--software" aria-label="Agency software">
              <h3><Cpu aria-hidden="true" />Agency software</h3>
              <ul className="acp-ledger-list">{softwareLines.map(renderEquipmentLine)}</ul>
            </section>
          </div>
          <p className="acp-ledger-foot">Inventory as recorded. Age and quantity describe the record, not condition, intent or buy-back eligibility.</p>
        </section>

        <div className="acp-context">
          <section className="acp-scale" data-testid="summary-operations" aria-label="Operating scale">
            <div className="acp-scale-head">
              <p className="acp-ctx-label"><Gauge aria-hidden="true" className="h-4 w-4" />Operating scale</p>
              <button type="button" className="acp-link" onClick={() => onNavigate('operations')} data-testid="summary-operations-open">
                Ops & clinical<ArrowRight aria-hidden="true" className="h-3 w-3" />
              </button>
            </div>
            <dl className="acp-scale-grid">
              <div><dt>{opsPrimary.label}</dt><dd className={opsPrimary.value === NOT_REPORTED ? 'is-missing' : ''}>{opsPrimary.value}</dd></div>
              <div><dt>stations</dt><dd className={isNum(agency.stationsCount) ? '' : 'is-missing'}>{num(agency.stationsCount)}</dd></div>
              {mode !== 'fire'
                ? <div><dt>ambulances</dt><dd className={isNum(agency.totalAmbulances) ? '' : 'is-missing'}>{num(agency.totalAmbulances)}</dd></div>
                : <div><dt>engines</dt><dd className={isNum(agency.totalFireEngines) ? '' : 'is-missing'}>{num(agency.totalFireEngines)}</dd></div>}
            </dl>
          </section>
          <ContextRow
            tone={contractState === 'upcoming' ? 'risk' : 'buy'} icon={Landmark}
            label={contract?.contractEndDate ? 'Contract timing' : 'Purchasing context'} testId="summary-purchasing"
            value={purchasingValue}
            missing={!contract?.contractEndDate && !latestGrant && !agency.budgetCycleEndMonth}
            detail={contract?.contractEndDate
              ? `${contract.vendor || 'Vendor not reported'} · ${contractState === 'past' ? 'historical, not a deadline' : 'recorded contract end'}`
              : latestGrant ? latestGrant.programName : 'Research procurement timing'}
            action="Purchasing" onAction={() => onNavigate('purchasing')}
          />
          <ContextRow
            tone="people" icon={Users} label="Key people" testId="summary-people"
            value={lead ? `${contacts.length} recorded` : 'None recorded'}
            missing={!lead}
            detail={lead ? 'Names, roles and contact details below' : 'Identify purchasing authority'}
            action="People" onAction={() => onNavigate('decision_makers')}
          />
        </div>
      </div>

      <div className="acp-workspace">
        <div className="acp-main">{children}</div>
        <aside className="acp-aside" aria-label="Account context">
          <section className="acp-panel" data-testid="panel-overview-contact">
            <h3 className="acp-panel-title"><Users aria-hidden="true" className="h-4 w-4" />Most relevant contact</h3>
            {lead ? (
              <>
                <p className="acp-strong">{lead.name}</p>
                <p className="acp-meta">{[lead.title, lead.role].filter(real).join(' · ') || 'Title not reported'}</p>
                <div className="acp-inline-actions">
                  {lead.phone && <a href={`tel:${lead.phone}`} data-testid="link-overview-contact-phone"><Phone aria-hidden="true" className="h-3.5 w-3.5" />{lead.phone}</a>}
                  {lead.email && <a href={`mailto:${lead.email}`} data-testid="link-overview-contact-email"><Mail aria-hidden="true" className="h-3.5 w-3.5" />Email</a>}
                </div>
                <p className="acp-meta">Source: {lead.verificationSource || 'Source not listed'}</p>
              </>
            ) : (
              <p className="acp-meta">No contact recorded. {agency.headquartersPhone ? <a href={`tel:${agency.headquartersPhone}`}>Call main line {agency.headquartersPhone}</a> : 'Research the chief and purchasing authority.'}</p>
            )}
          </section>

          <section className="acp-panel" data-testid="panel-overview-dates">
            <h3 className="acp-panel-title"><CalendarClock aria-hidden="true" className="h-4 w-4" />Important dates</h3>
            {dates.length ? (
              <ul className="acp-dates">
                {dates.map((d) => (
                  <li key={d.label} data-state={d.state}>
                    <span>{d.label}</span>
                    <span className="acp-date">{d.value}{d.state === 'past' ? ' · past' : ''}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="acp-meta">No contract, budget or license dates recorded.</p>}
          </section>

          <section className="acp-panel" data-testid="panel-overview-gaps">
            <h3 className="acp-panel-title"><SearchCheck aria-hidden="true" className="h-4 w-4" />Research gaps</h3>
            {gaps.length ? (
              <ul className="acp-gaps">
                {gaps.map((g) => (
                  <li key={g.label}>
                    <button type="button" onClick={() => onNavigate(g.section)} data-testid={`button-gap-${g.section}-${g.label.replace(/\W+/g, '-').toLowerCase()}`}>
                      {g.label}<ArrowRight aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="acp-meta">Core fields are recorded. Confirm them with the agency.</p>}
          </section>

          <section className="acp-panel" data-testid="panel-overview-verification">
            <h3 className="acp-panel-title"><ShieldCheck aria-hidden="true" className="h-4 w-4" />Verification context</h3>
            <p className="acp-meta"><strong className="acp-num">{evidenceCount}</strong> of {AGENCY_FACT_EVIDENCE_FIELDS.length} fact groups have a mapped source. A source is not a confirmation.</p>
            <button type="button" className="acp-link" onClick={onOpenSources} data-testid="button-overview-review-evidence">
              Review evidence<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default ProfileCommandOverview;
