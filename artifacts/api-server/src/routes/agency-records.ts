import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import {
  CommitAgencyMutationBody,
  CreateAgencyRecordsBody,
  ListAgencyRecordsQueryParams,
  UpdateAgencyRecordBody,
} from "@workspace/api-zod";
import { db, agencyMutationReceiptsTable, agencyRecordsTable } from "@workspace/db";

import { agencyWorkspaceRole, canReadAgencyWorkspaceFields, requireAgencyWorkspace } from "../middlewares/agencyWorkspaceAccess";
import { publicAgencyProfilePayload } from "../lib/publicAgencyProfile";

const router: IRouter = Router();
router.use("/agencies", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
const statePattern = /^[A-Z]{2}$/;
const MAX_PAGE_SIZE = 500;
const MAX_BATCH_SIZE = 25;

function hasAgencyId(value: Record<string, unknown>): value is Record<string, unknown> & { id: string } {
  return typeof value.id === "string" && value.id.trim().length > 0 && value.id.length <= 300;
}

function responseRecord(id: string, revision: number, payload: Record<string, unknown>) {
  return { id, revision, agency: { ...payload, id, _revision: revision } };
}

function publicProfileRecord(id: string, revision: number, payload: Record<string, unknown>) {
  return responseRecord(id, revision, publicAgencyProfilePayload(payload));
}

function requestError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

function logFailure(req: Request, error: unknown, operation: string) {
  req.log?.error({ err: error, operation }, "Agency record request failed");
}

function routeAgencyId(req: Request): string {
  const value = req.params.agencyId;
  return Array.isArray(value) ? value[0] ?? "" : value;
}

router.get("/agencies/access", (req, res) => {
  if (!req.isAuthenticated()) return requestError(res, 401, "sign_in_required", "Sign in to Replit.");
  return res.json({ role: agencyWorkspaceRole(req.user.id) });
});

function isQuarantined(record: Record<string, unknown>): boolean {
  const id = typeof record.id === "string" ? record.id : "";
  const source = typeof record.verificationSource === "string" ? record.verificationSource : "";
  return /^(?:zoll-agency-|zoll-lead-|territory-[a-z]{2}-(?:ems|fire)-|(?:ems|fire)-[a-z]{2}-\d{5}(?:-|$))/i.test(id) ||
    record.dataProvenanceTier === "generated_prospect" ||
    /geographic prospect generator|generated geography-based prospect|Imported public-facing directory candidate|Imported account candidate/i.test(source);
}

router.get("/agencies", async (req, res) => {
  const query = ListAgencyRecordsQueryParams.safeParse(req.query);
  if (!query.success) return requestError(res, 400, "invalid_query", "The agency directory query is invalid.");
  const stateCode = query.data.stateCode?.trim().toUpperCase();
  const after = query.data.after;
  const requestedLimit = query.data.limit ?? MAX_PAGE_SIZE;
  if (stateCode && !statePattern.test(stateCode)) {
    return requestError(res, 400, "invalid_query", "The agency directory query is invalid.");
  }

  try {
    const predicates = [];
    if (stateCode) predicates.push(eq(agencyRecordsTable.stateCode, stateCode));
    if (after) predicates.push(gt(agencyRecordsTable.id, after));
    const rows = await db
      .select()
      .from(agencyRecordsTable)
      .where(predicates.length ? and(...predicates) : undefined)
      .orderBy(asc(agencyRecordsTable.id))
      .limit(requestedLimit + 1);
    const hasMore = rows.length > requestedLimit;
    const page = rows.slice(0, requestedLimit);
    const canReadPrivateFields = canReadAgencyWorkspaceFields(req);
    return res.json({
      records: page.map((row) => canReadPrivateFields
        ? responseRecord(row.id, row.revision, row.payload)
        : publicProfileRecord(row.id, row.revision, row.payload)),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    logFailure(req, error, "list");
    return requestError(res, 503, "database_unavailable", "Agency records are temporarily unavailable.");
  }
});

router.get("/agencies/:agencyId", async (req, res) => {
  const agencyId = routeAgencyId(req);
  try {
    const [row] = await db
      .select()
      .from(agencyRecordsTable)
      .where(eq(agencyRecordsTable.id, agencyId))
      .limit(1);
    if (!row) return requestError(res, 404, "not_found", "Agency record not found.");
    return res.json(canReadAgencyWorkspaceFields(req)
      ? responseRecord(row.id, row.revision, row.payload)
      : publicProfileRecord(row.id, row.revision, row.payload));
  } catch (error) {
    logFailure(req, error, "read");
    return requestError(res, 503, "database_unavailable", "Agency records are temporarily unavailable.");
  }
});

router.put("/agencies/:agencyId", requireAgencyWorkspace, async (req, res) => {
  const agencyId = routeAgencyId(req);
  const body = UpdateAgencyRecordBody.safeParse(req.body);
  if (!agencyId || !body.success || !hasAgencyId(body.data.agency) || body.data.agency.id !== agencyId) {
    return requestError(res, 400, "invalid_record", "The agency update is invalid.");
  }

  if (isQuarantined(body.data.agency)) return requestError(res, 422, "quarantined_provider", "Legacy modeled records require source reconciliation before saving.");

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${agencyId}, 0))`);
      const [current] = await tx
        .select()
        .from(agencyRecordsTable)
        .where(eq(agencyRecordsTable.id, agencyId))
        .limit(1);
      const revision = current?.revision ?? 0;
      if (revision !== body.data.expectedRevision) return { conflict: true as const, revision };

      const nextRevision = revision + 1;
      const payload: Record<string, unknown> = { ...body.data.agency, _revision: nextRevision, _updatedAt: new Date().toISOString() };
      const stateValue = payload.stateCode;
      const stateCode = typeof stateValue === "string" && statePattern.test(stateValue.toUpperCase())
        ? stateValue.toUpperCase()
        : null;
      await tx
        .insert(agencyRecordsTable)
        .values({ id: agencyId, stateCode, payload, revision: nextRevision })
        .onConflictDoUpdate({
          target: agencyRecordsTable.id,
          set: { stateCode, payload, revision: nextRevision, updatedAt: new Date() },
        });
      return { conflict: false as const, revision: nextRevision, payload };
    });
    if (result.conflict) {
      return res.status(409).json({
        error: { code: "revision_conflict", message: "This agency changed on another device. Refresh before replacing the full record." },
        currentRevision: result.revision,
      });
    }
    return res.json(responseRecord(agencyId, result.revision, result.payload));
  } catch (error) {
    logFailure(req, error, "update");
    return requestError(res, 503, "database_unavailable", "The agency record could not be saved.");
  }
});

router.post("/agencies/:agencyId/mutations", requireAgencyWorkspace, async (req, res) => {
  const agencyId = routeAgencyId(req);
  const body = CommitAgencyMutationBody.safeParse(req.body);
  if (!agencyId || !body.success || !hasAgencyId(body.data.agency) || body.data.agency.id !== agencyId) {
    return requestError(res, 400, "invalid_mutation", "The queued agency change is invalid.");
  }

  if (!body.data.mutationId.trim()) return requestError(res, 400, "invalid_mutation", "A mutation ID is required.");
  if (isQuarantined(body.data.agency)) return requestError(res, 422, "quarantined_provider", "Legacy modeled records require source reconciliation before saving.");

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize identical receipt IDs even when two requests target different agencies.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${body.data.mutationId}, 1))`);
      const [receipt] = await tx
        .select()
        .from(agencyMutationReceiptsTable)
        .where(eq(agencyMutationReceiptsTable.mutationId, body.data.mutationId))
        .limit(1);
      if (receipt) {
        if (receipt.agencyId !== agencyId) return { conflict: true as const, revision: receipt.revision };
        const [saved] = await tx
          .select()
          .from(agencyRecordsTable)
          .where(eq(agencyRecordsTable.id, agencyId))
          .limit(1);
        if (saved) return { conflict: false as const, revision: receipt.revision, payload: saved.payload };
      }

      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${agencyId}, 0))`);
      const [receiptAfterLock] = await tx
        .select()
        .from(agencyMutationReceiptsTable)
        .where(eq(agencyMutationReceiptsTable.mutationId, body.data.mutationId))
        .limit(1);
      if (receiptAfterLock) {
        if (receiptAfterLock.agencyId !== agencyId) {
          return { conflict: true as const, revision: receiptAfterLock.revision };
        }
        const [saved] = await tx
          .select()
          .from(agencyRecordsTable)
          .where(eq(agencyRecordsTable.id, agencyId))
          .limit(1);
        if (saved) return { conflict: false as const, revision: receiptAfterLock.revision, payload: saved.payload };
      }
      const [current] = await tx
        .select()
        .from(agencyRecordsTable)
        .where(eq(agencyRecordsTable.id, agencyId))
        .limit(1);
      const revision = current?.revision ?? 0;
      if (revision !== body.data.expectedRevision) return { conflict: true as const, revision };

      const nextRevision = revision + 1;
      const payload: Record<string, unknown> = { ...body.data.agency, _revision: nextRevision, _updatedAt: new Date().toISOString() };
      const stateValue = payload.stateCode;
      const stateCode = typeof stateValue === "string" && statePattern.test(stateValue.toUpperCase())
        ? stateValue.toUpperCase()
        : null;
      await tx
        .insert(agencyRecordsTable)
        .values({ id: agencyId, stateCode, payload, revision: nextRevision })
        .onConflictDoUpdate({
          target: agencyRecordsTable.id,
          set: { stateCode, payload, revision: nextRevision, updatedAt: new Date() },
        });
      await tx.insert(agencyMutationReceiptsTable).values({
        mutationId: body.data.mutationId,
        agencyId,
        revision: nextRevision,
      });
      return { conflict: false as const, revision: nextRevision, payload };
    });
    if (result.conflict) {
      return res.status(409).json({
        error: { code: "revision_conflict", message: "This agency changed after the queued edit. Your local edit remains available for review." },
        currentRevision: result.revision,
      });
    }
    return res.json(responseRecord(agencyId, result.revision, result.payload));
  } catch (error) {
    logFailure(req, error, "mutation");
    return requestError(res, 503, "database_unavailable", "The queued agency change could not be confirmed.");
  }
});

router.post("/agencies/batch-create", requireAgencyWorkspace, async (req, res) => {
  const body = CreateAgencyRecordsBody.safeParse(req.body);
  if (!body.success) return requestError(res, 400, "invalid_batch", "The agency batch is invalid.");
  if (body.data.records.length > MAX_BATCH_SIZE || body.data.records.some((record) => !hasAgencyId(record))) {
    return requestError(res, 400, "invalid_batch", "Every agency in the batch needs an ID.");
  }
  const records = body.data.records.filter(hasAgencyId);
  if (records.some(isQuarantined)) return requestError(res, 422, "quarantined_provider", "Legacy modeled records require source reconciliation before saving.");
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    return requestError(res, 400, "duplicate_ids", "The agency batch contains duplicate IDs.");
  }

  try {
    const createdIds = await db.transaction(async (tx) => {
      const created: string[] = [];
      for (const agency of records) {
        const stateCode = typeof agency.stateCode === "string" && statePattern.test(agency.stateCode.toUpperCase())
          ? agency.stateCode.toUpperCase()
          : null;
        const payload = { ...agency, _revision: 1, _updatedAt: new Date().toISOString() };
        const [row] = await tx
          .insert(agencyRecordsTable)
          .values({ id: agency.id, stateCode, payload, revision: 1 })
          .onConflictDoNothing()
          .returning({ id: agencyRecordsTable.id });
        if (row) created.push(row.id);
      }
      return created;
    });
    return res.json({ createdIds });
  } catch (error) {
    logFailure(req, error, "batch-create");
    return requestError(res, 503, "database_unavailable", "The agency batch could not be saved.");
  }
});

export default router;
