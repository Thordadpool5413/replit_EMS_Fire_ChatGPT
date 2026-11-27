import { loadChicagoDiscovery } from './chicagoDiscovery';
import { MUNICIPAL_SOURCE, type MunicipalTopic } from './municipalDiscoveryContract';
import { loadMunicipalDiscovery } from './municipalSpendingDiscovery';
import { chicagoResearch, municipalResearch, type ResearchCandidate } from './nationalCompetitiveResearch';

const sources = {
  'FDID:IL:CS931': { kind: 'chicago', label: 'Chicago purchase orders', owners: ['Fire Department', 'Chicago Fire Department'] },
  'FDID:NY:31000': { kind: 'nyc', label: 'NYC City Record', owners: ['Fire Department', 'Fire Department of the City of New York', 'FDNY'] },
} as const;

export function providerProcurementSource(registryKey?: string) {
  return registryKey && Object.hasOwn(sources, registryKey) ? sources[registryKey as keyof typeof sources] : undefined;
}
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function providerPurchases(records: ResearchCandidate[], registryKey: string) {
  const source = providerProcurementSource(registryKey);
  if (!source) return [];
  const nameKeys = new Set(source.owners.map(normalize));
  const matched = new Map<string, ResearchCandidate>();
  const conflicts = new Set<string>();
  for (const row of records) {
    const eligible = source.kind === 'nyc'
      ? row.source === 'municipal' && row.state === 'NY' && row.role === 'notice-issuer'
      : row.source === 'chicago' && row.state === 'IL' && row.role === 'contracting-department';
    if (!eligible || !nameKeys.has(normalize(row.organization))) continue;
    const prior = matched.get(row.key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row)) conflicts.add(row.key);
    matched.set(row.key, row);
  }
  return [...matched.values()].filter(row => !conflicts.has(row.key))
    .sort((a, b) => (b.publishedDay ?? '').localeCompare(a.publishedDay ?? ''));
}

const topics: MunicipalTopic[] = ['cardiac', 'cpr', 'ventilation', 'ambulance', 'software', 'brands'];

export async function loadProviderPurchases(registryKey: string, signal: AbortSignal) {
  const source = providerProcurementSource(registryKey);
  if (!source) return { records: [], incomplete: 0 };
  const results = await Promise.allSettled(topics.map(async topic => {
    const records: ResearchCandidate[] = [];
    let incomplete = false;
    let page: number | null = 1;
    for (let count = 0; page !== null && count < 3; count++) {
      if (source.kind === 'nyc') {
        const data = await loadMunicipalDiscovery({ source: MUNICIPAL_SOURCE, topic, days: 365, page }, signal);
        records.push(...municipalResearch(data).candidates);
        incomplete ||= data.scopeCapped || data.withheld > 0;
        page = data.nextPage;
      } else {
        const data = await loadChicagoDiscovery({ topic, days: 1095, page }, signal);
        records.push(...chicagoResearch(data).candidates);
        incomplete ||= data.scopeCapped || data.withheld > 0;
        page = data.nextPage;
      }
    }
    return { records, incomplete: incomplete || page !== null };
  }));
  signal.throwIfAborted();
  if (results.every(result => result.status === 'rejected')) throw Error('Purchasing source unavailable.');
  return {
    records: providerPurchases(results.flatMap(result => result.status === 'fulfilled' ? result.value.records : []), registryKey),
    incomplete: results.filter(result => result.status === 'rejected' || result.value.incomplete).length,
  };
}
