import test from 'node:test';
import assert from 'node:assert/strict';
import type { Agency } from '../types';
import type { SourceDirectoryManifest, SourceDirectoryRecord } from './nationalSourceDirectory';
import { snapshotRegistryIdentity, withholdReviewedRegistryCounty } from './registryAccountLink';
import { createSourceNativeAgency } from './sourceNativeAgency';
import { filterSavedAgencyRecordsForJurisdiction } from '../utils/countyAgencySelection';
import {
  aggregateRegistryNationalPreview,
  buildNationwideRegistryPreview,
  buildRegistryStatePreview,
  importReviewedRegistryProfiles,
} from './nationalRegistryImport';

const countyNames = { '06037': 'Los Angeles County' };
const sourceDates = {
  USFA: { sourceDate: '2026-11-17', retrievedAt: '2026-11-17' },
  NPPES: { sourceDate: '2026-11-09 monthly release', retrievedAt: '2026-11-15T17:39:19Z' },
};

function usfa(name = 'County Fire'): SourceDirectoryRecord {
  return [
    'usfa:CA:00123', 'USFA', name, 'CA', 'Los Angeles', '90001',
    '06037', 'Los Angeles County', 'source-county', '', '123 Main Street',
    'https://apps.usfa.fema.gov/registry/search',
  ];
}

function nppes(name = 'County Ambulance'): SourceDirectoryRecord {
  return [
    'nppes:1234567893', 'NPPES', name, 'CA', 'Los Angeles', '90001',
    '06037', '', 'census-address-range', '', '123 Main Street',
    'https://npiregistry.cms.hhs.gov/provider-view/1234567893',
  ];
}

const preview = (
  records: SourceDirectoryRecord[],
  agencies: Agency[] = [],
  options: { locationReviewIds?: ReadonlySet<string>; locationSnapshotUnavailable?: boolean } = {},
) => buildRegistryStatePreview({
  stateCode: 'CA',
  records,
  agencies,
  countyNames,
  sourceDates,
  ...options,
});

test('county review withholds the resolved county while preserving original source evidence', () => {
  const identity = snapshotRegistryIdentity(usfa(), '2026-11-17', '2026-11-17');
  assert.ok(identity);
  const reviewed = withholdReviewedRegistryCounty(identity, true);

  assert.equal(reviewed.countyFips, undefined);
  assert.equal(reviewed.countyName, undefined);
  assert.equal(reviewed.sourceCounty, 'Los Angeles County');
  assert.equal(reviewed.countyAssignmentBasis, 'source-county');
  assert.equal(withholdReviewedRegistryCounty(identity, false), identity);
});

test('only exact supported county assignments count as eligible county candidates', () => {
  const result = preview([
    usfa(),
    nppes(),
    ['nppes:9876543213', 'NPPES', 'Unassigned EMS', 'CA', 'Remote', '', '', '', 'unassigned', '', '', 'https://npiregistry.cms.hhs.gov/provider-view/9876543213'],
  ]);

  assert.equal(result.bySource.USFA.eligible, 1);
  assert.equal(result.bySource.NPPES.eligible, 1);
  assert.equal(result.bySource.NPPES.unassigned, 1);
  assert.equal(result.countyTotals['06037'].total, 2);
  assert.equal(result.countyTotals['06037'].USFA, 1);
  assert.equal(result.countyTotals['06037'].NPPES, 1);
  assert.equal(result.candidates.find((candidate) => candidate.name === 'Unassigned EMS')?.countyFips, undefined);
});

test('source-native profiles appear in their county directory only with a supported county assignment', () => {
  const candidate = preview([usfa()]).candidates[0];
  assert.equal(candidate?.disposition, 'eligible');
  assert.ok(candidate.identity);
  const assigned = createSourceNativeAgency(candidate.identity, []);
  assert.equal(assigned.countyFips, '06037');
  assert.deepEqual(filterSavedAgencyRecordsForJurisdiction([assigned], 'CA', 'Los Angeles County'), [assigned]);

  const reviewedIdentity = withholdReviewedRegistryCounty(candidate.identity, true);
  const unassigned = createSourceNativeAgency(reviewedIdentity, []);
  assert.equal(unassigned.countyFips, undefined);
  assert.deepEqual(filterSavedAgencyRecordsForJurisdiction([unassigned], 'CA', 'Los Angeles County'), []);
});

test('invalid and deactivated identities are excluded without county totals', () => {
  const invalidNpi: SourceDirectoryRecord = [
    'nppes:1234567890', 'NPPES', 'Invalid NPI EMS', 'CA', 'Los Angeles', '90001',
    '06037', '', 'census-address-range', '', '123 Main Street',
    'https://npiregistry.cms.hhs.gov/provider-view/1234567890',
  ];
  const inactive: SourceDirectoryRecord = [
    'nppes:1234567893', 'NPPES', 'Deactivated EMS', 'CA', 'Los Angeles', '90001',
    '06037', '', 'census-address-range', '2026-01-01', '123 Main Street',
    'https://npiregistry.cms.hhs.gov/provider-view/1234567893',
  ];
  const result = preview([invalidNpi, inactive]);

  assert.equal(result.totals.excluded, 2);
  assert.equal(result.countyTotals['06037'], undefined);
});

test('existing exact source identities are duplicates and name-only matches stay ambiguous', () => {
  const exact: Agency = {
    id: 'existing-nppes',
    name: 'Different display name',
    stateCode: 'NY',
    npiNumber: '1234567893',
    registryIdentity: {
      sourceName: 'NPPES',
      identifier: '1234567893',
      stateCode: 'NY',
      name: 'Different display name',
      sourceUrl: 'https://npiregistry.cms.hhs.gov/provider-view/1234567893',
      retrievedAt: '2026-11-15T00:00:00Z',
    },
  } as Agency;
  const possible: Agency = {
    id: 'possible-match',
    name: 'County EMS',
    stateCode: 'CA',
    city: 'Los Angeles',
  } as Agency;
  const result = preview([nppes('County EMS'), usfa('County EMS')], [exact, possible]);

  assert.equal(result.candidates.find((candidate) => candidate.source === 'NPPES')?.disposition, 'duplicate');
  assert.equal(result.candidates.find((candidate) => candidate.source === 'USFA')?.disposition, 'ambiguous');
});

test('same-name cross-source rows remain ambiguous until reviewed', () => {
  const result = preview([usfa('County EMS'), nppes('County EMS')]);
  assert.equal(result.totals.ambiguous, 2);
  assert.equal(result.totals.eligible, 0);
  assert.equal(result.countyTotals['06037'], undefined);
});

test('conflicting location evidence removes county assignment but keeps identity reviewable', () => {
  const result = preview([nppes()], [], {
    locationReviewIds: new Set(['nppes:1234567893']),
  });
  assert.equal(result.totals.unassigned, 1);
  assert.equal(result.candidates[0]?.countyFips, undefined);
  assert.match(result.candidates[0]?.reason ?? '', /conflicts/);
});

test('national aggregation sums state/source dispositions and exact counties', () => {
  const ca = preview([usfa()]);
  const dc = buildRegistryStatePreview({
    stateCode: 'DC',
    records: [['nppes:1234567893', 'NPPES', 'District EMS', 'DC', 'Washington', '', '', '', 'unassigned', '', '', 'https://npiregistry.cms.hhs.gov/provider-view/1234567893']],
    agencies: [],
    countyNames,
    sourceDates,
    locationSnapshotUnavailable: true,
    includeCandidates: false,
  });
  const manifest = {
    otherJurisdictionRecords: 1002,
  } as SourceDirectoryManifest;
  const total = aggregateRegistryNationalPreview([ca, dc], manifest);

  assert.equal(total.totals.total, 2);
  assert.equal(total.totals.eligible, 1);
  assert.equal(total.totals.unassigned, 1);
  assert.equal(total.bySource.USFA.eligible, 1);
  assert.equal(total.bySource.NPPES.unassigned, 1);
  assert.equal(total.exactCountyTotals['06037'].total, 1);
  assert.equal(total.outsideStatesAndDc, 1002);
  assert.deepEqual(dc.candidates, []);
});

test('national scan reads every supported state and reports progress without writing records', async () => {
  const manifest = {
    stateNames: { CA: 'California', DC: 'District of Columbia' },
    countyNames,
    sources: {
      USFA: { retrievedAt: '2026-11-17' },
      NPPES: { reportingPeriod: '2026-11-09 monthly release', stagedAt: '2026-11-15T17:39:19Z' },
    },
    otherJurisdictionRecords: 1002,
  } as unknown as SourceDirectoryManifest;
  const recordsByState = {
    CA: [usfa()],
    DC: [['nppes:9876543213', 'NPPES', 'District EMS', 'DC', 'Washington', '', '', '', 'unassigned', '', '', 'https://npiregistry.cms.hhs.gov/provider-view/9876543213'] as SourceDirectoryRecord],
  };
  const progress: string[] = [];
  const result = await buildNationwideRegistryPreview({
    manifest,
    agencies: [],
    loadStateRecords: async (stateCode) => recordsByState[stateCode as keyof typeof recordsByState],
    loadLocationState: async () => undefined,
    onProgress: ({ completedStates, totalStates, stateCode }) => {
      progress.push(`${completedStates}/${totalStates}:${stateCode}`);
    },
  });

  assert.deepEqual(progress, ['1/2:CA', '2/2:DC']);
  assert.equal(result.totals.total, 2);
  assert.equal(result.totals.eligible, 1);
  assert.equal(result.totals.unassigned, 1);
  assert.equal(result.outsideStatesAndDc, 1002);
});

test('reviewed imports use create-only batches and safely skip records on retry', async () => {
  const profiles = Array.from({ length: 27 }, (_, index) => createSourceNativeAgency({
    sourceName: 'USFA NFDR',
    identifier: String(10000 + index),
    stateCode: 'CA',
    name: `Fire Department ${index}`,
    countyFips: '06037',
    countyName: 'Los Angeles County',
    countyAssignmentBasis: 'source-county',
    sourceUrl: 'https://apps.usfa.fema.gov/registry/search',
    sourceDate: '2026-11-17',
    retrievedAt: '2026-11-17',
  }, []));
  const remoteIds = new Set<string>();
  const batchSizes: number[] = [];
  const saved: string[] = [];
  const first = await importReviewedRegistryProfiles({
    profiles,
    batchSize: 25,
    createBatch: async (batch) => {
      batchSizes.push(batch.length);
      const created = batch.map((profile) => profile.id).filter((id) => !remoteIds.has(id));
      created.forEach((id) => remoteIds.add(id));
      return created;
    },
    onCreated: (batch) => saved.push(...batch.map((profile) => profile.id)),
  });
  const retry = await importReviewedRegistryProfiles({
    profiles,
    batchSize: 25,
    createBatch: async (batch) => batch.map((profile) => profile.id).filter((id) => !remoteIds.has(id)),
  });

  assert.deepEqual(batchSizes, [25, 2]);
  assert.equal(first.createdIds.length, 27);
  assert.equal(first.alreadyPresent, 0);
  assert.equal(retry.createdIds.length, 0);
  assert.equal(retry.alreadyPresent, 27);
  assert.equal(saved.length, 27);
});

test('source-native profiles retain the exact county assignment method as evidence', () => {
  const profile = createSourceNativeAgency({
    sourceName: 'USFA NFDR',
    identifier: '30123',
    stateCode: 'CA',
    name: 'County Fire',
    countyFips: '06037',
    countyName: 'Los Angeles County',
    countyAssignmentBasis: 'source-county',
    sourceCounty: 'Los Angeles',
    sourceUrl: 'https://apps.usfa.fema.gov/registry/search',
    sourceDate: '2026-11-17',
    retrievedAt: '2026-11-17',
  }, []);
  const note = profile.factEvidence?.departmentRegistry?.note ?? '';
  assert.match(note, /source-county/);
  assert.match(note, /source-reported county text: Los Angeles/);
  assert.match(note, /does not establish service coverage/);
});

test('a failed later batch retains earlier create results and can be retried without overwrite', async () => {
  const profiles = Array.from({ length: 26 }, (_, index) => createSourceNativeAgency({
    sourceName: 'USFA NFDR',
    identifier: String(20000 + index),
    stateCode: 'CA',
    name: `Fire Station ${index}`,
    countyFips: '06037',
    countyName: 'Los Angeles County',
    countyAssignmentBasis: 'source-county',
    sourceUrl: 'https://apps.usfa.fema.gov/registry/search',
    sourceDate: '2026-11-17',
    retrievedAt: '2026-11-17',
  }, []));
  const remoteIds = new Set<string>();
  let calls = 0;
  const progress: number[] = [];
  await assert.rejects(importReviewedRegistryProfiles({
    profiles,
    createBatch: async (batch) => {
      calls += 1;
      if (calls === 2) throw new Error('network interrupted');
      const created = batch.map((profile) => profile.id).filter((id) => !remoteIds.has(id));
      created.forEach((id) => remoteIds.add(id));
      return created;
    },
    onProgress: (state) => progress.push(state.processed),
  }), /network interrupted/);
  const retry = await importReviewedRegistryProfiles({
    profiles,
    createBatch: async (batch) => {
      const created = batch.map((profile) => profile.id).filter((id) => !remoteIds.has(id));
      created.forEach((id) => remoteIds.add(id));
      return created;
    },
  });

  assert.deepEqual(progress, [25]);
  assert.equal(retry.createdIds.length, 1);
  assert.equal(retry.alreadyPresent, 25);
});
