import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { convertDocxToPdf } from '../../lib/docx-convert';
import { downloadBlob } from '../../lib/download';
import { WordToPdfWorkspace } from './WordToPdfWorkspace';

vi.mock('../../lib/docx-convert', () => ({ convertDocxToPdf: vi.fn() }));
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function upload(user: ReturnType<typeof userEvent.setup>, name = 'Notes (final).docx') {
  const file = new File(['docx'], name, { type: docxType });
  await user.upload(screen.getByLabelText(/choose a word document/i), file);
  await screen.findByRole('button', { name: /create pdf/i });
  return file;
}

describe('WordToPdfWorkspace', () => {
  it('converts a DOCX at the default A4 portrait and downloads the PDF', async () => {
    vi.mocked(convertDocxToPdf).mockResolvedValue(new Uint8Array([1, 2]));
    const user = userEvent.setup();
    render(<WordToPdfWorkspace />);
    const file = await upload(user);

    await user.click(screen.getByRole('button', { name: /create pdf/i }));

    expect(convertDocxToPdf).toHaveBeenCalledWith(
      file,
      undefined,
      expect.any(AbortSignal),
      { format: 'a4', orientation: 'portrait' },
      expect.any(Function),
    );
    expect(await screen.findByText(/A4 portrait/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download pdf/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Notes-final.pdf');
  });

  it('passes the chosen page size and orientation through', async () => {
    vi.mocked(convertDocxToPdf).mockResolvedValue(new Uint8Array([1]));
    const user = userEvent.setup();
    render(<WordToPdfWorkspace />);
    await upload(user, 'memo.docx');

    await user.click(screen.getAllByRole('radio')[2]);
    await user.click(screen.getByRole('button', { name: /create pdf/i }));

    expect(convertDocxToPdf).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.any(AbortSignal),
      { format: 'a4', orientation: 'landscape' },
      expect.any(Function),
    );
  });

  it('reports the two real conversion milestones and cancels quietly', async () => {
    vi.mocked(convertDocxToPdf).mockImplementation(
      (_file, _extract, signal, _page, onProgress) =>
        new Promise((_resolve, reject) => {
          onProgress?.(1, 2);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<WordToPdfWorkspace />);
    await upload(user, 'slow.docx');
    await user.click(screen.getByRole('button', { name: /create pdf/i }));

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /create pdf/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an actionable error when conversion fails', async () => {
    vi.mocked(convertDocxToPdf).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<WordToPdfWorkspace />);
    await upload(user, 'broken.docx');
    await user.click(screen.getByRole('button', { name: /create pdf/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/damaged or password protected/i);
  });
});
