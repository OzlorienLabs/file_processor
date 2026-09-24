import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserCropEnvironment, cropVideoTrack, type CropEnvironment } from './media-crop';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const REGION = { x: 0.25, y: 0.5, width: 0.5, height: 0.5 };
const track = (settings: MediaTrackSettings = { width: 800, height: 400 }) =>
  ({ getSettings: () => settings }) as unknown as MediaStreamTrack;

function frame(visibleRect: { x: number; y: number; width: number; height: number } | null) {
  return { visibleRect, close: vi.fn() };
}

describe('cropVideoTrack with VideoFrames', () => {
  it('crops each frame to the region and closes the original', async () => {
    const frames = [frame({ x: 0, y: 0, width: 800, height: 400 }), frame(null), frame({ x: 10, y: 0, width: 400, height: 200 })];
    const written: unknown[] = [];
    let closeWritable: () => void = () => undefined;
    const done = new Promise<void>((resolve) => (closeWritable = resolve));
    class Processor {
      readable = new ReadableStream({
        start(controller) {
          frames.forEach((item) => controller.enqueue(item));
          controller.close();
        },
      });
    }
    class Generator {
      stop = vi.fn();
      writable = new WritableStream({ write: (chunk) => void written.push(chunk), close: () => closeWritable() });
    }
    class Frame {
      constructor(
        public source: unknown,
        public init: unknown,
      ) {}
    }
    const env: CropEnvironment = {
      Processor: Processor as never,
      Generator: Generator as never,
      VideoFrame: Frame as never,
      createStream: vi.fn(),
      doc: document,
    };
    const cropped = cropVideoTrack(track(), REGION, 30, env);
    expect(cropped.mode).toBe('frames');
    await done;
    expect(written).toHaveLength(2);
    expect((written[0] as Frame).init).toEqual({
      visibleRect: { x: 200, y: 200, width: 400, height: 200 },
      displayWidth: 400,
      displayHeight: 200,
    });
    expect((written[1] as Frame).init).toMatchObject({ visibleRect: { x: 110, y: 100, width: 200, height: 100 } });
    frames.forEach((item) => expect(item.close).toHaveBeenCalled());
    cropped.stop();
    expect((cropped.track as unknown as Generator).stop).toHaveBeenCalled();
  });

  it('swallows the pipe rejection when stopped mid-stream', async () => {
    class Processor {
      readable = new ReadableStream();
    }
    class Generator {
      stop = vi.fn();
      writable = new WritableStream();
    }
    const env: CropEnvironment = {
      Processor: Processor as never,
      Generator: Generator as never,
      VideoFrame: class {} as never,
      createStream: vi.fn(),
      doc: document,
    };
    const cropped = cropVideoTrack(track(), REGION, 30, env);
    cropped.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((cropped.track as unknown as Generator).stop).toHaveBeenCalled();
  });
});

describe('cropVideoTrack on a canvas', () => {
  function canvasEnvironment(context: unknown = { drawImage: vi.fn() }) {
    const output = { stop: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), captureStream: vi.fn(() => ({ getVideoTracks: () => [output] })) };
    const video = { muted: false, playsInline: false, srcObject: null as unknown, videoWidth: 0, videoHeight: 0, play: vi.fn(() => Promise.reject(new Error('autoplay'))) };
    const doc = { createElement: (tag: string) => (tag === 'video' ? video : canvas) } as unknown as Document;
    const env: CropEnvironment = { createStream: vi.fn((tracks) => ({ tracks }) as unknown as MediaStream), doc };
    return { env, canvas, video, output, context };
  }

  it('redraws the region on a timer and follows size changes', () => {
    vi.useFakeTimers();
    const { env, canvas, video, output, context } = canvasEnvironment();
    const cropped = cropVideoTrack(track(), REGION, 20, env);
    expect(cropped.mode).toBe('canvas');
    expect(cropped.track).toBe(output);
    expect(canvas).toMatchObject({ width: 400, height: 200 });
    expect(canvas.captureStream).toHaveBeenCalledWith(20);
    expect(video.muted).toBe(true);

    vi.advanceTimersByTime(50);
    expect((context as { drawImage: ReturnType<typeof vi.fn> }).drawImage).not.toHaveBeenCalled();

    video.videoWidth = 1000;
    video.videoHeight = 500;
    vi.advanceTimersByTime(50);
    expect(canvas).toMatchObject({ width: 500, height: 250 });
    expect((context as { drawImage: ReturnType<typeof vi.fn> }).drawImage).toHaveBeenCalledWith(video, 250, 250, 500, 250, 0, 0, 500, 250);
    vi.advanceTimersByTime(50);
    expect((context as { drawImage: ReturnType<typeof vi.fn> }).drawImage).toHaveBeenCalledTimes(2);

    cropped.stop();
    expect(output.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it('falls back to a 720p guess and fails without a 2D context', () => {
    const { env, canvas } = canvasEnvironment();
    cropVideoTrack(track({}), { x: 0, y: 0, width: 1, height: 1 }, 30, env).stop();
    expect(canvas).toMatchObject({ width: 1280, height: 720 });
    expect(() => cropVideoTrack(track(), REGION, 30, canvasEnvironment(null).env)).toThrow(/cannot crop/);
  });
});

describe('browserCropEnvironment', () => {
  it('reads the insertable-streams constructors from the page', () => {
    class MediaStreamTrackProcessor {}
    const env = browserCropEnvironment({ MediaStreamTrackProcessor });
    expect(env.Processor).toBe(MediaStreamTrackProcessor);
    expect(env.Generator).toBeUndefined();
    expect(env.doc).toBe(document);
    vi.stubGlobal('MediaStream', class {
      constructor(public tracks: unknown[]) {}
    });
    expect(env.createStream([])).toMatchObject({ tracks: [] });
    expect(browserCropEnvironment().VideoFrame).toBeUndefined();
  });
});
