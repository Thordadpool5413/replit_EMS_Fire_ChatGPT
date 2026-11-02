import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAgencySourceRecordDataMap,
  findAgencySourceRecordAssociation,
  loadAgencySourceRecordData,
  replaceAgencySourceRecordAssociation,
  saveAgencySourceRecordData,
  stripBrowserLocalAgencySourceData,
} from "./agencySourceRecordStore";
import type {
  Agency,
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

test("rehydrates local source evidence onto a refreshed agency record", () => {
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

  const refreshedCloudAgency = stripBrowserLocalAgencySourceData({
    id: "agency-1",
    name: "Updated Example Fire Department",
    sourceRecordAssociations: [],
    sourceFacts: [],
  } as Agency);
  const [restored] = applyAgencySourceRecordDataMap(
    [refreshedCloudAgency],
    loadAgencySourceRecordData(storage),
  );

  assert.equal(restored.name, "Updated Example Fire Department");
  assert.deepEqual(restored.sourceRecordAssociations, [association]);
  assert.deepEqual(restored.sourceFacts, [fact]);
});

test("browser-local source evidence is excluded from shareable agency records", () => {
  const agency = {
    id: "agency-1",
    name: "Example Fire Department",
    sourceRecordAssociations: [association],
    sourceFacts: [fact],
  } as Agency;

  const shareable = stripBrowserLocalAgencySourceData(agency);

  assert.equal(shareable.name, agency.name);
  assert.equal(shareable.sourceRecordAssociations, undefined);
  assert.equal(shareable.sourceFacts, undefined);
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
