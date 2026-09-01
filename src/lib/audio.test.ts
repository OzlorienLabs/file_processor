import { describe, expect, it } from 'vitest';

import {
  decodeAudioFile,
  durationSeconds,
  encodeWavPcm16,
  planChunks,
  type DecodedAudio,
} from './audio';

function fakeBuffer(channels: Float32Array[], sampleRate = 8000) {
  return {
    sampleRate,
    length: channels[0]?.length ?? 0,
    numberOfChannels: channels.length,
    getChannelData: (index: number) => channels[index],
  };
}

describe('decodeAudioFile', () => {
  it('normalizes an AudioBuffer into plain channel data', async () => {
    const left = new Float32Array([0.5, -0.5]);
    const right = new Float32Array([1, -1]);
    const decoded = await decodeAudioFile(new Blob(['x']), async () => fakeBuffer([left, right]));

    expect(decoded.sampleRate).toBe(8000);
    expect(decoded.length).toBe(2);
    expect(decoded.channelData).toEqual([left, right]);
    expect(durationSeconds(decoded)).toBeCloseTo(2 / 8000);
  });
});

describe('planChunks', () => {
  it('splits samples into ranges of at most the requested seconds', () => {
    expect(planChunks(25, 10, 1)).toEqual([
      { from: 0, to: 10 },
      { from: 10, to: 20 },
      { from: 20, to: 25 },
    ]);
  });

  it('returns nothing for empty audio', () => {
    expect(planChunks(0, 44100, 30)).toEqual([]);
  });
});

describe('encodeWavPcm16', () => {
  const decoded: DecodedAudio = {
    sampleRate: 8000,
    length: 4,
    channelData: [new Float32Array([0, 1, -1, 2])],
  };

  it('writes a valid RIFF/WAVE header and clamped PCM16 samples', async () => {
    const blob = encodeWavPcm16(decoded);
    const bytes = new DataView(await blob.arrayBuffer());

    expect(blob.type).toBe('audio/wav');
    expect(String.fromCharCode(bytes.getUint8(0), bytes.getUint8(1), bytes.getUint8(2), bytes.getUint8(3))).toBe('RIFF');
    expect(String.fromCharCode(bytes.getUint8(8), bytes.getUint8(9), bytes.getUint8(10), bytes.getUint8(11))).toBe('WAVE');
    expect(bytes.getUint16(22, true)).toBe(1); // mono
    expect(bytes.getUint32(24, true)).toBe(8000);
    expect(bytes.getUint32(40, true)).toBe(8); // 4 frames * 2 bytes
    expect(bytes.getInt16(44, true)).toBe(0);
    expect(bytes.getInt16(46, true)).toBe(0x7fff);
    expect(bytes.getInt16(48, true)).toBe(-0x8000);
    expect(bytes.getInt16(50, true)).toBe(0x7fff); // clamped from 2
  });

  it('encodes only the requested sample range', async () => {
    const blob = encodeWavPcm16(decoded, { from: 1, to: 3 });
    const bytes = new DataView(await blob.arrayBuffer());
    expect(bytes.getUint32(40, true)).toBe(4);
    expect(bytes.getInt16(44, true)).toBe(0x7fff);
    expect(bytes.getInt16(46, true)).toBe(-0x8000);
  });

  it('interleaves stereo channels', async () => {
    const stereo: DecodedAudio = {
      sampleRate: 8000,
      length: 1,
      channelData: [new Float32Array([1]), new Float32Array([-1])],
    };
    const bytes = new DataView(await encodeWavPcm16(stereo).arrayBuffer());
    expect(bytes.getUint16(22, true)).toBe(2);
    expect(bytes.getInt16(44, true)).toBe(0x7fff);
    expect(bytes.getInt16(46, true)).toBe(-0x8000);
  });
});
