import { defineMiddleware } from "astro:middleware";
import { securityHeaders } from "../server/security-headers.mjs";
import { auth } from "@/lib/auth";
import type { SessionUser, ThemeMode } from "@/lib/auth-types";
import { resolveContext } from "@/lib/context";
import { routeAllowed } from "@/lib/permissions";
import { isProd } from "@/lib/env";
import { startJobs } from "@/lib/jobs";

const PUBLIC_AUTH = ["/auth/sign-in", "/auth/sign-up", "/auth/forgot", "/auth/reset", "/auth/verify", "/auth/two-factor"];

startJobs();

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request, locals, cookies, redirect } = context;
  const path = url.pathname;
  locals.nonce = crypto.randomUUID().replace(/-/g, "");
  locals.user = null;
  locals.session = null;
  locals.ctx = null;

  const isAsset = path.startsWith("/_astro/") || path.startsWith("/@") || path.startsWith("/node_modules/");
  if (!context.isPrerendered && !isAsset && !path.startsWith("/api/auth")) {
    const result = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (result?.user) {
      const u = result.user as typeof result.user & { theme?: ThemeMode; activeWorkspaceId?: string | null; twoFactorEnabled?: boolean | null };
      locals.user = {
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified,
        image: u.image ?? null,
        theme: (cookies.get("theme")?.value as ThemeMode | undefined) ?? u.theme ?? "system",
        twoFactorEnabled: !!u.twoFactorEnabled,
      } satisfies SessionUser;
      locals.session = { id: result.session.id, expiresAt: result.session.expiresAt };
      if (path.startsWith("/app") || path.startsWith("/auth") || path.startsWith("/_actions") || path.startsWith("/api/")) {
        locals.ctx = await resolveContext(u.id, u.activeWorkspaceId ?? null);
      }
      if (!cookies.get("theme") && u.theme) cookies.set("theme", u.theme, { path: "/", sameSite: "lax", maxAge: 31536000 });
    }
  }

  // ---- Route guards ----------------------------------------------------------------------------
  const { user, ctx } = locals;
  if (path === "/app" || path.startsWith("/app/")) {
    if (!user) return redirect(`/auth/sign-in?next=${encodeURIComponent(path + url.search)}`);
    if (!ctx || ctx.status === "rejected" || ctx.status === "deactivated") return redirect("/auth/join");
    if (ctx.status === "pending") return redirect("/auth/pending");
    if (!ctx.onboarded && ctx.role === "owner") return redirect("/auth/setup");
    if (!routeAllowed(ctx, path)) return context.rewrite("/403");
  } else if (user && ctx?.status === "active" && PUBLIC_AUTH.some((p) => path.startsWith(p)) && path !== "/auth/reset") {
    return redirect("/app");
  }

  let response = await next();

  // ---- Security headers ------------------------------------------------------------------------
  const isHtml = response.headers.get("content-type")?.includes("text/html");
  if (isHtml && !context.isPrerendered) {
    // Give every script tag in SSR HTML the request nonce (CSP script-src 'nonce-…' 'strict-dynamic').
    const html = await response.text();
    const withNonce = html.replace(/<script(?![^>]*\snonce=)/g, `<script nonce="${locals.nonce}"`);
    response = new Response(withNonce, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const headers = securityHeaders({ nonce: isHtml && !context.isPrerendered ? locals.nonce : undefined, dev: !isProd });
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  if (path.startsWith("/app") || path.startsWith("/auth") || path.startsWith("/api") || path.startsWith("/_actions")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    if (isHtml) response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
});
