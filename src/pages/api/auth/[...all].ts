import type { APIRoute } from "astro";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const prerender = false;

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const GENERIC = { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" };

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export const ALL: APIRoute = async ({ request, clientAddress }) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/auth/, "");
  const sensitive =
    request.method === "POST" &&
    /^\/(sign-in|sign-up|forget-password|request-password-reset|reset-password|two-factor)/.test(path);

  if (sensitive) {
    const rl = await rateLimit("auth", clientIp(request, clientAddress));
    if (!rl.ok)
      return json({ message: "Too many attempts. Please wait a minute and try again." }, 429, {
        "Retry-After": String(rl.retryAfterSec),
      });
  }

  // Account lockout after repeated failures on email sign-in (generic error either way).
  if (request.method === "POST" && path === "/sign-in/email") {
    const body = (await request
      .clone()
      .json()
      .catch(() => ({}))) as { email?: string };
    const email = String(body.email ?? "")
      .toLowerCase()
      .trim();
    const [u] = email
      ? await db.select({ id: users.id, lockedUntil: users.lockedUntil }).from(users).where(eq(users.email, email))
      : [];
    if (u?.lockedUntil && u.lockedUntil > new Date()) return json(GENERIC, 401);
    const res = await auth.handler(request);
    if (u) {
      if (res.status === 401) {
        await db
          .update(users)
          .set({
            failedLoginCount: sql`${users.failedLoginCount} + 1`,
            lockedUntil: sql`case when ${users.failedLoginCount} + 1 >= ${LOCK_AFTER} then now() + make_interval(mins => ${LOCK_MINUTES}) else null end`,
          })
          .where(eq(users.id, u.id));
        return json(GENERIC, 401);
      }
      if (res.ok) await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, u.id));
    }
    return res;
  }
  return auth.handler(request);
};
