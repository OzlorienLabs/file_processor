import type { NamedBlob } from './pdf';
import type { OpenPdfRasterDocument } from './pdf-compression';
import { openPdfRasterDocument } from './pdf-raster';

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
}

/** Ordered page text, one entry per page, reporting each page as it lands. */
export async function extractPdfPageTexts(
  file: NamedBlob,
  openDocument: OpenPdfRasterDocument = openPdfRasterDocument,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<string[]> {
  assertNotAborted(signal);
  const source = await openDocument(file);
  const pageTexts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= source.pageCount; pageNumber += 1) {
      assertNotAborted(signal);
      pageTexts.push(await source.extractPageText(pageNumber));
      onProgress?.(pageNumber, source.pageCount);
    }
  } finally {
    await source.close();
  }
  return pageTexts;
}

/** The same extracted text as Markdown, one `## Page n` section per page. */
export function pageTextsToMarkdown(pageTexts: string[]): string {
  return pageTexts
    .map((text, index) => {
      const body = text.trim() || '_This page contained no extractable text._';
      return `## Page ${index + 1}\n\n${body.split(/\n+/).join('\n\n')}`;
    })
    .join('\n\n');
}

export async function convertPdfToDocx(
  file: NamedBlob,
  openDocument: OpenPdfRasterDocument = openPdfRasterDocument,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<Blob> {
  const pageTexts = await extractPdfPageTexts(file, openDocument, signal, onProgress);

  assertNotAborted(signal);
  const { Document, Packer, PageBreak, Paragraph, TextRun } = await import('docx');
  const children = pageTexts.flatMap((text, index) => {
    const paragraphs = text
      ? text.split(/\n+/).map((line) => new Paragraph({ children: [new TextRun(line)] }))
      : [new Paragraph({ children: [new TextRun('')] })];
    if (index < pageTexts.length - 1) {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    }
    return paragraphs;
  });

  const document = new Document({ sections: [{ children }] });
  return Packer.toBlob(document);
}
