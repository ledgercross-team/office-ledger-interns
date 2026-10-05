import { ActionError, type ActionAPIContext } from "astro:actions";
import { withWorkspace, type Tx } from "@/db";
import type { WorkspaceContext } from "@/lib/auth-types";
import { can, type Action, type Resource } from "@/lib/permissions";
import { DecisionError } from "@/lib/services/decisions";

export function requireUser(context: ActionAPIContext) {
  const user = context.locals.user;
  if (!user) throw new ActionError({ code: "UNAUTHORIZED", message: "Please sign in again." });
  return user;
}

/** Active membership required; optionally a permission. */
export function requireCtx(context: ActionAPIContext, action?: Action, res?: Resource): WorkspaceContext {
  requireUser(context);
  const ctx = context.locals.ctx;
  if (!ctx || ctx.status !== "active") throw new ActionError({ code: "FORBIDDEN", message: "Your membership is not active." });
  if (action && !can(ctx, action, res)) throw new ActionError({ code: "FORBIDDEN", message: "You don't have permission to do that." });
  return ctx;
}

export function assertCan(ctx: WorkspaceContext, action: Action, res?: Resource) {
  if (!can(ctx, action, res)) throw new ActionError({ code: "FORBIDDEN", message: "You don't have permission to do that." });
}

/** Run inside an RLS-scoped transaction for the caller's workspace. */
export function scoped<T>(ctx: WorkspaceContext, fn: (tx: Tx) => Promise<T>) {
  return withWorkspace(ctx.workspaceId, fn);
}

export const notFound = (what = "Record") => new ActionError({ code: "NOT_FOUND", message: `${what} not found.` });
export const bad = (message: string) => new ActionError({ code: "BAD_REQUEST", message });
export const conflict = (message: string) => new ActionError({ code: "CONFLICT", message });

/** Converts service-layer DecisionErrors into ActionErrors with the same code/message. */
export function mapDecision(e: unknown): never {
  if (e instanceof DecisionError) throw new ActionError({ code: e.code, message: e.message });
  throw e;
}
