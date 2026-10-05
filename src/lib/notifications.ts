import { sql } from "drizzle-orm";
import { inArray, and, eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { memberships, notifications } from "@/db/schema";
import type { Role } from "./auth-types";

export interface NotifyInput {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * Inserts in-app notifications and publishes a Postgres NOTIFY (delivered on commit) that the SSE
 * stream (/api/stream) fans out to connected browsers. Web push is sent by the stream listener.
 */
export async function notify(tx: Executor, workspaceId: string, membershipIds: (string | null | undefined)[], input: NotifyInput) {
  const ids = [...new Set(membershipIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await tx.insert(notifications).values(ids.map((membershipId) => ({ workspaceId, membershipId, ...input })));
  await tx.execute(
    sql`select pg_notify('ledger_events', ${JSON.stringify({ type: "notification", workspaceId, membershipIds: ids, title: input.title, body: input.body ?? null, link: input.link ?? null })})`,
  );
}

/** Broadcast a lightweight "something changed" event (e.g. inbox counts) to a workspace. */
export async function publish(tx: Executor, workspaceId: string, topic: string) {
  await tx.execute(sql`select pg_notify('ledger_events', ${JSON.stringify({ type: "invalidate", workspaceId, topic })})`);
}

/** Active members with the given roles (e.g. reviewers for an inbox item). */
export async function membersWithRoles(tx: Executor, workspaceId: string, roles: Role[]) {
  const rows = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.status, "active"), inArray(memberships.role, roles)));
  return rows.map((r) => r.id);
}
