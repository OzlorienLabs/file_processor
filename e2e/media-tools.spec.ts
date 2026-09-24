import { expect, test } from '@playwright/test';

import { withProductionCsp } from './production-csp';

// Chromium shares this tab without a picker, so the whole capture path runs for real. The fake
// media UI stands in for the sharing bar, which headless Chromium otherwise crashes tearing down.
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--auto-accept-this-tab-capture', '--auto-select-tab-capture-source-by-title=FileKit'],
  },
});

test.describe('media tools', () => {
  test('records part of a tab and turns it into a GIF under the production CSP', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Phones do not offer screen sharing to web pages.');
    test.setTimeout(90_000);
    const violations = await withProductionCsp(page);
    await page.goto('/en/screen-recorder');

    await page.getByRole('radio', { name: /browser tab/i }).check();
    await page.getByRole('radio', { name: /part of it/i }).check();
    await page.getByLabel(/3-second countdown/i).uncheck();
    await page.getByRole('button', { name: /choose what to record/i }).click();
    await expect(page.getByRole('group', { name: /area to record/i })).toBeVisible();

    await page.getByRole('button', { name: /start recording/i }).click();
    await expect(page.getByRole('timer', { name: /recording time/i })).toContainText('0:02', { timeout: 10_000 });
    await page.getByRole('button', { name: /stop recording/i }).click();

    const finished = page.getByLabel('Finished recording');
    await expect(finished).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => finished.evaluate((video: HTMLVideoElement) => video.duration)).toBeGreaterThan(1);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /download webm/i }).click();
    expect((await download).suggestedFilename()).toMatch(/^screen-recording-.*\.webm$/);

    await page.getByRole('button', { name: /make a gif/i }).click();
    await expect(page).toHaveURL(/\/en\/video-to-gif$/);
    await expect(page.getByLabel(/^Video: screen-recording-/)).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Frame rate').selectOption('10');
    await page.getByRole('button', { name: /create gif/i }).click();

    const gif = page.getByRole('img', { name: /gif made from screen-recording-/i });
    await expect(gif).toBeVisible({ timeout: 60_000 });
    expect(await gif.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(100);
    const saved = page.waitForEvent('download');
    await page.getByRole('button', { name: /download gif/i }).click();
    expect((await saved).suggestedFilename()).toMatch(/^screen-recording-.*\.gif$/);
    expect(violations).toEqual([]);
  });
});
