export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  /** Time spent recording, pauses excluded. */
  durationMs: number;
}

export type SessionState = 'recording' | 'paused' | 'inactive';

export interface RecordingSession {
  start(): void;
  pause(): void;
  resume(): void;
  /** Stops (if still running) and resolves with the finished file. Safe to call twice. */
  stop(): Promise<RecordingResult>;
  state(): SessionState;
  elapsed(): number;
  bytes(): number;
}

type RecorderConstructor = new (stream: MediaStream, options?: MediaRecorderOptions) => MediaRecorder;

export interface SessionEnvironment {
  MediaRecorder: RecorderConstructor;
  now: () => number;
  /** Writes the duration MediaRecorder leaves out of WebM files, so players can seek. */
  fixWebmDuration: (blob: Blob, durationMs: number) => Promise<Blob>;
}

export function browserSessionEnvironment(): SessionEnvironment {
  return {
    MediaRecorder: globalThis.MediaRecorder,
    now: () => performance.now(),
    fixWebmDuration: async (blob, durationMs) => {
      const { default: fix } = await import('fix-webm-duration');
      return fix(blob, durationMs, { logger: false });
    },
  };
}

/** Chunks arrive every second, so memory grows in small pieces and the size can be shown live. */
const TIMESLICE_MS = 1000;

export function createRecordingSession(
  stream: MediaStream,
  options: { mimeType: string; videoBitsPerSecond: number },
  env: SessionEnvironment,
): RecordingSession {
  const recorder = new env.MediaRecorder(stream, {
    mimeType: options.mimeType,
    videoBitsPerSecond: options.videoBitsPerSecond,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  let size = 0;
  let accumulated = 0;
  let segmentStart = 0;
  let running = false;

  recorder.addEventListener('dataavailable', (event: BlobEvent) => {
    if (!event.data.size) return;
    chunks.push(event.data);
    size += event.data.size;
  });

  const settle = () => {
    if (!running) return;
    accumulated += env.now() - segmentStart;
    running = false;
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.addEventListener('stop', () => {
      settle();
      resolve();
    });
  });

  let result: Promise<RecordingResult> | undefined;
  const finish = async (): Promise<RecordingResult> => {
    await stopped;
    const mimeType = recorder.mimeType || options.mimeType;
    const raw = new Blob(chunks, { type: mimeType.split(';')[0] });
    let blob = raw;
    if (raw.type === 'video/webm' && raw.size) {
      try {
        blob = await env.fixWebmDuration(raw, accumulated);
      } catch {
        blob = raw;
      }
    }
    return { blob, mimeType, durationMs: accumulated };
  };

  return {
    start() {
      recorder.start(TIMESLICE_MS);
      segmentStart = env.now();
      running = true;
    },
    pause() {
      if (recorder.state !== 'recording') return;
      recorder.pause();
      settle();
    },
    resume() {
      if (recorder.state !== 'paused') return;
      recorder.resume();
      segmentStart = env.now();
      running = true;
    },
    stop() {
      if (recorder.state !== 'inactive') recorder.stop();
      result ??= finish();
      return result;
    },
    state: () => recorder.state,
    elapsed: () => accumulated + (running ? env.now() - segmentStart : 0),
    bytes: () => size,
  };
}
