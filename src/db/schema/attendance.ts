import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_common";
import {
  approvalStateEnum,
  attendanceSourceEnum,
  attendanceStatusEnum,
  exceptionKindEnum,
  requestStatusEnum,
  workModeEnum,
} from "./enums";
import { breakWindows, memberships, workspaces } from "./workspace";

export const attendance = pgTable(
  "attendance",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    /** Local calendar date in the workspace timezone. */
    date: date().notNull(),
    mode: workModeEnum(),
    status: attendanceStatusEnum().notNull(),
    checkInAt: timestamp({ withTimezone: true }),
    checkOutAt: timestamp({ withTimezone: true }),
    breakMinutes: integer().notNull().default(0),
    lateMinutes: integer().notNull().default(0),
    /** Minutes between check-in and check-out, minus breaks. Null while still checked in. */
    trackedMinutes: integer().generatedAlwaysAs(
      sql`case when check_in_at is not null and check_out_at is not null then greatest(0, floor(extract(epoch from (check_out_at - check_in_at)) / 60)::int - break_minutes) end`,
    ),
    approval: approvalStateEnum().notNull().default("not_required"),
    reviewedBy: uuid().references(() => memberships.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewNote: text(),
    note: text(),
    source: attendanceSourceEnum().notNull().default("self"),
    autoCheckedOut: boolean().notNull().default(false),
    checkInMeta: jsonb().$type<{ ip?: string; lat?: number; lng?: number; withinGeofence?: boolean }>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("attendance_member_date_uq").on(t.membershipId, t.date),
    index("attendance_ws_date_idx").on(t.workspaceId, t.date),
    index("attendance_ws_approval_idx").on(t.workspaceId, t.approval),
  ],
);

export const attendanceBreaks = pgTable(
  "attendance_breaks",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    attendanceId: uuid()
      .notNull()
      .references(() => attendance.id, { onDelete: "cascade" }),
    breakWindowId: uuid().references(() => breakWindows.id, { onDelete: "set null" }),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("attendance_breaks_att_idx").on(t.attendanceId)],
);

export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    attendanceId: uuid().references(() => attendance.id, { onDelete: "set null" }),
    date: date().notNull(),
    requestedCheckIn: timestamp({ withTimezone: true }),
    requestedCheckOut: timestamp({ withTimezone: true }),
    reason: text().notNull(),
    status: requestStatusEnum().notNull().default("pending"),
    reviewerId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewNote: text(),
    ...timestamps,
  },
  (t) => [index("attendance_corrections_ws_status_idx").on(t.workspaceId, t.status)],
);

/** Acknowledged attendance exceptions (missing checkout, absent without leave, overtime, anomalies). */
export const exceptionAcks = pgTable(
  "exception_acks",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: exceptionKindEnum().notNull(),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    date: date().notNull(),
    outcome: text().notNull().default("acknowledged"),
    note: text(),
    ackedBy: uuid().references(() => memberships.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("exception_acks_uq").on(t.workspaceId, t.kind, t.membershipId, t.date)],
);
