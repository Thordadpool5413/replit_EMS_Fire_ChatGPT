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
  for (const record of providerProfileEvidence) {
    const [, state, id] = record.registryKey.split(':');
    const rows = JSON.parse(readFileSync(new URL(state + '.json', shards), 'utf8')) as SourceDirectoryRecord[];
    assert.equal(rows.find((row) => row[0] === `usfa:${state}:${id}`)?.[2], record.registryName);
    assert.equal(keys.has(record.registryKey), false);
    keys.add(record.registryKey);
    assert.equal(findProviderEvidence(record.registryKey, 'another department'), undefined);
  }
  const evidence = findProviderEvidence('FDID:FL:61091', 'Flagler County Fire Rescue');
  assert.equal(evidence?.funding?.[0].amount, 46268);
  assert.equal(evidence?.funding?.[0].status, 'Requested');
  assert.equal(evidence?.equipment?.find((entry) => entry.status === 'In service reported')?.quantity, undefined);
});
