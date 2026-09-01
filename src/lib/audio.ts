import { readBlobBytes } from './files';

export interface DecodedAudio {
  sampleRate: number;
  length: number;
  channelData: Float32Array[];
}

interface AudioBufferLike {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData: (channel: number) => Float32Array;
}

export type AudioDecoder = (bytes: ArrayBuffer) => Promise<AudioBufferLike>;

const browserAudioDecoder: AudioDecoder = async (bytes) => {
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(bytes);
  } finally {
    await context.close();
  }
};

export async function decodeAudioFile(
  file: Blob,
  decode: AudioDecoder = browserAudioDecoder,
): Promise<DecodedAudio> {
  const buffer = await decode(await readBlobBytes(file));
  const channelData = Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  return { sampleRate: buffer.sampleRate, length: buffer.length, channelData };
}

export function durationSeconds(decoded: DecodedAudio): number {
  return decoded.length / decoded.sampleRate;
}

export interface SampleRange {
  from: number;
  to: number;
}

export function planChunks(totalSamples: number, sampleRate: number, maxSeconds: number): SampleRange[] {
  if (totalSamples <= 0) return [];
  const chunkSamples = Math.max(1, Math.floor(maxSeconds * sampleRate));
  const ranges: SampleRange[] = [];
  for (let from = 0; from < totalSamples; from += chunkSamples) {
    ranges.push({ from, to: Math.min(totalSamples, from + chunkSamples) });
  }
  return ranges;
}

function clampSample(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function encodeWavPcm16(decoded: DecodedAudio, range?: SampleRange): Blob {
  const from = range?.from ?? 0;
  const to = range?.to ?? decoded.length;
  const frames = Math.max(0, to - from);
  const channels = decoded.channelData.length;
  const dataBytes = frames * channels * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, decoded.sampleRate, true);
  view.setUint32(28, decoded.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = from; frame < to; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clampSample(decoded.channelData[channel][frame] ?? 0);
      view.setInt16(offset, Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)), true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
