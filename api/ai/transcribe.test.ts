import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeResponse } from '../_lib/test-helpers';
import handler, { MAX_AUDIO_BYTES, validateTranscribeBody } from './transcribe';

const validAudio = Buffer.from('RIFF-wav-bytes').toString('base64');
const validBody = { model: 'whisper-1', language: 'en', audio: validAudio };

function request(overrides: Partial<{ method: string; body: unknown; headers: Record<string, string> }> = {}) {
  return {
    method: overrides.method ?? 'POST',
    headers: overrides.headers ?? { 'x-provider-key': 'sk-test' },
    body: 'body' in overrides ? overrides.body : validBody,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('validateTranscribeBody', () => {
  it('accepts a valid chunk with and without language', () => {
    expect(validateTranscribeBody(validBody)).toEqual(validBody);
    expect(validateTranscribeBody({ model: 'gpt-4o-transcribe', audio: validAudio })).toEqual({
      model: 'gpt-4o-transcribe',
      language: undefined,
      audio: validAudio,
    });
  });

  it.each([
    ['unknown model', { ...validBody, model: 'gpt-6-audio' }],
    ['bad language', { ...validBody, language: 'not-a-code!' }],
    ['missing audio', { ...validBody, audio: '' }],
    ['oversized audio', { ...validBody, audio: 'a'.repeat(Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 8) }],
    ['non-object', null],
  ])('rejects %s', (_label, body) => {
    expect(validateTranscribeBody(body)).toBeUndefined();
  });
});

describe('transcribe handler', () => {
  it('rejects non-POST and missing keys', async () => {
    const methodRes = fakeResponse();
    await handler(request({ method: 'DELETE' }), methodRes);
    expect(methodRes.statusCode).toBe(405);

    const keyRes = fakeResponse();
    await handler(request({ headers: {} }), keyRes);
    expect(keyRes.statusCode).toBe(401);
  });

  it('sends the chunk to OpenAI as multipart WAV and returns the text', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ text: ' spoken words ' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeResponse();

    await handler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ text: 'spoken words' });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('en');
    expect((form.get('file') as File).type).toBe('audio/wav');
  });

  it('maps upstream failures and empty payloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 429 })));
    const limitedRes = fakeResponse();
    await handler(request(), limitedRes);
    expect(limitedRes.statusCode).toBe(429);
    expect(JSON.parse(limitedRes.body).error.code).toBe('rate_limited');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const emptyRes = fakeResponse();
    await handler(request(), emptyRes);
    expect(emptyRes.statusCode).toBe(502);

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const downRes = fakeResponse();
    await handler(request(), downRes);
    expect(downRes.statusCode).toBe(504);
  });
});
