import { Receipt } from 'lucide-react';
import type { ProviderEvidence } from '../../data/providerProfileEvidence';
import { ProviderMetrics } from './ProviderMetrics';

export function ProviderPublishedBilling({ evidence }: { evidence?: ProviderEvidence }) {
  if (!evidence?.billing?.length) return null;
  return <section className="pr-panel">
    <h3 className="pr-icon-heading"><Receipt size={18} aria-hidden="true" /> Department-reported transport billing</h3>
    <ProviderMetrics metrics={evidence.billing} />
  </section>;
}
