import type { APIRoute } from "astro";

export const prerender = false;

/** https://w3c.github.io/webappsec-change-password-url/ */
export const GET: APIRoute = ({ redirect }) => redirect("/auth/forgot", 302);
