import type {
  Agency,
  AgencySourceFactCorrection,
  AgencySourceFact,
  AgencySourceRecordAssociation,
} from "../types";

const STORAGE_KEY = "ems_territory_agency_source_records_v1";
const MAX_STORAGE_CHARACTERS = 4_000_000;
export const AGENCY_SOURCE_RECORD_BACKUP_FORMAT =
  "ems-territory-agency-source-records";
const AGENCY_SOURCE_RECORD_BACKUP_VERSION = 1;
const MAX_BACKUP_CHARACTERS = 5_000_000;

const UNSAFE_AGENCY_IDS = new Set(["__proto__", "constructor", "prototype"]);

export interface AgencySourceRecordData {
  sourceRecordAssociations: AgencySourceRecordAssociation[];
  sourceFacts: AgencySourceFact[];
}

export type AgencySourceRecordDataMap = Record<string, AgencySourceRecordData>;

export type AgencySourceRecordBackupParseResult =
  | {
      ok: true;
      data: AgencySourceRecordDataMap;
      associationCount: number;
      factCount: number;
    }
  | { ok: false; reason: string };

export interface AgencySourceRecordMergeResult {
  data: AgencySourceRecordDataMap;
  associationsAdded: number;
  factsAdded: number;
  duplicatesSkipped: number;
  conflictsSkipped: number;
}

export type AgencySourceRecordRestoreResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      associationsAdded: number;
      factsAdded: number;
      duplicatesSkipped: number;
      conflictsSkipped: number;
      unmatchedAgencyCount: number;
    };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isSafeAgencyId(value: string): boolean {
  return Boolean(value.trim()) && !UNSAFE_AGENCY_IDS.has(value);
}

function isValidBackupRecordData(
  value: unknown,
): value is AgencySourceRecordData {
  return (
    isRecord(value) &&
    Array.isArray(value.sourceRecordAssociations) &&
    value.sourceRecordAssociations.every(isAssociation) &&
    Array.isArray(value.sourceFacts) &&
    value.sourceFacts.every(isSourceFact)
  );
}

/**
 * Creates a portable, source-record-only backup. It deliberately excludes
 * agency profile fields and never writes to a cloud service.
 */
export function createAgencySourceRecordBackup(
  data: AgencySourceRecordDataMap,
  exportedAt = new Date().toISOString(),
): string {
  const records: AgencySourceRecordDataMap = {};
  for (const [agencyId, value] of Object.entries(data)) {
    if (!isSafeAgencyId(agencyId) || !isValidBackupRecordData(value)) {
      throw new Error("The saved source records contain an invalid agency entry.");
    }
    if (value.sourceRecordAssociations.length || value.sourceFacts.length) {
      records[agencyId] = value;
    }
  }

  const serialized = JSON.stringify({
    format: AGENCY_SOURCE_RECORD_BACKUP_FORMAT,
    version: AGENCY_SOURCE_RECORD_BACKUP_VERSION,
    exportedAt,
    records,
  });
  if (serialized.length > MAX_BACKUP_CHARACTERS) {
    throw new Error("The source-record backup exceeds the supported file size.");
  }
  return serialized;
}

/**
 * Validates a source-record backup before any local records are changed.
 */
export function parseAgencySourceRecordBackup(
  serialized: string,
): AgencySourceRecordBackupParseResult {
  if (serialized.length > MAX_BACKUP_CHARACTERS) {
    return {
      ok: false,
      reason: "This backup exceeds the supported 5 MB file size.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { ok: false, reason: "This file is not valid JSON." };
  }

  if (
    !isRecord(parsed) ||
    parsed.format !== AGENCY_SOURCE_RECORD_BACKUP_FORMAT ||
    parsed.version !== AGENCY_SOURCE_RECORD_BACKUP_VERSION ||
    typeof parsed.exportedAt !== "string" ||
    Number.isNaN(Date.parse(parsed.exportedAt)) ||
    !isRecord(parsed.records)
  ) {
    return {
      ok: false,
      reason: "This is not a supported agency source-record backup.",
    };
  }

  const data: AgencySourceRecordDataMap = {};
  let associationCount = 0;
  let factCount = 0;
  for (const [agencyId, value] of Object.entries(parsed.records)) {
    if (!isSafeAgencyId(agencyId)) {
      return {
        ok: false,
        reason: "The backup contains an invalid agency ID.",
      };
    }
    if (!isValidBackupRecordData(value)) {
      return {
        ok: false,
        reason: `The backup contains invalid source data for agency ${agencyId}.`,
      };
    }
    if (!value.sourceRecordAssociations.length && !value.sourceFacts.length) {
      continue;
    }
    data[agencyId] = {
      sourceRecordAssociations: value.sourceRecordAssociations,
      sourceFacts: value.sourceFacts,
    };
    associationCount += value.sourceRecordAssociations.length;
    factCount += value.sourceFacts.length;
  }

  if (associationCount + factCount === 0) {
    return {
      ok: false,
      reason: "This backup contains no source matches or agency facts.",
    };
  }

  return { ok: true, data, associationCount, factCount };
}

/**
 * Merges imported records without replacing current decisions or facts.
 * Association conflicts are keyed by source name and source record ID.
 */
export function mergeAgencySourceRecordDataMaps(
  current: AgencySourceRecordDataMap,
  incoming: AgencySourceRecordDataMap,
): AgencySourceRecordMergeResult {
  const data: AgencySourceRecordDataMap = { ...current };
  let associationsAdded = 0;
  let factsAdded = 0;
  let duplicatesSkipped = 0;
  let conflictsSkipped = 0;

  for (const [agencyId, incomingData] of Object.entries(incoming)) {
    if (!isSafeAgencyId(agencyId)) continue;
    const currentData = data[agencyId] ?? {
      sourceRecordAssociations: [],
      sourceFacts: [],
    };
    const associations = [...currentData.sourceRecordAssociations];
    const associationIndexes = new Map(
      associations.map((association, index) => [
        JSON.stringify([association.sourceName, association.sourceRecordId]),
        index,
      ]),
    );

    for (const association of incomingData.sourceRecordAssociations) {
      const key = JSON.stringify([
        association.sourceName,
        association.sourceRecordId,
      ]);
      const existingIndex = associationIndexes.get(key);
      if (existingIndex !== undefined) {
        if (
          JSON.stringify(associations[existingIndex]) ===
          JSON.stringify(association)
        ) {
          duplicatesSkipped += 1;
        } else {
          conflictsSkipped += 1;
        }
        continue;
      }
      associationIndexes.set(key, associations.length);
      associations.push(association);
      associationsAdded += 1;
    }

    const facts = [...currentData.sourceFacts];
    const factIndexes = new Map(facts.map((fact, index) => [fact.id, index]));
    for (const fact of incomingData.sourceFacts) {
      const existingIndex = factIndexes.get(fact.id);
      if (existingIndex !== undefined) {
        if (JSON.stringify(facts[existingIndex]) === JSON.stringify(fact)) {
          duplicatesSkipped += 1;
        } else {
          conflictsSkipped += 1;
        }
        continue;
      }
      factIndexes.set(fact.id, facts.length);
      facts.push(fact);
      factsAdded += 1;
    }

    if (associations.length || facts.length) {
      data[agencyId] = {
        sourceRecordAssociations: associations,
        sourceFacts: facts,
      };
    }
  }

  return {
    data,
    associationsAdded,
    factsAdded,
    duplicatesSkipped,
    conflictsSkipped,
  };
}

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
  const hasValidCorrection =
    value.correction === undefined || isSourceFactCorrection(value.correction);
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
    hasValidCorrection &&
    typeof value.enteredAt === "string"
  );
}

function isSourceFactCorrection(
  value: unknown,
): value is AgencySourceFactCorrection {
  if (!isRecord(value)) return false;
  const optionalStrings = [
    "profileFieldLabel",
    "previousUnit",
    "previousSourceName",
    "previousSourceRecordId",
    "previousReportingPeriod",
    "previousEffectivePeriod",
    "previousGeographicLevel",
    "previousGeographicId",
    "previousGeographicRelationship",
    "previousFactId",
  ];
  const hasValidPreviousUrl =
    value.previousSourceUrl === undefined ||
    (typeof value.previousSourceUrl === "string" &&
      isHttpsUrl(value.previousSourceUrl));
  const hasValidPreviousBasis =
    value.previousBasis === undefined ||
    value.previousBasis === "source-reported" ||
    value.previousBasis === "user-entered" ||
    value.previousBasis === "calculated";

  return (
    typeof value.previousValue === "string" &&
    Boolean(value.previousValue.trim()) &&
    typeof value.capturedAt === "string" &&
    !Number.isNaN(Date.parse(value.capturedAt)) &&
    optionalStrings.every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    hasValidPreviousUrl &&
    hasValidPreviousBasis
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
      if (!isSafeAgencyId(agencyId) || !isRecord(value)) continue;
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

export function applyAgencySourceRecordDataMap(
  agencies: Agency[],
  sourceDataByAgency: AgencySourceRecordDataMap,
): Agency[] {
  return agencies.map((agency) =>
    applyAgencySourceRecordData(agency, sourceDataByAgency[agency.id]),
  );
}

export function stripBrowserLocalAgencySourceData(agency: Agency): Agency {
  const shareableAgency = { ...agency };
  delete shareableAgency.sourceRecordAssociations;
  delete shareableAgency.sourceFacts;
  return shareableAgency;
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
  if (!isSafeAgencyId(agencyId)) {
    return { ok: false, reason: "Agency ID is invalid." };
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

  const records = loadAgencySourceRecordData(storage);
  records[agencyId] = {
    sourceRecordAssociations: data.sourceRecordAssociations,
    sourceFacts: data.sourceFacts,
  };
  return saveAgencySourceRecordDataMap(records, storage);
}

export function saveAgencySourceRecordDataMap(
  data: AgencySourceRecordDataMap,
  storage: StorageLike | undefined = browserStorage(),
): { ok: true } | { ok: false; reason: string } {
  if (!storage) {
    return { ok: false, reason: "Browser storage is unavailable." };
  }

  for (const [agencyId, value] of Object.entries(data)) {
    if (!isSafeAgencyId(agencyId) || !isValidBackupRecordData(value)) {
      return {
        ok: false,
        reason: "A saved source record contains an invalid agency ID or record.",
      };
    }
  }

  try {
    const serialized = JSON.stringify(data);
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
