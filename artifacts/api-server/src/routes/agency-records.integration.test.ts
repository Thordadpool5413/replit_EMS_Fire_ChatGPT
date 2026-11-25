import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import express from "express";

test("saved agency API denies unauthorized access and preserves revision-protected changes", async () => {
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
    const id = "ci-agency-phase6";
    const agency = { id, name: "CI fixture only", stateCode: "FL" };
    const payload = { agency, expectedRevision: 0 };
    for (const [path, method, body] of [[root, "GET", undefined], [root + "/" + id, "GET", undefined], [root + "/" + id, "PUT", payload], [root + "/" + id + "/mutations", "POST", { ...payload, mutationId: "ci-mutation" }], [root + "/batch-create", "POST", { records: [agency] }]] as const) {
      assert.equal((await request(path, undefined, method, body)).status, 401);
      assert.equal((await request(path, "agency-outsider", method, body)).status, 403);
      if (method !== "GET") assert.equal((await request(path, "agency-viewer", method, body)).status, 403);
    }
    assert.equal((await request(root + "/access", "agency-editor")).body.role, "editor");
    assert.equal((await request(root + "/access", "agency-viewer")).body.role, "viewer");
    assert.equal((await request(root, "agency-editor", "GET", undefined, { Origin: "https://other.example", "Sec-Fetch-Site": "cross-site" })).status, 403);
    assert.equal((await request(root + "/batch-create", "agency-editor", "POST", { records: [{ ...agency, id: "fire-fl-12009-fake" }] })).status, 422);
    assert.equal((await request(root + "/" + id, "agency-editor", "PUT", payload, { Origin: base, "Sec-Fetch-Site": "same-origin" })).body.revision, 1);
    assert.equal((await request(root + "/" + id, "agency-viewer")).body.agency.name, agency.name);
    assert.equal((await request(root + "/" + id, "agency-editor", "PUT", payload)).status, 409);
    const mutation = { mutationId: "ci-mutation", expectedRevision: 1, agency: { ...agency, name: "CI changed" } };
    assert.equal((await request(root + "/" + id + "/mutations", "agency-editor", "POST", mutation)).body.revision, 2);
    assert.equal((await request(root + "/" + id + "/mutations", "agency-editor", "POST", mutation)).body.revision, 2);
    assert.equal((await request(root + "/" + id, "agency-viewer")).body.agency.name, "CI changed");
    const batch = await request(root + "/batch-create", "agency-editor", "POST", { records: [agency] });
    assert.deepEqual(batch.body.createdIds, []);
    assert.equal((await request(root + "/" + id, "agency-viewer")).body.revision, 2);
    // A retry acknowledges the original receipt but does not mislabel or overwrite the latest payload.
    const newer = { ...agency, name: "CI newer record" };
    assert.equal((await request(root + "/" + id, "agency-editor", "PUT", { agency: newer, expectedRevision: 2 })).body.revision, 3);
    const replay = await request(root + "/" + id + "/mutations", "agency-editor", "POST", mutation);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.revision, 2);
    assert.equal(replay.body.agency._revision, 3);
    assert.equal(replay.body.agency.name, newer.name);
    assert.equal((await request(root + "/" + id, "agency-viewer")).body.revision, 3);

    // Concurrent identical requests share one receipt and commit exactly once.
    const concurrent = { mutationId: "ci-concurrent-mutation", expectedRevision: 3, agency: { ...newer, name: "CI concurrent" } };
    const retries = await Promise.all(Array.from({length: 4}, () => request(root + "/" + id + "/mutations", "agency-editor", "POST", concurrent)));
    assert.ok(retries.every(r => r.status === 200 && r.body.revision === 4 && r.body.agency._revision === 4));
    assert.equal((await request(root + "/" + id, "agency-viewer")).body.revision, 4);

    // One atomic batch, with existing records preserved and caller ordering retained.
    const z = { id: "ci-batch-z", stateCode: "FL", name: "CI z" };
    const a = { id: "ci-batch-a", stateCode: "FL", name: "CI a" };
    const result = await request(root + "/batch-create", "agency-editor", "POST", { records: [z, newer, a] });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.createdIds, [z.id, a.id]);
    assert.equal((await request(root + "/" + id, "agency-viewer")).body.agency.name, "CI concurrent");
    assert.deepEqual((await request(root + "/batch-create", "agency-editor", "POST", { records: [] })).body.createdIds, []);
    assert.deepEqual((await request(root + "/batch-create", "agency-editor", "POST", { records: [a,z] })).body.createdIds, []);
    const wrongAgency = await request(root + "/" + a.id + "/mutations", "agency-editor", "POST", { ...concurrent, agency: a });
    assert.equal(wrongAgency.status, 409);
    assert.equal((await request(root + "/" + a.id, "agency-viewer")).body.revision, 1);
    delete process.env.ATLAS_AGENCY_EDITOR_IDS;
    delete process.env.ATLAS_AGENCY_VIEWER_IDS;
    assert.equal((await request(root, "agency-editor")).status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
