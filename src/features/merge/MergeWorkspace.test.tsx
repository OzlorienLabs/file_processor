import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '../../lib/download';
import { getPdfPageCount, mergeToPdf } from '../../lib/pdf';
import { MergeWorkspace } from './MergeWorkspace';

vi.mock('../../lib/pdf', () => ({ mergeToPdf: vi.fn(), getPdfPageCount: vi.fn() }));
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPdfPageCount).mockResolvedValue(4);
});

async function uploadTwo(user: ReturnType<typeof userEvent.setup>) {
  const first = new File(['one'], 'first.pdf', { type: 'application/pdf' });
  const second = new File(['two'], 'second.pdf', { type: 'application/pdf' });
  await user.upload(screen.getByLabelText(/choose files to merge/i), [first, second]);
  await screen.findByRole('list', { name: /files to merge/i });
  return [first, second];
}

describe('MergeWorkspace', () => {
  it('reorders files by hand, merges them, and downloads the result', async () => {
    vi.mocked(mergeToPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(<MergeWorkspace />);
    const [first, second] = await uploadTwo(user);

    const list = screen.getByRole('list', { name: /files to merge/i });
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('first.pdf');
    await user.click(screen.getByRole('button', { name: /move first.pdf down/i }));
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('second.pdf');

    await user.click(screen.getByRole('button', { name: /merge into one pdf/i }));
    expect(mergeToPdf).toHaveBeenCalledWith(
      [second, first],
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Number),
    );

    expect(await screen.findByText('One PDF, 4 pages')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download pdf/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'merged-document.pdf');
  });

  it('applies the catalog page orders and freezes the arrows outside file order', async () => {
    vi.mocked(mergeToPdf).mockResolvedValue(new Uint8Array([1]));
    const user = userEvent.setup();
    render(<MergeWorkspace />);
    const [first, second] = await uploadTwo(user);

    await user.click(screen.getByRole('radio', { name: /reverse/i }));
    expect(screen.getByRole('button', { name: /move second.pdf down/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /merge into one pdf/i }));
    expect(mergeToPdf).toHaveBeenCalledWith(
      [second, first],
      expect.any(AbortSignal),
      expect.any(Function),
      expect.any(Number),
    );
  });

  it('ignores a move that would fall off either end of the list', async () => {
    const user = userEvent.setup();
    render(<MergeWorkspace />);
    await uploadTwo(user);

    const list = screen.getByRole('list', { name: /files to merge/i });
    expect(screen.getByRole('button', { name: /move first.pdf up/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /move second.pdf up/i }));
    await user.click(screen.getByRole('button', { name: /move second.pdf up/i }));
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('second.pdf');
  });

  it('removes files and blocks merging below two', async () => {
    const user = userEvent.setup();
    render(<MergeWorkspace />);
    await uploadTwo(user);

    await user.click(screen.getByRole('button', { name: /remove first.pdf/i }));
    expect(screen.getByRole('button', { name: /add at least two files/i })).toBeDisabled();
  });

  it('threads real per-file progress and cancels quietly', async () => {
    vi.mocked(mergeToPdf).mockImplementation(
      (_files, signal, onProgress) =>
        new Promise((_resolve, reject) => {
          onProgress?.(1, 2);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<MergeWorkspace />);
    await uploadTwo(user);
    await user.click(screen.getByRole('button', { name: /merge into one pdf/i }));

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '48');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /merge into one pdf/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports merge failures without leaving the working state', async () => {
    vi.mocked(mergeToPdf).mockRejectedValueOnce(new Error('first.pdf is encrypted.'));
    const user = userEvent.setup();
    render(<MergeWorkspace />);
    await uploadTwo(user);
    await user.click(screen.getByRole('button', { name: /merge into one pdf/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('first.pdf is encrypted.');
    expect(screen.getByRole('button', { name: /merge into one pdf/i })).toBeEnabled();
  });
});
