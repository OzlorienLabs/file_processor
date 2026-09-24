import { toPixelRect, type Region } from './region';

export interface CroppedTrack {
  track: MediaStreamTrack;
  /**
   * `frames` crops each VideoFrame without drawing (keeps working while this tab is hidden);
   * `canvas` redraws onto a canvas on a timer, which browsers slow down in background tabs.
   */
  mode: 'frames' | 'canvas';
  stop(): void;
}

interface FrameLike {
  visibleRect: { x: number; y: number; width: number; height: number } | null;
  close(): void;
}

type ProcessorConstructor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<FrameLike> };
type GeneratorConstructor = new (init: { kind: 'video' }) => MediaStreamTrack & { writable: WritableStream<unknown> };
type FrameConstructor = new (frame: FrameLike, init: { visibleRect: DOMRectInit; displayWidth: number; displayHeight: number }) => unknown;

export interface CropEnvironment {
  Processor?: ProcessorConstructor;
  Generator?: GeneratorConstructor;
  VideoFrame?: FrameConstructor;
  createStream: (tracks: MediaStreamTrack[]) => MediaStream;
  doc: Document;
}

export function browserCropEnvironment(scope: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): CropEnvironment {
  return {
    Processor: scope.MediaStreamTrackProcessor as ProcessorConstructor | undefined,
    Generator: scope.MediaStreamTrackGenerator as GeneratorConstructor | undefined,
    VideoFrame: scope.VideoFrame as FrameConstructor | undefined,
    createStream: (tracks) => new MediaStream(tracks),
    doc: document,
  };
}

function cropWithFrames(
  track: MediaStreamTrack,
  region: Region,
  Processor: ProcessorConstructor,
  Generator: GeneratorConstructor,
  VideoFrameCtor: FrameConstructor,
): CroppedTrack {
  const processor = new Processor({ track });
  const generator = new Generator({ kind: 'video' });
  const abort = new AbortController();
  const cropper = new TransformStream<FrameLike, unknown>({
    transform(frame, controller) {
      try {
        const visible = frame.visibleRect ?? { x: 0, y: 0, width: 0, height: 0 };
        if (!visible.width || !visible.height) return;
        const rect = toPixelRect(region, visible.width, visible.height);
        controller.enqueue(
          new VideoFrameCtor(frame, {
            visibleRect: { x: visible.x + rect.x, y: visible.y + rect.y, width: rect.width, height: rect.height },
            displayWidth: rect.width,
            displayHeight: rect.height,
          }),
        );
      } finally {
        frame.close();
      }
    },
  });
  processor.readable
    .pipeThrough(cropper)
    .pipeTo(generator.writable, { signal: abort.signal })
    .catch(() => undefined);
  return {
    track: generator,
    mode: 'frames',
    stop() {
      abort.abort();
      generator.stop();
    },
  };
}

function cropWithCanvas(track: MediaStreamTrack, region: Region, fps: number, env: CropEnvironment): CroppedTrack {
  const video = env.doc.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = env.createStream([track]);
  void video.play()?.catch(() => undefined);

  const canvas = env.doc.createElement('canvas');
  const settings = track.getSettings();
  const initial = toPixelRect(region, settings.width ?? 1280, settings.height ?? 720);
  canvas.width = initial.width;
  canvas.height = initial.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot crop the recording.');

  const draw = () => {
    if (!video.videoWidth || !video.videoHeight) return;
    const rect = toPixelRect(region, video.videoWidth, video.videoHeight);
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    context.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  };
  const timer = setInterval(draw, Math.round(1000 / fps));
  const output = canvas.captureStream(fps).getVideoTracks()[0];
  return {
    track: output,
    mode: 'canvas',
    stop() {
      clearInterval(timer);
      output.stop();
      video.srcObject = null;
    },
  };
}

/** A video track showing only `region` of `track`; the source track is left running. */
export function cropVideoTrack(
  track: MediaStreamTrack,
  region: Region,
  fps: number,
  env: CropEnvironment = browserCropEnvironment(),
): CroppedTrack {
  if (env.Processor && env.Generator && env.VideoFrame) {
    return cropWithFrames(track, region, env.Processor, env.Generator, env.VideoFrame);
  }
  return cropWithCanvas(track, region, fps, env);
}
