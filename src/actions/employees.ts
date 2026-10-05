import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, departments, designations, files, memberships, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { deleteStored } from "@/lib/files";
import { token } from "@/lib/ids";
import { notify, publish } from "@/lib/notifications";
import { hashPassword } from "@/lib/password";
import { can } from "@/lib/permissions";
import { employeeProfile, employeesPage, nextEmployeeCode } from "@/lib/queries/employees";
import { assertCan, bad, mapDecision, notFound, requireCtx, scoped } from "./_helpers";
import { decideJoin } from "@/lib/services/decisions";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ids = z.array(z.uuid()).min(1).max(200);

export const employees = {
  list: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context, "employees.view");
      return scoped(ctx, (tx) => employeesPage(tx));
    },
  }),

  profile: defineAction({
    input: z.object({ id: z.uuid() }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context);
      const p = await scoped(ctx, (tx) => employeeProfile(tx, ctx, id));
      if (!p) throw notFound("Employee");
      return p;
    },
  }),

  /** Approve pending join requests (assigns an employee code and joining date). */
  approve: defineAction({
    input: z.object({ ids }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "employees.manage");
      return scoped(ctx, async (tx) => {
        for (const id of input.ids)
          await decideJoin(tx, ctx, id, "approve", null, () => nextEmployeeCode(tx)).catch(mapDecision);
        await publish(tx, ctx.workspaceId, "inbox");
        return { count: input.ids.length };
      });
    },
  }),

  reject: defineAction({
    input: z.object({ ids, reason: z.string().trim().max(500).optional() }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "employees.manage");
      return scoped(ctx, async (tx) => {
        for (const id of input.ids) await decideJoin(tx, ctx, id, "reject", input.reason).catch(mapDecision);
        await publish(tx, ctx.workspaceId, "inbox");
        return { count: input.ids.length };
      });
    },
  }),

  setStatus: defineAction({
    input: z.object({ id: z.uuid(), status: z.enum(["active", "deactivated"]) }),
    handler: async ({ id, status }, context) => {
      const ctx = requireCtx(context, "employees.manage");
      if (id === ctx.membershipId) throw bad("You can't change your own status.");
      return scoped(ctx, async (tx) => {
        const [m] = await tx.select().from(memberships).where(eq(memberships.id, id));
        if (!m) throw notFound("Employee");
        if (m.role === "owner") throw bad("The owner can't be deactivated. Transfer ownership first.");
        assertCan(ctx, "employees.manage", { ownerRole: m.role });
        await tx
          .update(memberships)
          .set({ status, statusChangedAt: new Date() })
          .where(eq(memberships.id, id));
        if (status === "deactivated") {
          // End their sessions so access stops immediately.
          await db.execute(sql`delete from sessions where user_id = ${m.userId}`);
        }
        await audit(
          tx,
          ctx,
          status === "active" ? "member.reactivated" : "member.deactivated",
          "membership",
          id,
          `${status === "active" ? "Reactivated" : "Deactivated"} a member`,
        );
        await publish(tx, ctx.workspaceId, "employees");
        return { ok: true };
      });
    },
  }),

  updateCompany: defineAction({
    input: z.object({
      id: z.uuid(),
      employeeCode: z.string().trim().min(1).max(20),
      departmentId: z.uuid().nullable(),
      designationId: z.uuid().nullable(),
      managerId: z.uuid().nullable(),
      joinedAt: date.nullable(),
      role: z.enum(["manager", "employee"]).optional(),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "employees.manage");
      return scoped(ctx, async (tx) => {
        const [m] = await tx.select().from(memberships).where(eq(memberships.id, input.id));
        if (!m) throw notFound("Employee");
        if (m.role === "owner") throw bad("Edit the owner's details from their own profile.");
        assertCan(ctx, "employees.manage", { ownerRole: m.role, targetRole: input.role ?? m.role });
        if (input.role && input.role !== m.role) assertCan(ctx, "roles.manage");
        if (input.managerId === input.id) throw bad("Someone can't report to themselves.");
        const [dupe] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(eq(memberships.employeeCode, input.employeeCode), sql`${memberships.id} <> ${input.id}`),
          );
        if (dupe) throw new ActionError({ code: "CONFLICT", message: "That employee ID is already used." });
        const patch = {
          employeeCode: input.employeeCode,
          departmentId: input.departmentId,
          designationId: input.designationId,
          managerId: input.managerId,
          joinedAt: input.joinedAt,
          ...(input.role ? { role: input.role } : {}),
        };
        await tx.update(memberships).set(patch).where(eq(memberships.id, input.id));
        const changed = Object.keys(patch).filter(
          (k) => (m as Record<string, unknown>)[k] !== (patch as Record<string, unknown>)[k],
        );
        await audit(
          tx,
          ctx,
          input.role && input.role !== m.role ? "member.role_changed" : "member.updated",
          "membership",
          input.id,
          input.role && input.role !== m.role
            ? `Changed role from ${m.role} to ${input.role}`
            : "Updated company information",
          { fields: changed },
        );
        await publish(tx, ctx.workspaceId, "employees");
        return { ok: true };
      });
    },
  }),

  updatePersonal: defineAction({
    input: z.object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().trim().max(30).nullable(),
      address: z.string().trim().max(300).nullable(),
      bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullable(),
      birthDate: date.nullable(),
      emergencyContact: z
        .object({
          name: z.string().trim().max(100),
          phone: z.string().trim().max(30),
          relation: z.string().trim().max(40),
        })
        .nullable(),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context);
      await scoped(ctx, (tx) =>
        tx
          .update(memberships)
          .set({
            phone: input.phone,
            address: input.address,
            bloodGroup: input.bloodGroup,
            birthDate: input.birthDate,
            emergencyContact: input.emergencyContact,
          })
          .where(eq(memberships.id, ctx.membershipId)),
      );
      await db.update(users).set({ name: input.name }).where(eq(users.id, ctx.userId));
      return { ok: true };
    },
  }),

  updateNotifyPrefs: defineAction({
    input: z.object({ emailDigest: z.boolean(), push: z.boolean(), emailOnDecision: z.boolean() }),
    handler: async (input, context) => {
      const ctx = requireCtx(context);
      await scoped(ctx, (tx) =>
        tx.update(memberships).set({ notifyPrefs: input }).where(eq(memberships.id, ctx.membershipId)),
      );
      return { ok: true };
    },
  }),

  regenerateIcal: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context);
      const tk = token(18);
      await scoped(ctx, (tx) =>
        tx.update(memberships).set({ icalToken: tk }).where(eq(memberships.id, ctx.membershipId)),
      );
      return { token: tk };
    },
  }),

  transferOwnership: defineAction({
    input: z.object({ id: z.uuid(), confirm: z.literal("TRANSFER") }),
    handler: async ({ id }, context) => {
      const ctx = requireCtx(context, "ownership.transfer");
      if (id === ctx.membershipId) throw bad("You already own this workspace.");
      return scoped(ctx, async (tx) => {
        const [m] = await tx
          .select()
          .from(memberships)
          .where(and(eq(memberships.id, id), eq(memberships.status, "active")));
        if (!m) throw notFound("Active member");
        await tx.update(memberships).set({ role: "owner" }).where(eq(memberships.id, id));
        await tx.update(memberships).set({ role: "manager" }).where(eq(memberships.id, ctx.membershipId));
        await audit(tx, ctx, "ownership.transferred", "membership", id, "Transferred workspace ownership");
        await notify(tx, ctx.workspaceId, [id], {
          kind: "ownership",
          title: `You are now the owner of ${ctx.workspaceName}`,
          link: "/app/settings",
        });
        return { ok: true };
      });
    },
  }),

  deleteDocument: defineAction({
    input: z.object({ fileId: z.uuid() }),
    handler: async ({ fileId }, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, async (tx) => {
        const [f] = await tx.select().from(files).where(eq(files.id, fileId));
        if (!f || f.entityType !== "membership" || !f.entityId) throw notFound("Document");
        const [m] = await tx
          .select({ role: memberships.role })
          .from(memberships)
          .where(eq(memberships.id, f.entityId));
        if (f.entityId !== ctx.membershipId && !can(ctx, "employees.manage", { ownerRole: m?.role }))
          throw new ActionError({ code: "FORBIDDEN", message: "Not allowed." });
        await tx.delete(files).where(eq(files.id, fileId));
        await deleteStored(f.storageKey);
        await audit(
          tx,
          ctx,
          "document.deleted",
          "membership",
          f.entityId,
          `Deleted document "${f.filename}"`,
        );
        return { ok: true };
      });
    },
  }),

  // ---- Departments & designations ----------------------------------------------------------
  saveOrgItem: defineAction({
    input: z.object({
      kind: z.enum(["department", "designation"]),
      id: z.uuid().optional(),
      name: z.string().trim().min(1).max(60),
    }),
    handler: async ({ kind, id, name }, context) => {
      const ctx = requireCtx(context, "employees.manage");
      const table = kind === "department" ? departments : designations;
      return scoped(ctx, async (tx) => {
        try {
          if (id) await tx.update(table).set({ name }).where(eq(table.id, id));
          else await tx.insert(table).values({ workspaceId: ctx.workspaceId, name });
        } catch {
          throw new ActionError({ code: "CONFLICT", message: `A ${kind} with that name already exists.` });
        }
        await audit(
          tx,
          ctx,
          `${kind}.${id ? "renamed" : "created"}`,
          kind,
          id ?? null,
          `${id ? "Renamed" : "Created"} ${kind} "${name}"`,
        );
        await publish(tx, ctx.workspaceId, "employees");
        return { ok: true };
      });
    },
  }),

  deleteOrgItem: defineAction({
    input: z.object({ kind: z.enum(["department", "designation"]), id: z.uuid() }),
    handler: async ({ kind, id }, context) => {
      const ctx = requireCtx(context, "employees.manage");
      const table = kind === "department" ? departments : designations;
      return scoped(ctx, async (tx) => {
        const [row] = await tx.delete(table).where(eq(table.id, id)).returning({ name: table.name });
        if (!row) throw notFound(kind);
        await audit(tx, ctx, `${kind}.deleted`, kind, id, `Deleted ${kind} "${row.name}"`);
        await publish(tx, ctx.workspaceId, "employees");
        return { ok: true };
      });
    },
  }),

  /**
   * Bulk import. Creates accounts with a random password and emails each person a link to choose
   * their own. Rows are validated client-side for preview and again here.
   */
  importCsv: defineAction({
    input: z.object({
      rows: z
        .array(
          z.object({
            name: z.string().trim().min(2).max(100),
            email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
            employeeCode: z.string().trim().max(20).optional().default(""),
            department: z.string().trim().max(60).optional().default(""),
            designation: z.string().trim().max(60).optional().default(""),
            role: z.enum(["manager", "employee"]).default("employee"),
            joinedAt: z
              .union([date, z.literal("")])
              .optional()
              .default(""),
            phone: z.string().trim().max(30).optional().default(""),
          }),
        )
        .min(1)
        .max(500),
    }),
    handler: async ({ rows }, context) => {
      const ctx = requireCtx(context, "employees.import");
      if (rows.some((r) => r.role === "manager")) assertCan(ctx, "roles.manage");
      const results: { email: string; status: "created" | "added" | "skipped"; message?: string }[] = [];
      const toEmail: string[] = [];
      await scoped(ctx, async (tx) => {
        const deps = new Map((await tx.select().from(departments)).map((d) => [d.name.toLowerCase(), d.id]));
        const desigs = new Map(
          (await tx.select().from(designations)).map((d) => [d.name.toLowerCase(), d.id]),
        );
        const ensure = async (kind: "department" | "designation", name: string) => {
          if (!name) return null;
          const map = kind === "department" ? deps : desigs;
          const hit = map.get(name.toLowerCase());
          if (hit) return hit;
          const table = kind === "department" ? departments : designations;
          const [row] = await tx.insert(table).values({ workspaceId: ctx.workspaceId, name }).returning();
          map.set(name.toLowerCase(), row!.id);
          return row!.id;
        };
        for (const r of rows) {
          let [u] = await db.select().from(users).where(eq(users.email, r.email));
          let created = false;
          if (!u) {
            const id = token(16);
            [u] = await db
              .insert(users)
              .values({
                id,
                name: r.name,
                email: r.email,
                emailVerified: false,
                activeWorkspaceId: ctx.workspaceId,
              })
              .returning();
            await db
              .insert(accounts)
              .values({
                id: token(16),
                accountId: id,
                providerId: "credential",
                userId: id,
                password: await hashPassword(token(24)),
              });
            created = true;
          }
          const [existing] = await tx
            .select({ id: memberships.id })
            .from(memberships)
            .where(eq(memberships.userId, u!.id));
          if (existing) {
            results.push({ email: r.email, status: "skipped", message: "Already a member" });
            continue;
          }
          const code = r.employeeCode || (await nextEmployeeCode(tx));
          const [codeTaken] = await tx
            .select({ id: memberships.id })
            .from(memberships)
            .where(eq(memberships.employeeCode, code));
          await tx.insert(memberships).values({
            workspaceId: ctx.workspaceId,
            userId: u!.id,
            employeeCode: codeTaken ? await nextEmployeeCode(tx) : code,
            role: r.role,
            status: "active",
            departmentId: await ensure("department", r.department),
            designationId: await ensure("designation", r.designation),
            joinedAt: r.joinedAt || new Date().toISOString().slice(0, 10),
            phone: r.phone || null,
            icalToken: token(18),
            statusChangedAt: new Date(),
          });
          results.push({ email: r.email, status: created ? "created" : "added" });
          if (created) toEmail.push(r.email);
        }
        await audit(
          tx,
          ctx,
          "members.imported",
          "membership",
          null,
          `Imported ${results.filter((r) => r.status !== "skipped").length} members from CSV`,
        );
        await publish(tx, ctx.workspaceId, "employees");
      });
      for (const email of toEmail) {
        await auth.api
          .requestPasswordReset({ body: { email, redirectTo: `${env.PUBLIC_SITE_URL}/auth/reset` } })
          .catch(() => null);
      }
      return { results };
    },
  }),
};
