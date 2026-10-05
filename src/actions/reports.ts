import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { and, eq, inArray } from "drizzle-orm";
import { dailyReportSnapshots, memberships, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { addDaysISO, diffDays, localDate } from "@/lib/dates";
import { mailHtml, sendMail } from "@/lib/mailer";
import { env } from "@/lib/env";
import {
  dailyReport,
  dashboard,
  dashboardSeries,
  performance,
  reportText,
  rollup,
} from "@/lib/queries/reports";
import { requireCtx, scoped } from "./_helpers";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reports = {
  performance: defineAction({
    input: z
      .object({ start: date, end: date })
      .refine((v) => v.end >= v.start, "End must be after start")
      .refine((v) => diffDays(v.end, v.start) <= 366, "Pick a range of a year or less"),
    handler: async ({ start, end }, context) => {
      const ctx = requireCtx(context, "performance.viewOwn");
      return scoped(ctx, (tx) => performance(tx, ctx, start, end));
    },
  }),

  daily: defineAction({
    input: z.object({ date }),
    handler: async ({ date: d }, context) => {
      const ctx = requireCtx(context, "report.view");
      return scoped(ctx, (tx) => dailyReport(tx, ctx, d));
    },
  }),

  rollup: defineAction({
    input: z.object({ period: z.enum(["week", "month"]), anchor: date }),
    handler: async ({ period, anchor }, context) => {
      const ctx = requireCtx(context, "report.view");
      const today = localDate(ctx.timezone);
      let start: string;
      let end: string;
      if (period === "week") {
        const dow = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7;
        start = addDaysISO(anchor, -dow);
        end = addDaysISO(start, 6);
      } else {
        start = `${anchor.slice(0, 7)}-01`;
        end = addDaysISO(addDaysISO(start, 32).slice(0, 8) + "01", -1);
      }
      if (end > today) end = today;
      return scoped(ctx, (tx) => rollup(tx, ctx, start, end));
    },
  }),

  emailDaily: defineAction({
    input: z.object({ date }),
    handler: async ({ date: d }, context) => {
      const ctx = requireCtx(context, "report.view");
      return scoped(ctx, async (tx) => {
        const r = await dailyReport(tx, ctx, d);
        if (!r.locked)
          throw new ActionError({ code: "BAD_REQUEST", message: "Only locked reports can be emailed." });
        const recipients = await tx
          .select({ email: users.email })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(and(eq(memberships.status, "active"), inArray(memberships.role, ["owner", "manager"])));
        const text = reportText(ctx.workspaceName, r);
        const url = `${env.PUBLIC_SITE_URL}/app/reports/daily?date=${d}`;
        await sendMail({
          to: recipients.map((x) => x.email),
          subject: `${ctx.workspaceName} · EOD summary ${d}`,
          text: `${text}\n\n${url}`,
          html: mailHtml(`End-of-day summary · ${d}`, text.split("\n").filter(Boolean).slice(1), {
            label: "Open report",
            url,
          }),
        });
        await tx
          .update(dailyReportSnapshots)
          .set({ emailedAt: new Date() })
          .where(eq(dailyReportSnapshots.date, d));
        await audit(
          tx,
          ctx,
          "report.emailed",
          "daily_report_snapshots",
          null,
          `Emailed the locked report for ${d} to ${recipients.length} people`,
        );
        return { sent: recipients.length };
      });
    },
  }),

  dashboard: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, (tx) => dashboard(tx, ctx));
    },
  }),

  series: defineAction({
    input: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]) }),
    handler: async ({ days }, context) => {
      const ctx = requireCtx(context, "dashboard.org");
      return scoped(ctx, (tx) => dashboardSeries(tx, ctx, days));
    },
  }),
};
