import { describe, expect, it, vi } from 'vitest';

import {
  createGeneratedCollection,
  generatedTitle,
  generateSnippet,
  MAX_GENERATED,
  parseGeneratedText,
  searchGenerated,
  type GeneratedSnippet,
} from './snippet-generate';

const request = { description: 'debounce', language: 'typescript', context: '', explain: true };

function jsonResponse(status: number, payload: unknown) {
  return { ok: status < 400, status, json: async () => payload } as unknown as Response;
}

describe('parseGeneratedText', () => {
  it('extracts the first fenced block and keeps surrounding prose as the explanation', () => {
    const parsed = parseGeneratedText('Here you go:\n```ts\nconst a = 1;\n```\nUse it wisely.\n```js\nignored\n```');
    expect(parsed.code).toBe('const a = 1;');
    expect(parsed.explanation).toBe('Here you go:\nUse it wisely.\n```js\nignored\n```');
  });

  it('treats replies without a fence as code', () => {
    expect(parseGeneratedText('  x = 1  ')).toEqual({ code: 'x = 1', explanation: '', raw: '  x = 1  ' });
  });
});

describe('generateSnippet', () => {
  it('uses the on-device model when the engine is chrome and reports progress', async () => {
    const chromePrompt = vi.fn(async (_prompt: string, options?: { onProgress?: (percent: number) => void }) => {
      options?.onProgress?.(40);
      return '```ts\nexport const x = 1;\n```';
    });
    const onProgress = vi.fn();
    const result = await generateSnippet(request, { engine: 'chrome', model: '', apiKey: '', onProgress, chromePrompt });
    expect(result.code).toBe('export const x = 1;');
    expect(chromePrompt.mock.calls[0][0]).toContain('BEGIN REQUEST\ndebounce\nEND REQUEST');
    expect(onProgress).toHaveBeenCalledWith("Generating with Chrome's on-device model");
    expect(onProgress).toHaveBeenCalledWith('Downloading the on-device model: 40%');
  });

  it('posts to the proxy for cloud providers with the key in a header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { text: '```py\nprint(1)\n```\nPrints one.' }));
    const controller = new AbortController();
    const result = await generateSnippet(request, {
      engine: 'google',
      model: 'gemini-2.5-flash',
      apiKey: 'key-1',
      fetchImpl,
      signal: controller.signal,
    });
    expect(result).toMatchObject({ code: 'print(1)', explanation: 'Prints one.' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/ai/generate');
    expect(init.headers['x-provider-key']).toBe('key-1');
    expect(init.signal).toBe(controller.signal);
    expect(JSON.parse(init.body)).toEqual({ provider: 'google', model: 'gemini-2.5-flash', ...request });
  });

  it('surfaces proxy errors, malformed payloads, empty text, and replies without code', async () => {
    const base = { engine: 'openai' as const, model: 'gpt-5-mini', apiKey: 'k' };
    await expect(
      generateSnippet(request, { ...base, fetchImpl: vi.fn().mockResolvedValue(jsonResponse(401, { error: { message: 'Bad key' } })) }),
    ).rejects.toThrow('Bad key');
    await expect(
      generateSnippet(request, {
        ...base,
        fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('x'); } } as unknown as Response),
      }),
    ).rejects.toThrow(/generation request failed/);
    await expect(
      generateSnippet(request, { ...base, fetchImpl: vi.fn().mockResolvedValue(jsonResponse(200, {})) }),
    ).rejects.toThrow(/returned no text/);
    await expect(
      generateSnippet(request, { ...base, fetchImpl: vi.fn().mockResolvedValue(jsonResponse(200, { text: '```\n\n```' })) }),
    ).rejects.toThrow(/returned no code/);
  });
});

describe('generated history', () => {
  const item = (id: string, description: string, language = 'go'): GeneratedSnippet => ({
    id,
    createdAt: 1,
    updatedAt: 1,
    description,
    language,
    context: '',
    explain: false,
    engine: 'chrome',
    model: '',
    code: `code-${id}`,
    explanation: '',
  });

  it('searches description, code, and language', () => {
    const items = [item('a', 'Read a file'), item('b', 'Sort numbers', 'python')];
    expect(searchGenerated(items, '')).toHaveLength(2);
    expect(searchGenerated(items, 'FILE')).toHaveLength(1);
    expect(searchGenerated(items, 'code-b')).toHaveLength(1);
    expect(searchGenerated(items, 'python')).toHaveLength(1);
  });

  it('titles entries from the first description line', () => {
    expect(generatedTitle('First line\nsecond')).toBe('First line');
    expect(generatedTitle('x'.repeat(100))).toHaveLength(80);
    expect(generatedTitle('  ')).toBe('Generated snippet');
  });

  it('caps history at the configured size under the versioned key', () => {
    const collection = createGeneratedCollection();
    expect(collection.key).toBe('filekit.generated.v1');
    for (let index = 0; index < MAX_GENERATED + 3; index += 1) {
      collection.upsert({ ...item(`g${index}`, 'd'), updatedAt: index });
    }
    expect(collection.list()).toHaveLength(MAX_GENERATED);
  });
});
