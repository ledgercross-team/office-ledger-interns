import type { APIRoute } from "astro";
import { and, eq, gte, or } from "drizzle-orm";
import { withWorkspace, db } from "@/db";
import { holidays, leaveRequests, meetingAttendees, meetings, memberships, workspaceSettings, workspaces } from "@/db/schema";
import { buildIcs, rruleFor, type IcsEvent } from "@/lib/calendar";
import { addDaysISO, localDate } from "@/lib/dates";
import { env } from "@/lib/env";

export const prerender = false;

/**
 * Per-user subscribable calendar (the URL token is the secret; reset it from My Profile).
 * Includes: meetings the member attends or organises, their approved leave, and active holidays.
 */
export const GET: APIRoute = async ({ params }) => {
  const tk = (params.token ?? "").replace(/\.ics$/, "");
  if (tk.length < 16) return new Response("Not found", { status: 404 });
  const [m] = await db
    .select({ id: memberships.id, ws: memberships.workspaceId, status: memberships.status, tz: workspaces.timezone, wsName: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.icalToken, tk));
  if (!m || m.status !== "active") return new Response("Not found", { status: 404 });
  const since = addDaysISO(localDate(m.tz), -90);
  const events = await withWorkspace(m.ws, async (tx) => {
    const out: IcsEvent[] = [];
    const [settings] = await tx.select({ weekendDays: workspaceSettings.weekendDays }).from(workspaceSettings);
    const mtgs = await tx
      .selectDistinct({ meeting: meetings })
      .from(meetings)
      .leftJoin(meetingAttendees, eq(meetingAttendees.meetingId, meetings.id))
      .where(or(eq(meetingAttendees.membershipId, m.id), eq(meetings.organizerId, m.id)));
    for (const { meeting: x } of mtgs)
      out.push({
        uid: `meeting-${x.id}@officeledger`,
        title: x.title,
        description: x.agenda,
        location: x.location ?? x.link,
        url: x.link,
        start: x.startsAt,
        end: new Date(x.startsAt.getTime() + x.durationMin * 60000),
        rrule: rruleFor(x.recurrence, x.recurrenceUntil, settings?.weekendDays ?? []),
      });
    const leave = await tx
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.membershipId, m.id), eq(leaveRequests.status, "approved"), gte(leaveRequests.endDate, since)));
    for (const l of leave)
      out.push({ uid: `leave-${l.id}@officeledger`, title: l.kind === "half_day" ? `Half-day leave (${l.half} half)` : "On leave", allDay: { start: l.startDate, end: l.endDate } });
    const hols = await tx.select().from(holidays).where(and(eq(holidays.status, "active"), gte(holidays.date, since)));
    for (const h of hols) out.push({ uid: `holiday-${h.id}@officeledger`, title: `🏖 ${h.name}`, allDay: { start: h.date, end: h.date } });
    return out;
  });
  return new Response(buildIcs(`${m.wsName} · Office Ledger`, events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="office-ledger.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
      "Content-Location": `${env.PUBLIC_SITE_URL}/api/ical/${tk}`,
    },
  });
};
