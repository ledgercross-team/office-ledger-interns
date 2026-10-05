import { sql } from "drizzle-orm";
import type { WorkspaceContext } from "@/lib/auth-types";

/**
 * SQL filter for v_inbox_items mirroring can("inbox.review"): owners see everything except their
 * own requests; managers see employee items (and anonymous complaints) but not holiday decisions,
 * their own items, or other managers'/owners' items.
 */
export function inboxScope(ctx: Pick<WorkspaceContext, "role" | "membershipId">, alias = "i") {
  const a = sql.raw(alias);
  if (ctx.role === "owner") return sql`(${a}.requester_id is distinct from ${ctx.membershipId})`;
  return sql`(${a}.requester_id is distinct from ${ctx.membershipId}
    and coalesce(${a}.requester_role, 'employee') = 'employee'
    and ${a}.kind not in ('holiday_add', 'holiday_remove'))`;
}
