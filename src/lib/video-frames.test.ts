import { describe, expect, it, vi } from 'vitest';

import { createVideoGrabber, openVideo, probeVideo, seekVideo } from './video-frames';

interface Scenario {
  width?: number;
  height?: number;
  duration?: number;
  /** What loading the source does. */
  load?: 'metadata' | 'error' | 'nothing';
  /** Duration revealed after the "seek past the end" trick; undefined keeps it unknown. */
  settlesTo?: number;
  seeks?: boolean;
}

/** A stand-in <video>: events are dispatched on a microtask, as the browser would. */
class FakeVideo extends EventTarget {
  muted = false;
  playsInline = false;
  preload = '';
  videoWidth = 0;
  videoHeight = 0;
  duration = NaN;
  removeAttribute = vi.fn();
  load = vi.fn();
  private time = 0;
  readonly seeksTo: number[] = [];

  constructor(private readonly scenario: Scenario) {
    super();
  }

  private fire(type: string) {
    queueMicrotask(() => this.dispatchEvent(new Event(type)));
  }

  set src(_url: string) {
    const { load = 'metadata', width = 640, height = 360, duration = 5 } = this.scenario;
    if (load === 'error') {
      this.fire('error');
      return;
    }
    if (load === 'nothing') return;
    this.videoWidth = width;
    this.videoHeight = height;
    this.duration = duration;
    this.fire('loadedmetadata');
  }

  get currentTime() {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    this.seeksTo.push(value);
    if (value > 1e9) {
      this.fire('durationchange');
      if (this.scenario.settlesTo !== undefined) {
        queueMicrotask(() => {
          this.duration = this.scenario.settlesTo!;
          this.dispatchEvent(new Event('durationchange'));
        });
      }
      return;
    }
    if (this.scenario.seeks !== false) this.fire('seeked');
  }
}

function fakeDocument(video: FakeVideo, context: unknown = fakeContext()) {
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
  const doc = { createElement: vi.fn((tag: string) => (tag === 'video' ? video : canvas)) };
  return { doc: doc as unknown as Document, canvas };
}

function fakeContext() {
  return {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })),
  };
}

describe('video frames', () => {
  it('probes size and length, then lets go of the file', async () => {
    const video = new FakeVideo({ width: 1280, height: 720, duration: 12.5 });
    const { doc } = fakeDocument(video);
    await expect(probeVideo('blob:clip', doc)).resolves.toEqual({ width: 1280, height: 720, duration: 12.5 });
    expect(video.muted).toBe(true);
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalled();
  });

  it('settles the unknown duration of a MediaRecorder WebM file', async () => {
    const video = new FakeVideo({ duration: Infinity, settlesTo: 3.2 });
    const { doc } = fakeDocument(video);
    const opened = await openVideo('blob:rec', doc);
    expect(opened.duration).toBe(3.2);
    expect(video.seeksTo).toEqual([Number.MAX_SAFE_INTEGER, 0]);
  });

  it('gives up on a duration that never settles', async () => {
    const video = new FakeVideo({ duration: Infinity });
    const { doc } = fakeDocument(video);
    await expect(openVideo('blob:rec', doc, 20)).rejects.toThrow(/length of that video could not be read/);
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('explains files the browser cannot open', async () => {
    await expect(openVideo('blob:x', fakeDocument(new FakeVideo({ load: 'error' })).doc)).rejects.toThrow(/cannot play that video/);
    await expect(openVideo('blob:x', fakeDocument(new FakeVideo({ load: 'nothing' })).doc, 10)).rejects.toThrow(/cannot play that video/);
    await expect(openVideo('blob:x', fakeDocument(new FakeVideo({ width: 0 })).doc)).rejects.toThrow(/no picture/);
    await expect(openVideo('blob:x', fakeDocument(new FakeVideo({ duration: 0 })).doc)).rejects.toThrow(/length/);
  });

  it('times out a seek that never lands', async () => {
    const video = new FakeVideo({ seeks: false });
    await expect(seekVideo(video as unknown as HTMLVideoElement, 1, 10)).rejects.toThrow(/stopped responding/);
  });

  it('draws the cropped, scaled frame at each requested time', async () => {
    const video = new FakeVideo({ duration: 4 });
    const context = fakeContext();
    const { doc, canvas } = fakeDocument(video, context);
    const grabber = await createVideoGrabber('blob:clip', { x: 10, y: 20, width: 300, height: 200 }, 150, 100, doc);
    expect(canvas).toMatchObject({ width: 150, height: 100 });
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    expect(context).toMatchObject({ imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });

    const pixels = await grabber.grab(1.5);
    expect(pixels).toHaveLength(150 * 100 * 4);
    expect(context.drawImage).toHaveBeenCalledWith(video, 10, 20, 300, 200, 0, 0, 150, 100);
    await grabber.grab(-1);
    await grabber.grab(99);
    expect(video.seeksTo.slice(-3)).toEqual([1.5, 0, 3.999]);

    grabber.release();
    expect(canvas).toMatchObject({ width: 0, height: 0 });
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('fails clearly without a canvas', async () => {
    const video = new FakeVideo({});
    const { doc } = fakeDocument(video, null);
    await expect(createVideoGrabber('blob:clip', { x: 0, y: 0, width: 2, height: 2 }, 2, 2, doc)).rejects.toThrow(/image canvas/);
    expect(video.removeAttribute).toHaveBeenCalled();
  });
});
