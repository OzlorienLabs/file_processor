import { describe, expect, it, vi } from 'vitest';

import { chunkText, extractText, MAX_EXTRACTED_CHARS } from './text-extract';
import type { NamedBlob } from './pdf';
import type { PdfRasterDocument } from './pdf-raster';

vi.mock('./docx-convert', () => ({
  extractDocxText: vi.fn(async () => 'words from docx'),
}));

function fakePdf(pages: string[]): PdfRasterDocument {
  return {
    pageCount: pages.length,
    renderPage: vi.fn(),
    extractPageText: async (pageNumber: number) => pages[pageNumber - 1],
    close: vi.fn(async () => {}),
  };
}

describe('extractText', () => {
  it('joins PDF page text with progress reports', async () => {
    const progress = vi.fn();
    const text = await extractText(
      new File(['pdf'], 'doc.pdf', { type: 'application/pdf' }) as unknown as NamedBlob,
      async () => fakePdf(['Page one.', 'Page two.']),
      undefined,
      progress,
    );
    expect(text).toBe('Page one.\n\nPage two.');
    expect(progress).toHaveBeenCalledWith(2, 2);
  });

  it('extracts DOCX text through mammoth', async () => {
    const text = await extractText(
      new File(['docx'], 'doc.docx', { type: '' }) as unknown as NamedBlob,
    );
    expect(text).toBe('words from docx');
  });

  it('reads plain text and markdown directly', async () => {
    const text = await extractText(
      new File(['  # Title\ncontent  '], 'notes.md', { type: 'text/markdown' }) as unknown as NamedBlob,
    );
    expect(text).toBe('# Title\ncontent');
  });

  it('refuses documents beyond the extraction cap', async () => {
    const big = 'a'.repeat(MAX_EXTRACTED_CHARS + 1);
    await expect(
      extractText(new File([big], 'big.txt', { type: 'text/plain' }) as unknown as NamedBlob),
    ).rejects.toThrow(/more than/);
  });

  it('honours cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractText(
        new File(['x'], 'doc.txt', { type: 'text/plain' }) as unknown as NamedBlob,
        undefined,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('chunkText', () => {
  it('keeps short text as one chunk and drops empty input', () => {
    expect(chunkText('short text', 100)).toEqual(['short text']);
    expect(chunkText('   ', 100)).toEqual([]);
  });

  it('splits on paragraph boundaries below the limit', () => {
    const chunks = chunkText('aaaa\n\nbbbb\n\ncccc', 11);
    expect(chunks).toEqual(['aaaa\n\nbbbb', 'cccc']);
  });

  it('hard-splits a single oversized paragraph', () => {
    const chunks = chunkText('x'.repeat(25), 10);
    expect(chunks).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });
});
