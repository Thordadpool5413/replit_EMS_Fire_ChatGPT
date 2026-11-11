/**
 * Curated Overview for a single agency profile.
 * Region C: four executive intelligence summaries. Region D: asymmetric workspace
 * (findings + meeting preparation on the left; contact, dates, gaps on the right).
 * Every value comes from the agency record; missing values stay "Not reported".
 */
import React from 'react';
import {
  ArrowRight,
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
  | 'evidence';

const isNum = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const num = (v: number | null | undefined) => (isNum(v) ? v.toLocaleString() : NOT_REPORTED);
const real = (v?: string | null) => Boolean(v && v.trim() && !/^not (reported|selected|calculated|listed)/i.test(v.trim()));

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Classifies a recorded date honestly: past dates are history, not deadlines. */
const dateState = (value?: string) => {
  if (!real(value)) return 'unknown' as const;
  const t = Date.parse(value as string);
  if (Number.isNaN(t)) return 'unknown' as const;
  return new Date(t).toISOString().slice(0, 10) < todayIso() ? 'past' as const : 'upcoming' as const;
};

interface SummaryProps {
  tone: 'blue' | 'teal' | 'red' | 'navy';
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  eyebrow: string;
  value: string;
  missing?: boolean;
  detail: string;
  action: string;
  onAction: () => void;
  testId: string;
}

const Summary: React.FC<SummaryProps> = ({ tone, icon: Icon, eyebrow, value, missing, detail, action, onAction, testId }) => (
  <article className="acp-summary" data-tone={tone} data-testid={testId}>
    <p className="acp-eyebrow"><span className="acp-ico"><Icon aria-hidden="true" className="h-3.5 w-3.5" /></span>{eyebrow}</p>
    <p className={`acp-summary-value${missing ? ' is-missing' : ''}`}>{value}</p>
    <p className="acp-summary-detail">{detail}</p>
    <button type="button" className="acp-link" onClick={onAction} data-testid={`${testId}-open`}>
      {action}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  </article>
);

export interface ProfileCommandOverviewProps {
  agency: Agency;
  onNavigate: (section: CommandSection) => void;
  onOpenSources: () => void;
  /** Main column content (findings + meeting preparation). */
  children: React.ReactNode;
}

export const ProfileCommandOverview: React.FC<ProfileCommandOverviewProps> = ({ agency, onNavigate, onOpenSources, children }) => {
  const mode = getAgencyServiceMode(agency);
  const lines = buildEquipmentLines(agency);
  const knownEquipment = lines.filter((l) => l.value !== NOT_REPORTED);
  const monitor = lines.find((l) => l.category === 'monitor');
  const contacts = (agency.keyContacts ?? []).filter((c) => real(c.name));
  const lead = contacts[0];
  const contract = agency.competitorContract;
  const contractState = dateState(contract?.contractEndDate);
  const grants = agency.femaGrantHistory ?? [];
  const latestGrant = [...grants].filter((g) => isNum(g.fiscalYear)).sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
  const notes = [...(agency.fieldNotes ?? [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latestNote = notes[0];

  const purchasingValue = contract?.contractEndDate
    ? `${contractState === 'past' ? 'Ended' : 'Ends'} ${contract.contractEndDate}`
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

  return (
    <div className="acp-overview" data-testid="profile-command-overview">
      <div className="acp-summaries" role="list" aria-label="Executive intelligence snapshot">
        <Summary
          tone="blue" icon={Cpu} eyebrow="Current equipment" testId="summary-equipment"
          value={monitor && monitor.value !== NOT_REPORTED ? monitor.value : knownEquipment[0]?.value ?? NOT_REPORTED}
          missing={knownEquipment.length === 0}
          detail={knownEquipment.length > 0
            ? `${knownEquipment.length} of ${lines.length} categories recorded${isNum(agency.installedFleet?.defibAgeYears) ? ` · monitors ${agency.installedFleet.defibAgeYears} yrs` : ''}`
            : 'No equipment recorded yet'}
          action="View equipment" onAction={() => onNavigate('equipment')}
        />
        <Summary
          tone={contractState === 'upcoming' ? 'red' : 'teal'} icon={Landmark} eyebrow="Purchasing signal" testId="summary-purchasing"
          value={purchasingValue}
          missing={!contract?.contractEndDate && !latestGrant && !agency.budgetCycleEndMonth}
          detail={contract?.contractEndDate
            ? `${contract.vendor || 'Vendor not reported'}${contractState === 'past' ? ' · historical, not a deadline' : ''}`
            : latestGrant ? latestGrant.programName : 'Research procurement timing'}
          action="Review purchasing" onAction={() => onNavigate('purchasing')}
        />
        <Summary
          tone="navy" icon={Users} eyebrow="Key people" testId="summary-people"
          value={lead ? lead.name : 'None recorded'}
          missing={!lead}
          detail={lead ? `${lead.title || lead.role || 'Title not reported'}${contacts.length > 1 ? ` · +${contacts.length - 1} more` : ''}` : 'Identify purchasing authority'}
          action="Decision makers" onAction={() => onNavigate('decision_makers')}
        />
        <Summary
          tone="teal" icon={Radio} eyebrow="Operations" testId="summary-operations"
          value={opsPrimary.value}
          missing={opsPrimary.value === NOT_REPORTED}
          detail={`${opsPrimary.label} · ${num(agency.stationsCount)} stations${mode !== 'fire' ? ` · ${num(agency.totalAmbulances)} ambulances` : ` · ${num(agency.totalFireEngines)} engines`}`}
          action="Ops & clinical" onAction={() => onNavigate('operations')}
        />
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
