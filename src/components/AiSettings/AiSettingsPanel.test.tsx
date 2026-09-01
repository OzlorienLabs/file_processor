import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { defaultAiSettings, loadAiSettings, saveAiSettings, type AiSettings } from '../../lib/ai-settings';
import { AiSettingsPanel } from './AiSettingsPanel';

function Harness({ initial = defaultAiSettings }: { initial?: AiSettings }) {
  const [settings, setSettings] = useState(initial);
  return (
    <AiSettingsPanel
      settings={settings}
      onChange={(next) => {
        setSettings(next);
        saveAiSettings(next);
      }}
    />
  );
}

describe('AiSettingsPanel', () => {
  it('switches provider and resets to its balanced model', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText(/ai provider/i), 'anthropic');

    expect(screen.getByLabelText(/^model$/i)).toHaveValue('claude-sonnet-5');
  });

  it('reveals the custom model field when custom is chosen', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText(/^model$/i), 'custom');
    await user.type(screen.getByLabelText(/custom model id/i), 'my-model');

    expect(screen.getByLabelText(/custom model id/i)).toHaveValue('my-model');
  });

  it('masks the key with a working show/hide toggle', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const keyField = screen.getByLabelText(/^api key$/i);
    await user.type(keyField, 'sk-secret');
    expect(keyField).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show api key/i }));
    expect(keyField).toHaveAttribute('type', 'text');
  });

  it('persists by default and forgets everything on request', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText(/^api key$/i), 'sk-secret');
    expect(loadAiSettings().apiKey).toBe('sk-secret');

    await user.click(screen.getByRole('button', { name: /forget key on this device/i }));

    expect(localStorage.getItem('filekit.ai.v1')).toBeNull();
    expect(screen.getByLabelText(/^api key$/i)).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: /remember/i })).not.toBeChecked();
  });

  it('stops persisting when remember is unchecked', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText(/^api key$/i), 'sk-secret');
    await user.click(screen.getByRole('checkbox', { name: /remember/i }));

    expect(localStorage.getItem('filekit.ai.v1')).toBeNull();
  });
});
