import { describe, expect, it } from 'vitest';

import {
  clearTranscribeSettings,
  defaultTranscribeSettings,
  loadTranscribeSettings,
  saveTranscribeSettings,
} from './transcribe-settings';

describe('transcribe settings persistence', () => {
  it('defaults to the private local engine', () => {
    expect(loadTranscribeSettings().engine).toBe('local');
    expect(loadTranscribeSettings().remember).toBe(true);
  });

  it('round-trips settings and clears when remember is off', () => {
    const settings = {
      ...defaultTranscribeSettings,
      engine: 'api' as const,
      apiKey: 'sk-audio',
      languageCode: 'fr',
    };
    saveTranscribeSettings(settings);
    expect(loadTranscribeSettings()).toEqual(settings);

    saveTranscribeSettings({ ...settings, remember: false });
    expect(loadTranscribeSettings()).toEqual(defaultTranscribeSettings);
  });

  it('ignores corrupt stored data and supports explicit clearing', () => {
    localStorage.setItem('filekit.transcribe.v1', '{broken');
    expect(loadTranscribeSettings()).toEqual(defaultTranscribeSettings);

    saveTranscribeSettings({ ...defaultTranscribeSettings, apiKey: 'sk' });
    clearTranscribeSettings();
    expect(loadTranscribeSettings()).toEqual(defaultTranscribeSettings);
  });
});
