import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { App, AppRoutes } from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('application routes', () => {
  it('shows every requested tool and the emoji catalog on the home page', () => {
    renderAt('/en');

    expect(
      screen.getByRole('heading', { name: /useful tools for everyday files/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('tool-card')).toHaveLength(9);
    expect(screen.getByRole('link', { name: /browse every emoji/i })).toHaveAttribute(
      'href',
      '/en/emojis',
    );
    expect(screen.queryByText(/log in/i)).not.toBeInTheDocument();
  });

  it('renders a focused tool page with privacy and instructions', () => {
    renderAt('/en/merge');

    expect(screen.getByRole('heading', { name: 'Merge PDF' })).toBeInTheDocument();
    expect(screen.getByText(/your files stay on this device/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /how to merge pdf/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('instruction-step')).toHaveLength(3);
    expect(screen.getByLabelText(/choose files to merge/i)).toBeInTheDocument();
  });

  it('redirects the root and gives unknown routes a useful recovery link', () => {
    const { unmount } = renderAt('/');
    expect(
      screen.getByRole('heading', { name: /useful tools for everyday files/i }),
    ).toBeInTheDocument();
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
    expect(
      screen.getAllByRole('heading', { name: /useful tools for everyday files/i }).length,
    ).toBeGreaterThan(0);
  });

  it('labels AI-assisted tools distinctly from fully local ones', () => {
    renderAt('/en/summarize');
    expect(screen.getByText(/browser \+ your ai provider/i)).toBeInTheDocument();
    expect(screen.getByText(/the file is read locally/i)).toBeInTheDocument();
  });

  it('opens and closes the mobile navigation menu', async () => {
    const user = userEvent.setup();
    renderAt('/en');

    const toggle = screen.getByRole('button', { name: /open navigation/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: /close navigation/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('link', { name: /emoji library/i }));
    expect(screen.getByRole('button', { name: /open navigation/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
