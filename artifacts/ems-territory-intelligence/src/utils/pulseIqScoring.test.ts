import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Agency } from '../types';
import { hasMappedAgencyFactEvidence, hasReviewedAgencyFactEvidence } from '../data/agencyFactEvidence';
import { PulseIqEstimateLabel } from '../components/PulseIqEstimateLabel';
import {
  calculatePulseIqContributions,
  calculateScore,
  DEFAULT_WEIGHTS,
  evaluatePulseIqFactors,
  getPulseIqFormula,
  getPulseIqWeightDetails
} from './pulseIqScoring';
import { rankByPulseIqScore } from './pulseIqRanking';

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

test('PulseIQ estimate stays visible without mapped or reviewed factor sources', () => {
  const record = {
    ...agency(0, 0),
    factEvidence: {}
  } as Agency;
  const score = calculateScore(record);
  const factorSourceKeys = evaluatePulseIqFactors(record)
    .flatMap((factor) => factor.inputs.map((input) => input.sourceKey));

  assert.equal(Number.isFinite(score), true);
  assert.equal(score, calculateScore(agency(0, 0)));
  assert.ok(factorSourceKeys.length > 0);
  for (const sourceKey of new Set(factorSourceKeys)) {
    assert.equal(hasMappedAgencyFactEvidence(record, sourceKey), false);
    assert.equal(hasReviewedAgencyFactEvidence(record, sourceKey), false);
  }

  const estimateMarkup = renderToStaticMarkup(
    React.createElement(PulseIqEstimateLabel)
  );
  assert.match(estimateMarkup, /PulseIQ estimate/);
});

test('claim evidence does not change PulseIQ score availability or estimate label', () => {
  const noClaims = {
    ...agency(0, 0),
    factEvidence: {}
  } as Agency;
  const claimEvidence = {
    ...agency(98, 99000000),
    factEvidence: {
      cmsClaims: {
        sourceName: 'Imported claim records',
        sourceRecordId: 'claim-records-1',
        sourceKind: 'manual',
        note: 'Imported claim records',
        reviewed: true,
        reviewedAt: new Date().toISOString()
      }
    }
  } as Agency;

  const noClaimsScore = calculateScore(noClaims);
  const claimEvidenceScore = calculateScore(claimEvidence);
  assert.equal(Number.isFinite(noClaimsScore), true);
  assert.equal(Number.isFinite(claimEvidenceScore), true);
  assert.equal(claimEvidenceScore, noClaimsScore);
  assert.match(renderToStaticMarkup(React.createElement(PulseIqEstimateLabel)), /PulseIQ estimate/);
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

test('custom weights use the same four active factors in score details and formula', () => {
  const record = agency(82, 750000);
  const weights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 10,
    cardiacVolumeWeight: 50,
    grantAwardWeight: 30,
    softwareWhitespaceWeight: 10,
    cmsDenialWeight: 500
  };
  const evaluatedFactors = evaluatePulseIqFactors(record, weights);
  const weightDetails = getPulseIqWeightDetails(weights);

  assert.deepEqual(evaluatedFactors.map((factor) => factor.key), ['fleet', 'clinical', 'grant', 'software']);
  assert.deepEqual(weightDetails.factors.map((factor) => factor.key), evaluatedFactors.map((factor) => factor.key));
  evaluatedFactors.forEach((factor, index) => {
    assert.equal(weightDetails.factors[index].weight, factor.weight);
    assert.equal(weightDetails.factors[index].weightPct, factor.weightPct);
  });
  assert.equal(
    Math.round(evaluatedFactors.reduce((sum, factor) => sum + factor.contributionPts, 0)),
    calculateScore(record, weights)
  );
  assert.equal(getPulseIqFormula(weights), '(F_fleet × 10 + F_clinical × 50 + F_grant × 30 + F_software × 10) ÷ 100');
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

const rankedAgency = (
  id: string,
  stateCode: string,
  annualCardiacArrestCalls: number,
  defibAgeYears: number
): Agency => {
  const template = agency(0, 0);
  const record = {
    ...template,
    id,
    stateCode,
    annualCardiacArrestCalls,
    installedFleet: {
      ...template.installedFleet,
      defibAgeYears
    }
  } as Agency;
  return {
    ...record,
    zollOpportunity: { pulseIqScore: calculateScore(record) }
  } as Agency;
};

const withChangedClaimRecords = (record: Agency, multiplier: number): Agency => {
  const updated = {
    ...record,
    cmsData: {
      ...record.cmsData,
      claimDenialRate: multiplier * 37,
      estimatedRecoverableRevenue: multiplier * 25_000_000,
      medicareDeniedClaimCount: multiplier * 1_000_000,
      medicareAdjudicatedClaimCount: multiplier * 2_000_000,
      medicareDeniedAmountAnnual: multiplier * 900_000_000
    }
  } as Agency;
  return {
    ...updated,
    zollOpportunity: { pulseIqScore: calculateScore(updated) }
  } as Agency;
};

test('lead queue PulseIQ score order is unchanged by imported claim-record changes', () => {
  const agencies = [
    rankedAgency('wa-large', 'WA', 2400, 11),
    rankedAgency('wa-small', 'WA', 1200, 8),
    rankedAgency('tx-large', 'TX', 700, 6),
    rankedAgency('tx-small', 'TX', 100, 3)
  ];
  const updatedClaimAgencies = agencies.map((record, index) =>
    withChangedClaimRecords(record, index + 1)
  );
  const leadOrder = (records: Agency[]) =>
    rankByPulseIqScore(records, (record) => record.zollOpportunity.pulseIqScore)
      .map((record) => record.id);

  assert.deepEqual(leadOrder(agencies), leadOrder(updatedClaimAgencies));
});

test('regional average PulseIQ ranking is unchanged by imported claim-record changes', () => {
  const agencies = [
    rankedAgency('wa-large', 'WA', 2400, 11),
    rankedAgency('wa-small', 'WA', 1200, 8),
    rankedAgency('tx-large', 'TX', 700, 6),
    rankedAgency('tx-small', 'TX', 100, 3)
  ];
  const updatedClaimAgencies = agencies.map((record, index) =>
    withChangedClaimRecords(record, index + 1)
  );
  const regionalRanks = (records: Agency[]) => {
    const byState = new Map<string, Agency[]>();
    for (const record of records) {
      const region = record.stateCode;
      byState.set(region, [...(byState.get(region) ?? []), record]);
    }
    const rows = [...byState.entries()].map(([stateCode, members]) => ({
      stateCode,
      score: Math.round(
        members.reduce((total, member) => total + member.zollOpportunity.pulseIqScore, 0) /
          members.length
      )
    }));
    return rankByPulseIqScore(rows, (row) => row.score).map((row) => row.stateCode);
  };

  assert.deepEqual(regionalRanks(agencies), regionalRanks(updatedClaimAgencies));
});

test('PulseIQ score ranking preserves original order for ties', () => {
  const tied = [{ id: 'first', score: 80 }, { id: 'second', score: 80 }];
  assert.deepEqual(rankByPulseIqScore(tied, (row) => row.score), tied);
});
