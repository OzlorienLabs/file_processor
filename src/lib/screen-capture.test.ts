import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  browserCaptureEnvironment,
  CaptureCancelledError,
  composeRecordingStream,
  startCapture,
  type Capture,
  type CaptureEnvironment,
} from './screen-capture';
import { DEFAULT_RECORDER_SETTINGS } from './screen-recording';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fakeTrack = (kind: 'audio' | 'video', label: string = kind) => ({ kind, label, stop: vi.fn() }) as unknown as MediaStreamTrack;

function fakeStream(tracks: MediaStreamTrack[]) {
  return {
    tracks,
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
  } as unknown as MediaStream & { tracks: MediaStreamTrack[] };
}

function environment(overrides: Partial<CaptureEnvironment> = {}) {
  const display = fakeStream([fakeTrack('video')]);
  const microphone = fakeStream([fakeTrack('audio', 'mic')]);
  const env: CaptureEnvironment = {
    mediaDevices: {
      getDisplayMedia: vi.fn(async () => display),
      getUserMedia: vi.fn(async () => microphone),
    },
    createStream: vi.fn((tracks: MediaStreamTrack[]) => fakeStream(tracks)),
    crop: vi.fn(() => ({ track: fakeTrack('video', 'cropped'), mode: 'frames' as const, stop: vi.fn() })),
    ...overrides,
  };
  return { env, display, microphone };
}

describe('startCapture', () => {
  it('shares the screen with the picker hints and nothing else by default', async () => {
    const { env, display } = environment();
    const capture = await startCapture(DEFAULT_RECORDER_SETTINGS, env);
    expect(env.mediaDevices.getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    expect(env.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(capture.display).toBe(display);
    expect(capture.warnings).toEqual([]);
    capture.stop();
    expect(display.getTracks()[0].stop).toHaveBeenCalled();
  });

  it('adds the microphone and warns when shared audio is missing', async () => {
    const { env, microphone } = environment();
    const capture = await startCapture({ ...DEFAULT_RECORDER_SETTINGS, systemAudio: true, microphone: true }, env);
    expect(env.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true } });
    expect(capture.microphone).toBe(microphone);
    expect(capture.warnings).toEqual([expect.stringMatching(/no tab or system audio/i)]);
    capture.stop();
    expect(microphone.getTracks()[0].stop).toHaveBeenCalled();
  });

  it('keeps recording without a microphone it could not get', async () => {
    const { env } = environment();
    vi.mocked(env.mediaDevices.getUserMedia).mockRejectedValue(new Error('denied'));
    const capture = await startCapture({ ...DEFAULT_RECORDER_SETTINGS, microphone: true }, env);
    expect(capture.microphone).toBeUndefined();
    expect(capture.warnings).toEqual([expect.stringMatching(/microphone was not available/i)]);
  });

  it('tells a cancelled picker apart from a broken one', async () => {
    const { env } = environment();
    vi.mocked(env.mediaDevices.getDisplayMedia).mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    await expect(startCapture(DEFAULT_RECORDER_SETTINGS, env)).rejects.toBeInstanceOf(CaptureCancelledError);
    vi.mocked(env.mediaDevices.getDisplayMedia).mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'AbortError' }));
    await expect(startCapture(DEFAULT_RECORDER_SETTINGS, env)).rejects.toBeInstanceOf(CaptureCancelledError);
    vi.mocked(env.mediaDevices.getDisplayMedia).mockRejectedValueOnce(undefined);
    await expect(startCapture(DEFAULT_RECORDER_SETTINGS, env)).rejects.toThrow(/could not start screen sharing/);
  });
});

describe('composeRecordingStream', () => {
  const capture = (display: MediaStream, microphone?: MediaStream): Capture => ({ display, microphone, warnings: [], stop: vi.fn() });

  it('passes the shared picture straight through without a region', () => {
    const { env, display } = environment();
    const composed = composeRecordingStream(capture(display), undefined, 30, env);
    expect((composed.stream as unknown as { tracks: MediaStreamTrack[] }).tracks).toEqual(display.getTracks());
    expect(composed.cropMode).toBeUndefined();
    composeRecordingStream(capture(display), { x: 0, y: 0, width: 1, height: 1 }, 30, env);
    expect(env.crop).not.toHaveBeenCalled();
    composed.dispose();
  });

  it('crops to a region and mixes several audio sources into one track', () => {
    const mixed = fakeTrack('audio', 'mixed');
    const connect = vi.fn();
    const close = vi.fn(() => Promise.reject(new Error('closed')));
    class FakeAudioContext {
      createMediaStreamDestination = () => ({ stream: fakeStream([mixed]) });
      createMediaStreamSource = () => ({ connect });
      close = close;
    }
    const { env } = environment({ AudioContext: FakeAudioContext as never });
    const display = fakeStream([fakeTrack('video'), fakeTrack('audio', 'tab')]);
    const microphone = fakeStream([fakeTrack('audio', 'mic')]);
    const region = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const composed = composeRecordingStream(capture(display, microphone), region, 24, env);
    expect(env.crop).toHaveBeenCalledWith(display.getVideoTracks()[0], region, 24);
    expect(composed.cropMode).toBe('frames');
    expect(connect).toHaveBeenCalledTimes(2);
    expect((composed.stream as unknown as { tracks: MediaStreamTrack[] }).tracks.map((track) => track.label)).toEqual(['cropped', 'mixed']);
    composed.dispose();
    expect(close).toHaveBeenCalled();
  });

  it('keeps the first audio source when it cannot mix', () => {
    const { env } = environment();
    const display = fakeStream([fakeTrack('video'), fakeTrack('audio', 'tab')]);
    const composed = composeRecordingStream(capture(display, fakeStream([fakeTrack('audio', 'mic')])), undefined, 30, env);
    expect((composed.stream as unknown as { tracks: MediaStreamTrack[] }).tracks.map((track) => track.label)).toEqual(['video', 'tab']);
  });

  it('refuses a share without a picture', () => {
    const { env } = environment();
    expect(() => composeRecordingStream(capture(fakeStream([])), undefined, 30, env)).toThrow(/no picture/);
  });
});

describe('browserCaptureEnvironment', () => {
  it('wires the real browser objects', () => {
    const mediaDevices = { getDisplayMedia: vi.fn(), getUserMedia: vi.fn() };
    vi.stubGlobal('navigator', { mediaDevices });
    vi.stubGlobal('MediaStream', class {
      constructor(public tracks: unknown[]) {}
    });
    const env = browserCaptureEnvironment();
    expect(env.mediaDevices).toBe(mediaDevices);
    expect(env.createStream([])).toMatchObject({ tracks: [] });
    const settings = { width: 100, height: 100 };
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // Without a 2D context the real cropper refuses, which shows the call reaches it.
    expect(() => env.crop({ getSettings: () => settings } as unknown as MediaStreamTrack, { x: 0, y: 0, width: 0.5, height: 0.5 }, 30)).toThrow(
      /cannot crop/,
    );
  });
});
