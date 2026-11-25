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
import { usersTable } from "./users";
export { usersTable } from "./users";
export { fieldExecutionPlansTable } from "./field-execution-plans";

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

/** Append-only private field observations; never replace public facility evidence. */
export const facilityNotesTable = pgTable("facility_notes", {
  agencyId: text("agency_id").notNull().references(() => agencyRecordsTable.id),
  parentId: text("parent_id").notNull(),
  stationId: text("station_id").notNull(),
  submissionId: text("submission_id").notNull(),
  note: text("note").notNull(),
  authorUid: text("author_uid").notNull(),
  sourceSnapshot: jsonb("source_snapshot").$type<JsonRecord>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.agencyId, t.parentId, t.stationId, t.submissionId] }),
  index("facility_notes_lookup_idx").on(t.agencyId, t.parentId, t.stationId, t.createdAt),
]);


/** Dated station equipment observations; a separate reviewer may make one terminal decision. */
export const facilityEquipmentTable = pgTable("facility_equipment_observations", {
  agencyId: text("agency_id").notNull().references(() => agencyRecordsTable.id),
  parentId: text("parent_id").notNull(),
  stationId: text("station_id").notNull(),
  submissionId: text("submission_id").notNull(),
  observation: jsonb("observation").$type<JsonRecord>().notNull(),
  sourceSnapshot: jsonb("source_snapshot").$type<JsonRecord>().notNull(),
  authorUid: text("author_uid").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decision: text("decision"),
  reviewNote: text("review_note"),
  reviewerUid: text("reviewer_uid"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.agencyId,t.parentId,t.stationId,t.submissionId] }),
  index("facility_equipment_lookup_idx").on(t.agencyId,t.parentId,t.stationId,t.createdAt),
]);

/** Private dated claims about professional roles and purchasing responsibilities. */
export const agencyAuthorityTable = pgTable("agency_authority_observations", {
 agencyId:text("agency_id").notNull().references(()=>agencyRecordsTable.id),
 submissionId:text("submission_id").notNull(),
 identityKey:text("identity_key").notNull(),
 observation:jsonb("observation").$type<JsonRecord>().notNull(),
 authorUid:text("author_uid").notNull(),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
 decision:text("decision"),
 reviewNote:text("review_note"),
 reviewerUid:text("reviewer_uid"),
 reviewedAt:timestamp("reviewed_at",{withTimezone:true}),
},t=>[primaryKey({columns:[t.agencyId,t.submissionId]}),index("agency_authority_lookup_idx").on(t.agencyId,t.identityKey,t.createdAt)]);
