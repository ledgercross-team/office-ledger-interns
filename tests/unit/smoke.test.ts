import { describe, expect, it } from "vitest";
import { securityHeaders } from "../../server/security-headers.mjs";

describe("security headers", () => {
  it("adds a nonce-based CSP", () => {
    const h = securityHeaders({ nonce: "abc" });
    expect(h["Content-Security-Policy"]).toContain("'nonce-abc'");
    expect(h["X-Frame-Options"]).toBe("DENY");
  });
});
