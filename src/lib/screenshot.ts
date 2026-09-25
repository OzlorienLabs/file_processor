import { isFullRegion, toPixelRect, type Region } from './region';

export interface CaptureFrameOptions {
  region?: Region;
  format?: 'png' | 'jpeg';
  quality?: number; // 0.1 to 1.0 (for JPEG)
  frameWidth?: number;
  frameHeight?: number;
}

export interface CapturedScreenshot {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  format: 'png' | 'jpeg';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formats a timestamp into a clean, safe filename e.g. screen-capture-2026-09-24-220000.png */
export function screenshotFileName(format: 'png' | 'jpeg', date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  return `screen-capture-${yyyy}-${mm}-${dd}-${hh}${min}${ss}.${ext}`;
}

/** Converts a base64 Data URL to a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0]?.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(parts[1] ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export interface CaptureCanvasAdapter {
  createCanvas: (width: number, height: number) => HTMLCanvasElement;
}

const defaultCanvasAdapter: CaptureCanvasAdapter = {
  createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
};

/**
 * Grabs a single frame from a video element (cropped to region if specified)
 * and returns the encoded image Blob, data URL, and dimensions.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  options: CaptureFrameOptions = {},
  adapter: CaptureCanvasAdapter = defaultCanvasAdapter,
): Promise<CapturedScreenshot> {
  const format = options.format ?? 'png';
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = Math.max(0.1, Math.min(1.0, options.quality ?? 0.92));

  const sourceWidth = options.frameWidth || video.videoWidth || 1920;
  const sourceHeight = options.frameHeight || video.videoHeight || 1080;

  const rect =
    options.region && !isFullRegion(options.region)
      ? toPixelRect(options.region, sourceWidth, sourceHeight)
      : { x: 0, y: 0, width: sourceWidth, height: sourceHeight };

  const canvas = adapter.createCanvas(rect.width, rect.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('This browser could not create a 2D canvas for capturing.');
  }

  // Draw the selected slice of the video frame to the canvas
  ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

  const dataUrl = canvas.toDataURL(mimeType, quality);
  const blob = await new Promise<Blob>((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error('Failed to encode screenshot blob.'));
        },
        mimeType,
        quality,
      );
    } else {
      // Fallback for environments lacking canvas.toBlob
      resolve(dataUrlToBlob(dataUrl));
    }
  });

  return {
    blob,
    dataUrl,
    width: rect.width,
    height: rect.height,
    sizeBytes: blob.size,
    format,
  };
}

/** Copies an image blob to system clipboard (as PNG for broad browser compatibility). */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image writing is not supported in this browser.');
  }

  let pngBlob = blob;
  if (blob.type !== 'image/png') {
    // Convert to PNG for clipboard compatibility
    const img = new Image();
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to decode image for clipboard.'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot create canvas for clipboard.');
      ctx.drawImage(img, 0, 0);
      pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to convert image to PNG.'))),
          'image/png',
        );
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
  return true;
}
