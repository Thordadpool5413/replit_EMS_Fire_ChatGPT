import assert from "node:assert/strict";
import test from "node:test";
import { parseMigration, stableJson } from "./replitImportFormat";

test("parses an app workspace export without logging or changing its records", () => {
  const parsed = parseMigration({
    format: "ems-workspace",
    version: 1,
    createdAt: "2026-11-25T00:00:00.000Z",
    agencies: [{ id: "agency-1", name: "Sample EMS", fieldNotes: [] }],
    storage: { "ems_draft_v1:agency-1": "{\"note\":\"private\"}" },
  });

  assert.equal(parsed.agencies.length, 1);
  assert.equal(parsed.agencies[0]?.id, "agency-1");
  assert.equal(parsed.legacyRecords.length, 1);
  assert.equal(parsed.legacyRecords[0]?.collection, "browser_backup_storage");
});

test("parses collection exports and keeps non-agency records for archive", () => {
  const parsed = parseMigration({
    format: "ems-record-export",
    version: 1,
    createdAt: "2026-11-25T00:00:00.000Z",
    collections: {
      agencies: [{ id: "agency-2", payload: { name: "County EMS", fieldNotes: [] } }],
      field_notes: [{ path: "notes/note-1", payload: { id: "note-1", agencyId: "agency-2" } }],
    },
  });

  assert.equal(parsed.agencies[0]?.id, "agency-2");
  assert.deepEqual(parsed.legacyRecords, [{
    collection: "field_notes",
    path: "notes/note-1",
    payload: { id: "note-1", agencyId: "agency-2" },
  }]);
});

test("preserves legacy evidence history but does not activate unmapped identities", () => {
  const enteredAt = new Date().toISOString();
  const documentDate = enteredAt.slice(0, 10);
  const factId = "fact_1";
  const agencyKey = "NPI:1234567890";
  const parsed = parseMigration({
    format: "ems-record-export",
    version: 1,
    collections: {
      agencies: [],
      workspace_members: [{
         path: "workspaces/territory/members/legacy-user-1",
        payload: { role: "reviewer" },
      }],
      evidence: [{
        path: `workspaces/territory/agencies/${agencyKey}/evidence/${factId}`,
        payload: {
          agencyKey,
          agencyName: "Sample EMS",
          stateCode: "TX",
          factId,
          kind: "installed-monitor",
          value: "Documented monitor model",
          sourceName: "Public procurement document",
          sourceRecordId: "notice-123",
          sourceUrl: "https://example.gov/record/123",
          documentDate,
          dueDate: "",
          enteredAt,
          authorUid: "legacy-user-1",
          publishedAt: enteredAt,
        },
      }],
      decisions: [{
        path: `workspaces/territory/agencies/${agencyKey}/evidence/${factId}/decisions/approved`,
        payload: {
          reason: "source-checked",
          replacementId: "",
          reviewerUid: "reviewer-2",
          reviewedAt: enteredAt,
        },
      }],
    },
  });

  assert.deepEqual(parsed.memberships, []);
  assert.equal(parsed.sharedEvidence.length, 1);
  assert.equal(parsed.sharedEvidence[0]?.authorUid, "legacy-user-1");
  assert.equal(parsed.sharedEvidence[0]?.authorIdentityMapped, false);
  assert.equal(parsed.evidenceDecisions[0]?.action, "approved");
  assert.equal(parsed.evidenceDecisions[0]?.reviewerUid, "reviewer-2");
  assert.equal(parsed.evidenceDecisions[0]?.reviewerIdentityMapped, false);
  assert.ok(parsed.legacyRecords.some((row) => row.collection === "workspace_members"));
});

test("activates a workspace role only with an explicit Replit user ID", () => {
  const parsed = parseMigration({
    format: "ems-record-export",
    version: 1,
    collections: {
      agencies: [],
      workspace_memberships: [{
        path: "workspaces/territory/members/legacy-user",
        payload: { role: "reviewer", replitUserId: "replit-user-1" },
      }],
    },
  });
  assert.deepEqual(parsed.memberships, [{
    workspaceId: "territory",
    userId: "replit-user-1",
    role: "reviewer",
  }]);
});

test("stable JSON comparison ignores object key order but preserves array order", () => {
  assert.equal(stableJson({ b: 2, a: [1, 2] }), stableJson({ a: [1, 2], b: 2 }));
  assert.notEqual(stableJson({ a: [1, 2] }), stableJson({ a: [2, 1] }));
});

test("rejects unsupported exports before any database work", () => {
  assert.throws(() => parseMigration({ format: "unknown", version: 9 }), /Unsupported export/);
  assert.throws(() => parseMigration({
    format: "ems-workspace",
    version: 1,
    agencies: [{ id: "", name: "Invalid identity" }],
    storage: [],
  }), /invalid agency/);
});
