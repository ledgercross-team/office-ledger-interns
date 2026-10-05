import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { and, eq, sql } from "drizzle-orm";
import { db, withWorkspace } from "@/db";
import {
  departments,
  designations,
  invites,
  leaveTypes,
  memberships,
  users,
  workspaceSettings,
  workspaces,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { switchWorkspace } from "@/lib/context";
import { inviteCode, slugify, token } from "@/lib/ids";
import { membersWithRoles, notify } from "@/lib/notifications";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { mailHtml, sendMail } from "@/lib/mailer";
import { env } from "@/lib/env";
import { requireCtx, requireUser, scoped } from "./_helpers";

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM");
const DEFAULT_LEAVE_TYPES = [
  { code: "casual", name: "Casual", yearlyQuota: 10, accrual: "monthly" as const, color: "info" },
  { code: "sick", name: "Sick", yearlyQuota: 14, accrual: "yearly" as const, color: "danger" },
  { code: "annual", name: "Annual", yearlyQuota: 18, accrual: "monthly" as const, color: "success" },
  {
    code: "unpaid",
    name: "Unpaid",
    yearlyQuota: 0,
    accrual: "yearly" as const,
    color: "warning",
    paid: false,
  },
];

export const workspace = {
  /** Employee enters an invite code → pending membership awaiting approval. */
  join: defineAction({
    input: z.object({ code: z.string().trim().min(4).max(32) }),
    handler: async ({ code }, context) => {
      const user = requireUser(context);
      const rl = await rateLimit("join", `${user.id}:${clientIp(context.request)}`);
      if (!rl.ok)
        throw new ActionError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts. Try again in a few minutes.",
        });
      const [ws] = await db
        .select()
        .from(workspaces)
        .where(eq(sql`upper(${workspaces.inviteCode})`, code.toUpperCase()));
      if (!ws || (ws.inviteCodeExpiresAt && ws.inviteCodeExpiresAt < new Date()))
        throw new ActionError({ code: "NOT_FOUND", message: "That invite code is invalid or has expired." });
      const [existing] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, user.id)));
      if (existing?.status === "active") {
        await switchWorkspace(user.id, ws.id);
        return { status: "active" as const, workspace: ws.name };
      }
      if (existing?.status === "rejected" || existing?.status === "deactivated")
        throw new ActionError({
          code: "FORBIDDEN",
          message: "Your access to this workspace was revoked. Contact the workspace owner.",
        });
      if (!existing) {
        await withWorkspace(ws.id, async (tx) => {
          const [m] = await tx
            .insert(memberships)
            .values({
              workspaceId: ws.id,
              userId: user.id,
              role: "employee",
              status: "pending",
              icalToken: token(18),
            })
            .returning();
          const reviewers = await membersWithRoles(tx, ws.id, ["owner", "manager"]);
          await notify(tx, ws.id, reviewers, {
            kind: "join.requested",
            title: `${user.name} asked to join ${ws.name}`,
            body: user.email,
            link: `/app/inbox?focus=join:${m!.id}`,
          });
        });
      }
      await db.update(users).set({ activeWorkspaceId: ws.id }).where(eq(users.id, user.id));
      return { status: "pending" as const, workspace: ws.name };
    },
  }),

  /** Accept an email invite link: membership becomes active with the pre-assigned role/department. */
  acceptInvite: defineAction({
    input: z.object({ token: z.string().min(10).max(80) }),
    handler: async ({ token: tk }, context) => {
      const user = requireUser(context);
      const [inv] = await db.select().from(invites).where(eq(invites.token, tk));
      if (!inv || inv.acceptedAt || inv.expiresAt < new Date())
        throw new ActionError({ code: "NOT_FOUND", message: "This invite link is invalid or has expired." });
      if (inv.email.toLowerCase() !== user.email.toLowerCase())
        throw new ActionError({
          code: "FORBIDDEN",
          message: `This invite was sent to ${inv.email}. Sign in with that email to accept it.`,
        });
      await withWorkspace(inv.workspaceId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(memberships)
          .where(and(eq(memberships.workspaceId, inv.workspaceId), eq(memberships.userId, user.id)));
        const count = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(memberships)
          .where(eq(memberships.workspaceId, inv.workspaceId));
        const values = {
          role: inv.role,
          status: "active" as const,
          departmentId: inv.departmentId,
          designationId: inv.designationId,
          joinedAt: new Date().toISOString().slice(0, 10),
          statusChangedAt: new Date(),
        };
        if (existing) await tx.update(memberships).set(values).where(eq(memberships.id, existing.id));
        else
          await tx.insert(memberships).values({
            workspaceId: inv.workspaceId,
            userId: user.id,
            employeeCode: `EMP-${String((count[0]?.n ?? 0) + 1).padStart(3, "0")}`,
            icalToken: token(18),
            ...values,
          });
        await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inv.id));
      });
      await db.update(users).set({ activeWorkspaceId: inv.workspaceId }).where(eq(users.id, user.id));
      return { ok: true };
    },
  }),

  /** First-run wizard: creates a workspace (or completes the current owner's unfinished one). */
  setup: defineAction({
    input: z.object({
      name: z.string().trim().min(2).max(80),
      timezone: z.string().min(1).max(64),
      country: z.string().length(2),
      officeStart: time,
      officeEnd: time,
      lateThresholdMin: z.coerce.number().int().min(0).max(240),
      weekendDays: z.array(z.number().int().min(0).max(6)).max(6),
      departments: z.array(z.string().trim().min(1).max(60)).max(50),
      designations: z.array(z.string().trim().min(1).max(60)).max(100),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      try {
        new Intl.DateTimeFormat("en", { timeZone: input.timezone });
      } catch {
        throw new ActionError({ code: "BAD_REQUEST", message: "Unknown timezone." });
      }
      if (input.officeEnd <= input.officeStart)
        throw new ActionError({ code: "BAD_REQUEST", message: "Office end must be after office start." });
      const ctx = context.locals.ctx;
      const reuse = ctx && ctx.role === "owner" && !ctx.onboarded ? ctx.workspaceId : null;
      let wsId = reuse;
      if (!wsId) {
        const base = slugify(input.name);
        const slug = `${base}-${token(3)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")}`;
        const [ws] = await db
          .insert(workspaces)
          .values({
            name: input.name,
            slug,
            timezone: input.timezone,
            country: input.country,
            inviteCode: inviteCode(input.name),
          })
          .returning();
        wsId = ws!.id;
      }
      await withWorkspace(wsId, async (tx) => {
        await tx
          .update(workspaces)
          .set({
            name: input.name,
            timezone: input.timezone,
            country: input.country,
            onboardedAt: new Date(),
          })
          .where(eq(workspaces.id, wsId));
        const settings = {
          officeStart: input.officeStart,
          officeEnd: input.officeEnd,
          lateThresholdMin: input.lateThresholdMin,
          weekendDays: input.weekendDays,
        };
        await tx
          .insert(workspaceSettings)
          .values({ workspaceId: wsId, ...settings })
          .onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: settings });
        if (!reuse) {
          await tx.insert(memberships).values({
            workspaceId: wsId,
            userId: user.id,
            role: "owner",
            status: "active",
            employeeCode: "OWN-001",
            joinedAt: new Date().toISOString().slice(0, 10),
            icalToken: token(18),
          });
          await tx.insert(leaveTypes).values(DEFAULT_LEAVE_TYPES.map((l) => ({ workspaceId: wsId, ...l })));
        }
        for (const name of new Set(input.departments))
          await tx.insert(departments).values({ workspaceId: wsId, name }).onConflictDoNothing();
        for (const name of new Set(input.designations))
          await tx.insert(designations).values({ workspaceId: wsId, name }).onConflictDoNothing();
        const [owner] = await tx
          .select()
          .from(memberships)
          .where(and(eq(memberships.workspaceId, wsId), eq(memberships.userId, user.id)));
        await audit(
          tx,
          { workspaceId: wsId, userId: user.id, membershipId: owner!.id },
          "workspace.setup",
          "workspace",
          wsId,
          `Set up workspace ${input.name}`,
        );
      });
      await db.update(users).set({ activeWorkspaceId: wsId }).where(eq(users.id, user.id));
      return { workspaceId: wsId };
    },
  }),

  switch: defineAction({
    input: z.object({ workspaceId: z.uuid() }),
    handler: async ({ workspaceId }, context) => {
      const user = requireUser(context);
      if (!(await switchWorkspace(user.id, workspaceId)))
        throw new ActionError({ code: "FORBIDDEN", message: "Not a member of that workspace." });
      return { ok: true };
    },
  }),

  setTheme: defineAction({
    input: z.object({ theme: z.enum(["light", "dark", "system"]) }),
    handler: async ({ theme }, context) => {
      const user = requireUser(context);
      await db.update(users).set({ theme }).where(eq(users.id, user.id));
      context.cookies.set("theme", theme, { path: "/", sameSite: "lax", maxAge: 31536000 });
      return { theme };
    },
  }),

  regenerateInvite: defineAction({
    input: z.object({ expiresInDays: z.number().int().min(0).max(365).default(0) }),
    handler: async ({ expiresInDays }, context) => {
      const ctx = requireCtx(context, "invite.manage");
      const code = inviteCode(ctx.workspaceName);
      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400_000) : null;
      await scoped(ctx, async (tx) => {
        await tx
          .update(workspaces)
          .set({ inviteCode: code, inviteCodeExpiresAt: expiresAt })
          .where(eq(workspaces.id, ctx.workspaceId));
        await audit(
          tx,
          ctx,
          "invite.regenerated",
          "workspace",
          ctx.workspaceId,
          "Regenerated the workspace invite code",
          { expiresInDays },
        );
      });
      return { code, expiresAt: expiresAt?.toISOString() ?? null };
    },
  }),

  /** Email invite link with pre-assigned role / department / designation. */
  sendInvite: defineAction({
    input: z.object({
      email: z.string().trim().pipe(z.email().max(200)),
      role: z.enum(["manager", "employee"]),
      departmentId: z.uuid().nullable().optional(),
      designationId: z.uuid().nullable().optional(),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "employees.manage", { targetRole: input.role });
      const tk = token(24);
      await scoped(ctx, async (tx) => {
        await tx.insert(invites).values({
          workspaceId: ctx.workspaceId,
          email: input.email.toLowerCase(),
          role: input.role,
          departmentId: input.departmentId ?? null,
          designationId: input.designationId ?? null,
          token: tk,
          expiresAt: new Date(Date.now() + 7 * 86400_000),
          createdBy: ctx.membershipId,
        });
        await audit(tx, ctx, "invite.sent", "invite", null, `Invited a new ${input.role} by email`);
      });
      const url = `${env.PUBLIC_SITE_URL}/auth/invite/${tk}`;
      await sendMail({
        to: input.email,
        subject: `You're invited to ${ctx.workspaceName} on Office Ledger`,
        text: `You've been invited to join ${ctx.workspaceName} as ${input.role}.\n\nAccept within 7 days:\n${url}`,
        html: mailHtml(
          `Join ${ctx.workspaceName}`,
          [
            `You've been invited to join ${ctx.workspaceName} as ${input.role}. The link is valid for 7 days.`,
          ],
          { label: "Accept invite", url },
        ),
      });
      return { url };
    },
  }),
};
