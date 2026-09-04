import { useCallback, useEffect, useState } from 'react';

import {
  loadAiSettings,
  saveAiSettings,
  subscribeAiSettings,
  type AiSettings,
} from '../lib/ai-settings';

export interface AiSettingsControl {
  ai: AiSettings;
  updateAi: (next: AiSettings) => void;
}

export function useAiSettings(): AiSettingsControl {
  const [ai, setAi] = useState<AiSettings>(() => loadAiSettings());

  useEffect(() => {
    return subscribeAiSettings(() => {
      setAi(loadAiSettings());
    });
  }, []);

  const updateAi = useCallback((next: AiSettings) => {
    setAi(next);
    saveAiSettings(next);
  }, []);

  return { ai, updateAi };
}
