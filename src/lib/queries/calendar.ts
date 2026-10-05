import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import type { Tx } from "@/db";
import { holidays, meetingAttendees, meetings, memberships, users } from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { can } from "@/lib/permissions";
import { addDaysISO, localDate } from "@/lib/dates";
import { getSettings } from "@/lib/services/attendance";
import { approvedLeaveBetween } from "./leave";
import { boardMembers } from "./tasks";

/** Meetings that may occur within [from, to] (recurring ones included). */
export async function meetingsBetween(tx: Tx, from: string, to: string) {
  const rows = await tx
    .select({
      id: meetings.id,
      title: meetings.title,
      startsAt: meetings.startsAt,
      durationMin: meetings.durationMin,
      location: meetings.location,
      link: meetings.link,
      agenda: meetings.agenda,
      organizerId: meetings.organizerId,
      organizer: users.name,
      recurrence: meetings.recurrence,
      recurrenceUntil: meetings.recurrenceUntil,
    })
    .from(meetings)
    .leftJoin(memberships, eq(memberships.id, meetings.organizerId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        lte(meetings.startsAt, new Date(`${addDaysISO(to, 1)}T23:59:59Z`)),
        or(
          and(eq(meetings.recurrence, "none"), gte(meetings.startsAt, new Date(`${addDaysISO(from, -1)}T00:00:00Z`))),
          and(inArray(meetings.recurrence, ["daily", "weekly", "monthly"]), or(isNull(meetings.recurrenceUntil), gte(meetings.recurrenceUntil, from))),
        ),
      ),
    )
    .orderBy(asc(meetings.startsAt));
  const ids = rows.map((r) => r.id);
  const att = ids.length
    ? await tx
        .select({ meetingId: meetingAttendees.meetingId, id: memberships.id, name: users.name, image: users.image, rsvp: meetingAttendees.rsvp })
        .from(meetingAttendees)
        .innerJoin(memberships, eq(memberships.id, meetingAttendees.membershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(inArray(meetingAttendees.meetingId, ids))
    : [];
  return rows.map((r) => ({ ...r, attendees: att.filter((a) => a.meetingId === r.id).map(({ meetingId: _m, ...a }) => a) }));
}
export type MeetingRow = Awaited<ReturnType<typeof meetingsBetween>>[number];

/** All calendar data for a month (with a one-week margin so the grid's edge days are filled). */
export async function calendarMonth(tx: Tx, ctx: WorkspaceContext, month: string) {
  const first = `${month}-01`;
  const last = addDaysISO(addDaysISO(first, 32).slice(0, 8) + "01", -1);
  const from = addDaysISO(first, -7);
  const to = addDaysISO(last, 7);
  const s = await getSettings(tx, ctx.workspaceId);
  const [mtgs, leave, hols] = await Promise.all([
    meetingsBetween(tx, from, to),
    approvedLeaveBetween(tx, from, to),
    tx
      .select({
        id: holidays.id,
        date: holidays.date,
        name: holidays.name,
        status: holidays.status,
        source: holidays.source,
        proposedBy: holidays.proposedBy,
        removalRequestedBy: holidays.removalRequestedBy,
      })
      .from(holidays)
      .where(and(gte(holidays.date, from), lte(holidays.date, to), inArray(holidays.status, ["active", "proposed"]))),
  ]);
  return {
    month,
    today: localDate(ctx.timezone),
    timezone: ctx.timezone,
    weekendDays: s.weekendDays,
    meetings: mtgs,
    leave,
    holidays: hols,
    me: ctx.membershipId,
    perms: {
      manageMeetings: can(ctx, "meetings.manage"),
      markHolidays: can(ctx, "holidays.mark"),
      approveHolidays: can(ctx, "holidays.approve"),
    },
  };
}
export type CalendarMonth = Awaited<ReturnType<typeof calendarMonth>>;

export async function calendarPage(tx: Tx, ctx: WorkspaceContext, month: string) {
  const [data, members] = await Promise.all([calendarMonth(tx, ctx, month), boardMembers(tx)]);
  return { ...data, members };
}
