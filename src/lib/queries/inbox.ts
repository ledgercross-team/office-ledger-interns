import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import type { WorkspaceContext } from "@/lib/auth-types";
import { inboxScope } from "./inbox-scope";

export type InboxItem = {
  item_id: string;
  kind: string;
  tab: "decisions" | "reviews" | "exceptions";
  priority: "low" | "medium" | "high";
  source_table: string;
  source_id: string;
  created_at: string;
  requester_id: string | null;
  requester_role: string | null;
  requester_name: string | null;
  employee_code: string | null;
  department: string | null;
  department_id: string | null;
  title: string;
  reason: string | null;
  meta: Record<string, unknown>;
};

export async function listInbox(tx: Tx, ctx: WorkspaceContext) {
  const rows = await tx.execute<InboxItem>(sql`
    select i.*, i.created_at::text as created_at from v_inbox_items i
    where i.workspace_id = ${ctx.workspaceId} and ${inboxScope(ctx)}
    order by case i.priority when 'high' then 0 when 'medium' then 1 else 2 end, i.created_at asc
    limit 500`);
  return [...rows];
}
