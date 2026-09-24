/** What the browser's share picker should offer first; the person can still pick anything. */
export type CaptureSurface = 'browser' | 'window' | 'monitor';
export type CaptureArea = 'full' | 'region';
export type RecordingFormat = 'webm' | 'mp4';
export type RecordingQuality = 'standard' | 'high' | 'max';

export interface RecorderSettings {
  surface: CaptureSurface;
  area: CaptureArea;
  fps: number;
  quality: RecordingQuality;
  format: RecordingFormat;
  systemAudio: boolean;
  microphone: boolean;
  cursor: boolean;
  countdown: boolean;
}

export const DEFAULT_RECORDER_SETTINGS: RecorderSettings = {
  surface: 'monitor',
  area: 'full',
  fps: 30,
  quality: 'high',
  format: 'webm',
  systemAudio: false,
  microphone: false,
  cursor: true,
  countdown: true,
};

export const RECORDING_FRAME_RATES = [15, 24, 30, 60] as const;

export const QUALITY_BITRATES: Record<RecordingQuality, number> = {
  standard: 2_500_000,
  high: 6_000_000,
  max: 12_000_000,
};

/** Most specific first, so the browser records the best codec it has. */
const MIME_CANDIDATES: Record<RecordingFormat, string[]> = {
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
  mp4: ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'],
};

export type TypeSupport = (mimeType: string) => boolean;

const browserTypeSupport: TypeSupport = (mimeType) =>
  typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType);

export function pickMimeType(format: RecordingFormat, isTypeSupported: TypeSupport = browserTypeSupport): string | undefined {
  return MIME_CANDIDATES[format].find((mimeType) => isTypeSupported(mimeType));
}

/** The container formats this browser can record, WebM first. */
export function supportedFormats(isTypeSupported: TypeSupport = browserTypeSupport): RecordingFormat[] {
  return (['webm', 'mp4'] as const).filter((format) => pickMimeType(format, isTypeSupported));
}

/** Screen sharing and recording both exist (not on most phones, and not in jsdom). */
export function isCaptureSupported(scope: { navigator?: Navigator; MediaRecorder?: unknown } = globalThis): boolean {
  return typeof scope.navigator?.mediaDevices?.getDisplayMedia === 'function' && typeof scope.MediaRecorder === 'function';
}

/**
 * `getDisplayMedia` options. `displaySurface` only preselects the picker's tab; `cursor`,
 * `systemAudio` and friends are hints browsers without them ignore.
 */
export function displayMediaOptions(settings: RecorderSettings) {
  return {
    video: {
      displaySurface: settings.surface,
      frameRate: { ideal: settings.fps, max: settings.fps },
      cursor: settings.cursor ? 'always' : 'never',
    },
    audio: settings.systemAudio,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'include',
    systemAudio: settings.systemAudio ? 'include' : 'exclude',
    monitorTypeSurfaces: 'include',
  } as const;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function recordingFileName(format: RecordingFormat, date: Date = new Date()): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `screen-recording-${day}-${time}.${format}`;
}

export function formatFromMime(mimeType: string): RecordingFormat {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** `m:ss`, or `h:mm:ss` past an hour. */
export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
