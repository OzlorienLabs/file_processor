import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

async function pdfFixture(pages: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) document.addPage([300, 200]);
  return Buffer.from(await document.save());
}

test.describe('client-side PDF flows', () => {
  test('merges two PDFs entirely in the browser and downloads the result', async ({ page }) => {
    await page.goto('/en/merge');

    await page.getByLabel('Choose files to merge').setInputFiles([
      { name: 'first.pdf', mimeType: 'application/pdf', buffer: await pdfFixture(1) },
      { name: 'second.pdf', mimeType: 'application/pdf', buffer: await pdfFixture(2) },
    ]);
    await expect(page.getByRole('list', { name: /files to merge/i })).toBeVisible();

    await page.getByRole('button', { name: /merge into one pdf/i }).click();
    await expect(page.getByText('One PDF, 3 pages')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /download pdf/i }).click();
    expect((await download).suggestedFilename()).toBe('merged-document.pdf');
  });

  test('runs the whole source, settings, result flow for a split', async ({ page }) => {
    await page.goto('/en/split');
    await expect(page.getByText('1 · Source')).toBeVisible();
    await expect(page.getByText('Nothing yet. The result appears here and downloads straight to your device.')).toBeVisible();

    await page.getByLabel('Choose a PDF to split').setInputFiles({
      name: 'report.pdf',
      mimeType: 'application/pdf',
      buffer: await pdfFixture(4),
    });
    await expect(page.getByText(/^4 pages · /)).toBeVisible();
    await expect(page.getByText('p. 4')).toBeVisible();

    await page.getByRole('radio', { name: /page ranges/i }).check();
    await page.getByLabel(/pages or ranges/i).fill('1, 3');
    await page.getByRole('button', { name: /split pdf/i }).click();

    await expect(page.getByText(/pages kept|PDFs/)).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /download (pdf|zip)/i }).click();
    expect((await download).suggestedFilename()).toMatch(/^report-/);
  });

  test('reports honest progress while a long split runs', async ({ page }) => {
    await page.goto('/en/split');
    await page.getByLabel('Choose a PDF to split').setInputFiles({
      name: 'long.pdf',
      mimeType: 'application/pdf',
      buffer: await pdfFixture(60),
    });
    await expect(page.getByText(/^60 pages · /)).toBeVisible();

    await page.getByRole('button', { name: /split pdf/i }).click();
    const bar = page.getByRole('progressbar', { name: /split pdf progress/i });
    // The bar only ever shows values the engine reported.
    if (await bar.isVisible()) {
      const value = Number(await bar.getAttribute('aria-valuenow'));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(99);
    }
    await expect(page.getByRole('button', { name: /download zip/i })).toBeVisible({ timeout: 30_000 });
  });
});
