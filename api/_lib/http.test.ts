import { describe, expect, it } from 'vitest';

import { headerValue, sendError, sendJson, upstreamError } from './http';
import { fakeResponse } from './test-helpers';

describe('sendJson / sendError', () => {
  it('serializes with no-store caching', () => {
    const res = fakeResponse();
    sendJson(res, 200, { ok: true });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toContain('no-store');
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('uses the single error shape', () => {
    const res = fakeResponse();
    sendError(res, 400, 'invalid_request', 'Bad input.');
    expect(JSON.parse(res.body)).toEqual({ error: { code: 'invalid_request', message: 'Bad input.' } });
  });
});

describe('headerValue', () => {
  it('reads plain, lowercase, and array header values', () => {
    expect(headerValue({ 'x-provider-key': 'abc' }, 'x-provider-key')).toBe('abc');
    expect(headerValue({ 'x-provider-key': ['a', 'b'] }, 'x-provider-key')).toBe('a');
    expect(headerValue({}, 'x-provider-key')).toBe('');
  });
});

describe('upstreamError', () => {
  it('maps auth, model, rate, client, and server failures', () => {
    expect(upstreamError(401).code).toBe('invalid_key');
    expect(upstreamError(403).code).toBe('invalid_key');
    expect(upstreamError(404).code).toBe('unknown_model');
    expect(upstreamError(429).code).toBe('rate_limited');
    expect(upstreamError(400).code).toBe('provider_rejected');
    expect(upstreamError(500).code).toBe('provider_unavailable');
  });
});
