import test from "node:test";
import assert from "node:assert/strict";
import {
  getAgencyProfileReviewedAt,
  loadAgencyProfileReviewMap,
  saveAgencyProfileReviewedAt,
} from "./agencyProfileReviewStore";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("stores a browser-local review timestamp without changing other agency reviews", () => {
  const storage = new MemoryStorage();
  const reviewedAt = "2026-11-04T12:00:00.000Z";

  assert.equal(saveAgencyProfileReviewedAt("agency-1", reviewedAt, storage), true);
  assert.equal(saveAgencyProfileReviewedAt("agency-2", reviewedAt, storage), true);
  assert.equal(getAgencyProfileReviewedAt("agency-1", storage), reviewedAt);
  assert.deepEqual(loadAgencyProfileReviewMap(storage), {
    "agency-1": reviewedAt,
    "agency-2": reviewedAt,
  });
});

test("ignores malformed review data and rejects unsafe IDs or timestamps", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "ems_territory_profile_reviews_v1",
    JSON.stringify({
      "agency-1": "not a date",
      "__proto__": "2026-11-04T12:00:00.000Z",
      "agency-2": "2026-11-04T12:00:00.000Z",
    }),
  );

  assert.deepEqual(loadAgencyProfileReviewMap(storage), {
    "agency-2": "2026-11-04T12:00:00.000Z",
  });
  assert.equal(
    saveAgencyProfileReviewedAt("constructor", "2026-11-04T12:00:00.000Z", storage),
    false,
  );
  assert.equal(saveAgencyProfileReviewedAt("agency-3", "invalid", storage), false);
});

test("reports unavailable storage rather than implying a review was saved", () => {
  assert.equal(saveAgencyProfileReviewedAt("agency-1", undefined, undefined), false);
});
