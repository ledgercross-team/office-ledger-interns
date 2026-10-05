import { and, desc, eq, gt, ilike, isNull, or, sql, inArray } from "drizzle-orm";
import type { Tx } from "@/db";
import { announcementReads, announcements, memberships, notifications, tasks, users } from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { can } from "@/lib/permissions";
import { renderMarkdown } from "@/lib/markdown";
import { inboxScope } from "./inbox-scope";

export async function inboxOpenCount(tx: Tx, ctx: WorkspaceContext) {
  if (!can(ctx, "inbox.view")) return 0;
  const rows = await tx.execute<{ n: number }>(
    sql`select count(*)::int as n from v_inbox_items i where i.workspace_id = ${ctx.workspaceId} and ${inboxScope(ctx)}`,
  );
  return rows[0]?.n ?? 0;
}

export async function shellCounts(tx: Tx, ctx: WorkspaceContext) {
  const [inbox, unread, ann] = await Promise.all([
    inboxOpenCount(tx, ctx),
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.membershipId, ctx.membershipId), isNull(notifications.readAt))),
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(announcements)
      .leftJoin(
        announcementReads,
        and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.membershipId, ctx.membershipId)),
      )
      .where(
        and(
          isNull(announcementReads.announcementId),
          or(isNull(announcements.expiresAt), gt(announcements.expiresAt, sql`now()`)),
        ),
      ),
  ]);
  return { inbox, notifications: unread[0]?.n ?? 0, announcements: ann[0]?.n ?? 0 };
}

export async function listNotifications(tx: Tx, ctx: WorkspaceContext) {
  return tx
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.membershipId, ctx.membershipId))
    .orderBy(desc(notifications.createdAt))
    .limit(60);
}

export async function listAnnouncements(tx: Tx, ctx: WorkspaceContext) {
  const rows = await tx
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      pinned: announcements.pinned,
      expiresAt: announcements.expiresAt,
      createdAt: announcements.createdAt,
      authorName: users.name,
      read: sql<boolean>`${announcementReads.announcementId} is not null`,
    })
    .from(announcements)
    .leftJoin(memberships, eq(memberships.id, announcements.authorId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .leftJoin(
      announcementReads,
      and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.membershipId, ctx.membershipId)),
    )
    .where(or(isNull(announcements.expiresAt), gt(announcements.expiresAt, sql`now()`)))
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, html: renderMarkdown(r.body) }));
}

export interface SearchHit {
  type: "employee" | "task";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function search(tx: Tx, ctx: WorkspaceContext, q: string): Promise<SearchHit[]> {
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const hits: SearchHit[] = [];
  if (can(ctx, "employees.view")) {
    const people = await tx
      .select({ id: memberships.id, name: users.name, email: users.email, code: memberships.employeeCode })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          inArray(memberships.status, ["active", "pending"]),
          or(ilike(users.name, like), ilike(users.email, like), ilike(memberships.employeeCode, like)),
        ),
      )
      .limit(8);
    hits.push(
      ...people.map((p) => ({
        type: "employee" as const,
        id: p.id,
        title: p.name,
        subtitle: [p.code, p.email].filter(Boolean).join(" · "),
        href: `/app/employees/${p.id}`,
      })),
    );
  }
  const taskRows = await tx
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), ilike(tasks.title, like)))
    .limit(8);
  hits.push(
    ...taskRows.map((t) => ({
      type: "task" as const,
      id: t.id,
      title: t.title,
      subtitle: t.status.replace("_", " "),
      href: `/app/tasks?task=${t.id}`,
    })),
  );
  return hits;
}
