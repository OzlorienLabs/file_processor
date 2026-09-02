import { useCallback, useEffect, useMemo, useState } from 'react';

import { applyUiSettings, createUiSettingsStore, type UiSettings } from '../lib/ui-settings';

export interface UiSettingsControl {
  settings: UiSettings;
  update: (patch: Partial<UiSettings>) => void;
}

/**
 * The workspace chrome settings, persisted to `filekit.ui.v1` and mirrored onto <html> so
 * the `.flat` and `.calm` escape hatches follow them.
 */
export function useUiSettings(): UiSettingsControl {
  const store = useMemo(() => createUiSettingsStore(), []);
  const [settings, setSettings] = useState<UiSettings>(() => store.load());

  useEffect(() => {
    applyUiSettings(settings, document.documentElement);
  }, [settings]);

  const update = useCallback(
    (patch: Partial<UiSettings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        try {
          store.save(next);
        } catch {
          // A full quota must not take the chrome down; the choice simply does not persist.
        }
        return next;
      });
    },
    [store],
  );

  return { settings, update };
}
