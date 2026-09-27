import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { trackPageView } from '../lib/analytics';
import { PageViewTracker } from './PageViewTracker';

vi.mock('../lib/analytics', () => ({ trackPageView: vi.fn() }));

describe('PageViewTracker', () => {
  it('reports the first route and each path change, ignoring query-only changes', async () => {
    const router = createMemoryRouter([{ path: '*', element: <PageViewTracker /> }], {
      initialEntries: ['/en'],
    });
    render(<RouterProvider router={router} />);
    expect(trackPageView).toHaveBeenLastCalledWith('/en');

    await act(() => router.navigate('/en/merge'));
    expect(trackPageView).toHaveBeenLastCalledWith('/en/merge');

    await act(() => router.navigate('/en/merge?x=1'));
    expect(trackPageView).toHaveBeenCalledTimes(2);
  });
});
