import type { FederalCandidate } from './federalDiscoveryContract';
import { loadFederalDiscovery } from './federalSpendingDiscovery';
import { loadDiscoveryPage, type DiscoveryCandidate } from './publicIntelligenceDiscovery';

const recipientKey = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function matchingProviderGrants<T extends { recipient: string; state: string }>(candidates: T[], state: string, recipients: string[]) {
  const names = new Set(recipients.map(recipientKey).filter(Boolean));
  return candidates.filter(row => row.state === state && names.has(recipientKey(row.recipient)));
}

export async function loadProviderGrantState(state: string, fromYear: number, signal: AbortSignal) {
  const rows = new Map<string, DiscoveryCandidate>();
  let offset: number | null = 0;
  let wasCapped = false;
  let withheld = 0;
  // Each page is bounded by the existing discovery contract.
  while (offset !== null) {
    const page = await loadDiscoveryPage({ state, fromYear, offset }, signal);
    for (const candidate of page.candidates) rows.set(candidate.id, candidate);
    withheld += page.withheld;
    wasCapped ||= page.scopeCapped;
    offset = page.nextOffset;
  }
  return { candidates: [...rows.values()], wasCapped, withheld };
}

export async function loadProviderFederalGrants(state: string, fromYear: number, signal: AbortSignal) {
  const rows = new Map<string, FederalCandidate>();
  let pageNumber: number | null = 1;
  let wasCapped = false;
  let withheld = 0;
  while (pageNumber !== null) {
    const page = await loadFederalDiscovery({ state, fromYear, topic: 'grants', page: pageNumber }, signal);
    for (const candidate of page.candidates) rows.set(candidate.id, candidate);
    withheld += page.withheld + page.warnings;
    wasCapped ||= page.scopeCapped;
    pageNumber = page.nextPage;
  }
  return { candidates: [...rows.values()], wasCapped, withheld };
}
