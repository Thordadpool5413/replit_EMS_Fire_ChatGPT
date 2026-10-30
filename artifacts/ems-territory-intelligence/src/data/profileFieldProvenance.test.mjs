import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfileFieldProvenance } from './profileFieldProvenance.ts';

const verifiedProfile = {
  name: 'North Harbor Fire Department',
  city: 'North Harbor',
  stateCode: 'NY',
  npiNumber: '1234567893',
  isVerifiedRecord: true,
  nppesOfficialName: 'North Harbor Fire Department',
  nppesVerifiedCity: 'North Harbor',
  nppesVerifiedStateCode: 'NY',
  nppesRegistryUrl: 'https://npiregistry.cms.hhs.gov/provider-view/1234567893'
};

test('labels an exact NPPES identity as source-linked, not operationally verified', () => {
  const result = resolveProfileFieldProvenance(verifiedProfile, verifiedProfile, 'npiNumber');
  assert.equal(result.kind, 'source_linked');
  assert.match(result.explanation, /does not validate operations/);
});

test('labels profile-provided operational values as local claims', () => {
  const raw = { annualCallVolume: 1200 };
  const profile = { annualCallVolume: 1200 };
  assert.equal(resolveProfileFieldProvenance(raw, profile, 'annualCallVolume').kind, 'local_claim');
});

test('labels normalizer-filled values as modeled', () => {
  const result = resolveProfileFieldProvenance({}, { stationsCount: 3 }, 'stationsCount');
  assert.equal(result.kind, 'modeled');
});

test('does not treat a local grant claim as a live FEMA record', () => {
  const raw = { femaGrantHistory: [{ awardAmount: 25000 }] };
  const profile = { ...raw, femaGrantHistory: raw.femaGrantHistory };
  assert.equal(resolveProfileFieldProvenance(raw, profile, 'femaGrantHistory').kind, 'local_claim');
});

test('labels OpenFEMA rows as live records without asserting recipient identity', () => {
  const profile = { liveFemaAwards: [{ awardNumber: 'EMW-2024-FG-00002' }] };
  const result = resolveProfileFieldProvenance({}, profile, 'liveFemaAwards');
  assert.equal(result.kind, 'live_record');
  assert.match(result.explanation, /not automatically matched/);
});
