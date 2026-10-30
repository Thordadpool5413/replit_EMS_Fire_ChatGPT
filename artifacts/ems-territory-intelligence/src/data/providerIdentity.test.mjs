import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hasVerifiedLegalGeography,
  hasVerifiedProviderIdentity,
  matchesExactLegalGeography,
} from "./providerIdentity.ts";

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
  assert.match(sanitizer, /if\s*\(hasVerifiedProviderIdentity\(agency\)\)/);
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
