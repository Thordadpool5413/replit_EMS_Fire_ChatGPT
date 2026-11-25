export type JsonRecord = Record<string, unknown>;
export type AgencyInput = JsonRecord & { id: string };
export type LegacyInput = { collection: string; path: string; payload: JsonRecord };
export type MigrationInput = {
  createdAt?: string;
  agencies: AgencyInput[];
  legacyRecords: LegacyInput[];
};

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeKey(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 300;
}

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
    return { createdAt: typeof input.createdAt === "string" ? input.createdAt : undefined, agencies, legacyRecords };
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
    return { createdAt: typeof input.createdAt === "string" ? input.createdAt : undefined, agencies, legacyRecords };
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
