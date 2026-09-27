import { describe, expect, it, vi } from 'vitest';

import { FEEDBACK_ENDPOINT, submitFeedback, validateFeedback } from './feedback';

describe('validateFeedback', () => {
  it('requires a note and accepts a blank email', () => {
    expect(validateFeedback({ message: ' ', email: '' })).toEqual({ message: 'Add a note before sending.' });
    expect(validateFeedback({ message: 'hi', email: '' })).toEqual({});
  });

  it('rejects oversized notes and malformed emails', () => {
    expect(validateFeedback({ message: 'a'.repeat(4001), email: '' }).message).toMatch(/under 4,000/);
    expect(validateFeedback({ message: 'hi', email: 'nope' }).email).toMatch(/does not look right/);
    expect(validateFeedback({ message: 'hi', email: `${'a'.repeat(250)}@b.co` }).email).toBeDefined();
  });
});

describe('submitFeedback', () => {
  it('does not call the network for an invalid draft', async () => {
    const fetcher = vi.fn();
    const result = await submitFeedback({ message: '', email: '' }, fetcher);
    expect(result).toEqual({ status: 'invalid', issues: { message: 'Add a note before sending.' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('posts the trimmed note, email and honeypot to the same-origin route', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    const result = await submitFeedback({ message: ' hi ', email: ' a@b.co ', company: 'x' }, fetcher);
    expect(result).toEqual({ status: 'sent' });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(FEEDBACK_ENDPOINT);
    expect(JSON.parse(init.body as string)).toEqual({ message: 'hi', email: 'a@b.co', company: 'x' });
  });

  it('omits the email when blank', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    await submitFeedback({ message: 'hi', email: '' }, fetcher);
    expect(JSON.parse((fetcher.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ message: 'hi' });
  });

  it('surfaces the server error message', async () => {
    const body = JSON.stringify({ error: { code: 'not_configured', message: 'Not configured.' } });
    const fetcher = vi.fn().mockResolvedValue(new Response(body, { status: 503 }));
    expect(await submitFeedback({ message: 'hi', email: '' }, fetcher)).toEqual({
      status: 'failed',
      message: 'Not configured.',
    });
  });

  it.each([
    ['non-JSON', 'oops'],
    ['blank message', JSON.stringify({ error: { message: ' ' } })],
  ])('falls back to a generic message for a %s error body', async (_label, body) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(body, { status: 500 }));
    const result = await submitFeedback({ message: 'hi', email: '' }, fetcher);
    expect(result).toEqual({ status: 'failed', message: 'That did not send. Please try again in a moment.' });
  });

  it('reports a network failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await submitFeedback({ message: 'hi', email: '' }, fetcher);
    expect(result).toMatchObject({ status: 'failed', message: expect.stringMatching(/connection/) });
  });

  it('uses the global fetch by default', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchSpy);
    expect(await submitFeedback({ message: 'hi', email: '' })).toEqual({ status: 'sent' });
    vi.unstubAllGlobals();
  });
});
