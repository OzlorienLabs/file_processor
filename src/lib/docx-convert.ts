import type { PageSpec } from './blocks-to-pdf';
import { htmlToBlocks, type DocBlock } from './doc-blocks';
import { readBlobBytes } from './files';
import type { NamedBlob } from './pdf';

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
}

// Mammoth's browser build reads { arrayBuffer } while its Node build (used by
// the test runner) reads { buffer }.
export function mammothInput(bytes: ArrayBuffer): { arrayBuffer: ArrayBuffer } | { buffer: Buffer } {
  return typeof Buffer === 'undefined' ? { arrayBuffer: bytes } : { buffer: Buffer.from(bytes) };
}

export async function extractDocxBlocks(file: Blob): Promise<DocBlock[]> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml(mammothInput(await readBlobBytes(file)));
  return htmlToBlocks(value);
}

export async function extractDocxText(file: Blob): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText(mammothInput(await readBlobBytes(file)));
  return value.trim();
}

export type ExtractDocxBlocks = (file: Blob) => Promise<DocBlock[]>;

export async function convertDocxToPdf(
  file: NamedBlob,
  extractBlocks: ExtractDocxBlocks = extractDocxBlocks,
  signal?: AbortSignal,
  page?: PageSpec,
  onProgress?: (completed: number, total: number) => void,
): Promise<Uint8Array> {
  assertNotAborted(signal);
  // Two real milestones: the DOCX is read, then the PDF is laid out.
  const blocks = await extractBlocks(file);
  onProgress?.(1, 2);
  assertNotAborted(signal);
  const { renderBlocksToPdf } = await import('./blocks-to-pdf');
  const bytes = await renderBlocksToPdf(blocks, page);
  onProgress?.(2, 2);
  return bytes;
}
