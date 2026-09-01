import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeResponse } from '../_lib/test-helpers';
import handler, { validateGenerateBody } from './generate';

const validBody = {
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  description: 'A debounce helper',
  language: 'typescript',
  context: '',
  explain: true,
};

function request(overrides: Partial<{ method: string; body: unknown; headers: Record<string, string> }> = {}) {
  return {
    method: overrides.method ?? 'POST',
    headers: overrides.headers ?? { 'x-provider-key': 'sk-test' },
    body: 'body' in overrides ? overrides.body : validBody,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('validateGenerateBody', () => {
  it('accepts a complete valid body', () => {
    expect(validateGenerateBody(validBody)).toEqual(validBody);
  });

  it.each([
    ['null body', null],
    ['bad provider', { ...validBody, provider: 'evil' }],
    ['bad model', { ...validBody, model: 'has spaces' }],
    ['blank description', { ...validBody, description: ' ' }],
    ['bad language', { ...validBody, language: 'no way!' }],
  ])('rejects %s', (_label, body) => {
    expect(validateGenerateBody(body)).toBeUndefined();
  });
});

describe('generate handler', () => {
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

  it('requires a reasonably sized provider key header', async () => {
    const res = fakeResponse();
    await handler(request({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('missing_key');

    const oversized = fakeResponse();
    await handler(request({ headers: { 'x-provider-key': 'k'.repeat(500) } }), oversized);
    expect(oversized.statusCode).toBe(401);
  });

  it('forwards the snippet prompt to the provider and returns the text with no-store', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: '```ts\nconst x = 1;\n```' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeResponse();

    await handler(request(), res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ text: '```ts\nconst x = 1;\n```' });
    expect(res.headers['Cache-Control']).toContain('no-store');
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const sent = JSON.parse(init.body as string);
    expect(sent.messages[0].content).toContain('BEGIN REQUEST\nA debounce helper\nEND REQUEST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
  });

  it('maps upstream failures, timeouts, and empty answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })));
    const denied = fakeResponse();
    await handler(request(), denied);
    expect(denied.statusCode).toBe(401);
    expect(JSON.parse(denied.body).error.code).toBe('invalid_key');

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    const timedOut = fakeResponse();
    await handler(request(), timedOut);
    expect(timedOut.statusCode).toBe(504);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const empty = fakeResponse();
    await handler(request(), empty);
    expect(empty.statusCode).toBe(502);
    expect(JSON.parse(empty.body).error.code).toBe('empty_response');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>', { status: 200 })));
    const garbage = fakeResponse();
    await handler(request(), garbage);
    expect(garbage.statusCode).toBe(502);
  });
});
