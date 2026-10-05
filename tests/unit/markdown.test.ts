import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown", () => {
  it("renders markdown and strips scripts and javascript: links", () => {
    const html = renderMarkdown("**hi** <script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>");
    expect(html).toContain("<strong>hi</strong>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
  });
});
