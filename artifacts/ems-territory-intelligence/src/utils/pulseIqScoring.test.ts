import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Agency } from '../types';
import {
  calculatePulseIqContributions,
  calculateScore,
  DEFAULT_WEIGHTS,
  evaluatePulseIqFactors
} from './pulseIqScoring';

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

test('PulseIQ factor detail exposes the values, weights, rules, and source fields used', () => {
  const record = agency(35, 500000);
  const factors = evaluatePulseIqFactors(record);

  assert.deepEqual(factors.map((factor) => factor.key), ['fleet', 'clinical', 'grant', 'software']);
  const clinical = factors.find((factor) => factor.key === 'clinical')!;
  assert.equal(clinical.baseScore, 70);
  assert.equal(clinical.weightPct, 27);
  assert.equal(clinical.contributionPts, 18.9);
  assert.equal(clinical.inputs[0].valueUsed, '700 calls/year');
  assert.equal(clinical.inputs[0].sourceKey, 'clinicalOutcomes');
  assert.match(clinical.method, /1,800\+/);
  assert.equal(
    Math.round(factors.reduce((sum, factor) => sum + factor.contributionPts, 0)),
    calculateScore(record)
  );
});

test('missing score inputs are shown as model fallbacks instead of implied source facts', () => {
  const record = {
    ...agency(35, 500000),
    annualCardiacArrestCalls: undefined,
    installedFleet: {
      defibBrand: '',
      defibAgeYears: undefined,
      billingSoftware: '',
      epcrCadSoftware: ''
    }
  } as unknown as Agency;

  const factors = evaluatePulseIqFactors(record);
  const fleet = factors.find((factor) => factor.key === 'fleet')!;
  const clinical = factors.find((factor) => factor.key === 'clinical')!;
  const software = factors.find((factor) => factor.key === 'software')!;

  assert.equal(fleet.inputs[0].valueUsed, '7 years');
  assert.equal(fleet.inputs[0].usedDefault, true);
  assert.equal(clinical.inputs[0].valueUsed, '600 calls/year');
  assert.equal(clinical.inputs[0].usedDefault, true);
  assert.equal(software.inputs[0].valueUsed, 'Not listed');
  assert.equal(software.inputs[0].usedDefault, true);
  assert.match(software.method, /missing software names currently count as no ZOLL match/i);
});
