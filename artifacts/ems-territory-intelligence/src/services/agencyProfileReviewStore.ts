const STORAGE_KEY = "ems_territory_profile_reviews_v1";
const UNSAFE_AGENCY_IDS = new Set(["__proto__", "constructor", "prototype"]);

type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type AgencyProfileReviewMap = Record<string, string>;

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isSafeAgencyId(value: string): boolean {
  return Boolean(value.trim()) && !UNSAFE_AGENCY_IDS.has(value);
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/**
 * Stores only a browser-local timestamp that the user reviewed the displayed
 * agency profile. It does not change agency data or assert independent
 * verification.
 */
export function loadAgencyProfileReviewMap(
  storage: StorageLike | undefined = browserStorage(),
): AgencyProfileReviewMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    const reviews: AgencyProfileReviewMap = {};
    for (const [agencyId, reviewedAt] of Object.entries(parsed)) {
      if (isSafeAgencyId(agencyId) && isValidTimestamp(reviewedAt)) {
        reviews[agencyId] = reviewedAt;
      }
    }
    return reviews;
  } catch {
    return {};
  }
}

export function getAgencyProfileReviewedAt(
  agencyId: string,
  storage: StorageLike | undefined = browserStorage(),
): string | null {
  if (!isSafeAgencyId(agencyId)) return null;
  return loadAgencyProfileReviewMap(storage)[agencyId] ?? null;
}

export function saveAgencyProfileReviewedAt(
  agencyId: string,
  reviewedAt = new Date().toISOString(),
  storage: StorageLike | undefined = browserStorage(),
): boolean {
  if (!storage || !isSafeAgencyId(agencyId) || !isValidTimestamp(reviewedAt)) {
    return false;
  }
  try {
    const reviews = loadAgencyProfileReviewMap(storage);
    reviews[agencyId] = reviewedAt;
    storage.setItem(STORAGE_KEY, JSON.stringify(reviews));
    return true;
  } catch {
    return false;
  }
}
