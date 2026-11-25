import type { AuthUser } from "@workspace/replit-auth-web";
import { DECISION_ACTIONS, readDecision, sameDecision, summarizeDecisions, validDecisionDraft, type DecisionDraft, type EvidenceDecision } from "./sharedEvidenceGovernance";
import type { ReviewedEvidenceRow } from "./sharedOpportunityRadar";
import { readSharedEvidence, sameSharedEvidence, validWorkspaceId, type SharedEvidence } from "./sharedEvidence";

export type EvidenceSession = { workspace: string };
export type EvidenceRole = "viewer" | "editor" | "reviewer";
export type PublishedEvidence = {
  evidence: SharedEvidence;
  authorUid: string;
  authorIdentityMapped: boolean;
  publishedAt: string;
};

const env = import.meta.env ?? ({} as ImportMetaEnv);
const workspace = env.VITE_ATLAS_EVIDENCE_WORKSPACE_ID;
export const evidenceEnabled = env.VITE_ATLAS_EVIDENCE_ENABLED === "true" &&
  validWorkspaceId(workspace);

export function openEvidenceSession(): EvidenceSession {
  if (!evidenceEnabled || !validWorkspaceId(workspace)) throw new Error("Shared evidence is not configured.");
  return { workspace };
}

function assertSession(_session: EvidenceSession, user: AuthUser): void {
  if (!user.id) throw new Error("Sign in with an authorized workspace account.");
}

async function request<T>(session: EvidenceSession, user: AuthUser, path: string, init?: RequestInit): Promise<T> {
  assertSession(session, user);
  const response = await fetch(`/api/evidence${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    credentials: "include",
    cache: "no-store",
  });
  assertSession(session, user);
  const payload = await response.json().catch(() => ({})) as {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || `Replit evidence request failed (${response.status}).`);
  return payload as T;
}

const encode = (value: string) => encodeURIComponent(value);

export async function evidenceRole(session: EvidenceSession, user: AuthUser): Promise<EvidenceRole> {
  const response = await request<{ role: EvidenceRole }>(
    session,
    user,
    `/workspaces/${encode(session.workspace)}/role`,
  );
  if (!["viewer", "editor", "reviewer"].includes(response.role)) {
    throw new Error("Workspace membership has not been granted.");
  }
  return response.role;
}

export async function listSharedEvidence(session: EvidenceSession, user: AuthUser, agencyKey: string, cursor?: string) {
  const page = await request<{
    records: PublishedEvidence[];
    withheld: number;
    next: string | null;
  }>(
    session,
    user,
    `/workspaces/${encode(session.workspace)}/agencies/${encode(agencyKey)}`,
    { headers: cursor ? { "X-After": cursor } : undefined },
  );
  const records: PublishedEvidence[] = [];
  let withheld = page.withheld;
  for (const raw of page.records) {
    const evidence = readSharedEvidence(raw.evidence, agencyKey, raw.evidence?.factId);
    if (!evidence || typeof raw.authorUid !== "string" || typeof raw.authorIdentityMapped !== "boolean" ||
        !Number.isFinite(Date.parse(raw.publishedAt))) {
      withheld += 1;
      continue;
    }
    records.push({
      evidence,
      authorUid: raw.authorUid,
      authorIdentityMapped: raw.authorIdentityMapped,
      publishedAt: raw.publishedAt,
    });
  }
  return { records, withheld, next: page.next ?? undefined };
}

export async function publishSharedEvidence(
  session: EvidenceSession,
  user: AuthUser,
  evidence: SharedEvidence,
): Promise<"created" | "exists"> {
  assertSession(session, user);
  const clean = readSharedEvidence(evidence, evidence.agencyKey, evidence.factId);
  if (!clean) throw new Error("Invalid evidence.");
  if (await evidenceRole(session, user) !== "editor") {
    throw new Error("Editor membership is required to publish evidence.");
  }
  const result = await request<{ result: "created" | "exists" }>(session, user, "", {
    method: "POST",
    body: JSON.stringify({ workspaceId: session.workspace, evidence: clean }),
  });
  return result.result;
}

export async function loadEvidenceDecisions(session: EvidenceSession, user: AuthUser, record: PublishedEvidence) {
  assertSession(session, user);
  const evidence = record.evidence;
  if (!readSharedEvidence(evidence, evidence.agencyKey, evidence.factId)) {
    throw new Error("Invalid evidence identity.");
  }
  const response = await request<{
    decisions: EvidenceDecision[];
    invalid: number;
    status: ReturnType<typeof summarizeDecisions>;
  }>(
    session,
    user,
    `/workspaces/${encode(session.workspace)}/agencies/${encode(evidence.agencyKey)}/facts/${encode(evidence.factId)}/decisions`,
  );
  const decisions: EvidenceDecision[] = [];
  let invalid = response.invalid;
  for (const decision of response.decisions) {
    const parsed = readDecision(decision, evidence.factId, decision.action);
    if (!parsed) invalid += 1;
    else {
      const withIdentity = { ...parsed, reviewerIdentityMapped: decision.reviewerIdentityMapped };
      decisions.push(withIdentity);
    }
  }
  return { decisions, invalid, status: summarizeDecisions(decisions, invalid) };
}

export async function recordEvidenceDecision(
  session: EvidenceSession,
  user: AuthUser,
  record: PublishedEvidence,
  draft: DecisionDraft,
): Promise<"created" | "exists"> {
  assertSession(session, user);
  if (await evidenceRole(session, user) !== "reviewer") throw new Error("Reviewer membership is required.");
  const evidence = record.evidence;
  if (!readSharedEvidence(evidence, evidence.agencyKey, evidence.factId) ||
      !validDecisionDraft(draft, evidence.factId)) throw new Error("Invalid decision.");
  const result = await request<{ result: "created" | "exists" }>(
    session,
    user,
    `/workspaces/${encode(session.workspace)}/agencies/${encode(evidence.agencyKey)}/facts/${encode(evidence.factId)}/decisions`,
    {
      method: "POST",
      body: JSON.stringify({
        workspaceId: session.workspace,
        agencyKey: evidence.agencyKey,
        draft,
      }),
    },
  );
  return result.result;
}

/** Two bounded server reads of evidence and decision histories, not an atomic database snapshot. */
export async function loadReviewedRadarRows(
  session: EvidenceSession,
  user: AuthUser,
  agencyKey: string,
): Promise<{ rows: ReviewedEvidenceRow[]; checkedAt: string }> {
  await evidenceRole(session, user);
  const page = await listSharedEvidence(session, user, agencyKey);
  if (page.next || page.withheld || page.records.length >= 50) {
    throw new Error("Reviewed signals require a complete first page with fewer than 50 valid published records.");
  }
  async function readRows(records: PublishedEvidence[]) {
    const rows: ReviewedEvidenceRow[] = [];
    for (let index = 0; index < records.length; index += 6) {
      const batch = await Promise.all(records.slice(index, index + 6).map(async (record) => {
        const history = await loadEvidenceDecisions(session, user, record);
        if (history.invalid || history.status === "unavailable") {
          throw new Error("One or more review histories are unavailable.");
        }
        return {
          ...record,
          invalid: history.invalid,
          decisions: [...history.decisions].sort((a, b) => a.action.localeCompare(b.action)),
        };
      }));
      rows.push(...batch);
    }
    return rows;
  }
  const first = await readRows(page.records);
  const confirm = await listSharedEvidence(session, user, agencyKey);
  if (confirm.next || confirm.withheld || JSON.stringify(confirm.records) !== JSON.stringify(page.records)) {
    throw new Error("Shared evidence changed during review. Refresh and try again.");
  }
  const second = await readRows(confirm.records);
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error("Review decisions changed during evaluation. Refresh and try again.");
  }
  await evidenceRole(session, user);
  return { rows: second, checkedAt: new Date().toISOString() };
}
