import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users, workspaces } from "@/db/schema";
import type { WorkspaceContext } from "./auth-types";

export interface MembershipSummary {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceContext["role"];
  status: WorkspaceContext["status"];
}

/** All workspaces this user belongs to (for the switcher and post-login routing). */
export async function listMemberships(userId: string): Promise<MembershipSummary[]> {
  return db
    .select({
      workspaceId: memberships.workspaceId,
      workspaceName: workspaces.name,
      role: memberships.role,
      status: memberships.status,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));
}

/**
 * Resolves the active workspace + membership. Prefers users.active_workspace_id, falls back to the
 * first active membership, then to any (pending) membership.
 */
export async function resolveContext(userId: string, activeWorkspaceId: string | null): Promise<WorkspaceContext | null> {
  const rows = await db
    .select({
      m: memberships,
      w: {
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        timezone: workspaces.timezone,
        locale: workspaces.locale,
        onboardedAt: workspaces.onboardedAt,
      },
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));
  if (!rows.length) return null;
  const pickRow =
    rows.find((r) => r.w.id === activeWorkspaceId && r.m.status !== "rejected" && r.m.status !== "deactivated") ??
    rows.find((r) => r.m.status === "active") ??
    rows.find((r) => r.m.status === "pending") ??
    rows[0]!;
  if (pickRow.w.id !== activeWorkspaceId) {
    await db.update(users).set({ activeWorkspaceId: pickRow.w.id }).where(eq(users.id, userId));
  }
  return {
    userId,
    workspaceId: pickRow.w.id,
    workspaceName: pickRow.w.name,
    workspaceSlug: pickRow.w.slug,
    timezone: pickRow.w.timezone,
    membershipId: pickRow.m.id,
    role: pickRow.m.role,
    status: pickRow.m.status,
    employeeCode: pickRow.m.employeeCode,
    departmentId: pickRow.m.departmentId,
    onboarded: !!pickRow.w.onboardedAt,
    locale: pickRow.w.locale,
  };
}

export async function switchWorkspace(userId: string, workspaceId: string) {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId), eq(memberships.status, "active")));
  if (!m) return false;
  await db.update(users).set({ activeWorkspaceId: workspaceId }).where(eq(users.id, userId));
  return true;
}
