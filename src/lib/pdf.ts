import { fileExtension } from './files';

export interface NamedBlob extends Blob {
  readonly name: string;
}

const IMAGE_PAGE = { width: 595.28, height: 841.89, margin: 28 };

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
}

async function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

function kindOf(file: NamedBlob): 'pdf' | 'png' | 'jpg' | undefined {
  const extension = fileExtension(file.name);
  if (file.type === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (file.type === 'image/png' || extension === 'png') return 'png';
  if (file.type === 'image/jpeg' || ['jpg', 'jpeg'].includes(extension)) return 'jpg';
  return undefined;
}

export async function mergeToPdf(
  files: NamedBlob[],
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!files.length) throw new Error('Add at least one file to merge.');
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();

  for (const file of files) {
    assertNotAborted(signal);
    const kind = kindOf(file);
    if (!kind) throw new Error(`${file.name} is an unsupported merge input.`);
    const bytes = await readBlob(file);

    if (kind === 'pdf') {
      const source = await PDFDocument.load(bytes);
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => output.addPage(page));
      continue;
    }

    const image =
      kind === 'png' ? await output.embedPng(bytes) : await output.embedJpg(bytes);
    const maxWidth = IMAGE_PAGE.width - IMAGE_PAGE.margin * 2;
    const maxHeight = IMAGE_PAGE.height - IMAGE_PAGE.margin * 2;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const page = output.addPage([IMAGE_PAGE.width, IMAGE_PAGE.height]);
    page.drawImage(image, {
      x: (IMAGE_PAGE.width - width) / 2,
      y: (IMAGE_PAGE.height - height) / 2,
      width,
      height,
    });
  }

  assertNotAborted(signal);
  return output.save({ useObjectStreams: true });
}

export async function splitPdf(
  file: NamedBlob,
  groups: number[][],
  signal?: AbortSignal,
): Promise<Uint8Array[]> {
  if (!groups.length || groups.some((group) => group.length === 0)) {
    throw new Error('Choose at least one page group to split.');
  }
  assertNotAborted(signal);
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(await readBlob(file));
  const pageCount = source.getPageCount();

  for (const group of groups) {
    if (group.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
      throw new Error(`Page numbers must be between 1 and ${pageCount}.`);
    }
  }

  const outputs: Uint8Array[] = [];
  for (const group of groups) {
    assertNotAborted(signal);
    const document = await PDFDocument.create();
    const pages = await document.copyPages(
      source,
      group.map((page) => page - 1),
    );
    pages.forEach((page) => document.addPage(page));
    outputs.push(await document.save({ useObjectStreams: true }));
  }
  return outputs;
}

export async function getPdfPageCount(file: NamedBlob): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const document = await PDFDocument.load(await readBlob(file));
  return document.getPageCount();
}
