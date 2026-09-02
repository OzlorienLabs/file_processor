import { expect, test } from '@playwright/test';

test.describe('creator tools', () => {
  test('diff checker compares two texts in the browser', async ({ page }) => {
    await page.goto('/en/diff');
    await page.getByLabel('Original text').fill('alpha\nbeta\ngamma');
    await page.getByLabel('Changed text').fill('alpha\nbeta two\ngamma\ndelta');
    await page.getByRole('button', { name: /find difference/i }).click();

    const result = page.getByRole('region', { name: /comparison result/i });
    await expect(result.getByRole('status')).toContainText('2 change blocks');
    await expect(result.locator('mark', { hasText: 'two' })).toBeVisible();

    await page.getByRole('button', { name: /^unified$/i }).click();
    await expect(result.getByRole('row')).toHaveCount(5);
  });

  test('notepad keeps notes across reloads and previews Markdown', async ({ page }) => {
    await page.goto('/en/notepad');
    await page.getByLabel('Note format').selectOption('markdown');
    await page.getByLabel('Note title').fill('Shopping');
    await page.getByLabel('Note', { exact: true }).fill('# Groceries\n\n- milk\n- bread');
    await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('complementary', { name: /saved notes/i }).getByRole('button', { name: /shopping/i })).toBeVisible();
    await expect(page.getByLabel('Note', { exact: true })).toHaveValue('# Groceries\n\n- milk\n- bread');
    expect(await page.evaluate(() => localStorage.getItem('filekit.notes.v1'))).toContain('Shopping');
  });

  test('markdown previewer renders as you type', async ({ page }) => {
    await page.goto('/en/markdown');
    await page.getByRole('button', { name: /^clear$/i }).click();
    await page.getByLabel('Markdown', { exact: true }).fill('## Live\n\n| a | b |\n| - | - |\n| 1 | 2 |');
    await expect(page.getByRole('heading', { level: 2, name: 'Live' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('mermaid editor renders a real diagram and reports syntax errors', async ({ page }) => {
    await page.goto('/en/mermaid');
    const preview = page.getByRole('img', { name: /rendered mermaid diagram/i });
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('status')).toContainText(/diagram up to date/i);

    await page.getByLabel('Mermaid code').fill('flowchart TD\n  A --> ');
    await expect(page.getByRole('alert')).toContainText(/showing the last diagram/i, { timeout: 10_000 });
  });

  test('snippet manager saves highlighted code locally', async ({ page }) => {
    await page.goto('/en/snippets');
    await page.getByLabel('Snippet title').fill('Hello');
    await page.getByLabel('Language', { exact: true }).selectOption('javascript');
    await page.getByLabel('Code', { exact: true }).fill('const hello = () => "hi";');
    await page.getByRole('button', { name: /save snippet/i }).click();

    await expect(page.locator('.hljs-keyword', { hasText: 'const' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('complementary', { name: /saved snippets/i }).getByRole('button', { name: /hello/i })).toBeVisible();
  });

  test('diagram creator loads the whiteboard with a clean console', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto('/en/diagram');
    await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText(/not saved yet/i);
    expect(consoleErrors).toEqual([]);
  });

  test('snippet generator explains the on-device option and accepts a provider key', async ({ page }) => {
    await page.goto('/en/snippet-generator');
    await expect(page.getByRole('radio', { name: /chrome built-in ai/i })).toBeVisible();
    await page.getByRole('radio', { name: /^cloud provider with your api key/i }).check();
    await page.getByLabel('API key', { exact: true }).fill('sk-e2e');
    await page.getByLabel(/describe the snippet/i).fill('a hello world');
    await expect(page.getByRole('button', { name: /generate snippet/i })).toBeEnabled();
  });
});
