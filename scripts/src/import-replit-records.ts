import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pool } from "@workspace/db";
import { parseMigration, stableJson, type JsonRecord } from "./replitImportFormat";

function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

async function main() {
  const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
  const filePath = fileArg?.slice("--file=".length);
  if (!filePath) {
    throw new Error("Pass a local export with --file=/path/to/export.json. No file contents are logged.");
  }
  const fileStats = await stat(filePath);
  if (fileStats.size > 50_000_000) {
    throw new Error("The export is larger than the 50 MB import limit.");
  }
  const apply = process.argv.includes("--apply");
  const input = parseMigration(JSON.parse(await readFile(filePath, "utf8")));
  const agencyIds = input.agencies.map((agency) => agency.id);
  if (new Set(agencyIds).size !== agencyIds.length) {
    throw new Error("The export has duplicate agency IDs; nothing was imported.");
  }

  if (!apply) {
    console.log(JSON.stringify({
      mode: "dry-run",
      agencyRecords: input.agencies.length,
      workspaceMemberships: input.memberships.length,
      sharedEvidenceRecords: input.sharedEvidence.length,
      evidenceDecisions: input.evidenceDecisions.length,
      otherRecordsToArchive: input.legacyRecords.length,
      message: "No database changes were made. Add --apply after reviewing these counts.",
    }));
    return;
  }

  const client = await pool.connect();
  const outcome = await (async () => {
    let inserted = 0;
    let unchanged = 0;
    let archivedConflicts = 0;
    let membershipsAdded = 0;
    let evidenceAdded = 0;
    let decisionsAdded = 0;
    const archived = [...input.legacyRecords];
    try {
      await client.query("BEGIN");
      for (const agency of input.agencies) {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [agency.id]);
        const currentResult = await client.query<{ payload: JsonRecord }>(
          "select payload from agency_records where id = $1 limit 1",
          [agency.id],
        );
        const current = currentResult.rows[0];
        if (current) {
          if (stableJson(current.payload) === stableJson(agency)) {
            unchanged += 1;
          } else {
            archived.push({
              collection: "agency_import_conflicts",
              path: `${input.createdAt ?? "export"}/${agency.id}/${digest(agency)}`,
              payload: { agency },
            });
            archivedConflicts += 1;
          }
          continue;
        }
        const revision = Number.isSafeInteger(agency._revision) && Number(agency._revision) > 0
          ? Number(agency._revision)
          : 1;
        const stateValue = agency.stateCode;
        const stateCode = typeof stateValue === "string" && /^[A-Za-z]{2}$/.test(stateValue)
          ? stateValue.toUpperCase()
          : null;
        const created = await client.query(
          `insert into agency_records (id, state_code, payload, revision)
           values ($1, $2, $3::jsonb, $4)
           on conflict (id) do nothing
           returning id`,
          [agency.id, stateCode, JSON.stringify({ ...agency, _revision: revision }), revision],
        );
        if (created.rowCount) inserted += 1;
        else {
          archived.push({
            collection: "agency_import_conflicts",
            path: `${input.createdAt ?? "export"}/${agency.id}/${digest(agency)}`,
            payload: { agency },
          });
          archivedConflicts += 1;
        }
      }

      for (const membership of input.memberships) {
        const [current] = (await client.query<{ role: string }>(
          `select role from workspace_memberships
           where workspace_id = $1 and user_id = $2 limit 1`,
          [membership.workspaceId, membership.userId],
        )).rows;
        if (current) {
          if (current.role === membership.role) unchanged += 1;
          else {
            archived.push({
              collection: "workspace_membership_conflicts",
              path: `${membership.workspaceId}/${membership.userId}/${digest(membership)}`,
              payload: membership,
            });
            archivedConflicts += 1;
          }
          continue;
        }
        const created = await client.query(
          `insert into workspace_memberships (workspace_id, user_id, role)
           values ($1, $2, $3) on conflict (workspace_id, user_id) do nothing returning user_id`,
          [membership.workspaceId, membership.userId, membership.role],
        );
        if (created.rowCount) membershipsAdded += 1;
        else {
          archived.push({
            collection: "workspace_membership_conflicts",
            path: `${membership.workspaceId}/${membership.userId}/${digest(membership)}`,
            payload: membership,
          });
          archivedConflicts += 1;
        }
      }

      for (const evidence of input.sharedEvidence) {
        const [current] = (await client.query<{ payload: JsonRecord; author_identity_mapped: boolean }>(
          `select payload, author_identity_mapped from shared_evidence_records
           where workspace_id = $1 and agency_key = $2 and fact_id = $3 limit 1`,
          [evidence.workspaceId, evidence.agencyKey, evidence.factId],
        )).rows;
        if (current) {
          if (stableJson(current.payload) === stableJson(evidence.payload) &&
              current.author_identity_mapped === evidence.authorIdentityMapped) unchanged += 1;
          else {
            archived.push({
              collection: "shared_evidence_conflicts",
              path: `${evidence.workspaceId}/${evidence.agencyKey}/${evidence.factId}/${digest(evidence)}`,
              payload: evidence,
            });
            archivedConflicts += 1;
          }
          continue;
        }
        const created = await client.query(
          `insert into shared_evidence_records
           (workspace_id, agency_key, fact_id, payload, author_uid, author_identity_mapped, published_at)
           values ($1, $2, $3, $4::jsonb, $5, $6, $7)
           on conflict (workspace_id, agency_key, fact_id) do nothing returning fact_id`,
          [
            evidence.workspaceId, evidence.agencyKey, evidence.factId, JSON.stringify(evidence.payload),
            evidence.authorUid, evidence.authorIdentityMapped, evidence.publishedAt,
          ],
        );
        if (created.rowCount) evidenceAdded += 1;
        else {
          archived.push({
            collection: "shared_evidence_conflicts",
            path: `${evidence.workspaceId}/${evidence.agencyKey}/${evidence.factId}/${digest(evidence)}`,
            payload: evidence,
          });
          archivedConflicts += 1;
        }
      }

      for (const decision of input.evidenceDecisions) {
        const [evidenceExists] = (await client.query<{ fact_id: string }>(
          `select fact_id from shared_evidence_records
           where workspace_id = $1 and agency_key = $2 and fact_id = $3 limit 1`,
          [decision.workspaceId, decision.agencyKey, decision.factId],
        )).rows;
        if (!evidenceExists) {
          archived.push({
            collection: "orphaned_evidence_decisions",
            path: `${decision.workspaceId}/${decision.agencyKey}/${decision.factId}/${decision.action}/${digest(decision)}`,
            payload: decision,
          });
          archivedConflicts += 1;
          continue;
        }
        const [current] = (await client.query<{ payload: JsonRecord; reviewer_identity_mapped: boolean }>(
          `select payload, reviewer_identity_mapped from shared_evidence_decisions
           where workspace_id = $1 and agency_key = $2 and fact_id = $3 and action = $4 limit 1`,
          [decision.workspaceId, decision.agencyKey, decision.factId, decision.action],
        )).rows;
        if (current) {
          if (stableJson(current.payload) === stableJson(decision.payload) &&
              current.reviewer_identity_mapped === decision.reviewerIdentityMapped) unchanged += 1;
          else {
            archived.push({
              collection: "evidence_decision_conflicts",
              path: `${decision.workspaceId}/${decision.agencyKey}/${decision.factId}/${decision.action}/${digest(decision)}`,
              payload: decision,
            });
            archivedConflicts += 1;
          }
          continue;
        }
        const created = await client.query(
          `insert into shared_evidence_decisions
           (workspace_id, agency_key, fact_id, action, payload, reviewer_uid, reviewer_identity_mapped, reviewed_at)
           values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
           on conflict (workspace_id, agency_key, fact_id, action) do nothing returning action`,
          [
            decision.workspaceId, decision.agencyKey, decision.factId, decision.action,
            JSON.stringify(decision.payload), decision.reviewerUid, decision.reviewerIdentityMapped, decision.reviewedAt,
          ],
        );
        if (created.rowCount) decisionsAdded += 1;
        else {
          archived.push({
            collection: "evidence_decision_conflicts",
            path: `${decision.workspaceId}/${decision.agencyKey}/${decision.factId}/${decision.action}/${digest(decision)}`,
            payload: decision,
          });
          archivedConflicts += 1;
        }
      }

      for (const row of archived) {
        await client.query(
          `insert into imported_legacy_records (collection_name, document_path, payload)
           values ($1, $2, $3::jsonb)
           on conflict (collection_name, document_path) do nothing`,
          [row.collection, `${row.path}/${digest(row.payload)}`, JSON.stringify(row.payload)],
        );
      }
      await client.query("COMMIT");
      return {
        inserted,
        unchanged,
        archivedConflicts,
        archivedRecords: archived.length,
        membershipsAdded,
        evidenceAdded,
        decisionsAdded,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })();

  console.log(JSON.stringify({
    mode: "applied",
    ...outcome,
    message: "No existing agency record was overwritten. Conflicting imports were preserved for review.",
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Import failed.");
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
