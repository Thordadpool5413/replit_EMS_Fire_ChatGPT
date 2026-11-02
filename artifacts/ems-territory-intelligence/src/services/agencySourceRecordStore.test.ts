import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENCY_SOURCE_RECORD_BACKUP_FORMAT,
  applyAgencySourceRecordDataMap,
  createAgencySourceRecordBackup,
  mergeAgencySourceRecordDataMaps,
  findAgencySourceRecordAssociation,
  loadAgencySourceRecordData,
  parseAgencySourceRecordBackup,
  replaceAgencySourceRecordAssociation,
  saveAgencySourceRecordData,
  saveAgencySourceRecordDataMap,
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

test("exports and restores a versioned source-only backup", () => {
  const sourceData = {
    "agency-1": {
      sourceRecordAssociations: [association],
      sourceFacts: [fact],
    },
  };
  const serialized = createAgencySourceRecordBackup(
    sourceData,
    "2026-11-02T12:00:00.000Z",
  );
  const parsed = parseAgencySourceRecordBackup(serialized);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.associationCount, 1);
  assert.equal(parsed.factCount, 1);
  assert.deepEqual(parsed.data, sourceData);

  const storage = memoryStorage();
  assert.deepEqual(saveAgencySourceRecordDataMap(parsed.data, storage), {
    ok: true,
  });
  assert.deepEqual(loadAgencySourceRecordData(storage), sourceData);
});

test("rejects unsupported or unsafe source-record backups", () => {
  const unsupported = parseAgencySourceRecordBackup(
    JSON.stringify({
      format: AGENCY_SOURCE_RECORD_BACKUP_FORMAT,
      version: 99,
      exportedAt: "2026-11-02T12:00:00.000Z",
      records: {},
    }),
  );
  assert.equal(unsupported.ok, false);

  const unsafeAgencyId = parseAgencySourceRecordBackup(
    `{"format":"${AGENCY_SOURCE_RECORD_BACKUP_FORMAT}","version":1,"exportedAt":"2026-11-02T12:00:00.000Z","records":{"__proto__":{"sourceRecordAssociations":[],"sourceFacts":[]}}}`,
  );
  assert.equal(unsafeAgencyId.ok, false);

  const insecureSourceUrl = parseAgencySourceRecordBackup(
    JSON.stringify({
      format: AGENCY_SOURCE_RECORD_BACKUP_FORMAT,
      version: 1,
      exportedAt: "2026-11-02T12:00:00.000Z",
      records: {
        "agency-1": {
          sourceRecordAssociations: [
            { ...association, sourceUrl: "http://example.gov/record" },
          ],
          sourceFacts: [],
        },
      },
    }),
  );
  assert.equal(insecureSourceUrl.ok, false);
});

test("backup import merges new items and leaves conflicts unchanged", () => {
  const conflictingAssociation: AgencySourceRecordAssociation = {
    ...association,
    decision: "rejected",
    decidedAt: "2026-11-02T12:00:00.000Z",
  };
  const addedAssociation: AgencySourceRecordAssociation = {
    ...association,
    id: "NERIS:neris-456",
    sourceRecordId: "neris-456",
  };
  const conflictingFact: AgencySourceFact = {
    ...fact,
    value: "9,999",
  };
  const addedFact: AgencySourceFact = {
    ...fact,
    id: "fact-2",
    value: "2,345",
  };

  const merged = mergeAgencySourceRecordDataMaps(
    {
      "agency-1": {
        sourceRecordAssociations: [association],
        sourceFacts: [fact],
      },
    },
    {
      "agency-1": {
        sourceRecordAssociations: [
          association,
          conflictingAssociation,
          addedAssociation,
        ],
        sourceFacts: [fact, conflictingFact, addedFact],
      },
    },
  );

  assert.equal(merged.associationsAdded, 1);
  assert.equal(merged.factsAdded, 1);
  assert.equal(merged.conflictsSkipped, 2);
  assert.equal(merged.duplicatesSkipped, 2);
  assert.equal(
    merged.data["agency-1"].sourceRecordAssociations[0]?.decision,
    "confirmed",
  );
  assert.equal(merged.data["agency-1"].sourceFacts[0]?.value, "1,234");
  assert.equal(merged.data["agency-1"].sourceRecordAssociations.length, 2);
  assert.equal(merged.data["agency-1"].sourceFacts.length, 2);
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
