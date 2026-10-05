import { expect, test } from "@playwright/test";
import { signIn, users } from "./helpers";

const ALL = [
  ["/app", /operations|Good to see you/i],
  ["/app/inbox", /Things needing attention/],
  ["/app/employees", /Employees/],
  ["/app/attendance", /Today's attendance/],
  ["/app/leave", /leave/i],
  ["/app/tasks", /Taskboard/],
  ["/app/calendar", /Calendar/],
  ["/app/performance", /performance/i],
  ["/app/reports/daily", /End-of-day summary/],
  ["/app/complaints", /issue/i],
  ["/app/settings", /Workspace Settings/],
  ["/app/settings/audit", /Audit log/],
  ["/app/me", /Tanvir|Nadia|Arif/],
] as const;

const matrix: Record<keyof Pick<typeof users, "owner" | "manager" | "employee">, string[]> = {
  owner: [],
  manager: ["/app/settings/audit"],
  employee: ["/app/inbox", "/app/employees", "/app/reports/daily", "/app/settings", "/app/settings/audit"],
};

for (const role of ["owner", "manager", "employee"] as const) {
  test(`${role} can reach allowed pages and is blocked from the rest`, async ({ page }) => {
    await signIn(page, users[role]);
    const blocked = matrix[role];
    for (const [path, heading] of ALL) {
      const res = await page.goto(path);
      if (blocked.includes(path)) {
        expect(res?.status(), path).toBe(403);
        await expect(page.getByRole("heading", { name: /don't have access/i })).toBeVisible();
      } else {
        expect(res?.status(), path).toBe(200);
        await expect(page.getByRole("heading", { level: 1 }).first(), path).toHaveText(heading);
      }
    }
    // Sidebar shows only what the role can use
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    if (role === "employee") {
      await expect(nav.getByRole("link", { name: "Inbox" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
    } else {
      await expect(nav.getByRole("link", { name: /Inbox/ })).toBeVisible();
    }
  });
}

test("signed-out users are sent to sign in", async ({ page }) => {
  await page.goto("/app/inbox");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fapp%2Finbox/);
});

test("server rejects actions the role can't perform", async ({ page }) => {
  await signIn(page, users.employee);
  const res = await page.request.post("/_actions/settings.scoring", {
    data: { late: 9, absent: 0, missingCheckout: 0, halfDay: 0 },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(403);
});
