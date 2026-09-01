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

  it('splits every page into a ZIP and starts over cleanly', async () => {
    vi.mocked(getPdfPageCount).mockResolvedValue(2);
    vi.mocked(splitPdf).mockResolvedValue([new Uint8Array([1]), new Uint8Array([2])]);
    const user = userEvent.setup();
    render(<SplitWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a pdf to split/i),
      new File(['pdf'], 'deck.pdf', { type: 'application/pdf' }),
    );
    await screen.findByText(/2 pages detected/i);
    await user.click(screen.getByRole('button', { name: /split pdf/i }));

    expect(splitPdf).toHaveBeenCalledWith(expect.anything(), [[1], [2]], expect.any(AbortSignal));
    expect(await screen.findByRole('link', { name: /download split pdfs/i })).toHaveAttribute(
      'download',
      'deck-split-pages.zip',
    );

    await user.click(screen.getByRole('button', { name: /start over/i }));
    expect(screen.getByLabelText(/choose a pdf to split/i)).toBeInTheDocument();
  });

  it('explains when a PDF cannot be opened', async () => {
    vi.mocked(getPdfPageCount).mockRejectedValue(new Error('encrypted'));
    const user = userEvent.setup();
    render(<SplitWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a pdf to split/i),
      new File(['pdf'], 'locked.pdf', { type: 'application/pdf' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/encrypted or damaged/i);
    expect(screen.queryByRole('button', { name: /split pdf/i })).not.toBeInTheDocument();
  });

  it('lets a slow split be cancelled without reporting an error', async () => {
    vi.mocked(getPdfPageCount).mockResolvedValue(2);
    vi.mocked(splitPdf).mockImplementation(
      (_file, _groups, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<SplitWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a pdf to split/i),
      new File(['pdf'], 'slow.pdf', { type: 'application/pdf' }),
    );
    await screen.findByText(/2 pages detected/i);
    await user.click(screen.getByRole('button', { name: /split pdf/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(await screen.findByRole('button', { name: /split pdf/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
