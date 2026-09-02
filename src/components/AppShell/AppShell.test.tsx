import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { coreTools, toolsInCategory } from '../../app/tool-catalog';
import { UI_SETTINGS_KEY } from '../../lib/ui-settings';
import { setMatchedMedia } from '../../test/media';
import { AppShell } from './AppShell';

const merge = coreTools.find((tool) => tool.id === 'merge')!;
const NARROW = '(max-width: 1000px)';

function renderShell(tool = merge) {
  return render(
    <MemoryRouter initialEntries={[tool.path]}>
      <AppShell tool={tool}>
        <p>workspace body</p>
      </AppShell>
    </MemoryRouter>,
  );
}

/** jsdom ships no Fullscreen API; the shell only offers the control when the browser does. */
function stubFullscreen() {
  const request = vi.fn().mockResolvedValue(undefined);
  const exit = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    writable: true,
    value: request,
  });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, writable: true, value: exit });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, writable: true, value: null });
  return { request, exit };
}

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    writable: true,
    value: element,
  });
  document.dispatchEvent(new Event('fullscreenchange'));
}

afterEach(() => {
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  Reflect.deleteProperty(document, 'exitFullscreen');
  Reflect.deleteProperty(document, 'fullscreenElement');
});

describe('AppShell', () => {
  it('builds the rail from the catalog, grouped Files then Create', () => {
    renderShell();
    const rail = screen.getByRole('navigation', { name: /all tools/i });
    expect(within(rail).getByRole('list', { name: /files/i })).toBeInTheDocument();
    expect(within(rail).getAllByRole('listitem')).toHaveLength(coreTools.length);
    for (const tool of toolsInCategory('create')) {
      expect(within(rail).getByRole('link', { name: tool.shortName })).toHaveAttribute('href', tool.path);
    }
  });

  it('keeps the skip link and labels the workspace region', () => {
    renderShell();
    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main', { name: /merge pdf workspace/i })).toHaveTextContent('workspace body');
  });

  it('collapses the rail and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = renderShell();
    const rail = screen.getByRole('navigation', { name: /all tools/i });
    expect(rail).toHaveAttribute('data-labels', 'true');

    await user.click(screen.getByRole('button', { name: /collapse rail/i }));
    expect(screen.getByRole('navigation', { name: /all tools/i })).toHaveAttribute('data-labels', 'false');
    expect(localStorage.getItem(UI_SETTINGS_KEY)).toContain('"railLabels":false');

    unmount();
    renderShell();
    expect(screen.getByRole('navigation', { name: /all tools/i })).toHaveAttribute('data-labels', 'false');
  });

  it('forces the icon rail below 1000px whatever the setting says', () => {
    setMatchedMedia([NARROW]);
    renderShell();
    expect(screen.getByRole('navigation', { name: /all tools/i })).toHaveAttribute('data-labels', 'false');
    expect(screen.queryByRole('button', { name: /collapse rail/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Merge PDF' })).toBeInTheDocument();
  });

  it('toggles glass and motion through the root element and persists them', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: /^settings$/i }));

    await user.click(screen.getByRole('checkbox', { name: /glass surfaces/i }));
    expect(document.documentElement).toHaveClass('flat');

    await user.click(screen.getByRole('checkbox', { name: /reduce motion/i }));
    expect(document.documentElement).toHaveClass('calm');

    const stored = localStorage.getItem(UI_SETTINGS_KEY) ?? '';
    expect(stored).toContain('"glass":false');
    expect(stored).toContain('"calmMotion":true');
  });

  it('closes the settings drawer from the backdrop and from Escape', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: /^settings$/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^settings$/i }));
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stores and forgets the AI provider key from the drawer', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: /^settings$/i }));

    await user.type(screen.getByLabelText(/ai provider key/i), 'sk-test');
    expect(localStorage.getItem('filekit.ai.v1')).toContain('sk-test');

    await user.click(screen.getByRole('button', { name: /forget key on this device/i }));
    expect(localStorage.getItem('filekit.ai.v1')).toBeNull();
    expect(screen.getByLabelText(/ai provider key/i)).toHaveValue('');
  });

  it('hides the fullscreen control when the browser has no Fullscreen API', () => {
    renderShell();
    expect(screen.queryByRole('button', { name: /full screen/i })).not.toBeInTheDocument();
  });

  it('toggles fullscreen and relabels when the browser leaves it', async () => {
    const user = userEvent.setup();
    const { request, exit } = stubFullscreen();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(request).toHaveBeenCalledTimes(1);

    setFullscreenElement(document.documentElement);
    const exitButton = await screen.findByRole('button', { name: 'Exit full screen' });
    await user.click(exitButton);
    expect(exit).toHaveBeenCalledTimes(1);

    // Escape leaves fullscreen without the button; the label has to follow the browser.
    setFullscreenElement(null);
    expect(await screen.findByRole('button', { name: 'Full screen' })).toBeInTheDocument();
  });

  it('opens full screen on arrival when the setting asks for it', async () => {
    const { request } = stubFullscreen();
    localStorage.setItem(
      UI_SETTINGS_KEY,
      JSON.stringify({ railLabels: true, fullscreenDefault: true, glass: true, calmMotion: false }),
    );
    renderShell();
    expect(request).toHaveBeenCalled();
    await Promise.resolve();
  });
});
