// Shared by src/middleware.ts (SSR responses, with a per-request nonce) and server.mjs (static files).

/**
 * @param {{ nonce?: string, dev?: boolean, https?: boolean }} [opts]
 * @returns {Record<string, string>}
 */
export function securityHeaders(opts = {}) {
  const { nonce, dev = false } = opts;
  // HSTS / upgrade-insecure-requests only make sense when the public site is served over HTTPS.
  const https = opts.https ?? (process.env.PUBLIC_SITE_URL ?? "").startsWith("https://");
  const scriptSrc = nonce ? `'self' 'nonce-${nonce}' 'strict-dynamic'` : "'self'";
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are emitted by React/Recharts; styles cannot execute script.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(!dev && https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    ...(https ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" } : {}),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Frame-Options": "DENY",
  };
}
