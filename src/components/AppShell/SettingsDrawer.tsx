import { useEffect, useId, useRef, useState } from 'react';

import {
  clearAiSettings,
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from '../../lib/ai-settings';
import type { UiSettings } from '../../lib/ui-settings';

interface SettingsDrawerProps {
  settings: UiSettings;
  onUpdate: (patch: Partial<UiSettings>) => void;
  onClose: () => void;
}

const toggles: { field: keyof UiSettings; title: string; note: string }[] = [
  {
    field: 'fullscreenDefault',
    title: 'Open tools full screen',
    note: 'Every workspace goes edge to edge on open. The toolbar keeps its own toggle.',
  },
  {
    field: 'railLabels',
    title: 'Show tool names in the rail',
    note: 'Off gives the canvas another 150 pixels.',
  },
  {
    field: 'glass',
    title: 'Glass surfaces',
    note: 'Off draws flat panels — the same fallback older browsers get.',
  },
  {
    field: 'calmMotion',
    title: 'Reduce motion',
    note: 'Keeps state changes, drops the drift and sweeps.',
  },
];

/** Right-hand drawer over a scrim: the four chrome switches plus the AI key controls. */
export function SettingsDrawer({ settings, onUpdate, onClose }: SettingsDrawerProps) {
  const titleId = useId();
  const keyId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const [ai, setAi] = useState<AiSettings>(() => loadAiSettings());

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = drawer.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !drawer.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function setApiKey(apiKey: string) {
    const next = { ...ai, apiKey };
    setAi(next);
    saveAiSettings(next);
  }

  function forgetKey() {
    clearAiSettings();
    setAi(loadAiSettings());
  }

  return (
    <div className="settings-scrim" role="presentation" onClick={onClose}>
      <aside
        className="settings-drawer g fu"
        ref={drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-head">
          <h2 id={titleId}>Settings</h2>
          <button className="button button-secondary" type="button" onClick={onClose} ref={closeRef}>
            Close
          </button>
        </div>

        <div className="settings-toggles">
          {toggles.map((toggle) => (
            <label className="settings-toggle" key={toggle.field}>
              <input
                type="checkbox"
                checked={settings[toggle.field]}
                onChange={(event) => onUpdate({ [toggle.field]: event.target.checked })}
              />
              <span>
                <strong>{toggle.title}</strong>
                <span>{toggle.note}</span>
              </span>
            </label>
          ))}
        </div>

        <hr className="settings-rule" />

        <div className="settings-key">
          <label className="panel-label" htmlFor={keyId}>
            AI provider key
          </label>
          <input
            id={keyId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-… (stays on this device)"
            value={ai.apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <button className="button button-forget" type="button" onClick={forgetKey}>
            Forget key on this device
          </button>
        </div>

        <p className="settings-note">
          Settings live in this browser's local storage. Clearing site data resets them.
        </p>
      </aside>
    </div>
  );
}
