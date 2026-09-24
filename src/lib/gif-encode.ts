import type { GifEncoderStream, Palette } from 'gifenc';

/** The two gifenc entry points the writer needs; injected so tests never load the real encoder. */
export interface GifEngine {
  GIFEncoder: () => GifEncoderStream;
  quantize: (rgba: Uint8Array, maxColors: number, options?: { format?: 'rgb565' }) => Palette;
}

export interface GifSettings {
  width: number;
  height: number;
  /** Palette size per frame, 2–256. */
  colors: number;
  /** Floyd–Steinberg error diffusion: smoother gradients, noisier flat areas. */
  dither: boolean;
  /** Loop forever, or play once and stop on the last frame. */
  loop: boolean;
}

/**
 * How far (per RGB channel) a pixel may drift from what was last drawn before it counts as
 * changed. Video codecs add a little noise to still areas; redrawing that noise would bloat
 * the GIF and make dithered areas shimmer.
 */
export const CHANGE_TOLERANCE = 6;

interface PendingFrame {
  index: Uint8Array;
  palette: Palette;
  transparentIndex: number;
  delayCs: number;
}

export interface GifWriter {
  /** Adds one RGBA frame shown for `delayCs` hundredths of a second. */
  addFrame(rgba: Uint8ClampedArray | Uint8Array, delayCs: number): void;
  /** Writes the trailer and returns the finished file. */
  finish(): Uint8Array;
  /** Frames actually stored; runs of identical frames collapse into one longer frame. */
  readonly frameCount: number;
}

/** 6 bits per channel: close enough for nearest-colour lookups, small enough to cache. */
const cacheKey = (r: number, g: number, b: number) => ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);

function nearestIndex(palette: Palette, r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const colour = palette[i];
    const dr = colour[0] - r;
    const dg = colour[1] - g;
    const db = colour[2] - b;
    const distance = dr * dr * 2 + dg * dg * 4 + db * db * 3;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

const clampByte = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));

/**
 * Streams frames into a GIF with a fresh palette per frame (so every frame gets the best
 * 256 colours for what it shows) and frame differencing: pixels that did not change are
 * written as transparent over the previous frame. Screen recordings are mostly still, so
 * this keeps files small and text crisp, and dithering never flickers on static areas.
 */
export function createGifWriter(engine: GifEngine, settings: GifSettings): GifWriter {
  const { width, height, dither, loop } = settings;
  const colors = Math.max(2, Math.min(256, Math.round(settings.colors)));
  const pixels = width * height;
  const drawn = new Uint8ClampedArray(pixels * 4);
  const changed = new Uint8Array(pixels);
  const cache = new Int16Array(1 << 18);
  const encoder = engine.GIFEncoder();
  let pending: PendingFrame | undefined;
  let written = 0;
  let first = true;

  const flush = () => {
    if (!pending) return;
    const transparent = pending.transparentIndex >= 0;
    encoder.writeFrame(pending.index, width, height, {
      palette: pending.palette,
      delay: pending.delayCs * 10,
      repeat: loop ? 0 : -1,
      transparent,
      transparentIndex: transparent ? pending.transparentIndex : 0,
      // Leave each frame in place so the next frame's transparent pixels show it.
      dispose: 1,
    });
    written += 1;
    pending = undefined;
  };

  const markChanges = (rgba: Uint8ClampedArray | Uint8Array): number => {
    if (first) {
      changed.fill(1);
      return pixels;
    }
    let count = 0;
    for (let i = 0, p = 0; i < pixels; i++, p += 4) {
      const moved =
        Math.abs(rgba[p] - drawn[p]) > CHANGE_TOLERANCE ||
        Math.abs(rgba[p + 1] - drawn[p + 1]) > CHANGE_TOLERANCE ||
        Math.abs(rgba[p + 2] - drawn[p + 2]) > CHANGE_TOLERANCE;
      changed[i] = moved ? 1 : 0;
      if (moved) count += 1;
    }
    return count;
  };

  const lookup = (palette: Palette, r: number, g: number, b: number) => {
    const key = cacheKey(r, g, b);
    const hit = cache[key];
    if (hit > 0) return hit - 1;
    const found = nearestIndex(palette, r, g, b);
    cache[key] = found + 1;
    return found;
  };

  const mapPixels = (rgba: Uint8ClampedArray | Uint8Array, palette: Palette, transparentIndex: number) => {
    const index = new Uint8Array(pixels);
    cache.fill(0);
    if (!dither) {
      for (let i = 0, p = 0; i < pixels; i++, p += 4) {
        index[i] = changed[i] ? lookup(palette, rgba[p], rgba[p + 1], rgba[p + 2]) : transparentIndex;
      }
      return index;
    }
    // Floyd–Steinberg: carry each pixel's rounding error to its unvisited neighbours.
    let current = new Float32Array((width + 2) * 3);
    let next = new Float32Array((width + 2) * 3);
    for (let y = 0; y < height; y++) {
      next.fill(0);
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!changed[i]) {
          index[i] = transparentIndex;
          continue;
        }
        const p = i * 4;
        const e = (x + 1) * 3;
        const r = clampByte(rgba[p] + current[e]);
        const g = clampByte(rgba[p + 1] + current[e + 1]);
        const b = clampByte(rgba[p + 2] + current[e + 2]);
        const chosen = lookup(palette, r, g, b);
        index[i] = chosen;
        const colour = palette[chosen];
        for (let c = 0; c < 3; c++) {
          const error = (c === 0 ? r : c === 1 ? g : b) - colour[c];
          current[e + 3 + c] += (error * 7) / 16;
          next[e - 3 + c] += (error * 3) / 16;
          next[e + c] += (error * 5) / 16;
          next[e + 3 + c] += error / 16;
        }
      }
      [current, next] = [next, current];
    }
    return index;
  };

  return {
    get frameCount() {
      return written + (pending ? 1 : 0);
    },
    addFrame(rgba, delayCs) {
      if (rgba.length !== pixels * 4) {
        throw new Error(`Expected a ${width}×${height} RGBA frame.`);
      }
      const delay = Math.max(1, Math.round(delayCs));
      const count = markChanges(rgba);
      if (count === 0) {
        // Nothing moved: hold the previous frame longer instead of storing an empty one.
        pending!.delayCs += delay;
        return;
      }
      flush();

      const sample = new Uint8Array(count * 4);
      for (let i = 0, p = 0, s = 0; i < pixels; i++, p += 4) {
        if (!changed[i]) continue;
        sample[s] = rgba[p];
        sample[s + 1] = rgba[p + 1];
        sample[s + 2] = rgba[p + 2];
        sample[s + 3] = 255;
        s += 4;
      }
      // Later frames give one palette slot to transparency.
      const palette = engine.quantize(sample, first ? colors : colors - 1, { format: 'rgb565' }).slice(0, first ? 256 : 255);
      const transparentIndex = first ? -1 : palette.length;
      const index = mapPixels(rgba, palette, transparentIndex);
      if (!first) palette.push([0, 0, 0]);

      for (let i = 0, p = 0; i < pixels; i++, p += 4) {
        if (!changed[i]) continue;
        drawn[p] = rgba[p];
        drawn[p + 1] = rgba[p + 1];
        drawn[p + 2] = rgba[p + 2];
      }
      pending = { index, palette, transparentIndex, delayCs: delay };
      first = false;
    },
    finish() {
      flush();
      encoder.finish();
      return encoder.bytes();
    },
  };
}
