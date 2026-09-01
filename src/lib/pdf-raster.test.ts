import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NamedBlob } from './pdf';
import { openPdfRasterDocument } from './pdf-raster';

const render = vi.fn(() => ({ promise: Promise.resolve() }));
const cleanup = vi.fn();
const destroy = vi.fn(async () => {});

const page = {
  getViewport: ({ scale }: { scale: number }) => ({ width: 200 * scale, height: 100 * scale }),
  render,
  cleanup,
  getTextContent: vi.fn(async () => ({
    items: [{ str: '  Hello ' }, { notText: true }, { str: 'world  ' }, { str: '' }],
  })),
};

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 2, getPage: vi.fn(async () => page) }),
    destroy,
  })),
}));

const fakeContext = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    fakeContext as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
  });
});

afterEach(() => vi.restoreAllMocks());

const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' }) as unknown as NamedBlob;

describe('openPdfRasterDocument', () => {
  it('renders a page at the requested scale and reports natural dimensions', async () => {
    const document = await openPdfRasterDocument(file);
    expect(document.pageCount).toBe(2);

    const rendered = await document.renderPage(1, 2, 0.8);
    expect(rendered.width).toBe(200);
    expect(rendered.height).toBe(100);
    expect(rendered.blob.type).toBe('image/jpeg');
    expect(render).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();

    await document.close();
    expect(destroy).toHaveBeenCalled();
  });

  it('extracts and normalizes page text', async () => {
    const document = await openPdfRasterDocument(file);
    await expect(document.extractPageText(1)).resolves.toBe('Hello world');
  });

  it('refuses to render when cancelled', async () => {
    const document = await openPdfRasterDocument(file);
    const controller = new AbortController();
    controller.abort();
    await expect(document.renderPage(1, 1, 0.8, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('fails clearly when the canvas cannot provide a context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const document = await openPdfRasterDocument(file);
    await expect(document.renderPage(1, 1, 0.8)).rejects.toThrow(/cannot render/i);
  });

  it('fails clearly when encoding produces no blob', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      callback(null);
    });
    const document = await openPdfRasterDocument(file);
    await expect(document.renderPage(1, 1, 0.8)).rejects.toThrow(/could not be encoded/i);
  });
});
