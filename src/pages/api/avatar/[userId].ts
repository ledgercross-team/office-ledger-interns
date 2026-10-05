import type { APIRoute } from "astro";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { files, memberships } from "@/db/schema";
import { readStored } from "@/lib/files";

export const prerender = false;

/** Avatar images: visible to signed-in users who share a workspace with the avatar's owner. */
export const GET: APIRoute = async ({ params, locals }) => {
  const viewer = locals.user;
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const target = params.userId!;
  const viewerWs = (await db.select({ ws: memberships.workspaceId }).from(memberships).where(eq(memberships.userId, viewer.id))).map((r) => r.ws);
  if (!viewerWs.length) return new Response("Forbidden", { status: 403 });
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, target), inArray(memberships.workspaceId, viewerWs)));
  if (!m) return new Response("Forbidden", { status: 403 });
  const owned = (await db.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, target))).map((r) => r.id);
  const [f] = await db
    .select()
    .from(files)
    .where(and(eq(files.kind, "avatar"), inArray(files.ownerMembershipId, owned)))
    .orderBy(desc(files.createdAt))
    .limit(1);
  if (!f) return new Response("Not found", { status: 404 });
  const body = await readStored(f.storageKey).catch(() => null);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
};
