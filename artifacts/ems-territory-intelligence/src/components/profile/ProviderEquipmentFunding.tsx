import { useRef } from 'react';
import { Activity, HeartPulse, LifeBuoy, Monitor, Package, Wallet } from 'lucide-react';
import type { EquipmentCategory, ProviderEvidence, ProviderEvidenceSource } from '../../data/providerProfileEvidence';
import './ProviderRecord.css';

const equipmentCategories = [
  { key: 'aed', label: 'AEDs', icon: HeartPulse },
  { key: 'monitor', label: 'Monitor / defibrillator', icon: Monitor },
  { key: 'cpr', label: 'Mechanical CPR', icon: Activity },
  { key: 'ventilator', label: 'Transport ventilator', icon: LifeBuoy },
  { key: 'supplies', label: 'Accessories & supplies', icon: Package },
] satisfies { key: EquipmentCategory; label: string; icon: typeof HeartPulse }[];

export function ProviderSourceLink({ source }: { source: ProviderEvidenceSource }) {
  return <a className="pr-source-link" href={source.url} target="_blank" rel="noreferrer">
    {source.label} <span>· {source.date}</span>
  </a>;
}

export const providerCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export function ProviderEquipmentFunding({ evidence }: { evidence?: ProviderEvidence }) {
  const funding = useRef<HTMLLIElement>(null);
  return (
    <section className="pr-panel pr-equipment">
      <div className="pr-equipment-heading">
        <h2>Equipment &amp; funding</h2>
        {Boolean(evidence?.funding?.length) && <button type="button" className="pr-source-link" onClick={() => {
          funding.current?.scrollIntoView({ block: 'start' });
          funding.current?.focus({ preventScroll: true });
        }}>Jump to funding</button>}
      </div>
      <ul className="pr-equipment-list">
        {equipmentCategories.map(({ key, label, icon: Icon }) => {
          const records = evidence?.equipment?.filter((entry) => entry.category === key) ?? [];
          return (
            <li className="pr-equipment-category" key={key}>
              <span className="pr-category-icon"><Icon size={22} aria-hidden="true" /></span>
              <div className="pr-equipment-content">
                <h3>{label}</h3>
                {!records.length && <p className="pr-muted">No equipment evidence on file</p>}
                {records.map((entry) => (
                  <article key={[entry.status, entry.source.url, entry.details].join(':')} className="pr-evidence-record">
                    <span className="pr-record-status">{entry.status}</span>
                    {(entry.manufacturer || entry.model || entry.quantity !== undefined) && <p className="pr-record-value">
                      {[entry.manufacturer, entry.model, entry.quantity === undefined ? undefined : entry.quantity.toLocaleString('en-US') + ' units'].filter(Boolean).join(' · ')}
                    </p>}
                    {entry.deployment && <p className="pr-muted">{entry.deployment}</p>}
                    <p>{entry.details}</p>
                    <EvidenceFields values={[
                      ['Owner', entry.owner], ['Maintained by', entry.maintainedBy], ['Acquired', entry.acquiredOn],
                      ['Warranty ends', entry.warrantyEnds], ['Service ends', entry.serviceEnds],
                      ['Pads expire', entry.padsExpireOn], ['Batteries expire', entry.batteriesExpireOn],
                    ]} />
                    <ProviderSourceLink source={entry.source} />
                  </article>
                ))}
              </div>
            </li>
          );
        })}
        <li className="pr-equipment-category" ref={funding} tabIndex={-1}>
          <span className="pr-category-icon"><Wallet size={22} aria-hidden="true" /></span>
          <div className="pr-equipment-content">
            <h3>Purchasing &amp; funding</h3>
            {!evidence?.funding?.length && <p className="pr-muted">No equipment funding record on file</p>}
            {evidence?.funding?.map((entry) => (
              <article key={entry.title + entry.source.url} className="pr-evidence-record">
                <span className="pr-record-status">{entry.status}</span>
                <p className="pr-record-value">{entry.title}{entry.amount === undefined ? '' : ' · ' + providerCurrency.format(entry.amount)}</p>
                <p>{entry.basis}</p>
                <EvidenceFields values={[
                  ['Fiscal year', entry.fiscalYear], ['Local match', entry.localMatch === undefined ? undefined : providerCurrency.format(entry.localMatch)],
                  ['Spend by', entry.spendBy], ['Purchasing vehicle', entry.purchasingVehicle],
                ]} />
                <ProviderSourceLink source={entry.source} />
              </article>
            ))}
          </div>
        </li>
      </ul>
    </section>
  );
}

function EvidenceFields({ values }: { values: [string, string | number | undefined][] }) {
  const shown = values.filter(([, value]) => value !== undefined);
  return shown.length > 0 && (
    <dl className="pr-evidence-fields">
      {shown.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}
