import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { JOBS, runJobs, type JobName } from "@/lib/jobs";

export const prerender = false;

/** Platform cron entry: POST /api/cron/<job|all> with `Authorization: Bearer $CRON_SECRET`. */
export const POST: APIRoute = async ({ params, request }) => {
  const given = Buffer.from((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const secret = Buffer.from(env.CRON_SECRET);
  if (!env.CRON_SECRET || given.length !== secret.length || !timingSafeEqual(given, secret))
    return new Response("Unauthorized", { status: 401 });
  const job = params.job === "all" ? undefined : (params.job as JobName);
  if (job && !JOBS.includes(job)) return new Response("Unknown job", { status: 404 });
  const done = await runJobs(job);
  return new Response(JSON.stringify({ ok: true, done }), {
    headers: { "Content-Type": "application/json" },
  });
};
