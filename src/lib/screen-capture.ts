import { cropVideoTrack, type CroppedTrack } from './media-crop';
import { isFullRegion, type Region } from './region';
import { displayMediaOptions, type RecorderSettings } from './screen-recording';

export interface CaptureEnvironment {
  mediaDevices: Pick<MediaDevices, 'getDisplayMedia' | 'getUserMedia'>;
  AudioContext?: new () => AudioContext;
  createStream: (tracks: MediaStreamTrack[]) => MediaStream;
  crop: (track: MediaStreamTrack, region: Region, fps: number) => CroppedTrack;
}

export function browserCaptureEnvironment(): CaptureEnvironment {
  return {
    mediaDevices: navigator.mediaDevices,
    AudioContext: globalThis.AudioContext,
    createStream: (tracks) => new MediaStream(tracks),
    crop: (track, region, fps) => cropVideoTrack(track, region, fps),
  };
}

/** The person closed the share picker without choosing anything. */
export class CaptureCancelledError extends Error {
  constructor() {
    super('Nothing was shared, so nothing is being recorded.');
    this.name = 'CaptureCancelledError';
  }
}

export interface Capture {
  display: MediaStream;
  microphone?: MediaStream;
  /** Things that did not work out but still leave a usable recording. */
  warnings: string[];
  stop(): void;
}

const stopStream = (stream?: MediaStream) => stream?.getTracks().forEach((track) => track.stop());

/** Opens the browser's share picker and, when asked for, the microphone. */
export async function startCapture(settings: RecorderSettings, env: CaptureEnvironment): Promise<Capture> {
  let display: MediaStream;
  try {
    display = await env.mediaDevices.getDisplayMedia(displayMediaOptions(settings) as DisplayMediaStreamOptions);
  } catch (reason) {
    if ((reason as Error)?.name === 'NotAllowedError' || (reason as Error)?.name === 'AbortError') {
      throw new CaptureCancelledError();
    }
    throw new Error('This browser could not start screen sharing.', { cause: reason });
  }

  const warnings: string[] = [];
  if (settings.systemAudio && display.getAudioTracks().length === 0) {
    warnings.push('No tab or system audio was shared. To include it, tick “Share audio” in the picker (Chrome and Edge).');
  }

  let microphone: MediaStream | undefined;
  if (settings.microphone) {
    try {
      microphone = await env.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      warnings.push('The microphone was not available, so the recording has no voice-over.');
    }
  }

  return {
    display,
    microphone,
    warnings,
    stop() {
      stopStream(display);
      stopStream(microphone);
    },
  };
}

export interface RecordingStream {
  stream: MediaStream;
  cropMode?: CroppedTrack['mode'];
  dispose(): void;
}

/**
 * The stream handed to MediaRecorder: the shared picture (cropped to `region` if one is
 * set) plus every audio source, mixed into one track when there is more than one.
 */
export function composeRecordingStream(
  capture: Capture,
  region: Region | undefined,
  fps: number,
  env: CaptureEnvironment,
): RecordingStream {
  const source = capture.display.getVideoTracks()[0];
  if (!source) throw new Error('The shared source has no picture to record.');

  const cropped = region && !isFullRegion(region) ? env.crop(source, region, fps) : undefined;
  const audio = [...capture.display.getAudioTracks(), ...(capture.microphone?.getAudioTracks() ?? [])];

  let mixer: AudioContext | undefined;
  let audioTracks = audio;
  if (audio.length > 1 && env.AudioContext) {
    mixer = new env.AudioContext();
    const destination = mixer.createMediaStreamDestination();
    for (const track of audio) {
      mixer.createMediaStreamSource(env.createStream([track])).connect(destination);
    }
    audioTracks = destination.stream.getAudioTracks();
  } else if (audio.length > 1) {
    audioTracks = audio.slice(0, 1);
  }

  return {
    stream: env.createStream([cropped?.track ?? source, ...audioTracks]),
    cropMode: cropped?.mode,
    dispose() {
      cropped?.stop();
      void mixer?.close().catch(() => undefined);
    },
  };
}
