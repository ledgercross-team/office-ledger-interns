/**
 * Review decisions shared by the Inbox and the source pages (Employees, Leave, Calendar,
 * Complaints, Attendance). Every function runs inside the caller's RLS-scoped transaction,
 * re-checks permissions against the source record, notifies the requester and writes the audit log.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import {
  attendance,
  attendanceCorrections,
  complaintEvents,
  complaints,
  dailyReportCorrections,
  dailyReportSnapshots,
  exceptionAcks,
  holidays,
  leaveRequests,
  memberships,
  users,
} from "@/db/schema";
import type { Role, WorkspaceContext } from "@/lib/auth-types";
import { audit } from "@/lib/audit";
import { fmtDate } from "@/lib/dates";
import { mailHtml, sendMail } from "@/lib/mailer";
import { notify, publish } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { env } from "@/lib/env";
import { applyCorrection } from "./attendance";

export class DecisionError extends Error {
  constructor(
    message: string,
    public code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" = "BAD_REQUEST",
  ) {
    super(message);
  }
}

export type Decision = "approve" | "reject";

async function member(tx: Tx, id: string) {
  const [m] = await tx
    .select({ id: memberships.id, role: memberships.role, name: users.name, email: users.email, prefs: memberships.notifyPrefs, departmentId: memberships.departmentId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.id, id));
  return m;
}

function ensureCan(ctx: WorkspaceContext, owner: { id: string; role: Role } | null | undefined, kind?: string) {
  if (!can(ctx, "inbox.review", { ownerMembershipId: owner?.id, ownerRole: owner?.role, kind }))
    throw new DecisionError("You can't review this item.", "FORBIDDEN");
}

/** In-app notification + optional email (respecting the member's preference). */
export async function tellRequester(
  tx: Tx,
  ctx: WorkspaceContext,
  m: { id: string; email: string; name: string; prefs: { emailOnDecision: boolean } },
  msg: { kind: string; title: string; body?: string | null; link: string },
) {
  await notify(tx, ctx.workspaceId, [m.id], msg);
  if (m.prefs.emailOnDecision) {
    const url = `${env.PUBLIC_SITE_URL}${msg.link}`;
    await sendMail({
      to: m.email,
      subject: msg.title,
      text: `${msg.title}${msg.body ? `\n\n${msg.body}` : ""}\n\n${url}`,
      html: mailHtml(msg.title, [`Hi ${m.name},`, ...(msg.body ? [msg.body] : [])], { label: "Open Office Ledger", url }),
    }).catch(() => {});
  }
}

async function noteLockedDay(tx: Tx, ctx: WorkspaceContext, date: string, kind: string, description: string, sourceTable: string, sourceId: string) {
  const [snap] = await tx
    .select({ id: dailyReportSnapshots.id })
    .from(dailyReportSnapshots)
    .where(and(eq(dailyReportSnapshots.workspaceId, ctx.workspaceId), eq(dailyReportSnapshots.date, date)));
  if (snap)
    await tx.insert(dailyReportCorrections).values({ workspaceId: ctx.workspaceId, date, kind, description, sourceTable, sourceId, createdBy: ctx.membershipId });
}

// ---- Join requests ------------------------------------------------------------------------------
export async function decideJoin(tx: Tx, ctx: WorkspaceContext, membershipId: string, decision: Decision, reason?: string | null, nextCode?: () => Promise<string>) {
  const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
  if (!m || m.status !== "pending") throw new DecisionError("This join request was already handled.", "CONFLICT");
  if (!can(ctx, "employees.manage", { ownerRole: m.role })) throw new DecisionError("You can't review this request.", "FORBIDDEN");
  if (decision === "approve") {
    await tx
      .update(memberships)
      .set({
        status: "active",
        employeeCode: m.employeeCode ?? (nextCode ? await nextCode() : null),
        joinedAt: m.joinedAt ?? new Date().toISOString().slice(0, 10),
        statusChangedAt: new Date(),
      })
      .where(eq(memberships.id, m.id));
    await notify(tx, ctx.workspaceId, [m.id], { kind: "join.approved", title: `Welcome to ${ctx.workspaceName}! Your access was approved.`, link: "/app" });
    await audit(tx, ctx, "member.approved", "membership", m.id, "Approved a join request");
  } else {
    await tx.update(memberships).set({ status: "rejected", statusChangedAt: new Date() }).where(eq(memberships.id, m.id));
    await audit(tx, ctx, "member.rejected", "membership", m.id, "Rejected a join request", reason ? { reason } : undefined);
  }
  await publish(tx, ctx.workspaceId, "employees");
}

// ---- Leave --------------------------------------------------------------------------------------
/** Workdays between two dates using the workspace's weekend + active holidays. */
export async function workdaysBetween(tx: Tx, workspaceId: string, start: string, end: string) {
  const rows = await tx.execute<{ day: string }>(sql`select day::text as day from fn_workdays(${workspaceId}, ${start}::date, ${end}::date)`);
  return rows.map((r) => r.day);
}

export async function decideLeave(tx: Tx, ctx: WorkspaceContext, id: string, decision: Decision, note?: string | null) {
  const [lr] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id));
  if (!lr) throw new DecisionError("Leave request not found.", "NOT_FOUND");
  if (lr.status !== "pending") throw new DecisionError("This request was already reviewed.", "CONFLICT");
  const m = await member(tx, lr.membershipId);
  ensureCan(ctx, m);
  if (!can(ctx, "leave.review", { ownerMembershipId: m?.id, ownerRole: m?.role })) throw new DecisionError("You can't review this request.", "FORBIDDEN");
  await tx
    .update(leaveRequests)
    .set({ status: decision === "approve" ? "approved" : "rejected", reviewerId: ctx.membershipId, reviewedAt: new Date(), reviewNote: note || null })
    .where(eq(leaveRequests.id, id));

  const range = lr.startDate === lr.endDate ? fmtDate(lr.startDate) : `${fmtDate(lr.startDate)} – ${fmtDate(lr.endDate)}`;
  if (decision === "approve") {
    // Approved leave feeds attendance ("On leave" / "Half-day") and the calendar.
    const days = await workdaysBetween(tx, ctx.workspaceId, lr.startDate, lr.endDate);
    for (const day of days) {
      const [existing] = await tx.select().from(attendance).where(and(eq(attendance.membershipId, lr.membershipId), eq(attendance.date, day)));
      if (lr.kind === "half_day") {
        if (existing) await tx.update(attendance).set({ status: "half_day", approval: "not_required", lateMinutes: 0 }).where(eq(attendance.id, existing.id));
        else await tx.insert(attendance).values({ workspaceId: ctx.workspaceId, membershipId: lr.membershipId, date: day, status: "half_day", source: "leave" });
      } else if (!existing) {
        await tx.insert(attendance).values({ workspaceId: ctx.workspaceId, membershipId: lr.membershipId, date: day, status: "on_leave", source: "leave" });
      } else if (!existing.checkInAt) {
        await tx.update(attendance).set({ status: "on_leave", source: "leave" }).where(eq(attendance.id, existing.id));
      }
      await noteLockedDay(tx, ctx, day, "leave_approved", `${m?.name ?? "Member"}: ${lr.kind === "half_day" ? "half-day" : "leave"} approved after the report locked`, "leave_requests", lr.id);
    }
  }
  if (m)
    await tellRequester(tx, ctx, m, {
      kind: `leave.${decision}d`,
      title: `Your ${lr.kind === "half_day" ? "half-day" : "leave"} request (${range}) was ${decision === "approve" ? "approved" : "rejected"}`,
      body: note || null,
      link: "/app/leave",
    });
  await audit(tx, ctx, `leave.${decision === "approve" ? "approved" : "rejected"}`, "leave_requests", id, `${decision === "approve" ? "Approved" : "Rejected"} ${m?.name ?? "a member"}'s ${lr.kind === "half_day" ? "half-day" : "leave"} request (${range})`);
  await publish(tx, ctx.workspaceId, "leave");
  await publish(tx, ctx.workspaceId, "attendance");
}

// ---- Attendance approvals & corrections ----------------------------------------------------------
export async function decideAttendance(tx: Tx, ctx: WorkspaceContext, id: string, decision: Decision, note?: string | null) {
  const [row] = await tx.select().from(attendance).where(eq(attendance.id, id));
  if (!row || row.approval !== "pending") throw new DecisionError("This check-in was already reviewed.", "CONFLICT");
  const m = await member(tx, row.membershipId);
  ensureCan(ctx, m);
  await tx
    .update(attendance)
    .set({ approval: decision === "approve" ? "approved" : "rejected", reviewedBy: ctx.membershipId, reviewedAt: new Date(), reviewNote: note || null })
    .where(eq(attendance.id, id));
  await noteLockedDay(tx, ctx, row.date, "attendance_review", `${m?.name ?? "Member"}: ${row.status} check-in ${decision}d after the report locked`, "attendance", id);
  if (m)
    await tellRequester(tx, ctx, m, {
      kind: `attendance.${decision}d`,
      title: `Your ${row.status === "late" ? "late" : "remote"} check-in on ${fmtDate(row.date)} was ${decision === "approve" ? "approved" : "rejected"}`,
      body: note || null,
      link: "/app/attendance",
    });
  await audit(tx, ctx, `attendance.${decision === "approve" ? "approved" : "rejected"}`, "attendance", id, `${decision === "approve" ? "Approved" : "Rejected"} ${m?.name}'s ${row.status} check-in on ${row.date}`);
  await publish(tx, ctx.workspaceId, "attendance");
}

export async function decideCorrection(tx: Tx, ctx: WorkspaceContext, id: string, decision: Decision, note?: string | null) {
  const [c] = await tx.select().from(attendanceCorrections).where(eq(attendanceCorrections.id, id));
  if (!c || c.status !== "pending") throw new DecisionError("This correction was already reviewed.", "CONFLICT");
  const m = await member(tx, c.membershipId);
  ensureCan(ctx, m);
  if (decision === "approve") await applyCorrection(tx, ctx, c.id);
  await tx
    .update(attendanceCorrections)
    .set({ status: decision === "approve" ? "approved" : "rejected", reviewerId: ctx.membershipId, reviewedAt: new Date(), reviewNote: note || null })
    .where(eq(attendanceCorrections.id, id));
  await tx.update(exceptionAcks).set({ outcome: "corrected" }).where(and(eq(exceptionAcks.membershipId, c.membershipId), eq(exceptionAcks.date, c.date)));
  if (m)
    await tellRequester(tx, ctx, m, {
      kind: `correction.${decision}d`,
      title: `Your attendance correction for ${fmtDate(c.date)} was ${decision === "approve" ? "approved" : "rejected"}`,
      body: note || null,
      link: "/app/attendance",
    });
  await audit(tx, ctx, `attendance.correction_${decision === "approve" ? "approved" : "rejected"}`, "attendance_corrections", id, `${decision === "approve" ? "Approved" : "Rejected"} ${m?.name}'s attendance correction for ${c.date}`);
  await publish(tx, ctx.workspaceId, "attendance");
}

// ---- Exceptions -----------------------------------------------------------------------------------
export async function decideException(
  tx: Tx,
  ctx: WorkspaceContext,
  kind: "missing_checkout" | "absent" | "overtime" | "anomaly",
  membershipId: string,
  date: string,
  decision: Decision,
  note?: string | null,
) {
  const m = await member(tx, membershipId);
  ensureCan(ctx, m);
  await tx
    .insert(exceptionAcks)
    .values({ workspaceId: ctx.workspaceId, kind, membershipId, date, outcome: decision === "approve" ? "acknowledged" : "flagged", note: note || null, ackedBy: ctx.membershipId })
    .onConflictDoNothing();
  if (decision === "reject" && m) {
    const what = { missing_checkout: "a missing checkout", absent: "an absence without leave", overtime: "overtime", anomaly: "a very short day" }[kind];
    await tellRequester(tx, ctx, m, {
      kind: "exception.flagged",
      title: `Please review your attendance for ${fmtDate(date)}`,
      body: `A manager flagged ${what}. ${kind === "missing_checkout" || kind === "absent" ? "Submit a correction or leave request if needed." : ""} ${note ?? ""}`.trim(),
      link: "/app/attendance",
    });
  }
  await audit(tx, ctx, `exception.${decision === "approve" ? "acknowledged" : "flagged"}`, "attendance", membershipId, `${decision === "approve" ? "Acknowledged" : "Flagged"} ${kind.replace("_", " ")} for ${m?.name} on ${date}`);
  await publish(tx, ctx.workspaceId, "attendance");
}

// ---- Holidays ---------------------------------------------------------------------------------------
export async function decideHoliday(tx: Tx, ctx: WorkspaceContext, id: string, decision: Decision, note?: string | null) {
  if (ctx.role !== "owner") throw new DecisionError("Only the owner decides holiday proposals.", "FORBIDDEN");
  const [h] = await tx.select().from(holidays).where(eq(holidays.id, id));
  if (!h) throw new DecisionError("Holiday not found.", "NOT_FOUND");
  const requester = h.removalRequestedBy ?? h.proposedBy;
  if (h.status === "proposed") {
    await tx.update(holidays).set({ status: decision === "approve" ? "active" : "rejected", approvedBy: ctx.membershipId }).where(eq(holidays.id, id));
  } else if (h.status === "active" && h.removalRequestedBy) {
    if (decision === "approve") await tx.delete(holidays).where(eq(holidays.id, id));
    else await tx.update(holidays).set({ removalRequestedBy: null }).where(eq(holidays.id, id));
  } else throw new DecisionError("This proposal was already handled.", "CONFLICT");
  const removal = h.status === "active";
  if (requester)
    await notify(tx, ctx.workspaceId, [requester], {
      kind: "holiday.decided",
      title: `${removal ? "Removal of" : "Holiday"} "${h.name}" on ${fmtDate(h.date)} was ${decision === "approve" ? "approved" : "rejected"}`,
      body: note || null,
      link: "/app/calendar?tab=holidays",
    });
  await audit(tx, ctx, `holiday.${removal ? "removal_" : ""}${decision === "approve" ? "approved" : "rejected"}`, "holidays", id, `${decision === "approve" ? "Approved" : "Rejected"} ${removal ? "removal of" : "holiday"} "${h.name}" (${h.date})`);
  await publish(tx, ctx.workspaceId, "calendar");
}

// ---- Complaints (inbox triage) ----------------------------------------------------------------------
export async function triageComplaint(tx: Tx, ctx: WorkspaceContext, id: string, decision: Decision, note?: string | null) {
  if (!can(ctx, "complaints.process")) throw new DecisionError("You can't process issues.", "FORBIDDEN");
  const [c] = await tx.select().from(complaints).where(eq(complaints.id, id));
  if (!c || c.status !== "new") throw new DecisionError("This issue was already picked up.", "CONFLICT");
  if (c.submitterId === ctx.membershipId) throw new DecisionError("You can't review your own issue.", "FORBIDDEN");
  const to = decision === "approve" ? ("reviewing" as const) : ("resolved" as const);
  await tx
    .update(complaints)
    .set({
      status: to,
      assigneeId: c.assigneeId ?? ctx.membershipId,
      resolutionMessage: decision === "reject" ? note || "Closed after review. No further action needed." : c.resolutionMessage,
    })
    .where(eq(complaints.id, id));
  await tx.insert(complaintEvents).values({ workspaceId: ctx.workspaceId, complaintId: id, actorId: ctx.membershipId, kind: "status_change", fromStatus: "new", toStatus: to, body: note || null });
  if (c.submitterId)
    await notify(tx, ctx.workspaceId, [c.submitterId], {
      kind: "complaint.status",
      title: decision === "approve" ? `Your issue "${c.subject}" is being reviewed` : `Your issue "${c.subject}" was closed`,
      body: decision === "reject" ? note || null : null,
      link: `/app/complaints?id=${id}`,
    });
  await audit(tx, ctx, `complaint.${to}`, "complaints", id, `Moved issue "${c.subject}" to ${to}`);
  await publish(tx, ctx.workspaceId, "complaints");
}
