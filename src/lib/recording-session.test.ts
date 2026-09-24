import fixWebmDuration from 'fix-webm-duration';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserSessionEnvironment, createRecordingSession, type SessionEnvironment } from './recording-session';

vi.mock('fix-webm-duration', () => ({ default: vi.fn(async (blob: Blob) => new Blob([blob, 'fixed'], { type: blob.type })) }));

afterEach(() => vi.unstubAllGlobals());

/** Just enough MediaRecorder: state transitions plus data and stop events. */
class FakeRecorder extends EventTarget {
  static last: FakeRecorder;
  state: RecordingState = 'inactive';
  mimeType: string;
  timeslice?: number;

  constructor(
    public stream: MediaStream,
    public options: MediaRecorderOptions,
  ) {
    super();
    this.mimeType = options.mimeType ?? '';
    FakeRecorder.last = this;
  }

  emit(data: Blob) {
    this.dispatchEvent(Object.assign(new Event('dataavailable'), { data }));
  }

  start(timeslice: number) {
    this.timeslice = timeslice;
    this.state = 'recording';
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.emit(new Blob(['tail']));
      this.dispatchEvent(new Event('stop'));
    });
  }
}

function environment(overrides: Partial<SessionEnvironment> = {}) {
  let time = 0;
  const env: SessionEnvironment = {
    MediaRecorder: FakeRecorder as never,
    now: () => time,
    fixWebmDuration: vi.fn(async (blob: Blob) => new Blob([blob, '+duration'], { type: blob.type })),
    ...overrides,
  };
  return { env, advance: (ms: number) => (time += ms) };
}

const stream = {} as MediaStream;
const options = { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 6_000_000 };

describe('createRecordingSession', () => {
  it('records in one-second chunks and times only the active stretches', async () => {
    const { env, advance } = environment();
    const session = createRecordingSession(stream, options, env);
    expect(FakeRecorder.last.options).toEqual({ ...options, audioBitsPerSecond: 128_000 });
    session.start();
    expect(FakeRecorder.last.timeslice).toBe(1000);
    expect(session.state()).toBe('recording');

    advance(1500);
    FakeRecorder.last.emit(new Blob(['abc']));
    FakeRecorder.last.emit(new Blob([]));
    expect(session.elapsed()).toBe(1500);
    expect(session.bytes()).toBe(3);

    session.pause();
    session.pause();
    advance(10_000);
    expect(session.state()).toBe('paused');
    expect(session.elapsed()).toBe(1500);
    session.resume();
    session.resume();
    advance(500);

    const result = await session.stop();
    expect(result.durationMs).toBe(2000);
    expect(result.mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(result.blob.type).toBe('video/webm');
    expect(await result.blob.text()).toBe('abctail+duration');
    expect(env.fixWebmDuration).toHaveBeenCalledWith(expect.any(Blob), 2000);
    await expect(session.stop()).resolves.toBe(result);
  });

  it('leaves MP4 alone and keeps the raw WebM when the fix fails', async () => {
    const { env } = environment();
    const mp4 = createRecordingSession(stream, { ...options, mimeType: 'video/mp4' }, env);
    mp4.start();
    const recorded = await mp4.stop();
    expect(recorded.blob.type).toBe('video/mp4');
    expect(env.fixWebmDuration).not.toHaveBeenCalled();

    const broken = environment({ fixWebmDuration: vi.fn().mockRejectedValue(new Error('bad ebml')) });
    const webm = createRecordingSession(stream, options, broken.env);
    webm.start();
    expect(await (await webm.stop()).blob.text()).toBe('tail');
  });

  it('finishes a recorder that stopped by itself', async () => {
    const { env } = environment();
    const session = createRecordingSession(stream, options, env);
    session.start();
    FakeRecorder.last.mimeType = '';
    FakeRecorder.last.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.state()).toBe('inactive');
    const result = await session.stop();
    expect(result.mimeType).toBe(options.mimeType);
  });
});

describe('browserSessionEnvironment', () => {
  it('uses MediaRecorder, the performance clock, and fix-webm-duration', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    const env = browserSessionEnvironment();
    expect(env.MediaRecorder).toBe(FakeRecorder);
    expect(typeof env.now()).toBe('number');
    const fixed = await env.fixWebmDuration(new Blob(['raw'], { type: 'video/webm' }), 1234);
    expect(fixWebmDuration).toHaveBeenCalledWith(expect.any(Blob), 1234, { logger: false });
    expect(await fixed.text()).toBe('rawfixed');
  });
});
