import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('design-system gallery renders both themes and passes axe', async ({ page }) => {
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { level: 1, name: 'Office Ledger design system' })).toBeVisible();
  await expect(page.getByTestId('light-gallery')).toBeVisible();
  await expect(page.getByTestId('dark-gallery')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data table' }).first()).toBeVisible();

  // Each theme gallery repeats the same landmarks (breadcrumbs, pagination,
  // toast viewport), so analyze them separately for real per-theme coverage.
  for (const theme of ['light', 'dark'] as const) {
    const results = await new AxeBuilder({ page }).include(`[data-testid="${theme}-gallery"]`).analyze();
    expect(results.violations).toEqual([]);
  }
});
