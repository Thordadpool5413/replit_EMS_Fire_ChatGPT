import type { Agency } from '../types';
import type { ProviderProfileRef } from '../navigation/providerProfileUrl';
import { departmentAliases, departmentProfile, profileSourceKey } from './departmentIdentity';
import { registryClaims } from './registryAccountLink';
import { buildProviderCardFacts } from './providerCardIntelligence';
import { sourceRef, type BriefFact, type FactKind } from './departmentBrief';

const kinds = {
  equipment: 'equipment',
  funding: 'funding',
  quality: 'quality',
  operations: 'operations',
  workflow: 'people',
} as const;
export function workspaceFactsFor(ref: ProviderProfileRef, agencies: Agency[]): BriefFact[] {
  const canonical = departmentProfile(ref),
    key = profileSourceKey(canonical);
  const keys = new Set([key, ...departmentAliases(ref.state, key)]);
  const matched = agencies.filter(
    (a) =>
      a.stateCode === ref.state &&
      a.dataProvenanceTier !== 'generated_prospect' &&
      registryClaims(a).keys.some((k) => keys.has(k)),
  );
  if (matched.length !== 1) return [];
  const agency = matched[0],
    claims = registryClaims(agency);
  if (claims.invalid.length || claims.conflicts.length) return [];
  return Object.entries(buildProviderCardFacts(undefined, agency)).flatMap(([group, rows]) =>
    rows.map((row) => ({
      kind: kinds[group as keyof typeof kinds] as FactKind,
      label: row.label,
      value: row.value,
      note: [row.status, row.detail].filter(Boolean).join(' · '),
      source: [row.source.label, row.source.date || row.period].filter(Boolean).join(' · '),
    })),
  );
}

export function savedDepartmentRef(agency: Agency): ProviderProfileRef | undefined {
  if (
    agency.dataProvenanceTier === 'generated_prospect' ||
    (agency.registryIdentity && agency.registryIdentity.stateCode !== agency.stateCode)
  )
    return;
  const claims = registryClaims(agency);
  if (claims.invalid.length || claims.conflicts.length) return;
  const targets = new Map<string, ProviderProfileRef>();
  for (const key of claims.keys) {
    const ref = sourceRef(agency.stateCode, key);
    if (!ref) return;
    const target = departmentProfile(ref);
    targets.set(profileSourceKey(target), target);
  }
  return targets.size === 1 ? targets.values().next().value : undefined;
}
