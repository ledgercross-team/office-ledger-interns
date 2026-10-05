import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { publish } from "@/lib/notifications";
import { listInbox } from "@/lib/queries/inbox";
import { nextEmployeeCode } from "@/lib/queries/employees";
import * as d from "@/lib/services/decisions";
import { requireCtx, scoped } from "./_helpers";

export const inbox = {
  list: defineAction({
    handler: async (_, context) => {
      const ctx = requireCtx(context, "inbox.view");
      return scoped(ctx, (tx) => listInbox(tx, ctx));
    },
  }),

  /**
   * Bulk approve/reject. Each item is processed in its own savepoint so one stale item doesn't
   * block the rest; per-item results are returned.
   */
  decide: defineAction({
    input: z.object({
      itemIds: z.array(z.string().min(3).max(120)).min(1).max(100),
      decision: z.enum(["approve", "reject"]),
      reason: z.string().trim().max(500).nullish(),
    }),
    handler: async ({ itemIds, decision, reason }, context) => {
      const ctx = requireCtx(context, "inbox.review");
      return scoped(ctx, async (tx) => {
        const results: { itemId: string; ok: boolean; message?: string }[] = [];
        for (const itemId of itemIds) {
          const [kind, a, b] = itemId.split(":");
          try {
            await tx.transaction(async (sp) => {
              switch (kind) {
                case "join":
                  return d.decideJoin(sp, ctx, a!, decision, reason, () => nextEmployeeCode(sp));
                case "leave":
                  return d.decideLeave(sp, ctx, a!, decision, reason);
                case "holiday":
                  return d.decideHoliday(sp, ctx, a!, decision, reason);
                case "attendance":
                  return d.decideAttendance(sp, ctx, a!, decision, reason);
                case "correction":
                  return d.decideCorrection(sp, ctx, a!, decision, reason);
                case "complaint":
                  return d.triageComplaint(sp, ctx, a!, decision, reason);
                case "missing_checkout":
                case "absent":
                case "overtime":
                case "anomaly":
                  if (!a || !b || !/^\d{4}-\d{2}-\d{2}$/.test(b)) throw new d.DecisionError("Malformed item.");
                  return d.decideException(sp, ctx, kind, a, b, decision, reason);
                default:
                  throw new d.DecisionError("Unknown item type.");
              }
            });
            results.push({ itemId, ok: true });
          } catch (e) {
            if (e instanceof d.DecisionError) results.push({ itemId, ok: false, message: e.message });
            else throw e;
          }
        }
        await publish(tx, ctx.workspaceId, "inbox");
        if (results.every((r) => !r.ok)) throw new ActionError({ code: "CONFLICT", message: results[0]?.message ?? "Nothing was updated." });
        return { results, ok: results.filter((r) => r.ok).length };
      });
    },
  }),
};
