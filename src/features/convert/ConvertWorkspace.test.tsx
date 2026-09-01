import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { conversionsFor } from '../../lib/convert-map';
import { ConvertWorkspace } from './ConvertWorkspace';

vi.mock('../../lib/convert-map', () => ({ conversionsFor: vi.fn() }));

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:converted'),
    revokeObjectURL: vi.fn(),
  });
});

beforeEach(() => vi.clearAllMocks());

describe('ConvertWorkspace', () => {
  it('lists the detected formats and downloads the chosen conversion', async () => {
    const run = vi.fn(async () => ({ blob: new Blob(['out']), filename: 'photo.webp' }));
    vi.mocked(conversionsFor).mockReturnValue([
      { id: 'image-png', label: 'PNG image', hint: 'Lossless', run: vi.fn() },
      { id: 'image-webp', label: 'WebP image', hint: 'Modern', run },
    ]);
    const user = userEvent.setup();
    render(<ConvertWorkspace />);

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(/choose a file to convert/i), file);
    await user.click(screen.getByRole('radio', { name: /webp image/i }));
    await user.click(screen.getByRole('button', { name: /convert file/i }));

    expect(run).toHaveBeenCalledWith(file, expect.any(AbortSignal), expect.any(Function));
    expect(await screen.findByRole('link', { name: /download converted file/i })).toHaveAttribute(
      'download',
      'photo.webp',
    );
  });

  it('explains when a file has no supported conversions', async () => {
    vi.mocked(conversionsFor).mockReturnValue([]);
    const user = userEvent.setup();
    render(<ConvertWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to convert/i),
      new File(['x'], 'archive.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/no supported conversions/i);
    expect(screen.queryByRole('button', { name: /convert file/i })).not.toBeInTheDocument();
  });

  it('starts over after a conversion and cancels quietly', async () => {
    const run = vi.fn(async () => ({ blob: new Blob(['out']), filename: 'photo.png' }));
    vi.mocked(conversionsFor).mockReturnValue([
      { id: 'image-png', label: 'PNG image', hint: 'Lossless', run },
    ]);
    const user = userEvent.setup();
    render(<ConvertWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to convert/i),
      new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    );
    await user.click(screen.getByRole('button', { name: /convert file/i }));
    await user.click(await screen.findByRole('button', { name: /start over/i }));
    expect(screen.getByLabelText(/choose a file to convert/i)).toBeInTheDocument();

    run.mockImplementationOnce(
      (_file: File, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }) as Promise<{ blob: Blob; filename: string }>,
    );
    await user.upload(
      screen.getByLabelText(/choose a file to convert/i),
      new File(['x'], 'slow.jpg', { type: 'image/jpeg' }),
    );
    await user.click(screen.getByRole('button', { name: /convert file/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(await screen.findByRole('button', { name: /convert file/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces conversion failures as actionable errors', async () => {
    vi.mocked(conversionsFor).mockReturnValue([
      { id: 'audio-wav', label: 'WAV audio', hint: 'Uncompressed', run: vi.fn(async () => { throw new Error('decode failed'); }) },
    ]);
    const user = userEvent.setup();
    render(<ConvertWorkspace />);

    await user.upload(
      screen.getByLabelText(/choose a file to convert/i),
      new File(['x'], 'memo.mp3', { type: 'audio/mpeg' }),
    );
    await user.click(screen.getByRole('button', { name: /convert file/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be converted/i);
  });
});
