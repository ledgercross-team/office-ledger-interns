import { date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_common";
import { holidaySourceEnum, holidayStatusEnum, recurrenceEnum, rsvpEnum } from "./enums";
import { memberships, workspaces } from "./workspace";

export const holidays = pgTable(
  "holidays",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    date: date().notNull(),
    name: text().notNull(),
    status: holidayStatusEnum().notNull().default("proposed"),
    source: holidaySourceEnum().notNull().default("manual"),
    proposedBy: uuid().references(() => memberships.id, { onDelete: "set null" }),
    approvedBy: uuid().references(() => memberships.id, { onDelete: "set null" }),
    /** A manager asked to remove an active holiday; awaits owner approval. */
    removalRequestedBy: uuid().references(() => memberships.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("holidays_ws_date_uq").on(t.workspaceId, t.date),
    index("holidays_ws_status_idx").on(t.workspaceId, t.status),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: pk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    durationMin: integer().notNull().default(30),
    location: text(),
    link: text(),
    agenda: text(),
    organizerId: uuid().references(() => memberships.id, { onDelete: "set null" }),
    recurrence: recurrenceEnum().notNull().default("none"),
    recurrenceUntil: date(),
    ...timestamps,
  },
  (t) => [index("meetings_ws_starts_idx").on(t.workspaceId, t.startsAt)],
);

export const meetingAttendees = pgTable(
  "meeting_attendees",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    meetingId: uuid()
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    rsvp: rsvpEnum().notNull().default("pending"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.membershipId] }), index("meeting_attendees_member_idx").on(t.membershipId)],
);
