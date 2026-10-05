import { describe, expect, it } from "vitest";
import { securityHeaders } from "../../server/security-headers.mjs";

describe("security headers", () => {
  it("adds a nonce-based CSP", () => {
    const h = securityHeaders({ nonce: "abc" });
    expect(h["Content-Security-Policy"]).toContain("'nonce-abc'");
    expect(h["X-Frame-Options"]).toBe("DENY");
  });
  it("only sends HSTS and upgrade-insecure-requests for HTTPS sites", () => {
    expect(securityHeaders({ https: false })["Strict-Transport-Security"]).toBeUndefined();
    const h = securityHeaders({ https: true });
    expect(h["Strict-Transport-Security"]).toContain("max-age");
    expect(h["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
  });
});
