import type { RegistryIdentity } from './registryAccountLink';
import type { ProviderEvidence, ProviderEvidenceSource } from '../data/providerProfileEvidence';
import { formatProviderMetric, providerCurrency } from './providerCardIntelligence';

export type DiscoveryFact = { topic:string; detail:string; source:ProviderEvidenceSource };
export function discoveryFacts(e?:ProviderEvidence, identity?:RegistryIdentity):DiscoveryFact[] {

  const facts:DiscoveryFact[]=[];
  function add(topic:string, detail:string, source:ProviderEvidenceSource) { facts.push({topic,detail,source}); }
  if (identity) add('Registry',[identity.name,identity.identifier,identity.serviceLevel,identity.address,identity.city,identity.stateCode].filter(Boolean).join(' · '),{label:identity.sourceAuthority || identity.sourceName,date:identity.sourceDate || 'Source date unreported',url:identity.sourceUrl});
  if (!e) return facts;
  for (const r of e.equipment ?? []) add('Equipment', [r.manufacturer,r.model ?? r.category,r.status,r.quantity != null && r.quantity+' units',r.deployment,r.supplier && 'Supplier '+r.supplier,r.lastPurchasedOn && 'Purchased '+r.lastPurchasedOn,r.details].filter(Boolean).join(' · '),r.source);
  for (const r of e.funding ?? []) add('Funding',[r.title,r.status,r.amount!=null && providerCurrency.format(r.amount),r.spendBy && 'Spend by '+r.spendBy,r.basis].filter(Boolean).join(' · '),r.source);
  for (const r of e.contacts ?? []) add('People',[r.name,r.role,r.phone,r.email].filter(Boolean).join(' · '),r.source);
  for (const [topic,metrics] of [['Quality',e.quality],['Operations',e.operations],['Billing',e.billing],['Payer mix',e.payerMix],['Denials',e.billingDenials]] as const)
    for (const r of metrics ?? []) add(topic,[r.label,formatProviderMetric(r),r.reportingPeriod,r.context].filter(Boolean).join(' · '),r.source);
  for (const r of e.accountContext ?? []) add(r.area,r.title+' · '+r.detail,r.source);
  if(e.stationDirectory) for(const r of e.stationDirectory.stations) add('Stations',['Station '+r.number,r.name,r.address,r.apparatus].filter(Boolean).join(' · '),e.stationDirectory.source);
  const date=(f:DiscoveryFact)=>f.source.date.match(/\d{4}(?:-\d{2}){0,2}/)?.[0] ?? '';
  return facts.sort((a,b)=>date(b).localeCompare(date(a)));
}
