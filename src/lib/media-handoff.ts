/**
 * Passes a finished screen recording to the video-to-GIF tool on client-side navigation.
 * It lives in module memory only — never in storage — and is gone on reload, like every
 * other file FileKit handles.
 */
let handedOff: File | undefined;

export function handOffVideo(file: File): void {
  handedOff = file;
}

/** The recording waiting for the GIF tool, if any; reading it does not consume it. */
export function peekHandedOffVideo(): File | undefined {
  return handedOff;
}

export function clearHandedOffVideo(): void {
  handedOff = undefined;
}
