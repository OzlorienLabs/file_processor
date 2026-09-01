import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { compressPdf } from '../../lib/pdf-compression';
import { compressImage } from '../../lib/raster';
import { CompressionWorkspace } from './CompressionWorkspace';

vi.mock('../../lib/pdf-compression', () => ({ compressPdf: vi.fn() }));
vi.mock('../../lib/raster', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/raster')>();
  return { ...actual, compressImage: vi.fn() };
});

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:compressed'),
    revokeObjectURL: vi.fn(),
  });
});

beforeEach(() => vi.clearAllMocks());

describe('CompressionWorkspace', () => {
  it('compresses an image with the selected strength', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['small'], { type: 'image/webp' }),
      extension: 'webp',
      width: 800,
      height: 600,
    });
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    const image = new File(['a'.repeat(100)], 'holiday.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/choose a file to compress/i), image);
    await user.selectOptions(screen.getByLabelText(/compression strength/i), 'strong');
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    expect(compressImage).toHaveBeenCalledWith(image, 'strong', undefined, expect.any(AbortSignal));
    expect(await screen.findByRole('link', { name: /download compressed file/i })).toHaveAttribute(
      'download',
      'holiday-compressed.webp',
    );
  });

  it('requires acknowledgement before rasterizing a PDF', async () => {
    vi.mocked(compressPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    const pdf = new File(['pdf'], 'slides.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/choose a file to compress/i), pdf);
    const submit = screen.getByRole('button', { name: /compress file/i });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /flatten text and links/i }));
    await user.click(submit);

    expect(compressPdf).toHaveBeenCalledWith(
      pdf,
      'balanced',
      undefined,
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(await screen.findByRole('link', { name: /download compressed file/i })).toHaveAttribute(
      'download',
      'slides-compressed.pdf',
    );
  });

  it('reports savings, admits when nothing shrank, and starts over', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['x'.repeat(500)], { type: 'image/webp' }),
      extension: 'webp',
      width: 10,
      height: 10,
    });
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to compress/i),
      new File(['tiny'], 'tiny.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    expect(await screen.findByText(/already efficiently compressed/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start over/i }));
    expect(screen.getByLabelText(/choose a file to compress/i)).toBeInTheDocument();
  });

  it('detects PDFs by extension, reports progress, and can be cancelled', async () => {
    let sendProgress: (completed: number, total: number) => void = () => {};
    vi.mocked(compressPdf).mockImplementation(
      (_file, _level, _open, signal, onProgress) =>
        new Promise((_resolve, reject) => {
          sendProgress = onProgress!;
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to compress/i),
      new File(['pdf'], 'typed-extension.PDF', { type: '' }),
    );
    await user.click(screen.getByRole('checkbox', { name: /flatten text and links/i }));
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    act(() => sendProgress(1, 4));
    expect(await screen.findByRole('status')).toHaveTextContent('Compressing page 1 of 4');

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /compress file/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces compression failures', async () => {
    vi.mocked(compressImage).mockRejectedValue(new Error('decode exploded'));
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to compress/i),
      new File(['img'], 'broken.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('decode exploded');
  });
});
