import { and, asc, eq, gt } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  sharedEvidenceDecisionsTable,
  sharedEvidenceRecordsTable,
  workspaceMembershipsTable,
  db,
} from "@workspace/db";

const router: IRouter = Router();
const workspaceIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const agencyKeyPattern = /^(?:NPI:\d{10}|NERIS:[A-Z0-9.-]{1,80}|FDID:[A-Z]{2}:[A-Z0-9.-]{1,80}|STATE-EMS:[A-Z]{2}:(?:agency-code|license):[A-Z0-9.-]{1,80})$/;
const factIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const evidenceKinds = new Set([
  "installed-monitor", "installed-cpr", "installed-ventilator", "installed-epcr", "installed-cad", "installed-billing",
  "contract-expiration", "procurement-open", "procurement-awarded", "procurement-closed", "grant-awarded", "capital-approved",
]);
const decisionReasons = {
  approved: ["source-checked"],
  challenged: ["source-conflict", "identity-mismatch", "scope-unclear", "outdated", "incorrect-value", "unreliable-source"],
  withdrawn: ["source-retracted", "incorrect-value", "privacy-concern", "unreliable-source"],
  superseded: ["corrected-evidence"],
} as const;
type DecisionAction = keyof typeof decisionReasons;
type EvidenceDecision = {
  action: DecisionAction;
  reason: string;
  replacementId: string;
  factId: string;
  reviewerUid: string;
  reviewerIdentityMapped: boolean;
  reviewedAt: string;
};
type EvidencePayload = Record<string, unknown> & { factId: string; agencyKey: string; kind: string };
type Actor = { uid: string };
type WorkspaceRole = "viewer" | "editor" | "reviewer";

function fail(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max &&
    !/^(?:unknown|not reported|not recorded|not applicable|none|n\/?a)$/i.test(value.trim());
}

function validDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (url.pathname.length > 1 || !!url.search);
  } catch {
    return false;
  }
}

function readEvidence(value: unknown, now = Date.now()): EvidencePayload | undefined {
  if (!object(value)) return undefined;
  const record = value;
  const stateCode = record.stateCode;
  const kind = record.kind;
  const agencyKey = record.agencyKey;
  const factId = record.factId;
  if (typeof agencyKey !== "string" || !agencyKeyPattern.test(agencyKey) ||
      typeof factId !== "string" || !factIdPattern.test(factId) ||
      typeof kind !== "string" || !evidenceKinds.has(kind) ||
      !text(record.agencyName, 240) || !text(stateCode, 2) || !/^[A-Z]{2}$/.test(stateCode) ||
      !text(record.value, 500) || !text(record.sourceName, 160) || !text(record.sourceRecordId, 160) ||
      !validHttpsUrl(record.sourceUrl) || !validDay(record.documentDate) || record.documentDate > new Date(now).toISOString().slice(0, 10) ||
      typeof record.dueDate !== "string" || record.dueDate.length > 10 ||
      !text(record.enteredAt, 40) || !Number.isFinite(Date.parse(record.enteredAt)) || Date.parse(record.enteredAt) > now ||
      record.documentDate > record.enteredAt.slice(0, 10)) return undefined;
  if ((agencyKey.startsWith("FDID:") || agencyKey.startsWith("STATE-EMS:")) && agencyKey.split(":")[1] !== stateCode) return undefined;
  if (["installed-monitor", "installed-cpr", "installed-ventilator", "installed-epcr", "installed-cad", "installed-billing"].includes(kind) &&
      /\b(?:unknown|no|without|not|proposed|recommended|considering|planned|requested|bid solicitation|previously used|formerly|retired|removed|out of service|decommissioned|discontinued|replaced|disposed|sold|surplus|trade.in|demonstration|demo|loaner)\b/i.test(record.value)) return undefined;
  if (kind === "contract-expiration" && (!validDay(record.value) || record.value < record.documentDate)) return undefined;
  if (kind === "procurement-open" && (!validDay(record.dueDate) || record.dueDate < record.documentDate)) return undefined;
  if (record.dueDate && kind !== "procurement-open") return undefined;
  return record as EvidencePayload;
}

function actorForRequest(req: Request): Actor | undefined {
  if (!req.isAuthenticated()) return undefined;
  return { uid: req.user.id };
}

async function roleFor(workspaceId: string, uid: string): Promise<WorkspaceRole | undefined> {
  const [member] = await db.select({ role: workspaceMembershipsTable.role })
    .from(workspaceMembershipsTable)
    .where(and(
      eq(workspaceMembershipsTable.workspaceId, workspaceId),
      eq(workspaceMembershipsTable.userId, uid),
    ))
    .limit(1);
  return member?.role === "viewer" || member?.role === "editor" || member?.role === "reviewer"
    ? member.role
    : undefined;
}

async function authorize(
  req: Request,
  res: Response,
  workspaceId: string,
  allowedRoles?: WorkspaceRole[],
): Promise<Actor | undefined> {
  if (!workspaceIdPattern.test(workspaceId)) {
    fail(res, 400, "INVALID_WORKSPACE", "The workspace identifier is invalid.");
    return undefined;
  }
  const actor = actorForRequest(req);
  if (!actor) {
    fail(res, 401, "EVIDENCE_SIGN_IN_REQUIRED", "A Replit workspace sign-in is required.");
    return undefined;
  }
  const role = await roleFor(workspaceId, actor.uid);
  if (!role) {
    fail(res, 403, "WORKSPACE_MEMBERSHIP_REQUIRED", "Workspace membership is not granted.");
    return undefined;
  }
  if (allowedRoles && !allowedRoles.includes(role)) {
    fail(res, 403, "INSUFFICIENT_ROLE", "This action requires a higher workspace role.");
    return undefined;
  }
  return actor;
}

function decisionDraft(
  value: unknown,
  factId: string,
): Omit<EvidenceDecision, "factId" | "reviewerUid" | "reviewerIdentityMapped" | "reviewedAt"> | undefined {
  if (!object(value) || !factIdPattern.test(factId) || typeof value.action !== "string" ||
      !Object.hasOwn(decisionReasons, value.action)) return undefined;
  const action = value.action as DecisionAction;
  if (typeof value.reason !== "string" || !(decisionReasons[action] as readonly string[]).includes(value.reason) ||
      typeof value.replacementId !== "string") return undefined;
  if (action === "superseded") {
    if (!factIdPattern.test(value.replacementId) || value.replacementId === factId) return undefined;
  } else if (value.replacementId !== "") {
    return undefined;
  }
  return { action, reason: value.reason, replacementId: value.replacementId };
}

function readDecision(
  payload: unknown,
  factId: string,
  action: string,
  reviewerIdentityMapped = true,
): EvidenceDecision | undefined {
  if (!object(payload)) return undefined;
  const draft = decisionDraft(payload, factId);
  if (!draft || draft.action !== action || payload.factId !== factId ||
      !text(payload.reviewerUid, 128) || typeof payload.reviewedAt !== "string" ||
      !Number.isFinite(Date.parse(payload.reviewedAt))) return undefined;
  return { ...draft, factId, reviewerUid: payload.reviewerUid, reviewerIdentityMapped, reviewedAt: payload.reviewedAt };
}

function decisionStatus(decisions: EvidenceDecision[], invalid: number) {
  if (invalid || new Set(decisions.map((decision) => decision.action)).size !== decisions.length) return "unavailable";
  for (const action of ["withdrawn", "superseded", "challenged", "approved"] as const) {
    if (decisions.some((decision) => decision.action === action)) return action;
  }
  return "pending";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

async function decisionRows(workspaceId: string, agencyKey: string, factId: string) {
  return db.select()
    .from(sharedEvidenceDecisionsTable)
    .where(and(
      eq(sharedEvidenceDecisionsTable.workspaceId, workspaceId),
      eq(sharedEvidenceDecisionsTable.agencyKey, agencyKey),
      eq(sharedEvidenceDecisionsTable.factId, factId),
    ))
    .orderBy(asc(sharedEvidenceDecisionsTable.reviewedAt));
}

router.get("/evidence/workspaces/:workspaceId/role", async (req, res) => {
  try {
    const actor = await authorize(req, res, req.params.workspaceId);
    if (!actor) return;
    const role = await roleFor(req.params.workspaceId, actor.uid);
    if (!role) {
      fail(res, 403, "WORKSPACE_MEMBERSHIP_REQUIRED", "Workspace membership is not granted.");
      return;
    }
    res.json({ role });
  } catch (error) {
    req.log?.error({ err: error }, "Evidence role request failed");
    fail(res, 500, "EVIDENCE_REQUEST_FAILED", "The workspace role could not be loaded.");
  }
});

router.get("/evidence/workspaces/:workspaceId/agencies/:agencyKey", async (req, res) => {
  try {
    const { workspaceId, agencyKey } = req.params;
    const actor = await authorize(req, res, workspaceId);
    if (!actor) return;
    if (!agencyKeyPattern.test(agencyKey)) {
      fail(res, 400, "INVALID_AGENCY_KEY", "The source-native agency key is invalid.");
      return;
    }
    const after = req.get("x-after");
    const rows = await db.select()
      .from(sharedEvidenceRecordsTable)
      .where(and(
        eq(sharedEvidenceRecordsTable.workspaceId, workspaceId),
        eq(sharedEvidenceRecordsTable.agencyKey, agencyKey),
        after ? gt(sharedEvidenceRecordsTable.factId, after) : undefined,
      ))
      .orderBy(asc(sharedEvidenceRecordsTable.factId))
      .limit(51);
    const valid = rows.map((row) => ({ row, evidence: readEvidence(row.payload) }))
      .filter((item): item is { row: typeof rows[number]; evidence: EvidencePayload } => !!item.evidence);
    const records = valid.slice(0, 50);
    res.json({
      records: records.map(({ row, evidence }) => ({
        evidence,
        authorUid: row.authorUid,
        authorIdentityMapped: row.authorIdentityMapped,
        publishedAt: row.publishedAt.toISOString(),
      })),
      withheld: rows.length - valid.length,
      next: valid.length > 50 ? records.at(-1)?.row.factId ?? null : null,
    });
  } catch (error) {
    req.log?.error({ err: error }, "Evidence list request failed");
    fail(res, 500, "EVIDENCE_REQUEST_FAILED", "Evidence could not be loaded.");
  }
});

router.post("/evidence", async (req, res) => {
  try {
    const workspaceId = req.body?.workspaceId;
    const evidence = readEvidence(req.body?.evidence);
    if (typeof workspaceId !== "string" || !workspaceIdPattern.test(workspaceId) || !evidence) {
      fail(res, 400, "INVALID_EVIDENCE", "The evidence record is invalid or lacks a supported public source.");
      return;
    }
    const actor = await authorize(req, res, workspaceId, ["editor"]);
    if (!actor) return;
    const [existing] = await db.select()
      .from(sharedEvidenceRecordsTable)
      .where(and(
        eq(sharedEvidenceRecordsTable.workspaceId, workspaceId),
        eq(sharedEvidenceRecordsTable.agencyKey, evidence.agencyKey),
        eq(sharedEvidenceRecordsTable.factId, evidence.factId),
      ))
      .limit(1);
    if (existing) {
      if (stableJson(existing.payload) !== stableJson(evidence)) {
        fail(res, 409, "EVIDENCE_ID_CONFLICT", "A different immutable record already uses this fact ID.");
        return;
      }
      res.json({ result: "exists" });
      return;
    }
    const [created] = await db.insert(sharedEvidenceRecordsTable).values({
      workspaceId,
      agencyKey: evidence.agencyKey,
      factId: evidence.factId,
      payload: evidence,
      authorUid: actor.uid,
      authorIdentityMapped: true,
    }).onConflictDoNothing().returning({ factId: sharedEvidenceRecordsTable.factId });
    if (!created) {
      fail(res, 409, "EVIDENCE_ID_CONFLICT", "A different immutable record already uses this fact ID.");
      return;
    }
    res.json({ result: "created" });
  } catch (error) {
    req.log?.error({ err: error }, "Evidence publish request failed");
    fail(res, 500, "EVIDENCE_REQUEST_FAILED", "Evidence could not be published.");
  }
});

router.get("/evidence/workspaces/:workspaceId/agencies/:agencyKey/facts/:factId/decisions", async (req, res) => {
  try {
    const { workspaceId, agencyKey, factId } = req.params;
    const actor = await authorize(req, res, workspaceId);
    if (!actor) return;
    if (!agencyKeyPattern.test(agencyKey) || !factIdPattern.test(factId)) {
      fail(res, 400, "INVALID_EVIDENCE_ID", "The evidence identifier is invalid.");
      return;
    }
    const rows = await decisionRows(workspaceId, agencyKey, factId);
    const decisions: EvidenceDecision[] = [];
    let invalid = 0;
    for (const row of rows) {
      const parsed = readDecision(row.payload, factId, row.action, row.reviewerIdentityMapped);
      if (parsed) decisions.push(parsed);
      else invalid += 1;
      if (parsed && !parsed.reviewerIdentityMapped) invalid += 1;
    }
    res.json({ decisions, invalid, status: decisionStatus(decisions, invalid) });
  } catch (error) {
    req.log?.error({ err: error }, "Evidence decision list request failed");
    fail(res, 500, "EVIDENCE_REQUEST_FAILED", "Review history could not be loaded.");
  }
});

router.post("/evidence/workspaces/:workspaceId/agencies/:agencyKey/facts/:factId/decisions", async (req, res) => {
  try {
    const { workspaceId, agencyKey, factId } = req.params;
    const draft = decisionDraft(req.body?.draft, factId);
    if (req.body?.workspaceId !== workspaceId || req.body?.agencyKey !== agencyKey ||
        !agencyKeyPattern.test(agencyKey) || !draft) {
      fail(res, 400, "INVALID_DECISION", "The review decision is invalid.");
      return;
    }
    const actor = await authorize(req, res, workspaceId, ["reviewer"]);
    if (!actor) return;
    const [evidenceRow] = await db.select()
      .from(sharedEvidenceRecordsTable)
      .where(and(
        eq(sharedEvidenceRecordsTable.workspaceId, workspaceId),
        eq(sharedEvidenceRecordsTable.agencyKey, agencyKey),
        eq(sharedEvidenceRecordsTable.factId, factId),
      ))
      .limit(1);
    if (!evidenceRow || !readEvidence(evidenceRow.payload)) {
      fail(res, 404, "EVIDENCE_NOT_FOUND", "This evidence item is unavailable for review.");
      return;
    }
    const priorRows = await decisionRows(workspaceId, agencyKey, factId);
    const prior = priorRows.map((row) => readDecision(row.payload, factId, row.action, row.reviewerIdentityMapped)).filter(Boolean) as EvidenceDecision[];
    const invalidPrior = priorRows.length !== prior.length;
    if (draft.action === "approved" && (
      !evidenceRow.authorIdentityMapped ||
      actor.uid === evidenceRow.authorUid ||
      invalidPrior ||
      decisionStatus(prior, prior.filter((decision) => !decision.reviewerIdentityMapped).length) !== "pending"
    )) {
      fail(res, 409, "REVIEW_NOT_ALLOWED", "Approval requires a different reviewer and an unresolved evidence item.");
      return;
    }
    if (draft.action === "superseded") {
      const [replacement] = await db.select()
        .from(sharedEvidenceRecordsTable)
        .where(and(
          eq(sharedEvidenceRecordsTable.workspaceId, workspaceId),
          eq(sharedEvidenceRecordsTable.agencyKey, agencyKey),
          eq(sharedEvidenceRecordsTable.factId, draft.replacementId),
        ))
        .limit(1);
      const replacementEvidence = replacement && readEvidence(replacement.payload);
      if (!replacement || !replacementEvidence || replacementEvidence.kind !== evidenceRow.payload.kind ||
          !replacement.authorIdentityMapped ||
          replacementEvidence.sourceName !== evidenceRow.payload.sourceName ||
          replacementEvidence.sourceRecordId !== evidenceRow.payload.sourceRecordId) {
        fail(res, 409, "INVALID_REPLACEMENT", "A superseding item must be a matching, documented replacement.");
        return;
      }
      const replacementRows = await decisionRows(workspaceId, agencyKey, draft.replacementId);
      const replacementApproval = replacementRows
        .map((row) => readDecision(row.payload, draft.replacementId, row.action, row.reviewerIdentityMapped))
        .find((decision) => decision?.action === "approved" && decision.reviewerIdentityMapped);
      if (!replacementApproval || replacementApproval.reviewerUid === replacement.authorUid) {
        fail(res, 409, "REPLACEMENT_NOT_APPROVED", "The replacement evidence must be approved by a different reviewer first.");
        return;
      }
    }
    const reviewedAt = new Date().toISOString();
    const decision: EvidenceDecision = {
      ...draft,
      factId,
      reviewerUid: actor.uid,
      reviewerIdentityMapped: true,
      reviewedAt,
    };
    const [existing] = priorRows.filter((row) => row.action === draft.action);
    if (existing) {
      const previous = readDecision(existing.payload, factId, existing.action);
      if (previous && previous.reason === decision.reason && previous.replacementId === decision.replacementId &&
          previous.reviewerUid === actor.uid) {
        res.json({ result: "exists" });
        return;
      }
      fail(res, 409, "DECISION_IMMUTABLE", "A different decision already exists for this action.");
      return;
    }
    const [created] = await db.insert(sharedEvidenceDecisionsTable).values({
      workspaceId,
      agencyKey,
      factId,
      action: decision.action,
      payload: decision,
      reviewerUid: actor.uid,
      reviewerIdentityMapped: true,
    }).onConflictDoNothing().returning({ action: sharedEvidenceDecisionsTable.action });
    if (!created) {
      fail(res, 409, "DECISION_IMMUTABLE", "A different decision already exists for this action.");
      return;
    }
    res.json({ result: "created" });
  } catch (error) {
    req.log?.error({ err: error }, "Evidence decision request failed");
    fail(res, 500, "EVIDENCE_REQUEST_FAILED", "The review decision could not be recorded.");
  }
});

export default router;
