import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { leaveRequests, leaveTypes } from "@/db/schema";
import { audit } from "@/lib/audit";
import { addDaysISO, fmtDate, localDate } from "@/lib/dates";
import { membersWithRoles, notify, publish } from "@/lib/notifications";
import { leavePage } from "@/lib/queries/leave";
import { decideLeave, workdaysBetween } from "@/lib/services/decisions";
import { leaveBalancesFor } from "@/lib/services/leave-balance";
import { mapDecision, requireCtx, scoped } from "./_helpers";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const leave = {
  page: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, (tx) => leavePage(tx, ctx));
    },
  }),

  request: defineAction({
    input: z
      .object({
        leaveTypeId: z.string().uuid(),
        kind: z.enum(["full_day", "half_day"]),
        half: z.enum(["first", "second"]).nullish(),
        startDate: date,
        endDate: date,
        reason: z.string().trim().min(3).max(1000),
      })
      .refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after the start date." })
      .refine((v) => v.kind === "full_day" || (v.half && v.startDate === v.endDate), { message: "Half-day requests are for one day and need a half." }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "leave.request");
      const today = localDate(ctx.timezone);
      if (input.startDate < addDaysISO(today, -30)) throw new ActionError({ code: "BAD_REQUEST", message: "Leave can be requested at most 30 days back." });
      if (input.endDate > addDaysISO(today, 365)) throw new ActionError({ code: "BAD_REQUEST", message: "Leave can be requested up to a year ahead." });
      return scoped(ctx, async (tx) => {
        const [type] = await tx.select().from(leaveTypes).where(and(eq(leaveTypes.id, input.leaveTypeId), eq(leaveTypes.active, true)));
        if (!type) throw new ActionError({ code: "BAD_REQUEST", message: "Choose a leave type." });
        const workdays = await workdaysBetween(tx, ctx.workspaceId, input.startDate, input.endDate);
        if (!workdays.length) throw new ActionError({ code: "BAD_REQUEST", message: "Those dates are all weekends or holidays." });
        const days = input.kind === "half_day" ? 0.5 : workdays.length;
        const [clash] = await tx
          .select({ id: leaveRequests.id })
          .from(leaveRequests)
          .where(
            and(
              eq(leaveRequests.membershipId, ctx.membershipId),
              inArray(leaveRequests.status, ["pending", "approved"]),
              lte(leaveRequests.startDate, input.endDate),
              gte(leaveRequests.endDate, input.startDate),
            ),
          );
        if (clash) throw new ActionError({ code: "CONFLICT", message: "You already have a request covering some of these days." });
        if (type.paid && type.yearlyQuota > 0) {
          const bal = (await leaveBalancesFor(tx, [ctx.membershipId], Number(input.startDate.slice(0, 4)))).get(ctx.membershipId)?.find((b) => b.leaveTypeId === type.id);
          const available = bal ? bal.accrued + bal.carriedOver - bal.used - bal.pending : 0;
          if (bal && days > available)
            throw new ActionError({ code: "BAD_REQUEST", message: `Not enough ${type.name.toLowerCase()} leave: ${available} day(s) available including pending requests.` });
        }
        const [row] = await tx
          .insert(leaveRequests)
          .values({
            workspaceId: ctx.workspaceId,
            membershipId: ctx.membershipId,
            leaveTypeId: type.id,
            kind: input.kind,
            half: input.kind === "half_day" ? (input.half ?? "first") : null,
            startDate: input.startDate,
            endDate: input.endDate,
            days,
            reason: input.reason,
          })
          .returning();
        const reviewers = (await membersWithRoles(tx, ctx.workspaceId, ["owner", "manager"])).filter((m) => m !== ctx.membershipId);
        const range = input.startDate === input.endDate ? fmtDate(input.startDate) : `${fmtDate(input.startDate)} – ${fmtDate(input.endDate)}`;
        await notify(tx, ctx.workspaceId, reviewers, {
          kind: "leave.requested",
          title: `${context.locals.user!.name} requested ${input.kind === "half_day" ? "a half-day" : `${days} day(s) of ${type.name.toLowerCase()} leave`} (${range})`,
          body: input.reason,
          link: `/app/inbox?focus=leave:${row!.id}`,
        });
        await audit(tx, ctx, "leave.requested", "leave_requests", row!.id, `Requested ${input.kind === "half_day" ? "half-day" : "leave"} (${range})`);
        await publish(tx, ctx.workspaceId, "leave");
        await publish(tx, ctx.workspaceId, "inbox");
        return { id: row!.id, days };
      });
    },
  }),

  cancel: defineAction({
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, async (tx) => {
        const res = await tx
          .update(leaveRequests)
          .set({ status: "cancelled" })
          .where(and(eq(leaveRequests.id, id), eq(leaveRequests.membershipId, ctx.membershipId), eq(leaveRequests.status, "pending")))
          .returning({ id: leaveRequests.id });
        if (!res.length) throw new ActionError({ code: "CONFLICT", message: "Only your own pending requests can be cancelled." });
        await audit(tx, ctx, "leave.cancelled", "leave_requests", id, "Cancelled a leave request");
        await publish(tx, ctx.workspaceId, "leave");
        await publish(tx, ctx.workspaceId, "inbox");
        return { ok: true };
      });
    },
  }),

  review: defineAction({
    input: z.object({ ids: z.array(z.string().uuid()).min(1).max(100), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).nullish() }),
    handler: async ({ ids, decision, note }, context) => {
      const ctx = requireCtx(context, "leave.review");
      return scoped(ctx, async (tx) => {
        for (const id of ids) await decideLeave(tx, ctx, id, decision, note).catch(mapDecision);
        await publish(tx, ctx.workspaceId, "inbox");
        return { count: ids.length };
      });
    },
  }),
};
