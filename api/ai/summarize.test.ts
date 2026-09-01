import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeResponse } from '../_lib/test-helpers';
import handler, { validateSummarizeBody } from './summarize';

const validBody = {
  provider: 'openai',
  model: 'gpt-5-mini',
  text: 'Document text to summarize.',
  detail: 'balanced',
};

function request(overrides: Partial<{ method: string; body: unknown; headers: Record<string, string> }> = {}) {
  return {
    method: overrides.method ?? 'POST',
    headers: overrides.headers ?? { 'x-provider-key': 'sk-test' },
    body: 'body' in overrides ? overrides.body : validBody,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('validateSummarizeBody', () => {
  it('accepts a complete valid body', () => {
    expect(validateSummarizeBody(validBody)).toEqual(validBody);
  });

  it.each([
    ['null body', null],
    ['bad provider', { ...validBody, provider: 'evil' }],
    ['bad model', { ...validBody, model: 'has spaces' }],
    ['empty text', { ...validBody, text: '  ' }],
    ['oversized text', { ...validBody, text: 'a'.repeat(500_001) }],
    ['bad detail', { ...validBody, detail: 'epic' }],
  ])('rejects %s', (_label, body) => {
    expect(validateSummarizeBody(body)).toBeUndefined();
  });
});

describe('summarize handler', () => {
  it('rejects non-POST methods', async () => {
    const res = fakeResponse();
    await handler(request({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('rejects invalid bodies without calling the provider', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeResponse();
    await handler(request({ body: { nope: true } }), res);
    expect(res.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires the provider key header', async () => {
    const res = fakeResponse();
    await handler(request({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('missing_key');
  });

  it('forwards to the provider and returns the parsed summary with no-store', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: 'Proxied summary.' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeResponse();

    await handler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ summary: 'Proxied summary.' });
    expect(res.headers['Cache-Control']).toContain('no-store');
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps upstream auth failures to invalid_key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 401 })));
    const res = fakeResponse();
    await handler(request(), res);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('invalid_key');
  });

  it('maps network failures to provider_timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    const res = fakeResponse();
    await handler(request(), res);
    expect(res.statusCode).toBe(504);
    expect(JSON.parse(res.body).error.code).toBe('provider_timeout');
  });

  it('rejects upstream responses with no usable summary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const res = fakeResponse();
    await handler(request(), res);
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error.code).toBe('empty_response');
  });
});
