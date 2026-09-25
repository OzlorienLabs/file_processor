import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { getToolByPath } from '../app/tool-catalog';
import { ToolPage } from './ToolPage';

describe('ToolPage', () => {
  it('renders screen capture workspace via lazy loading', async () => {
    const tool = getToolByPath('/en/screen-capture');
    expect(tool).toBeDefined();

    render(
      <MemoryRouter>
        <ToolPage tool={tool!} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /screen capture/i })).toBeInTheDocument();
    });
  });
});
