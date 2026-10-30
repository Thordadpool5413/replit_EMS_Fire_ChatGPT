import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_SCORE_EVIDENCE_AGE_MS,
  REQUIRED_DIRECTORY_EVIDENCE_FIELDS,
  hasVerifiedNppesEvidence,
  hasCompleteVerifiedDirectoryProfile,
  hasVerifiedLegalGeography,
  hasVerifiedProviderIdentity,
  matchesExactLegalGeography,
} from "./providerIdentity.ts";
import { findExactFemaAfgAward } from "./femaAwardMatching.ts";
import {
  calculateScore,
  DEFAULT_WEIGHTS,
  explainAgencyScore,
  pulseIqBreakdownFromExplanation,
} from "./pulseIqScoring.ts";

function createVerifiedScoreProfile(overrides = {}) {
  const retrievedAt = new Date().toISOString();
  const verifiedFieldEvidence = Object.fromEntries(
    REQUIRED_DIRECTORY_EVIDENCE_FIELDS.map((field) => [
      field,
      {
        sourceUrl: "https://example.gov/records/provider",
        retrievedAt,
      },
    ]),
  );

  return {
    id: "agency-score-fixture",
    name: "Riverview Fire & Rescue",
    city: "Riverview",
    stateCode: "OR",
    county: "Riverview County",
    agencyType: "Fire Department",
    npiNumber: "1234567893",
    nppesOfficialName: "Riverview Fire & Rescue",
    nppesVerifiedCity: "Riverview",
    nppesVerifiedStateCode: "OR",
    isVerifiedRecord: true,
    verificationSource: "CMS NPPES NPI Registry",
    lastVerifiedAt: retrievedAt,
    annualCallVolume: 9000,
    annual911Transports: 6500,
    annualCardiacArrestCalls: 1800,
    utsteinSurvivalRate: 28.5,
    populationServed: 125000,
    cmsData: {
      claimDenialRate: 22,
      medicareBilledAnnual: 2800000,
      topDenialReasonCode: "CO-16",
    },
    installedFleet: {
      defibAgeYears: 9,
      defibBrand: "Stryker",
      billingSoftware: "Billing Suite",
      epcrCadSoftware: "ZOLL ePCR",
      defibUnitsCount: 12,
      defibWarrantyStatus: "Active",
    },
    grantStatus: {
      afgAwardAmount: 125000,
      afgAwarded: true,
      saferGrantActive: false,
      afgFiscalYear: 2025,
    },
    gisData: {
      avgTransportTimeMinutes: 18.2,
      publicAccessAedDeficitPct: 31,
      seniorPopulationPct: 17.5,
    },
    verifiedFieldEvidence,
    zollOpportunity: {
      pulseIqScore: 0,
      priorityTier: "Unavailable",
      primaryTargetProduct: "X Series",
      recommendedBundle: [],
      projectedPipelineValue: 0,
      clinicalBenefitNarrative: "",
      financialRoiNarrative: "",
      scoreRationale: "",
      scoreBreakdown: {
        clinicalAcuityPts: 0,
        fleetObsolescencePts: 0,
        cmsFinancialPts: 0,
        softwareWhitespacePts: 0,
        budgetGrantReadinessPts: 0,
      },
      salesStage: "New",
      probabilityPct: 0,
    },
    ...overrides,
  };
}

test("PulseIQ explains every factor using the calibrated default weights", () => {
  const explanation = explainAgencyScore(createVerifiedScoreProfile());

  assert.deepEqual(
    explanation.factors.map(({ id, componentScore, weightPct, pointsContributed }) => ({
      id,
      componentScore,
      weightPct,
      pointsContributed,
    })),
    [
      { id: "fleet", componentScore: 100, weightPct: 30, pointsContributed: 30 },
      { id: "cms", componentScore: 100, weightPct: 25, pointsContributed: 25 },
      { id: "cardiac", componentScore: 100, weightPct: 20, pointsContributed: 20 },
      { id: "grants", componentScore: 100, weightPct: 15, pointsContributed: 15 },
      { id: "software", componentScore: 35, weightPct: 10, pointsContributed: 3.5 },
    ],
  );
  assert.equal(
    Object.values(DEFAULT_WEIGHTS).reduce((sum, weight) => sum + weight, 0),
    100,
  );

  const factorTotal = explanation.factors.reduce(
    (sum, factor) => sum + factor.pointsContributed,
    0,
  );
  assert.equal(explanation.totalScore, Math.min(99, Math.max(30, Math.round(factorTotal))));
  assert.equal(calculateScore(createVerifiedScoreProfile()), explanation.totalScore);
});

test("custom PulseIQ weights calibrate contributions and preserve shared profile and chart mappings", async () => {
  const profile = createVerifiedScoreProfile();
  const weights = {
    fleetAgeWeight: 10,
    cmsDenialWeight: 20,
    cardiacVolumeWeight: 30,
    grantAwardWeight: 25,
    softwareWhitespaceWeight: 15,
  };
  const explanation = explainAgencyScore(profile, weights);
  const breakdown = pulseIqBreakdownFromExplanation(explanation);
  const sanitizer = await readFile(
    new URL("../services/dataSanitizationService.ts", import.meta.url),
    "utf8",
  );
  const regionalChart = await readFile(
    new URL("../components/PulseIqRegionalBreakdownChart.tsx", import.meta.url),
    "utf8",
  );
  const app = await readFile(
    new URL("../App.tsx", import.meta.url),
    "utf8",
  );

  assert.deepEqual(explanation.factors.map((factor) => factor.weightPct), [10, 20, 30, 25, 15]);
  assert.deepEqual(breakdown, {
    clinicalAcuityPts: 30,
    fleetObsolescencePts: 10,
    cmsFinancialPts: 20,
    softwareWhitespacePts: 5.3,
    budgetGrantReadinessPts: 25,
  });
  assert.match(sanitizer, /scoreBreakdown:\s*pulseIqBreakdownFromExplanation\(explanation\)/);
  assert.match(regionalChart, /pulseIqBreakdownFromExplanation\(explainAgencyScore\(agency,\s*weights\)\)/);
  assert.match(app, /pulseIqScore:\s*explanation\.totalScore[\s\S]*?scoreBreakdown:\s*pulseIqBreakdownFromExplanation\(explanation\)/);
});

test("incomplete or stale score evidence makes PulseIQ unavailable", () => {
  const profile = createVerifiedScoreProfile();
  const incompleteEvidence = { ...profile.verifiedFieldEvidence };
  delete incompleteEvidence["cmsData.claimDenialRate"];
  const staleEvidence = {
    ...profile.verifiedFieldEvidence,
    "cmsData.claimDenialRate": {
      sourceUrl: "https://example.gov/records/provider",
      retrievedAt: new Date(Date.now() - MAX_SCORE_EVIDENCE_AGE_MS - 1000).toISOString(),
    },
  };

  for (const candidate of [
    { ...profile, verifiedFieldEvidence: incompleteEvidence },
    { ...profile, verifiedFieldEvidence: staleEvidence },
  ]) {
    const explanation = explainAgencyScore(candidate);
    assert.equal(explanation.totalScore, 0);
    assert.equal(explanation.priorityTier, "Unavailable");
    assert.deepEqual(explanation.factors, []);
    assert.equal(calculateScore(candidate), 0);
  }
});

const agency = {
  name: "Riverview Fire & Rescue, Inc.",
  city: "Riverview",
  stateCode: "OR",
};

const registry = {
  legalName: "Riverview Fire & Rescue Inc.",
  city: "Riverview",
  stateCode: "OR",
};

test("accepts exact legal name and requested city/state", () => {
  assert.equal(matchesExactLegalGeography(agency, registry), true);
});

test("rejects aliases, missing geography, and wrong geography", () => {
  assert.equal(
    matchesExactLegalGeography(agency, {
      ...registry,
      legalName: "Riverview Fire Department",
    }),
    false,
  );
  assert.equal(
    matchesExactLegalGeography(agency, { ...registry, city: "" }),
    false,
  );
  assert.equal(
    matchesExactLegalGeography(agency, { ...registry, stateCode: "WA" }),
    false,
  );
});

test("requires saved NPPES source evidence before treating a profile as verified", () => {
  const matchedProfile = {
    name: "CITY OF AUSTIN",
    city: "Austin",
    stateCode: "TX",
    npiNumber: "1295704732",
    nppesOfficialName: "CITY OF AUSTIN",
    nppesVerifiedCity: "Austin",
    nppesVerifiedStateCode: "TX",
    isVerifiedRecord: true,
    verificationSource: "CMS NPPES NPI Registry",
    lastVerifiedAt: "2026-10-30T12:00:00.000Z",
  };

  assert.equal(hasVerifiedNppesEvidence(matchedProfile), true);
  assert.equal(
    hasVerifiedNppesEvidence({ ...matchedProfile, verificationSource: "Imported profile" }),
    false,
  );
  assert.equal(
    hasVerifiedNppesEvidence({ ...matchedProfile, lastVerifiedAt: undefined }),
    false,
  );
});

test("requires source evidence for every score-driving field", () => {
  const matchedProfile = {
    name: "CITY OF AUSTIN",
    city: "Austin",
    stateCode: "TX",
    npiNumber: "1295704732",
    nppesOfficialName: "CITY OF AUSTIN",
    nppesVerifiedCity: "Austin",
    nppesVerifiedStateCode: "TX",
    isVerifiedRecord: true,
    verificationSource: "CMS NPPES NPI Registry",
    lastVerifiedAt: "2026-10-30T12:00:00.000Z",
  };

  assert.equal(hasCompleteVerifiedDirectoryProfile(matchedProfile), false);

  const verifiedFieldEvidence = Object.fromEntries(
    [
      "annualCallVolume",
      "annual911Transports",
      "annualCardiacArrestCalls",
      "utsteinSurvivalRate",
      "populationServed",
      "cmsData.claimDenialRate",
      "cmsData.medicareBilledAnnual",
      "installedFleet.defibAgeYears",
      "installedFleet.defibBrand",
      "installedFleet.billingSoftware",
      "installedFleet.epcrCadSoftware",
      "installedFleet.defibUnitsCount",
      "installedFleet.defibWarrantyStatus",
      "grantStatus.afgAwardAmount",
      "grantStatus.afgAwarded",
      "grantStatus.saferGrantActive",
      "grantStatus.afgFiscalYear",
      "gisData.avgTransportTimeMinutes",
      "gisData.publicAccessAedDeficitPct",
      "gisData.seniorPopulationPct",
      "cmsData.topDenialReasonCode",
    ].map((field) => [
      field,
      {
        sourceUrl: "https://example.gov/records/1",
        retrievedAt: "2026-10-30T12:00:00.000Z",
      },
    ]),
  );

  assert.equal(
    hasCompleteVerifiedDirectoryProfile({
      ...matchedProfile,
      annualCallVolume: 9000,
      annual911Transports: 6500,
      annualCardiacArrestCalls: 95,
      utsteinSurvivalRate: 28.5,
      populationServed: 125000,
      cmsData: { claimDenialRate: 12.1, medicareBilledAnnual: 2800000 },
      installedFleet: {
        defibAgeYears: 5.2,
        defibBrand: "Model X",
        billingSoftware: "Billing Suite",
        epcrCadSoftware: "ePCR Suite",
        defibUnitsCount: 12,
        defibWarrantyStatus: "Active",
      },
      grantStatus: {
        afgAwardAmount: 125000,
        afgAwarded: true,
        saferGrantActive: false,
        afgFiscalYear: 2025,
      },
      gisData: {
        avgTransportTimeMinutes: 18.2,
        publicAccessAedDeficitPct: 31,
        seniorPopulationPct: 17.5,
      },
      cmsData: {
        claimDenialRate: 12.1,
        medicareBilledAnnual: 2800000,
        topDenialReasonCode: "CO-16",
      },
      verifiedFieldEvidence,
    }),
    true,
  );
  assert.equal(
    hasCompleteVerifiedDirectoryProfile({
      ...matchedProfile,
      verifiedFieldEvidence: {
        ...verifiedFieldEvidence,
        "cmsData.claimDenialRate": {
          sourceUrl: "",
          retrievedAt: "not-a-date",
        },
      },
    }),
    false,
  );
});

test("a verification label alone cannot confirm a provider identity", () => {
  assert.equal(
    hasVerifiedLegalGeography({
      ...agency,
      isVerifiedRecord: true,
      nppesOfficialName: registry.legalName,
    }),
    false,
  );
  assert.equal(
    hasVerifiedLegalGeography({
      ...agency,
      isVerifiedRecord: true,
      nppesOfficialName: registry.legalName,
      nppesVerifiedCity: "Riverview",
      nppesVerifiedStateCode: "OR",
    }),
    true,
  );
});

test("verified identity evidence also requires a valid NPI check digit", () => {
  const verified = {
    ...agency,
    npiNumber: "1234567893",
    isVerifiedRecord: true,
    nppesOfficialName: registry.legalName,
    nppesVerifiedCity: registry.city,
    nppesVerifiedStateCode: registry.stateCode,
  };
  assert.equal(hasVerifiedProviderIdentity(verified), true);
  assert.equal(
    hasVerifiedProviderIdentity({ ...verified, npiNumber: "1234567894" }),
    false,
  );
  assert.equal(
    hasVerifiedProviderIdentity({
      ...verified,
      nppesVerifiedStateCode: "WA",
    }),
    false,
  );
});

test("a missing award number cannot match two missing award numbers", () => {
  const agency = {
    name: "Riverview Fire & Rescue",
    grantStatus: { afgAwarded: true, afgAwardAmount: 100000, afgFiscalYear: 2025 },
    liveFemaAwards: [{
      awardNumber: "",
      grantee: "",
      programActivity: "Operations and Safety",
      federalShareAwarded: 100000,
      awardDate: "2025-06-01",
      programYear: 2025,
    }],
  };
  assert.equal(findExactFemaAfgAward(agency), undefined);
});

test("FEMA award matching requires the exact award number when provided", () => {
  const agency = {
    name: "Riverview Fire & Rescue",
    grantStatus: {
      afgAwarded: true,
      afgAwardAmount: 100000,
      afgFiscalYear: 2025,
      afgAwardNumber: "EMW-2025-FG-00001",
    },
    liveFemaAwards: [{
      awardNumber: "EMW-2025-FG-00002",
      grantee: "Riverview Fire & Rescue",
      programActivity: "Operations and Safety",
      federalShareAwarded: 100000,
      awardDate: "2025-06-01",
      programYear: 2025,
    }],
  };
  assert.equal(findExactFemaAfgAward(agency), undefined);
  const exact = {
    ...agency.liveFemaAwards[0],
    awardNumber: agency.grantStatus.afgAwardNumber,
  };
  assert.deepEqual(
    findExactFemaAfgAward({ ...agency, liveFemaAwards: [exact] }),
    exact,
  );
  assert.equal(
    findExactFemaAfgAward({
      ...agency,
      liveFemaAwards: [{ ...exact, grantee: "Different Recipient" }],
    }),
    undefined,
  );
});

test("fallback FEMA matching requires exact recipient, amount, year, and unique record", () => {
  const award = {
    awardNumber: "EMW-2025-FG-00001",
    grantee: "Riverview Fire & Rescue",
    programActivity: "Operations and Safety",
    federalShareAwarded: 100000,
    awardDate: "2025-06-01",
    programYear: 2025,
  };
  const agency = {
    name: "Riverview Fire & Rescue",
    grantStatus: { afgAwarded: true, afgAwardAmount: 100000, afgFiscalYear: 2025 },
    liveFemaAwards: [award],
  };
  assert.deepEqual(findExactFemaAfgAward(agency), award);
  assert.equal(
    findExactFemaAfgAward({
      ...agency,
      liveFemaAwards: [{ ...award, grantee: "Riverview Fire Department" }],
    }),
    undefined,
  );
  assert.equal(
    findExactFemaAfgAward({ ...agency, liveFemaAwards: [award, { ...award, awardNumber: "EMW-2025-FG-00003" }] }),
    undefined,
  );
});

test("county selection remains local and remote writes require confirmation", async () => {
  const hook = await readFile(
    new URL("../hooks/useFirestoreAgencies.ts", import.meta.url),
    "utf8",
  );
  const dashboard = await readFile(
    new URL("../components/DataHealthDashboard.tsx", import.meta.url),
    "utf8",
  );
  const profile = await readFile(
    new URL("../components/FocusedProviderProfile.tsx", import.meta.url),
    "utf8",
  );
  const firebase = await readFile(
    new URL("../utils/firebase.ts", import.meta.url),
    "utf8",
  );
  const sanitizer = await readFile(
    new URL("../services/dataSanitizationService.ts", import.meta.url),
    "utf8",
  );
  const countyEffect = hook.split("// 3. Add available jurisdiction records")[1]
    ?.split("// Toggle strict cloud-only mode")[0];

  assert.ok(countyEffect);
  assert.doesNotMatch(countyEffect, /saveAgencyToFirestore|batchSyncAgenciesToFirestore/);
  assert.match(hook, /if\s*\(confirmed\s*!==\s*true\)\s*return\s+0/);
  assert.match(hook, /if\s*\(confirmed\s*!==\s*true\)\s*return/);
  assert.match(sanitizer, /hasCompleteVerifiedDirectoryProfile\(agency\)/);
  assert.doesNotMatch(sanitizer, /Boolean\(agency\.npiNumber\)[\s\S]{0,80}live_federal_registry/);
  assert.match(dashboard, /window\.confirm[\s\S]*?onSyncSingleAgencyToCloud\(agency,\s*true\)/);
  assert.match(dashboard, /window\.confirm[\s\S]*?onHydrateBatchToCloud\(35,\s*true\)/);
  const providerVerification = profile
    .split("const triggerLiveVerification = async () =>")[1]
    ?.split("// Support browser Back button")[0];
  assert.ok(providerVerification);
  assert.doesNotMatch(
    providerVerification,
    /isOperationalDataVerified\s*:|isVerifiedEquipment\s*:|isVerifiedWarranty\s*:|isVerifiedContract\s*:|isCaresVerified\s*:/,
  );
  assert.doesNotMatch(firebase, /\bdeleteDoc\b|\bdeleteField\b|\.delete\s*\(/);
  assert.doesNotMatch(hook, /\bdeleteDoc\b|\bdeleteField\b|\.delete\s*\(/);
});
