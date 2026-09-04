import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { defaultAiSettings, saveAiSettings } from '../lib/ai-settings';
import { useAiSettings } from './useAiSettings';

describe('useAiSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads initial settings and updates reactively', () => {
    const { result } = renderHook(() => useAiSettings());
    expect(result.current.ai.provider).toBe('openai');

    act(() => {
      result.current.updateAi({ ...defaultAiSettings, provider: 'google', apiKey: 'test-key' });
    });
    expect(result.current.ai.provider).toBe('google');
    expect(result.current.ai.apiKey).toBe('test-key');

    act(() => {
      saveAiSettings({ ...defaultAiSettings, provider: 'anthropic', apiKey: 'anthropic-key' });
    });
    expect(result.current.ai.provider).toBe('anthropic');
    expect(result.current.ai.apiKey).toBe('anthropic-key');
  });
});
