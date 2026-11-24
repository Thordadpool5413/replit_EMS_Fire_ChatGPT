import assert from "node:assert/strict";
import {
  EMS_JURISDICTION_SOURCE_COVERAGE,
  EMS_JURISDICTION_SOURCE_URLS,
} from "../artifacts/ems-territory-intelligence/src/data/stateEmsSourceCoverage.ts";

const expectedStateAndDistrictCodes = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
].sort();
const expectedTerritoryCodes = ["AS", "GU", "MP", "PR", "VI"].sort();
const actualCodes = EMS_JURISDICTION_SOURCE_COVERAGE.map((entry) => entry.code);

assert.equal(actualCodes.length, 56, "Expected 50 states, DC, and five territories");
assert.equal(new Set(actualCodes).size, actualCodes.length, "Jurisdiction codes must be unique");
assert.deepEqual(
  EMS_JURISDICTION_SOURCE_COVERAGE
    .filter((entry) => entry.level !== "territory")
    .map((entry) => entry.code)
    .sort(),
  expectedStateAndDistrictCodes,
  "Every state and DC must have an EMS source route",
);
assert.deepEqual(
  EMS_JURISDICTION_SOURCE_COVERAGE
    .filter((entry) => entry.level === "territory")
    .map((entry) => entry.code)
    .sort(),
  expectedTerritoryCodes,
  "Territories must be represented separately",
);

for (const entry of EMS_JURISDICTION_SOURCE_COVERAGE) {
  assert.ok(entry.name && entry.sourceName, `${entry.code} needs a label`);
  assert.ok(entry.sourceUrl.startsWith("https://"), `${entry.code} needs an HTTPS source`);
  assert.ok(entry.directoryUrl.startsWith("https://"), `${entry.code} needs an HTTPS discovery route`);
  assert.ok(entry.sourceScope && entry.matchKeys.length > 0, `${entry.code} needs scope and match keys`);
  assert.ok(entry.periodAndFreshness && entry.appConnection && entry.limitations, `${entry.code} needs provenance limits`);
}

const florida = EMS_JURISDICTION_SOURCE_COVERAGE.find((entry) => entry.code === "FL");
assert.equal(florida?.coverageStatus, "official-license-reference");
assert.equal(florida?.appConnection.includes("no automated"), true);
assert.equal(
  EMS_JURISDICTION_SOURCE_COVERAGE.filter((entry) => entry.coverageStatus === "official-license-reference").length,
  2,
  "Do not claim that unreviewed state licensing sources are mapped",
);
assert.equal(EMS_JURISDICTION_SOURCE_URLS.floridaMqaLicenseSearch, florida?.sourceUrl);

assert.equal(EMS_JURISDICTION_SOURCE_COVERAGE.find(entry=>entry.code==="VA")?.coverageStatus,"official-license-reference");
console.log("EMS source coverage checks passed: 50 states, DC, five territories, Florida and Virginia license routes.");
