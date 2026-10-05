import { and, asc, count, desc, eq, gte, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Tx } from "@/db";
import {
  attendance,
  auditLog,
  complaints,
  departments,
  designations,
  files,
  holidays,
  leaveRequests,
  memberships,
  users,
} from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { can } from "@/lib/permissions";
import { addDaysISO, localDate, weekday } from "@/lib/dates";
import { signedFileUrl } from "@/lib/files";
import { getSettings } from "@/lib/services/attendance";
import { leaveBalancesFor } from "@/lib/services/leave-balance";

const manager = alias(memberships, "mgr");
const managerUser = alias(users, "mgr_user");

export async function listEmployees(tx: Tx) {
  const rows = await tx
    .select({
      id: memberships.id,
      employeeCode: memberships.employeeCode,
      name: users.name,
      email: users.email,
      image: users.image,
      designation: designations.name,
      designationId: memberships.designationId,
      department: departments.name,
      departmentId: memberships.departmentId,
      joinedAt: memberships.joinedAt,
      phone: memberships.phone,
      role: memberships.role,
      status: memberships.status,
      managerId: memberships.managerId,
      managerName: managerUser.name,
      requestedAt: memberships.createdAt,
      statusChangedAt: memberships.statusChangedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(departments, eq(departments.id, memberships.departmentId))
    .leftJoin(designations, eq(designations.id, memberships.designationId))
    .leftJoin(manager, eq(manager.id, memberships.managerId))
    .leftJoin(managerUser, eq(managerUser.id, manager.userId))
    .orderBy(asc(memberships.employeeCode), asc(users.name));
  return rows;
}
export type EmployeeRow = Awaited<ReturnType<typeof listEmployees>>[number];

export async function orgLookups(tx: Tx) {
  const [deps, desigs] = await Promise.all([
    tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name)),
    tx.select({ id: designations.id, name: designations.name }).from(designations).orderBy(asc(designations.name)),
  ]);
  return { departments: deps, designations: desigs };
}

export async function employeesPage(tx: Tx) {
  const [employees, lookups] = await Promise.all([listEmployees(tx), orgLookups(tx)]);
  const usage = await tx
    .select({ departmentId: memberships.departmentId, designationId: memberships.designationId, n: count() })
    .from(memberships)
    .groupBy(memberships.departmentId, memberships.designationId);
  return { employees, ...lookups, usage };
}

export type HeatCell = { date: string; state: "present" | "late" | "remote" | "half_day" | "on_leave" | "absent" | "weekend" | "holiday" | "future" | "before" };

/** Everything on an employee profile. Returns null if not visible to the viewer. */
export async function employeeProfile(tx: Tx, ctx: WorkspaceContext, membershipId: string) {
  const self = membershipId === ctx.membershipId;
  if (!self && !can(ctx, "profile.viewOther")) return null;
  const [found] = await tx
    .select({
      id: memberships.id,
      userId: memberships.userId,
      employeeCode: memberships.employeeCode,
      name: users.name,
      email: users.email,
      image: users.image,
      role: memberships.role,
      status: memberships.status,
      designation: designations.name,
      designationId: memberships.designationId,
      department: departments.name,
      departmentId: memberships.departmentId,
      managerId: memberships.managerId,
      managerName: managerUser.name,
      joinedAt: memberships.joinedAt,
      birthDate: memberships.birthDate,
      phone: memberships.phone,
      address: memberships.address,
      bloodGroup: memberships.bloodGroup,
      emergencyContact: memberships.emergencyContact,
      notifyPrefs: memberships.notifyPrefs,
      icalToken: memberships.icalToken,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(departments, eq(departments.id, memberships.departmentId))
    .leftJoin(designations, eq(designations.id, memberships.designationId))
    .leftJoin(manager, eq(manager.id, memberships.managerId))
    .leftJoin(managerUser, eq(managerUser.id, manager.userId))
    .where(eq(memberships.id, membershipId));
  if (!found) return null;
  const p = found;

  const today = localDate(ctx.timezone);
  const from90 = addDaysISO(today, -89);
  const s = await getSettings(tx, ctx.workspaceId);

  const [totals] = await tx
    .select({
      attendanceDays: sql<number>`count(*) filter (where ${attendance.checkInAt} is not null and ${attendance.approval} <> 'rejected')::int`,
      completedDays: sql<number>`count(*) filter (where ${attendance.checkOutAt} is not null and not ${attendance.autoCheckedOut})::int`,
      trackedMinutes: sql<number>`coalesce(sum(${attendance.trackedMinutes}) filter (where ${attendance.approval} <> 'rejected'), 0)::int`,
      lastIn: sql<Date | null>`max(${attendance.checkInAt})`,
      lastOut: sql<Date | null>`max(${attendance.checkOutAt})`,
    })
    .from(attendance)
    .where(eq(attendance.membershipId, membershipId));
  const [issueCount] = await tx
    .select({ n: count() })
    .from(complaints)
    .where(and(eq(complaints.submitterId, membershipId), self || can(ctx, "complaints.seeAnonymous") ? undefined : eq(complaints.anonymous, false)));

  const record = await tx
    .select({
      id: attendance.id,
      date: attendance.date,
      status: attendance.status,
      mode: attendance.mode,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt,
      trackedMinutes: attendance.trackedMinutes,
      approval: attendance.approval,
      note: attendance.note,
      autoCheckedOut: attendance.autoCheckedOut,
    })
    .from(attendance)
    .where(and(eq(attendance.membershipId, membershipId), gte(attendance.date, addDaysISO(today, -90))))
    .orderBy(desc(attendance.date));

  const summaryRows = await tx.execute<{
    present_days: number;
    late_days: number;
    remote_days: number;
    leave_days: number;
    absent_days: number;
    half_days: number;
  }>(sql`select * from fn_attendance_summary(${ctx.workspaceId}, ${from90}::date, ${today}::date) where membership_id = ${membershipId}`);
  const sm = summaryRows[0];

  const hol = await tx
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(eq(holidays.status, "active"), gte(holidays.date, addDaysISO(today, -90)), lte(holidays.date, today)));
  const holSet = new Set(hol.map((h) => h.date));
  const byDate = new Map(record.map((r) => [r.date, r]));
  const heatmap: HeatCell[] = [];
  const heatStart = addDaysISO(today, -90); // 13 full weeks ending today
  for (let i = 0; i < 91; i++) {
    const d = addDaysISO(heatStart, i);
    const r = byDate.get(d);
    let state: HeatCell["state"];
    if (d > today) state = "future";
    else if (p.joinedAt && d < p.joinedAt) state = "before";
    else if (r && r.approval !== "rejected") state = r.status === "absent" ? "absent" : r.status;
    else if (s.weekendDays.includes(weekday(d))) state = "weekend";
    else if (holSet.has(d)) state = "holiday";
    else if (d === today) state = "future";
    else state = "absent";
    heatmap.push({ date: d, state });
  }

  const year = Number(today.slice(0, 4));
  const balances = (await leaveBalancesFor(tx, [membershipId], year)).get(membershipId) ?? [];

  const docs = await tx
    .select({ id: files.id, filename: files.filename, mime: files.mime, size: files.size, kind: files.kind, createdAt: files.createdAt })
    .from(files)
    .where(and(eq(files.entityType, "membership"), eq(files.entityId, membershipId)))
    .orderBy(desc(files.createdAt));

  const canSeeDocs = self || can(ctx, "employees.manage", { ownerRole: p.role });
  const activity = await tx
    .select({ id: auditLog.id, action: auditLog.action, summary: auditLog.summary, createdAt: auditLog.createdAt, actorName: users.name })
    .from(auditLog)
    .leftJoin(memberships, eq(memberships.id, auditLog.actorMembershipId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(or(eq(auditLog.entityId, membershipId), eq(auditLog.actorMembershipId, membershipId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(20);
  const leaveActivity = await tx
    .select({ id: leaveRequests.id, kind: leaveRequests.kind, status: leaveRequests.status, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, createdAt: leaveRequests.createdAt })
    .from(leaveRequests)
    .where(eq(leaveRequests.membershipId, membershipId))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(10);
  const timeline = [
    ...activity.map((a) => ({ id: a.id, at: a.createdAt, text: a.summary, by: a.actorName })),
    ...leaveActivity.map((l) => ({
      id: l.id,
      at: l.createdAt,
      text: `${l.kind === "half_day" ? "Half-day" : "Leave"} request ${l.startDate}${l.endDate !== l.startDate ? ` → ${l.endDate}` : ""} · ${l.status}`,
      by: null,
    })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 20);

  const worked = record.filter((r) => r.checkInAt).slice(0, 30);
  return {
    today,
    timezone: ctx.timezone,
    self,
    profile: { ...p, icalToken: self ? p.icalToken : null, notifyPrefs: self ? p.notifyPrefs : null },
    stats: {
      attendanceDays: totals?.attendanceDays ?? 0,
      completedDays: totals?.completedDays ?? 0,
      trackedMinutes: totals?.trackedMinutes ?? 0,
      avgMinutes: totals?.attendanceDays ? Math.round((totals.trackedMinutes ?? 0) / Math.max(1, totals.completedDays)) : 0,
      lastIn: totals?.lastIn ?? null,
      lastOut: totals?.lastOut ?? null,
      issues: issueCount?.n ?? 0,
    },
    summary90: {
      present: sm?.present_days ?? 0,
      late: sm?.late_days ?? 0,
      remote: sm?.remote_days ?? 0,
      onLeave: sm?.leave_days ?? 0,
      absent: sm?.absent_days ?? 0,
      halfDays: sm?.half_days ?? 0,
    },
    workingHours: worked.map((r) => ({ date: r.date, checkInAt: r.checkInAt, checkOutAt: r.checkOutAt, trackedMinutes: r.trackedMinutes })),
    record,
    heatmap,
    balances,
    documents: canSeeDocs ? docs.map((d) => ({ ...d, url: signedFileUrl(d.id, 600) })) : null,
    timeline,
    permissions: {
      editCompany: !self && can(ctx, "employees.manage", { ownerRole: p.role }) && p.role !== "owner",
      editRole: can(ctx, "roles.manage") && !self && p.role !== "owner",
      editPersonal: self,
      uploadDocs: canSeeDocs,
      deactivate: !self && can(ctx, "employees.manage", { ownerRole: p.role }) && p.role !== "owner",
    },
  };
}
export type EmployeeProfile = NonNullable<Awaited<ReturnType<typeof employeeProfile>>>;

/** Managers available for the "reports to" field. */
export async function managerOptions(tx: Tx) {
  return tx
    .select({ id: memberships.id, name: users.name, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.status, "active"), ne(memberships.role, "employee")))
    .orderBy(asc(users.name));
}

export async function nextEmployeeCode(tx: Tx) {
  const rows = await tx.select({ code: memberships.employeeCode }).from(memberships).where(isNotNull(memberships.employeeCode));
  let prefix = "EMP";
  let max = 0;
  for (const r of rows) {
    const m = /^([A-Z]+)-(\d+)$/.exec(r.code ?? "");
    if (m && m[1] !== "OWN") {
      prefix = m[1]!;
      max = Math.max(max, Number(m[2]));
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
