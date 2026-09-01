import { describe, expect, it, vi } from 'vitest';

import { ocrFile, ocrLanguages, type OcrEngine } from './ocr';
import type { NamedBlob } from './pdf';
import type { PdfRasterDocument } from './pdf-raster';

function fakeEngine(texts: Record<string, string>) {
  const terminate = vi.fn(async () => {});
  const engine: OcrEngine = {
    recognize: async (image) => texts[await (image as Blob).text()] ?? '',
    terminate,
  };
  return { engine, terminate };
}

describe('ocrLanguages', () => {
  it('offers English first and only unique codes', () => {
    expect(ocrLanguages[0].code).toBe('eng');
    expect(new Set(ocrLanguages.map((language) => language.code)).size).toBe(ocrLanguages.length);
  });
});

describe('ocrFile', () => {
  it('recognizes a single image and reports recognition progress', async () => {
    const { engine, terminate } = fakeEngine({ img: ' Hello scan ' });
    const progressCallbacks: Array<(ratio: number) => void> = [];
    const progress = vi.fn();

    const text = await ocrFile(
      new File(['img'], 'scan.png', { type: 'image/png' }) as unknown as NamedBlob,
      'eng',
      {
        createEngine: async (language, onProgress) => {
          expect(language).toBe('eng');
          progressCallbacks.push(onProgress!);
          return engine;
        },
      },
      undefined,
      progress,
    );

    progressCallbacks[0](0.5);
    expect(progress).toHaveBeenCalledWith('Recognizing text', 0.5);
    expect(text).toBe('Hello scan');
    expect(terminate).toHaveBeenCalled();
  });

  it('renders and recognizes every PDF page sequentially', async () => {
    const { engine, terminate } = fakeEngine({ 'page-1': 'First words', 'page-2': 'Second words' });
    const close = vi.fn(async () => {});
    const document: PdfRasterDocument = {
      pageCount: 2,
      renderPage: vi.fn(async (pageNumber: number) => ({
        blob: new Blob([`page-${pageNumber}`]),
        width: 100,
        height: 100,
      })),
      extractPageText: vi.fn(),
      close,
    };
    const progress = vi.fn();

    const text = await ocrFile(
      new File(['pdf'], 'scan.pdf', { type: 'application/pdf' }) as unknown as NamedBlob,
      'deu',
      { createEngine: async () => engine, openDocument: async () => document },
      undefined,
      progress,
    );

    expect(text).toBe('First words\n\nSecond words');
    expect(progress).toHaveBeenCalledWith('Reading page 1 of 2', 0);
    expect(progress).toHaveBeenCalledWith('Reading page 2 of 2', 0.5);
    expect(close).toHaveBeenCalled();
    expect(terminate).toHaveBeenCalled();
  });

  it('terminates the engine even when recognition fails', async () => {
    const terminate = vi.fn(async () => {});
    await expect(
      ocrFile(
        new File(['img'], 'scan.png', { type: 'image/png' }) as unknown as NamedBlob,
        'eng',
        {
          createEngine: async () => ({
            recognize: async () => {
              throw new Error('engine crashed');
            },
            terminate,
          }),
        },
      ),
    ).rejects.toThrow('engine crashed');
    expect(terminate).toHaveBeenCalled();
  });

  it('rejects immediately when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      ocrFile(
        new File(['img'], 'scan.png', { type: 'image/png' }) as unknown as NamedBlob,
        'eng',
        { createEngine: vi.fn() },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
