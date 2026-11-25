import type { Agency } from '../types';
import { canBulkHydrateAgency } from '../utils/providerRecordTrust';
import {
  canCreateRegistryAccount,
  registryIdentityKey,
  snapshotRegistryIdentity,
  type RegistryIdentity,
} from './registryAccountLink';
import {
  loadSourceDirectoryState,
  type SourceDirectoryRecord,
  type SourceDirectoryManifest,
} from './nationalSourceDirectory';
import {
  enrichRegistryRow,
  loadNationalLocationState,
  listingLocation,
  type LocationState,
} from './nationalLocationSnapshot';

export type RegistryImportSource = 'USFA' | 'NPPES';
export type RegistryImportDisposition = 'eligible' | 'excluded' | 'duplicate' | 'ambiguous' | 'unassigned';
export const MAX_REGISTRY_IMPORT_SELECTION = 500;

export interface RegistryImportCounts {
  total: number;
  eligible: number;
  excluded: number;
  duplicate: number;
  ambiguous: number;
  unassigned: number;
}

export interface RegistryImportCandidate {
  id: string;
  source: RegistryImportSource;
  name: string;
  stateCode: string;
  city: string;
  postalCode: string;
  address: string;
  sourceCounty?: string;
  countyFips?: string;
  countyName?: string;
  countyAssignmentBasis?: string;
  sourceDate?: string;
  sourceUrl: string;
  identifier?: string;
  identity?: RegistryIdentity;
  disposition: RegistryImportDisposition;
  reason: string;
}

export interface RegistryImportStatePreview {
  stateCode: string;
  bySource: Record<RegistryImportSource, RegistryImportCounts>;
  totals: RegistryImportCounts;
  candidates: RegistryImportCandidate[];
  countyTotals: Record<string, { countyName: string; total: number; USFA: number; NPPES: number }>;
  locationSnapshotUnavailable: boolean;
}

export interface RegistryImportNationalPreview {
  byState: RegistryImportStatePreview[];
  bySource: Record<RegistryImportSource, RegistryImportCounts>;
  totals: RegistryImportCounts;
  exactCountyTotals: Record<string, { countyName: string; total: number; USFA: number; NPPES: number }>;
  outsideStatesAndDc: number;
}

export interface RegistrySourceDates {
  USFA?: { sourceDate?: string; retrievedAt?: string };
  NPPES?: { sourceDate?: string; retrievedAt?: string };
}

export interface RegistryImportProgress {
  completedStates: number;
  totalStates: number;
  stateCode: string;
}

export interface RegistryImportResult {
  createdIds: string[];
  alreadyPresent: number;
}

export interface RegistryImportWriteProgress {
  processed: number;
  created: number;
  alreadyPresent: number;
  total: number;
}

export async function importReviewedRegistryProfiles(input: {
  profiles: Agency[];
  createBatch: (profiles: Agency[]) => Promise<string[]>;
  onCreated?: (profiles: Agency[]) => void;
  onProgress?: (progress: RegistryImportWriteProgress) => void;
  batchSize?: number;
}): Promise<RegistryImportResult> {
  const batchSize = input.batchSize ?? 25;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) {
    throw new Error('Registry profile batches must contain between 1 and 25 records.');
  }
  if (input.profiles.length > MAX_REGISTRY_IMPORT_SELECTION) {
    throw new Error(`Select no more than ${MAX_REGISTRY_IMPORT_SELECTION} profiles per import.`);
  }
  if (input.profiles.some((profile) => !canBulkHydrateAgency(profile))) {
    throw new Error('Every selected profile must pass source-identity validation before it can be saved.');
  }
  if (new Set(input.profiles.map((profile) => profile.id)).size !== input.profiles.length) {
    throw new Error('The selected profiles contain duplicate source identities.');
  }

  const createdIds: string[] = [];
  let alreadyPresent = 0;
  for (let offset = 0; offset < input.profiles.length; offset += batchSize) {
    const batch = input.profiles.slice(offset, offset + batchSize);
    const requestedIds = new Set(batch.map((profile) => profile.id));
    const responseIds = await input.createBatch(batch);
    if (responseIds.some((id) => !requestedIds.has(id))) {
      throw new Error('The Replit service returned an unexpected created profile ID.');
    }
    const createdSet = new Set(responseIds);
    const created = batch.filter((profile) => createdSet.has(profile.id));
    createdIds.push(...created.map((profile) => profile.id));
    alreadyPresent += batch.length - created.length;
    if (created.length) input.onCreated?.(created);
    input.onProgress?.({
      processed: Math.min(offset + batch.length, input.profiles.length),
      created: createdIds.length,
      alreadyPresent,
      total: input.profiles.length,
    });
  }
  return { createdIds, alreadyPresent };
}

const EXACT_COUNTY_BASES = new Set([
  'source-county',
  'official-town-crosswalk',
  'census-address-range',
  'nad-address-point',
  'ohio-lbrs-address-point',
  'ny-sam-address-point',
  'regional-address-point',
]);

const emptyCounts = (): RegistryImportCounts => ({
  total: 0,
  eligible: 0,
  excluded: 0,
  duplicate: 0,
  ambiguous: 0,
  unassigned: 0,
});

const emptyBySource = (): Record<RegistryImportSource, RegistryImportCounts> => ({
  USFA: emptyCounts(),
  NPPES: emptyCounts(),
});

const normalized = (value: string | undefined) =>
  (value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();

function nameCityKey(identity: RegistryIdentity): string | undefined {
  const name = normalized(identity.name);
  const city = normalized(identity.city);
  if (!name || !city) return undefined;
  return `${identity.stateCode.toUpperCase()}|${name}|${city}`;
}

function isExactCountyAssignment(
  row: SourceDirectoryRecord,
  countyNames: Readonly<Record<string, string>>,
  locationNeedsReview: boolean,
): boolean {
  const fips = row[6];
  return !locationNeedsReview &&
    /^\d{5}$/.test(fips) &&
    Boolean(countyNames[fips]) &&
    EXACT_COUNTY_BASES.has(row[8]);
}

function candidateFrom(
  row: SourceDirectoryRecord,
  identity: RegistryIdentity | undefined,
  disposition: RegistryImportDisposition,
  reason: string,
): RegistryImportCandidate {
  const hasCounty = Boolean(identity?.countyFips && identity.countyName);
  return {
    id: row[0],
    source: row[1],
    name: row[2],
    stateCode: row[3],
    city: row[4],
    postalCode: row[5],
    address: row[10],
    ...(identity?.sourceCounty ? { sourceCounty: identity.sourceCounty } : {}),
    ...(hasCounty ? { countyFips: identity?.countyFips, countyName: identity?.countyName } : {}),
    ...(identity?.countyAssignmentBasis ? { countyAssignmentBasis: identity.countyAssignmentBasis } : {}),
    ...(identity?.sourceDate ? { sourceDate: identity.sourceDate } : {}),
    sourceUrl: identity?.sourceUrl ?? (row[1] === 'USFA' ? 'https://apps.usfa.fema.gov/registry/search' : row[11]),
    ...(identity?.identifier ? { identifier: identity.identifier } : {}),
    ...(identity ? { identity } : {}),
    disposition,
    reason,
  };
}

function addCount(
  counts: RegistryImportCounts,
  disposition: RegistryImportDisposition,
): void {
  counts.total += 1;
  counts[disposition] += 1;
}

function addCountyCount(
  countyTotals: RegistryImportStatePreview['countyTotals'],
  candidate: RegistryImportCandidate,
): void {
  if (candidate.disposition !== 'eligible' || !candidate.countyFips || !candidate.countyName) return;
  const row = countyTotals[candidate.countyFips] ?? {
    countyName: candidate.countyName,
    total: 0,
    USFA: 0,
    NPPES: 0,
  };
  row.total += 1;
  row[candidate.source] += 1;
  countyTotals[candidate.countyFips] = row;
}

function existingIdentityKeys(agency: Agency): string[] {
  const keys: string[] = [];
  const identityKey = agency.registryIdentity && registryIdentityKey(agency.registryIdentity);
  if (identityKey) keys.push(identityKey);
  for (const association of agency.sourceRecordAssociations ?? []) {
    if (association.decision !== 'confirmed') continue;
    if (/NPPES|NPI/i.test(association.sourceName) && /^\d{10}$/.test(association.sourceRecordId)) {
      keys.push(`NPI:${association.sourceRecordId}`);
    }
    if (/USFA|NFDR/i.test(association.sourceName)) {
      const state = agency.stateCode?.toUpperCase();
      const rawId = String(association.sourceFields?.fdid ?? association.sourceRecordId.replace(/^usfa:/i, ''));
      const parts = rawId.split(':');
      const id = parts.length > 1 ? parts[parts.length - 1] : rawId;
      const associationState = parts.length > 1 ? parts[0].toUpperCase() : state;
      if (state && associationState === state && id) keys.push(`FDID:${state}:${id.toUpperCase()}`);
    }
  }
  return keys;
}

function buildAgencyIndexes(agencies: Agency[]) {
  const byIdentity = new Map<string, Agency[]>();
  const byStateName = new Map<string, Agency[]>();
  const bySourceIdentifier = new Map<string, Agency[]>();
  const add = (index: Map<string, Agency[]>, key: string, agency: Agency) =>
    index.set(key, [...(index.get(key) ?? []), agency]);
  for (const agency of agencies) {
    for (const key of existingIdentityKeys(agency)) {
      add(byIdentity, key, agency);
    }
    if (agency.npiNumber && /^\d{10}$/.test(agency.npiNumber)) {
      add(bySourceIdentifier, `NPI:${agency.npiNumber}`, agency);
    }
    if (agency.fdid && agency.stateCode) {
      add(bySourceIdentifier, `FDID:${agency.stateCode.toUpperCase()}:${agency.fdid.toUpperCase()}`, agency);
    }
    const name = normalized(agency.name);
    const state = agency.stateCode?.toUpperCase();
    if (name && state) {
      const key = `${state}|${name}`;
      add(byStateName, key, agency);
    }
  }
  return {
    exact(identity: RegistryIdentity) {
      const key = registryIdentityKey(identity);
      return key ? byIdentity.get(key) ?? [] : [];
    },
    possible(identity: RegistryIdentity) {
      const registryKey = registryIdentityKey(identity);
      const idMatches = registryKey ? bySourceIdentifier.get(registryKey) ?? [] : [];
      const candidates = byStateName.get(`${identity.stateCode.toUpperCase()}|${normalized(identity.name)}`) ?? [];
      const city = normalized(identity.city);
      const nameMatches = candidates.filter((agency) => !city || !normalized(agency.city) || normalized(agency.city) === city);
      return [...new Map([...idMatches, ...nameMatches].map((agency) => [agency.id, agency])).values()];
    },
  };
}

export function buildRegistryStatePreview(input: {
  stateCode: string;
  records: SourceDirectoryRecord[];
  agencies: Agency[];
  countyNames: Readonly<Record<string, string>>;
  sourceDates: RegistrySourceDates;
  locationReviewIds?: ReadonlySet<string>;
  locationSnapshotUnavailable?: boolean;
  includeCandidates?: boolean;
}): RegistryImportStatePreview {
  const indexes = buildAgencyIndexes(input.agencies);
  const eligibleIdentities: Array<{ row: SourceDirectoryRecord; identity: RegistryIdentity }> = [];
  const groupCounts = new Map<string, number>();

  for (const row of input.records) {
    const source = row[1];
    const metadata = input.sourceDates[source];
    const identity = snapshotRegistryIdentity(row, metadata?.sourceDate, metadata?.retrievedAt);
    if (!identity || !canCreateRegistryAccount(identity)) continue;
    if (isExactCountyAssignment(row, input.countyNames, input.locationReviewIds?.has(row[0]) ?? false)) {
      identity.countyName = input.countyNames[identity.countyFips!];
    } else {
      identity.countyFips = undefined;
      identity.countyName = undefined;
      identity.countyAssignmentBasis = undefined;
    }
    eligibleIdentities.push({ row, identity });
    const groupKey = nameCityKey(identity);
    if (groupKey) groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1);
  }

  const bySource = emptyBySource();
  const totals = emptyCounts();
  const candidates: RegistryImportCandidate[] = [];
  const countyTotals: RegistryImportStatePreview['countyTotals'] = {};
  const eligibleById = new Map(eligibleIdentities.map((item) => [item.row[0], item.identity]));

  for (const row of input.records) {
    const identity = eligibleById.get(row[0]) ?? snapshotRegistryIdentity(
      row,
      input.sourceDates[row[1]]?.sourceDate,
      input.sourceDates[row[1]]?.retrievedAt,
    );
    let disposition: RegistryImportDisposition;
    let reason: string;

    if (!identity || !canCreateRegistryAccount(identity)) {
      disposition = 'excluded';
      reason = identity?.deactivatedAt
        ? 'The source marks this provider identity as deactivated.'
        : 'The source identity does not pass identifier, name, or source-link checks.';
    } else if (indexes.exact(identity).length > 0) {
      disposition = 'duplicate';
      reason = 'This source identity is already linked to a saved profile.';
    } else if (indexes.possible(identity).length > 0) {
      disposition = 'ambiguous';
      reason = 'A saved profile has a possible name and location match.';
    } else if ((groupCounts.get(nameCityKey(identity) ?? '') ?? 0) > 1) {
      disposition = 'ambiguous';
      reason = 'Multiple source listings share this state, name, and city; review before creating profiles.';
    } else if (!isExactCountyAssignment(row, input.countyNames, input.locationReviewIds?.has(row[0]) ?? false)) {
      disposition = 'unassigned';
      reason = input.locationReviewIds?.has(row[0])
        ? 'The address or county evidence conflicts; no county is assigned.'
        : 'No supported county FIPS assignment is available.';
    } else {
      disposition = 'eligible';
      reason = 'Source identity and county location are eligible for user review.';
    }

    const candidateIdentity = identity && disposition !== 'unassigned' && disposition !== 'excluded'
      ? identity
      : identity
        ? { ...identity, countyFips: undefined, countyName: undefined, countyAssignmentBasis: undefined }
        : undefined;
    const candidate = candidateFrom(row, candidateIdentity, disposition, reason);
    if (input.includeCandidates !== false) candidates.push(candidate);
    addCount(bySource[row[1]], disposition);
    addCount(totals, disposition);
    addCountyCount(countyTotals, candidate);
  }

  if (input.includeCandidates !== false) {
    candidates.sort((a, b) =>
      a.name.localeCompare(b.name) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id),
    );
  }

  return {
    stateCode: input.stateCode,
    bySource,
    totals,
    candidates,
    countyTotals,
    locationSnapshotUnavailable: Boolean(input.locationSnapshotUnavailable),
  };
}

export function aggregateRegistryNationalPreview(
  states: RegistryImportStatePreview[],
  manifest: SourceDirectoryManifest,
): RegistryImportNationalPreview {
  const bySource = emptyBySource();
  const totals = emptyCounts();
  const exactCountyTotals: RegistryImportNationalPreview['exactCountyTotals'] = {};
  for (const state of states) {
    for (const source of ['USFA', 'NPPES'] as const) {
      for (const key of Object.keys(state.bySource[source]) as Array<keyof RegistryImportCounts>) {
        bySource[source][key] += state.bySource[source][key];
      }
    }
    for (const key of Object.keys(state.totals) as Array<keyof RegistryImportCounts>) {
      totals[key] += state.totals[key];
    }
    for (const [fips, county] of Object.entries(state.countyTotals)) {
      const existing = exactCountyTotals[fips] ?? { ...county, total: 0, USFA: 0, NPPES: 0 };
      existing.total += county.total;
      existing.USFA += county.USFA;
      existing.NPPES += county.NPPES;
      exactCountyTotals[fips] = existing;
    }
  }
  return {
    byState: states,
    bySource,
    totals,
    exactCountyTotals,
    outsideStatesAndDc: manifest.otherJurisdictionRecords,
  };
}

export async function loadRegistryStatePreview(input: {
  stateCode: string;
  manifest: SourceDirectoryManifest;
  agencies: Agency[];
  includeCandidates?: boolean;
  loadStateRecords?: (stateCode: string) => Promise<SourceDirectoryRecord[]>;
  loadLocationState?: (stateCode: string) => Promise<LocationState | undefined>;
}): Promise<RegistryImportStatePreview> {
  const loadState = input.loadStateRecords ?? loadSourceDirectoryState;
  const loadLocations = input.loadLocationState ?? loadNationalLocationState;
  const [records, locations] = await Promise.all([
    loadState(input.stateCode),
    loadLocations(input.stateCode),
  ]);
  const enriched = records.map((row) => enrichRegistryRow(row, locations));
  const locationReviewIds = new Set(
    enriched
      .filter((row) => listingLocation(row, locations).status === 'review')
      .map((row) => row[0]),
  );
  const sourceDates: RegistrySourceDates = {
    USFA: {
      sourceDate: input.manifest.sources.USFA.retrievedAt,
      retrievedAt: input.manifest.sources.USFA.retrievedAt,
    },
    NPPES: {
      sourceDate: input.manifest.sources.NPPES.reportingPeriod,
      retrievedAt: input.manifest.sources.NPPES.stagedAt,
    },
  };
  return buildRegistryStatePreview({
    stateCode: input.stateCode,
    records: enriched,
    agencies: input.agencies,
    countyNames: input.manifest.countyNames,
    sourceDates,
    locationReviewIds,
    locationSnapshotUnavailable: !locations,
    includeCandidates: input.includeCandidates,
  });
}

export async function buildNationwideRegistryPreview(input: {
  manifest: SourceDirectoryManifest;
  agencies: Agency[];
  loadStateRecords: (stateCode: string) => Promise<SourceDirectoryRecord[]>;
  loadLocationState: (stateCode: string) => Promise<LocationState | undefined>;
  onProgress?: (progress: RegistryImportProgress) => void;
}): Promise<RegistryImportNationalPreview> {
  const states = Object.keys(input.manifest.stateNames).sort();
  const previews: RegistryImportStatePreview[] = [];

  for (let index = 0; index < states.length; index += 1) {
    const stateCode = states[index];
    previews.push(await loadRegistryStatePreview({
      stateCode,
      manifest: input.manifest,
      agencies: input.agencies,
      loadStateRecords: input.loadStateRecords,
      loadLocationState: input.loadLocationState,
      includeCandidates: false,
    }));
    input.onProgress?.({
      completedStates: index + 1,
      totalStates: states.length,
      stateCode,
    });
  }
  return aggregateRegistryNationalPreview(previews, input.manifest);
}
