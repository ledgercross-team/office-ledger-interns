import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { complaintEvents, complaints, memberships } from "@/db/schema";
import { audit } from "@/lib/audit";
import { membersWithRoles, notify, publish } from "@/lib/notifications";
import { complaintsPage } from "@/lib/queries/complaints";
import { notFound, requireCtx, scoped } from "./_helpers";

const status = z.enum(["new", "reviewing", "resolved"]);

export const complaintsActions = {
  page: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context);
      return scoped(ctx, (tx) => complaintsPage(tx, ctx));
    },
  }),

  submit: defineAction({
    input: z.object({
      category: z.string().trim().min(2).max(40),
      subject: z.string().trim().min(3).max(140),
      description: z.string().trim().min(10).max(5000),
      severity: z.enum(["low", "medium", "high", "critical"]),
      anonymous: z.boolean().default(false),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "complaints.submit");
      return scoped(ctx, async (tx) => {
        const [row] = await tx
          .insert(complaints)
          .values({ workspaceId: ctx.workspaceId, submitterId: ctx.membershipId, ...input })
          .returning();
        await tx.insert(complaintEvents).values({
          workspaceId: ctx.workspaceId,
          complaintId: row!.id,
          actorId: ctx.membershipId,
          kind: "created",
          toStatus: "new",
        });
        const processors = (await membersWithRoles(tx, ctx.workspaceId, ["owner", "manager"])).filter(
          (m) => m !== ctx.membershipId,
        );
        await notify(tx, ctx.workspaceId, processors, {
          kind: "complaint.new",
          title: `New ${input.severity} issue: ${input.subject}`,
          body: input.anonymous ? "Submitted anonymously" : `From ${context.locals.user!.name}`,
          link: `/app/complaints?id=${row!.id}`,
        });
        await publish(tx, ctx.workspaceId, "complaints");
        await publish(tx, ctx.workspaceId, "inbox");
        return { id: row!.id };
      });
    },
  }),

  /** Status change, assignment, internal note or message to the submitter. */
  update: defineAction({
    input: z.object({
      id: z.uuid(),
      status: status.optional(),
      assigneeId: z.uuid().nullable().optional(),
      note: z.string().trim().max(3000).optional(),
      internal: z.boolean().default(true),
      resolutionMessage: z.string().trim().max(3000).optional(),
    }),
    handler: async (input, context) => {
      const ctx = requireCtx(context, "complaints.process");
      return scoped(ctx, async (tx) => {
        const [c] = await tx.select().from(complaints).where(eq(complaints.id, input.id));
        if (!c) throw notFound("Issue");
        if (c.submitterId === ctx.membershipId)
          throw new ActionError({ code: "FORBIDDEN", message: "You can't process an issue you submitted." });
        const ev = (
          e: Omit<typeof complaintEvents.$inferInsert, "workspaceId" | "complaintId" | "actorId">,
        ) =>
          tx
            .insert(complaintEvents)
            .values({ workspaceId: ctx.workspaceId, complaintId: c.id, actorId: ctx.membershipId, ...e });

        if (input.assigneeId !== undefined && input.assigneeId !== c.assigneeId) {
          if (input.assigneeId) {
            const [m] = await tx
              .select({ role: memberships.role })
              .from(memberships)
              .where(eq(memberships.id, input.assigneeId));
            if (!m || m.role === "employee")
              throw new ActionError({ code: "BAD_REQUEST", message: "Assign to an owner or manager." });
            if (input.assigneeId !== ctx.membershipId)
              await notify(tx, ctx.workspaceId, [input.assigneeId], {
                kind: "complaint.assigned",
                title: `You were assigned the issue "${c.subject}"`,
                link: `/app/complaints?id=${c.id}`,
              });
          }
          await tx.update(complaints).set({ assigneeId: input.assigneeId }).where(eq(complaints.id, c.id));
          await ev({
            kind: "assigned",
            internal: true,
            body: input.assigneeId ? "Assignee changed" : "Unassigned",
          });
        }
        if (input.status && input.status !== c.status) {
          if (input.status === "resolved" && !input.resolutionMessage && !c.resolutionMessage)
            throw new ActionError({
              code: "BAD_REQUEST",
              message: "Add a resolution message for the submitter.",
            });
          await tx
            .update(complaints)
            .set({
              status: input.status,
              resolutionMessage: input.resolutionMessage ?? c.resolutionMessage,
              assigneeId: c.assigneeId ?? ctx.membershipId,
            })
            .where(eq(complaints.id, c.id));
          await ev({
            kind: "status_change",
            fromStatus: c.status,
            toStatus: input.status,
            internal: false,
            body: input.status === "resolved" ? (input.resolutionMessage ?? null) : null,
          });
          if (c.submitterId)
            await notify(tx, ctx.workspaceId, [c.submitterId], {
              kind: "complaint.status",
              title:
                input.status === "resolved"
                  ? `Your issue "${c.subject}" was resolved`
                  : `Your issue "${c.subject}" is now ${input.status}`,
              body: input.status === "resolved" ? (input.resolutionMessage ?? c.resolutionMessage) : null,
              link: `/app/complaints?id=${c.id}`,
            });
          await audit(
            tx,
            ctx,
            `complaint.${input.status}`,
            "complaints",
            c.id,
            `Moved issue "${c.subject}" from ${c.status} to ${input.status}`,
          );
        }
        if (input.note) {
          await ev({
            kind: input.internal ? "note" : "resolution",
            body: input.note,
            internal: input.internal,
          });
          if (!input.internal && c.submitterId)
            await notify(tx, ctx.workspaceId, [c.submitterId], {
              kind: "complaint.message",
              title: `New message about "${c.subject}"`,
              body: input.note.slice(0, 200),
              link: `/app/complaints?id=${c.id}`,
            });
        }
        await publish(tx, ctx.workspaceId, "complaints");
        await publish(tx, ctx.workspaceId, "inbox");
        return { ok: true };
      });
    },
  }),
};
