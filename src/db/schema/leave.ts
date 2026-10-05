import { boolean, date, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_common";
import { accrualEnum, halfEnum, leaveKindEnum, requestStatusEnum } from "./enums";
import { memberships, workspaces } from "./workspace";

export const leaveTypes = pgTable(
  "leave_types",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    code: text().notNull(),
    name: text().notNull(),
    yearlyQuota: numeric({ precision: 5, scale: 1, mode: "number" }).notNull().default(0),
    accrual: accrualEnum().notNull().default("yearly"),
    paid: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
    color: text().notNull().default("violet"),
    ...timestamps,
  },
  (t) => [uniqueIndex("leave_types_ws_code_uq").on(t.workspaceId, t.code)],
);

/** Per-member, per-year allotment overrides and carry-over. Usage is always computed from requests. */
export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    leaveTypeId: uuid()
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),
    year: integer().notNull(),
    allotted: numeric({ precision: 5, scale: 1, mode: "number" }),
    carriedOver: numeric({ precision: 5, scale: 1, mode: "number" }).notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("leave_balances_uq").on(t.membershipId, t.leaveTypeId, t.year)],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    leaveTypeId: uuid().references(() => leaveTypes.id, { onDelete: "set null" }),
    kind: leaveKindEnum().notNull().default("full_day"),
    half: halfEnum(),
    startDate: date().notNull(),
    endDate: date().notNull(),
    days: numeric({ precision: 5, scale: 1, mode: "number" }).notNull().default(1),
    reason: text().notNull(),
    attachmentFileId: uuid(),
    status: requestStatusEnum().notNull().default("pending"),
    reviewerId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewNote: text(),
    ...timestamps,
  },
  (t) => [
    index("leave_requests_ws_status_idx").on(t.workspaceId, t.status),
    index("leave_requests_ws_dates_idx").on(t.workspaceId, t.startDate, t.endDate),
  ],
);
