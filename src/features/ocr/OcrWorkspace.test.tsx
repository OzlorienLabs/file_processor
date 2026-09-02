import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '../../lib/download';
import { ocrPages } from '../../lib/ocr';
import { OcrWorkspace } from './OcrWorkspace';

vi.mock('../../lib/ocr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/ocr')>();
  return { ...actual, ocrPages: vi.fn() };
});
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

async function upload(user: ReturnType<typeof userEvent.setup>, name = 'receipt.png') {
  const file = new File(['img'], name, { type: 'image/png' });
  await user.upload(screen.getByLabelText(/choose a file for ocr/i), file);
  await screen.findByRole('combobox', { name: /document language/i });
  return file;
}

describe('OcrWorkspace', () => {
  it('recognises with the chosen language and effort, and shows the text', async () => {
    vi.mocked(ocrPages).mockResolvedValue(['Recognized\nwords']);
    const user = userEvent.setup();
    render(<OcrWorkspace />);
    const file = await upload(user);

    await user.selectOptions(screen.getByLabelText(/document language/i), 'deu');
    await user.click(screen.getByRole('button', { name: /extract text/i }));

    expect(ocrPages).toHaveBeenCalledWith(
      file,
      'deu',
      undefined,
      expect.any(AbortSignal),
      expect.any(Function),
      2.5,
    );
    expect(await screen.findByText('Extract text complete')).toBeInTheDocument();
    expect(screen.getByText(/Recognized\s+words/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download text/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'receipt-ocr.txt');
  });

  it('unwraps page line breaks when the extra option is off', async () => {
    vi.mocked(ocrPages).mockResolvedValue(['one\ntwo']);
    const user = userEvent.setup();
    render(<OcrWorkspace />);
    await upload(user);

    await user.click(screen.getByLabelText(/keep line breaks as in the page/i));
    await user.click(screen.getByRole('button', { name: /extract text/i }));

    expect(await screen.findByText('one two')).toBeInTheDocument();
  });

  it('packs a multi-page result into a ZIP when asked for one file per page', async () => {
    vi.mocked(ocrPages).mockResolvedValue(['page one', 'page two']);
    const user = userEvent.setup();
    render(<OcrWorkspace />);
    await upload(user, 'scan.pdf');

    await user.click(screen.getByRole('radio', { name: /per page/i }));
    await user.click(screen.getByRole('button', { name: /extract text/i }));

    expect(await screen.findByText('2 pages recognised')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download zip/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'scan-ocr.zip');
  });

  it('keeps a single-page result as one text file even in per-page mode', async () => {
    vi.mocked(ocrPages).mockResolvedValue(['only page']);
    const user = userEvent.setup();
    render(<OcrWorkspace />);
    await upload(user, 'one.png');

    await user.click(screen.getByRole('radio', { name: /per page/i }));
    await user.click(screen.getByRole('button', { name: /extract text/i }));

    expect(await screen.findByText('Extract text complete')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download text/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'one-ocr.txt');
  });

  it('reports the engine progress and cancels quietly', async () => {
    vi.mocked(ocrPages).mockImplementation(
      (_file, _language, _deps, signal, onProgress) =>
        new Promise((_resolve, reject) => {
          onProgress?.('Reading page 1 of 2', 0.5);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<OcrWorkspace />);
    await upload(user);
    await user.click(screen.getByRole('button', { name: /extract text/i }));

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /extract text/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces recognition failures with advice', async () => {
    vi.mocked(ocrPages).mockRejectedValue(new Error('worker died'));
    const user = userEvent.setup();
    render(<OcrWorkspace />);
    await upload(user);
    await user.click(screen.getByRole('button', { name: /extract text/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/sharper scan or a different language/i);
  });
});
