import { describe, expect, it } from 'vitest';

import {
  UI_SETTINGS_KEY,
  applyUiSettings,
  createUiSettingsStore,
  defaultUiSettings,
} from './ui-settings';

describe('ui settings', () => {
  it('starts from the defaults and round-trips through one namespaced key', () => {
    const store = createUiSettingsStore();
    expect(store.load()).toEqual(defaultUiSettings);

    store.save({ ...defaultUiSettings, railLabels: false, calmMotion: true });
    expect(localStorage.getItem(UI_SETTINGS_KEY)).toContain('"railLabels":false');
    expect(store.load()).toMatchObject({ railLabels: false, calmMotion: true, glass: true });
  });

  it('falls back to the defaults when the stored value is corrupt', () => {
    localStorage.setItem(UI_SETTINGS_KEY, '{"railLabels":"yes"}');
    expect(createUiSettingsStore().load()).toEqual(defaultUiSettings);
  });

  it('mirrors the surface switches onto the root element', () => {
    const root = document.createElement('html');
    applyUiSettings(defaultUiSettings, root);
    expect(root.classList.contains('flat')).toBe(false);
    expect(root.classList.contains('calm')).toBe(false);

    applyUiSettings({ ...defaultUiSettings, glass: false, calmMotion: true }, root);
    expect(root.classList.contains('flat')).toBe(true);
    expect(root.classList.contains('calm')).toBe(true);
  });
});
