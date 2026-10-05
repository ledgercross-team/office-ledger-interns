import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("/sitemap-index.xml", site).href;
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /app/",
    "Disallow: /auth/",
    "Disallow: /api/",
    "Disallow: /_actions/",
    "",
    `Sitemap: ${sitemap}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
