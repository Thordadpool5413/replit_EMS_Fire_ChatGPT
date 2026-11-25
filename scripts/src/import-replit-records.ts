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

      for (const row of archived) {
        await client.query(
          `insert into imported_legacy_records (collection_name, document_path, payload)
           values ($1, $2, $3::jsonb)
           on conflict (collection_name, document_path) do nothing`,
          [row.collection, `${row.path}/${digest(row.payload)}`, JSON.stringify(row.payload)],
        );
      }
      await client.query("COMMIT");
      return { inserted, unchanged, archivedConflicts, archivedRecords: archived.length };
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
