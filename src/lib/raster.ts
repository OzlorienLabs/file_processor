export type CompressionLevel = 'light' | 'balanced' | 'strong';

export interface DecodedRaster {
  source: unknown;
  width: number;
  height: number;
  close: () => void;
}

export interface RasterAdapter {
  decode: (file: Blob) => Promise<DecodedRaster>;
  encode: (
    source: unknown,
    width: number,
    height: number,
    type: 'image/jpeg' | 'image/webp' | 'image/png',
    quality: number,
  ) => Promise<Blob>;
}

export interface CompressedImage {
  blob: Blob;
  extension: 'jpg' | 'webp';
  width: number;
  height: number;
}

export function getCompressionSettings(level: CompressionLevel) {
  return {
    light: { quality: 0.88, maxDimension: 3200, pdfScale: 1.6 },
    balanced: { quality: 0.72, maxDimension: 2400, pdfScale: 1.3 },
    strong: { quality: 0.52, maxDimension: 1600, pdfScale: 1 },
  }[level];
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The operation was cancelled.', 'AbortError');
}

const browserRasterAdapter: RasterAdapter = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  },
  async encode(source, width, height, type, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: type !== 'image/jpeg' });
    if (!context) throw new Error('This browser cannot create an image canvas.');
    context.drawImage(source as CanvasImageSource, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('The image could not be encoded.')),
        type,
        quality,
      );
    });
    canvas.width = 1;
    canvas.height = 1;
    return blob;
  },
};

export type ImageTarget = 'png' | 'jpg' | 'webp';

const targetTypes: Record<ImageTarget, 'image/png' | 'image/jpeg' | 'image/webp'> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export async function convertImage(
  file: Blob,
  target: ImageTarget,
  adapter: RasterAdapter = browserRasterAdapter,
  signal?: AbortSignal,
): Promise<Blob> {
  abortIfNeeded(signal);
  const decoded = await adapter.decode(file);
  try {
    abortIfNeeded(signal);
    return await adapter.encode(decoded.source, decoded.width, decoded.height, targetTypes[target], 0.92);
  } finally {
    decoded.close();
  }
}

export async function compressImage(
  file: File,
  level: CompressionLevel,
  adapter: RasterAdapter = browserRasterAdapter,
  signal?: AbortSignal,
): Promise<CompressedImage> {
  abortIfNeeded(signal);
  const settings = getCompressionSettings(level);
  const decoded = await adapter.decode(file);
  try {
    abortIfNeeded(signal);
    const scale = Math.min(1, settings.maxDimension / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await adapter.encode(
      decoded.source,
      width,
      height,
      type,
      settings.quality,
    );
    abortIfNeeded(signal);
    return { blob, extension: type === 'image/jpeg' ? 'jpg' : 'webp', width, height };
  } finally {
    decoded.close();
  }
}
