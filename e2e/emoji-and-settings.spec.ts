import { expect, test } from '@playwright/test';

test.describe('emoji library', () => {
  test('loads the full catalog lazily and copies on click', async ({ page, context, browserName }) => {
    await page.goto('/en/emojis');
    await expect(page.getByText(/3,944 emoji shown/)).toBeVisible();

    await page.getByLabel(/search by name/i).fill('grinning face');
    await expect(page.getByText(/emoji shown/)).not.toHaveText('3,944 emoji shown.');

    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.getByRole('button', { name: /^copy grinning face$/i }).click();
      await expect(page.getByText(/copied 😀/i)).toBeVisible();
    }
  });
});

test.describe('AI settings safety', () => {
  test('masks the key, persists by default, and forgets on request', async ({ page }) => {
    await page.goto('/en/summarize');
    await page.getByLabel('Choose a file to summarize').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Some notes to summarize.'),
    });

    const keyField = page.getByLabel('API key', { exact: true });
    await expect(keyField).toHaveAttribute('type', 'password');
    await keyField.fill('sk-test-persisted');

    await page.reload();
    await page.getByLabel('Choose a file to summarize').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Some notes to summarize.'),
    });
    await expect(page.getByLabel('API key', { exact: true })).toHaveValue('sk-test-persisted');

    await page.getByRole('button', { name: /forget key on this device/i }).click();
    const stored = await page.evaluate(() => localStorage.getItem('filekit.ai.v1'));
    expect(stored).toBeNull();
  });
});
