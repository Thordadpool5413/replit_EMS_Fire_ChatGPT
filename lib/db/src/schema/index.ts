import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export type JsonRecord = Record<string, unknown>;

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

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

/** Role assignments used only by the reviewed public-evidence workspace. */
export const workspaceMembershipsTable = pgTable(
  "workspace_memberships",
  {
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);

/** Evidence is public-source-only and kept separate from private agency profiles. */
export const sharedEvidenceRecordsTable = pgTable(
  "shared_evidence_records",
  {
    workspaceId: text("workspace_id").notNull(),
    agencyKey: text("agency_key").notNull(),
    factId: text("fact_id").notNull(),
    payload: jsonb("payload").$type<JsonRecord>().notNull(),
    authorUid: text("author_uid").notNull(),
    authorIdentityMapped: boolean("author_identity_mapped").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.agencyKey, table.factId] }),
    index("shared_evidence_workspace_agency_idx").on(table.workspaceId, table.agencyKey, table.factId),
  ],
);

/** Review decisions are immutable, one per action, evidence item, and workspace. */
export const sharedEvidenceDecisionsTable = pgTable(
  "shared_evidence_decisions",
  {
    workspaceId: text("workspace_id").notNull(),
    agencyKey: text("agency_key").notNull(),
    factId: text("fact_id").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").$type<JsonRecord>().notNull(),
    reviewerUid: text("reviewer_uid").notNull(),
    reviewerIdentityMapped: boolean("reviewer_identity_mapped").notNull().default(true),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.agencyKey, table.factId, table.action] })],
);