import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Tx } from "@/db";
import { departments, leaveRequests, leaveTypes, memberships, users } from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { can } from "@/lib/permissions";
import { localDate } from "@/lib/dates";
import { leaveBalancesFor } from "@/lib/services/leave-balance";

const reviewer = alias(memberships, "rev");
const reviewerUser = alias(users, "rev_user");

export async function listLeave(tx: Tx, ctx: WorkspaceContext, scope: "all" | "mine") {
  const rows = await tx
    .select({
      id: leaveRequests.id,
      membershipId: leaveRequests.membershipId,
      name: users.name,
      image: users.image,
      employeeCode: memberships.employeeCode,
      role: memberships.role,
      department: departments.name,
      departmentId: memberships.departmentId,
      kind: leaveRequests.kind,
      half: leaveRequests.half,
      type: leaveTypes.name,
      typeColor: leaveTypes.color,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      reviewNote: leaveRequests.reviewNote,
      reviewedAt: leaveRequests.reviewedAt,
      reviewerName: reviewerUser.name,
      attachmentFileId: leaveRequests.attachmentFileId,
      createdAt: leaveRequests.createdAt,
      // other people in the same department off (approved or pending) on overlapping days
      overlap: sql<number>`(select count(distinct o.membership_id)::int from leave_requests o join memberships om on om.id = o.membership_id
        where o.workspace_id = ${leaveRequests.workspaceId} and o.membership_id <> ${leaveRequests.membershipId}
          and o.status in ('approved','pending') and om.department_id is not distinct from ${memberships.departmentId}
          and o.start_date <= ${leaveRequests.endDate} and o.end_date >= ${leaveRequests.startDate})`,
      deptSize: sql<number>`(select count(*)::int from memberships dm where dm.workspace_id = ${leaveRequests.workspaceId} and dm.status = 'active' and dm.department_id is not distinct from ${memberships.departmentId})`,
    })
    .from(leaveRequests)
    .innerJoin(memberships, eq(memberships.id, leaveRequests.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(departments, eq(departments.id, memberships.departmentId))
    .leftJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .leftJoin(reviewer, eq(reviewer.id, leaveRequests.reviewerId))
    .leftJoin(reviewerUser, eq(reviewerUser.id, reviewer.userId))
    .where(scope === "mine" ? eq(leaveRequests.membershipId, ctx.membershipId) : ne(leaveRequests.membershipId, ctx.membershipId))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(500);
  return rows.map((r) => ({
    ...r,
    canReview: r.status === "pending" && can(ctx, "leave.review", { ownerMembershipId: r.membershipId, ownerRole: r.role }),
  }));
}
export type LeaveRow = Awaited<ReturnType<typeof listLeave>>[number];

export async function leavePage(tx: Tx, ctx: WorkspaceContext) {
  const reviewer = can(ctx, "leave.review");
  const today = localDate(ctx.timezone);
  const types = await tx
    .select({ id: leaveTypes.id, name: leaveTypes.name, code: leaveTypes.code, paid: leaveTypes.paid })
    .from(leaveTypes)
    .where(eq(leaveTypes.active, true))
    .orderBy(asc(leaveTypes.name));
  if (reviewer) {
    const requests = await listLeave(tx, ctx, "all");
    return { mode: "reviewer" as const, today, timezone: ctx.timezone, requests, types, balances: [], mine: [] };
  }
  const mine = await listLeave(tx, ctx, "mine");
  const balances = (await leaveBalancesFor(tx, [ctx.membershipId], Number(today.slice(0, 4)))).get(ctx.membershipId) ?? [];
  return { mode: "employee" as const, today, timezone: ctx.timezone, requests: [], types, balances, mine };
}
export type LeavePageData = Awaited<ReturnType<typeof leavePage>>;

/** Approved leave per day for a date range (calendar "Approved leave" tab and "Who's out"). */
export async function approvedLeaveBetween(tx: Tx, start: string, end: string) {
  return tx
    .select({
      id: leaveRequests.id,
      membershipId: leaveRequests.membershipId,
      name: users.name,
      image: users.image,
      department: departments.name,
      kind: leaveRequests.kind,
      half: leaveRequests.half,
      type: leaveTypes.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .innerJoin(memberships, eq(memberships.id, leaveRequests.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(departments, eq(departments.id, memberships.departmentId))
    .leftJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(and(eq(leaveRequests.status, "approved"), lte(leaveRequests.startDate, end), gte(leaveRequests.endDate, start)))
    .orderBy(asc(leaveRequests.startDate));
}

export async function pendingLeaveFor(tx: Tx, ids: string[]) {
  if (!ids.length) return [];
  return tx.select().from(leaveRequests).where(and(inArray(leaveRequests.id, ids), eq(leaveRequests.status, "pending")));
}
