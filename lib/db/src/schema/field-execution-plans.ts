import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Private, user-confirmed field plans. Task and evidence references are resolved on reads. */
export const fieldExecutionPlansTable = pgTable(
  "field_execution_plans",
  {
    ownerUserId: varchar("owner_user_id").notNull().references(() => usersTable.id),
    period: varchar("period", { length: 8 }).notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerUserId, table.period, table.startsOn] }),
    index("field_execution_plans_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
  ],
);
