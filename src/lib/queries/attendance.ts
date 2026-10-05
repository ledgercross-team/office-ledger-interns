import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { attendance, attendanceBreaks, attendanceCorrections, breakWindows, departments, memberships, users } from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { can } from "@/lib/permissions";
import { localDate } from "@/lib/dates";
import { getSettings } from "@/lib/services/attendance";

export async function attendanceToday(tx: Tx, ctx: WorkspaceContext) {
  const today = localDate(ctx.timezone);
  const s = await getSettings(tx, ctx.workspaceId);
  const viewAll = can(ctx, "attendance.viewAll");

  const rows = await tx
    .select({
      id: attendance.id,
      membershipId: attendance.membershipId,
      name: users.name,
      image: users.image,
      employeeCode: memberships.employeeCode,
      department: departments.name,
      status: attendance.status,
      mode: attendance.mode,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      approval: attendance.approval,
      lateMinutes: attendance.lateMinutes,
      breakMinutes: attendance.breakMinutes,
      trackedMinutes: attendance.trackedMinutes,
      note: attendance.note,
    })
    .from(attendance)
    .innerJoin(memberships, eq(memberships.id, attendance.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(departments, eq(departments.id, memberships.departmentId))
    .where(and(eq(attendance.date, today), viewAll ? undefined : eq(attendance.membershipId, ctx.membershipId)))
    .orderBy(asc(attendance.checkInAt));

  const mine = rows.find((r) => r.membershipId === ctx.membershipId) ?? null;
  const [openBreak] = mine
    ? await tx
        .select({ id: attendanceBreaks.id, startedAt: attendanceBreaks.startedAt, name: breakWindows.name })
        .from(attendanceBreaks)
        .leftJoin(breakWindows, eq(breakWindows.id, attendanceBreaks.breakWindowId))
        .where(and(eq(attendanceBreaks.attendanceId, mine.id), isNull(attendanceBreaks.endedAt)))
    : [];
  const windows = await tx.select().from(breakWindows).orderBy(asc(breakWindows.startTime));
  const counted = rows.filter((r) => r.checkInAt && r.approval !== "rejected");

  const myCorrections = await tx
    .select({
      id: attendanceCorrections.id,
      date: attendanceCorrections.date,
      status: attendanceCorrections.status,
      reason: attendanceCorrections.reason,
      requestedCheckIn: attendanceCorrections.requestedCheckIn,
      requestedCheckOut: attendanceCorrections.requestedCheckOut,
      reviewNote: attendanceCorrections.reviewNote,
      createdAt: attendanceCorrections.createdAt,
    })
    .from(attendanceCorrections)
    .where(eq(attendanceCorrections.membershipId, ctx.membershipId))
    .orderBy(desc(attendanceCorrections.createdAt))
    .limit(5);

  const recentMine = await tx
    .select({ date: attendance.date, status: attendance.status, checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt, autoCheckedOut: attendance.autoCheckedOut })
    .from(attendance)
    .where(and(eq(attendance.membershipId, ctx.membershipId), ne(attendance.date, today)))
    .orderBy(desc(attendance.date))
    .limit(14);

  return {
    today,
    timezone: ctx.timezone,
    settings: {
      officeStart: s.officeStart.slice(0, 5),
      officeEnd: s.officeEnd.slice(0, 5),
      lateThresholdMin: s.lateThresholdMin,
      approvalMode: s.approvalMode,
      remoteDaysPerWeek: s.remoteDaysPerWeek,
      geoEnabled: s.geo.enabled,
    },
    tiles: {
      present: counted.length,
      late: counted.filter((r) => r.status === "late").length,
      remote: counted.filter((r) => r.mode === "remote").length,
      checkedOut: rows.filter((r) => r.checkOutAt).length,
    },
    log: rows,
    mine,
    openBreak: openBreak ?? null,
    breakWindows: windows.map((w) => ({ id: w.id, name: w.name, start: w.startTime.slice(0, 5), end: w.endTime.slice(0, 5), paid: w.paid })),
    myCorrections,
    recentMine,
    viewAll,
  };
}
export type AttendanceToday = Awaited<ReturnType<typeof attendanceToday>>;

/** Members with no row today (for the manager log: "Not checked in"). */
export async function notCheckedIn(tx: Tx, ctx: WorkspaceContext) {
  const today = localDate(ctx.timezone);
  return tx
    .select({ membershipId: memberships.id, name: users.name, employeeCode: memberships.employeeCode })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.status, "active"),
        ne(memberships.role, "owner"),
        sql`not exists (select 1 from attendance a where a.membership_id = ${memberships.id} and a.date = ${today})`,
      ),
    )
    .orderBy(asc(users.name));
}

export async function membershipNames(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await tx
    .select({ id: memberships.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(inArray(memberships.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
