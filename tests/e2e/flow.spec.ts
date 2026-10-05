import { expect, test } from "@playwright/test";
import { signIn, sql, users } from "./helpers";

test.describe.configure({ mode: "serial" });

const reason = `E2E family visit ${Date.now()}`;

test.beforeAll(async () => {
  // Make sure Kamal has no attendance today and no leave in the window we'll request.
  const db = sql();
  await db`delete from attendance a using memberships m, users u
           where a.membership_id = m.id and m.user_id = u.id and u.email = ${users.kamal}
             and a.date = (now() at time zone 'Asia/Dhaka')::date`;
  await db.end();
});

test("employee checks in from the attendance page", async ({ page }) => {
  await signIn(page, users.kamal);
  await page.goto("/app/attendance");
  await page.getByRole("radio", { name: /Office/ }).click();
  await page.getByRole("button", { name: /^Check in ·/ }).click();
  await expect(page.getByText(/You're checked in/)).toBeVisible();
});

test("employee requests leave and a manager approves it from the Inbox", async ({ page, browser }) => {
  await signIn(page, users.kamal);
  await page.goto("/app/leave?new=1");
  const dialog = page.getByRole("dialog", { name: "Request leave" });
  await expect(dialog).toBeVisible();
  // Two weeks out keeps clear of seeded leave
  const d = new Date(Date.now() + 14 * 86400_000);
  while ([5, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  const iso = d.toISOString().slice(0, 10);
  await dialog.getByLabel("From").fill(iso);
  await dialog.getByLabel("To").fill(iso);
  await dialog.getByLabel("Reason").fill(reason);
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Request sent/)).toBeVisible();

  const manager = await browser.newPage();
  await signIn(manager, users.manager);
  await manager.goto("/app/inbox");
  const card = manager.locator("article", { hasText: reason });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card).toHaveCount(0);

  const db = sql();
  const [row] = await db`select status from leave_requests where reason = ${reason}`;
  const [att] =
    await db`select a.status from attendance a join leave_requests l on l.membership_id = a.membership_id and a.date = l.start_date where l.reason = ${reason}`;
  await db.end();
  expect(row?.status).toBe("approved");
  expect(att?.status).toBe("on_leave");

  // The employee sees the decision
  await page.goto("/app/leave");
  await page.getByRole("button", { name: "approved", exact: true }).click();
  await expect(page.getByText(reason)).toBeVisible();
});
