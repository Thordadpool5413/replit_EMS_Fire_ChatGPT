export type JsonRecord = Record<string, unknown>;
export type AgencyInput = JsonRecord & { id: string };
export type LegacyInput = { collection: string; path: string; payload: JsonRecord };
export type MembershipInput = { workspaceId: string; userId: string; role: "viewer" | "editor" | "reviewer" };
export type SharedEvidenceInput = {
  workspaceId: string;
  agencyKey: string;
  factId: string;
  payload: JsonRecord;
  authorUid: string;
  authorIdentityMapped: boolean;
  publishedAt: string;
};
export type SharedDecisionInput = {
  workspaceId: string;
  agencyKey: string;
  factId: string;
  action: string;
  payload: JsonRecord;
  reviewerUid: string;
  reviewerIdentityMapped: boolean;
  reviewedAt: string;
};
export type MigrationInput = {
  createdAt?: string;
  agencies: AgencyInput[];
  legacyRecords: LegacyInput[];
  memberships: MembershipInput[];
  sharedEvidence: SharedEvidenceInput[];
  evidenceDecisions: SharedDecisionInput[];
};

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeKey(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 300;
}

function timestamp(value: unknown): string | undefined {
  const input = typeof value === "string" ? Date.parse(value)
    : isObject(value) && typeof (value.seconds ?? value._seconds) === "number"
      ? Number(value.seconds ?? value._seconds) * 1000
      : Number.NaN;
  return Number.isFinite(input) ? new Date(input).toISOString() : undefined;
}

function nestedWorkspacePath(path: string, kind: "members" | "agencies") {
  const parts = path.split("/");
  if (kind === "members" && parts.length === 4 && parts[0] === "workspaces" && parts[2] === "members") {
    return { workspaceId: parts[1], userId: parts[3] };
  }
  if (kind === "agencies" && parts.length === 6 && parts[0] === "workspaces" &&
      parts[2] === "agencies" && parts[4] === "evidence") {
    return { workspaceId: parts[1], agencyKey: parts[3], factId: parts[5] };
  }
  return undefined;
}

function parseMembershipRows(rows: LegacyInput[]): MembershipInput[] {
  const memberships: MembershipInput[] = [];
  for (const row of rows) {
    const path = nestedWorkspacePath(row.path, "members");
    const workspaceId = typeof row.payload.workspaceId === "string" ? row.payload.workspaceId : path?.workspaceId;
    const userId = typeof row.payload.replitUserId === "string" ? row.payload.replitUserId
      : row.payload.identityProvider === "replit" && typeof row.payload.userId === "string" ? row.payload.userId
        : undefined;
    const role = row.payload.role;
    if (!workspaceId || !workspaceIdPattern.test(workspaceId) || !userId || !safeKey(userId) ||
        (role !== "viewer" && role !== "editor" && role !== "reviewer")) continue;
    memberships.push({ workspaceId, userId, role });
  }
  return memberships;
}

function validEvidencePayload(value: unknown, agencyKey: string, factId: string): value is JsonRecord {
  if (!isObject(value)) return false;
  const r = value;
  const bounded = (field: unknown, max: number): field is string => typeof field === "string" && !!field.trim() && field.length <= max;
  const day = (field: unknown): field is string => typeof field === "string" && /^\d{4}-\d{2}-\d{2}$/.test(field) &&
    Number.isFinite(Date.parse(field)) && new Date(field).toISOString().slice(0, 10) === field;
  const urlValid = (field: unknown): field is string => {
    if (typeof field !== "string") return false;
    try {
      const url = new URL(field);
      return url.protocol === "https:" && !url.username && !url.password && (url.pathname.length > 1 || !!url.search);
    } catch {
      return false;
    }
  };
  const kinds = new Set([
    "installed-monitor", "installed-cpr", "installed-ventilator", "installed-epcr", "installed-cad", "installed-billing",
    "contract-expiration", "procurement-open", "procurement-awarded", "procurement-closed", "grant-awarded", "capital-approved",
  ]);
  if (r.agencyKey !== agencyKey || r.factId !== factId || typeof r.stateCode !== "string" || !/^[A-Z]{2}$/.test(r.stateCode) ||
      typeof r.kind !== "string" || !kinds.has(r.kind) || !bounded(r.agencyName, 240) || !bounded(r.value, 500) ||
      !bounded(r.sourceName, 160) || !bounded(r.sourceRecordId, 160) || !urlValid(r.sourceUrl) ||
      !day(r.documentDate) || typeof r.dueDate !== "string" || r.dueDate.length > 10 ||
      !bounded(r.enteredAt, 40) || !Number.isFinite(Date.parse(r.enteredAt)) ||
      Date.parse(r.enteredAt) > Date.now() || r.documentDate > new Date().toISOString().slice(0, 10) ||
      r.documentDate > r.enteredAt.slice(0, 10)) return false;
  if ((agencyKey.startsWith("FDID:") || agencyKey.startsWith("STATE-EMS:")) && agencyKey.split(":")[1] !== r.stateCode) return false;
  if (["installed-monitor", "installed-cpr", "installed-ventilator", "installed-epcr", "installed-cad", "installed-billing"].includes(r.kind) &&
      /\b(?:unknown|no|without|not|proposed|recommended|considering|planned|requested|bid solicitation|previously used|formerly|retired|removed|out of service|decommissioned|discontinued|replaced|disposed|sold|surplus|trade.in|demonstration|demo|loaner)\b/i.test(String(r.value))) return false;
  if (r.kind === "contract-expiration" && (!day(r.value) || r.value < r.documentDate)) return false;
  if (r.kind === "procurement-open" && (!day(r.dueDate) || r.dueDate < r.documentDate)) return false;
  if (r.dueDate && r.kind !== "procurement-open") return false;
  return true;
}

function parseSharedEvidenceRows(rows: LegacyInput[]): SharedEvidenceInput[] {
  const records: SharedEvidenceInput[] = [];
  for (const row of rows) {
    const path = nestedWorkspacePath(row.path, "agencies");
    const workspaceId = typeof row.payload.workspaceId === "string" ? row.payload.workspaceId : path?.workspaceId;
    const agencyKey = typeof row.payload.agencyKey === "string" ? row.payload.agencyKey : path?.agencyKey;
    const factId = typeof row.payload.factId === "string" ? row.payload.factId : path?.factId;
    const evidence = isObject(row.payload.evidence) ? row.payload.evidence
      : Object.fromEntries(Object.entries(row.payload).filter(([key]) => !["authorUid", "publishedAt", "workspaceId"].includes(key)));
    const authorUid = typeof row.payload.replitAuthorId === "string" ? row.payload.replitAuthorId : row.payload.authorUid;
    const authorIdentityMapped = typeof row.payload.replitAuthorId === "string" ||
      (row.payload.identityProvider === "replit" && row.payload.authorIdentityMapped === true);
    const publishedAt = timestamp(row.payload.publishedAt);
    if (!workspaceId || !workspaceIdPattern.test(workspaceId) || typeof agencyKey !== "string" || !agencyKeyPattern.test(agencyKey) ||
        typeof factId !== "string" || !factIdPattern.test(factId) || typeof authorUid !== "string" ||
        !safeKey(authorUid) || !publishedAt || !validEvidencePayload(evidence, agencyKey, factId)) continue;
    records.push({ workspaceId, agencyKey, factId, payload: evidence, authorUid, authorIdentityMapped, publishedAt });
  }
  return records;
}

function parseDecisionRows(rows: LegacyInput[]): SharedDecisionInput[] {
  const records: SharedDecisionInput[] = [];
  for (const row of rows) {
    const payload = row.payload;
    const pathParts = row.path.split("/");
    const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : pathParts[1];
    const agencyKey = typeof payload.agencyKey === "string" ? payload.agencyKey : pathParts[3];
    const factId = typeof payload.factId === "string" ? payload.factId : pathParts[5];
    const action = typeof payload.action === "string" ? payload.action : pathParts[7];
    const reviewerUid = typeof payload.replitReviewerId === "string" ? payload.replitReviewerId : payload.reviewerUid;
    const reviewerIdentityMapped = typeof payload.replitReviewerId === "string" ||
      (payload.identityProvider === "replit" && payload.reviewerIdentityMapped === true);
    const reviewedAt = timestamp(payload.reviewedAt);
    const reasons: Record<string, string[]> = {
      approved: ["source-checked"],
      challenged: ["source-conflict", "identity-mismatch", "scope-unclear", "outdated", "incorrect-value", "unreliable-source"],
      withdrawn: ["source-retracted", "incorrect-value", "privacy-concern", "unreliable-source"],
      superseded: ["corrected-evidence"],
    };
    const replacementId = payload.replacementId;
    if (!workspaceId || !workspaceIdPattern.test(workspaceId) || !agencyKeyPattern.test(agencyKey ?? "") ||
        !factId || !factIdPattern.test(factId) || typeof action !== "string" || !reasons[action] ||
        typeof payload.reason !== "string" || !reasons[action].includes(payload.reason) ||
        typeof replacementId !== "string" || (action === "superseded" ? !safeKey(replacementId) || replacementId === factId : replacementId !== "") ||
        typeof reviewerUid !== "string" || !safeKey(reviewerUid) || !reviewedAt) continue;
    records.push({
      workspaceId, agencyKey, factId, action,
      payload: { action, reason: payload.reason, replacementId, factId, reviewerUid, reviewedAt },
      reviewerUid, reviewerIdentityMapped, reviewedAt,
    });
  }
  return records;
}

const workspaceIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const agencyKeyPattern = /^(?:NPI:\d{10}|NERIS:[A-Z0-9.-]{1,80}|FDID:[A-Z]{2}:[A-Z0-9.-]{1,80}|STATE-EMS:[A-Z]{2}:(?:agency-code|license):[A-Z0-9.-]{1,80})$/;
const factIdPattern = /^[A-Za-z0-9_-]{1,100}$/;

function parseAgency(value: unknown): AgencyInput {
  if (!isObject(value)) throw new Error("The export contains an invalid agency record.");
  const record = isObject(value.payload) ? { ...value.payload, id: value.id ?? value.payload.id }
    : isObject(value.data) ? { ...value.data, id: value.id ?? value.data.id }
      : value;
  if (!safeKey(record.id) || typeof record.name !== "string") {
    throw new Error("The export contains an invalid agency record.");
  }
  return record as AgencyInput;
}

function parseCollectionRows(value: unknown, collection: string): LegacyInput[] {
  if (!Array.isArray(value)) throw new Error(`The ${collection} export must be an array.`);
  return value.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`The ${collection} export contains an invalid row.`);
    const path = safeKey(entry.path) ? entry.path : safeKey(entry.id) ? entry.id : String(index);
    const payload = isObject(entry.payload) ? entry.payload : isObject(entry.data) ? entry.data : entry;
    return { collection, path, payload };
  });
}

export function parseMigration(input: unknown): MigrationInput {
  if (!isObject(input)) throw new Error("The export must be a JSON object.");

  if (input.format === "ems-workspace" && input.version === 1 && Array.isArray(input.agencies)) {
    const agencies = input.agencies.map(parseAgency);
    const legacyRecords: LegacyInput[] = [];
    if (isObject(input.storage)) {
      for (const [key, value] of Object.entries(input.storage)) {
        if (typeof value === "string") {
          legacyRecords.push({
            collection: "browser_backup_storage",
            path: `${String(input.createdAt ?? "unknown")}/${key}`,
            payload: { key, value },
          });
        }
      }
    }
    return {
      createdAt: typeof input.createdAt === "string" ? input.createdAt : undefined,
      agencies,
      legacyRecords,
      memberships: [],
      sharedEvidence: [],
      evidenceDecisions: [],
    };
  }

  if (input.format === "ems-record-export" && input.version === 1 && isObject(input.collections)) {
    const collections = input.collections;
    const agencies = Array.isArray(collections.agencies) ? collections.agencies.map(parseAgency) : [];
    const legacyRecords: LegacyInput[] = [];
    const notes = collections.field_notes === undefined
      ? []
      : parseCollectionRows(collections.field_notes, "field_notes");
    const agenciesById = new Map(agencies.map((agency) => [agency.id, agency]));
    for (const row of notes) {
      const agencyId = row.payload.agencyId;
      if (typeof agencyId !== "string") continue;
      const agency = agenciesById.get(agencyId);
      if (!agency) continue;
      const noteId = typeof row.payload.id === "string" ? row.payload.id : row.path.split("/").at(-1);
      const existing = Array.isArray(agency.fieldNotes) ? agency.fieldNotes : [];
      if (existing.some((note) => isObject(note) && note.id === noteId)) continue;
      agency.fieldNotes = [...existing, { ...row.payload, ...(noteId ? { id: noteId } : {}) }];
    }
    for (const [collection, rows] of Object.entries(collections)) {
      if (collection === "agencies") continue;
      if (collection === "field_notes") {
        legacyRecords.push(...notes);
      } else {
        legacyRecords.push(...parseCollectionRows(rows, collection));
      }
    }
    return {
      createdAt: typeof input.createdAt === "string" ? input.createdAt : undefined,
      agencies,
      legacyRecords,
      memberships: parseMembershipRows(legacyRecords.filter((row) => ["workspace_memberships", "workspace_members", "members"].includes(row.collection))),
      sharedEvidence: parseSharedEvidenceRows(legacyRecords.filter((row) => ["shared_evidence_records", "evidence"].includes(row.collection))),
      evidenceDecisions: parseDecisionRows(legacyRecords.filter((row) => ["shared_evidence_decisions", "decisions"].includes(row.collection))),
    };
  }

  throw new Error("Unsupported export. Expected an EMS workspace backup or ems-record-export version 1.");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
