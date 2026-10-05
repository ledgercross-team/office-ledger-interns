import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { leaveBalances, leaveRequests, leaveTypes } from "@/db/schema";

export interface LeaveBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  color: string;
  paid: boolean;
  quota: number;
  accrued: number;
  carriedOver: number;
  used: number;
  pending: number;
  remaining: number;
}

const roundHalf = (n: number) => Math.round(n * 2) / 2;

/**
 * Balances for one member and calendar year. Monthly accrual earns quota/12 per started month
 * (rounded to half days); a leave_balances row can override the allotment and add carry-over.
 */
export async function leaveBalancesFor(tx: Tx, membershipIds: string[], year: number, today = new Date()) {
  if (!membershipIds.length) return new Map<string, LeaveBalance[]>();
  const types = await tx.select().from(leaveTypes).where(eq(leaveTypes.active, true)).orderBy(leaveTypes.name);
  const overrides = await tx
    .select()
    .from(leaveBalances)
    .where(and(inArray(leaveBalances.membershipId, membershipIds), eq(leaveBalances.year, year)));
  const usage = await tx
    .select({
      membershipId: leaveRequests.membershipId,
      leaveTypeId: leaveRequests.leaveTypeId,
      status: leaveRequests.status,
      days: sql<number>`sum(${leaveRequests.days})::float`,
    })
    .from(leaveRequests)
    .where(
      and(
        inArray(leaveRequests.membershipId, membershipIds),
        inArray(leaveRequests.status, ["approved", "pending"]),
        gte(leaveRequests.startDate, `${year}-01-01`),
        lte(leaveRequests.startDate, `${year}-12-31`),
      ),
    )
    .groupBy(leaveRequests.membershipId, leaveRequests.leaveTypeId, leaveRequests.status);

  const monthsElapsed = year < today.getFullYear() ? 12 : year > today.getFullYear() ? 0 : today.getMonth() + 1;
  const out = new Map<string, LeaveBalance[]>();
  for (const m of membershipIds) {
    out.set(
      m,
      types.map((t) => {
        const o = overrides.find((x) => x.membershipId === m && x.leaveTypeId === t.id);
        const quota = o?.allotted ?? t.yearlyQuota;
        const accrued = t.accrual === "monthly" ? roundHalf((quota * monthsElapsed) / 12) : quota;
        const carriedOver = o?.carriedOver ?? 0;
        const used = usage.find((u) => u.membershipId === m && u.leaveTypeId === t.id && u.status === "approved")?.days ?? 0;
        const pending = usage.find((u) => u.membershipId === m && u.leaveTypeId === t.id && u.status === "pending")?.days ?? 0;
        return {
          leaveTypeId: t.id,
          code: t.code,
          name: t.name,
          color: t.color,
          paid: t.paid,
          quota,
          accrued,
          carriedOver,
          used,
          pending,
          remaining: t.paid ? Math.max(0, accrued + carriedOver - used) : 0,
        };
      }),
    );
  }
  return out;
}
