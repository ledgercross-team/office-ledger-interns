import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_common";
import { users } from "./auth";
import { approvalModeEnum, memberStatusEnum, roleEnum } from "./enums";

export const workspaces = pgTable("workspaces", {
  id: pk(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  timezone: text().notNull().default("UTC"),
  country: text().notNull().default("US"),
  locale: text().notNull().default("en-US"),
  inviteCode: text().notNull().unique(),
  inviteCodeExpiresAt: timestamp({ withTimezone: true }),
  onboardedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const departments = pgTable(
  "departments",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("departments_ws_name_uq").on(t.workspaceId, t.name)],
);

export const designations = pgTable(
  "designations",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("designations_ws_name_uq").on(t.workspaceId, t.name)],
);

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}
export interface NotifyPrefs {
  emailDigest: boolean;
  push: boolean;
  emailOnDecision: boolean;
}

export const memberships = pgTable(
  "memberships",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employeeCode: text(),
    role: roleEnum().notNull().default("employee"),
    status: memberStatusEnum().notNull().default("pending"),
    departmentId: uuid().references(() => departments.id, { onDelete: "set null" }),
    designationId: uuid().references(() => designations.id, { onDelete: "set null" }),
    managerId: uuid().references((): AnyPgColumn => memberships.id, { onDelete: "set null" }),
    joinedAt: date(),
    birthDate: date(),
    phone: text(),
    address: text(),
    bloodGroup: text(),
    emergencyContact: jsonb().$type<EmergencyContact>(),
    notifyPrefs: jsonb()
      .$type<NotifyPrefs>()
      .notNull()
      .default({ emailDigest: true, push: false, emailOnDecision: true }),
    icalToken: text().unique(),
    statusChangedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_ws_user_uq").on(t.workspaceId, t.userId),
    uniqueIndex("memberships_ws_code_uq").on(t.workspaceId, t.employeeCode),
    index("memberships_ws_status_idx").on(t.workspaceId, t.status),
  ],
);

export interface ScoringRules {
  late: number;
  absent: number;
  missingCheckout: number;
  halfDay: number;
}
export interface GeoPolicy {
  enabled: boolean;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  allowedIps: string[];
}
export interface DigestPolicy {
  dailyDigest: boolean;
  digestHour: number;
  emailLockedReport: boolean;
}

export interface ComplaintPolicy {
  /** When true, the owner (only) can see who submitted an anonymous issue. */
  anonymousVisibleToOwner: boolean;
  categories: string[];
}

export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: uuid()
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  officeStart: time().notNull().default("10:00:00"),
  officeEnd: time().notNull().default("18:00:00"),
  lateThresholdMin: integer().notNull().default(15),
  remoteDaysPerWeek: integer().notNull().default(2),
  approvalMode: approvalModeEnum().notNull().default("none"),
  weekendDays: integer().array().notNull().default([5, 6]),
  autoCheckoutAt: time().default("23:00:00"),
  scoring: jsonb()
    .$type<ScoringRules>()
    .notNull()
    .default({ late: 2, absent: 5, missingCheckout: 1, halfDay: 1 }),
  geo: jsonb()
    .$type<GeoPolicy>()
    .notNull()
    .default({ enabled: false, lat: null, lng: null, radiusM: 200, allowedIps: [] }),
  digest: jsonb()
    .$type<DigestPolicy>()
    .notNull()
    .default({ dailyDigest: true, digestHour: 8, emailLockedReport: true }),
  complaintPolicy: jsonb()
    .$type<ComplaintPolicy>()
    .notNull()
    .default({
      anonymousVisibleToOwner: false,
      categories: ["Workplace", "Facilities", "IT", "Conduct", "Payroll", "Other"],
    }),
  ...timestamps,
});

export const breakWindows = pgTable(
  "break_windows",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    startTime: time().notNull(),
    endTime: time().notNull(),
    paid: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [index("break_windows_ws_idx").on(t.workspaceId)],
);

export const invites = pgTable(
  "invites",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: roleEnum().notNull().default("employee"),
    departmentId: uuid().references(() => departments.id, { onDelete: "set null" }),
    designationId: uuid().references(() => designations.id, { onDelete: "set null" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => memberships.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("invites_ws_idx").on(t.workspaceId)],
);
