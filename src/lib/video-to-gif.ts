import { createGifWriter, type GifEngine, type GifSettings } from './gif-encode';
import type { FrameGrabber } from './video-frames';

/** A GIF longer than this becomes unwieldy to encode in a tab and to share. */
export const MAX_GIF_FRAMES = 1200;
export const MAX_GIF_WIDTH = 1920;

export const GIF_FRAME_RATES = [5, 10, 12, 15, 20, 25, 30] as const;
export const GIF_SPEEDS = [0.5, 1, 1.5, 2, 3] as const;
export const GIF_WIDTHS = [1280, 960, 800, 640, 480, 320] as const;
export const GIF_COLOURS = [256, 128, 64, 32] as const;

export interface FramePlan {
  /** Source time (seconds) of each output frame. */
  times: number[];
  /** Hundredths of a second each frame is shown; rounding is carried so the total stays exact. */
  delaysCs: number[];
}

/**
 * Samples `start`–`end` of the source at `fps` output frames per second. `speed` stretches
 * the source step, so a 2× GIF covers twice the footage per frame at the same frame rate.
 */
export function planFrames(start: number, end: number, fps: number, speed: number): FramePlan {
  const step = speed / fps;
  const span = Math.max(0, end - start);
  const count = Math.max(1, Math.min(MAX_GIF_FRAMES + 1, Math.ceil(span / step - 1e-9)));
  const times = Array.from({ length: count }, (_, index) => start + index * step);
  const delaysCs = times.map((_, index) => Math.round(((index + 1) * 100) / fps) - Math.round((index * 100) / fps));
  return { times, delaysCs };
}

/** Output height for a crop scaled to `width`, keeping its aspect ratio. */
export function scaledHeight(cropWidth: number, cropHeight: number, width: number): number {
  return Math.max(1, Math.round((cropHeight * width) / cropWidth));
}

/** Width choices that do not upscale the crop; the crop's own width is always offered. */
export function widthChoices(cropWidth: number): number[] {
  const own = Math.min(cropWidth, MAX_GIF_WIDTH);
  return [own, ...GIF_WIDTHS.filter((width) => width < own)];
}

export interface GifResult {
  blob: Blob;
  width: number;
  height: number;
  /** Frames stored in the file after identical frames were merged. */
  frames: number;
  /** Seconds the GIF plays for one loop. */
  duration: number;
}

export interface EncodeGifOptions {
  grabber: FrameGrabber;
  plan: FramePlan;
  settings: Omit<GifSettings, 'width' | 'height'>;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  loadEngine?: () => Promise<GifEngine>;
}

const loadGifenc = async (): Promise<GifEngine> => {
  const { GIFEncoder, quantize } = await import('gifenc');
  return { GIFEncoder: () => GIFEncoder(), quantize };
};

const abortError = () => new DOMException('The GIF was cancelled.', 'AbortError');

/** Reads every planned frame through the grabber and encodes them into one GIF. */
export async function encodeGif({
  grabber,
  plan,
  settings,
  signal,
  onProgress,
  loadEngine = loadGifenc,
}: EncodeGifOptions): Promise<GifResult> {
  if (plan.times.length > MAX_GIF_FRAMES) {
    throw new Error(`That would be more than ${MAX_GIF_FRAMES} frames. Shorten the clip, lower the frame rate, or raise the speed.`);
  }
  const engine = await loadEngine();
  const { width, height } = grabber;
  const writer = createGifWriter(engine, { ...settings, width, height });
  const total = plan.times.length;
  onProgress?.(0, total);
  for (let index = 0; index < total; index++) {
    if (signal?.aborted) throw abortError();
    const rgba = await grabber.grab(plan.times[index]);
    if (signal?.aborted) throw abortError();
    writer.addFrame(rgba, plan.delaysCs[index]);
    onProgress?.(index + 1, total);
  }
  const bytes = writer.finish();
  const duration = plan.delaysCs.reduce((sum, delay) => sum + delay, 0) / 100;
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/gif' }),
    width,
    height,
    frames: writer.frameCount,
    duration,
  };
}

/** `m:ss.s` for trim positions. */
export function formatSeconds(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  return `${minutes}:${rest}`;
}
