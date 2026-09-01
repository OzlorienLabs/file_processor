import { PDFDocument } from 'pdf-lib';

import { readBlobBytes } from './files';
import type { NamedBlob } from './pdf';
import {
  openPdfRasterDocument,
  type PdfRasterDocument,
} from './pdf-raster';
import { getCompressionSettings, type CompressionLevel } from './raster';

export type OpenPdfRasterDocument = (
  file: NamedBlob,
) => Promise<PdfRasterDocument>;

export async function compressPdf(
  file: NamedBlob,
  level: CompressionLevel,
  openDocument: OpenPdfRasterDocument = openPdfRasterDocument,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<Uint8Array> {
  const activeSignal = signal ?? new AbortController().signal;
  const settings = getCompressionSettings(level);
  const source = await openDocument(file);
  const output = await PDFDocument.create();

  try {
    for (let pageNumber = 1; pageNumber <= source.pageCount; pageNumber += 1) {
      if (activeSignal.aborted) {
        throw new DOMException('The operation was cancelled.', 'AbortError');
      }
      const rendered = await source.renderPage(
        pageNumber,
        settings.pdfScale,
        settings.quality,
        activeSignal,
      );
      const image = await output.embedJpg(await readBlobBytes(rendered.blob));
      const page = output.addPage([rendered.width, rendered.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: rendered.width,
        height: rendered.height,
      });
      onProgress?.(pageNumber, source.pageCount);
    }
    return output.save({ useObjectStreams: true });
  } finally {
    await source.close();
  }
}
