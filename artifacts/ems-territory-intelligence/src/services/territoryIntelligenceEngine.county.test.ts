import assert from "node:assert/strict";
import test from "node:test";
import type { Agency } from "../types";
import { filterSavedAgencyRecordsForJurisdiction } from "../utils/countyAgencySelection";

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

  assert.deepEqual(
    filterSavedAgencyRecordsForJurisdiction([ruralProvider], "FL", "Brevard County"),
    [ruralProvider],
  );
  assert.deepEqual(
    filterSavedAgencyRecordsForJurisdiction([ruralProvider], "FL", "Brevard County", "Palm Bay"),
    [],
  );
});
