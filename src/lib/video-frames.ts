import type { PixelRect } from './region';

export interface VideoInfo {
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
}

/** Reads one frame of the source, already cropped and scaled, as RGBA pixels. */
export interface FrameGrabber {
  readonly width: number;
  readonly height: number;
  grab(time: number): Promise<Uint8ClampedArray>;
  release(): void;
}

const LOAD_TIMEOUT_MS = 20_000;
const SEEK_TIMEOUT_MS = 15_000;

/** Resolves on the first of `events`, rejects on `error` or after `timeoutMs`. */
function waitFor(video: HTMLVideoElement, events: string[], timeoutMs: number, failure: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (callback: () => void) => {
      clearTimeout(timer);
      for (const event of events) video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
      callback();
    };
    const onEvent = () => done(resolve);
    const onError = () => done(() => reject(new Error(failure)));
    const timer = setTimeout(() => done(() => reject(new Error(failure))), timeoutMs);
    for (const event of events) video.addEventListener(event, onEvent);
    video.addEventListener('error', onError);
  });
}

/** Moves the playhead and waits until the frame at `time` is ready to draw. */
export async function seekVideo(video: HTMLVideoElement, time: number, timeoutMs = SEEK_TIMEOUT_MS): Promise<void> {
  const ready = waitFor(video, ['seeked'], timeoutMs, 'The video stopped responding while frames were read.');
  video.currentTime = time;
  await ready;
}

/**
 * MediaRecorder's WebM files carry no duration, so browsers report `Infinity` until they
 * have read to the end. Seeking far past the end makes them scan the file and settle it.
 */
async function settleDuration(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (Number.isFinite(video.duration)) return;
  const settled = new Promise<void>((resolve) => {
    const check = () => {
      if (!Number.isFinite(video.duration)) return;
      clearTimeout(timer);
      video.removeEventListener('durationchange', check);
      video.removeEventListener('timeupdate', check);
      resolve();
    };
    const timer = setTimeout(() => {
      video.removeEventListener('durationchange', check);
      video.removeEventListener('timeupdate', check);
      resolve();
    }, timeoutMs);
    video.addEventListener('durationchange', check);
    video.addEventListener('timeupdate', check);
  });
  video.currentTime = Number.MAX_SAFE_INTEGER;
  await settled;
  await seekVideo(video, 0, timeoutMs);
}

/** A detached, muted video element with its metadata (and a finite duration) loaded. */
export async function openVideo(url: string, doc: Document = document, timeoutMs = LOAD_TIMEOUT_MS): Promise<HTMLVideoElement> {
  const video = doc.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const loaded = waitFor(video, ['loadedmetadata'], timeoutMs, 'This browser cannot play that video. Try an MP4 (H.264) or WebM file.');
  video.src = url;
  try {
    await loaded;
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('That file has no picture to turn into a GIF.');
    }
    await settleDuration(video, timeoutMs);
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('The length of that video could not be read.');
    }
    return video;
  } catch (reason) {
    closeVideo(video);
    throw reason;
  }
}

function closeVideo(video: HTMLVideoElement) {
  video.removeAttribute('src');
  video.load();
}

/** Size and length of a video, read without touching the player on the page. */
export async function probeVideo(url: string, doc: Document = document): Promise<VideoInfo> {
  const video = await openVideo(url, doc);
  const info = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
  closeVideo(video);
  return info;
}

/**
 * Seeks a private copy of the video frame by frame and draws `crop` of each frame onto a
 * `width`×`height` canvas. Keeping the canvas and the element for the whole run avoids
 * reallocating them per frame; `release()` frees both.
 */
export async function createVideoGrabber(
  url: string,
  crop: PixelRect,
  width: number,
  height: number,
  doc: Document = document,
): Promise<FrameGrabber> {
  const video = await openVideo(url, doc);
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    closeVideo(video);
    throw new Error('This browser cannot create an image canvas.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const last = Math.max(0, video.duration - 0.001);

  return {
    width,
    height,
    async grab(time) {
      await seekVideo(video, Math.min(Math.max(0, time), last));
      context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    },
    release() {
      closeVideo(video);
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
