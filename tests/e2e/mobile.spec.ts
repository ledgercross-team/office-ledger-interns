import { expect, test } from "@playwright/test";
import { signIn, users } from "./helpers";

test("phone layout: bottom tabs, drawer navigation, no horizontal scroll", async ({ page }) => {
  await signIn(page, users.manager);
  const tabs = page.getByRole("navigation", { name: "Quick navigation" });
  await expect(tabs).toBeVisible();
  await tabs.getByRole("link", { name: "Tasks" }).click();
  await expect(page).toHaveURL(/\/app\/tasks/);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Calendar" })
    .click();
  await expect(page).toHaveURL(/\/app\/calendar/);
  for (const path of [
    "/app",
    "/app/inbox",
    "/app/attendance",
    "/app/employees",
    "/app/tasks",
    "/app/calendar",
    "/app/performance",
    "/app/settings",
    "/app/me",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
