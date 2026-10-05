/**
 * Captures marketing screenshots from a running dev server with seeded data.
 * Usage: pnpm dev & pnpm tsx scripts/capture-screenshots.ts
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:4321";
const shots: { email: string; path: string; name: string; theme: "light" | "dark" }[] = [
  { email: "owner@ledgercross.test", path: "/app", name: "dashboard-light", theme: "light" },
  { email: "owner@ledgercross.test", path: "/app", name: "dashboard-dark", theme: "dark" },
  { email: "manager@ledgercross.test", path: "/app/inbox", name: "inbox", theme: "light" },
  { email: "manager@ledgercross.test", path: "/app/tasks", name: "tasks", theme: "light" },
  { email: "owner@ledgercross.test", path: "/app/performance", name: "performance", theme: "light" },
  { email: "employee@ledgercross.test", path: "/app/attendance", name: "attendance", theme: "light" },
];

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: s.theme,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: s.email, password: "Ledger#2026" },
    headers: { Origin: BASE },
  });
  await page.goto(BASE + s.path, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `src/assets/screens/${s.name}.png` });
  await ctx.close();
  console.log("captured", s.name);
}
await browser.close();
