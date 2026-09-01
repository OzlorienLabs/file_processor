import { fileExtension } from './files';
import type { NamedBlob } from './pdf';
import type { OpenPdfRasterDocument } from './pdf-compression';

export const MAX_EXTRACTED_CHARS = 500_000;

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
}

async function defaultOpenDocument(file: NamedBlob) {
  const { openPdfRasterDocument } = await import('./pdf-raster');
  return openPdfRasterDocument(file);
}

export async function extractText(
  file: NamedBlob,
  openDocument: OpenPdfRasterDocument = defaultOpenDocument,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<string> {
  assertNotAborted(signal);
  const extension = fileExtension(file.name);
  let text: string;

  if (file.type === 'application/pdf' || extension === 'pdf') {
    const source = await openDocument(file);
    const pages: string[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= source.pageCount; pageNumber += 1) {
        assertNotAborted(signal);
        pages.push(await source.extractPageText(pageNumber));
        onProgress?.(pageNumber, source.pageCount);
      }
    } finally {
      await source.close();
    }
    text = pages.join('\n\n').trim();
  } else if (extension === 'docx') {
    const { extractDocxText } = await import('./docx-convert');
    text = await extractDocxText(file);
  } else {
    text = (await file.text()).trim();
  }

  if (text.length > MAX_EXTRACTED_CHARS) {
    throw new Error(
      `This document contains more than ${MAX_EXTRACTED_CHARS.toLocaleString()} characters of text. Split it first.`,
    );
  }
  return text;
}

/** Split text into chunks of at most maxChars, preferring paragraph boundaries. */
export function chunkText(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      push();
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        chunks.push(paragraph.slice(offset, offset + maxChars).trim());
      }
      continue;
    }
    if (current.length + paragraph.length + 2 > maxChars) push();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  push();
  return chunks;
}
