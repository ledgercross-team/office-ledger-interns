import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { and, eq, inArray } from "drizzle-orm";
import { holidays, meetingAttendees, meetings, memberships, workspaces } from "@/db/schema";
import { audit } from "@/lib/audit";
import { fmtDate, zoned } from "@/lib/dates";
import { membersWithRoles, notify, publish } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { calendarMonth } from "@/lib/queries/calendar";
import { notFound, requireCtx, scoped } from "./_helpers";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const calendar = {
  month: defineAction({
    input: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
    handler: async ({ month }, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, (tx) => calendarMonth(tx, ctx, month));
    },
  }),

  saveMeeting: defineAction({
    input: z.object({
      id: z.string().uuid().optional(),
      title: z.string().trim().min(2).max(140),
      date,
      time: z.string().regex(/^\d{2}:\d{2}$/),
      durationMin: z.number().int().min(5).max(600),
      location: z.string().trim().max(200).nullish(),
      link: z.string().trim().url().max(500).nullish().or(z.literal("")),
      agenda: z.string().max(4000).nullish(),
      recurrence: z.enum(["none", "daily", "weekly", "monthly"]),
      recurrenceUntil: date.nullish(),
      attendeeIds: z.array(z.string().uuid()).max(200),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "meetings.manage");
      return scoped(ctx, async (tx) => {
        const values = {
          title: input.title,
          startsAt: zoned(ctx.timezone, input.date, input.time),
          durationMin: input.durationMin,
          location: input.location || null,
          link: input.link || null,
          agenda: input.agenda || null,
          recurrence: input.recurrence,
          recurrenceUntil: input.recurrence === "none" ? null : (input.recurrenceUntil ?? null),
        };
        let id = input.id;
        let previous: string[] = [];
        if (id) {
          const res = await tx.update(meetings).set(values).where(eq(meetings.id, id)).returning({ id: meetings.id });
          if (!res.length) throw notFound("Meeting");
          previous = (await tx.select({ id: meetingAttendees.membershipId }).from(meetingAttendees).where(eq(meetingAttendees.meetingId, id))).map((a) => a.id);
        } else {
          const [row] = await tx.insert(meetings).values({ workspaceId: ctx.workspaceId, organizerId: ctx.membershipId, ...values }).returning();
          id = row!.id;
        }
        const valid = input.attendeeIds.length
          ? (await tx.select({ id: memberships.id }).from(memberships).where(and(inArray(memberships.id, input.attendeeIds), eq(memberships.status, "active")))).map((m) => m.id)
          : [];
        const removed = previous.filter((p) => !valid.includes(p));
        if (removed.length) await tx.delete(meetingAttendees).where(and(eq(meetingAttendees.meetingId, id), inArray(meetingAttendees.membershipId, removed)));
        const added = valid.filter((v) => !previous.includes(v));
        if (added.length) await tx.insert(meetingAttendees).values(added.map((membershipId) => ({ workspaceId: ctx.workspaceId, meetingId: id!, membershipId, rsvp: membershipId === ctx.membershipId ? ("yes" as const) : ("pending" as const) })));
        await notify(tx, ctx.workspaceId, (input.id ? valid : added).filter((m) => m !== ctx.membershipId), {
          kind: input.id ? "meeting.updated" : "meeting.invited",
          title: `${input.id ? "Updated" : "Invitation"}: ${input.title} · ${fmtDate(input.date, "en-US", { weekday: "short" })} ${input.time}`,
          link: `/app/calendar?meeting=${id}`,
        });
        await publish(tx, ctx.workspaceId, "calendar");
        return { id };
      });
    },
  }),

  deleteMeeting: defineAction({
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context, "meetings.manage");
      return scoped(ctx, async (tx) => {
        const attendees = (await tx.select({ id: meetingAttendees.membershipId }).from(meetingAttendees).where(eq(meetingAttendees.meetingId, id))).map((a) => a.id);
        const [row] = await tx.delete(meetings).where(eq(meetings.id, id)).returning({ title: meetings.title });
        if (!row) throw notFound("Meeting");
        await notify(tx, ctx.workspaceId, attendees.filter((a) => a !== ctx.membershipId), { kind: "meeting.cancelled", title: `Cancelled: ${row.title}`, link: "/app/calendar" });
        await publish(tx, ctx.workspaceId, "calendar");
        return { ok: true };
      });
    },
  }),

  rsvp: defineAction({
    input: z.object({ meetingId: z.string().uuid(), rsvp: z.enum(["yes", "no", "maybe"]) }),
    handler: async ({ meetingId, rsvp }, context) => {
      const ctx = requireCtx(context, "meetings.rsvp");
      return scoped(ctx, async (tx) => {
        const res = await tx
          .update(meetingAttendees)
          .set({ rsvp })
          .where(and(eq(meetingAttendees.meetingId, meetingId), eq(meetingAttendees.membershipId, ctx.membershipId)))
          .returning();
        if (!res.length) throw new ActionError({ code: "FORBIDDEN", message: "You're not invited to this meeting." });
        await publish(tx, ctx.workspaceId, "calendar");
        return { ok: true };
      });
    },
  }),

  /** Owner: applies immediately. Manager: creates a proposal for the owner. */
  markHoliday: defineAction({
    input: z.object({ date, name: z.string().trim().min(2).max(80) }),
    handler: async ({ date: d, name }, context) => {
      const ctx = requireCtx(context, "holidays.mark");
      const owner = can(ctx, "holidays.approve");
      return scoped(ctx, async (tx) => {
        const [existing] = await tx.select().from(holidays).where(eq(holidays.date, d));
        if (existing?.status === "active") throw new ActionError({ code: "CONFLICT", message: "That date is already a holiday." });
        if (existing?.status === "proposed" && !owner) throw new ActionError({ code: "CONFLICT", message: "A proposal for that date is already waiting for the owner." });
        const values = { name, status: owner ? ("active" as const) : ("proposed" as const), proposedBy: ctx.membershipId, approvedBy: owner ? ctx.membershipId : null, removalRequestedBy: null };
        const [row] = existing
          ? await tx.update(holidays).set(values).where(eq(holidays.id, existing.id)).returning()
          : await tx.insert(holidays).values({ workspaceId: ctx.workspaceId, date: d, ...values }).returning();
        if (!owner) {
          await notify(tx, ctx.workspaceId, await membersWithRoles(tx, ctx.workspaceId, ["owner"]), {
            kind: "holiday.proposed",
            title: `${context.locals.user!.name} proposed a holiday: ${name} (${fmtDate(d)})`,
            link: `/app/inbox?focus=holiday:${row!.id}`,
          });
          await publish(tx, ctx.workspaceId, "inbox");
        }
        await audit(tx, ctx, owner ? "holiday.created" : "holiday.proposed", "holidays", row!.id, `${owner ? "Marked" : "Proposed"} holiday "${name}" on ${d}`);
        await publish(tx, ctx.workspaceId, "calendar");
        return { status: values.status };
      });
    },
  }),

  removeHoliday: defineAction({
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context, "holidays.mark");
      const owner = can(ctx, "holidays.approve");
      return scoped(ctx, async (tx) => {
        const [h] = await tx.select().from(holidays).where(eq(holidays.id, id));
        if (!h) throw notFound("Holiday");
        if (owner || (h.status === "proposed" && h.proposedBy === ctx.membershipId)) {
          await tx.delete(holidays).where(eq(holidays.id, id));
          await audit(tx, ctx, "holiday.removed", "holidays", id, `Removed holiday "${h.name}" on ${h.date}`);
          await publish(tx, ctx.workspaceId, "calendar");
          return { status: "removed" as const };
        }
        if (h.status !== "active") throw new ActionError({ code: "FORBIDDEN", message: "Only the owner can withdraw someone else's proposal." });
        await tx.update(holidays).set({ removalRequestedBy: ctx.membershipId }).where(eq(holidays.id, id));
        await notify(tx, ctx.workspaceId, await membersWithRoles(tx, ctx.workspaceId, ["owner"]), {
          kind: "holiday.removal",
          title: `${context.locals.user!.name} asked to remove the holiday ${h.name} (${fmtDate(h.date)})`,
          link: `/app/inbox?focus=holiday:${h.id}`,
        });
        await audit(tx, ctx, "holiday.removal_requested", "holidays", id, `Requested removal of holiday "${h.name}" on ${h.date}`);
        await publish(tx, ctx.workspaceId, "calendar");
        await publish(tx, ctx.workspaceId, "inbox");
        return { status: "requested" as const };
      });
    },
  }),

  /** Public holidays for the workspace country (Nager.Date public API). */
  importHolidays: defineAction({
    input: z.object({ year: z.number().int().min(2000).max(2100) }),
    handler: async ({ year }, context) => {
      const ctx = requireCtx(context, "holidays.mark");
      const owner = can(ctx, "holidays.approve");
      return scoped(ctx, async (tx) => {
        const [ws] = await tx.select({ country: workspaces.country }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
        const country = ws?.country ?? "US";
        let list: { date: string; localName: string; name: string; global?: boolean }[] = [];
        try {
          const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, { signal: AbortSignal.timeout(8000) });
          if (res.status === 204 || res.status === 404) throw new ActionError({ code: "NOT_FOUND", message: `No public holiday data for ${country}.` });
          if (!res.ok) throw new Error(String(res.status));
          list = (await res.json()) as typeof list;
        } catch (e) {
          if (e instanceof ActionError) throw e;
          throw new ActionError({ code: "BAD_REQUEST", message: "Couldn't reach the public holiday service. Try again later." });
        }
        let added = 0;
        for (const h of list.filter((x) => x.global !== false)) {
          const res = await tx
            .insert(holidays)
            .values({
              workspaceId: ctx.workspaceId,
              date: h.date,
              name: h.name || h.localName,
              status: owner ? "active" : "proposed",
              source: "import",
              proposedBy: ctx.membershipId,
              approvedBy: owner ? ctx.membershipId : null,
            })
            .onConflictDoNothing()
            .returning({ id: holidays.id });
          added += res.length;
        }
        await audit(tx, ctx, "holiday.imported", "holidays", null, `Imported ${added} public holidays for ${country} ${year}${owner ? "" : " (as proposals)"}`);
        await publish(tx, ctx.workspaceId, "calendar");
        if (!owner) await publish(tx, ctx.workspaceId, "inbox");
        return { added, country, proposed: !owner };
      });
    },
  }),
};
