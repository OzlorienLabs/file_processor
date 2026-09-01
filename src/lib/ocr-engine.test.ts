import { describe, expect, it, vi } from 'vitest';

import { createTesseractEngine, ocrFile } from './ocr';
import type { NamedBlob } from './pdf';

const recognize = vi.fn(async () => ({ data: { text: '  tesseract text  ' } }));
const terminate = vi.fn(async () => {});
const createWorker = vi.fn(async (..._args: unknown[]) => ({ recognize, terminate }));

vi.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]) => createWorker(...args),
}));

vi.mock('./pdf-raster', () => ({
  openPdfRasterDocument: vi.fn(async () => ({
    pageCount: 1,
    renderPage: vi.fn(async () => ({ blob: new Blob(['page']), width: 10, height: 10 })),
    extractPageText: vi.fn(),
    close: vi.fn(async () => {}),
  })),
}));

describe('createTesseractEngine', () => {
  it('creates an LSTM worker with same-origin assets and forwards recognition progress', async () => {
    const onProgress = vi.fn();
    const engine = await createTesseractEngine('deu', onProgress);

    const [language, oem, options] = createWorker.mock.calls[0] as unknown as [
      string,
      number,
      { workerPath: string; corePath: string; logger: (message: { status: string; progress: number }) => void },
    ];
    expect(language).toBe('deu');
    expect(oem).toBe(1);
    expect(options.workerPath).toBeTruthy();
    expect(options.corePath).toBeTruthy();

    options.logger({ status: 'recognizing text', progress: 0.7 });
    options.logger({ status: 'loading language traineddata', progress: 0.1 });
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(0.7);

    await expect(engine.recognize(new Blob(['img']))).resolves.toBe('  tesseract text  ');
    await engine.terminate();
    expect(terminate).toHaveBeenCalled();
  });
});

describe('ocrFile default dependencies', () => {
  it('uses the real engine factory and PDF opener defaults', async () => {
    const text = await ocrFile(
      new File(['pdf'], 'scan.pdf', { type: 'application/pdf' }) as unknown as NamedBlob,
      'eng',
    );
    expect(text).toBe('tesseract text');
    const { openPdfRasterDocument } = await import('./pdf-raster');
    expect(openPdfRasterDocument).toHaveBeenCalled();
  });
});
