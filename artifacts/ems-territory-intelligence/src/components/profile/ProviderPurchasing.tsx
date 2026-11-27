import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Receipt } from 'lucide-react';
import { commercialResearchStatus, COMMERCIAL_RESEARCH_LABELS, researchMentions } from '../../services/nationalCompetitiveResearch';
import { loadProviderPurchases, providerProcurementSource } from '../../services/providerProcurement';
import { providerCurrency } from '../../services/providerCardIntelligence';

export function ProviderPurchasing({ registryKey }: { registryKey?: string }) {
  const [showAll, setShowAll] = useState(false);
  const source = providerProcurementSource(registryKey);
  const query = useQuery({
    queryKey: ['provider-purchases', registryKey],
    queryFn: ({ signal }) => loadProviderPurchases(registryKey!, signal),
    enabled: Boolean(source),
    retry: false,
    staleTime: 10 * 60_000,
  });
  if (!source) return null;
  const rows = query.data?.records ?? [];
  return <section className="pr-panel">
    <h2 className="pr-icon-heading"><Receipt size={20} aria-hidden="true" /> Department purchasing records</h2>
    <p className="pr-muted">{source.label} · {source.kind === 'nyc' ? 'past year' : 'past three years'} · equipment and EMS topics.</p>
    {query.isPending && <p role="status">Looking up published purchasing records…</p>}
    {query.isError && <p>Purchasing records unavailable. <button className="pr-source-link" onClick={() => void query.refetch()}>Retry</button></p>}
    {Boolean(query.data?.incomplete) && <p>Some purchasing searches returned partial results.</p>}
    {query.isSuccess && rows.length === 0 && <p>No department buyer or issuer matches in the records checked.</p>}
    <ul className="pr-source-grid">
      {(showAll ? rows : rows.slice(0, 6)).map(row => <li key={row.key} className="pr-source-tile">
        <span className="pr-evidence-status"><CalendarDays size={14} aria-hidden="true" />{row.publishedDay} · {COMMERCIAL_RESEARCH_LABELS[commercialResearchStatus(row)]}</span>
        <h3>{row.title}</h3>
        <p>{row.organization}{row.number && ' · ' + row.number}{row.contractRevision && ' · Revision ' + row.contractRevision}</p>
        {row.vendor && <p>Vendor · {row.vendor}</p>}
        {row.amount !== null && <p>Published amount · {providerCurrency.format(row.amount)}{row.amountNote && ' · ' + row.amountNote}</p>}
        {row.deadlineLocal && <p>Published bid deadline · {row.deadlineLocal.replace('T', ' ')} local time</p>}
        {(row.periodStart || row.periodEnd) && <p>Reported term · {row.periodStart ?? 'Start unlisted'} to {row.periodEnd ?? 'End unlisted'}</p>}
        {researchMentions(row).document.length > 0 && <p>Product text · {researchMentions(row).document.map(hit => hit.term).join(', ')}</p>}
        <a className="pr-source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">Original purchasing record</a>
      </li>)}
    </ul>
    {rows.length > 6 && <button className="pr-source-link" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show latest six' : 'Show all ' + rows.length + ' records'}</button>}
  </section>;
}
