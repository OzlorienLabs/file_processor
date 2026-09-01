import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  aiProviders,
  clearAiSettings,
  CUSTOM_MODEL_ID,
  defaultAiSettings,
  type AiProvider,
  type AiSettings,
} from '../../lib/ai-settings';

interface AiSettingsPanelProps {
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
  disabled?: boolean;
}

export function AiSettingsPanel({ settings, onChange, disabled = false }: AiSettingsPanelProps) {
  const [showKey, setShowKey] = useState(false);
  const provider = aiProviders[settings.provider];

  const changeProvider = (nextProvider: AiProvider) => {
    onChange({
      ...settings,
      provider: nextProvider,
      model: aiProviders[nextProvider].models[1].id,
      customModel: '',
    });
  };

  return (
    <fieldset className="ai-settings" disabled={disabled}>
      <legend>AI model and key</legend>
      <div className="ai-settings-grid">
        <label className="field-label" htmlFor="ai-provider">
          AI provider
          <select
            id="ai-provider"
            value={settings.provider}
            onChange={(event) => changeProvider(event.target.value as AiProvider)}
          >
            {Object.entries(aiProviders).map(([id, info]) => (
              <option key={id} value={id}>{info.label}</option>
            ))}
          </select>
        </label>
        <label className="field-label" htmlFor="ai-model">
          Model
          <select
            id="ai-model"
            value={settings.model}
            onChange={(event) => onChange({ ...settings, model: event.target.value })}
          >
            {provider.models.map((model) => (
              <option key={model.id} value={model.id}>{`${model.label} — ${model.hint}`}</option>
            ))}
            <option value={CUSTOM_MODEL_ID}>Custom model ID…</option>
          </select>
        </label>
      </div>
      {settings.model === CUSTOM_MODEL_ID ? (
        <label className="field-label" htmlFor="ai-custom-model">
          Custom model ID
          <input
            id="ai-custom-model"
            value={settings.customModel}
            placeholder="exact model identifier"
            onChange={(event) => onChange({ ...settings, customModel: event.target.value })}
          />
        </label>
      ) : null}
      <label className="field-label" htmlFor="ai-key">
        API key
        <span className="input-with-suffix">
          <input
            id="ai-key"
            type={showKey ? 'text' : 'password'}
            value={settings.apiKey}
            placeholder={provider.keyHint}
            autoComplete="off"
            onChange={(event) => onChange({ ...settings, apiKey: event.target.value })}
          />
          <button
            className="inline-icon-button"
            type="button"
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            onClick={() => setShowKey((value) => !value)}
          >
            {showKey ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
          </button>
        </span>
      </label>
      <div className="ai-settings-footer">
        <label className="acknowledge-row">
          <input
            type="checkbox"
            checked={settings.remember}
            onChange={(event) => onChange({ ...settings, remember: event.target.checked })}
          />
          <span>
            Remember my model and key in this browser. Anything stored here is readable by this
            site only, and a restricted or project-scoped key is safest.
          </span>
        </label>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => {
            clearAiSettings();
            onChange({ ...defaultAiSettings, remember: false });
          }}
        >
          <Trash2 aria-hidden="true" size={16} /> Forget key on this device
        </button>
      </div>
    </fieldset>
  );
}
