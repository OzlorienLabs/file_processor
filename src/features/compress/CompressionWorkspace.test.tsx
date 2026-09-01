import { render, screen } from '@testing-library/react';
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
});
