import { expect, test } from "@playwright/test";

test("landing page is indexable and has structured data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Run the office day");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /og-default\.png$/);
  const types = await page.locator('script[type="application/ld+json"]').allTextContents();
  const joined = types.join(" ");
  for (const t of ["Organization", "WebSite", "SoftwareApplication", "FAQPage"]) expect(joined).toContain(t);
});

test("app and auth pages are noindex", async ({ page }) => {
  const res = await page.goto("/auth/sign-in");
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

test("platform files are served", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /app/");
  expect(robots).toContain("sitemap-index.xml");
  expect((await request.get("/sitemap-index.xml")).ok()).toBeTruthy();
  const sitemap = await (await request.get("/sitemap-0.xml")).text();
  expect(sitemap).toContain("/features");
  expect(sitemap).not.toContain("/app");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.start_url).toBe("/app");
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBeTruthy();
  expect(await (await request.get("/.well-known/security.txt")).text()).toContain("Expires:");
  for (const f of [
    "/favicon.ico",
    "/favicon.svg",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/og-default.png",
    "/sw.js",
    "/humans.txt",
  ]) {
    expect((await request.get(f)).status(), f).toBe(200);
  }
  const res = await request.get("/", { maxRedirects: 0 });
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});
