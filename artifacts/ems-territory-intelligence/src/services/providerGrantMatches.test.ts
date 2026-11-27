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

test('grant identifier merges presentation only for the same award number and recipient', async () => {
  const { grantIdentity } = await import('./providerGrantMatches');
  const award = { awardNumber: 'EMW-2024-FG-00001', recipient: 'County of Flagler' };
  assert.equal(grantIdentity(award), grantIdentity({ awardNumber: 'emw2024fg00001', recipient: 'COUNTY OF FLAGLER' }));
  assert.notEqual(grantIdentity(award), grantIdentity({ ...award, recipient: 'Flagler Beach Fire Department' }));
  assert.equal(grantIdentity({ ...award, awardNumber: '-' }), undefined);
});

test('Orange County source identities agree through the published billing organization', async () => {
  const { providerEvidenceNpi, providerEvidenceFloridaLicense, findProviderEvidenceByConfirmedKeys } = await import('../data/providerProfileEvidence');
  const county = findProviderEvidence('FDID:FL:07252', 'Orange County Fire Rescue Department');
  assert.ok(county);
  assert.equal(providerEvidenceNpi(county), '1033215348');
  assert.equal(providerEvidenceNerisId(county), 'FD12095275');
  assert.equal(providerEvidenceFloridaLicense(county), '4807');
  assert.equal(findProviderEvidence('NPI:1033215348', 'ORANGE COUNTY BOARD OF COUNTY COMMISSIONERS'), county);
  assert.equal(findProviderEvidence('NPI:1033215348', 'Orlando Fire Department'), undefined);
  assert.equal(findProviderEvidenceByConfirmedKeys(['FDID:FL:07252', 'FDID:FL:07212']), undefined);
  assert.equal(findProviderEvidenceByConfirmedKeys(['FDID:FL:07252', 'NPI:1033215348']), county);
});

test('paid purchases, dated allocations and station phone numbers retain their source scope', () => {
  const cache = findProviderEvidence('FDID:UT:05002', 'Cache County Fire District');
  const carver = findProviderEvidence('NERIS:FD25023950', 'Carver Fire Department');
  const california = findProviderEvidence('FDID:CA:15065', 'California City Fire Department');
  const beach = findProviderEvidence('NERIS:FD12086690', 'Miami Beach Fire Department');
  const lynnHaven = findProviderEvidence('FDID:FL:23022', 'Lynn Haven Fire & Emergency Services');
  assert.equal(cache?.equipment?.[0].lastPurchasedOn, '2022');
  assert.equal(california?.equipment?.[0].paidOn, '2024-11-07');
  assert.equal(california?.equipment?.[0].lastPurchasedOn, undefined);
  assert.equal(carver?.equipment?.[0].quantity, 4);
  assert.equal(carver?.equipment?.[0].acquiredOn, '2024-01-24');
  assert.equal(carver?.equipment?.[0].lastPurchasedOn, undefined);
  assert.equal(new Set(beach?.stationDirectory?.stations.map(row => row.contact?.phone)).size, 4);
  assert.ok(lynnHaven?.stationDirectory?.stations.every(row => !row.contact));
});

test('public billing uses exact department identity and keeps pilot denials separate from payer mix', () => {
  const naperville = findProviderEvidence('NERIS:FD17043548', 'Naperville Fire Department');
  const alameda = findProviderEvidence('FDID:CA:01005', 'City of Alameda Fire Department');
  assert.equal(naperville?.billingDenials?.find(row => row.label === 'Claims with initial denial')?.value, 47);
  assert.equal(naperville?.billingDenials?.find(row => row.label === 'Claims administered')?.value, 316);
  assert.equal(naperville?.payerMix, undefined);
  assert.equal(alameda?.payerMix?.find(row => row.label === 'Medicare')?.value, 55);
  assert.equal(alameda?.billingDenials, undefined);
  assert.equal(findProviderEvidence('NERIS:FD17043548', 'Other Fire Department'), undefined);
});
