# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: theme.spec.ts >> a saved theme applies before paint and the system scheme is followed otherwise
- Location: e2e/theme.spec.ts:3:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "rgb(14, 22, 19)"
Received: "rgb(246, 248, 247)"
```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - paragraph [ref=e4]: office-ledger
    - heading "Log in" [level=1] [ref=e5]
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: Email*
        - textbox "Email" [ref=e10]
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: Password*
          - textbox "Password" [ref=e14]
        - generic [ref=e15]:
          - button "Show password" [ref=e16]
          - link "Forgot password?" [ref=e20] [cursor=pointer]:
            - /url: /forgot-password
      - button "Log in" [ref=e21]
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test('a saved theme applies before paint and the system scheme is followed otherwise', async ({ page }) => {
  4  |   await page.addInitScript(() => window.localStorage.setItem('ol-theme', 'dark'));
  5  |   await page.emulateMedia({ colorScheme: 'light' });
  6  |   await page.goto('/login');
  7  |   await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  8  |   const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
> 9  |   expect(bg).toBe('rgb(14, 22, 19)');
     |              ^ Error: expect(received).toBe(expected) // Object.is equality
  10 | });
  11 | 
  12 | test('unknown routes show the full-page not-found state', async ({ page }) => {
  13 |   await page.goto('/this-route-does-not-exist');
  14 |   await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page." })).toBeVisible();
  15 |   await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
  16 | });
  17 | 
```