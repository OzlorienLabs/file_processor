import { describe, expect, it, vi } from 'vitest';

import { summarizeText, SUMMARY_CHUNK_CHARS, type SummarizeOptions } from './summarize';

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status });
}

function options(fetchImpl: typeof fetch, extra: Partial<SummarizeOptions> = {}): SummarizeOptions {
  return {
    provider: 'openai',
    model: 'gpt-5-mini',
    apiKey: 'sk-test',
    detail: 'balanced',
    fetchImpl,
    ...extra,
  };
}

describe('summarizeText', () => {
  it('sends one request for short documents with the key in a header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { summary: 'A tidy summary.' }));
    const summary = await summarizeText('Some document text.', options(fetchImpl));

    expect(summary).toBe('A tidy summary.');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/summarize');
    expect((init.headers as Record<string, string>)['x-provider-key']).toBe('sk-test');
    expect(JSON.parse(init.body as string)).toMatchObject({
      provider: 'openai',
      model: 'gpt-5-mini',
      detail: 'balanced',
    });
  });

  it('map-reduces long documents and reports progress', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const { text } = JSON.parse(init!.body as string) as { text: string };
      return jsonResponse(200, { summary: text.includes('partial summaries') ? 'FINAL' : 'part' });
    });
    const progress = vi.fn();
    const longText = `${'a'.repeat(SUMMARY_CHUNK_CHARS)}\n\n${'b'.repeat(1000)}`;

    const summary = await summarizeText(longText, options(fetchImpl as unknown as typeof fetch, { onProgress: progress }));

    expect(summary).toBe('FINAL');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenCalledWith('Summarizing part 1 of 2');
    expect(progress).toHaveBeenCalledWith('Combining the partial summaries');
  });

  it('surfaces the server error message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: { code: 'invalid_key', message: 'The provider rejected this API key.' } }),
    );
    await expect(summarizeText('text', options(fetchImpl))).rejects.toThrow(
      'The provider rejected this API key.',
    );
  });

  it('falls back to a generic error for malformed responses', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 500 }));
    await expect(summarizeText('text', options(fetchImpl))).rejects.toThrow(/request failed/);
  });

  it('rejects empty documents', async () => {
    const fetchImpl = vi.fn();
    await expect(summarizeText('   ', options(fetchImpl))).rejects.toThrow(/no text/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a successful response that carries no summary', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { unexpected: true }));
    await expect(summarizeText('text', options(fetchImpl))).rejects.toThrow(/no summary text/i);
  });

  it('uses the global fetch when no implementation is injected', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200, { summary: 'global fetch summary' }));
    vi.stubGlobal('fetch', fetchSpy);
    const { fetchImpl: _unused, ...bare } = options(fetchSpy);
    void _unused;

    await expect(summarizeText('text', bare)).resolves.toBe('global fetch summary');
    expect(fetchSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('stops between chunks when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const longText = `${'a'.repeat(SUMMARY_CHUNK_CHARS)}\n\n${'b'.repeat(1000)}`;

    await expect(
      summarizeText(longText, { ...options(fetchImpl), signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
