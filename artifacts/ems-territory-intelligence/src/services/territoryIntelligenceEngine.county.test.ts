import assert from "node:assert/strict";
import test from "node:test";
import type { Agency } from "../types";
import { territoryEngine } from "./territoryIntelligenceEngine";

test("county agency directories include county-matched providers outside the place-name list", () => {
  const ruralProvider = {
    id: "registry:fire:fl:county-test",
    name: "County Fire District",
    stateCode: "FL",
    county: "Brevard County",
    city: "Unincorporated Brevard",
    agencyType: "Fire Department",
    providerCategory: "FIRE",
  } as Agency;

  const result = territoryEngine.getAgenciesForCounty(
    "FL",
    "Brevard County",
    [ruralProvider],
    "all",
  );

  assert.deepEqual(result, [ruralProvider]);
});
