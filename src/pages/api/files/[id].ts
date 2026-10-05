import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { IMAGE_MIME, readStored, verifyFileSignature } from "@/lib/files";

export const prerender = false;

/** Serves a private file only with a valid, unexpired signature (issued after a permission check). */
export const GET: APIRoute = async ({ params, url }) => {
  const id = params.id!;
  if (!/^[0-9a-f-]{36}$/.test(id) || !verifyFileSignature(id, url.searchParams.get("exp"), url.searchParams.get("sig")))
    return new Response("Link expired", { status: 403 });
  const [f] = await db.select().from(files).where(eq(files.id, id));
  if (!f) return new Response("Not found", { status: 404 });
  const body = await readStored(f.storageKey).catch(() => null);
  if (!body) return new Response("Not found", { status: 404 });
  const inline = IMAGE_MIME.includes(f.mime) || f.mime === "application/pdf";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": f.mime,
      "Content-Length": String(body.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(f.filename)}"`,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
};
