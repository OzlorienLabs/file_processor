import { z } from 'zod';

import { apiTranscribeModels, localWhisperModels } from './transcribe';

export interface TranscribeSettings {
  engine: 'local' | 'api';
  localModel: string;
  apiModel: string;
  languageCode: string;
  apiKey: string;
  remember: boolean;
}

export const defaultTranscribeSettings: TranscribeSettings = {
  engine: 'local',
  localModel: localWhisperModels[0].id,
  apiModel: apiTranscribeModels[0],
  languageCode: '',
  apiKey: '',
  remember: true,
};

const STORAGE_KEY = 'filekit.transcribe.v1';

const storedSchema = z.object({
  engine: z.enum(['local', 'api']),
  localModel: z.string().min(1).max(120),
  apiModel: z.string().min(1).max(120),
  languageCode: z.string().max(8),
  apiKey: z.string().max(400),
});

export function loadTranscribeSettings(storage: Pick<Storage, 'getItem'> = localStorage): TranscribeSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultTranscribeSettings;
    return { ...storedSchema.parse(JSON.parse(raw)), remember: true };
  } catch {
    return defaultTranscribeSettings;
  }
}

export function saveTranscribeSettings(
  settings: TranscribeSettings,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): void {
  if (!settings.remember) {
    storage.removeItem(STORAGE_KEY);
    return;
  }
  const { engine, localModel, apiModel, languageCode, apiKey } = settings;
  storage.setItem(STORAGE_KEY, JSON.stringify({ engine, localModel, apiModel, languageCode, apiKey }));
}

export function clearTranscribeSettings(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(STORAGE_KEY);
}
