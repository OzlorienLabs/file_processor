import { fileExtension, safeBaseName } from './files';
import type { NamedBlob } from './pdf';

export type InputKind = 'image' | 'pdf' | 'docx' | 'text' | 'audio';

export interface ConversionOption {
  id: string;
  label: string;
  hint: string;
  run: (
    file: File,
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ) => Promise<{ blob: Blob; filename: string }>;
}

const imageExtensions = ['png', 'jpg', 'jpeg', 'webp'];
const audioExtensions = ['mp3', 'm4a', 'wav', 'webm', 'ogg', 'flac'];
const textExtensions = ['txt', 'md'];
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function detectInputKind(file: File): InputKind | undefined {
  const extension = fileExtension(file.name);
  if (file.type === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (file.type === docxType || extension === 'docx') return 'docx';
  if (file.type.startsWith('image/') || imageExtensions.includes(extension)) return 'image';
  if (file.type.startsWith('audio/') || audioExtensions.includes(extension)) return 'audio';
  if (file.type.startsWith('text/') || textExtensions.includes(extension)) return 'text';
  return undefined;
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
}

async function imageTo(target: 'png' | 'jpg' | 'webp', file: File, signal?: AbortSignal) {
  const { convertImage } = await import('./raster');
  const blob = await convertImage(file, target, undefined, signal);
  return { blob, filename: `${safeBaseName(file.name)}.${target}` };
}

async function imageToPdf(file: File, signal?: AbortSignal) {
  const { convertImage } = await import('./raster');
  const png = await convertImage(file, 'png', undefined, signal);
  const pngFile = new File([png], `${safeBaseName(file.name)}.png`, { type: 'image/png' });
  const { mergeToPdf } = await import('./pdf');
  const bytes = await mergeToPdf([pngFile as NamedBlob], signal);
  return {
    blob: new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }),
    filename: `${safeBaseName(file.name)}.pdf`,
  };
}

async function pdfToImagesZip(
  file: File,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
) {
  const { openPdfRasterDocument } = await import('./pdf-raster');
  const { default: JSZip } = await import('jszip');
  const source = await openPdfRasterDocument(file as NamedBlob);
  const zip = new JSZip();
  const base = safeBaseName(file.name);
  try {
    for (let pageNumber = 1; pageNumber <= source.pageCount; pageNumber += 1) {
      assertNotAborted(signal);
      const rendered = await source.renderPage(pageNumber, 2, 0.92, signal);
      zip.file(`${base}-page-${pageNumber}.jpg`, rendered.blob);
      onProgress?.(pageNumber, source.pageCount);
    }
  } finally {
    await source.close();
  }
  return { blob: await zip.generateAsync({ type: 'blob' }), filename: `${base}-pages.zip` };
}

async function pdfToText(
  file: File,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
) {
  const { openPdfRasterDocument } = await import('./pdf-raster');
  const source = await openPdfRasterDocument(file as NamedBlob);
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
  return {
    blob: new Blob([pages.join('\n\n')], { type: 'text/plain' }),
    filename: `${safeBaseName(file.name)}.txt`,
  };
}

async function docxToPdf(file: File, signal?: AbortSignal) {
  const { convertDocxToPdf } = await import('./docx-convert');
  const bytes = await convertDocxToPdf(file as NamedBlob, undefined, signal);
  return {
    blob: new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }),
    filename: `${safeBaseName(file.name)}.pdf`,
  };
}

async function docxToText(file: File) {
  const { extractDocxText } = await import('./docx-convert');
  return {
    blob: new Blob([await extractDocxText(file)], { type: 'text/plain' }),
    filename: `${safeBaseName(file.name)}.txt`,
  };
}

async function textToPdf(file: File, signal?: AbortSignal) {
  assertNotAborted(signal);
  const [{ textToBlocks }, { renderBlocksToPdf }] = await Promise.all([
    import('./doc-blocks'),
    import('./blocks-to-pdf'),
  ]);
  const bytes = await renderBlocksToPdf(textToBlocks(await file.text()));
  return {
    blob: new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }),
    filename: `${safeBaseName(file.name)}.pdf`,
  };
}

async function audioToWav(file: File, signal?: AbortSignal) {
  const { decodeAudioFile, encodeWavPcm16 } = await import('./audio');
  assertNotAborted(signal);
  const decoded = await decodeAudioFile(file);
  assertNotAborted(signal);
  return { blob: encodeWavPcm16(decoded), filename: `${safeBaseName(file.name)}.wav` };
}

export function conversionsFor(file: File): ConversionOption[] {
  const kind = detectInputKind(file);
  const extension = fileExtension(file.name);

  switch (kind) {
    case 'image': {
      const options: ConversionOption[] = [];
      const targets: Array<'png' | 'jpg' | 'webp'> = ['png', 'jpg', 'webp'];
      for (const target of targets) {
        const already =
          extension === target || (target === 'jpg' && extension === 'jpeg');
        if (!already) {
          options.push({
            id: `image-${target}`,
            label: `${target.toUpperCase()} image`,
            hint: target === 'jpg' ? 'Smaller, no transparency' : target === 'png' ? 'Lossless, keeps transparency' : 'Modern, small, keeps transparency',
            run: (input, signal) => imageTo(target, input, signal),
          });
        }
      }
      options.push({
        id: 'image-pdf',
        label: 'PDF document',
        hint: 'One page containing the image',
        run: (input, signal) => imageToPdf(input, signal),
      });
      return options;
    }
    case 'pdf':
      return [
        { id: 'pdf-images', label: 'JPG images (ZIP)', hint: 'One picture per page', run: pdfToImagesZip },
        { id: 'pdf-txt', label: 'Plain text', hint: 'The text layer of every page', run: pdfToText },
      ];
    case 'docx':
      return [
        { id: 'docx-pdf', label: 'PDF document', hint: 'Simplified, readable layout', run: docxToPdf },
        { id: 'docx-txt', label: 'Plain text', hint: 'Just the words', run: (input) => docxToText(input) },
      ];
    case 'text':
      return [
        { id: 'text-pdf', label: 'PDF document', hint: 'Clean typeset pages', run: textToPdf },
      ];
    case 'audio':
      return [
        { id: 'audio-wav', label: 'WAV audio', hint: 'Uncompressed, universally supported', run: audioToWav },
      ];
    default:
      return [];
  }
}
