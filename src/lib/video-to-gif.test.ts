import { describe, expect, it, vi } from 'vitest';

import type { GifEngine } from './gif-encode';
import type { FrameGrabber } from './video-frames';
import {
  encodeGif,
  formatSeconds,
  MAX_GIF_FRAMES,
  planFrames,
  scaledHeight,
  widthChoices,
} from './video-to-gif';

function grabber(width = 2, height = 1): FrameGrabber & { grab: ReturnType<typeof vi.fn> } {
  let shade = 0;
  return {
    width,
    height,
    grab: vi.fn(async () => {
      shade += 40;
      return new Uint8ClampedArray(width * height * 4).fill(shade);
    }),
    release: vi.fn(),
  };
}

const fakeEngine = (): GifEngine => ({
  GIFEncoder: () => ({ writeFrame: vi.fn(), finish: vi.fn(), bytes: () => new Uint8Array([71, 73, 70]) }),
  quantize: () => [[0, 0, 0]],
});

describe('planFrames', () => {
  it('samples the clip at the frame rate and carries delay rounding', () => {
    const plan = planFrames(1, 2, 15, 1);
    expect(plan.times).toHaveLength(15);
    expect(plan.times[0]).toBe(1);
    expect(plan.times[14]).toBeCloseTo(1 + 14 / 15);
    expect(plan.delaysCs.slice(0, 3)).toEqual([7, 6, 7]);
    expect(plan.delaysCs.reduce((sum, delay) => sum + delay, 0)).toBe(100);
  });

  it('covers more footage per frame when sped up, and always yields a frame', () => {
    const sped = planFrames(0, 4, 10, 2).times;
    expect(sped).toHaveLength(20);
    expect(sped[1]).toBeCloseTo(0.2);
    expect(sped[19]).toBeCloseTo(3.8);
    expect(planFrames(3, 3, 10, 1).times).toEqual([3]);
    expect(planFrames(0, 10_000, 30, 1).times).toHaveLength(MAX_GIF_FRAMES + 1);
  });
});

describe('sizes and labels', () => {
  it('offers widths that never upscale', () => {
    expect(widthChoices(1006)).toEqual([1006, 960, 800, 640, 480, 320]);
    expect(widthChoices(4000)[0]).toBe(1920);
    expect(widthChoices(300)).toEqual([300]);
    expect(scaledHeight(1920, 1080, 800)).toBe(450);
    expect(scaledHeight(1000, 1, 10)).toBe(1);
  });

  it('formats trim positions', () => {
    expect(formatSeconds(0)).toBe('0:00.0');
    expect(formatSeconds(-3)).toBe('0:00.0');
    expect(formatSeconds(3.94)).toBe('0:03.9');
    expect(formatSeconds(59.96)).toBe('1:00.0');
    expect(formatSeconds(125.25)).toBe('2:05.3');
  });
});

describe('encodeGif', () => {
  it('grabs every planned frame and reports progress', async () => {
    const source = grabber();
    const progress = vi.fn();
    const plan = planFrames(0, 0.3, 10, 1);
    const result = await encodeGif({
      grabber: source,
      plan,
      settings: { colors: 64, dither: false, loop: true },
      onProgress: progress,
      loadEngine: async () => fakeEngine(),
    });
    expect(source.grab.mock.calls.map(([time]) => time)).toEqual(plan.times);
    expect(progress.mock.calls).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(result).toMatchObject({ width: 2, height: 1, frames: 3, duration: 0.3 });
    expect(result.blob.type).toBe('image/gif');
  });

  it('encodes with the real gifenc engine by default', async () => {
    const result = await encodeGif({
      grabber: grabber(4, 2),
      plan: planFrames(0, 0.2, 10, 1),
      settings: { colors: 256, dither: true, loop: false },
    });
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe('GIF89a');
  });

  it('refuses plans over the frame limit before loading anything', async () => {
    const loadEngine = vi.fn();
    await expect(
      encodeGif({ grabber: grabber(), plan: planFrames(0, 1000, 30, 1), settings: { colors: 256, dither: false, loop: true }, loadEngine }),
    ).rejects.toThrow(/more than 1200 frames/);
    expect(loadEngine).not.toHaveBeenCalled();
  });

  it('stops when cancelled, before or during a frame read', async () => {
    const before = new AbortController();
    before.abort();
    await expect(
      encodeGif({ grabber: grabber(), plan: planFrames(0, 1, 5, 1), settings: { colors: 8, dither: false, loop: true }, signal: before.signal, loadEngine: async () => fakeEngine() }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    const during = new AbortController();
    const source = grabber();
    source.grab.mockImplementationOnce(async () => {
      during.abort();
      return new Uint8ClampedArray(8);
    });
    await expect(
      encodeGif({ grabber: source, plan: planFrames(0, 1, 5, 1), settings: { colors: 8, dither: false, loop: true }, signal: during.signal, loadEngine: async () => fakeEngine() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(source.grab).toHaveBeenCalledTimes(1);
  });
});
