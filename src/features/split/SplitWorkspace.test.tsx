import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '../../lib/download';
import { getPdfPageCount, splitPdf } from '../../lib/pdf';
import { SplitWorkspace } from './SplitWorkspace';

vi.mock('../../lib/pdf', () => ({ getPdfPageCount: vi.fn(), splitPdf: vi.fn() }));
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

async function open(user: ReturnType<typeof userEvent.setup>, pages: number, name = 'report.pdf') {
  vi.mocked(getPdfPageCount).mockResolvedValue(pages);
  const file = new File(['pdf'], name, { type: 'application/pdf' });
  await user.upload(screen.getByLabelText(/choose a pdf to split/i), file);
  await screen.findByText(new RegExp(`${pages} pages`, 'i'));
  return file;
}

describe('SplitWorkspace', () => {
  it('shows the source panel, a thumbnail per page, and the catalog options', async () => {
    const user = userEvent.setup();
    render(<SplitWorkspace />);
    expect(screen.getByText('1 · Source')).toBeInTheDocument();
    expect(screen.getByText('2 · Settings')).toBeInTheDocument();
    expect(screen.getByText('3 · Result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose a file first/i })).toBeDisabled();

    await open(user, 3);
    expect(screen.getByText('p. 3')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /every page/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /every n pages/i })).toBeInTheDocument();
  });

  it('splits typed page ranges into one PDF and downloads it', async () => {
    vi.mocked(splitPdf).mockResolvedValue([new Uint8Array([1, 2, 3])]);
    const user = userEvent.setup();
    render(<SplitWorkspace />);
    const file = await open(user, 5);

    await user.click(screen.getByRole('radio', { name: /page ranges/i }));
    await user.type(screen.getByLabelText(/pages or ranges/i), '1-2');
    await user.click(screen.getByLabelText(/deliver as a zip archive/i));
    await user.click(screen.getByRole('button', { name: /split pdf/i }));

    expect(splitPdf).toHaveBeenCalledWith(file, [[1, 2]], expect.any(AbortSignal), expect.any(Function));
    await user.click(await screen.findByRole('button', { name: /download pdf/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'report-pages-1-2.pdf');
    expect(screen.getByText('2 pages kept')).toBeInTheDocument();
  });

  it('splits every page into a ZIP and reports the real file count', async () => {
    vi.mocked(splitPdf).mockImplementation(async (_file, groups, _signal, onProgress) => {
      onProgress?.(1, groups.length);
      onProgress?.(2, groups.length);
      return groups.map(() => new Uint8Array([1]));
    });
    const user = userEvent.setup();
    render(<SplitWorkspace />);
    await open(user, 2, 'deck.pdf');
    await user.click(screen.getByRole('button', { name: /split pdf/i }));

    expect(await screen.findByText('2 PDFs')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download zip/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'deck-split.zip');

    await user.click(screen.getByRole('button', { name: /start over/i }));
    expect(screen.getByLabelText(/choose a pdf to split/i)).toBeInTheDocument();
  });

  it('picks pages from the preview when the selected-pages option is on', async () => {
    vi.mocked(splitPdf).mockResolvedValue([new Uint8Array([1])]);
    const user = userEvent.setup();
    render(<SplitWorkspace />);
    const file = await open(user, 3);

    await user.click(screen.getByRole('radio', { name: /selected pages/i }));
    await user.click(screen.getByRole('button', { name: 'p. 2', pressed: true }));
    await user.click(screen.getByRole('button', { name: /split pdf/i }));

    expect(splitPdf).toHaveBeenCalledWith(file, [[1, 3]], expect.any(AbortSignal), expect.any(Function));
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
    expect(screen.getByRole('button', { name: /choose a file first/i })).toBeDisabled();
  });

  it('shows honest progress, then cancels without an error', async () => {
    vi.mocked(splitPdf).mockImplementation(
      (_file, _groups, signal, onProgress) =>
        new Promise((_resolve, reject) => {
          onProgress?.(1, 4);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<SplitWorkspace />);
    await open(user, 4, 'slow.pdf');
    await user.click(screen.getByRole('button', { name: /split pdf/i }));

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /split pdf/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces an invalid range without processing', async () => {
    const user = userEvent.setup();
    render(<SplitWorkspace />);
    await open(user, 3, 'three.pdf');

    await user.click(screen.getByRole('radio', { name: /page ranges/i }));
    await user.type(screen.getByLabelText(/pages or ranges/i), '9');
    await user.click(screen.getByRole('button', { name: /split pdf/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/between 1 and 3/i);
    expect(splitPdf).not.toHaveBeenCalled();
  });
});
