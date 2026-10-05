import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import "dotenv/config";

export const PASSWORD = "Ledger#2026";
export const users = {
  owner: "owner@ledgercross.test",
  manager: "manager@ledgercross.test",
  employee: "employee@ledgercross.test",
  kamal: "kamal@ledgercross.test",
} as const;

export const sql = () =>
  postgres(process.env.DATABASE_URL ?? "postgres://ledger:ledger@localhost:5432/office_ledger", {
    max: 1,
    onnotice: () => {},
  });

/** Signs in through the real form. */
export async function signIn(page: Page, email: string) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: false }).first().fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app(\/|$)/);
  await expect(page.locator("#main")).toBeVisible();
}
