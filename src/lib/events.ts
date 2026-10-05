/**
 * Real-time fan-out. Mutations call pg_notify('ledger_events', …) inside their transaction
 * (src/lib/notifications.ts); one LISTEN connection per server process forwards events to the
 * SSE streams of connected users. Works across multiple app instances.
 */
import { EventEmitter } from "node:events";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { client, db } from "@/db";
import { memberships, notifications } from "@/db/schema";
import { sendPush, pushEnabled } from "./push";

export type LedgerEvent =
  | { type: "notification"; workspaceId: string; membershipIds: string[]; title: string; body: string | null; link: string | null }
  | { type: "invalidate"; workspaceId: string; topic: string };

const g = globalThis as unknown as { __ledgerBus?: EventEmitter; __ledgerListening?: Promise<unknown> };
export const bus = g.__ledgerBus ?? (g.__ledgerBus = new EventEmitter().setMaxListeners(0));

async function deliverPush(e: Extract<LedgerEvent, { type: "notification" }>) {
  if (!pushEnabled) return;
  // Claim unpushed notifications atomically so only one instance pushes each one.
  const claimed = await db
    .update(notifications)
    .set({ pushedAt: sql`now()` })
    .where(and(inArray(notifications.membershipId, e.membershipIds), isNull(notifications.pushedAt), eq(notifications.title, e.title)))
    .returning({ membershipId: notifications.membershipId });
  if (!claimed.length) return;
  const rows = await db
    .select({ userId: memberships.userId, prefs: memberships.notifyPrefs })
    .from(memberships)
    .where(inArray(memberships.id, claimed.map((c) => c.membershipId)));
  await sendPush(rows.filter((r) => r.prefs.push).map((r) => r.userId), e);
}

export function ensureListening() {
  if (!g.__ledgerListening) {
    g.__ledgerListening = client
      .listen("ledger_events", (payload) => {
        try {
          const e = JSON.parse(payload) as LedgerEvent;
          bus.emit(e.workspaceId, e);
          if (e.type === "notification") void deliverPush(e).catch(() => {});
        } catch {
          /* ignore malformed */
        }
      })
      .catch((err) => {
        g.__ledgerListening = undefined;
        console.error("LISTEN failed", err);
      });
  }
  return g.__ledgerListening;
}
