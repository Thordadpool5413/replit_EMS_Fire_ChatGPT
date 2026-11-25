import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import express from "express";

// Refuse to run against any database other than the disposable CI service.
const expected = "postgresql://atlas_ci:atlas_ci_local_only@127.0.0.1:5432/atlas_ci";
test("Replit evidence API enforces membership, independent review, and immutable records", async () => {
  assert.equal(process.env.ATLAS_EVIDENCE_CI, "1");
  assert.equal(process.env.DATABASE_URL, expected);
  const { db, pool, sessionsTable, workspaceMembershipsTable, sharedEvidenceRecordsTable } = await import("@workspace/db");
  const { authMiddleware } = await import("../middlewares/authMiddleware");
  const { default: router } = await import("./shared-evidence");
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const workspaceId = "ci-workspace";
    const agencyKey = "FDID:FL:12345";
    const enteredAt = new Date().toISOString();
    for (const uid of ["viewer", "editor", "reviewer", "outsider", "author-reviewer"]) {
      await db.insert(sessionsTable).values({
        sid: "ci-" + uid,
        sess: { user: { id: uid }, access_token: "local-test-only" },
        expire: new Date(Date.now() + 60000),
      });
    }
    for (const [userId, role] of [["viewer", "viewer"], ["editor", "editor"], ["reviewer", "reviewer"], ["author-reviewer", "reviewer"]]) {
      await db.insert(workspaceMembershipsTable).values({ workspaceId, userId, role });
    }
    const evidence = {
      factId: "fact_1", agencyKey, agencyName: "CI fixture only", stateCode: "FL",
      kind: "installed-monitor", value: "Documented model", sourceName: "Fixture source",
      sourceRecordId: "fixture-1", sourceUrl: "https://example.gov/records/1",
      documentDate: enteredAt.slice(0, 10), dueDate: "", enteredAt,
    };
    async function request(path: string, user?: string, body?: unknown, headers?: Record<string,string>) {
      const response = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(user ? { Authorization: "Bearer ci-" + user } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
      return { status: response.status, body: await response.json() };
    }
    const root = `/evidence/workspaces/${workspaceId}`;
    const agencyPath = root + "/agencies/" + encodeURIComponent(agencyKey);
    const publish = { workspaceId, evidence };
    const decision = { workspaceId, agencyKey, draft: { action: "approved", reason: "source-checked", replacementId: "" } };
    const decisions = agencyPath + "/facts/fact_1/decisions";
    assert.equal((await request(root + "/role")).status, 401);
    assert.equal((await request(root + "/role", "outsider")).status, 403);
    assert.equal((await request("/evidence/workspaces/another-workspace/role", "editor")).status, 403);
    assert.equal((await request(root + "/role", "viewer")).body.role, "viewer");
    assert.equal((await request(root + "/role", "viewer", undefined, { Origin: "https://other.example", "Sec-Fetch-Site": "cross-site" })).status, 403);
    assert.equal((await request("/evidence", "editor", publish, { Origin: "https://other.example", "X-Forwarded-Host": "other.example" })).status, 403);
    assert.equal((await request(root + "/role", "viewer", undefined, { Origin: base, "Sec-Fetch-Site": "same-origin" })).status, 200);
    assert.equal((await request("/evidence", undefined, publish)).status, 401);
    assert.equal((await request("/evidence", "viewer", publish)).status, 403);
    assert.equal((await request("/evidence", "reviewer", publish)).status, 403);
    assert.equal((await request("/evidence", "editor", { workspaceId, evidence: { ...evidence, sourceUrl: "http://example.gov/record" } })).status, 400);
    assert.equal((await request("/evidence", "editor", publish)).body.result, "created");
    assert.equal((await request("/evidence", "editor", publish)).body.result, "exists");
    assert.equal((await request("/evidence", "editor", { workspaceId, evidence: { ...evidence, value: "Different model" } })).status, 409);
    assert.equal((await request(agencyPath, "outsider")).status, 403);
    const list = await request(agencyPath, "viewer");
    assert.equal(list.status, 200);
    assert.equal(list.body.records[0].authorUid, "editor");
    assert.equal(list.body.records[0].evidence.value, evidence.value);
    assert.equal((await request(decisions, "editor", decision)).status, 403);
    assert.equal((await request(decisions, "viewer", decision)).status, 403);
    // A migrated author with a reviewer role must still not approve their own fact.
    for (const [factId, authorUid, authorIdentityMapped] of [["self_fact", "author-reviewer", true], ["unmapped_fact", "legacy-author", false]] as const) {
      await db.insert(sharedEvidenceRecordsTable).values({
        workspaceId, agencyKey, factId, payload: { ...evidence, factId }, authorUid, authorIdentityMapped,
      });
      const actor = authorIdentityMapped ? "author-reviewer" : "reviewer";
      assert.equal((await request(agencyPath + "/facts/" + factId + "/decisions", actor, decision)).status, 409);
    }
    const reviewed = await request(decisions, "reviewer", decision);
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.result, "created");
    const history = await request(decisions, "viewer");
    assert.equal(history.body.status, "approved");
    assert.equal(history.body.decisions[0].reviewerUid, "reviewer");
    assert.equal((await request(decisions, "author-reviewer", decision)).status, 409);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
