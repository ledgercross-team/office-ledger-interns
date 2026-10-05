import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { attendanceCorrections } from "@/db/schema";
import { audit } from "@/lib/audit";
import { addDaysISO, localDate } from "@/lib/dates";
import { membersWithRoles, notify, publish } from "@/lib/notifications";
import { attendanceToday, notCheckedIn } from "@/lib/queries/attendance";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import * as svc from "@/lib/services/attendance";
import { requireCtx, scoped } from "./_helpers";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

function mapErr(e: unknown): never {
  if (e instanceof svc.AttendanceError) throw new ActionError({ code: e.code, message: e.message });
  throw e;
}

export const attendanceActions = {
  today: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, async (tx) => ({
        ...(await attendanceToday(tx, ctx)),
        missing: ctx.role === "employee" ? [] : await notCheckedIn(tx, ctx),
      }));
    },
  }),

  checkIn: defineAction({
    input: z.object({
      mode: z.enum(["office", "remote"]),
      note: z.string().trim().max(280).nullish(),
      lat: z.number().min(-90).max(90).nullish(),
      lng: z.number().min(-180).max(180).nullish(),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "attendance.checkin");
      const ip = clientIp(context.request);
      const rl = await rateLimit("checkin", ctx.membershipId);
      if (!rl.ok)
        throw new ActionError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many check-in attempts. Wait a minute.",
        });
      return scoped(ctx, async (tx) => {
        const { row, needsApproval } = await svc.checkIn(tx, ctx, { ...input, ip }).catch(mapErr);
        if (needsApproval) {
          const reviewers = (
            await membersWithRoles(
              tx,
              ctx.workspaceId,
              ctx.role === "employee" ? ["owner", "manager"] : ["owner"],
            )
          ).filter((m) => m !== ctx.membershipId);
          await notify(tx, ctx.workspaceId, reviewers, {
            kind: "attendance.review",
            title: `${context.locals.user!.name}: ${row.status === "late" ? `late check-in (${row.lateMinutes} min)` : "remote check-in"} needs approval`,
            link: `/app/inbox?tab=reviews`,
          });
        }
        await publish(tx, ctx.workspaceId, "attendance");
        const time = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: ctx.timezone,
        }).format(row.checkInAt!);
        const label = {
          present: "Present",
          late: "Late",
          remote: "Remote",
          half_day: "Half-day",
          absent: "Absent",
          on_leave: "On leave",
        }[row.status];
        return {
          status: row.status,
          approval: row.approval,
          message: `${label} · Checked in at ${time}${needsApproval ? " · sent for approval" : ""}`,
        };
      });
    },
  }),

  checkOut: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context, "attendance.checkin");
      return scoped(ctx, async (tx) => {
        const row = await svc.checkOut(tx, ctx).catch(mapErr);
        await publish(tx, ctx.workspaceId, "attendance");
        return { trackedMinutes: row.trackedMinutes };
      });
    },
  }),

  startBreak: defineAction({
    input: z.object({ breakWindowId: z.uuid().nullish() }),
    handler: async ({ breakWindowId }, context) => {
      const ctx = requireCtx(context, "attendance.checkin");
      await scoped(ctx, (tx) => svc.startBreak(tx, ctx, breakWindowId ?? null).catch(mapErr));
      return { ok: true };
    },
  }),

  endBreak: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context, "attendance.checkin");
      const minutes = await scoped(ctx, (tx) => svc.endBreak(tx, ctx).catch(mapErr));
      return { minutes };
    },
  }),

  /** Ask a manager to fix a past day (e.g. a missed checkout). Never edits the record directly. */
  requestCorrection: defineAction({
    input: z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        checkIn: hhmm.nullish(),
        checkOut: hhmm.nullish(),
        reason: z.string().trim().min(5).max(500),
      })
      .refine((v) => v.checkIn || v.checkOut, { message: "Provide a check-in or check-out time." }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "attendance.checkin");
      const today = localDate(ctx.timezone);
      if (input.date > today)
        throw new ActionError({ code: "BAD_REQUEST", message: "You can't correct a future date." });
      if (input.date < addDaysISO(today, -60))
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Corrections are limited to the last 60 days.",
        });
      if (input.checkIn && input.checkOut && input.checkOut <= input.checkIn)
        throw new ActionError({ code: "BAD_REQUEST", message: "Check-out must be after check-in." });
      return scoped(ctx, async (tx) => {
        const [row] = await tx
          .insert(attendanceCorrections)
          .values({
            workspaceId: ctx.workspaceId,
            membershipId: ctx.membershipId,
            date: input.date,
            requestedCheckIn: input.checkIn
              ? svc.localToInstant(ctx.timezone, input.date, input.checkIn)
              : null,
            requestedCheckOut: input.checkOut
              ? svc.localToInstant(ctx.timezone, input.date, input.checkOut)
              : null,
            reason: input.reason,
          })
          .returning();
        const reviewers = (
          await membersWithRoles(
            tx,
            ctx.workspaceId,
            ctx.role === "employee" ? ["owner", "manager"] : ["owner"],
          )
        ).filter((m) => m !== ctx.membershipId);
        await notify(tx, ctx.workspaceId, reviewers, {
          kind: "correction.requested",
          title: `${context.locals.user!.name} requested an attendance correction for ${input.date}`,
          body: input.reason,
          link: "/app/inbox?tab=reviews",
        });
        await audit(
          tx,
          ctx,
          "attendance.correction_requested",
          "attendance_corrections",
          row!.id,
          `Requested a correction for ${input.date}`,
        );
        await publish(tx, ctx.workspaceId, "inbox");
        return { id: row!.id };
      });
    },
  }),
};
