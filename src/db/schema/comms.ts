import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_common";
import { users } from "./auth";
import { memberships, workspaces } from "./workspace";

export const announcements = pgTable(
  "announcements",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    authorId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    title: text().notNull(),
    body: text().notNull(),
    pinned: boolean().notNull().default(false),
    expiresAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("announcements_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const announcementReads = pgTable(
  "announcement_reads",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    announcementId: uuid()
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.announcementId, t.membershipId] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    title: text().notNull(),
    body: text(),
    link: text(),
    readAt: timestamp({ withTimezone: true }),
    emailedAt: timestamp({ withTimezone: true }),
    pushedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("notifications_member_idx").on(t.membershipId, t.createdAt)],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: pk(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text().notNull().unique(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  ...timestamps,
});
