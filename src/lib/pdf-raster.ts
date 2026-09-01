import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { readBlobBytes } from './files';
import type { NamedBlob } from './pdf';

export interface RenderedPdfPage {
  blob: Blob;
  width: number;
  height: number;
}

export interface PdfRasterDocument {
  pageCount: number;
  renderPage: (
    pageNumber: number,
    scale: number,
    quality: number,
    signal?: AbortSignal,
  ) => Promise<RenderedPdfPage>;
  extractPageText: (pageNumber: number) => Promise<string>;
  close: () => Promise<void>;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('The PDF page could not be encoded.')),
      'image/jpeg',
      quality,
    );
  });
}

export async function openPdfRasterDocument(file: NamedBlob): Promise<PdfRasterDocument> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await readBlobBytes(file)),
  });
  const document = await loadingTask.promise;

  return {
    pageCount: document.numPages,
    async renderPage(pageNumber, scale, quality, signal) {
      if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
      const page = await document.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('This browser cannot render a PDF canvas.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
      const blob = await canvasToJpeg(canvas, quality);
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
      return { blob, width: natural.width, height: natural.height };
    },
    async extractPageText(pageNumber) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      page.cleanup();
      return content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    },
    async close() {
      await loadingTask.destroy();
    },
  };
}
