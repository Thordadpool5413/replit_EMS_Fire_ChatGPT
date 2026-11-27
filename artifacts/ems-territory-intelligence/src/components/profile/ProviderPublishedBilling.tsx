import { Receipt } from 'lucide-react';
import type { ProviderEvidence } from '../../data/providerProfileEvidence';
import { ProviderMetrics } from './ProviderMetrics';

export function ProviderPublishedBilling({ evidence }: { evidence?: ProviderEvidence }) {
  const groups = [
    { title: 'Department-reported transport billing', metrics: evidence?.billing },
    { title: 'Department-reported payer mix', metrics: evidence?.payerMix },
    { title: 'Department-reported denials', metrics: evidence?.billingDenials },
  ];
  return <>{groups.map(({ title, metrics }) => metrics?.length ? <section key={title} className="pr-panel">
    <h3 className="pr-icon-heading"><Receipt size={18} aria-hidden="true" /> {title}</h3>
    <ProviderMetrics metrics={metrics} />
  </section> : null)}</>;
}
