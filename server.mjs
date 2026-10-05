// Production entry: serves prerendered/static assets and the Astro SSR handler behind one Node HTTP
// server, so security headers apply to *every* response (including prerendered marketing pages).
import http from "node:http";
import { statSync } from "node:fs";
import { join, normalize } from "node:path";
import sirv from "sirv";
import compression from "compression";
import { handler as ssrHandler } from "./dist/server/entry.mjs";
import { securityHeaders } from "./server/security-headers.mjs";

const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? "0.0.0.0";

const assets = sirv("dist/client", {
  etag: true,
  setHeaders(res, pathname) {
    if (pathname.startsWith("/_astro/"))
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (pathname === "/sw.js") res.setHeader("Cache-Control", "no-cache");
  },
});

const CLIENT = join(process.cwd(), "dist/client");

/** True if the request maps to an existing static file (guards against stale indexes after a redeploy). */
function isStatic(url = "/") {
  try {
    const path = decodeURIComponent(url.split("?")[0]);
    const file = normalize(join(CLIENT, path));
    if (!file.startsWith(CLIENT)) return false;
    const st = statSync(file, { throwIfNoEntry: false });
    if (st?.isFile()) return true;
    return !!statSync(join(file, "index.html"), { throwIfNoEntry: false })?.isFile();
  } catch {
    return false;
  }
}

// gzip/brotli for HTML, CSS, JS and JSON; Server-Sent Events are never buffered.
const compress = compression({
  filter: (req, res) => !String(req.url).startsWith("/api/stream") && compression.filter(req, res),
});

const server = http.createServer((req, res) => {
  for (const [k, v] of Object.entries(securityHeaders())) {
    if (!res.hasHeader(k)) res.setHeader(k, v);
  }
  compress(req, res, () => {
    if (isStatic(req.url)) assets(req, res, () => ssrHandler(req, res));
    else ssrHandler(req, res);
  });
});
server.on("clientError", (_err, socket) => socket.destroy());

server.listen(port, host, () => console.log(`Office Ledger listening on http://${host}:${port}`));
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
