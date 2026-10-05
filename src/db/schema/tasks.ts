import { boolean, date, doublePrecision, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_common";
import { priorityEnum, taskStatusEnum } from "./enums";
import { departments, memberships, workspaces } from "./workspace";

export const tasks = pgTable(
  "tasks",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text().notNull().default(""),
    status: taskStatusEnum().notNull().default("todo"),
    priority: priorityEnum().notNull().default("medium"),
    dueDate: date(),
    labels: text().array().notNull().default([]),
    departmentId: uuid().references(() => departments.id, { onDelete: "set null" }),
    position: doublePrecision().notNull().default(0),
    createdBy: uuid().references(() => memberships.id, { onDelete: "set null" }),
    completedAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),
    dueReminderSentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("tasks_ws_status_idx").on(t.workspaceId, t.status), index("tasks_ws_due_idx").on(t.workspaceId, t.dueDate)],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.taskId, t.membershipId] }), index("task_assignees_member_idx").on(t.membershipId)],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    body: text().notNull(),
    ...timestamps,
  },
  (t) => [index("task_comments_task_idx").on(t.taskId)],
);

export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    text: text().notNull(),
    done: boolean().notNull().default(false),
    position: doublePrecision().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("task_checklist_task_idx").on(t.taskId)],
);
