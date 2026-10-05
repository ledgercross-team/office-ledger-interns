import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { and, eq, isNull } from "drizzle-orm";
import { announcementReads, announcements, notifications, pushSubscriptions } from "@/db/schema";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { membersWithRoles, notify, publish } from "@/lib/notifications";
import { listAnnouncements, listNotifications, search, shellCounts } from "@/lib/queries/shell";
import { requireCtx, requireUser, scoped, notFound } from "./_helpers";

export const shell = {
  counts: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, (tx) => shellCounts(tx, ctx));
    },
  }),
  search: defineAction({
    input: z.object({ q: z.string().trim().min(1).max(80) }),
    handler: async ({ q }, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, (tx) => search(tx, ctx, q));
    },
  }),
};

export const notificationsActions = {
  list: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, (tx) => listNotifications(tx, ctx));
    },
  }),
  markRead: defineAction({
    input: z.object({ id: z.string().uuid().optional() }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context);
      await scoped(ctx, (tx) =>
        tx
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notifications.membershipId, ctx.membershipId),
              isNull(notifications.readAt),
              id ? eq(notifications.id, id) : undefined,
            ),
          ),
      );
      return { ok: true };
    },
  }),
  /** Store a Web Push subscription for this browser. */
  subscribePush: defineAction({
    input: z.object({ endpoint: z.string().url().max(1000), p256dh: z.string().max(200), auth: z.string().max(100) }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await db
        .insert(pushSubscriptions)
        .values({ userId: user.id, ...input })
        .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: input.p256dh, auth: input.auth } });
      return { ok: true };
    },
  }),
  unsubscribePush: defineAction({
    input: z.object({ endpoint: z.string().url().max(1000) }),
    handler: async ({ endpoint }, context) => {
      const user = requireUser(context);
      await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
      return { ok: true };
    },
  }),
};

export const announcementsActions = {
  list: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, (tx) => listAnnouncements(tx, ctx));
    },
  }),
  markRead: defineAction({
    input: z.object({ ids: z.array(z.string().uuid()).max(100) }),
    handler: async ({ ids }, context) => {
      const ctx = requireCtx(context);
      if (!ids.length) return { ok: true };
      await scoped(ctx, (tx) =>
        tx
          .insert(announcementReads)
          .values(ids.map((announcementId) => ({ workspaceId: ctx.workspaceId, announcementId, membershipId: ctx.membershipId })))
          .onConflictDoNothing(),
      );
      return { ok: true };
    },
  }),
  create: defineAction({
    input: z.object({
      title: z.string().trim().min(2).max(140),
      body: z.string().trim().min(1).max(8000),
      pinned: z.boolean().default(false),
      expiresAt: z.coerce.date().nullable().optional(),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "announcements.post");
      return scoped(ctx, async (tx) => {
        const [row] = await tx
          .insert(announcements)
          .values({ workspaceId: ctx.workspaceId, authorId: ctx.membershipId, ...input, expiresAt: input.expiresAt ?? null })
          .returning();
        await audit(tx, ctx, "announcement.created", "announcement", row!.id, `Posted announcement "${input.title}"`);
        const everyone = await membersWithRoles(tx, ctx.workspaceId, ["owner", "manager", "employee"]);
        await notify(tx, ctx.workspaceId, everyone.filter((m) => m !== ctx.membershipId), {
          kind: "announcement",
          title: `New announcement: ${input.title}`,
          link: "/app?announcements=1",
        });
        await publish(tx, ctx.workspaceId, "announcements");
        return { id: row!.id };
      });
    },
  }),
  update: defineAction({
    input: z.object({ id: z.string().uuid(), pinned: z.boolean().optional(), expiresAt: z.coerce.date().nullable().optional() }),
    handler: async ({ id, ...patch }, context) => {
      const ctx = requireCtx(context, "announcements.post");
      await scoped(ctx, async (tx) => {
        const res = await tx.update(announcements).set(patch).where(eq(announcements.id, id)).returning({ id: announcements.id });
        if (!res.length) throw notFound("Announcement");
        await audit(tx, ctx, "announcement.updated", "announcement", id, "Updated an announcement", patch);
        await publish(tx, ctx.workspaceId, "announcements");
      });
      return { ok: true };
    },
  }),
  remove: defineAction({
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context, "announcements.post");
      await scoped(ctx, async (tx) => {
        const res = await tx.delete(announcements).where(eq(announcements.id, id)).returning({ title: announcements.title });
        if (!res.length) throw notFound("Announcement");
        await audit(tx, ctx, "announcement.deleted", "announcement", id, `Deleted announcement "${res[0]!.title}"`);
        await publish(tx, ctx.workspaceId, "announcements");
      });
      return { ok: true };
    },
  }),
};
