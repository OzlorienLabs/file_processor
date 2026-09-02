import { expect, test } from '@playwright/test';

import { coreTools } from '../src/app/tool-catalog';

test.describe('home and navigation', () => {
  test('lists every tool, keeps a clean console, and navigates to a tool page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Result out.');
    await expect(page.getByTestId('tool-card')).toHaveCount(coreTools.length);

    await page.getByTestId('tool-card').filter({ hasText: 'Merge PDF' }).click();
    await expect(page).toHaveURL(/\/en\/merge$/);
    await expect(page.getByRole('heading', { name: 'Merge PDF', exact: true })).toBeVisible();
    await expect(page.getByRole('main', { name: /merge pdf workspace/i })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('redirects the root to /en and recovers unknown routes', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);

    await page.goto('/en/definitely-not-a-tool');
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
    await page.getByRole('link', { name: /back to all tools/i }).click();
    await expect(page).toHaveURL(/\/en$/);
  });

  test('has no horizontal overflow on small screens', async ({ page }) => {
    await page.goto('/en');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
