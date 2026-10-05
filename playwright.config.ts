import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4400);
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: "pnpm build && node server.mjs",
    url: BASE,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      PUBLIC_SITE_URL: BASE,
      BETTER_AUTH_URL: BASE,
      JOBS_ENABLED: "false",
      NODE_ENV: "production",
      RATE_LIMIT_AUTH_PER_MIN: "1000",
    },
  },
});
