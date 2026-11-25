import type { Agency, SyncOutboxItem } from "../types";
import { applyAgencyMutation } from "../services/agencyMutation";
import { stripAgencyReviewOverlay } from "../services/agencyReviewOverlay";
import { stripBrowserLocalAgencySourceData } from "../services/agencySourceRecordStore";
import { canBulkHydrateAgency } from "./providerRecordTrust";
import type { AgencyDirectoryPage } from "../services/agencyDirectoryLoader";

type ApiFailure = { error?: { message?: string; code?: string } };
type AgencyResponse = { id: string; revision: number; agency: Agency };

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiFailure;
    throw new Error(payload.error?.message || `Replit API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

/** A private read; public/redacted or malformed responses do not establish acknowledgment. */
export async function fetchAgencyReviewAcknowledgments(agencyId:string,signal?:AbortSignal):Promise<unknown[]|null>{
 const row=await apiRequest<AgencyResponse>(`/agencies/${encodeURIComponent(agencyId)}`,{signal});
 if(row.id!==agencyId||row.agency?.id!==agencyId||!Number.isSafeInteger(row.revision)||row.revision<1)return null;
 return Array.isArray(row.agency._factReviews)?row.agency._factReviews:null;
}
function encodeCursor(cursor?: string) {
  return cursor ? `&after=${encodeURIComponent(cursor)}` : "";
}

export async function fetchAgencyDirectoryPage(cursor?: string): Promise<AgencyDirectoryPage> {
  const page = await apiRequest<{ records: AgencyResponse[]; nextCursor: string | null }>(
    `/agencies?limit=500${encodeCursor(cursor)}`,
  );
  return {
    agencies: page.records.map((row) => stripBrowserLocalAgencySourceData(row.agency)),
    cursor: page.nextCursor ?? undefined,
  };
}

async function fetchAllAgencyPages(stateCode?: string): Promise<Agency[]> {
  const agencies: Agency[] = [];
  let cursor: string | undefined;
  do {
    const stateQuery = stateCode ? `&stateCode=${encodeURIComponent(stateCode.toUpperCase())}` : "";
    const page = await apiRequest<{ records: AgencyResponse[]; nextCursor: string | null }>(
      `/agencies?limit=500${stateQuery}${encodeCursor(cursor)}`,
    );
    agencies.push(...page.records.map((row) => stripBrowserLocalAgencySourceData(row.agency)));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return agencies;
}

export async function fetchAgenciesFromReplit(stateCode?: string, county?: string): Promise<Agency[]> {
  const agencies = await fetchAllAgencyPages(stateCode && stateCode.toLowerCase() !== "all" ? stateCode : undefined);
  return county && county.toLowerCase() !== "all"
    ? agencies.filter((agency) => agency.county === county)
    : agencies;
}

export function subscribeToReplitAgencies(
  onAgenciesUpdate: (agencies: Agency[]) => void,
  stateCode?: string,
  onError?: (error: unknown) => void,
): () => void {
  let active = true;
  let loading = false;
  const refresh = async () => {
    if (!active || loading || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    loading = true;
    try {
      const agencies = await fetchAgenciesFromReplit(stateCode);
      if (active) onAgenciesUpdate(agencies);
    } catch (error) {
      if (active) onError?.(error);
    } finally {
      loading = false;
    }
  };
  void refresh();
  const interval = window.setInterval(() => void refresh(), 45_000);
  const onOnline = () => void refresh();
  window.addEventListener("online", onOnline);
  return () => {
    active = false;
    window.clearInterval(interval);
    window.removeEventListener("online", onOnline);
  };
}

export async function saveAgencyToReplit(agency: Agency): Promise<Agency> {
  if (!agency?.id) throw new Error("An agency identity is required.");
  const saved = await apiRequest<AgencyResponse>(`/agencies/${encodeURIComponent(agency.id)}`, {
    method: "PUT",
    body: JSON.stringify({
      expectedRevision: agency._revision ?? 0,
      agency: stripBrowserLocalAgencySourceData(stripAgencyReviewOverlay(agency)),
    }),
  });
  return saved.agency;
}

/** Hydration creates missing records only; it never replaces current Replit data. */
export async function batchSyncAgenciesToReplit(
  agencies: Agency[],
  maxRecords = 25,
): Promise<string[]> {
  const records = agencies
    .filter((agency) => agency.id && canBulkHydrateAgency(agency))
    .slice(0, Math.min(25, Math.max(0, maxRecords)))
    .map((agency) => stripBrowserLocalAgencySourceData(stripAgencyReviewOverlay(agency)));
  if (!records.length) return [];
  const response = await apiRequest<{ createdIds: string[] }>("/agencies/batch-create", {
    method: "POST",
    body: JSON.stringify({ records }),
  });
  return response.createdIds;
}

export async function commitAgencyMutation(item: SyncOutboxItem): Promise<number> {
  let current: Agency | undefined;
  try {
    current = (await apiRequest<AgencyResponse>(`/agencies/${encodeURIComponent(item.agencyId)}`)).agency;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("not found")) throw error;
  }
  const next = applyAgencyMutation(current, item, true);
  const response = await apiRequest<AgencyResponse>(
    `/agencies/${encodeURIComponent(item.agencyId)}/mutations`,
    {
      method: "POST",
      body: JSON.stringify({
        mutationId: item.id,
        expectedRevision: current?._revision ?? 0,
        agency: stripBrowserLocalAgencySourceData(stripAgencyReviewOverlay(next)),
      }),
    },
  );
  return response.revision;
}

export async function checkReplitBackend(): Promise<boolean> {
  try {
    const response = await fetch("/api/healthz", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}
