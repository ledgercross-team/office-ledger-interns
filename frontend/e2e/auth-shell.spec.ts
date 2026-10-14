import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.HRMS_TEST_PASSWORD;
const API = process.env.HRMS_TEST_API_URL ?? 'http://localhost:4000/api';

test.skip(!PASSWORD, 'HRMS_TEST_PASSWORD is not set (seeded backend required)');

// The API's CORS allow-list covers http://localhost:3000 (not 127.0.0.1).
test.use({ baseURL: 'http://localhost:3000' });

function email(local: string): string {
  return `${local}@demo.local`;
}

async function expectNavItem(page: Page, name: string, present: boolean): Promise<void> {
  if (present) await expect(page.getByRole('link', { name }).first()).toBeVisible();
  else await expect(page.getByRole('link', { name })).toHaveCount(0);
}

/**
 * Session setup without page loads: strict-path POSTs only, no 401/refresh
 * chatter. Cookies move from the API request context into the browser.
 */
async function transferCookies(page: Page, setCookies: string[]): Promise<void> {
  const cookies = setCookies.map((header) => {
    const parts = header.split(';').map((part) => part.trim());
    const [name, ...rest] = parts[0].split('=');
    const cookie: {
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Lax' | 'Strict' | 'None';
    } = {
      name,
      value: rest.join('='),
      domain: 'localhost',
      path: '/',
    };
    for (const part of parts.slice(1)) {
      const [key, value] = part.split('=');
      if (/^expires$/i.test(key) && value)
        cookie.expires = Math.floor(new Date(value).getTime() / 1000);
      else if (/^httponly$/i.test(key)) cookie.httpOnly = true;
      else if (/^secure$/i.test(key)) cookie.secure = true;
      else if (/^samesite$/i.test(key) && value)
        cookie.sameSite = value as 'Lax' | 'Strict' | 'None';
    }
    return cookie;
  });
  await page.context().addCookies(cookies);
}

async function apiLogin(page: Page, local: string): Promise<void> {
  const response = await page.request.post(`${API}/auth/login`, {
    data: { email: email(local), password: PASSWORD! },
  });
  if (!response.ok()) throw new Error(`setup login failed: ${response.status}`);
  const setCookies = response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  await transferCookies(page, setCookies);
}

test('wrong password shows the inline error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email('manager1.acme'));
  await page.getByLabel('Password').fill('definitely-wrong-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
});

const FULL_NAV: Record<string, string[]> = {
  ceo: [
    'Dashboard',
    'Requests',
    'Projects',
    'Tasks',
    'Messages',
    'Invites',
    'People',
    'Attendance',
    'Leave',
    'Calendar',
    'Workload',
    'Performance',
    'History',
    'Settings',
  ],
  manager: [
    'Dashboard',
    'Requests',
    'Projects',
    'Tasks',
    'Messages',
    'Invites',
    'People',
    'Attendance',
    'Leave',
    'Calendar',
    'Workload',
    'Ratings',
  ],
  employee: [
    'Dashboard',
    'Requests',
    'Projects',
    'Tasks',
    'Messages',
    'Invites',
    'Attendance',
    'Leave',
    'Calendar',
    'Ratings',
  ],
};

const TAB_NAV: Record<string, string[]> = {
  ceo: ['Dashboard', 'Requests', 'Projects', 'Tasks'],
  manager: ['Dashboard', 'Tasks', 'Requests', 'Projects'],
  employee: ['Dashboard', 'Tasks', 'Leave', 'Requests'],
};

/** Desktop asserts the full sidebar; mobile asserts the bottom tab surface. */
function surfaceItems(role: string, project: string): string[] {
  return project === 'mobile-chromium' ? TAB_NAV[role] : FULL_NAV[role];
}

test('CEO sees only CEO nav', async ({ page }, testInfo) => {
  await apiLogin(page, 'ceo.globex');
  await page.goto('/');
  for (const name of surfaceItems('ceo', testInfo.project.name)) {
    await expectNavItem(page, name, true);
  }
  for (const name of ['Ratings', 'Platform console']) {
    await expectNavItem(page, name, false);
  }
});

test('manager sees only manager nav', async ({ page }, testInfo) => {
  await apiLogin(page, 'manager1.acme');
  await page.goto('/');
  for (const name of surfaceItems('manager', testInfo.project.name)) {
    await expectNavItem(page, name, true);
  }
  for (const name of ['Performance', 'History', 'Settings']) {
    await expectNavItem(page, name, false);
  }
});

test('employee sees only employee nav', async ({ page }, testInfo) => {
  await apiLogin(page, 'employee1.acme');
  await page.goto('/');
  for (const name of surfaceItems('employee', testInfo.project.name)) {
    await expectNavItem(page, name, true);
  }
  for (const name of ['People', 'Workload', 'Performance', 'History', 'Settings']) {
    await expectNavItem(page, name, false);
  }
});

async function expectNoSeriousAxe(page: Page): Promise<void> {
  // UI-SPEC §12 gates on "no serious issues". The body-level skip link is
  // intentionally the first tab stop, which the moderate `region` rule flags.
  // Retry once: dev HMR can reload the page mid-analysis.
  let violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'];
  try {
    ({ violations } = await new AxeBuilder({ page }).analyze());
  } catch {
    await page.waitForTimeout(2000);
    ({ violations } = await new AxeBuilder({ page }).analyze());
  }
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('auth and shell pages pass axe', async ({ page }) => {
  await apiLogin(page, 'manager1.acme');
  {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Mira Hossain' })).toBeVisible();
    await expectNoSeriousAxe(page);
    await page.goto('/forgot-password');
    await expectNoSeriousAxe(page);
    await page.goto('/accept-invite?token=demo');
    await expectNoSeriousAxe(page);
    await page.goto('/change-password');
    await expectNoSeriousAxe(page);
  }
  await page.goto('/login');
  await expectNoSeriousAxe(page);
});

test('two-org user picks an org and switches', async ({ page }) => {
  test.setTimeout(300_000);
  // Spread strict-path calls (shared 10/min auth budget) so early POSTs age
  // out of the sliding window before the two switches below.
  await page.waitForTimeout(45_000);
  await apiLogin(page, 'multi');
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Choose an organisation' })).toBeVisible();
  await expect(page.getByText('Acme Demo')).toBeVisible();
  await expect(page.getByText('Globex Demo')).toBeVisible();
  await page
    .locator('li', { hasText: 'Globex Demo' })
    .getByRole('button', { name: 'Continue' })
    .click();
  await expect(page.getByRole('heading', { name: 'Lena Multi' })).toBeVisible();
  await expect(
    page.getByText('Globex Demo', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  // Switch back through the account menu, retrying past rate-limit cool-downs.
  const acmeVisible = page
    .getByText('Acme Demo', { exact: true })
    .filter({ visible: true })
    .first();
  let switched = false;
  for (let attempt = 0; attempt < 3 && !switched; attempt++) {
    if (attempt > 0) await page.waitForTimeout(65_000);
    await page.getByRole('button', { name: /Account:/ }).click();
    await page.getByRole('menuitemcheckbox', { name: /Switch to Acme Demo/ }).click();
    switched = await acmeVisible
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
  }
  expect(switched).toBe(true);
});
