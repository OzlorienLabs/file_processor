import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPdfPageCount, splitPdf } from '../../lib/pdf';
import { SplitWorkspace } from './SplitWorkspace';

vi.mock('../../lib/pdf', () => ({
  getPdfPageCount: vi.fn(),
  splitPdf: vi.fn(),
}));

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:split'),
    revokeObjectURL: vi.fn(),
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SplitWorkspace', () => {
  it('extracts a validated page selection into one downloadable PDF', async () => {
    vi.mocked(getPdfPageCount).mockResolvedValue(5);
    vi.mocked(splitPdf).mockResolvedValue([new Uint8Array([1, 2, 3])]);
    const user = userEvent.setup();
    render(<SplitWorkspace />);

    const file = new File(['pdf'], 'report.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/choose a pdf to split/i), file);
    expect(await screen.findByText(/5 pages detected/i)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /selected pages/i }));
    await user.type(screen.getByLabelText(/pages or ranges/i), '1-2, 5');
    await user.click(screen.getByRole('button', { name: /split pdf/i }));

    expect(splitPdf).toHaveBeenCalledWith(file, [[1, 2, 5]], expect.any(AbortSignal));
    expect(await screen.findByRole('link', { name: /download split pdf/i })).toHaveAttribute(
      'download',
      'report-pages-1-2-5.pdf',
    );
  });

  it('announces an invalid range without processing', async () => {
    vi.mocked(getPdfPageCount).mockResolvedValue(3);
    const user = userEvent.setup();
    render(<SplitWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a pdf to split/i),
      new File(['pdf'], 'three.pdf', { type: 'application/pdf' }),
    );
    await screen.findByText(/3 pages detected/i);
    await user.click(screen.getByRole('radio', { name: /selected pages/i }));
    await user.type(screen.getByLabelText(/pages or ranges/i), '9');
    await user.click(screen.getByRole('button', { name: /split pdf/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/between 1 and 3/i);
    expect(splitPdf).not.toHaveBeenCalled();
  });
});
