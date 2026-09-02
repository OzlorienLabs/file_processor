import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { ToolDefinition } from '../../app/tool-catalog';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useToolMeta } from '../../hooks/useToolMeta';
import { useUiSettings } from '../../hooks/useUiSettings';
import { describeProcessing } from '../../pages/tool-disclosure';
import { ToolMark } from '../ToolMark/ToolMark';
import { SettingsDrawer } from './SettingsDrawer';
import { ToolRail } from './ToolRail';

/** Below this the rail is icons-only whatever the setting says. */
const NARROW = '(max-width: 1000px)';

/**
 * The frame every tool route opens into: a glass rail on the left, a glass top bar, and the
 * workspace filling the rest. The per-tool how-to and the full processing disclosure live in
 * the panel behind the top bar's pill, so neither pushes the workspace down.
 */
export function AppShell({ tool, children }: { tool: ToolDefinition; children: ReactNode }) {
  const { settings, update } = useUiSettings();
  const narrow = useMediaQuery(NARROW);
  const fullscreen = useFullscreen();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideId = useId();

  const disclosure = describeProcessing(tool);
  const labels = settings.railLabels && !narrow;

  useToolMeta({ mark: tool.id, title: tool.name, description: tool.description });

  const { enter } = fullscreen;
  const openFullscreen = settings.fullscreenDefault;
  useEffect(() => {
    if (openFullscreen) enter();
  }, [openFullscreen, enter]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <ToolRail labels={labels} onToggleLabels={narrow ? null : () => update({ railLabels: !settings.railLabels })} />

      <div className="shell-body">
        <header className="shell-bar g2">
          <span className="shell-bar-mark">
            <ToolMark tool={tool.id} />
          </span>
          <div className="shell-bar-title">
            <h1>{tool.name}</h1>
            <p>{tool.description}</p>
          </div>
          <button
            className="shell-pill gi ctl"
            type="button"
            aria-expanded={guideOpen}
            aria-controls={guideId}
            onClick={() => setGuideOpen((open) => !open)}
          >
            <span className="shell-pill-dot" aria-hidden="true" />
            {disclosure.pill}
          </button>
          <div className="shell-bar-spacer" />
          {fullscreen.supported ? (
            <button className="shell-action gi ctl" type="button" onClick={fullscreen.toggle}>
              {fullscreen.active ? 'Exit full screen' : 'Full screen'}
            </button>
          ) : null}
          <button className="shell-action gi ctl" type="button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <Link className="shell-action gi ctl" to="/en">
            All tools
          </Link>
        </header>

        <div className="shell-stage">
          {guideOpen ? (
            <section className="shell-guide g fu" id={guideId} aria-label="Quick instructions">
              <p className="shell-guide-note">{disclosure.note}</p>
              <h2>{tool.howTo}</h2>
              <ol>
                {tool.steps.map((step, index) => (
                  <li data-testid="instruction-step" key={step}>
                    <span aria-hidden="true">{index + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <main className="shell-workspace fi" id="main-content" key={tool.id} aria-label={`${tool.name} workspace`}>
            {children}
          </main>
        </div>
      </div>

      {settingsOpen ? (
        <SettingsDrawer settings={settings} onUpdate={update} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </div>
  );
}
