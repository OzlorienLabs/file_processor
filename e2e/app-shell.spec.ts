import { expect, test, type Page } from '@playwright/test';

import { coreTools, toolCounts } from '../src/app/tool-catalog';

const UI_KEY = 'filekit.ui.v1';

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: /settings/i })).toBeVisible();
}

test.describe('app shell', () => {
  test('every tool route opens into the shell and renders its own workspace', async ({ page }) => {
    for (const tool of coreTools) {
      await page.goto(tool.path);
      await expect(page.getByRole('heading', { level: 1, name: tool.name })).toBeVisible();
      await expect(page.getByRole('navigation', { name: /all tools/i })).toBeVisible();
      await expect(page.getByRole('main', { name: `${tool.name} workspace` })).toBeVisible();
    }
  });

  test('the rail marks the open tool and navigates to another', async ({ page, isMobile }) => {
    await page.goto('/en/merge');
    const rail = page.getByRole('navigation', { name: /all tools/i });
    await expect(rail.getByRole('link', { name: 'Merge PDF' })).toHaveAttribute('aria-current', 'page');

    // Under 1000px the rail is icons only, so the name is the accessible name alone.
    await rail.getByRole('link', { name: isMobile ? 'Split PDF' : 'Split PDF' }).click();
    await expect(page).toHaveURL(/\/en\/split$/);
    await expect(rail.getByRole('link', { name: 'Split PDF' })).toHaveAttribute('aria-current', 'page');
  });

  test('the quick-instructions panel carries the disclosure without moving the workspace', async ({ page }) => {
    await page.goto('/en/merge');
    const workspace = page.getByRole('main', { name: /merge pdf workspace/i });
    const before = await workspace.boundingBox();

    await page.getByRole('button', { name: /runs in your browser/i }).click();
    await expect(page.getByRole('heading', { name: /how to merge pdfs/i })).toBeVisible();
    await expect(page.getByText(/your files stay on this device/i)).toBeVisible();
    expect((await workspace.boundingBox())?.y).toBe(before?.y);
  });

  test('every settings toggle survives a reload', async ({ page, isMobile }) => {
    await page.goto('/en/markdown');
    await openSettings(page);

    await page.getByRole('checkbox', { name: /open tools full screen/i }).check();
    await page.getByRole('checkbox', { name: /show tool names in the rail/i }).uncheck();
    await page.getByRole('checkbox', { name: /glass surfaces/i }).uncheck();
    await page.getByRole('checkbox', { name: /reduce motion/i }).check();
    await expect(page.locator('html')).toHaveClass(/flat/);
    await expect(page.locator('html')).toHaveClass(/calm/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/flat/);
    await expect(page.locator('html')).toHaveClass(/calm/);
    await expect(page.getByRole('navigation', { name: /all tools/i })).toHaveAttribute('data-labels', 'false');

    const stored = await page.evaluate((key) => localStorage.getItem(key), UI_KEY);
    expect(stored).toContain('"fullscreenDefault":true');
    expect(stored).toContain('"glass":false');

    await openSettings(page);
    await page.getByRole('checkbox', { name: /show tool names in the rail/i }).check();
    await expect(page.getByRole('navigation', { name: /all tools/i })).toHaveAttribute(
      'data-labels',
      isMobile ? 'false' : 'true',
    );
  });

  test('glass off draws the flat fallback panels', async ({ page }) => {
    await page.goto('/en/markdown');
    const bar = page.locator('.ed-bar').first();
    const glass = await bar.evaluate((node) => getComputedStyle(node).backdropFilter);

    await openSettings(page);
    await page.getByRole('checkbox', { name: /glass surfaces/i }).uncheck();
    await page.getByRole('button', { name: /^close$/i }).click();

    const flat = await bar.evaluate((node) => getComputedStyle(node).backdropFilter);
    expect(flat).toBe('none');
    expect(flat).not.toBe(glass);
    await expect(bar).toHaveCSS('background-color', 'rgb(248, 244, 244)');
  });

  test('the full screen control reports the browser state', async ({ page }) => {
    await page.goto('/en/diff');
    const button = page.getByRole('button', { name: 'Full screen' });
    await expect(button).toBeVisible();

    await button.click();
    await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();

    // Leaving fullscreen outside the button must still correct the label.
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
  });
});

test.describe('landing page', () => {
  test('derives its figures from the catalog and drops the unlinked pages', async ({ page }) => {
    const counts = toolCounts();
    await page.goto('/en');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Result out.');
    await expect(page.getByText(`${counts.local} tools never leave the tab.`)).toBeVisible();
    await expect(page.getByText(`${counts.ai} AI tools ask first,`)).toBeVisible();
    await expect(page.getByTestId('tool-card')).toHaveCount(counts.total);
    await expect(page.getByText('Built with curiosity and care by Ozlorien Labs.')).toBeVisible();

    await expect(page.getByRole('link', { name: /every emoji/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /source/i })).toHaveCount(0);

    // Unlinked, but still routed.
    await page.goto('/en/emojis');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/emoji/i);
  });
});

test.describe('narrow viewports', () => {
  test('forces the icon rail and stacks the editor panes', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto('/en/markdown');

    await expect(page.getByRole('navigation', { name: /all tools/i })).toHaveAttribute('data-labels', 'false');
    await expect(page.getByRole('button', { name: /collapse rail/i })).toHaveCount(0);

    const panes = page.locator('.ed-grid[data-panes="split"]');
    const columns = await panes.evaluate((node) => getComputedStyle(node).gridTemplateColumns);
    expect(columns.split(' ')).toHaveLength(1);
  });

  test('hides the snippets tag pane on a medium window', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto('/en/snippets');
    await expect(page.locator('.snippet-tags')).toBeHidden();

    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(page.locator('.snippet-tags')).toBeVisible();
  });

  test('keeps the landing page free of horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/en');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
