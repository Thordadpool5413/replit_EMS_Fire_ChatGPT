import assert from "node:assert/strict";
import test from "node:test";
import {
  findAgencySourceRecordAssociation,
  loadAgencySourceRecordData,
  replaceAgencySourceRecordAssociation,
  saveAgencySourceRecordData,
} from "./agencySourceRecordStore";
import type {
  AgencySourceFact,
  AgencySourceRecordAssociation,
} from "../types";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

const association: AgencySourceRecordAssociation = {
  id: "NERIS:neris-123",
  sourceName: "NERIS",
  sourceRecordId: "neris-123",
  sourceUrl: "https://example.gov/record/neris-123",
  decision: "confirmed",
  matchBasis: "Name and city reviewed by the user.",
  sourceDate: "2025-10-01",
  retrievedAt: "2026-11-01T12:00:00.000Z",
  decidedAt: "2026-11-01T12:01:00.000Z",
  sourceFields: {
    agencyName: "Example Fire Department",
    stationCount: 2,
  },
};

const fact: AgencySourceFact = {
  id: "fact-1",
  fieldKey: "annualEmergencyVolume",
  value: "1,234",
  unit: "calls",
  sourceName: "Agency annual report",
  sourceRecordId: "report-2025-page-4",
  sourceUrl: "https://example.gov/annual-report",
  reportingPeriod: "FY2025",
  geographicLevel: "agency",
  geographicId: "agency-1",
  basis: "source-reported",
  enteredAt: "2026-11-01T12:05:00.000Z",
};

test("persists source decisions and scoped facts independently by agency", () => {
  const storage = memoryStorage();
  const saved = saveAgencySourceRecordData(
    "agency-1",
    {
      sourceRecordAssociations: [association],
      sourceFacts: [fact],
    },
    storage,
  );

  assert.deepEqual(saved, { ok: true });
  assert.deepEqual(loadAgencySourceRecordData(storage)["agency-1"], {
    sourceRecordAssociations: [association],
    sourceFacts: [fact],
  });
  assert.equal(loadAgencySourceRecordData(storage)["agency-2"], undefined);
});

test("keeps an explicit rejected candidate as a review decision", () => {
  const storage = memoryStorage();
  const rejected = { ...association, decision: "rejected" as const };
  const saved = saveAgencySourceRecordData(
    "agency-1",
    { sourceRecordAssociations: [rejected], sourceFacts: [] },
    storage,
  );

  assert.deepEqual(saved, { ok: true });
  assert.equal(
    loadAgencySourceRecordData(storage)["agency-1"]
      .sourceRecordAssociations[0]?.decision,
    "rejected",
  );
});

test("keeps name-similar candidates unlinked until an exact source ID is decided", () => {
  const associations: AgencySourceRecordAssociation[] = [];

  assert.equal(
    findAgencySourceRecordAssociation(
      associations,
      "NERIS",
      "possible-name-match",
    ),
    undefined,
  );

  const decided = replaceAgencySourceRecordAssociation(associations, association);
  assert.equal(
    findAgencySourceRecordAssociation(
      decided,
      "NERIS",
      "neris-123",
    )?.decision,
    "confirmed",
  );
  assert.equal(
    findAgencySourceRecordAssociation(
      decided,
      "NERIS",
      "different-source-record",
    ),
    undefined,
  );
});

test("rejects insecure source links instead of persisting them", () => {
  const storage = memoryStorage();
  const saved = saveAgencySourceRecordData(
    "agency-1",
    {
      sourceRecordAssociations: [
        { ...association, sourceUrl: "http://example.gov/record" },
      ],
      sourceFacts: [],
    },
    storage,
  );

  assert.equal(saved.ok, false);
  assert.deepEqual(loadAgencySourceRecordData(storage), {});
});
