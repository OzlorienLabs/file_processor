import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppRoutes } from './App';

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
});
