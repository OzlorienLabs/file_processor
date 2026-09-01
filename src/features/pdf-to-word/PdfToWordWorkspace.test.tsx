import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { convertPdfToDocx } from '../../lib/pdf-to-docx';
import { PdfToWordWorkspace } from './PdfToWordWorkspace';

vi.mock('../../lib/pdf-to-docx', () => ({ convertPdfToDocx: vi.fn() }));

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:pdf-to-word'),
    revokeObjectURL: vi.fn(),
  });
});

beforeEach(() => vi.clearAllMocks());

describe('PdfToWordWorkspace', () => {
  it('converts a PDF and offers the DOCX download', async () => {
    vi.mocked(convertPdfToDocx).mockResolvedValue(new Blob(['docx']));
    const user = userEvent.setup();
    render(<PdfToWordWorkspace />);

    const file = new File(['pdf'], 'contract.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/choose a pdf document/i), file);
    await user.click(screen.getByRole('button', { name: /convert to word/i }));

    expect(convertPdfToDocx).toHaveBeenCalledWith(
      file,
      undefined,
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(await screen.findByRole('link', { name: /download word document/i })).toHaveAttribute(
      'download',
      'contract.docx',
    );
  });

  it('reports extraction progress while working', async () => {
    let resolveConversion: (blob: Blob) => void = () => {};
    vi.mocked(convertPdfToDocx).mockImplementation(async (_file, _open, _signal, onProgress) => {
      onProgress?.(2, 5);
      return new Promise((resolve) => {
        resolveConversion = resolve;
      });
    });
    const user = userEvent.setup();
    render(<PdfToWordWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a pdf document/i),
      new File(['pdf'], 'long.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: /convert to word/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Extracting page 2 of 5');
    resolveConversion(new Blob(['done']));
    expect(await screen.findByRole('link', { name: /download word document/i })).toBeInTheDocument();
  });

  it('shows an actionable error when conversion fails', async () => {
    vi.mocked(convertPdfToDocx).mockRejectedValue(new Error('encrypted'));
    const user = userEvent.setup();
    render(<PdfToWordWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a pdf document/i),
      new File(['pdf'], 'locked.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: /convert to word/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be converted/i);
  });
});
