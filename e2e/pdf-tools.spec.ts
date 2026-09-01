import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

async function pdfFixture(pages: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) document.addPage([300, 200]);
  return Buffer.from(await document.save());
}

test.describe('client-side PDF flows', () => {
  test('merges two PDFs entirely in the browser', async ({ page }) => {
    await page.goto('/en/merge');

    await page.setInputFiles('#merge-files', [
      { name: 'first.pdf', mimeType: 'application/pdf', buffer: await pdfFixture(1) },
      { name: 'second.pdf', mimeType: 'application/pdf', buffer: await pdfFixture(2) },
    ]);

    await page.getByRole('button', { name: /merge 2 files/i }).click();

    const download = page.getByRole('link', { name: /download merged pdf/i });
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute('download', 'merged-document.pdf');
  });

  test('splits selected pages into a new PDF', async ({ page }) => {
    await page.goto('/en/split');

    await page.setInputFiles('#split-file', {
      name: 'report.pdf',
      mimeType: 'application/pdf',
      buffer: await pdfFixture(4),
    });
    await expect(page.getByText('4 pages detected')).toBeVisible();

    await page.getByRole('radio', { name: /selected pages/i }).check();
    await page.getByLabel(/pages or ranges/i).fill('1, 3');
    await page.getByRole('button', { name: /split pdf/i }).click();

    await expect(page.getByRole('link', { name: /download split pdf/i })).toHaveAttribute(
      'download',
      'report-pages-1-3.pdf',
    );
  });
});
