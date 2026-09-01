import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWhisperEngine, transcribeLocally, transcribeViaApi } from './transcribe';

const transcriber = vi.fn(async () => ({
  text: '  whisper text  ',
  chunks: [
    { timestamp: [0, 1.5] as [number, number | null], text: ' first ' },
    { timestamp: [1.5, null] as [number, number | null], text: ' open ended ' },
  ],
}));
const pipeline = vi.fn(async () => transcriber);

vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => pipeline(...args),
}));

afterEach(() => vi.clearAllMocks());

describe('createWhisperEngine', () => {
  it('builds a quantized ASR pipeline and normalizes chunk timestamps', async () => {
    const engine = await createWhisperEngine('onnx-community/whisper-tiny');
    const result = await engine(new Float32Array([0, 0.5]), 'english');

    expect(pipeline).toHaveBeenCalledWith(
      'automatic-speech-recognition',
      'onnx-community/whisper-tiny',
      expect.objectContaining({ dtype: 'q8' }),
    );
    expect(transcriber).toHaveBeenCalledWith(
      expect.any(Float32Array),
      expect.objectContaining({ language: 'english', return_timestamps: true }),
    );
    expect(result.text).toBe('whisper text');
    expect(result.segments).toEqual([
      { start: 0, end: 1.5, text: 'first' },
      { start: 1.5, end: 1.5, text: 'open ended' },
    ]);
  });

  it('handles array output and auto language detection', async () => {
    transcriber.mockResolvedValueOnce([{ text: 'array output' }] as never);
    const engine = await createWhisperEngine('onnx-community/whisper-base');
    const result = await engine(new Float32Array([0]));

    expect(transcriber).toHaveBeenCalledWith(
      expect.any(Float32Array),
      expect.objectContaining({ language: undefined }),
    );
    expect(result).toEqual({ text: 'array output', segments: [] });
  });

  it('defaults entirely missing timestamps to zero', async () => {
    transcriber.mockResolvedValueOnce({
      text: 'no times',
      chunks: [{ timestamp: [null, null], text: 'floating' }],
    } as never);
    const engine = await createWhisperEngine('onnx-community/whisper-base');
    const result = await engine(new Float32Array([0]));
    expect(result.segments).toEqual([{ start: 0, end: 0, text: 'floating' }]);
  });
});

describe('transcribeLocally with the default engine', () => {
  it('reports model download progress through the pipeline callback', async () => {
    const progress = vi.fn();
    const decode = async () => ({
      sampleRate: 16_000,
      length: 4,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array([0, 0, 0, 0]),
    });

    const result = await transcribeLocally(
      new Blob(['audio']),
      { model: 'onnx-community/whisper-tiny', languageCode: '', decode },
      undefined,
      progress,
    );

    const options = pipeline.mock.calls[0][2] as {
      progress_callback: (info: { status: string; progress?: number }) => void;
    };
    options.progress_callback({ status: 'progress', progress: 42.4 });
    options.progress_callback({ status: 'done' });

    expect(progress).toHaveBeenCalledWith('Downloading the speech model — 42%');
    expect(result.text).toBe('whisper text');
  });
});

describe('transcribeViaApi edge cases', () => {
  it('uses the global fetch and omits the language field when detecting automatically', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ text: 'spoken' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const decode = async () => ({
      sampleRate: 16_000,
      length: 16_000,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(16_000),
    });

    const progress = vi.fn();
    const result = await transcribeViaApi(
      new Blob(['audio']),
      {
        model: 'gpt-4o-mini-transcribe',
        languageCode: '',
        apiKey: 'sk',
        decode,
      },
      undefined,
      progress,
    );

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).language).toBeUndefined();
    expect(result.text).toBe('spoken');
    expect(progress).toHaveBeenCalledWith('Transcribing the recording');
    vi.unstubAllGlobals();
  });

  it('treats a successful response without text as an empty part', async () => {
    const decode = async () => ({
      sampleRate: 16_000,
      length: 100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(100),
    });
    const result = await transcribeViaApi(new Blob(['audio']), {
      model: 'whisper-1',
      languageCode: '',
      apiKey: 'sk',
      decode,
      fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
    });
    expect(result.text).toBe('');
  });

  it('reports a generic error when the failure body is not JSON', async () => {
    const decode = async () => ({
      sampleRate: 16_000,
      length: 100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(100),
    });
    await expect(
      transcribeViaApi(new Blob(['audio']), {
        model: 'whisper-1',
        languageCode: '',
        apiKey: 'sk',
        decode,
        fetchImpl: (async () => new Response('gateway broke', { status: 502 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/request failed/i);
  });
});
