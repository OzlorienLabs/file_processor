import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

import { compressPdf, type OpenPdfRasterDocument } from './pdf-compression';
import type { NamedBlob } from './pdf';

const tinyJpeg = Uint8Array.from(
  atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q=='),
  (character) => character.charCodeAt(0),
);

function inputFile(): NamedBlob {
  const blob = new Blob(['pdf'], { type: 'application/pdf' }) as NamedBlob;
  Object.defineProperty(blob, 'name', { value: 'input.pdf' });
  return blob;
}

describe('compressPdf', () => {
  it('rasterizes pages sequentially into a compact PDF', async () => {
    const close = vi.fn();
    const renderPage = vi.fn().mockResolvedValue({
      blob: new Blob([tinyJpeg], { type: 'image/jpeg' }),
      width: 400,
      height: 200,
    });
    const openDocument: OpenPdfRasterDocument = vi.fn().mockResolvedValue({
      pageCount: 2,
      renderPage,
      extractPageText: vi.fn(),
      close,
    });
    const progress = vi.fn();

    const bytes = await compressPdf(inputFile(), 'strong', openDocument, undefined, progress);
    const output = await PDFDocument.load(bytes);

    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getSize()).toEqual({ width: 400, height: 200 });
    expect(renderPage).toHaveBeenNthCalledWith(1, 1, 1, 0.52, expect.any(AbortSignal));
    expect(renderPage).toHaveBeenNthCalledWith(2, 2, 1, 0.52, expect.any(AbortSignal));
    expect(progress).toHaveBeenLastCalledWith(2, 2);
    expect(close).toHaveBeenCalledOnce();
  });

  it('stops between pages when cancelled mid-run', async () => {
    const close = vi.fn();
    const controller = new AbortController();
    const renderPage = vi.fn().mockResolvedValue({
      blob: new Blob([tinyJpeg], { type: 'image/jpeg' }),
      width: 100,
      height: 100,
    });
    const openDocument: OpenPdfRasterDocument = vi.fn().mockResolvedValue({
      pageCount: 3,
      renderPage,
      extractPageText: vi.fn(),
      close,
    });

    await expect(
      compressPdf(inputFile(), 'balanced', openDocument, controller.signal, () =>
        controller.abort(),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the document when rendering fails', async () => {
    const close = vi.fn();
    const openDocument: OpenPdfRasterDocument = vi.fn().mockResolvedValue({
      pageCount: 1,
      renderPage: vi.fn().mockRejectedValue(new Error('canvas failed')),
      extractPageText: vi.fn(),
      close,
    });

    await expect(
      compressPdf(inputFile(), 'balanced', openDocument),
    ).rejects.toThrow('canvas failed');
    expect(close).toHaveBeenCalledOnce();
  });
});
