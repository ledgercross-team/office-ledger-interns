// Production entry: serves prerendered/static assets and the Astro SSR handler behind one Node HTTP
// server, so security headers apply to *every* response (including prerendered marketing pages).
import http from "node:http";
import sirv from "sirv";
import { handler as ssrHandler } from "./dist/server/entry.mjs";
import { securityHeaders } from "./server/security-headers.mjs";

const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? "0.0.0.0";

const assets = sirv("dist/client", {
  etag: true,
  setHeaders(res, pathname) {
    if (pathname.startsWith("/_astro/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (pathname === "/sw.js") res.setHeader("Cache-Control", "no-cache");
  },
});

const server = http.createServer((req, res) => {
  for (const [k, v] of Object.entries(securityHeaders())) {
    if (!res.hasHeader(k)) res.setHeader(k, v);
  }
  assets(req, res, () => ssrHandler(req, res));
});

server.listen(port, host, () => console.log(`Office Ledger listening on http://${host}:${port}`));
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
