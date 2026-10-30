import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hasVerifiedNppesEvidence,
  hasCompleteVerifiedDirectoryProfile,
  hasVerifiedLegalGeography,
  hasVerifiedProviderIdentity,
  matchesExactLegalGeography,
} from "./providerIdentity.ts";
import { findExactFemaAfgAward } from "./femaAwardMatching.ts";

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
