import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '../../lib/download';
import { getPdfPageCount } from '../../lib/pdf';
import { compressPdf } from '../../lib/pdf-compression';
import { compressImage } from '../../lib/raster';
import { CompressionWorkspace } from './CompressionWorkspace';

vi.mock('../../lib/pdf-compression', () => ({ compressPdf: vi.fn() }));
vi.mock('../../lib/pdf', () => ({ getPdfPageCount: vi.fn() }));
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));
vi.mock('../../lib/raster', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/raster')>();
  return { ...actual, compressImage: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPdfPageCount).mockResolvedValue(3);
});

describe('CompressionWorkspace', () => {
  it('compresses an image with the chosen preset and reports the real saving', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['sm'], { type: 'image/webp' }),
      extension: 'webp',
      width: 800,
      height: 600,
    });
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    const image = new File(['a'.repeat(100)], 'holiday.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/choose a file to compress/i), image);
    await user.click(await screen.findByRole('radio', { name: /smaller/i }));
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    expect(compressImage).toHaveBeenCalledWith(
      image,
      'strong',
      undefined,
      expect.any(AbortSignal),
      undefined,
    );
    expect(await screen.findByText('Smaller by 98%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download file/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'holiday-compressed.webp');
  });

  it('passes the slider through as the custom preset quality', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['x'], { type: 'image/webp' }),
      extension: 'webp',
      width: 10,
      height: 10,
    });
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to compress/i),
      new File(['a'.repeat(20)], 'a.png', { type: 'image/png' }),
    );
    await user.click(await screen.findByRole('radio', { name: /custom/i }));
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    expect(compressImage).toHaveBeenCalledWith(
      expect.anything(),
      'balanced',
      undefined,
      expect.any(AbortSignal),
      0.72,
    );
  });

  it('requires acknowledgement before rasterizing a PDF and shows its pages', async () => {
    vi.mocked(compressPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to compress/i),
      new File(['a'.repeat(50)], 'report.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByText('p. 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm the note above/i })).toBeDisabled();

    await user.click(screen.getByLabelText(/flatten text and links/i));
    await user.click(screen.getByRole('button', { name: /compress file/i }));
    expect(compressPdf).toHaveBeenCalled();
    expect(await screen.findByText(/smaller by/i)).toBeInTheDocument();
  });

  it('threads the real per-page progress and cancels quietly', async () => {
    vi.mocked(compressPdf).mockImplementation(
      (_file, _level, _open, signal, onProgress) =>
        new Promise((_resolve, reject) => {
          onProgress?.(2, 4);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to compress/i),
      new File(['a'.repeat(50)], 'slides.PDF', { type: '' }),
    );
    await user.click(await screen.findByLabelText(/flatten text and links/i));
    await user.click(screen.getByRole('button', { name: /compress file/i }));

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /compress file/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to the file size when the page count cannot be read', async () => {
    vi.mocked(getPdfPageCount).mockRejectedValue(new Error('encrypted'));
    vi.mocked(compressPdf).mockResolvedValue(new Uint8Array([1]));
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to compress/i),
      new File(['a'.repeat(40)], 'locked.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByText('40 B')).toBeInTheDocument();
    expect(screen.queryByText('p. 1')).not.toBeInTheDocument();
  });

  it('says so when a file did not get smaller', async () => {
    vi.mocked(compressImage).mockResolvedValue({
      blob: new Blob(['a'.repeat(200)], { type: 'image/webp' }),
      extension: 'webp',
      width: 10,
      height: 10,
    });
    const user = userEvent.setup();
    render(<CompressionWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to compress/i),
      new File(['a'.repeat(10)], 'tiny.png', { type: 'image/png' }),
    );
    await user.click(await screen.findByRole('button', { name: /compress file/i }));
    expect(await screen.findByText(/already efficiently compressed/i)).toBeInTheDocument();
  });
});
