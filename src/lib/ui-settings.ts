import { z } from 'zod';

import { createValueStore } from './local-store';

/**
 * How the workspace chrome behaves. Kept apart from tool content: this is the only
 * `filekit.ui.v1` key, it holds no user data, and every field has a visible control in the
 * settings drawer.
 */
export interface UiSettings {
  /** Rail shows tool names (212px) rather than icons only (62px). */
  railLabels: boolean;
  /** Opening a tool asks for the Fullscreen API. */
  fullscreenDefault: boolean;
  /** Off adds `.flat` to <html> — the same fallback older browsers get. */
  glass: boolean;
  /** On adds `.calm` to <html>, stopping every animation. */
  calmMotion: boolean;
}

export const defaultUiSettings: UiSettings = {
  railLabels: true,
  fullscreenDefault: false,
  glass: true,
  calmMotion: false,
};

const schema = z.object({
  railLabels: z.boolean(),
  fullscreenDefault: z.boolean(),
  glass: z.boolean(),
  calmMotion: z.boolean(),
});

export const UI_SETTINGS_KEY = 'filekit.ui.v1';

export function createUiSettingsStore(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  return createValueStore<UiSettings>({
    key: UI_SETTINGS_KEY,
    schema,
    fallback: defaultUiSettings,
    storage,
  });
}

/** Mirrors the two surface switches onto <html>, where the CSS escape hatches live. */
export function applyUiSettings(settings: UiSettings, root: HTMLElement): void {
  root.classList.toggle('flat', !settings.glass);
  root.classList.toggle('calm', settings.calmMotion);
}
