import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { compressImage, convertImage } from './raster';

const bitmapClose = vi.fn();
let contextSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 40, height: 20, close: bitmapClose })),
  );
  contextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
  ) {
    callback(new Blob(['pixels'], { type: type ?? 'image/png' }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('browser raster adapter', () => {
  it('converts an image to PNG with an alpha canvas via the default adapter', async () => {
    const blob = await convertImage(new Blob(['img'], { type: 'image/webp' }), 'png');
    expect(blob.type).toBe('image/png');
    expect(contextSpy).toHaveBeenCalledWith('2d', { alpha: true });
    expect(bitmapClose).toHaveBeenCalled();
  });

  it('uses an opaque canvas for JPEG output', async () => {
    const blob = await convertImage(new Blob(['img'], { type: 'image/png' }), 'jpg');
    expect(blob.type).toBe('image/jpeg');
    expect(contextSpy).toHaveBeenCalledWith('2d', { alpha: false });
  });

  it('compresses through the default adapter end to end', async () => {
    const result = await compressImage(new File(['img'], 'photo.png', { type: 'image/png' }), 'balanced');
    expect(result.extension).toBe('webp');
    expect(result.width).toBe(40);
    expect(result.height).toBe(20);
  });

  it('fails clearly without a canvas context', async () => {
    contextSpy.mockReturnValue(null);
    await expect(convertImage(new Blob(['img'], { type: 'image/png' }), 'webp')).rejects.toThrow(
      /cannot create an image canvas/i,
    );
    expect(bitmapClose).toHaveBeenCalled();
  });

  it('fails clearly when encoding returns no blob', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      callback(null);
    });
    await expect(convertImage(new Blob(['img'], { type: 'image/png' }), 'webp')).rejects.toThrow(
      /could not be encoded/i,
    );
  });

  it('stops between decode and encode when cancelled mid-flight', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        controller.abort();
        return { width: 10, height: 10, close: bitmapClose };
      }),
    );
    await expect(
      convertImage(new Blob(['img'], { type: 'image/png' }), 'png', undefined, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(bitmapClose).toHaveBeenCalled();
  });
});
