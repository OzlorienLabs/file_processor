import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { conversionsFor } from '../../lib/convert-map';
import { downloadBlob } from '../../lib/download';
import { ConvertWorkspace } from './ConvertWorkspace';

vi.mock('../../lib/convert-map', () => ({ conversionsFor: vi.fn() }));
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('ConvertWorkspace', () => {
  it('replaces the catalog options with the formats the file really supports', async () => {
    const run = vi.fn(async () => ({ blob: new Blob(['out']), filename: 'photo.webp' }));
    vi.mocked(conversionsFor).mockReturnValue([
      { id: 'image-png', label: 'PNG image', hint: 'Lossless', run: vi.fn() },
      { id: 'image-webp', label: 'WebP image', hint: 'Modern', run },
    ]);
    const user = userEvent.setup();
    render(<ConvertWorkspace />);

    // Before a file is chosen the panel shows the catalog's placeholder formats.
    expect(screen.getByRole('radio', { name: /png/i })).toBeInTheDocument();

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(/choose a file to convert/i), file);
    expect(await screen.findByRole('radio', { name: /webp image/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^png$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /webp image/i }));
    await user.click(screen.getByRole('button', { name: /convert file/i }));

    expect(run).toHaveBeenCalledWith(file, expect.any(AbortSignal), expect.any(Function), 0.72);
    await user.click(await screen.findByRole('button', { name: /download webp image/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'photo.webp');
  });

  it('reports the real per-part progress from the conversion', async () => {
    vi.mocked(conversionsFor).mockReturnValue([
      {
        id: 'pdf-images',
        label: 'JPG images (ZIP)',
        hint: 'One picture per page',
        run: (_file, signal, onProgress) =>
          new Promise((_resolve, reject) => {
            onProgress?.(3, 4);
            signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was cancelled.', 'AbortError')),
            );
          }),
      },
    ]);
    const user = userEvent.setup();
    render(<ConvertWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to convert/i),
      new File(['x'], 'deck.pdf', { type: 'application/pdf' }),
    );
    await user.click(await screen.findByRole('button', { name: /convert file/i }));

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /convert file/i })).toBeEnabled();
  });

  it('explains when a file has no supported conversion', async () => {
    vi.mocked(conversionsFor).mockReturnValue([]);
    const user = userEvent.setup();
    render(<ConvertWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to convert/i),
      new File(['x'], 'archive.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/no supported conversions/i);
  });

  it('reports conversion failures in plain language', async () => {
    vi.mocked(conversionsFor).mockReturnValue([
      { id: 'audio-wav', label: 'WAV audio', hint: 'Uncompressed', run: vi.fn().mockRejectedValue(new Error('bad codec')) },
    ]);
    const user = userEvent.setup();
    render(<ConvertWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to convert/i),
      new File(['x'], 'clip.mp3', { type: 'audio/mpeg' }),
    );
    await user.click(await screen.findByRole('button', { name: /convert file/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/damaged or use an unsupported codec/i);
  });
});
