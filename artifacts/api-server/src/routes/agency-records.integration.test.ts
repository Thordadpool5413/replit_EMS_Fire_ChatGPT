import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";

test("agency profiles are publicly readable while private notes and writes stay protected", async () => {
  assert.equal(process.env.ATLAS_EVIDENCE_CI, "1");
  assert.equal(process.env.DATABASE_URL, "postgresql://atlas_ci:atlas_ci_local_only@127.0.0.1:5432/atlas_ci");
  process.env.ATLAS_AGENCY_EDITOR_IDS = "agency-editor";
  process.env.ATLAS_AGENCY_VIEWER_IDS = "agency-viewer";
  const { db, pool, sessionsTable } = await import("@workspace/db");
  const { authMiddleware } = await import("../middlewares/authMiddleware");
  const { default: router } = await import("./agency-records");
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const addr = server.address();
    assert(addr && typeof addr !== "string");
    const base = `http://127.0.0.1:${addr.port}`;
    for (const uid of ["agency-editor", "agency-viewer", "agency-outsider"]) {
      await db.insert(sessionsTable).values({ sid: "ci-" + uid, sess: { user: { id: uid }, access_token: "local-test-only" }, expire: new Date(Date.now() + 60000) });
    }
    async function request(path: string, user?: string, method = "GET", body?: unknown, headers?: Record<string, string>) {
      const response = await fetch(base + path, {
        method, headers: { "Content-Type": "application/json", ...(user ? { Authorization: "Bearer ci-" + user } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      return { status: response.status, body: await response.json() };
    }
    const root = "/agencies";
    const id = `ci-agency-${randomUUID()}`;
    const agency = {
      id,
      name: "CI fixture only",
      stateCode: "FL",
      keyContacts: [{ id: "ci-contact", name: "CI Contact", notes: "private contact note" }],
      fieldNotes: [{ id: "ci-note", notes: "private field note" }],
      followUpTasks: [{ id: "ci-task", notes: "private follow-up" }],
      sourceFacts: [{ id: "ci-source-fact", value: "private local source fact" }],
    };
    const payload = { agency, expectedRevision: 0 };
    assert.equal((await request(root)).status, 200);
    assert.equal((await request(root + "/" + id)).status, 404);
    assert.equal((await request(root + "/access")).status, 401);
    for (const [path, method, body] of [[root + "/" + id, "PUT", payload], [root + "/" + id + "/mutations", "POST", { ...payload, mutationId: `ci-mutation-${randomUUID()}` }], [root + "/batch-create", "POST", { records: [agency] }]] as const) {
      assert.equal((await request(path, undefined, method, body)).status, 401);
      assert.equal((await request(path, "agency-outsider", method, body)).status, 403);
      assert.equal((await request(path, "agency-viewer", method, body)).status, 403);
    }
    assert.equal((await request(root + "/access", "agency-editor")).body.role, "editor");
    assert.equal((await request(root + "/access", "agency-viewer")).body.role, "viewer");
    assert.equal((await request(root + "/batch-create", "agency-editor", "POST", { records: [{ ...agency, id: "fire-fl-12009-fake" }] })).status, 422);
    assert.equal((await request(root + "/" + id, "agency-editor", "PUT", payload, { Origin: "https://other.example", "Sec-Fetch-Site": "cross-site" })).status, 403);
    assert.equal((await request(root + "/" + id, "agency-editor", "PUT", payload, { Origin: base, "Sec-Fetch-Site": "same-origin" })).body.revision, 1);
    const publicRecord = (await request(root + "/" + id)).body.agency;
    assert.equal(publicRecord.name, agency.name);
    assert.equal("fieldNotes" in publicRecord, false);
    assert.equal("followUpTasks" in publicRecord, false);
    assert.equal("sourceFacts" in publicRecord, false);
    assert.equal(publicRecord.keyContacts[0].notes, undefined);
    const publicDirectoryRecord = (await request(root)).body.records.find((record: { id: string }) => record.id === id).agency;
    assert.equal("fieldNotes" in publicDirectoryRecord, false);
    assert.equal(publicDirectoryRecord.keyContacts[0].notes, undefined);
    const authorizedRecord = (await request(root + "/" + id, "agency-viewer")).body.agency;
    assert.equal(authorizedRecord.fieldNotes[0].notes, "private field note");
    assert.equal(authorizedRecord.keyContacts[0].notes, "private contact note");
    assert.equal((await request(root + "/" + id, "agency-editor", "PUT", payload)).status, 409);
    const mutation = { mutationId: `ci-mutation-${randomUUID()}`, expectedRevision: 1, agency: { ...agency, name: "CI changed" } };
    assert.equal((await request(root + "/" + id + "/mutations", "agency-editor", "POST", mutation)).body.revision, 2);
    assert.equal((await request(root + "/" + id + "/mutations", "agency-editor", "POST", mutation)).body.revision, 2);
    assert.equal((await request(root + "/" + id, "agency-viewer")).body.agency.name, "CI changed");
    const batch = await request(root + "/batch-create", "agency-editor", "POST", { records: [agency] });
    assert.deepEqual(batch.body.createdIds, []);
    assert.equal((await request(root + "/" + id, "agency-viewer")).body.revision, 2);
    delete process.env.ATLAS_AGENCY_EDITOR_IDS;
    delete process.env.ATLAS_AGENCY_VIEWER_IDS;
    assert.equal((await request(root + "/" + id, "agency-editor", "PUT", payload)).status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
