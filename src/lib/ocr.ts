import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';

import { fileExtension } from './files';
import type { NamedBlob } from './pdf';
import type { OpenPdfRasterDocument } from './pdf-compression';

export const ocrLanguages = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'pol', label: 'Polish' },
  { code: 'tur', label: 'Turkish' },
  { code: 'rus', label: 'Russian' },
  { code: 'ara', label: 'Arabic' },
  { code: 'hin', label: 'Hindi' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
] as const;

export interface OcrEngine {
  recognize: (image: Blob) => Promise<string>;
  terminate: () => Promise<void>;
}

export type CreateOcrEngine = (
  language: string,
  onProgress?: (ratio: number) => void,
) => Promise<OcrEngine>;

export const createTesseractEngine: CreateOcrEngine = async (language, onProgress) => {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(language, 1, {
    workerPath: workerUrl,
    corePath: coreUrl,
    logger: (message: { status: string; progress: number }) => {
      if (message.status === 'recognizing text') onProgress?.(message.progress);
    },
  });
  return {
    recognize: async (image) => (await worker.recognize(image)).data.text,
    terminate: async () => {
      await worker.terminate();
    },
  };
};

/** The "Recognition effort" slider spans a 1.2x to 3x page render. */
export function renderScaleFor(quality: number): number {
  return Number((1.2 + (quality / 100) * 1.8).toFixed(2));
}

/** Collapses the single newlines inside a paragraph when page line breaks are not wanted. */
export function unwrapLines(text: string): string {
  return text.replace(/([^\n])\n(?!\n)/g, '$1 ');
}

export interface OcrDeps {
  createEngine: CreateOcrEngine;
  openDocument: OpenPdfRasterDocument;
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
}

async function defaultOpenDocument(file: NamedBlob) {
  const { openPdfRasterDocument } = await import('./pdf-raster');
  return openPdfRasterDocument(file);
}

/** One entry per recognised page; single images produce a one-entry list. */
export async function ocrPages(
  file: NamedBlob,
  language: string,
  deps?: Partial<OcrDeps>,
  signal?: AbortSignal,
  onProgress?: (label: string, ratio: number) => void,
  /** Render scale for PDF pages: more pixels, better recognition, slower. */
  renderScale = 2,
): Promise<string[]> {
  assertNotAborted(signal);
  const isPdf = file.type === 'application/pdf' || fileExtension(file.name) === 'pdf';
  const createEngine = deps?.createEngine ?? createTesseractEngine;
  const openDocument = deps?.openDocument ?? defaultOpenDocument;

  let pageRatio = 0;
  let describe: (ratio: number) => void = (ratio) => onProgress?.('Recognizing text', ratio);
  const engine = await createEngine(language, (ratio) => describe(ratio));

  try {
    assertNotAborted(signal);
    if (!isPdf) {
      return [(await engine.recognize(file)).trim()];
    }

    const source = await openDocument(file);
    try {
      const texts: string[] = [];
      for (let pageNumber = 1; pageNumber <= source.pageCount; pageNumber += 1) {
        assertNotAborted(signal);
        describe = (ratio) =>
          onProgress?.(
            `Reading page ${pageNumber} of ${source.pageCount}`,
            (pageNumber - 1 + ratio) / source.pageCount,
          );
        describe(pageRatio);
        pageRatio = 0;
        const rendered = await source.renderPage(pageNumber, renderScale, 0.95, signal);
        texts.push((await engine.recognize(rendered.blob)).trim());
      }
      return texts;
    } finally {
      await source.close();
    }
  } finally {
    await engine.terminate();
  }
}

export async function ocrFile(
  file: NamedBlob,
  language: string,
  deps?: Partial<OcrDeps>,
  signal?: AbortSignal,
  onProgress?: (label: string, ratio: number) => void,
  renderScale?: number,
): Promise<string> {
  const pages = await ocrPages(file, language, deps, signal, onProgress, renderScale);
  return pages.join('\n\n').trim();
}
