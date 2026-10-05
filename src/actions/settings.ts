import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { and, asc, count, desc, eq, gte, lte, ne } from "drizzle-orm";
import type { Tx } from "@/db";
import { db } from "@/db";
import {
  auditLog,
  breakWindows,
  departments,
  designations,
  leaveRequests,
  leaveTypes,
  memberships,
  users,
  workspaceSettings,
  workspaces,
} from "@/db/schema";
import type { WorkspaceContext } from "@/lib/auth-types";
import { audit } from "@/lib/audit";
import { notify, publish } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/services/attendance";
import { notFound, requireCtx, scoped } from "./_helpers";

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM");
const hhmmss = (t: string) => (t.length === 5 ? `${t}:00` : t);

/** Before → after for changed keys only (no secrets live in settings). */
function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = { from: before[k], to: after[k] };
  }
  return out;
}

async function saveSettings(
  tx: Tx,
  ctx: WorkspaceContext,
  section: string,
  patch: Partial<typeof workspaceSettings.$inferInsert>,
) {
  const before = await getSettings(tx, ctx.workspaceId);
  await tx.update(workspaceSettings).set(patch).where(eq(workspaceSettings.workspaceId, ctx.workspaceId));
  const changes = diff(before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  if (Object.keys(changes).length)
    await audit(
      tx,
      ctx,
      "settings.updated",
      "workspace_settings",
      ctx.workspaceId,
      `Updated ${section} settings (${Object.keys(changes).join(", ")})`,
      { section, changes },
    );
  await publish(tx, ctx.workspaceId, "settings");
  return { changed: Object.keys(changes).length };
}

export async function settingsPage(tx: Tx, ctx: WorkspaceContext) {
  const [ws] = await tx.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
  const [s, breaks, types, deps, desigs, members, typeUsage] = await Promise.all([
    getSettings(tx, ctx.workspaceId),
    tx.select().from(breakWindows).orderBy(asc(breakWindows.startTime)),
    tx.select().from(leaveTypes).orderBy(asc(leaveTypes.name)),
    tx
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .orderBy(asc(departments.name)),
    tx
      .select({ id: designations.id, name: designations.name })
      .from(designations)
      .orderBy(asc(designations.name)),
    tx
      .select({
        id: memberships.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: memberships.role,
        code: memberships.employeeCode,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.status, "active"))
      .orderBy(asc(users.name)),
    tx
      .select({ id: leaveRequests.leaveTypeId, n: count() })
      .from(leaveRequests)
      .groupBy(leaveRequests.leaveTypeId),
  ]);
  const usage = await tx
    .select({ departmentId: memberships.departmentId, designationId: memberships.designationId, n: count() })
    .from(memberships)
    .groupBy(memberships.departmentId, memberships.designationId);
  return {
    workspace: { name: ws!.name, timezone: ws!.timezone, country: ws!.country, locale: ws!.locale },
    settings: {
      officeStart: s.officeStart.slice(0, 5),
      officeEnd: s.officeEnd.slice(0, 5),
      lateThresholdMin: s.lateThresholdMin,
      remoteDaysPerWeek: s.remoteDaysPerWeek,
      approvalMode: s.approvalMode,
      weekendDays: s.weekendDays,
      autoCheckoutAt: s.autoCheckoutAt?.slice(0, 5) ?? null,
      scoring: s.scoring,
      geo: s.geo,
      digest: s.digest,
      complaintPolicy: s.complaintPolicy,
    },
    breaks: breaks.map((b) => ({ ...b, startTime: b.startTime.slice(0, 5), endTime: b.endTime.slice(0, 5) })),
    leaveTypes: types.map((t) => ({ ...t, used: typeUsage.find((u) => u.id === t.id)?.n ?? 0 })),
    departments: deps,
    designations: desigs,
    usage,
    members,
    me: ctx.membershipId,
    canEdit: can(ctx, "settings.edit"),
    isOwner: ctx.role === "owner",
  };
}
export type SettingsData = Awaited<ReturnType<typeof settingsPage>>;

export async function auditList(tx: Tx, from: string, to: string) {
  return tx
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      summary: auditLog.summary,
      meta: auditLog.meta,
      createdAt: auditLog.createdAt,
      actor: users.name,
    })
    .from(auditLog)
    .leftJoin(memberships, eq(memberships.id, auditLog.actorMembershipId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        gte(auditLog.createdAt, new Date(`${from}T00:00:00Z`)),
        lte(auditLog.createdAt, new Date(`${to}T23:59:59Z`)),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(5000);
}
export type AuditRow = Awaited<ReturnType<typeof auditList>>[number];

export const settings = {
  page: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context, "settings.view");
      return scoped(ctx, (tx) => settingsPage(tx, ctx));
    },
  }),

  policy: defineAction({
    input: z
      .object({
        officeStart: time,
        officeEnd: time,
        lateThresholdMin: z.number().int().min(0).max(240),
        remoteDaysPerWeek: z.number().int().min(0).max(7),
        approvalMode: z.enum(["none", "late", "remote", "both"]),
        autoCheckoutAt: time.nullable(),
        geo: z.object({
          enabled: z.boolean(),
          lat: z.number().min(-90).max(90).nullable(),
          lng: z.number().min(-180).max(180).nullable(),
          radiusM: z.number().int().min(25).max(5000),
          allowedIps: z.array(z.string().trim().ip()).max(20),
        }),
      })
      .refine((v) => v.officeEnd > v.officeStart, { message: "Office end must be after office start." })
      .refine(
        (v) => !v.geo.enabled || v.geo.allowedIps.length > 0 || (v.geo.lat != null && v.geo.lng != null),
        { message: "Office check-in verification needs office coordinates or at least one office IP." },
      ),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "settings.edit");
      return scoped(ctx, (tx) =>
        saveSettings(tx, ctx, "policy", {
          ...input,
          officeStart: hhmmss(input.officeStart),
          officeEnd: hhmmss(input.officeEnd),
          autoCheckoutAt: input.autoCheckoutAt ? hhmmss(input.autoCheckoutAt) : null,
        }),
      );
    },
  }),

  schedule: defineAction({
    input: z.object({
      name: z.string().trim().min(2).max(80),
      timezone: z.string().min(1).max(64),
      country: z.string().length(2),
      locale: z.string().min(2).max(20),
      weekendDays: z.array(z.number().int().min(0).max(6)).max(6),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "settings.edit");
      try {
        new Intl.DateTimeFormat(input.locale, { timeZone: input.timezone });
      } catch {
        throw new ActionError({ code: "BAD_REQUEST", message: "Unknown timezone or locale." });
      }
      return scoped(ctx, async (tx) => {
        const [before] = await tx.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
        const wsPatch = {
          name: input.name,
          timezone: input.timezone,
          country: input.country.toUpperCase(),
          locale: input.locale,
        };
        await tx.update(workspaces).set(wsPatch).where(eq(workspaces.id, ctx.workspaceId));
        const changes = diff(before as unknown as Record<string, unknown>, wsPatch);
        if (Object.keys(changes).length)
          await audit(
            tx,
            ctx,
            "settings.updated",
            "workspace",
            ctx.workspaceId,
            `Updated workspace details (${Object.keys(changes).join(", ")})`,
            { changes },
          );
        return saveSettings(tx, ctx, "schedule", { weekendDays: [...new Set(input.weekendDays)].sort() });
      });
    },
  }),

  saveBreak: defineAction({
    input: z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(40),
        startTime: time,
        endTime: time,
        paid: z.boolean(),
      })
      .refine((v) => v.endTime > v.startTime, "Break must end after it starts"),
    handler: async ({ id, ...v }, context) => {
      const ctx = requireCtx(context, "settings.edit");
      return scoped(ctx, async (tx) => {
        const values = { ...v, startTime: hhmmss(v.startTime), endTime: hhmmss(v.endTime) };
        if (id) await tx.update(breakWindows).set(values).where(eq(breakWindows.id, id));
        else await tx.insert(breakWindows).values({ workspaceId: ctx.workspaceId, ...values });
        await audit(
          tx,
          ctx,
          "settings.break_saved",
          "break_windows",
          id ?? null,
          `${id ? "Updated" : "Added"} break "${v.name}" ${v.startTime}–${v.endTime}${v.paid ? " (paid)" : ""}`,
        );
        return { ok: true };
      });
    },
  }),

  deleteBreak: defineAction({
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context, "settings.edit");
      return scoped(ctx, async (tx) => {
        const [row] = await tx.delete(breakWindows).where(eq(breakWindows.id, id)).returning();
        if (!row) throw notFound("Break");
        await audit(tx, ctx, "settings.break_deleted", "break_windows", id, `Removed break "${row.name}"`);
        return { ok: true };
      });
    },
  }),

  saveLeaveType: defineAction({
    input: z.object({
      id: z.string().uuid().optional(),
      code: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z][a-z0-9_]{1,19}$/, "Use letters, digits or _"),
      name: z.string().trim().min(2).max(40),
      yearlyQuota: z.number().min(0).max(365),
      accrual: z.enum(["yearly", "monthly"]),
      paid: z.boolean(),
      active: z.boolean(),
      color: z.enum(["info", "success", "warning", "danger", "violet", "teal"]),
    }),
    handler: async ({ id, ...v }, context) => {
      const ctx = requireCtx(context, "settings.edit");
      return scoped(ctx, async (tx) => {
        try {
          if (id) await tx.update(leaveTypes).set(v).where(eq(leaveTypes.id, id));
          else await tx.insert(leaveTypes).values({ workspaceId: ctx.workspaceId, ...v });
        } catch {
          throw new ActionError({ code: "CONFLICT", message: "A leave type with that code already exists." });
        }
        await audit(
          tx,
          ctx,
          "settings.leave_type_saved",
          "leave_types",
          id ?? null,
          `${id ? "Updated" : "Added"} leave type "${v.name}" (${v.yearlyQuota}/year, ${v.accrual})`,
        );
        return { ok: true };
      });
    },
  }),

  deleteLeaveType: defineAction({
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context, "settings.edit");
      return scoped(ctx, async (tx) => {
        const [used] = await tx
          .select({ n: count() })
          .from(leaveRequests)
          .where(eq(leaveRequests.leaveTypeId, id));
        // Types with history are deactivated instead of deleted so old requests keep their label.
        const [row] =
          used!.n > 0
            ? await tx.update(leaveTypes).set({ active: false }).where(eq(leaveTypes.id, id)).returning()
            : await tx.delete(leaveTypes).where(eq(leaveTypes.id, id)).returning();
        if (!row) throw notFound("Leave type");
        await audit(
          tx,
          ctx,
          used!.n > 0 ? "settings.leave_type_deactivated" : "settings.leave_type_deleted",
          "leave_types",
          id,
          `${used!.n > 0 ? "Deactivated" : "Deleted"} leave type "${row.name}"`,
        );
        return { deactivated: used!.n > 0 };
      });
    },
  }),

  scoring: defineAction({
    input: z.object({
      late: z.number().min(0).max(50),
      absent: z.number().min(0).max(50),
      missingCheckout: z.number().min(0).max(50),
      halfDay: z.number().min(0).max(50),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "settings.edit");
      return scoped(ctx, (tx) => saveSettings(tx, ctx, "scoring", { scoring: input }));
    },
  }),

  notifications: defineAction({
    input: z.object({
      digest: z.object({
        dailyDigest: z.boolean(),
        digestHour: z.number().int().min(0).max(23),
        emailLockedReport: z.boolean(),
      }),
      complaintPolicy: z.object({
        anonymousVisibleToOwner: z.boolean(),
        categories: z.array(z.string().trim().min(2).max(40)).min(1).max(20),
      }),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "settings.edit");
      return scoped(ctx, (tx) => saveSettings(tx, ctx, "notification", input));
    },
  }),

  setRole: defineAction({
    input: z.object({ membershipId: z.string().uuid(), role: z.enum(["manager", "employee"]) }),
    handler: async ({ membershipId, role }, context) => {
      const ctx = requireCtx(context, "roles.manage");
      if (membershipId === ctx.membershipId)
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Transfer ownership to change your own role.",
        });
      return scoped(ctx, async (tx) => {
        const [m] = await tx
          .select()
          .from(memberships)
          .where(and(eq(memberships.id, membershipId), ne(memberships.role, "owner")));
        if (!m) throw notFound("Member");
        if (m.role === role) return { ok: true };
        await tx.update(memberships).set({ role }).where(eq(memberships.id, membershipId));
        await audit(
          tx,
          ctx,
          "member.role_changed",
          "membership",
          membershipId,
          `Changed role from ${m.role} to ${role}`,
        );
        await notify(tx, ctx.workspaceId, [membershipId], {
          kind: "role.changed",
          title: `Your role in ${ctx.workspaceName} is now ${role}`,
          link: "/app",
        });
        await publish(tx, ctx.workspaceId, "employees");
        return { ok: true };
      });
    },
  }),

  audit: defineAction({
    input: z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    handler: async ({ from, to }, context) => {
      const ctx = requireCtx(context, "audit.view");
      return scoped(ctx, (tx) => auditList(tx, from, to));
    },
  }),

  deleteWorkspace: defineAction({
    input: z.object({ confirmName: z.string() }),
    handler: async ({ confirmName }, context) => {
      const ctx = requireCtx(context, "workspace.delete");
      if (confirmName.trim() !== ctx.workspaceName)
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Type the workspace name exactly to confirm.",
        });
      // Cascades to every tenant table. Runs on the owner connection after the permission check.
      await db.delete(workspaces).where(eq(workspaces.id, ctx.workspaceId));
      await db.update(users).set({ activeWorkspaceId: null }).where(eq(users.id, ctx.userId));
      console.info(`[audit] workspace ${ctx.workspaceId} deleted by user ${ctx.userId}`);
      return { ok: true };
    },
  }),
};
