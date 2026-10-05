import { bigint, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_common";
import { memberships, workspaces } from "./workspace";

export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text(),
    actorMembershipId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    summary: text().notNull(),
    meta: jsonb().$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("audit_log_ws_created_idx").on(t.workspaceId, t.createdAt), index("audit_log_ws_action_idx").on(t.workspaceId, t.action)],
);

export const files = pgTable(
  "files",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerMembershipId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    /** What the file is attached to: "membership" (document vault), "task", "leave_request", "complaint". */
    entityType: text().notNull(),
    entityId: uuid(),
    kind: text().notNull().default("attachment"),
    filename: text().notNull(),
    mime: text().notNull(),
    size: bigint({ mode: "number" }).notNull(),
    storageKey: text().notNull().unique(),
    ...timestamps,
  },
  (t) => [index("files_entity_idx").on(t.workspaceId, t.entityType, t.entityId)],
);
