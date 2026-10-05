import type { Executor } from "@/db";
import { auditLog } from "@/db/schema";
import type { WorkspaceContext } from "./auth-types";

/**
 * Records a privileged action. Keep `summary` human readable and free of sensitive PII
 * (no passwords, tokens, addresses, phone numbers); put structured, non-sensitive details in `meta`.
 */
export async function audit(
  tx: Executor,
  ctx: Pick<WorkspaceContext, "workspaceId" | "userId" | "membershipId">,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  meta?: Record<string, unknown>,
) {
  await tx.insert(auditLog).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    actorMembershipId: ctx.membershipId,
    action,
    entityType,
    entityId,
    summary,
    meta: meta ?? null,
  });
}
