import { describe, expect, it } from 'vitest';

import {
  aiProviders,
  clearAiSettings,
  CUSTOM_MODEL_ID,
  defaultAiSettings,
  effectiveModel,
  isValidModelId,
  loadAiSettings,
  providerLabel,
  saveAiSettings,
  subscribeAiSettings,
} from './ai-settings';

describe('ai provider catalog', () => {
  it('offers three presets per provider', () => {
    for (const info of Object.values(aiProviders)) {
      expect(info.models).toHaveLength(3);
    }
  });
});

describe('isValidModelId', () => {
  it('accepts realistic model IDs', () => {
    expect(isValidModelId('gpt-5.1')).toBe(true);
    expect(isValidModelId('claude-haiku-4-5-20251001')).toBe(true);
    expect(isValidModelId('accounts/fireworks/models/llama')).toBe(true);
  });

  it('rejects empty, oversized, or unsafe IDs', () => {
    expect(isValidModelId('')).toBe(false);
    expect(isValidModelId('a'.repeat(120))).toBe(false);
    expect(isValidModelId('model with spaces')).toBe(false);
    expect(isValidModelId('-leading-dash')).toBe(false);
  });
});

describe('effectiveModel', () => {
  it('uses the preset ID unless custom is chosen', () => {
    expect(effectiveModel({ ...defaultAiSettings, model: 'gpt-5-mini' })).toBe('gpt-5-mini');
    expect(
      effectiveModel({ ...defaultAiSettings, model: CUSTOM_MODEL_ID, customModel: ' my-model ' }),
    ).toBe('my-model');
  });
});

describe('settings persistence', () => {
  it('round-trips settings through localStorage by default', () => {
    saveAiSettings({ provider: 'anthropic', model: 'claude-sonnet-5', customModel: '', apiKey: 'sk-test', remember: true });
    expect(loadAiSettings()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      customModel: '',
      apiKey: 'sk-test',
      remember: true,
    });
  });

  it('removes stored settings when remember is off', () => {
    saveAiSettings({ ...defaultAiSettings, apiKey: 'sk-test' });
    saveAiSettings({ ...defaultAiSettings, apiKey: 'sk-test', remember: false });
    expect(loadAiSettings()).toEqual(defaultAiSettings);
  });

  it('falls back to defaults for corrupt or hostile stored values', () => {
    localStorage.setItem('filekit.ai.v1', 'not json');
    expect(loadAiSettings()).toEqual(defaultAiSettings);
    localStorage.setItem('filekit.ai.v1', JSON.stringify({ provider: 'evil', model: 1 }));
    expect(loadAiSettings()).toEqual(defaultAiSettings);
  });

  it('clears settings on demand', () => {
    saveAiSettings({ ...defaultAiSettings, apiKey: 'sk-test' });
    clearAiSettings();
    expect(loadAiSettings()).toEqual(defaultAiSettings);
  });

  it('notifies subscribers on save and clear, and unsubscribes cleanly', () => {
    let calls = 0;
    const unsubscribe = subscribeAiSettings(() => {
      calls += 1;
    });
    saveAiSettings({ ...defaultAiSettings, apiKey: 'new-key', remember: true });
    expect(calls).toBe(1);
    window.dispatchEvent(new Event('storage'));
    expect(calls).toBe(2);
    clearAiSettings();
    expect(calls).toBe(3);
    unsubscribe();
    saveAiSettings({ ...defaultAiSettings, apiKey: 'another-key', remember: true });
    expect(calls).toBe(3);
  });
});

describe('providerLabel', () => {
  it('returns friendly label for known providers or falls back', () => {
    expect(providerLabel('openai')).toBe('OpenAI');
    expect(providerLabel('google')).toBe('Google Gemini');
    expect(providerLabel('anthropic')).toBe('Anthropic');
    expect(providerLabel('unknown' as never)).toBe('unknown');
  });
});
