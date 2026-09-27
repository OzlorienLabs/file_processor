import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeResponse } from './_lib/test-helpers.js';
import handler, {
  buildResendPayload,
  DEFAULT_FROM,
  DEFAULT_TO,
  escapeHtml,
  RESEND_ENDPOINT,
  validateFeedbackBody,
} from './feedback.js';

function request(body: unknown, method = 'POST') {
  return { method, headers: {}, body };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('validateFeedbackBody', () => {
  it('trims and accepts a note with an optional email', () => {
    expect(validateFeedbackBody({ message: '  hi  ', email: ' a@b.co ' })).toEqual({
      ok: true,
      body: { message: 'hi', email: 'a@b.co' },
    });
    expect(validateFeedbackBody({ message: 'hi' })).toEqual({ ok: true, body: { message: 'hi', email: '' } });
  });

  it('flags a filled honeypot as a bot', () => {
    expect(validateFeedbackBody({ message: 'hi', company: 'Acme' })).toEqual({ ok: 'bot' });
  });

  it.each([
    ['null body', null, 400],
    ['empty note', { message: '   ' }, 400],
    ['non-string note', { message: 5 }, 400],
    ['oversized note', { message: 'a'.repeat(4001) }, 413],
    ['malformed email', { message: 'hi', email: 'nope' }, 400],
    ['overlong email', { message: 'hi', email: `${'a'.repeat(250)}@b.co` }, 400],
  ])('rejects %s', (_label, body, status) => {
    const result = validateFeedbackBody(body);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status });
  });
});

describe('buildResendPayload', () => {
  it('escapes the note and sets reply_to when an email is given', () => {
    const payload = buildResendPayload({ message: '<b>x</b> & "y"', email: 'a@b.co' }, 'from', 'to');
    expect(payload).toMatchObject({ from: 'from', to: ['to'], reply_to: 'a@b.co', subject: 'FileKit feedback from a@b.co' });
    expect(payload.html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
    expect(payload.text).toContain('Reply to: a@b.co');
  });

  it('omits reply_to without an email', () => {
    const payload = buildResendPayload({ message: 'hi', email: '' }, 'from', 'to');
    expect(payload).not.toHaveProperty('reply_to');
    expect(payload.subject).toBe('FileKit feedback');
    expect(payload.text).toContain('Reply to: not supplied');
  });

  it('escapes html', () => {
    expect(escapeHtml('<&>"')).toBe('&lt;&amp;&gt;&quot;');
  });
});

describe('feedback handler', () => {
  it('rejects non-POST methods', async () => {
    const res = fakeResponse();
    await handler(request({}, 'GET'), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('returns the shared error shape for invalid bodies', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeResponse();
    await handler(request({ message: '' }), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: { code: 'invalid_request', message: 'Add a note before sending.' } });
    expect(res.headers['Cache-Control']).toContain('no-store');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('quietly accepts bot submissions without sending', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeResponse();
    await handler(request({ message: 'hi', company: 'x' }), res);
    expect(res.statusCode).toBe(202);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers 503 when Resend is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const res = fakeResponse();
    await handler(request({ message: 'hi' }), res);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error.code).toBe('not_configured');
  });

  it('sends through Resend with default addresses', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('FEEDBACK_TO', '');
    vi.stubEnv('FEEDBACK_FROM', '');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = fakeResponse();
    await handler(request({ message: 'Please add a HEIC converter', email: 'me@x.io' }), res);

    expect(res.statusCode).toBe(202);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESEND_ENDPOINT);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test');
    const sent = JSON.parse(init.body as string);
    expect(sent.to).toEqual([DEFAULT_TO]);
    expect(sent.from).toBe(DEFAULT_FROM);
    expect(sent.reply_to).toBe('me@x.io');
  });

  it('honours configured addresses', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('FEEDBACK_TO', 'inbox@x.io');
    vi.stubEnv('FEEDBACK_FROM', 'FileKit <hi@x.io>');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await handler(request({ message: 'hi' }), fakeResponse());
    const sent = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(sent.to).toEqual(['inbox@x.io']);
    expect(sent.from).toBe('FileKit <hi@x.io>');
  });

  it('maps a Resend rejection to 502', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 422 })));
    const res = fakeResponse();
    await handler(request({ message: 'hi' }), res);
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error.code).toBe('mail_rejected');
  });

  it('maps a network failure to 502', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = fakeResponse();
    await handler(request({ message: 'hi' }), res);
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error.code).toBe('mail_unreachable');
  });
});
