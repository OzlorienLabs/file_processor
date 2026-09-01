import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ocrFile } from '../../lib/ocr';
import { OcrWorkspace } from './OcrWorkspace';

vi.mock('../../lib/ocr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/ocr')>();
  return { ...actual, ocrFile: vi.fn() };
});

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:ocr'),
    revokeObjectURL: vi.fn(),
  });
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

beforeEach(() => vi.clearAllMocks());

describe('OcrWorkspace', () => {
  it('runs OCR with the selected language and shows the editable text', async () => {
    vi.mocked(ocrFile).mockResolvedValue('Recognized words');
    const user = userEvent.setup();
    render(<OcrWorkspace />);

    const file = new File(['img'], 'receipt.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/choose a file for ocr/i), file);
    await user.selectOptions(screen.getByLabelText(/document language/i), 'deu');
    await user.click(screen.getByRole('button', { name: /start ocr/i }));

    expect(ocrFile).toHaveBeenCalledWith(
      file,
      'deu',
      undefined,
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(await screen.findByLabelText('Extracted text')).toHaveValue('Recognized words');
    expect(screen.getByRole('link', { name: /download text/i })).toHaveAttribute(
      'download',
      'receipt-ocr.txt',
    );
  });

  it('shows progress while recognizing', async () => {
    let finish: (text: string) => void = () => {};
    vi.mocked(ocrFile).mockImplementation(async (_file, _language, _deps, _signal, onProgress) => {
      onProgress?.('Reading page 1 of 3', 1 / 3);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const user = userEvent.setup();
    render(<OcrWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file for ocr/i),
      new File(['pdf'], 'scan.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: /start ocr/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Reading page 1 of 3 — 33%');
    finish('done');
    expect(await screen.findByLabelText('Extracted text')).toHaveValue('done');
  });

  it('surfaces recognition failures with advice', async () => {
    vi.mocked(ocrFile).mockRejectedValue(new Error('bad scan'));
    const user = userEvent.setup();
    render(<OcrWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file for ocr/i),
      new File(['img'], 'blurry.jpg', { type: 'image/jpeg' }),
    );
    await user.click(screen.getByRole('button', { name: /start ocr/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be recognized/i);
  });
});
