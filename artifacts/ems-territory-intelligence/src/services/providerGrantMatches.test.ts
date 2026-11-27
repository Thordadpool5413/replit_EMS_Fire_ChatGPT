import assert from 'node:assert/strict';
import test from 'node:test';
import { findProviderEvidence, providerEvidenceNerisId } from '../data/providerProfileEvidence';
import { matchingProviderGrants } from './providerGrantMatches';
import { buildProviderCardFacts } from './providerCardIntelligence';

test('grant candidates require the full recipient name and the same state', () => {
  const exact = { recipient: 'FLAGLER COUNTY FIRE-RESCUE', state: 'FL' };
  const county = { recipient: 'County of Flagler', state: 'FL' };
  const candidates = [
    exact, county,
    { recipient: 'Flagler Beach Fire Rescue', state: 'FL' },
    { recipient: exact.recipient, state: 'CO' },
  ];
  assert.deepEqual(matchingProviderGrants(candidates, 'FL', ['Flagler County Fire Rescue']), [exact]);
  assert.deepEqual(matchingProviderGrants(candidates, 'FL', ['County of Flagler']), [county]);
});

test('only explicitly linked registry identities share the same evidence', () => {
  const flagler = findProviderEvidence('FDID:FL:61091', 'Flagler County Fire Rescue');
  assert.ok(flagler);
  assert.equal(flagler.stationDirectory?.stations.length, 13);
  assert.equal(providerEvidenceNerisId(flagler), 'FD12035253');
  assert.equal(findProviderEvidence('NERIS:FD12035253', flagler.registryName), flagler);
  assert.equal(findProviderEvidence('STATE-EMS:FL:license:1801', flagler.registryName), flagler);
  assert.equal(findProviderEvidence('FDID:FL:61011', flagler.registryName), undefined);
  assert.equal(findProviderEvidence('NERIS:FD12035253', 'Flagler Beach Fire Department'), undefined);
});

test('a public purchase approval is shown on the card without claiming a completed purchase', () => {
  const evidence = findProviderEvidence('FDID:FL:10082', 'Pembroke Pines Fire Rescue');
  const approval = buildProviderCardFacts(evidence).equipment.find(fact => fact.status === 'Purchase approved');
  assert.ok(approval);
  assert.match(approval.value, /21 units.*Stryker LIFEPAK 35/);
  assert.match(approval.detail ?? '', /Supplier Stryker Sales, LLC.*Approved 2026-08-05/i);
  assert.doesNotMatch(approval.detail ?? '', /Purchased 2026/);
});
