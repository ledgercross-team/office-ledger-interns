import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_common";
import { complaintEventEnum, complaintStatusEnum, severityEnum } from "./enums";
import { memberships, workspaces } from "./workspace";

export const complaints = pgTable(
  "complaints",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    submitterId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    anonymous: boolean().notNull().default(false),
    category: text().notNull(),
    subject: text().notNull(),
    description: text().notNull(),
    severity: severityEnum().notNull().default("medium"),
    status: complaintStatusEnum().notNull().default("new"),
    assigneeId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    resolutionMessage: text(),
    attachmentFileId: uuid(),
    ...timestamps,
  },
  (t) => [index("complaints_ws_status_idx").on(t.workspaceId, t.status)],
);

export const complaintEvents = pgTable(
  "complaint_events",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    complaintId: uuid()
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    actorId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    kind: complaintEventEnum().notNull(),
    fromStatus: complaintStatusEnum(),
    toStatus: complaintStatusEnum(),
    body: text(),
    internal: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [index("complaint_events_complaint_idx").on(t.complaintId)],
);
