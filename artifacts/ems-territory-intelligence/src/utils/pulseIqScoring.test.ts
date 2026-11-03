import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Agency } from '../types';
import { hasMappedAgencyFactEvidence, hasReviewedAgencyFactEvidence } from '../data/agencyFactEvidence';
import { AgencyComparisonPanel, buildAgencyComparisonCsv, sortAgenciesByPulseIq } from '../components/AgencyComparisonPanel';
import { PulseIqEstimateLabel, PulseIqMarkerEstimate } from '../components/PulseIqEstimateLabel';
import {
  HomeMapPulseIqReadout,
  MobileDashboardPulseIqScore,
  MobileProviderSelectorPulseIqScore,
  TerritoryMapPulseIqScore,
} from '../components/PulseIqSurfaceDisplays';
import { PulseIqProfileFactorDetails } from '../components/PulseIqProfileFactorDetails';
import { PulseIqScoreExplainerHub } from '../components/PulseIqScoreExplainerHub';
import { PulseIqTooltipFactorDetails } from '../components/PulseIqScoreTooltip';
import { PulseIqRegionalTooltipFactors } from '../components/PulseIqRegionalTooltipFactors';
import { PulseIqMethodologyFactors } from '../components/UnderstandingPulseIqModal';
import { PulseIqLeadFactorBars } from '../components/PulseIqLeadFactorBars';
import { explainAgencyScore } from './pulseIqExplanation';
import {
  calculatePulseIqContributions,
  calculateScore,
  DEFAULT_WEIGHTS,
  evaluatePulseIqFactors,
  getPulseIqFormula,
  getPulseIqWeightDetails
} from './pulseIqScoring';
import {
  getActivePulseIqScore,
  getPulseIqTerritoryRank,
  getPulseIqTerritoryRanks,
  isHighPriorityPulseIqAgency,
  rankAgenciesByPulseIqScore,
  rankByPulseIqScore
} from './pulseIqRanking';
import { isPulseIqScoreWithinRange } from './pulseIqRange';

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

const surfaceAgency = (score: number | undefined, overrides: Partial<Agency> = {}): Agency => ({
  id: 'pulseiq-surface-agency',
  name: 'PulseIQ Test EMS',
  agencyType: 'EMS',
  providerCategory: 'EMS',
  state: 'Florida',
  stateCode: 'FL',
  county: 'Orange',
  city: 'Orlando',
  zipCode: '32801',
  address: '1 Main Street',
  latitude: 28.5383,
  longitude: -81.3792,
  annualCardiacArrestCalls: 700,
  inDayRoute: false,
  isBookmarked: false,
  keyContacts: [],
  fieldNotes: [],
  competitorContract: { renewalWindowDays: 180, status: 'Active', vendor: 'Example' },
  installedFleet: { defibUnitsCount: 2, defibBrand: 'Example', defibAgeYears: 0 },
  cmsData: { medicareAllowedAnnual: 0, claimDenialRate: 0, estimatedRecoverableRevenue: 0 },
  zollOpportunity: {
    pulseIqScore: score,
    priorityTier: 'Maintained Account',
    salesStage: 'Target Lead',
    projectedPipelineValue: 0,
  },
  factEvidence: {},
  sourceFacts: [],
  ...overrides,
} as Agency);

const renderMobileDashboardScore = (score: number | undefined) => renderToStaticMarkup(
  React.createElement(MobileDashboardPulseIqScore, { agencyId: 'test-agency', score }),
);

const renderProviderSelectorScore = (score: number | undefined) => renderToStaticMarkup(
  React.createElement(MobileProviderSelectorPulseIqScore, { agencyId: 'test-agency', score }),
);

const renderHomeMapScore = (score: number | undefined) => renderToStaticMarkup(
  React.createElement(HomeMapPulseIqReadout, { score }),
);

const renderTerritoryMapDetails = (score: number | undefined) => renderToStaticMarkup(
  React.createElement(TerritoryMapPulseIqScore, { score }),
);

test('mobile and map surfaces display a valid zero score and distinguish a missing score', () => {
  const surfaces = [
    {
      name: 'mobile dashboard',
      render: renderMobileDashboardScore,
      scoreId: 'mobile-dashboard-pulseiq-score-test-agency',
      expectedZero: '>0</span>',
      expectedMissing: '>—</span>',
    },
    {
      name: 'provider selector',
      render: renderProviderSelectorScore,
      scoreId: 'provider-selector-pulseiq-score-test-agency',
      expectedZero: '>0</span>',
      expectedMissing: '>—</span>',
    },
  ];

  for (const surface of surfaces) {
    const zeroMarkup = surface.render(0);
    assert.match(zeroMarkup, /PulseIQ estimate/, `${surface.name} should retain the estimate label`);
    assert.match(zeroMarkup, new RegExp(`data-testid="${surface.scoreId}"[^>]*${surface.expectedZero}`));

    const missingMarkup = surface.render(undefined);
    assert.match(missingMarkup, /PulseIQ estimate/, `${surface.name} should retain the estimate label when missing`);
    assert.match(missingMarkup, new RegExp(`data-testid="${surface.scoreId}"[^>]*${surface.expectedMissing}`));
  }

  const zeroHomeMap = renderHomeMapScore(0);
  assert.match(zeroHomeMap, /PulseIQ estimate · modeled average/);
  assert.match(zeroHomeMap, /data-testid="home-map-pulseiq-readout-value"[^>]*>0\/100</);
  const missingHomeMap = renderHomeMapScore(undefined);
  assert.match(missingHomeMap, /data-testid="home-map-pulseiq-readout-value"[^>]*>Not reported</);

  for (const [score, expected] of [[0, '0/100'], [undefined, '—']] as const) {
    const detailsMarkup = renderTerritoryMapDetails(score);
    assert.match(detailsMarkup, /PulseIQ estimate/);
    assert.ok(detailsMarkup.includes(expected), `territory map details should show ${expected}`);
  }

  const zeroMarkerMarkup = renderToStaticMarkup(
    React.createElement(PulseIqMarkerEstimate, { agencyId: 'zero-agency', score: 0 }),
  );
  assert.match(zeroMarkerMarkup, /PulseIQ estimate/);
  assert.match(zeroMarkerMarkup, /aria-label="PulseIQ estimate: 0\/100"/);
  assert.match(zeroMarkerMarkup, />0\/100</);

  const missingMarkerMarkup = renderToStaticMarkup(
    React.createElement(PulseIqMarkerEstimate, { agencyId: 'missing-agency', score: undefined }),
  );
  assert.match(missingMarkerMarkup, /aria-label="PulseIQ estimate: Not reported"/);
  assert.match(missingMarkerMarkup, />Not reported</);

  const compactMissingMarkerMarkup = renderToStaticMarkup(
    React.createElement(PulseIqMarkerEstimate, {
      agencyId: 'compact-missing-agency',
      score: undefined,
      compact: true,
    }),
  );
  assert.match(compactMissingMarkerMarkup, /PulseIQ estimate/);
  assert.match(compactMissingMarkerMarkup, /aria-label="PulseIQ estimate: Not reported"/);
  assert.match(compactMissingMarkerMarkup, />Not reported</);
});

test('PulseIQ map range includes zero and excludes missing or invalid scores when active', () => {
  assert.equal(isPulseIqScoreWithinRange(0, 0, 0), true);
  assert.equal(isPulseIqScoreWithinRange(1, 0, 0), false);
  assert.equal(isPulseIqScoreWithinRange(50, 40, 60), true);
  assert.equal(isPulseIqScoreWithinRange(39, 40, 60), false);
  assert.equal(isPulseIqScoreWithinRange(undefined, 0, 100), false);
  assert.equal(isPulseIqScoreWithinRange(null, 0, 100), false);
  assert.equal(isPulseIqScoreWithinRange(Number.NaN, 0, 100), false);
  assert.equal(isPulseIqScoreWithinRange(undefined, null, null), true);
});

test('unmapped factors and changed claim evidence do not hide or change displayed PulseIQ scores', () => {
  const unmappedRecord = {
    ...agency(0, 0),
    ...surfaceAgency(undefined),
    factEvidence: {},
  } as Agency;
  const importedClaimsRecord = {
    ...unmappedRecord,
    cmsData: { claimDenialRate: 98, estimatedRecoverableRevenue: 99000000 },
    factEvidence: {
      cmsClaims: {
        sourceName: 'Imported claim records',
        sourceRecordId: 'claim-records-1',
        sourceKind: 'manual',
        note: 'Imported claim records',
        reviewed: true,
        reviewedAt: new Date().toISOString(),
      },
    },
  } as Agency;
  const scoreWithoutClaims = calculateScore(unmappedRecord);
  const scoreWithClaims = calculateScore(importedClaimsRecord);
  assert.equal(scoreWithClaims, scoreWithoutClaims);

  const formatSurfaceScore = (record: Agency) => {
    const dashboard = renderMobileDashboardScore(record.zollOpportunity?.pulseIqScore);
    const providerSelector = renderProviderSelectorScore(record.zollOpportunity?.pulseIqScore);
    const homeMap = renderHomeMapScore(record.zollOpportunity?.pulseIqScore);
    const territoryMap = renderTerritoryMapDetails(record.zollOpportunity?.pulseIqScore);
    return [dashboard, providerSelector, homeMap, territoryMap];
  };
  const baselineMarkup = formatSurfaceScore({
    ...unmappedRecord,
    zollOpportunity: { ...unmappedRecord.zollOpportunity, pulseIqScore: scoreWithoutClaims },
  });
  const claimsMarkup = formatSurfaceScore({
    ...importedClaimsRecord,
    zollOpportunity: { ...importedClaimsRecord.zollOpportunity, pulseIqScore: scoreWithClaims },
  });

  for (const [index, surfaceMarkup] of baselineMarkup.entries()) {
    assert.match(surfaceMarkup, /PulseIQ estimate/);
    assert.equal(surfaceMarkup, claimsMarkup[index], 'claim evidence should not change any rendered score surface');
    assert.ok(surfaceMarkup.includes(String(scoreWithoutClaims)));
  }
});

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

test('agency comparisons and CSV keep the PulseIQ estimate label without citations', () => {
  const record = {
    id: 'comparison-no-citation',
    name: 'Example EMS',
    agencyType: 'EMS',
    stateCode: 'WA',
    city: 'Example',
    fdid: '12345',
    factEvidence: {},
    sourceFacts: [],
    zollOpportunity: { pulseIqScore: 0 },
  } as unknown as Agency;
  const markup = renderToStaticMarkup(
    React.createElement(AgencyComparisonPanel, {
      agencies: [record],
      onClose: () => {},
      onRemoveAgency: () => {},
      onOpenProfile: () => {},
    }),
  );
  const estimateCell = markup.match(/data-testid="comparison-value-comparison-no-citation-pulseIqEstimate-pulseiq-estimate"[^>]*>(.*?)<\/div>/s)?.[1];
  assert.ok(estimateCell);
  assert.match(estimateCell, /PulseIQ estimate/);
  assert.match(estimateCell, />0</);

  const csv = buildAgencyComparisonCsv([record], 'all');
  assert.match(csv, /"PulseIQ estimate","0","\/ 100","\[\]"/);
});

test('comparison CSV includes the active PulseIQ weights and formula', () => {
  const weights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 10,
    cardiacVolumeWeight: 50,
    grantAwardWeight: 30,
    softwareWhitespaceWeight: 10,
  };
  const csv = buildAgencyComparisonCsv([], 'all', weights);
  const { factors } = getPulseIqWeightDetails(weights);
  const expectedWeights = JSON.stringify(factors.map(({ key, label, weight, weightPct }) => ({
    key,
    factor: label,
    weight,
    normalizedWeightPct: weightPct,
  })));

  assert.match(csv, /"Calibration status","Active weights supplied by the app"/);
  assert.ok(csv.includes(`"Active factor weights","${expectedWeights.replaceAll('"', '""')}"`));
  assert.ok(csv.includes(`"Score formula","${getPulseIqFormula(weights)}"`));
});

test('comparison CSV states when PulseIQ calibration context is missing', () => {
  const csv = buildAgencyComparisonCsv([], 'all');

  assert.match(csv, /"Calibration status","Not available; active calibration was not supplied"/);
  assert.match(csv, /"Active factor weights","Not available"/);
  assert.match(csv, /"Score formula","Not available"/);
});

test('agency comparison sorts PulseIQ estimates in either direction and keeps missing values last', () => {
  const records = [
    { id: 'missing', name: 'Missing score', zollOpportunity: {} },
    { id: 'high', name: 'High score', zollOpportunity: { pulseIqScore: 90 } },
    { id: 'zero', name: 'Zero score', zollOpportunity: { pulseIqScore: 0 } },
    { id: 'invalid', name: 'Invalid score', zollOpportunity: { pulseIqScore: Number.NaN } },
    { id: 'also-high', name: 'Also high', zollOpportunity: { pulseIqScore: 90 } },
  ] as unknown as Agency[];

  assert.deepEqual(sortAgenciesByPulseIq(records, 'pulseIqDesc').map(({ id }) => id), [
    'high', 'also-high', 'zero', 'missing', 'invalid',
  ]);
  assert.deepEqual(sortAgenciesByPulseIq(records, 'pulseIqAsc').map(({ id }) => id), [
    'zero', 'high', 'also-high', 'missing', 'invalid',
  ]);
  assert.deepEqual(sortAgenciesByPulseIq(records, 'selection').map(({ id }) => id), [
    'missing', 'high', 'zero', 'invalid', 'also-high',
  ]);

  const sortedCsvRows = buildAgencyComparisonCsv(sortAgenciesByPulseIq(records, 'pulseIqDesc'), 'all')
    .split('\r\n')
    .filter((line) => line.includes('"PulseIQ estimate"'));
  assert.deepEqual(sortedCsvRows.map((line) => line.split(',')[0]), [
    '"High score"',
    '"Also high"',
    '"Zero score"',
    '"Missing score"',
    '"Invalid score"',
  ]);
  assert.match(sortedCsvRows[3], /"Not reported"/);
  assert.match(sortedCsvRows[4], /"Not reported"/);
});

test('phone comparison uses a field-first layout and keeps controls within the viewport', () => {
  const records = [
    {
      id: 'phone-compare-a',
      name: 'North Valley EMS',
      agencyType: 'EMS',
      city: 'North Valley',
      stateCode: 'WA',
      fdid: '123',
      address: '10 Main Street',
      factEvidence: {},
      sourceFacts: [],
    },
    {
      id: 'phone-compare-b',
      name: 'South Valley Fire and Rescue',
      agencyType: 'Fire',
      city: 'South Valley',
      stateCode: 'WA',
      fdid: '456',
      address: '20 Main Street',
      factEvidence: {},
      sourceFacts: [],
    },
  ] as unknown as Agency[];
  const markup = renderToStaticMarkup(
    React.createElement(AgencyComparisonPanel, {
      agencies: records,
      onClose: () => {},
      onRemoveAgency: () => {},
      onOpenProfile: () => {},
    }),
  );

  assert.match(markup, /data-testid="comparison-mobile-layout"/);
  assert.match(markup, /data-testid="comparison-mobile-row-providerAddress-address"/);
  assert.match(markup, /class="[^"]*grid-cols-3[^"]*"[^>]*data-testid="comparison-filter-controls"/);
  assert.match(markup, /data-testid="comparison-filter-all"[^>]*>.*?<span class="sm:hidden">All<\/span>/);
  assert.match(markup, /data-testid="comparison-filter-shared"[^>]*>.*?<span class="sm:hidden">Shared<\/span>/);
  assert.match(markup, /aria-label="Sort selected agencies"[^>]*data-testid="comparison-sort"/);
  assert.match(markup, /<option value="pulseIqDesc">PulseIQ highest first<\/option>/);
  assert.match(markup, /<option value="pulseIqAsc">PulseIQ lowest first<\/option>/);
  assert.match(markup, /class="[^"]*w-full[^"]*sm:w-auto[^"]*"[^>]*data-testid="button-export-comparison"/);
});

test('comparison CSV attaches source and period details to the matching field', () => {
  const record = {
    id: 'source-evidence-agency',
    name: 'Evidence County EMS',
    agencyType: 'EMS',
    address: '12 Main Street',
    factEvidence: {
      providerAddress: {
        sourceName: 'County Assessor',
        sourceRecordId: 'parcel-42',
        sourceUrl: 'https://example.org/parcel/42',
        reportingPeriod: '2025 assessment',
        geographicLevel: 'county',
        geographicId: '53033',
        geographicRelationship: 'agency location',
        geographicMatchBasis: 'source-id',
      },
    },
    sourceFacts: [
      {
        id: 'source-address-1',
        fieldKey: 'providerAddress',
        value: '12 Main Street',
        sourceName: 'County address roster',
        sourceRecordId: 'row-17',
        sourceUrl: 'https://example.org/roster/17',
        reportingPeriod: '2024 roster',
        effectivePeriod: '2024-01 through 2024-12',
        geographicLevel: 'county',
        geographicId: '53033',
        geographicRelationship: 'agency location',
        basis: 'source-reported',
        enteredAt: '2025-01-15T00:00:00.000Z',
      },
    ],
  } as unknown as Agency;

  const csv = buildAgencyComparisonCsv([record], 'all');
  const addressRow = csv.split('\r\n').find((line) => line.includes('"Address"'));

  assert.ok(addressRow);
  assert.match(addressRow, /"Identity & location","Address","12 Main Street"/);
  assert.match(addressRow, /""fieldKey"":""providerAddress""/);
  assert.match(addressRow, /""source"":""County Assessor""/);
  assert.match(addressRow, /""reportingPeriod"":""2025 assessment""/);
  assert.match(addressRow, /""source"":""County address roster""/);
  assert.match(addressRow, /""reportingPeriod"":""2024 roster""/);
  assert.match(addressRow, /""effectivePeriod"":""2024-01 through 2024-12""/);
  assert.doesNotMatch(addressRow, /annual volume|Annual call volume/i);
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

test('lead-card bars use shared factor scores and recalibrated weighted contributions', () => {
  const record = agency(35, 500000);
  const defaultMarkup = renderToStaticMarkup(
    React.createElement(PulseIqLeadFactorBars, { agency: record })
  );
  const calibratedWeights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 10,
    cardiacVolumeWeight: 50,
    grantAwardWeight: 30,
    softwareWhitespaceWeight: 10
  };
  const calibratedMarkup = renderToStaticMarkup(
    React.createElement(PulseIqLeadFactorBars, {
      agency: record,
      weights: calibratedWeights
    })
  );
  const defaultClinical = evaluatePulseIqFactors(record).find((factor) => factor.key === 'clinical')!;
  const calibratedClinical = evaluatePulseIqFactors(record, calibratedWeights)
    .find((factor) => factor.key === 'clinical')!;

  assert.equal(defaultClinical.baseScore, calibratedClinical.baseScore);
  assert.notEqual(defaultClinical.contributionPts, calibratedClinical.contributionPts);
  assert.match(defaultMarkup, /Score 70\/100/);
  assert.match(defaultMarkup, new RegExp(`\\+${defaultClinical.contributionPts.toFixed(1)} pts`));
  assert.match(calibratedMarkup, /Score 70\/100/);
  assert.match(calibratedMarkup, new RegExp(`\\+${calibratedClinical.contributionPts.toFixed(1)} pts`));
  assert.match(defaultMarkup, /Bars show weighted points; scores are unweighted/);
  assert.match(calibratedMarkup, new RegExp(`width:${calibratedClinical.contributionPts}%`));
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

test('custom PulseIQ weights stay aligned in profile, tooltip, regional, and methodology views', () => {
  const record = agency(82, 750000);
  const weights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 10,
    cardiacVolumeWeight: 50,
    grantAwardWeight: 30,
    softwareWhitespaceWeight: 10,
    cmsDenialWeight: 500
  };
  const factors = evaluatePulseIqFactors(record, weights);
  const explanation = explainAgencyScore(record, weights);
  const formula = getPulseIqFormula(weights);
  const expectedKeys = ['fleet', 'clinical', 'grant', 'software'];

  assert.deepEqual(factors.map((factor) => factor.key), expectedKeys);
  assert.deepEqual(explanation.factors.map((factor) => factor.id), expectedKeys);
  assert.equal(explanation.totalScore, calculateScore(record, weights));

  const profileMarkup = renderToStaticMarkup(
    React.createElement(PulseIqProfileFactorDetails, {
      explanation,
      weights,
      variant: 'full'
    })
  );
  const tooltipMarkup = renderToStaticMarkup(
    React.createElement(PulseIqTooltipFactorDetails, {
      explanation,
      score: explanation.totalScore,
      weights
    })
  );
  const contributions = calculatePulseIqContributions(record, weights);
  const regionalMarkup = renderToStaticMarkup(
    React.createElement(PulseIqRegionalTooltipFactors, {
      weights,
      values: {
        clinicalAcuity: contributions.clinicalAcuityPts,
        fleetObsolescence: contributions.fleetObsolescencePts,
        budgetGrant: contributions.budgetGrantReadinessPts,
        softwareWhitespace: contributions.softwareWhitespacePts
      }
    })
  );
  const methodologyMarkup = renderToStaticMarkup(
    React.createElement(PulseIqMethodologyFactors, { weights })
  );

  for (const markup of [profileMarkup, tooltipMarkup, regionalMarkup, methodologyMarkup]) {
    assert.ok(markup.includes(formula), 'view should show the active PulseIQ formula');
    for (const factor of factors) {
      assert.ok(markup.includes(factor.label), `${factor.key} should be visible`);
      assert.ok(
        markup.includes(`${factor.weightPct.toFixed(1)}%`),
        `${factor.key} should show the normalized active weight`
      );
    }
    assert.doesNotMatch(markup, /claims? factor|CMS denial factor/i);
  }

  for (let index = 0; index < factors.length; index++) {
    const factor = factors[index];
    const profileContribution = `+${factor.contributionPts} Points`;
    const tooltipContribution = `+${factor.contributionPts.toFixed(1)} pts`;
    const regionalContribution = `+${factor.contributionPts} pts`;
    assert.ok(profileMarkup.includes(profileContribution), `${factor.key} profile contribution should match`);
    assert.ok(tooltipMarkup.includes(tooltipContribution), `${factor.key} tooltip contribution should match`);
    assert.ok(regionalMarkup.includes(regionalContribution), `${factor.key} regional contribution should match`);
    assert.equal(explanation.factors[index].pointsContributed, factor.contributionPts);
  }

  assert.ok(methodologyMarkup.includes('Active weight: 10'));
  assert.ok(methodologyMarkup.includes('Active weight: 50'));
  assert.ok(methodologyMarkup.includes('Active weight: 30'));
  assert.ok(methodologyMarkup.includes('Medicare claim records'));
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

const recalibrationAgency = (
  id: string,
  annualCardiacArrestCalls: number,
  defibAgeYears: number,
  persistedScore: number
): Agency => {
  const template = agency(0, 0);
  return {
    ...template,
    id,
    annualCardiacArrestCalls,
    installedFleet: {
      ...template.installedFleet,
      defibAgeYears
    },
    zollOpportunity: { pulseIqScore: persistedScore }
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

test('lead queue ordering recalculates with active calibration instead of persisted scores', () => {
  const fleetDriven = [
    recalibrationAgency('clinical-lead', 1800, 3, 98),
    recalibrationAgency('fleet-lead', 100, 10, 1)
  ];
  const fleetWeights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 100,
    cardiacVolumeWeight: 0,
    grantAwardWeight: 0,
    softwareWhitespaceWeight: 0
  };
  const clinicalWeights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 0,
    cardiacVolumeWeight: 100,
    grantAwardWeight: 0,
    softwareWhitespaceWeight: 0
  };

  const queueScores = (weights: typeof fleetWeights) =>
    rankAgenciesByPulseIqScore(fleetDriven, weights).map((record) => ({
      id: record.id,
      score: getActivePulseIqScore(record, weights)
    }));
  const fleetQueue = queueScores(fleetWeights);
  const clinicalQueue = queueScores(clinicalWeights);

  assert.deepEqual(fleetQueue.map(({ id }) => id), ['fleet-lead', 'clinical-lead']);
  assert.deepEqual(clinicalQueue.map(({ id }) => id), ['clinical-lead', 'fleet-lead']);
  assert.deepEqual(fleetQueue, [
    { id: 'fleet-lead', score: 99 },
    { id: 'clinical-lead', score: 40 }
  ]);
  assert.deepEqual(clinicalQueue, [
    { id: 'clinical-lead', score: 99 },
    { id: 'fleet-lead', score: 50 }
  ]);
  for (const { id, score } of [...fleetQueue, ...clinicalQueue]) {
    const record = fleetDriven.find((agency) => agency.id === id)!;
    assert.notEqual(score, record.zollOpportunity.pulseIqScore, 'queue scores must not fall back to stale saved values');
  }
  assert.notDeepEqual(
    fleetQueue.map(({ id, score }) => [id, score]),
    clinicalQueue.map(({ id, score }) => [id, score]),
    'recalibration should change both displayed score values and their order'
  );
});

test('lead queue high-priority membership uses the active score and recalculates with weights', () => {
  const record = recalibrationAgency('calibrated-priority', 1800, 3, 99);
  const fleetWeights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 100,
    cardiacVolumeWeight: 0,
    grantAwardWeight: 0,
    softwareWhitespaceWeight: 0
  };
  const clinicalWeights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 0,
    cardiacVolumeWeight: 100,
    grantAwardWeight: 0,
    softwareWhitespaceWeight: 0
  };

  assert.deepEqual(
    [record].filter((agency) => isHighPriorityPulseIqAgency(agency, fleetWeights)).map((agency) => agency.id),
    []
  );
  assert.deepEqual(
    [record].filter((agency) => isHighPriorityPulseIqAgency(agency, clinicalWeights)).map((agency) => agency.id),
    ['calibrated-priority']
  );
});

test('lead queue ranking uses shared stable ordering when active scores tie', () => {
  const first = recalibrationAgency('first-tie', 1800, 10, 0);
  const second = recalibrationAgency('second-tie', 1800, 10, 99);
  const below = recalibrationAgency('below-tie', 100, 3, 99);
  const clinicalWeights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 0,
    cardiacVolumeWeight: 100,
    grantAwardWeight: 0,
    softwareWhitespaceWeight: 0
  };

  assert.deepEqual(
    rankAgenciesByPulseIqScore([first, second, below], clinicalWeights).map((record) => record.id),
    ['first-tie', 'second-tie', 'below-tie']
  );
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

test('PulseIQ territory rank shares ties and uses the ranking zero fallback for missing scores', () => {
  const tied = [
    { id: 'first', score: 90 },
    { id: 'second', score: 90 },
    { id: 'third', score: 40 }
  ];
  assert.deepEqual(
    getPulseIqTerritoryRank(tied, (row) => row.score, (row) => row.id === 'second'),
    { rank: 1, total: 3, tiedCount: 2, topPercent: 66.67 }
  );

  const missingScore = [
    { id: 'missing', score: Number.NaN },
    { id: 'negative', score: -1 }
  ];
  assert.deepEqual(
    getPulseIqTerritoryRank(missingScore, (row) => row.score, (row) => row.id === 'missing'),
    { rank: 1, total: 2, tiedCount: 1, topPercent: 50 }
  );
});

test('regional PulseIQ ranks share tie-aware top percentages across the full peer set', () => {
  const regions = [
    { id: 'first', score: 90 },
    { id: 'tied', score: 90 },
    { id: 'third', score: 70 },
    { id: 'missing', score: Number.NaN }
  ];
  const ranks = getPulseIqTerritoryRanks(regions, (region) => region.score);

  assert.deepEqual(ranks.get(regions[0]), {
    rank: 1,
    total: 4,
    tiedCount: 2,
    topPercent: 50
  });
  assert.deepEqual(ranks.get(regions[1]), ranks.get(regions[0]));
  assert.deepEqual(ranks.get(regions[2]), {
    rank: 3,
    total: 4,
    tiedCount: 1,
    topPercent: 75
  });
  assert.deepEqual(ranks.get(regions[3]), {
    rank: 4,
    total: 4,
    tiedCount: 1,
    topPercent: 100
  });
  assert.equal(getPulseIqTerritoryRanks([], () => 1).size, 0);
});

test('compact PulseIQ explainer ranks against current agencies and recalibrated weights', () => {
  const target = {
    ...agency(0, 0),
    id: 'target',
    annualCardiacArrestCalls: 100,
    installedFleet: { ...agency(0, 0).installedFleet, defibAgeYears: 8 }
  } as Agency;
  const competitorA = {
    ...agency(0, 0),
    id: 'competitor-a',
    annualCardiacArrestCalls: 1800,
    installedFleet: { ...agency(0, 0).installedFleet, defibAgeYears: 4 }
  } as Agency;
  const competitorB = { ...competitorA, id: 'competitor-b' } as Agency;
  const higherCompetitor = {
    ...competitorA,
    id: 'higher-competitor',
    installedFleet: { ...competitorA.installedFleet, defibAgeYears: 9 }
  } as Agency;
  const agencies = [target, competitorA, competitorB];
  const fleetWeights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 100,
    cardiacVolumeWeight: 0,
    grantAwardWeight: 0,
    softwareWhitespaceWeight: 0
  };
  const clinicalWeights = {
    ...DEFAULT_WEIGHTS,
    fleetAgeWeight: 0,
    cardiacVolumeWeight: 100,
    grantAwardWeight: 0,
    softwareWhitespaceWeight: 0
  };

  const markupWithFleetWeights = renderToStaticMarkup(
    React.createElement(PulseIqScoreExplainerHub, {
      agency: target,
      agencies,
      weights: fleetWeights,
      variant: 'compact'
    })
  );
  const markupWithClinicalWeights = renderToStaticMarkup(
    React.createElement(PulseIqScoreExplainerHub, {
      agency: target,
      agencies,
      weights: clinicalWeights,
      variant: 'compact'
    })
  );
  const markupWithExpandedAgencySet = renderToStaticMarkup(
    React.createElement(PulseIqScoreExplainerHub, {
      agency: target,
      agencies: [...agencies, higherCompetitor],
      weights: fleetWeights,
      variant: 'compact'
    })
  );

  assert.match(markupWithFleetWeights, /Territory rank: #1 of 3 · Top 33\.33%/);
  assert.match(markupWithClinicalWeights, /Territory rank: #3 of 3 · Top 100%/);
  assert.match(markupWithExpandedAgencySet, /Territory rank: #2 of 4 · Top 50%/);
});
