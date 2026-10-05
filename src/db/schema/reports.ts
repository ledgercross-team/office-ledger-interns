import { date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_common";
import { memberships, workspaces } from "./workspace";

/** Immutable end-of-day snapshot written at office end time. Never updated after insert. */
export const dailyReportSnapshots = pgTable(
  "daily_report_snapshots",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    date: date().notNull(),
    lockedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    data: jsonb().$type<Record<string, unknown>>().notNull(),
    emailedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("daily_report_snapshots_uq").on(t.workspaceId, t.date)],
);

/** Changes to a locked day (approved corrections, late approvals) listed under the snapshot. */
export const dailyReportCorrections = pgTable(
  "daily_report_corrections",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    date: date().notNull(),
    kind: text().notNull(),
    description: text().notNull(),
    sourceTable: text(),
    sourceId: uuid(),
    data: jsonb().$type<Record<string, unknown>>(),
    createdBy: uuid().references(() => memberships.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("daily_report_corrections_ws_date_idx").on(t.workspaceId, t.date)],
);
