import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '../../lib/download';
import { getPdfPageCount } from '../../lib/pdf';
import { convertPdfToDocx, extractPdfPageTexts } from '../../lib/pdf-to-docx';
import { PdfToWordWorkspace } from './PdfToWordWorkspace';

vi.mock('../../lib/pdf-to-docx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/pdf-to-docx')>();
  return { ...actual, convertPdfToDocx: vi.fn(), extractPdfPageTexts: vi.fn() };
});
vi.mock('../../lib/pdf', () => ({ getPdfPageCount: vi.fn() }));
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPdfPageCount).mockResolvedValue(2);
});

async function upload(user: ReturnType<typeof userEvent.setup>, name = 'report.pdf') {
  const file = new File(['pdf'], name, { type: 'application/pdf' });
  await user.upload(screen.getByLabelText(/choose a pdf document/i), file);
  await screen.findByText('p. 2');
  return file;
}

describe('PdfToWordWorkspace', () => {
  it('converts a PDF to flowing DOCX and downloads it', async () => {
    vi.mocked(convertPdfToDocx).mockResolvedValue(new Blob(['docx']));
    const user = userEvent.setup();
    render(<PdfToWordWorkspace />);
    const file = await upload(user);

    await user.click(screen.getByRole('button', { name: /create docx/i }));

    expect(convertPdfToDocx).toHaveBeenCalledWith(
      file,
      undefined,
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(await screen.findByText('Create DOCX complete')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download docx/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'report.docx');
  });

  it('writes Markdown with a section per page when that structure is chosen', async () => {
    vi.mocked(extractPdfPageTexts).mockResolvedValue(['first page', 'second page']);
    const user = userEvent.setup();
    render(<PdfToWordWorkspace />);
    await upload(user, 'deck.pdf');

    await user.click(screen.getByRole('radio', { name: /markdown/i }));
    await user.click(screen.getByRole('button', { name: /create docx/i }));

    expect(await screen.findByText('2 pages as Markdown')).toBeInTheDocument();
    expect(screen.getByText(/## Page 1/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download markdown/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'deck.md');
  });

  it('reports real extraction progress and cancels quietly', async () => {
    vi.mocked(convertPdfToDocx).mockImplementation(
      (_file, _open, signal, onProgress) =>
        new Promise((_resolve, reject) => {
          onProgress?.(1, 2);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<PdfToWordWorkspace />);
    await upload(user, 'slow.pdf');
    await user.click(screen.getByRole('button', { name: /create docx/i }));

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '45');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /create docx/i })).toBeEnabled();
  });

  it('uses the singular page label for a one-page document', async () => {
    vi.mocked(getPdfPageCount).mockResolvedValue(1);
    vi.mocked(extractPdfPageTexts).mockResolvedValue(['only page']);
    const user = userEvent.setup();
    render(<PdfToWordWorkspace />);
    await user.upload(
      screen.getByLabelText(/choose a pdf document/i),
      new File(['pdf'], 'one.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByText(/1 page ·/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /markdown/i }));
    await user.click(screen.getByRole('button', { name: /create docx/i }));
    expect(await screen.findByText('1 page as Markdown')).toBeInTheDocument();
  });

  it('explains when the PDF cannot be opened', async () => {
    vi.mocked(getPdfPageCount).mockRejectedValue(new Error('encrypted'));
    const user = userEvent.setup();
    render(<PdfToWordWorkspace />);
    await user.upload(
      screen.getByLabelText(/choose a pdf document/i),
      new File(['pdf'], 'locked.pdf', { type: 'application/pdf' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/encrypted or damaged/i);
  });
});
