import { describe, expect, it, vi } from 'vitest';

import {
  compressImage,
  getCompressionSettings,
  type RasterAdapter,
} from './raster';

function imageFile(name: string, type: string) {
  return new File(['image'], name, { type });
}

describe('raster compression', () => {
  it('maps levels to progressively smaller settings', () => {
    expect(getCompressionSettings('light')).toEqual({ quality: 0.88, maxDimension: 3200, pdfScale: 1.6 });
    expect(getCompressionSettings('balanced')).toEqual({ quality: 0.72, maxDimension: 2400, pdfScale: 1.3 });
    expect(getCompressionSettings('strong')).toEqual({ quality: 0.52, maxDimension: 1600, pdfScale: 1 });
  });

  it('preserves aspect ratio and chooses a transparency-safe output', async () => {
    const close = vi.fn();
    const adapter: RasterAdapter = {
      decode: vi.fn().mockResolvedValue({ source: {}, width: 4000, height: 2000, close }),
      encode: vi.fn().mockResolvedValue(new Blob(['small'], { type: 'image/webp' })),
    };

    const result = await compressImage(imageFile('poster.png', 'image/png'), 'strong', adapter);

    expect(adapter.encode).toHaveBeenCalledWith({}, 1600, 800, 'image/webp', 0.52);
    expect(result.extension).toBe('webp');
    expect(result.blob.type).toBe('image/webp');
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps JPEG output and never enlarges small images', async () => {
    const adapter: RasterAdapter = {
      decode: vi.fn().mockResolvedValue({ source: {}, width: 640, height: 480, close: vi.fn() }),
      encode: vi.fn().mockResolvedValue(new Blob(['same'], { type: 'image/jpeg' })),
    };

    const result = await compressImage(imageFile('photo.jpg', 'image/jpeg'), 'light', adapter);

    expect(adapter.encode).toHaveBeenCalledWith({}, 640, 480, 'image/jpeg', 0.88);
    expect(result.extension).toBe('jpg');
  });

  it('stops before decoding when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter: RasterAdapter = { decode: vi.fn(), encode: vi.fn() };

    await expect(
      compressImage(imageFile('photo.jpg', 'image/jpeg'), 'balanced', adapter, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(adapter.decode).not.toHaveBeenCalled();
  });
});
