import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { findProviderEvidence, providerProfileEvidence } from '../data/providerProfileEvidence';
import type { SourceDirectoryRecord } from '../services/nationalSourceDirectory';
import { parseProviderProfileRef, providerProfileHref } from './providerProfileUrl';

const shards = new URL('../../public/registry/national/', import.meta.url);

test('every national state registry row can be addressed by its original ID', () => {
  const manifest = JSON.parse(readFileSync(new URL('index.json', shards), 'utf8'));
  const states = Object.keys(manifest.byState).map((state) => state + '.json');
  assert.equal(states.length, 51);
  for (const file of states) {
    const records = JSON.parse(readFileSync(new URL(file, shards), 'utf8')) as SourceDirectoryRecord[];
    for (const [id, , , state] of records) {
      const ref = { state, id, source: 'registry' as const };
      const target = new URL(providerProfileHref(ref), 'https://atlas.example');
      assert.deepEqual(parseProviderProfileRef(target.searchParams.get('profile')!), ref);
    }
  }
});

test('profile links reject cross-state fire IDs and unsupported input', () => {
  for (const value of ['TX/registry/usfa:FL:61091', 'FL/registry/../x', 'FL/state-ems/abc', 'FL/neris/<test>', 'FL/unrecognized/123']) {
    assert.equal(parseProviderProfileRef(value), undefined);
  }
});

test('enrichment belongs to exact registry identities and preserves purchase status', () => {
  const keys = new Set<string>();
  const manifest = JSON.parse(readFileSync(new URL('index.json', shards), 'utf8'));
  const names = new Map<string, string>();
  for (const state of Object.keys(manifest.byState)) {
    const rows = JSON.parse(readFileSync(new URL(state + '.json', shards), 'utf8')) as SourceDirectoryRecord[];
    for (const [id, , name] of rows) names.set(id, name);
  }
  for (const record of providerProfileEvidence) {
    const sourceId = record.registryKey.replace(/^FDID:/, 'usfa:').replace(/^NPI:/, 'nppes:');
    assert.equal(names.get(sourceId), record.registryName);
    assert.equal(keys.has(record.registryKey), false);
    keys.add(record.registryKey);
    assert.equal(findProviderEvidence(record.registryKey, 'another department'), undefined);
  }
  const evidence = findProviderEvidence('FDID:FL:61091', 'Flagler County Fire Rescue');
  assert.equal(evidence?.funding?.[0].amount, 46268);
  assert.equal(evidence?.funding?.[0].status, 'Requested');
  assert.equal(evidence?.equipment?.find((entry) => entry.status === 'In service reported')?.quantity, undefined);
});

test('profile evidence requires the source identifier and exact agency name', () => {
  const name = 'Flagler County Fire Rescue';
  const evidence = findProviderEvidence('FDID:FL:61091', name);
  assert.ok(evidence);
  assert.equal(findProviderEvidence('STATE-EMS:FL:license:1801', name), evidence);
  assert.equal(findProviderEvidence('STATE-EMS:FL:license:1801', 'Flagler Beach Fire Department'), undefined);
  assert.equal(findProviderEvidence('STATE-EMS:FL:license:1802', name), undefined);
  assert.equal(findProviderEvidence(undefined, name), undefined);
});

test('reported AED deployment, requested quantity and historical monitors are distinct', () => {
  const evidence = findProviderEvidence('FDID:FL:61091', 'Flagler County Fire Rescue');
  assert.ok(evidence);
  assert.ok(evidence.equipment.some(row => row.category === 'aed' && row.status === 'In service reported' && !('quantity' in row)));
  assert.ok(evidence.equipment.some(row => row.category === 'aed' && row.status === 'Proposed purchase' && row.quantity === 22));
  assert.ok(evidence.equipment.some(row => row.category === 'monitor' && row.status === 'Documented historically' && row.quantity === 15));
});

test('ROSC is a department outcome tied to its reporting period and case cohort', () => {
  const evidence = findProviderEvidence('FDID:FL:10151', 'Coral Springs-Parkland Fire Department');
  assert.ok(evidence);
  const rosc = evidence.quality.find(row => row.label.includes('(ROSC)'));
  assert.equal(rosc?.value, 30);
  assert.equal(rosc?.source.date, 'FY2025');
  assert.match(rosc?.context ?? '', /100 cardiac arrests/);
});
