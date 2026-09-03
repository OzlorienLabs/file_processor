import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { App, AppRoutes } from './App';
import { coreTools, toolCounts } from './tool-catalog';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('application routes', () => {
  it('shows every requested tool on the home page', () => {
    renderAt('/en');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/files in\.\s*result out\./i);
    expect(screen.getAllByTestId('tool-card')).toHaveLength(coreTools.length);
    expect(screen.queryByRole('link', { name: /every emoji/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /emoji library/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /source/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/log in/i)).not.toBeInTheDocument();
    expect(screen.getByText(/built with curiosity and care by ozlorien labs\./i)).toBeInTheDocument();
  });

  it('derives its counts from the catalog', () => {
    renderAt('/en');
    const counts = toolCounts();
    expect(screen.getByText(new RegExp(`${counts.local} tools never leave the tab`, 'i'))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${counts.ai} AI tools ask first`, 'i'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(`see all ${counts.total} tools`, 'i') })).toBeInTheDocument();
  });

  it('opens a tool into the shell, with the rail, top bar, and workspace', () => {
    renderAt('/en/merge');

    expect(screen.getByRole('heading', { level: 1, name: 'Merge PDF' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /all tools/i })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: /merge pdf workspace/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/choose files to merge/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^all tools$/i })).toHaveAttribute('href', '/en');
  });

  it('marks the open tool in the rail and no other', () => {
    renderAt('/en/merge');
    const rail = screen.getByRole('navigation', { name: /all tools/i });
    const current = within(rail).getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/en/merge');
  });

  it('keeps the how-to and the full disclosure behind the top-bar pill', async () => {
    const user = userEvent.setup();
    renderAt('/en/merge');

    const pill = screen.getByRole('button', { name: /runs in your browser/i });
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: /how to merge pdf/i })).not.toBeInTheDocument();

    await user.click(pill);
    expect(screen.getByRole('heading', { name: /how to merge pdf/i })).toBeInTheDocument();
    expect(screen.getByText(/your files stay on this device/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('instruction-step')).toHaveLength(3);
  });

  it('redirects the root and gives unknown routes a useful recovery link', () => {
    const { unmount } = renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/result out\./i);
    unmount();

    renderAt('/en/missing');
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to all tools/i })).toHaveAttribute(
      'href',
      '/en',
    );
  });

  it('boots the full app with its own router', () => {
    window.history.pushState({}, '', '/en');
    render(<App />);
    expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent(/result out\./i);
  });

  it('labels AI-assisted tools distinctly from fully local ones', async () => {
    const user = userEvent.setup();
    renderAt('/en/summarize');
    const pill = screen.getByRole('button', { name: /browser \+ your ai provider/i });
    await user.click(pill);
    expect(screen.getByText(/the file is read locally/i)).toBeInTheDocument();
  });

  it('explains local-storage persistence for editors', async () => {
    const user = userEvent.setup();
    renderAt('/en/diff');
    expect(await screen.findByLabelText(/original text/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /runs in your browser/i }));
    expect(screen.getByText(/saved in this browser's local storage/i)).toBeInTheDocument();
  });

  it('describes the on-device-or-provider choice for the snippet generator', async () => {
    const user = userEvent.setup();
    renderAt('/en/snippet-generator');
    await user.click(screen.getByRole('button', { name: /on-device ai or your provider/i }));
    expect(screen.getByText(/nothing leaves this device/i)).toBeInTheDocument();
  });

  it('keeps the header focused on the brand and workspace action without unneeded links', () => {
    renderAt('/en');

    expect(screen.getByRole('link', { name: /filekit home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /primary navigation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open navigation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^editors$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^how it works$/i })).not.toBeInTheDocument();
  });
});
