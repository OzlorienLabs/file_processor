import { z } from 'zod';

export type AiProvider = 'openai' | 'anthropic' | 'google';

export interface ModelPreset {
  id: string;
  label: string;
  hint: string;
}

export interface ProviderInfo {
  label: string;
  keyHint: string;
  models: ModelPreset[];
}

export const aiProviders: Record<AiProvider, ProviderInfo> = {
  openai: {
    label: 'OpenAI',
    keyHint: 'An OpenAI API key from platform.openai.com',
    models: [
      { id: 'gpt-5.1', label: 'GPT-5.1', hint: 'Highest quality' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', hint: 'Balanced' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', hint: 'Fast and economical' },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    keyHint: 'An Anthropic API key from console.anthropic.com',
    models: [
      { id: 'claude-opus-5', label: 'Claude Opus 5', hint: 'Highest quality' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', hint: 'Balanced' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', hint: 'Fast and economical' },
    ],
  },
  google: {
    label: 'Google Gemini',
    keyHint: 'A Gemini API key from aistudio.google.com',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'Highest quality' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'Balanced' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', hint: 'Fast and economical' },
    ],
  },
};

export const CUSTOM_MODEL_ID = 'custom';
const MODEL_ID_PATTERN = /^[\w][\w.:/-]{0,99}$/;

export function isValidModelId(model: string): boolean {
  return MODEL_ID_PATTERN.test(model);
}

export function providerLabel(provider: AiProvider): string {
  return aiProviders[provider]?.label ?? provider;
}

export interface AiSettings {
  provider: AiProvider;
  model: string;
  customModel: string;
  apiKey: string;
  remember: boolean;
}

export const defaultAiSettings: AiSettings = {
  provider: 'openai',
  model: aiProviders.openai.models[1].id,
  customModel: '',
  apiKey: '',
  remember: true,
};

/** The model that requests should actually use, resolving the custom choice. */
export function effectiveModel(settings: AiSettings): string {
  return settings.model === CUSTOM_MODEL_ID ? settings.customModel.trim() : settings.model;
}

const STORAGE_KEY = 'filekit.ai.v1';

const storedSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google']),
  model: z.string().min(1).max(120),
  customModel: z.string().max(120),
  apiKey: z.string().max(400),
});

export function loadAiSettings(storage: Pick<Storage, 'getItem'> = localStorage): AiSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultAiSettings;
    const parsed = storedSchema.parse(JSON.parse(raw));
    return { ...parsed, remember: true };
  } catch {
    return defaultAiSettings;
  }
}

export const AI_SETTINGS_EVENT = 'filekit-ai-settings-changed';

function notifyAiSettingsChanged(): void {
  window.dispatchEvent(new CustomEvent(AI_SETTINGS_EVENT));
}

export function saveAiSettings(
  settings: AiSettings,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): void {
  if (!settings.remember) {
    storage.removeItem(STORAGE_KEY);
    notifyAiSettingsChanged();
    return;
  }
  const { provider, model, customModel, apiKey } = settings;
  storage.setItem(STORAGE_KEY, JSON.stringify({ provider, model, customModel, apiKey }));
  notifyAiSettingsChanged();
}

export function clearAiSettings(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(STORAGE_KEY);
  notifyAiSettingsChanged();
}

export function subscribeAiSettings(callback: () => void): () => void {
  window.addEventListener(AI_SETTINGS_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(AI_SETTINGS_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}
