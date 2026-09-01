import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { convertDocxToPdf } from '../../lib/docx-convert';
import { WordToPdfWorkspace } from './WordToPdfWorkspace';

vi.mock('../../lib/docx-convert', () => ({ convertDocxToPdf: vi.fn() }));

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:word-to-pdf'),
    revokeObjectURL: vi.fn(),
  });
});

beforeEach(() => vi.clearAllMocks());

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('WordToPdfWorkspace', () => {
  it('converts a DOCX and offers the PDF download', async () => {
    vi.mocked(convertDocxToPdf).mockResolvedValue(new Uint8Array([1, 2]));
    const user = userEvent.setup();
    render(<WordToPdfWorkspace />);

    const file = new File(['docx'], 'Notes (final).docx', { type: docxType });
    await user.upload(screen.getByLabelText(/choose a word document/i), file);
    await user.click(screen.getByRole('button', { name: /convert to pdf/i }));

    expect(convertDocxToPdf).toHaveBeenCalledWith(file, undefined, expect.any(AbortSignal));
    expect(await screen.findByRole('link', { name: /download pdf/i })).toHaveAttribute(
      'download',
      'Notes-final.pdf',
    );
  });

  it('shows an actionable error when conversion fails', async () => {
    vi.mocked(convertDocxToPdf).mockRejectedValue(new Error('broken zip'));
    const user = userEvent.setup();
    render(<WordToPdfWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a word document/i),
      new File(['bad'], 'bad.docx', { type: docxType }),
    );
    await user.click(screen.getByRole('button', { name: /convert to pdf/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be converted/i);
  });
});
