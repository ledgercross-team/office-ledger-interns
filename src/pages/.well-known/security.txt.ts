import type { APIRoute } from "astro";

export const prerender = true;

/** RFC 9116. Expires is set one year from the build. */
export const GET: APIRoute = ({ site }) => {
  const host = new URL(site!).host;
  const expires = new Date(Date.now() + 365 * 86400_000).toISOString();
  const body = [
    `Contact: mailto:security@${host}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en, bn",
    `Canonical: ${new URL("/.well-known/security.txt", site).href}`,
    `Policy: ${new URL("/privacy#security", site).href}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
