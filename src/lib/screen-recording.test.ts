import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_RECORDER_SETTINGS,
  displayMediaOptions,
  formatClock,
  formatFromMime,
  isCaptureSupported,
  pickMimeType,
  recordingFileName,
  supportedFormats,
} from './screen-recording';

afterEach(() => vi.unstubAllGlobals());

describe('screen recording settings', () => {
  it('picks the most specific recordable type per container', () => {
    const supported = (type: string) => ['video/webm;codecs=vp8,opus', 'video/mp4'].includes(type);
    expect(pickMimeType('webm', supported)).toBe('video/webm;codecs=vp8,opus');
    expect(pickMimeType('mp4', supported)).toBe('video/mp4');
    expect(pickMimeType('mp4', () => false)).toBeUndefined();
    expect(supportedFormats(supported)).toEqual(['webm', 'mp4']);
    expect(supportedFormats((type) => type.startsWith('video/mp4'))).toEqual(['mp4']);
  });

  it('asks MediaRecorder by default and copes without it', () => {
    expect(supportedFormats()).toEqual([]);
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (type: string) => type === 'video/webm' });
    expect(pickMimeType('webm')).toBe('video/webm');
  });

  it('detects screen sharing and recording support', () => {
    const navigator = { mediaDevices: { getDisplayMedia: () => undefined } } as unknown as Navigator;
    expect(isCaptureSupported({ navigator, MediaRecorder: class {} })).toBe(true);
    expect(isCaptureSupported({ navigator })).toBe(false);
    expect(isCaptureSupported({ navigator: {} as Navigator, MediaRecorder: class {} })).toBe(false);
    expect(isCaptureSupported({})).toBe(false);
    expect(isCaptureSupported()).toBe(false);
  });

  it('builds display media options from the settings', () => {
    expect(displayMediaOptions(DEFAULT_RECORDER_SETTINGS)).toEqual({
      video: { displaySurface: 'monitor', frameRate: { ideal: 30, max: 30 }, cursor: 'always' },
      audio: false,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'include',
      systemAudio: 'exclude',
      monitorTypeSurfaces: 'include',
    });
    const options = displayMediaOptions({ ...DEFAULT_RECORDER_SETTINGS, surface: 'browser', cursor: false, systemAudio: true, fps: 60 });
    expect(options.video).toEqual({ displaySurface: 'browser', frameRate: { ideal: 60, max: 60 }, cursor: 'never' });
    expect(options.audio).toBe(true);
    expect(options.systemAudio).toBe('include');
  });

  it('names files and formats times', () => {
    expect(recordingFileName('webm', new Date(2026, 8, 4, 7, 5, 3))).toBe('screen-recording-2026-09-04-07-05-03.webm');
    expect(recordingFileName('mp4')).toMatch(/^screen-recording-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.mp4$/);
    expect(formatFromMime('video/mp4;codecs=avc1')).toBe('mp4');
    expect(formatFromMime('video/webm')).toBe('webm');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(65_900)).toBe('1:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });
});
