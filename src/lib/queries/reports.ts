import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  attendance,
  dailyReportCorrections,
  dailyReportSnapshots,
  holidays,
  leaveRequests,
  memberships,
  taskAssignees,
  tasks,
  users,
  workspaces,
} from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { can } from "@/lib/permissions";
import { addDaysISO, diffDays, localDate, weekday, zoned } from "@/lib/dates";
import { expand } from "@/lib/calendar";
import { getSettings } from "@/lib/services/attendance";
import { leaveBalancesFor } from "@/lib/services/leave-balance";
import { meetingsBetween } from "./calendar";
import { approvedLeaveBetween } from "./leave";
import { inboxOpenCount } from "./shell";

// ---- Performance ---------------------------------------------------------------------------------
export interface PerfRow {
  membership_id: string;
  employee_code: string | null;
  name: string;
  department: string | null;
  designation: string | null;
  attendance_index: number;
  productivity_index: number | null;
  performance_index: number;
  worked_hours: number;
  expected_hours: number;
  late_count: number;
  absent_count: number;
  missing_checkout: number;
  half_days: number;
  penalty_points: number;
}

async function perfRows(tx: Tx, ws: string, start: string, end: string): Promise<PerfRow[]> {
  const rows = await tx.execute<Record<string, unknown>>(
    sql`select * from fn_performance_index(${ws}, ${start}::date, ${end}::date)`,
  );
  return rows.map((r) => ({
    ...(r as unknown as PerfRow),
    attendance_index: Number(r.attendance_index),
    productivity_index: r.productivity_index == null ? null : Number(r.productivity_index),
    performance_index: Number(r.performance_index),
    worked_hours: Number(r.worked_hours),
    expected_hours: Number(r.expected_hours),
    penalty_points: Number(r.penalty_points),
  }));
}

/**
 * Ranking for [start, end] plus, per member, the previous equal-length period (delta) and a
 * 6-point trend of consecutive equal-length periods ending at `end` (sparkline).
 * Employees only ever receive their own row.
 */
export async function performance(tx: Tx, ctx: WorkspaceContext, start: string, end: string) {
  const len = diffDays(end, start) + 1;
  const periods = Array.from({ length: 6 }, (_, i) => {
    const e = addDaysISO(end, -len * (5 - i));
    return { start: addDaysISO(e, -(len - 1)), end: e };
  });
  const series = await Promise.all(periods.map((p) => perfRows(tx, ctx.workspaceId, p.start, p.end)));
  const current = series[5]!;
  const previous = series[4]!;
  const all = can(ctx, "performance.viewAll");
  const rows = current
    .filter((r) => all || r.membership_id === ctx.membershipId)
    .map((r) => ({
      ...r,
      previous: previous.find((p) => p.membership_id === r.membership_id)?.performance_index ?? null,
      trend: series.map((s) => s.find((p) => p.membership_id === r.membership_id)?.performance_index ?? null),
    }));
  const s = await getSettings(tx, ctx.workspaceId);
  const workdays = await tx.execute<{ n: number }>(
    sql`select fn_expected_workdays(${ctx.workspaceId}, ${start}::date, fn_effective_end(${ctx.workspaceId}, ${end}::date)) as n`,
  );
  return {
    start,
    end,
    today: localDate(ctx.timezone),
    rows,
    viewAll: all,
    settings: {
      officeStart: s.officeStart.slice(0, 5),
      officeEnd: s.officeEnd.slice(0, 5),
      scoring: s.scoring,
    },
    expectedWorkdays: Number(workdays[0]?.n ?? 0),
  };
}
export type PerformanceData = Awaited<ReturnType<typeof performance>>;

// ---- Daily report --------------------------------------------------------------------------------
export interface ReportJson {
  date: string;
  isWorkday: boolean;
  lockAt: string;
  officeEnd: string;
  attendance: {
    expected: number;
    present: number;
    late: number;
    remote: number;
    onLeave: number;
    absent: number;
    checkedOut: number;
  };
  pendingReviews: number;
  openTasks: number;
  urgentTasks: number;
  blockedTasks: number;
  openComplaints: number;
  corrections: number;
  operational: {
    workedMinutes: number;
    halfDays: number;
    missingCheckout: number;
    meetings: number;
    holidays: number;
    isHoliday: boolean;
  };
}

export async function computeReport(tx: Tx, workspaceId: string, date: string) {
  const rows = await tx.execute<{ d: ReportJson }>(
    sql`select fn_daily_report(${workspaceId}, ${date}::date) as d`,
  );
  return rows[0]!.d;
}

/** Writes the immutable snapshot for a day (no-op if it already exists). */
export async function lockReport(tx: Tx, workspaceId: string, date: string) {
  const data = await computeReport(tx, workspaceId, date);
  const res = await tx
    .insert(dailyReportSnapshots)
    .values({ workspaceId, date, data: data as unknown as Record<string, unknown> })
    .onConflictDoNothing()
    .returning();
  return res[0] ?? null;
}

export async function dailyReport(tx: Tx, ctx: WorkspaceContext, date: string) {
  const s = await getSettings(tx, ctx.workspaceId);
  const today = localDate(ctx.timezone);
  const lockAt = zoned(ctx.timezone, date, s.officeEnd);
  let [snap] = await tx.select().from(dailyReportSnapshots).where(eq(dailyReportSnapshots.date, date));
  // Days that have already ended lock lazily if the scheduled job hasn't done it yet.
  if (!snap && date <= today && Date.now() >= lockAt.getTime())
    snap =
      (await lockReport(tx, ctx.workspaceId, date)) ??
      (await tx.select().from(dailyReportSnapshots).where(eq(dailyReportSnapshots.date, date)))[0];
  const data = snap ? (snap.data as unknown as ReportJson) : await computeReport(tx, ctx.workspaceId, date);
  const corrections = await tx
    .select({
      id: dailyReportCorrections.id,
      kind: dailyReportCorrections.kind,
      description: dailyReportCorrections.description,
      createdAt: dailyReportCorrections.createdAt,
      by: users.name,
    })
    .from(dailyReportCorrections)
    .leftJoin(memberships, eq(memberships.id, dailyReportCorrections.createdBy))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(eq(dailyReportCorrections.date, date))
    .orderBy(asc(dailyReportCorrections.createdAt));
  return {
    date,
    today,
    timezone: ctx.timezone,
    locked: !!snap,
    lockedAt: snap?.lockedAt ?? null,
    lockAt: lockAt.toISOString(),
    officeEnd: s.officeEnd.slice(0, 5),
    future: date > today,
    data: { ...data, corrections: corrections.length },
    corrections,
    emailedAt: snap?.emailedAt ?? null,
    canEmail: can(ctx, "settings.edit") || can(ctx, "report.view"),
  };
}
export type DailyReportData = Awaited<ReturnType<typeof dailyReport>>;

/** Weekly / monthly roll-up from the same resolvers. */
export async function rollup(tx: Tx, ctx: WorkspaceContext, start: string, end: string) {
  const rows = await tx.execute<Record<string, number>>(sql`
    select coalesce(sum(expected_days),0)::int as expected, coalesce(sum(present_days),0)::int as present,
           coalesce(sum(late_days),0)::int as late, coalesce(sum(remote_days),0)::int as remote,
           coalesce(sum(leave_days),0)::int as on_leave, coalesce(sum(absent_days),0)::int as absent,
           coalesce(sum(half_days),0)::int as half_days, coalesce(sum(missing_checkout),0)::int as missing_checkout,
           coalesce(sum(tracked_minutes),0)::bigint as tracked, coalesce(sum(expected_minutes),0)::numeric as expected_minutes
    from fn_attendance_summary(${ctx.workspaceId}, ${start}::date, ${end}::date)`);
  const r = rows[0] ?? {};
  const days = await tx.execute<{ n: number }>(
    sql`select fn_expected_workdays(${ctx.workspaceId}, ${start}::date, ${end}::date) as n`,
  );
  const snaps = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(dailyReportSnapshots)
    .where(and(gte(dailyReportSnapshots.date, start), lte(dailyReportSnapshots.date, end)));
  const corr = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(dailyReportCorrections)
    .where(and(gte(dailyReportCorrections.date, start), lte(dailyReportCorrections.date, end)));
  const done = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        gte(tasks.completedAt, new Date(`${start}T00:00:00Z`)),
        lte(tasks.completedAt, new Date(`${addDaysISO(end, 1)}T00:00:00Z`)),
      ),
    );
  return {
    start,
    end,
    workdays: Number(days[0]?.n ?? 0),
    memberDays: Number(r.expected ?? 0),
    present: Number(r.present ?? 0),
    late: Number(r.late ?? 0),
    remote: Number(r.remote ?? 0),
    onLeave: Number(r.on_leave ?? 0),
    absent: Number(r.absent ?? 0),
    halfDays: Number(r.half_days ?? 0),
    missingCheckout: Number(r.missing_checkout ?? 0),
    workedHours: Math.round(Number(r.tracked ?? 0) / 60),
    expectedHours: Math.round(Number(r.expected_minutes ?? 0) / 60),
    lockedDays: snaps[0]?.n ?? 0,
    corrections: corr[0]?.n ?? 0,
    tasksCompleted: done[0]?.n ?? 0,
  };
}
export type Rollup = Awaited<ReturnType<typeof rollup>>;

export function reportText(
  workspace: string,
  r: Pick<DailyReportData, "date" | "locked" | "data" | "corrections">,
) {
  const a = r.data.attendance;
  const o = r.data.operational;
  return [
    `${workspace} · End-of-day summary · ${r.date}${r.locked ? " (locked)" : " (live)"}`,
    ``,
    `Attendance: ${a.present}/${a.expected} present · ${a.late} late · ${a.remote} remote · ${a.onLeave} on leave · ${a.absent} absent`,
    `Worked: ${Math.round(o.workedMinutes / 60)}h · Half-days: ${o.halfDays} · Missing checkout: ${o.missingCheckout}`,
    `Meetings: ${o.meetings} · Open tasks: ${r.data.openTasks} (${r.data.urgentTasks} urgent, ${r.data.blockedTasks} blocked)`,
    `Pending reviews: ${r.data.pendingReviews} · Open complaints: ${r.data.openComplaints}`,
    ...(r.corrections.length
      ? [``, `Corrections after lock:`, ...r.corrections.map((c) => `- ${c.description}`)]
      : []),
  ].join("\n");
}

// ---- Dashboard -----------------------------------------------------------------------------------
export interface DashboardSeriesPoint {
  date: string;
  isWorkday: boolean;
  present: number;
  late: number;
  remote: number;
}

export async function dashboardSeries(tx: Tx, ctx: WorkspaceContext, days: 7 | 30 | 90) {
  const rows = await tx.execute<{ d: { series: DashboardSeriesPoint[] } }>(
    sql`select fn_dashboard_today(${ctx.workspaceId}, ${days}) as d`,
  );
  return rows[0]!.d.series;
}

export async function dashboard(tx: Tx, ctx: WorkspaceContext) {
  const today = localDate(ctx.timezone);
  const s = await getSettings(tx, ctx.workspaceId);
  const in14 = addDaysISO(today, 14);
  const [mtgs, outToday, upcomingHolidays, people, me] = await Promise.all([
    meetingsBetween(tx, today, addDaysISO(today, 7)),
    approvedLeaveBetween(tx, today, today),
    tx
      .select({ id: holidays.id, date: holidays.date, name: holidays.name })
      .from(holidays)
      .where(
        and(
          eq(holidays.status, "active"),
          gte(holidays.date, today),
          lte(holidays.date, addDaysISO(today, 60)),
        ),
      )
      .orderBy(asc(holidays.date))
      .limit(5),
    tx
      .select({
        id: memberships.id,
        name: users.name,
        image: users.image,
        birthDate: memberships.birthDate,
        joinedAt: memberships.joinedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.status, "active")),
    tx
      .select()
      .from(attendance)
      .where(and(eq(attendance.membershipId, ctx.membershipId), eq(attendance.date, today))),
  ]);
  const occurrences = expand(mtgs, today, addDaysISO(today, 7), ctx.timezone, s.weekendDays).filter(
    (o) => o.meeting.attendees.some((a) => a.id === ctx.membershipId) || can(ctx, "meetings.manage"),
  );
  const nextDate = (mmdd: string) => {
    const y = Number(today.slice(0, 4));
    const d = `${y}-${mmdd}`;
    return d < today ? `${y + 1}-${mmdd}` : d;
  };
  const celebrations = people
    .flatMap((p) => {
      const out: {
        id: string;
        name: string;
        image: string | null;
        kind: "birthday" | "anniversary";
        date: string;
        years?: number;
      }[] = [];
      if (p.birthDate) {
        const d = nextDate(p.birthDate.slice(5));
        if (d <= in14) out.push({ id: p.id, name: p.name, image: p.image, kind: "birthday", date: d });
      }
      if (p.joinedAt) {
        const d = nextDate(p.joinedAt.slice(5));
        const years = Number(d.slice(0, 4)) - Number(p.joinedAt.slice(0, 4));
        if (years > 0 && d <= in14)
          out.push({ id: p.id, name: p.name, image: p.image, kind: "anniversary", date: d, years });
      }
      return out;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const [ws] = await tx
    .select({ inviteCode: workspaces.inviteCode, inviteCodeExpiresAt: workspaces.inviteCodeExpiresAt })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId));
  const base = {
    today,
    timezone: ctx.timezone,
    officeStart: s.officeStart.slice(0, 5),
    myAttendance: me[0]
      ? {
          status: me[0].status,
          approval: me[0].approval,
          checkInAt: me[0].checkInAt,
          checkOutAt: me[0].checkOutAt,
          mode: me[0].mode,
        }
      : null,
    meetings: occurrences
      .slice(0, 20)
      .map((o) => ({
        id: o.meeting.id,
        title: o.meeting.title,
        start: o.start,
        date: o.date,
        location: o.meeting.location,
      })),
    outToday: outToday.map((l) => ({
      id: l.membershipId,
      name: l.name,
      image: l.image,
      kind: l.kind,
      type: l.type,
    })),
    holidays: upcomingHolidays,
    celebrations,
  };

  if (!can(ctx, "dashboard.org")) {
    // Employee variant: own streak, hours this week, leave balance, my tasks.
    const recent = await tx
      .select({
        date: attendance.date,
        status: attendance.status,
        checkInAt: attendance.checkInAt,
        tracked: attendance.trackedMinutes,
        approval: attendance.approval,
      })
      .from(attendance)
      .where(
        and(eq(attendance.membershipId, ctx.membershipId), gte(attendance.date, addDaysISO(today, -120))),
      )
      .orderBy(desc(attendance.date));
    const workdays = (
      await tx.execute<{ day: string }>(
        sql`select day::text as day from fn_workdays(${ctx.workspaceId}, ${addDaysISO(today, -120)}::date, ${today}::date) order by day desc`,
      )
    ).map((r) => r.day);
    const attended = new Set(
      recent
        .filter((r) => (r.checkInAt || r.status === "on_leave") && r.approval !== "rejected")
        .map((r) => r.date),
    );
    let streak = 0;
    for (const d of workdays) {
      if (d === today && !attended.has(d)) continue; // today not over yet
      if (!attended.has(d)) break;
      streak++;
    }
    const weekStart = addDaysISO(today, -((weekday(today) + 6) % 7));
    const weekMinutes = recent.filter((r) => r.date >= weekStart).reduce((a, r) => a + (r.tracked ?? 0), 0);
    const balances =
      (await leaveBalancesFor(tx, [ctx.membershipId], Number(today.slice(0, 4)))).get(ctx.membershipId) ?? [];
    const myTasks = await tx
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
      })
      .from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .where(
        and(
          eq(taskAssignees.membershipId, ctx.membershipId),
          isNull(tasks.archivedAt),
          ne(tasks.status, "done"),
        ),
      )
      .orderBy(asc(tasks.dueDate))
      .limit(8);
    const pendingLeave = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.membershipId, ctx.membershipId), eq(leaveRequests.status, "pending")));
    return {
      mode: "employee" as const,
      ...base,
      streak,
      weekMinutes,
      balances,
      myTasks,
      pendingLeave: pendingLeave[0]?.n ?? 0,
    };
  }

  const rows = await tx.execute<{
    d: { coverage: number; workedRate: number; report: ReportJson; series: DashboardSeriesPoint[] };
  }>(sql`select fn_dashboard_today(${ctx.workspaceId}, 7) as d`);
  const d = rows[0]!.d;
  // Previous workday for tile deltas
  const prevDay = (
    await tx.execute<{ day: string }>(
      sql`select max(day)::text as day from fn_workdays(${ctx.workspaceId}, ${addDaysISO(today, -14)}::date, ${addDaysISO(today, -1)}::date)`,
    )
  )[0]?.day;
  const prev = prevDay ? await computeReport(tx, ctx.workspaceId, prevDay) : null;
  const inbox = await inboxOpenCount(tx, ctx);
  return {
    mode: "org" as const,
    ...base,
    coverage: Number(d.coverage),
    workedRate: Number(d.workedRate),
    report: d.report,
    previous: prev ? { date: prevDay!, attendance: prev.attendance } : null,
    series: d.series,
    inbox,
    invite:
      can(ctx, "invite.manage") || can(ctx, "employees.manage")
        ? {
            code: ws!.inviteCode,
            expiresAt: ws!.inviteCodeExpiresAt,
            canRegenerate: can(ctx, "invite.manage"),
          }
        : null,
  };
}
export type DashboardData = Awaited<ReturnType<typeof dashboard>>;
