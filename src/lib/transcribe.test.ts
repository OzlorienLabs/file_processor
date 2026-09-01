import { describe, expect, it, vi } from 'vitest';

import type { DecodedAudio } from './audio';
import {
  API_CHUNK_SECONDS,
  bytesToBase64,
  formatSrtTimestamp,
  resampleTo16kMono,
  toSrt,
  transcribeLocally,
  transcribeViaApi,
  WHISPER_SAMPLE_RATE,
} from './transcribe';

function toneDecoder(seconds: number, sampleRate = WHISPER_SAMPLE_RATE) {
  const length = seconds * sampleRate;
  return async () => ({
    sampleRate,
    length,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(length).fill(0.25),
  });
}

describe('resampleTo16kMono', () => {
  it('averages channels without resampling at 16 kHz', () => {
    const decoded: DecodedAudio = {
      sampleRate: WHISPER_SAMPLE_RATE,
      length: 2,
      channelData: [new Float32Array([1, 0]), new Float32Array([0, 0])],
    };
    const mono = resampleTo16kMono(decoded);
    expect(mono.length).toBe(2);
    expect(mono[0]).toBeCloseTo(0.5);
  });

  it('halves the sample count from 32 kHz input', () => {
    const decoded: DecodedAudio = {
      sampleRate: 32_000,
      length: 3200,
      channelData: [new Float32Array(3200).fill(0.5)],
    };
    const mono = resampleTo16kMono(decoded);
    expect(mono.length).toBe(1600);
    expect(mono[800]).toBeCloseTo(0.5);
  });
});

describe('SRT helpers', () => {
  it('formats timestamps with hours, minutes, and milliseconds', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    expect(formatSrtTimestamp(3723.5)).toBe('01:02:03,500');
    expect(formatSrtTimestamp(-5)).toBe('00:00:00,000');
  });

  it('renders numbered SRT blocks', () => {
    const srt = toSrt([
      { start: 0, end: 1.5, text: ' Hello ' },
      { start: 1.5, end: 3, text: 'world' },
    ]);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:01,500\nHello\n\n2\n00:00:01,500 --> 00:00:03,000\nworld');
  });
});

describe('bytesToBase64', () => {
  it('matches the platform encoder for large buffers', () => {
    const bytes = new Uint8Array(70_000).map((_, index) => index % 251);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('transcribeLocally', () => {
  it('decodes, resamples, and passes the mapped whisper language', async () => {
    const engine = vi.fn(async () => ({ text: 'local words', segments: [] }));
    const progress = vi.fn();

    const result = await transcribeLocally(
      new Blob(['audio']),
      {
        model: 'onnx-community/whisper-tiny',
        languageCode: 'de',
        engineFactory: async (model) => {
          expect(model).toBe('onnx-community/whisper-tiny');
          return engine;
        },
        decode: toneDecoder(2),
      },
      undefined,
      progress,
    );

    expect(result.text).toBe('local words');
    expect(engine).toHaveBeenCalledWith(expect.any(Float32Array), 'german');
    expect(progress).toHaveBeenCalledWith('Transcribing on this device');
  });

  it('stops before decoding when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      transcribeLocally(
        new Blob(['audio']),
        { model: 'x', languageCode: '', decode: toneDecoder(1) },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('transcribeViaApi', () => {
  it('splits long audio into bounded chunks and joins the text', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as { audio: string; model: string; language?: string };
      expect(body.model).toBe('whisper-1');
      expect(body.language).toBe('en');
      expect(Buffer.from(body.audio, 'base64').length).toBeLessThanOrEqual(3.75 * 1024 * 1024);
      return new Response(JSON.stringify({ text: ` part${fetchImpl.mock.calls.length} ` }), { status: 200 });
    });
    const progress = vi.fn();

    const result = await transcribeViaApi(
      new Blob(['audio']),
      {
        model: 'whisper-1',
        languageCode: 'en',
        apiKey: 'sk-audio',
        decode: toneDecoder(API_CHUNK_SECONDS + 10),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      undefined,
      progress,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('part1 part2');
    expect(progress).toHaveBeenCalledWith('Transcribing part 2 of 2');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-provider-key']).toBe('sk-audio');
  });

  it('surfaces the server error message', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'The provider rejected this API key.' } }), { status: 401 }),
    );
    await expect(
      transcribeViaApi(
        new Blob(['audio']),
        { model: 'whisper-1', languageCode: '', apiKey: 'bad', decode: toneDecoder(1), fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).rejects.toThrow('The provider rejected this API key.');
  });
});
