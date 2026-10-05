import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { departments, files, memberships, taskAssignees, taskChecklistItems, taskComments, tasks, users } from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { can } from "@/lib/permissions";
import { localDate } from "@/lib/dates";
import { renderMarkdown } from "@/lib/markdown";
import { signedFileUrl } from "@/lib/files";

export async function boardMembers(tx: Tx) {
  return tx
    .select({ id: memberships.id, name: users.name, image: users.image, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.status, "active"))
    .orderBy(asc(users.name));
}

export async function listTasks(tx: Tx, ctx: WorkspaceContext, archived: boolean) {
  const rows = await tx
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      labels: tasks.labels,
      departmentId: tasks.departmentId,
      department: departments.name,
      position: tasks.position,
      createdBy: tasks.createdBy,
      archivedAt: tasks.archivedAt,
      completedAt: tasks.completedAt,
      updatedAt: tasks.updatedAt,
      checklistTotal: sql<number>`(select count(*)::int from task_checklist_items c where c.task_id = ${tasks.id})`,
      checklistDone: sql<number>`(select count(*)::int from task_checklist_items c where c.task_id = ${tasks.id} and c.done)`,
      comments: sql<number>`(select count(*)::int from task_comments c where c.task_id = ${tasks.id})`,
      attachments: sql<number>`(select count(*)::int from files f where f.entity_type = 'task' and f.entity_id = ${tasks.id})`,
    })
    .from(tasks)
    .leftJoin(departments, eq(departments.id, tasks.departmentId))
    .where(archived ? isNotNull(tasks.archivedAt) : isNull(tasks.archivedAt))
    .orderBy(asc(tasks.position), desc(tasks.createdAt))
    .limit(archived ? 300 : 1000);
  const ids = rows.map((r) => r.id);
  const assignees = ids.length
    ? await tx
        .select({ taskId: taskAssignees.taskId, id: memberships.id, name: users.name, image: users.image })
        .from(taskAssignees)
        .innerJoin(memberships, eq(memberships.id, taskAssignees.membershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(inArray(taskAssignees.taskId, ids))
    : [];
  return rows.map((r) => {
    const a = assignees.filter((x) => x.taskId === r.id).map(({ id, name, image }) => ({ id, name, image }));
    return { ...r, assignees: a, canEdit: can(ctx, "tasks.update", { assigneeIds: a.map((x) => x.id), createdBy: r.createdBy }) };
  });
}
export type TaskCard = Awaited<ReturnType<typeof listTasks>>[number];

export async function taskBoard(tx: Tx, ctx: WorkspaceContext, archived = false) {
  const [items, members, deps] = await Promise.all([
    listTasks(tx, ctx, archived),
    boardMembers(tx),
    tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name)),
  ]);
  return { today: localDate(ctx.timezone), tasks: items, members, departments: deps, me: ctx.membershipId, canManage: can(ctx, "tasks.manage") };
}
export type TaskBoardData = Awaited<ReturnType<typeof taskBoard>>;

export async function taskDetail(tx: Tx, ctx: WorkspaceContext, id: string) {
  const [t] = await tx.select().from(tasks).where(eq(tasks.id, id));
  if (!t) return null;
  const [checklist, comments, attachments, assignees] = await Promise.all([
    tx.select().from(taskChecklistItems).where(eq(taskChecklistItems.taskId, id)).orderBy(asc(taskChecklistItems.position), asc(taskChecklistItems.createdAt)),
    tx
      .select({ id: taskComments.id, body: taskComments.body, createdAt: taskComments.createdAt, authorId: taskComments.authorId, author: users.name, image: users.image })
      .from(taskComments)
      .leftJoin(memberships, eq(memberships.id, taskComments.authorId))
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(eq(taskComments.taskId, id))
      .orderBy(asc(taskComments.createdAt)),
    tx.select({ id: files.id, filename: files.filename, size: files.size }).from(files).where(and(eq(files.entityType, "task"), eq(files.entityId, id))),
    tx.select({ id: taskAssignees.membershipId }).from(taskAssignees).where(eq(taskAssignees.taskId, id)),
  ]);
  const assigneeIds = assignees.map((a) => a.id);
  return {
    ...t,
    descriptionHtml: renderMarkdown(t.description),
    assigneeIds,
    checklist,
    comments: comments.map((c) => ({ ...c, html: renderMarkdown(c.body) })),
    attachments: attachments.map((a) => ({ ...a, url: signedFileUrl(a.id, 600) })),
    canEdit: can(ctx, "tasks.update", { assigneeIds, createdBy: t.createdBy }),
    canManage: can(ctx, "tasks.manage"),
  };
}
export type TaskDetail = NonNullable<Awaited<ReturnType<typeof taskDetail>>>;
