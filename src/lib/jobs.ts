/**
 * Scheduled jobs. Run every minute by node-cron inside the server (JOBS_ENABLED=true) or by a
 * platform cron hitting /api/cron/<job> with the CRON_SECRET. Every job is idempotent: once-a-day
 * work is recorded in job_runs, so several instances or retries never double-send.
 */
import cron from "node-cron";
import { and, eq, inArray, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { db, withWorkspace, type Tx } from "@/db";
import {
  attendance,
  dailyReportSnapshots,
  jobRuns,
  memberships,
  taskAssignees,
  tasks,
  users,
  workspaceSettings,
  workspaces,
} from "@/db/schema";
import { addDaysISO, localDate, localTime, minutesOf, zoned } from "./dates";
import { env } from "./env";
import { inviteCode } from "./ids";
import { mailHtml, sendMail } from "./mailer";
import { notify, publish } from "./notifications";
import { dailyReport, lockReport, reportText } from "./queries/reports";
import type { WorkspaceContext } from "./auth-types";

export type JobName = "lock-reports" | "auto-checkout" | "digest" | "due-reminders" | "expire-invites";
export const JOBS: JobName[] = ["lock-reports", "auto-checkout", "digest", "due-reminders", "expire-invites"];

async function once(tx: Tx, workspaceId: string, job: string, runDate: string) {
  const res = await tx
    .insert(jobRuns)
    .values({ workspaceId, job, runDate })
    .onConflictDoNothing()
    .returning({ id: jobRuns.id });
  return res.length > 0;
}

function systemCtx(
  ws: { id: string; name: string; timezone: string; locale: string },
  owner: { id: string; userId: string },
): WorkspaceContext {
  return {
    userId: owner.userId,
    workspaceId: ws.id,
    workspaceName: ws.name,
    workspaceSlug: "",
    timezone: ws.timezone,
    membershipId: owner.id,
    role: "owner",
    status: "active",
    employeeCode: null,
    departmentId: null,
    onboarded: true,
    locale: ws.locale,
  };
}

async function getJobWorkspaces() {
  try {
    return await db
      .select({ ws: workspaces, s: workspaceSettings })
      .from(workspaces)
      .innerJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaces.id))
      .where(isNotNull(workspaces.onboardedAt));
  } catch (error) {
    // A local frontend run may not have PostgreSQL available. Skip this cycle instead of
    // allowing the rejected query to surface as an Astro unhandled-rejection overlay.
    console.error(
      "[jobs] database unavailable; skipping cycle",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function runJobs(only?: JobName, now = new Date()) {
  const list = await getJobWorkspaces();
  if (!list) return [];
  const done: string[] = [];
  for (const { ws, s } of list) {
    const today = localDate(ws.timezone, now);
    const nowMin = minutesOf(localTime(ws.timezone, now));
    const run = (j: JobName) => !only || only === j;
    try {
      await withWorkspace(ws.id, async (tx) => {
        // 1. Lock today's report at office end (and any missed past day in the last week).
        if (run("lock-reports")) {
          const days = [addDaysISO(today, -1), today].filter(
            (d) => d < today || nowMin >= minutesOf(s.officeEnd),
          );
          for (const d of days) {
            const snap = await lockReport(tx, ws.id, d);
            if (snap) {
              done.push(`${ws.slug}:lock:${d}`);
              await publish(tx, ws.id, "reports");
              if (s.digest.emailLockedReport && d === today) {
                const [owner] = await tx
                  .select()
                  .from(memberships)
                  .where(eq(memberships.role, "owner"))
                  .limit(1);
                if (owner) {
                  const r = await dailyReport(tx, systemCtx(ws, owner), d);
                  const to = await tx
                    .select({ email: users.email })
                    .from(memberships)
                    .innerJoin(users, eq(users.id, memberships.userId))
                    .where(
                      and(eq(memberships.status, "active"), inArray(memberships.role, ["owner", "manager"])),
                    );
                  const text = reportText(ws.name, r);
                  const url = `${env.PUBLIC_SITE_URL}/app/reports/daily?date=${d}`;
                  await sendMail({
                    to: to.map((x) => x.email),
                    subject: `${ws.name} · EOD summary ${d}`,
                    text: `${text}\n\n${url}`,
                    html: mailHtml(`End-of-day summary · ${d}`, text.split("\n").filter(Boolean).slice(1), {
                      label: "Open report",
                      url,
                    }),
                  }).catch(() => {});
                  await tx
                    .update(dailyReportSnapshots)
                    .set({ emailedAt: new Date() })
                    .where(eq(dailyReportSnapshots.id, snap.id));
                }
              }
            }
          }
        }

        // 2. Auto-checkout: open sessions past the configured hour (or from earlier days).
        if (run("auto-checkout") && s.autoCheckoutAt) {
          const due = nowMin >= minutesOf(s.autoCheckoutAt);
          const open = await tx
            .select({
              id: attendance.id,
              date: attendance.date,
              membershipId: attendance.membershipId,
              checkInAt: attendance.checkInAt,
            })
            .from(attendance)
            .where(
              and(
                isNotNull(attendance.checkInAt),
                isNull(attendance.checkOutAt),
                due ? lte(attendance.date, today) : lt(attendance.date, today),
              ),
            );
          for (const a of open) {
            // Count time only up to office end so a forgotten checkout isn't rewarded with overtime.
            const end = zoned(ws.timezone, a.date, s.officeEnd);
            const out = a.checkInAt! < end ? end : new Date(a.checkInAt!.getTime() + 60_000);
            await tx
              .update(attendance)
              .set({ checkOutAt: out, autoCheckedOut: true })
              .where(eq(attendance.id, a.id));
            await notify(tx, ws.id, [a.membershipId], {
              kind: "attendance.missing_checkout",
              title: `You didn't check out on ${a.date}`,
              body: "We closed your day at office end. Request a correction if you worked different hours.",
              link: "/app/attendance",
            });
          }
          if (open.length) {
            done.push(`${ws.slug}:auto-checkout:${open.length}`);
            await publish(tx, ws.id, "attendance");
            await publish(tx, ws.id, "inbox");
          }
        }

        const digestTime = nowMin >= s.digest.digestHour * 60;

        // 3. Morning digest email (once per day).
        if (run("digest") && s.digest.dailyDigest && digestTime && (await once(tx, ws.id, "digest", today))) {
          const members = await tx
            .select({
              id: memberships.id,
              role: memberships.role,
              prefs: memberships.notifyPrefs,
              email: users.email,
              name: users.name,
            })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .where(eq(memberships.status, "active"));
          const inbox = await tx.execute<{ n: number }>(
            sql`select count(*)::int as n from v_inbox_items where workspace_id = ${ws.id}`,
          );
          for (const m of members.filter((x) => x.prefs.emailDigest)) {
            const myTasks = await tx
              .select({ title: tasks.title, dueDate: tasks.dueDate })
              .from(tasks)
              .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
              .where(
                and(
                  eq(taskAssignees.membershipId, m.id),
                  isNull(tasks.archivedAt),
                  ne(tasks.status, "done"),
                  lte(tasks.dueDate, addDaysISO(today, 2)),
                ),
              );
            const lines = [
              ...(m.role !== "employee" ? [`${inbox[0]?.n ?? 0} items are waiting in the Inbox.`] : []),
              ...(myTasks.length
                ? [`Due soon: ${myTasks.map((t) => `${t.title} (${t.dueDate})`).join("; ")}`]
                : []),
            ];
            if (!lines.length) continue;
            await sendMail({
              to: m.email,
              subject: `${ws.name} · your morning digest`,
              text: `Good morning ${m.name},\n\n${lines.join("\n")}\n\n${env.PUBLIC_SITE_URL}/app`,
              html: mailHtml("Your morning digest", [`Good morning ${m.name},`, ...lines], {
                label: "Open Office Ledger",
                url: `${env.PUBLIC_SITE_URL}/app`,
              }),
            }).catch(() => {});
          }
          done.push(`${ws.slug}:digest`);
        }

        // 4. Due-soon reminders (tasks due tomorrow or today, once per task).
        if (run("due-reminders") && digestTime) {
          const due = await tx
            .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate })
            .from(tasks)
            .where(
              and(
                isNull(tasks.archivedAt),
                ne(tasks.status, "done"),
                isNull(tasks.dueReminderSentAt),
                lte(tasks.dueDate, addDaysISO(today, 1)),
              ),
            );
          for (const t of due) {
            const who = (
              await tx
                .select({ id: taskAssignees.membershipId })
                .from(taskAssignees)
                .where(eq(taskAssignees.taskId, t.id))
            ).map((a) => a.id);
            await notify(tx, ws.id, who, {
              kind: "task.due",
              title:
                t.dueDate! < today
                  ? `Overdue: ${t.title}`
                  : t.dueDate === today
                    ? `Due today: ${t.title}`
                    : `Due tomorrow: ${t.title}`,
              link: `/app/tasks?task=${t.id}`,
            });
            await tx.update(tasks).set({ dueReminderSentAt: new Date() }).where(eq(tasks.id, t.id));
          }
          if (due.length) done.push(`${ws.slug}:due:${due.length}`);
        }

        // 5. Expired invite codes are rotated so the old code stops working.
        if (run("expire-invites") && ws.inviteCodeExpiresAt && ws.inviteCodeExpiresAt < now) {
          await tx
            .update(workspaces)
            .set({ inviteCode: inviteCode(ws.name), inviteCodeExpiresAt: null })
            .where(eq(workspaces.id, ws.id));
          const owners = (
            await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.role, "owner"))
          ).map((o) => o.id);
          await notify(tx, ws.id, owners, {
            kind: "invite.expired",
            title: "Your invite code expired and was replaced",
            link: "/app",
          });
          done.push(`${ws.slug}:invite`);
        }
      });
    } catch (e) {
      console.error(`[jobs] ${ws.slug} failed`, e);
    }
  }
  return done;
}

const g = globalThis as unknown as { __ledgerJobs?: boolean };
export function startJobs() {
  if (g.__ledgerJobs || !env.JOBS_ENABLED || env.NODE_ENV === "test") return;
  g.__ledgerJobs = true;
  cron.schedule("* * * * *", () => {
    void runJobs()
      .then((done) => done.length && console.info(`[jobs] ${done.join(", ")}`))
      .catch((error) => {
        // A transient database outage must not become an unhandled rejection in Astro.
        console.error("[jobs] run failed", error);
      });
  });
}
