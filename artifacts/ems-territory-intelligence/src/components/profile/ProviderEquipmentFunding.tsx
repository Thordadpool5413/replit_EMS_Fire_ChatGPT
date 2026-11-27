import { useRef, type ReactNode } from 'react';
import { Activity, ArrowDown, ArrowUpRight, BadgeCheck, BriefcaseMedical, CalendarClock, CircleDollarSign, ClipboardList, Clock3, HeartPulse, Monitor, Package, Receipt, ShieldCheck, Wind } from 'lucide-react';
import type { EquipmentCategory, EquipmentStatus, ProviderEquipmentEvidence, ProviderEvidence, ProviderEvidenceSource, ProviderFundingEvidence } from '../../data/providerProfileEvidence';
import './ProviderRecord.css';

const equipmentCategories = [
  { key: 'aed', label: 'AEDs', icon: HeartPulse },
  { key: 'monitor', label: 'Monitors & defibrillators', icon: Monitor },
  { key: 'cpr', label: 'Mechanical CPR', icon: Activity },
  { key: 'ventilator', label: 'Transport ventilators', icon: Wind },
  { key: 'supplies', label: 'Accessories & supplies', icon: Package },
] satisfies { key: EquipmentCategory; label: string; icon: typeof HeartPulse }[];

const statusStyle = {
  'In service reported': { tone: 'service', icon: BadgeCheck },
  'Documented historically': { tone: 'muted', icon: Clock3 },
  'Proposed purchase': { tone: 'planned', icon: ClipboardList },
  'Service agreement': { tone: 'contract', icon: ShieldCheck },
  Requested: { tone: 'planned', icon: CalendarClock },
  Approved: { tone: 'service', icon: BadgeCheck },
  Awarded: { tone: 'service', icon: CircleDollarSign },
  'Reported expenditure': { tone: 'contract', icon: Receipt },
} satisfies Record<EquipmentStatus | ProviderFundingEvidence['status'], { tone: string; icon: typeof HeartPulse }>;

export function ProviderSourceLink({ source }: { source: ProviderEvidenceSource }) {
  return <a className="pr-source-link" href={source.url} target="_blank" rel="noreferrer">
    {source.label} <span>· {source.date}</span>
  </a>;
}

export const providerCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const timelineCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });

function EvidenceStatus({ status }: { status: keyof typeof statusStyle }) {
  const { tone, icon: Icon } = statusStyle[status];
  return <span className="pr-evidence-status" data-tone={tone}><Icon size={14} aria-hidden="true" />{status}</span>;
}

function EquipmentEvidence({ entry }: { entry: ProviderEquipmentEvidence }) {
  const device = [entry.manufacturer, entry.model].filter(Boolean).join(' ');
  return <article className="pr-equipment-evidence" data-tone={statusStyle[entry.status].tone}>
    <EvidenceStatus status={entry.status} />
    {device && <p className="pr-record-value">{device}</p>}
    {entry.quantity !== undefined && <p className="pr-equipment-count">{entry.quantity.toLocaleString('en-US')} <span>units</span></p>}
    {entry.deployment && <p className="pr-equipment-deployment">{entry.deployment}</p>}
    <p>{entry.details}</p>
    <EvidenceFields values={[
      ['Owner', entry.owner], ['Maintained by', entry.maintainedBy], ['Acquired', entry.acquiredOn],
      ['Warranty ends', entry.warrantyEnds], ['Service ends', entry.serviceEnds],
      ['Pads expire', entry.padsExpireOn], ['Batteries expire', entry.batteriesExpireOn],
    ]} />
    <ProviderSourceLink source={entry.source} />
  </article>;
}

function FundingEntry({ entry }: { entry: ProviderFundingEvidence }) {
  return <li className="pr-timeline-event" data-tone={statusStyle[entry.status].tone}>
    <span className="pr-timeline-marker" aria-hidden="true" />
    <div className="pr-timeline-date">{entry.source.date}</div>
    <EvidenceStatus status={entry.status} />
    <h3>{entry.title}</h3>
    {entry.amount !== undefined && <p className="pr-funding-amount">{timelineCurrency.format(entry.amount)}</p>}
    <p>{entry.basis}</p>
    <EvidenceFields values={[
      ['Fiscal year', entry.fiscalYear], ['Local match', entry.localMatch === undefined ? undefined : providerCurrency.format(entry.localMatch)],
      ['Spend by', entry.spendBy], ['Purchasing vehicle', entry.purchasingVehicle],
    ]} />
    <ProviderSourceLink source={entry.source} />
  </li>;
}

export function ProviderEquipmentFunding({ evidence, children }: { evidence?: ProviderEvidence; children?: ReactNode }) {
  const funding = useRef<HTMLElement>(null);
  const fundedRecords = [...(evidence?.funding ?? [])].sort((a, b) =>
    b.source.date.replace(/^FY/, '').localeCompare(a.source.date.replace(/^FY/, '')));
  const categories = equipmentCategories.map(category => ({
    ...category, records: evidence?.equipment?.filter(entry => entry.category === category.key) ?? [],
  }));
  const populated = categories.filter(category => category.records.length);
  const missing = categories.filter(category => !category.records.length);
  return <div className="pr-equipment">
    <section className="pr-equipment-column" aria-label="Equipment">
      <div className="pr-equipment-heading">
        <h2>Equipment</h2>
        {fundedRecords.length > 0 && <button type="button" className="pr-source-link" onClick={() => {
          funding.current?.scrollIntoView({ block: 'start' });
          funding.current?.focus({ preventScroll: true });
        }}>Jump to funding <ArrowDown size={14} aria-hidden="true" /></button>}
      </div>
      {populated.length > 0 && <div className="pr-device-list">
        {populated.map(({ key, label, icon: Icon, records }) => <section key={key} className="pr-device-card pr-panel">
          <h3><span className="pr-category-icon"><Icon size={27} aria-hidden="true" /></span>{label}</h3>
          <div className="pr-equipment-records">
            {records.map(entry => <EquipmentEvidence key={[entry.status, entry.source.url, entry.details].join(':')} entry={entry} />)}
          </div>
        </section>)}
      </div>}
      {missing.length > 0 && <section className="pr-panel pr-missing-equipment">
        <h3><BriefcaseMedical size={16} aria-hidden="true" /> No equipment evidence on file</h3>
        <ul>{missing.map(({ key, label, icon: Icon }) => <li key={key}><Icon size={16} aria-hidden="true" />{label}</li>)}</ul>
      </section>}
    </section>
    <div className="pr-equipment-rail">
      <section className="pr-panel pr-funding" ref={funding} tabIndex={-1}>
        <h2><CircleDollarSign size={21} aria-hidden="true" /> Funding &amp; purchasing</h2>
        {fundedRecords.length > 0 ? <ol className="pr-timeline">
          {fundedRecords.map(entry => <FundingEntry key={entry.title + entry.source.url} entry={entry} />)}
        </ol> : <p className="pr-muted">No equipment funding record on file</p>}
        {fundedRecords.length > 0 && <a className="pr-source-link pr-funding-sources" href="#sources">View profile sources <ArrowUpRight size={14} aria-hidden="true" /></a>}
      </section>
      {children}
    </div>
  </div>;
}

function EvidenceFields({ values }: { values: [string, string | number | undefined][] }) {
  const shown = values.filter(([, value]) => value !== undefined);
  return shown.length > 0 && (
    <dl className="pr-evidence-fields">
      {shown.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}
