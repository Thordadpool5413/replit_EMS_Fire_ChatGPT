import assert from 'node:assert/strict';
import test from 'node:test';
import { findProviderEvidence } from '../data/providerProfileEvidence';
import type { Agency } from '../types';
import { buildProviderCardFacts, providerCallQuestions } from './providerCardIntelligence';

test('card keeps Flagler equipment, funding and compatibility evidence separate', () => {
  const evidence = findProviderEvidence('FDID:FL:61091', 'Flagler County Fire Rescue');
  const facts = buildProviderCardFacts(evidence);
  assert.deepEqual(facts.equipment.slice(0, 3).map(({ value, status }) => [value, status]), [
    ['County public-access AED program', 'In service reported'],
    ['22 units', 'Proposed purchase'],
    ['15 units', 'Documented historically'],
  ]);
  assert.equal(facts.funding[0].value, '$46,268');
  assert.equal(facts.funding[0].status, 'Requested');
  assert.equal(facts.operations[0].value, '14,138');
  assert.match(providerCallQuestions(evidence)[0], /pads and connectors/);
});

test('card shows department outcomes with their reporting period and cohort', () => {
  const evidence = findProviderEvidence('FDID:FL:10151', 'Coral Springs-Parkland Fire Department');
  const facts = buildProviderCardFacts(evidence);
  const rosc = facts.quality.find(item => item.label.includes('ROSC'));
  assert.equal(rosc?.value, '30%');
  assert.equal(rosc?.source.date, 'FY2025');
  assert.match(rosc?.detail ?? '', /100 cardiac arrests/);
  assert.match(providerCallQuestions(evidence)[0], /review CPR events/);
});

test('saved cards exclude estimates, geographic aggregates and values without agency evidence', () => {
  const agency = {
    utsteinSurvivalRate: 20, bystanderCPRRate: 0, annualCallVolume: 100,
    annual911Transports: 400, stationsCount: 0,
    installedFleet: { defibBrand: 'Example model' },
    factEvidence: {
      clinicalOutcomes: { sourceName: 'County aggregate', sourceRecordId: 'county-001', sourceUrl: 'https://example.org/report', geographicLevel: 'county' },
      annualEmergencyVolume: { sourceName: 'Volume model', sourceRecordId: 'm-1', sourceKind: 'logic', note: 'estimated by population' },
      stationCount: { sourceName: 'Agency annual report', sourceRecordId: 'agency-001', sourceUrl: 'https://example.org/agency', reportingPeriod: '2025' },
    },
  } as unknown as Agency;
  const facts = buildProviderCardFacts(undefined, agency);
  assert.deepEqual(facts.quality, []);
  assert.deepEqual(facts.equipment, []);
  assert.deepEqual(facts.operations.map(({ label, value, source }) => [label, value, source.date]), [['Stations', '0', '2025']]);
});
