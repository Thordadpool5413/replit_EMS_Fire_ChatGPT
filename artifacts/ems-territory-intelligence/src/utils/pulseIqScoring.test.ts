import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Agency } from '../types';
import { calculatePulseIqContributions, calculateScore, DEFAULT_WEIGHTS } from './pulseIqScoring';

const agency = (claimDenialRate: number, estimatedRecoverableRevenue: number): Agency => ({
  id: 'agency-claim-score-test',
  annualCardiacArrestCalls: 700,
  installedFleet: {
    defibBrand: 'Stryker LIFEPAK 15',
    defibAgeYears: 8,
    billingSoftware: 'In-House Billing',
    epcrCadSoftware: 'ESO'
  },
  grantStatus: { afgAwarded: false, saferGrantActive: true },
  cmsData: { claimDenialRate, estimatedRecoverableRevenue }
} as Agency);

test('PulseIQ score and factor contributions ignore claim rates and recovery amounts', () => {
  const lowClaims = agency(2, 0);
  const highClaims = agency(98, 99000000);

  assert.equal(calculateScore(lowClaims), calculateScore(highClaims));
  assert.deepEqual(
    calculatePulseIqContributions(lowClaims),
    calculatePulseIqContributions(highClaims)
  );
});

test('legacy CMS weight cannot change PulseIQ', () => {
  const record = agency(35, 500000);
  const legacyWeights = { ...DEFAULT_WEIGHTS, cmsDenialWeight: 99 };

  assert.equal(calculateScore(record), calculateScore(record, legacyWeights));
  assert.equal(
    Math.round(Object.values(calculatePulseIqContributions(record)).reduce((sum, points) => sum + points, 0)),
    calculateScore(record)
  );
});
