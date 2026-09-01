import { describe, expect, it, vi } from 'vitest';

import { checkChromeAi, chromeAiHints, findLanguageModel, promptChromeAi, type LanguageModelApi } from './chrome-ai';

function fakeApi(overrides: Partial<LanguageModelApi> = {}) {
  const destroy = vi.fn();
  const promptFn = vi.fn().mockResolvedValue('```js\nconsole.log(1)\n```');
  const api: LanguageModelApi = {
    availability: vi.fn().mockResolvedValue('available'),
    create: vi.fn(async (options) => {
      const target = new EventTarget();
      options?.monitor?.(target);
      target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 0.5, total: 1 }));
      target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 300, total: 600 }));
      target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 2, total: 0 }));
      return { prompt: promptFn, destroy };
    }),
    ...overrides,
  };
  return { api, destroy, promptFn };
}

describe('findLanguageModel', () => {
  it('detects only objects that expose create and availability', () => {
    expect(findLanguageModel({})).toBeUndefined();
    expect(findLanguageModel({ LanguageModel: null })).toBeUndefined();
    expect(findLanguageModel({ LanguageModel: 'nope' })).toBeUndefined();
    expect(findLanguageModel({ LanguageModel: { create: () => {} } })).toBeUndefined();
    const { api } = fakeApi();
    expect(findLanguageModel({ LanguageModel: api })).toBe(api);
    class LanguageModel {
      static create() {}
      static availability() {}
    }
    expect(findLanguageModel({ LanguageModel })).toBe(LanguageModel);
    expect(findLanguageModel()).toBeUndefined();
  });
});

describe('checkChromeAi', () => {
  it('reports unsupported, the API answer, or unavailable on failure', async () => {
    expect(await checkChromeAi(undefined)).toBe('unsupported');
    expect(await checkChromeAi(fakeApi().api)).toBe('available');
    const failing = fakeApi({ availability: vi.fn().mockRejectedValue(new Error('no')) }).api;
    expect(await checkChromeAi(failing)).toBe('unavailable');
    expect(await checkChromeAi()).toBe('unsupported');
  });

  it('has a hint for every state', () => {
    expect(Object.keys(chromeAiHints).sort()).toEqual(['available', 'downloadable', 'downloading', 'unavailable', 'unsupported']);
  });
});

describe('promptChromeAi', () => {
  it('creates a session, reports download progress, prompts, and destroys', async () => {
    const { api, destroy, promptFn } = fakeApi();
    const onProgress = vi.fn();
    const controller = new AbortController();
    const result = await promptChromeAi('write code', { api, onProgress, signal: controller.signal });
    expect(result).toContain('console.log(1)');
    expect(onProgress.mock.calls.map(([value]) => value)).toEqual([50, 50, 100]);
    expect(promptFn).toHaveBeenCalledWith('write code', { signal: controller.signal });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the session even when the prompt fails and errors without the API', async () => {
    const { api, destroy } = fakeApi();
    (api.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      prompt: vi.fn().mockRejectedValue(new Error('boom')),
      destroy,
    });
    await expect(promptChromeAi('x', { api })).rejects.toThrow('boom');
    expect(destroy).toHaveBeenCalled();
    await expect(promptChromeAi('x')).rejects.toThrow(/does not expose/);
  });
});
