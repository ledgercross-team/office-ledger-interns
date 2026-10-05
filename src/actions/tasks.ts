import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { memberships, taskAssignees, taskChecklistItems, taskComments, tasks, users } from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { audit } from "@/lib/audit";
import { notify, publish } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { taskBoard, taskDetail } from "@/lib/queries/tasks";
import { notFound, requireCtx, scoped } from "./_helpers";

const status = z.enum(["todo", "in_progress", "blocked", "done"]);
const priority = z.enum(["low", "medium", "high", "urgent"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function loadEditable(tx: Tx, ctx: WorkspaceContext, id: string) {
  const [t] = await tx.select().from(tasks).where(eq(tasks.id, id));
  if (!t) throw notFound("Task");
  const assigneeIds = (
    await tx
      .select({ id: taskAssignees.membershipId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, id))
  ).map((a) => a.id);
  if (!can(ctx, "tasks.update", { assigneeIds, createdBy: t.createdBy }))
    throw new ActionError({
      code: "FORBIDDEN",
      message: "You can only update tasks assigned to you or created by you.",
    });
  return { task: t, assigneeIds };
}

/** Members can only assign themselves; managers/owners can assign anyone active. */
async function cleanAssignees(tx: Tx, ctx: WorkspaceContext, ids: string[]) {
  if (!can(ctx, "tasks.manage")) return [ctx.membershipId];
  if (!ids.length) return [];
  const valid = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(inArray(memberships.id, ids), eq(memberships.status, "active")));
  return valid.map((v) => v.id);
}

/** @mentions: "@First" or "@[Full Name]" matched case-insensitively against active members. */
async function mentioned(tx: Tx, body: string) {
  const tokens = [...body.matchAll(/@\[([^\]]{2,80})\]|@([\p{L}][\p{L}'-]{1,40})/gu)].map((m) =>
    (m[1] ?? m[2] ?? "").toLowerCase(),
  );
  if (!tokens.length) return [];
  const people = await tx
    .select({ id: memberships.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.status, "active"));
  return people
    .filter((p) => tokens.some((t) => p.name.toLowerCase() === t || p.name.toLowerCase().split(" ")[0] === t))
    .map((p) => p.id);
}

export const tasksActions = {
  board: defineAction({
    input: z.object({ archived: z.boolean().default(false) }),
    handler: async ({ archived }, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, (tx) => taskBoard(tx, ctx, archived));
    },
  }),

  detail: defineAction({
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context);
      const t = await scoped(ctx, (tx) => taskDetail(tx, ctx, id));
      if (!t) throw notFound("Task");
      return t;
    },
  }),

  create: defineAction({
    input: z.object({
      title: z.string().trim().min(2).max(200),
      description: z.string().max(10000).default(""),
      status: status.default("todo"),
      priority: priority.default("medium"),
      dueDate: date.nullable().optional(),
      labels: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
      departmentId: z.uuid().nullable().optional(),
      assigneeIds: z.array(z.uuid()).max(20).default([]),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "tasks.create");
      return scoped(ctx, async (tx) => {
        const [{ top } = { top: 0 }] = await tx
          .select({ top: max(tasks.position) })
          .from(tasks)
          .where(eq(tasks.status, input.status));
        const assignees = await cleanAssignees(tx, ctx, input.assigneeIds);
        const [row] = await tx
          .insert(tasks)
          .values({
            workspaceId: ctx.workspaceId,
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            dueDate: input.dueDate ?? null,
            labels: [...new Set(input.labels.map((l) => l.toLowerCase()))],
            departmentId: input.departmentId ?? null,
            position: (Number(top) || 0) + 1,
            createdBy: ctx.membershipId,
            completedAt: input.status === "done" ? new Date() : null,
          })
          .returning();
        if (assignees.length)
          await tx
            .insert(taskAssignees)
            .values(
              assignees.map((membershipId) => ({
                workspaceId: ctx.workspaceId,
                taskId: row!.id,
                membershipId,
              })),
            );
        await notify(
          tx,
          ctx.workspaceId,
          assignees.filter((a) => a !== ctx.membershipId),
          {
            kind: "task.assigned",
            title: `${context.locals.user!.name} assigned you "${input.title}"`,
            link: `/app/tasks?task=${row!.id}`,
          },
        );
        await publish(tx, ctx.workspaceId, "tasks");
        return { id: row!.id };
      });
    },
  }),

  update: defineAction({
    input: z.object({
      id: z.uuid(),
      title: z.string().trim().min(2).max(200).optional(),
      description: z.string().max(10000).optional(),
      priority: priority.optional(),
      dueDate: date.nullable().optional(),
      labels: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
      departmentId: z.uuid().nullable().optional(),
      assigneeIds: z.array(z.uuid()).max(20).optional(),
    }),
    handler: async ({ id, assigneeIds, ...patch }, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, async (tx) => {
        const { task, assigneeIds: before } = await loadEditable(tx, ctx, id);
        if (Object.keys(patch).length)
          await tx
            .update(tasks)
            .set({
              ...patch,
              labels: patch.labels?.map((l) => l.toLowerCase()),
              dueReminderSentAt: patch.dueDate !== undefined ? null : undefined,
            })
            .where(eq(tasks.id, id));
        if (assigneeIds && can(ctx, "tasks.manage")) {
          const next = await cleanAssignees(tx, ctx, assigneeIds);
          await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
          if (next.length)
            await tx
              .insert(taskAssignees)
              .values(
                next.map((membershipId) => ({ workspaceId: ctx.workspaceId, taskId: id, membershipId })),
              );
          const added = next.filter((n) => !before.includes(n) && n !== ctx.membershipId);
          await notify(tx, ctx.workspaceId, added, {
            kind: "task.assigned",
            title: `${context.locals.user!.name} assigned you "${patch.title ?? task.title}"`,
            link: `/app/tasks?task=${id}`,
          });
        }
        await publish(tx, ctx.workspaceId, "tasks");
        return { ok: true };
      });
    },
  }),

  /** Drag and drop: new column + position (between neighbours). */
  move: defineAction({
    input: z.object({ id: z.uuid(), status, position: z.number().finite() }),
    handler: async ({ id, status: to, position }, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, async (tx) => {
        const { task, assigneeIds } = await loadEditable(tx, ctx, id);
        await tx
          .update(tasks)
          .set({ status: to, position, completedAt: to === "done" ? (task.completedAt ?? new Date()) : null })
          .where(eq(tasks.id, id));
        if (to !== task.status && (to === "blocked" || to === "done")) {
          const watchers = [...assigneeIds, task.createdBy].filter(
            (x): x is string => !!x && x !== ctx.membershipId,
          );
          await notify(tx, ctx.workspaceId, watchers, {
            kind: `task.${to}`,
            title: `"${task.title}" moved to ${to === "done" ? "Done" : "Blocked"} by ${context.locals.user!.name}`,
            link: `/app/tasks?task=${id}`,
          });
        }
        await publish(tx, ctx.workspaceId, "tasks");
        return { ok: true };
      });
    },
  }),

  archive: defineAction({
    input: z.object({ id: z.uuid(), archived: z.boolean() }),
    handler: async ({ id, archived }, context) => {
      const ctx = requireCtx(context, "tasks.manage");
      return scoped(ctx, async (tx) => {
        const [row] = await tx
          .update(tasks)
          .set({ archivedAt: archived ? new Date() : null })
          .where(eq(tasks.id, id))
          .returning({ title: tasks.title });
        if (!row) throw notFound("Task");
        await audit(
          tx,
          ctx,
          archived ? "task.archived" : "task.restored",
          "tasks",
          id,
          `${archived ? "Archived" : "Restored"} task "${row.title}"`,
        );
        await publish(tx, ctx.workspaceId, "tasks");
        return { ok: true };
      });
    },
  }),

  checklist: defineAction({
    input: z.discriminatedUnion("op", [
      z.object({ op: z.literal("add"), taskId: z.uuid(), text: z.string().trim().min(1).max(200) }),
      z.object({ op: z.literal("toggle"), taskId: z.uuid(), itemId: z.uuid(), done: z.boolean() }),
      z.object({ op: z.literal("remove"), taskId: z.uuid(), itemId: z.uuid() }),
    ]),
    handler: async (input, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, async (tx) => {
        await loadEditable(tx, ctx, input.taskId);
        if (input.op === "add") {
          const [{ top } = { top: 0 }] = await tx
            .select({ top: max(taskChecklistItems.position) })
            .from(taskChecklistItems)
            .where(eq(taskChecklistItems.taskId, input.taskId));
          await tx
            .insert(taskChecklistItems)
            .values({
              workspaceId: ctx.workspaceId,
              taskId: input.taskId,
              text: input.text,
              position: (Number(top) || 0) + 1,
            });
        } else if (input.op === "toggle") {
          await tx
            .update(taskChecklistItems)
            .set({ done: input.done })
            .where(and(eq(taskChecklistItems.id, input.itemId), eq(taskChecklistItems.taskId, input.taskId)));
        } else {
          await tx
            .delete(taskChecklistItems)
            .where(and(eq(taskChecklistItems.id, input.itemId), eq(taskChecklistItems.taskId, input.taskId)));
        }
        await publish(tx, ctx.workspaceId, "tasks");
        return { ok: true };
      });
    },
  }),

  comment: defineAction({
    input: z.object({ taskId: z.uuid(), body: z.string().trim().min(1).max(4000) }),
    handler: async ({ taskId, body }, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, async (tx) => {
        const [t] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
        if (!t) throw notFound("Task");
        await tx
          .insert(taskComments)
          .values({ workspaceId: ctx.workspaceId, taskId, authorId: ctx.membershipId, body });
        const mentions = (await mentioned(tx, body)).filter((m) => m !== ctx.membershipId);
        await notify(tx, ctx.workspaceId, mentions, {
          kind: "task.mention",
          title: `${context.locals.user!.name} mentioned you on "${t.title}"`,
          body: body.slice(0, 200),
          link: `/app/tasks?task=${taskId}`,
        });
        const assignees = (
          await tx
            .select({ id: taskAssignees.membershipId })
            .from(taskAssignees)
            .where(eq(taskAssignees.taskId, taskId))
        ).map((a) => a.id);
        await notify(
          tx,
          ctx.workspaceId,
          assignees.filter((a) => a !== ctx.membershipId && !mentions.includes(a)),
          {
            kind: "task.comment",
            title: `New comment on "${t.title}"`,
            body: body.slice(0, 200),
            link: `/app/tasks?task=${taskId}`,
          },
        );
        await tx
          .update(tasks)
          .set({ updatedAt: sql`now()` })
          .where(eq(tasks.id, taskId));
        await publish(tx, ctx.workspaceId, "tasks");
        return { ok: true, mentions: mentions.length };
      });
    },
  }),
};
