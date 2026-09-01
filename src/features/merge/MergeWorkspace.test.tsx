import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { mergeToPdf } from '../../lib/pdf';
import { MergeWorkspace } from './MergeWorkspace';

vi.mock('../../lib/pdf', () => ({ mergeToPdf: vi.fn() }));

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:merged'),
    revokeObjectURL: vi.fn(),
  });
});

beforeEach(() => vi.clearAllMocks());

async function uploadTwo(user: ReturnType<typeof userEvent.setup>) {
  const first = new File(['one'], 'first.pdf', { type: 'application/pdf' });
  const second = new File(['two'], 'second.pdf', { type: 'application/pdf' });
  await user.upload(screen.getByLabelText(/choose files to merge/i), [first, second]);
  return [first, second];
}

describe('MergeWorkspace', () => {
  it('reorders files, merges them, and offers a named download', async () => {
    vi.mocked(mergeToPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(<MergeWorkspace />);

    const first = new File(['one'], 'first.pdf', { type: 'application/pdf' });
    const second = new File(['two'], 'second.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/choose files to merge/i), [first, second]);

    const fileList = screen.getByRole('list', { name: /files to merge/i });
    expect(within(fileList).getAllByRole('listitem')[0]).toHaveTextContent('first.pdf');
    await user.click(screen.getByRole('button', { name: /move first.pdf down/i }));
    expect(within(fileList).getAllByRole('listitem')[0]).toHaveTextContent('second.pdf');

    const outputName = screen.getByLabelText(/output filename/i);
    await user.clear(outputName);
    await user.type(outputName, 'team-handbook');
    await user.click(screen.getByRole('button', { name: /merge 2 files/i }));

    expect(mergeToPdf).toHaveBeenCalledWith([second, first], expect.any(AbortSignal));
    expect(await screen.findByRole('link', { name: /download merged pdf/i })).toHaveAttribute(
      'download',
      'team-handbook.pdf',
    );
  });

  it('moves files up, removes them, and disables merging below two files', async () => {
    const user = userEvent.setup();
    render(<MergeWorkspace />);
    await uploadTwo(user);

    await user.click(screen.getByRole('button', { name: /move second.pdf up/i }));
    const fileList = screen.getByRole('list', { name: /files to merge/i });
    expect(within(fileList).getAllByRole('listitem')[0]).toHaveTextContent('second.pdf');

    await user.click(screen.getByRole('button', { name: /remove first.pdf/i }));
    expect(screen.getByRole('button', { name: /merge 1 files/i })).toBeDisabled();
  });

  it('starts over after a merge and lets a slow merge be cancelled', async () => {
    vi.mocked(mergeToPdf).mockResolvedValueOnce(new Uint8Array([1]));
    const user = userEvent.setup();
    render(<MergeWorkspace />);
    await uploadTwo(user);

    await user.click(screen.getByRole('button', { name: /merge 2 files/i }));
    await user.click(await screen.findByRole('button', { name: /start over/i }));
    expect(screen.getByLabelText(/choose files to merge/i)).toBeInTheDocument();

    vi.mocked(mergeToPdf).mockImplementationOnce(
      (_files, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    await uploadTwo(user);
    await user.click(screen.getByRole('button', { name: /merge 2 files/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(await screen.findByRole('button', { name: /merge 2 files/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports merge failures without leaving the working state', async () => {
    vi.mocked(mergeToPdf).mockRejectedValueOnce(new Error('first.pdf is encrypted.'));
    const user = userEvent.setup();
    render(<MergeWorkspace />);
    await uploadTwo(user);

    await user.click(screen.getByRole('button', { name: /merge 2 files/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('first.pdf is encrypted.');
    expect(screen.getByRole('button', { name: /merge 2 files/i })).toBeEnabled();
  });
});
