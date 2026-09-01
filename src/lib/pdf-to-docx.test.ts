import { describe, expect, it, vi } from 'vitest';

import type { NamedBlob } from './pdf';
import type { PdfRasterDocument } from './pdf-raster';
import { convertPdfToDocx } from './pdf-to-docx';

function fakeDocument(pages: string[]): { document: PdfRasterDocument; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn(async () => {});
  return {
    close,
    document: {
      pageCount: pages.length,
      renderPage: vi.fn(),
      extractPageText: async (pageNumber: number) => pages[pageNumber - 1],
      close,
    },
  };
}

async function docxDocumentXml(blob: Blob): Promise<string> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file('word/document.xml')!.async('string');
}

const file = new File(['pdf'], 'scan.pdf', { type: 'application/pdf' }) as unknown as NamedBlob;

describe('convertPdfToDocx', () => {
  it('creates a DOCX with one section per page and page breaks between them', async () => {
    const { document, close } = fakeDocument(['First page text', 'Second page text']);
    const progress = vi.fn();

    const blob = await convertPdfToDocx(file, async () => document, undefined, progress);
    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('First page text');
    expect(xml).toContain('Second page text');
    expect(xml).toContain('w:br w:type="page"');
    expect(progress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(progress).toHaveBeenNthCalledWith(2, 2, 2);
    expect(close).toHaveBeenCalled();
  });

  it('keeps empty pages as empty paragraphs', async () => {
    const { document } = fakeDocument(['']);
    const blob = await convertPdfToDocx(file, async () => document);
    expect(await docxDocumentXml(blob)).toContain('<w:p');
  });

  it('stops and closes the document when cancelled', async () => {
    const { document, close } = fakeDocument(['One', 'Two']);
    const controller = new AbortController();
    controller.abort();

    await expect(convertPdfToDocx(file, async () => document, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(close).not.toHaveBeenCalled();
  });
});
