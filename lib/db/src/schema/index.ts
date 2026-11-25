import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type JsonRecord = Record<string, unknown>;

/** Canonical shared agency records served by the Replit API. */
export const agencyRecordsTable = pgTable(
  "agency_records",
  {
    id: text("id").primaryKey(),
    stateCode: text("state_code"),
    payload: jsonb("payload").$type<JsonRecord>().notNull(),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agency_records_state_id_idx").on(table.stateCode, table.id)],
);

/** Mutation receipts make offline retries idempotent across devices. */
export const agencyMutationReceiptsTable = pgTable(
  "agency_mutation_receipts",
  {
    mutationId: text("mutation_id").primaryKey(),
    agencyId: text("agency_id").notNull(),
    revision: integer("revision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agency_mutation_receipts_agency_idx").on(table.agencyId)],
);

/** Preferences are kept in Replit storage rather than a browser-cloud collection. */
export const workspacePreferencesTable = pgTable(
  "workspace_preferences",
  {
    preferenceKey: text("preference_key").primaryKey(),
    payload: jsonb("payload").$type<JsonRecord>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Holds source documents that do not yet have an active Replit feature mapping.
 * Import is additive and keeps original collection/path identifiers for recovery.
 */
export const importedLegacyRecordsTable = pgTable(
  "imported_legacy_records",
  {
    collectionName: text("collection_name").notNull(),
    documentPath: text("document_path").notNull(),
    payload: jsonb("payload").$type<JsonRecord>().notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.collectionName, table.documentPath] })],
);