import { GIFEncoder, quantize, type WriteFrameOptions } from 'gifenc';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { CHANGE_TOLERANCE, createGifWriter, type GifEngine } from './gif-encode';

interface Written {
  index: Uint8Array;
  width: number;
  height: number;
  options: WriteFrameOptions;
}

/** Records frames; the palette is the distinct colours of the sample, in order. */
function fakeEngine() {
  const written: Written[] = [];
  const quantizeSpy = vi.fn((rgba: Uint8Array, maxColors: number) => {
    const seen = new Map<string, number[]>();
    for (let p = 0; p < rgba.length; p += 4) seen.set(`${rgba[p]},${rgba[p + 1]},${rgba[p + 2]}`, [rgba[p], rgba[p + 1], rgba[p + 2]]);
    return [...seen.values()].slice(0, maxColors);
  });
  const engine: GifEngine = {
    GIFEncoder: () => ({
      writeFrame: (index, width, height, options = {}) => written.push({ index: index.slice(), width, height, options }),
      finish: vi.fn(),
      bytes: () => new Uint8Array([1, 2, 3]),
    }),
    quantize: quantizeSpy,
  };
  return { engine, written, quantize: quantizeSpy };
}

/** A width×height RGBA frame filled from a per-pixel colour function. */
function frame(width: number, height: number, colour: (index: number) => [number, number, number]) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = colour(i);
    rgba.set([r, g, b, 255], i * 4);
  }
  return rgba;
}

const RED: [number, number, number] = [220, 20, 30];
const BLUE: [number, number, number] = [10, 40, 200];

describe('createGifWriter', () => {
  it('writes the first frame whole, with its own palette and the loop setting', () => {
    const { engine, written, quantize } = fakeEngine();
    const writer = createGifWriter(engine, { width: 2, height: 2, colors: 256, dither: false, loop: true });
    writer.addFrame(frame(2, 2, (i) => (i < 2 ? RED : BLUE)), 7);
    expect(writer.frameCount).toBe(1);
    expect(writer.finish()).toEqual(new Uint8Array([1, 2, 3]));
    expect(quantize).toHaveBeenCalledWith(expect.any(Uint8Array), 256, { format: 'rgb565' });
    expect(written).toHaveLength(1);
    expect(Array.from(written[0].index)).toEqual([0, 0, 1, 1]);
    expect(written[0].options).toEqual({
      palette: [RED, BLUE],
      delay: 70,
      repeat: 0,
      transparent: false,
      transparentIndex: 0,
      dispose: 1,
    });
  });

  it('holds a frame longer when nothing moved, within the noise tolerance', () => {
    const { engine, written } = fakeEngine();
    const writer = createGifWriter(engine, { width: 2, height: 1, colors: 64, dither: false, loop: false });
    writer.addFrame(frame(2, 1, () => RED), 7);
    writer.addFrame(frame(2, 1, () => [RED[0] + CHANGE_TOLERANCE, RED[1], RED[2]]), 6);
    expect(writer.frameCount).toBe(1);
    writer.finish();
    expect(written).toHaveLength(1);
    expect(written[0].options).toMatchObject({ delay: 130, repeat: -1 });
  });

  it('redraws only changed pixels, leaving the rest transparent', () => {
    const { engine, written, quantize } = fakeEngine();
    const writer = createGifWriter(engine, { width: 3, height: 1, colors: 16, dither: false, loop: true });
    writer.addFrame(frame(3, 1, () => RED), 5);
    writer.addFrame(frame(3, 1, (i) => (i === 1 ? BLUE : RED)), 5);
    writer.finish();
    expect(written).toHaveLength(2);
    expect(quantize).toHaveBeenLastCalledWith(new Uint8Array([...BLUE, 255]), 15, { format: 'rgb565' });
    expect(Array.from(written[1].index)).toEqual([1, 0, 1]);
    expect(written[1].options).toMatchObject({ palette: [BLUE, [0, 0, 0]], transparent: true, transparentIndex: 1, dispose: 1 });

    // The comparison is against what was last drawn, so slow drift still gets redrawn.
    writer.addFrame(frame(3, 1, (i) => (i === 1 ? BLUE : [RED[0] - 7, RED[1], RED[2]])), 5);
    writer.finish();
    expect(Array.from(written[2].index)).toEqual([0, 1, 0]);
  });

  it('diffuses rounding error when dithering', () => {
    const { engine, written } = fakeEngine();
    engine.quantize = () => [
      [0, 0, 0],
      [255, 255, 255],
    ];
    const writer = createGifWriter(engine, { width: 4, height: 4, colors: 2, dither: true, loop: true });
    writer.addFrame(frame(4, 4, () => [128, 128, 128]), 10);
    writer.addFrame(frame(4, 4, (i) => (i < 8 ? [128, 128, 128] : [60, 60, 60])), 10);
    writer.finish();
    const first = Array.from(written[0].index);
    expect(first).toContain(0);
    expect(first).toContain(1);
    // Unchanged rows stay transparent even with dithering on.
    expect(Array.from(written[1].index).slice(0, 8)).toEqual(Array(8).fill(2));
  });

  it('keeps diffused error inside the colour range', () => {
    const { engine, written } = fakeEngine();
    engine.quantize = () => [[128, 128, 128]];
    for (const shade of [0, 255]) {
      const writer = createGifWriter(engine, { width: 4, height: 2, colors: 2, dither: true, loop: true });
      writer.addFrame(frame(4, 2, () => [shade, shade, shade]), 10);
      writer.finish();
      expect(writer.frameCount).toBe(1);
    }
    expect(written.map((item) => Array.from(item.index))).toEqual([Array(8).fill(0), Array(8).fill(0)]);
  });

  it('clamps the palette size and rejects frames of the wrong size', () => {
    const { engine, quantize } = fakeEngine();
    const writer = createGifWriter(engine, { width: 2, height: 2, colors: 999, dither: false, loop: true });
    expect(() => writer.addFrame(new Uint8ClampedArray(4), 5)).toThrow(/2×2 RGBA frame/);
    writer.addFrame(frame(2, 2, () => RED), 0);
    expect(quantize).toHaveBeenCalledWith(expect.any(Uint8Array), 256, { format: 'rgb565' });
  });

  it('produces a GIF that decodes to the frames it was given', async () => {
    const engine: GifEngine = { GIFEncoder: () => GIFEncoder(), quantize };
    const writer = createGifWriter(engine, { width: 8, height: 4, colors: 256, dither: false, loop: true });
    writer.addFrame(frame(8, 4, () => RED), 10);
    writer.addFrame(frame(8, 4, () => RED), 10);
    writer.addFrame(frame(8, 4, (i) => (i % 8 < 4 ? RED : BLUE)), 20);
    const bytes = writer.finish();
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe('GIF89a');
    expect(bytes[bytes.length - 1]).toBe(0x3b);

    const image = sharp(bytes, { animated: true });
    const meta = await image.metadata();
    expect(meta.pages).toBe(2);
    expect(meta.delay).toEqual([200, 200]);
    const last = await sharp(bytes, { page: 1 }).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number) => Array.from(last.data.subarray(x * last.info.channels, x * last.info.channels + 3));
    expect(Math.abs(pixel(0)[0] - RED[0])).toBeLessThan(8);
    expect(Math.abs(pixel(7)[2] - BLUE[2])).toBeLessThan(8);
  });
});
