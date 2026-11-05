import assert from "node:assert/strict";
import test from "node:test";
import type { AgencyFactEvidence } from "../types";
import { hasMappedFactSource, hasReviewedFactEvidence } from "./agencyFactEvidence";

const sourceBase: AgencyFactEvidence = {
  reviewed: true,
  reviewedAt: new Date().toISOString(),
  sourceName: "Public data source",
  sourceUrl: "https://example.gov/source/record",
  sourceRecordId: "record-1",
};

test("regional evidence is not treated as agency fact evidence without a user association", () => {
  for (const geographicLevel of ["county", "state", "national"] as const) {
    const evidence: AgencyFactEvidence = {
      ...sourceBase,
      geographicLevel,
      geographicId: geographicLevel === "county" ? "12086" : geographicLevel,
    };
    assert.equal(hasMappedFactSource(evidence), false);
    assert.equal(hasReviewedFactEvidence(evidence), false);
  }
});

test("regional evidence requires both a relationship and user confirmation", () => {
  assert.equal(
    hasMappedFactSource({
      ...sourceBase,
      geographicLevel: "county",
      geographicId: "12086",
      geographicRelationship: "serves",
    }),
    false,
  );
  assert.equal(
    hasMappedFactSource({
      ...sourceBase,
      geographicLevel: "county",
      geographicId: "12086",
      geographicRelationship: "serves",
      geographicMatchBasis: "user-confirmed",
    }),
    true,
  );
});

test("agency-scoped and legacy unscoped mapped evidence remain available", () => {
  assert.equal(
    hasMappedFactSource({
      ...sourceBase,
      geographicLevel: "agency",
      geographicId: "agency-1",
    }),
    true,
  );
  assert.equal(hasMappedFactSource(sourceBase), true);
});
