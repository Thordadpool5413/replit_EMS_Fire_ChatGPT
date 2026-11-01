import type {
  Agency,
  AgencySourceFact,
  AgencySourceRecordAssociation,
} from "../types";

const STORAGE_KEY = "ems_territory_agency_source_records_v1";
const MAX_STORAGE_CHARACTERS = 4_000_000;

export interface AgencySourceRecordData {
  sourceRecordAssociations: AgencySourceRecordAssociation[];
  sourceFacts: AgencySourceFact[];
}

export type AgencySourceRecordDataMap = Record<string, AgencySourceRecordData>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function findAgencySourceRecordAssociation(
  associations: AgencySourceRecordAssociation[],
  sourceName: string,
  sourceRecordId: string,
): AgencySourceRecordAssociation | undefined {
  return associations.find(
    (association) =>
      association.sourceName === sourceName &&
      association.sourceRecordId === sourceRecordId,
  );
}

export function replaceAgencySourceRecordAssociation(
  associations: AgencySourceRecordAssociation[],
  next: AgencySourceRecordAssociation,
): AgencySourceRecordAssociation[] {
  return [
    next,
    ...associations.filter(
      (association) =>
        association.sourceName !== next.sourceName ||
        association.sourceRecordId !== next.sourceRecordId,
    ),
  ];
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isAssociation(value: unknown): value is AgencySourceRecordAssociation {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.sourceName === "string" &&
    typeof value.sourceRecordId === "string" &&
    typeof value.sourceUrl === "string" &&
    isHttpsUrl(value.sourceUrl) &&
    (value.decision === "confirmed" || value.decision === "rejected") &&
    typeof value.matchBasis === "string" &&
    typeof value.retrievedAt === "string" &&
    typeof value.decidedAt === "string" &&
    isRecord(value.sourceFields)
  );
}

function isSourceFact(value: unknown): value is AgencySourceFact {
  if (!isRecord(value)) return false;
  const hasValidUrl =
    value.sourceUrl === undefined ||
    (typeof value.sourceUrl === "string" && isHttpsUrl(value.sourceUrl));
  return (
    typeof value.id === "string" &&
    typeof value.fieldKey === "string" &&
    typeof value.value === "string" &&
    typeof value.sourceName === "string" &&
    typeof value.sourceRecordId === "string" &&
    hasValidUrl &&
    typeof value.geographicLevel === "string" &&
    typeof value.geographicId === "string" &&
    (value.basis === "source-reported" ||
      value.basis === "user-entered" ||
      value.basis === "calculated") &&
    typeof value.enteredAt === "string"
  );
}

export function loadAgencySourceRecordData(
  storage: StorageLike | undefined = browserStorage(),
): AgencySourceRecordDataMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const result: AgencySourceRecordDataMap = {};
    for (const [agencyId, value] of Object.entries(parsed)) {
      if (!agencyId || !isRecord(value)) continue;
      const associations = Array.isArray(value.sourceRecordAssociations)
        ? value.sourceRecordAssociations.filter(isAssociation)
        : [];
      const facts = Array.isArray(value.sourceFacts)
        ? value.sourceFacts.filter(isSourceFact)
        : [];
      if (associations.length || facts.length) {
        result[agencyId] = {
          sourceRecordAssociations: associations,
          sourceFacts: facts,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function applyAgencySourceRecordData(
  agency: Agency,
  data?: AgencySourceRecordData,
): Agency {
  if (!data) return agency;
  return {
    ...agency,
    sourceRecordAssociations: data.sourceRecordAssociations,
    sourceFacts: data.sourceFacts,
  };
}

export function saveAgencySourceRecordData(
  agencyId: string,
  data: AgencySourceRecordData,
  storage: StorageLike | undefined = browserStorage(),
): { ok: true } | { ok: false; reason: string } {
  if (!storage) {
    return { ok: false, reason: "Browser storage is unavailable." };
  }
  if (!agencyId.trim()) {
    return { ok: false, reason: "Agency ID is required." };
  }
  if (
    !data.sourceRecordAssociations.every(isAssociation) ||
    !data.sourceFacts.every(isSourceFact)
  ) {
    return {
      ok: false,
      reason: "A source record is missing a valid ID, date, or HTTPS citation.",
    };
  }

  try {
    const records = loadAgencySourceRecordData(storage);
    records[agencyId] = {
      sourceRecordAssociations: data.sourceRecordAssociations,
      sourceFacts: data.sourceFacts,
    };
    const serialized = JSON.stringify(records);
    if (serialized.length > MAX_STORAGE_CHARACTERS) {
      return {
        ok: false,
        reason: "The saved source records exceed this browser’s storage limit.",
      };
    }
    storage.setItem(STORAGE_KEY, serialized);
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "The source records could not be saved in this browser.",
    };
  }
}
