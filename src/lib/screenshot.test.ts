import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureFrame,
  copyImageToClipboard,
  dataUrlToBlob,
  screenshotFileName,
  type CaptureCanvasAdapter,
} from './screenshot';

describe('screenshotFileName', () => {
  it('formats dates into clean filenames for png and jpeg', () => {
    const fixed = new Date(2026, 8, 24, 15, 30, 45); // Sept 24, 2026 15:30:45
    expect(screenshotFileName('png', fixed)).toBe('screen-capture-2026-09-24-153045.png');
    expect(screenshotFileName('jpeg', fixed)).toBe('screen-capture-2026-09-24-153045.jpg');
  });
});

describe('dataUrlToBlob', () => {
  it('decodes base64 data URLs to Blobs with correct MIME types', () => {
    const sample = 'data:image/png;base64,aGVsbG8=';
    const blob = dataUrlToBlob(sample);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(5);
  });

  it('defaults to image/png when header lacks mime', () => {
    const sample = 'data:;base64,aGVsbG8=';
    const blob = dataUrlToBlob(sample);
    expect(blob.type).toBe('image/png');
  });
});

describe('captureFrame', () => {
  let mockContext: {
    drawImage: ReturnType<typeof vi.fn>;
  };
  let mockCanvas: {
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toDataURL: ReturnType<typeof vi.fn>;
    toBlob?: ReturnType<typeof vi.fn>;
  };
  let adapter: CaptureCanvasAdapter;
  let fakeVideo: HTMLVideoElement;

  beforeEach(() => {
    mockContext = {
      drawImage: vi.fn(),
    };
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockContext),
      toDataURL: vi.fn(() => 'data:image/png;base64,aGVsbG8='),
      toBlob: vi.fn((cb: (b: Blob | null) => void) => {
        cb(new Blob(['hello'], { type: 'image/png' }));
      }),
    };
    adapter = {
      createCanvas: (w, h) => {
        mockCanvas.width = w;
        mockCanvas.height = h;
        return mockCanvas as unknown as HTMLCanvasElement;
      },
    };
    fakeVideo = {
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement;
  });

  it('captures full frame when no region is provided', async () => {
    const result = await captureFrame(fakeVideo, { format: 'png' }, adapter);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.format).toBe('png');
    expect(mockContext.drawImage).toHaveBeenCalledWith(fakeVideo, 0, 0, 1920, 1080, 0, 0, 1920, 1080);
  });

  it('crops frame according to region', async () => {
    const region = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const result = await captureFrame(fakeVideo, { region, format: 'jpeg', quality: 0.8 }, adapter);
    expect(result.width).toBe(960);
    expect(result.height).toBe(540);
    expect(result.format).toBe('jpeg');
    expect(mockContext.drawImage).toHaveBeenCalledWith(fakeVideo, 480, 270, 960, 540, 0, 0, 960, 540);
  });

  it('falls back to default dimensions if video has no dimensions', async () => {
    const emptyVideo = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
    const result = await captureFrame(emptyVideo, {}, adapter);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });

  it('falls back to dataUrlToBlob when canvas.toBlob is undefined', async () => {
    delete mockCanvas.toBlob;
    const result = await captureFrame(fakeVideo, { format: 'png' }, adapter);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBe(5);
  });

  it('uses default canvas adapter when omitted', async () => {
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement;
      return origCreate(tag);
    });
    const result = await captureFrame(fakeVideo);
    expect(result.width).toBe(1920);
    vi.restoreAllMocks();
  });

  it('throws an error if 2D context cannot be obtained', async () => {
    mockCanvas.getContext.mockReturnValue(null);
    await expect(captureFrame(fakeVideo, {}, adapter)).rejects.toThrow('2D canvas');
  });

  it('rejects if canvas.toBlob yields null', async () => {
    mockCanvas.toBlob = vi.fn((cb) => cb(null));
    await expect(captureFrame(fakeVideo, {}, adapter)).rejects.toThrow('Failed to encode screenshot blob.');
  });
});

describe('copyImageToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when clipboard API is missing', async () => {
    const originalClipboard = navigator.clipboard;
    // @ts-expect-error test override
    delete navigator.clipboard;
    try {
      await expect(copyImageToClipboard(new Blob(['test'], { type: 'image/png' }))).rejects.toThrow('not supported');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    }
  });

  it('writes PNG blob directly to clipboard', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    class MockClipboardItem {
      constructor(public data: Record<string, Blob>) {}
    }
    vi.stubGlobal('ClipboardItem', MockClipboardItem);
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: writeMock },
      configurable: true,
    });

    const pngBlob = new Blob(['png-data'], { type: 'image/png' });
    const success = await copyImageToClipboard(pngBlob);
    expect(success).toBe(true);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it('converts non-PNG blob to PNG before writing to clipboard', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    class MockClipboardItem {
      constructor(public data: Record<string, Blob>) {}
    }
    vi.stubGlobal('ClipboardItem', MockClipboardItem);
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: writeMock },
      configurable: true,
    });

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({ drawImage: vi.fn() })),
          toBlob: vi.fn((cb) => cb(new Blob(['png-from-jpeg'], { type: 'image/png' }))),
        } as unknown as HTMLElement;
      }
      return originalCreateElement(tag);
    });

    const originalImage = window.Image;
    // @ts-expect-error test mock
    window.Image = class {
      naturalWidth = 100;
      naturalHeight = 100;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
      onload?: () => void;
      onerror?: () => void;
    };

    try {
      const jpegBlob = new Blob(['jpeg-data'], { type: 'image/jpeg' });
      const success = await copyImageToClipboard(jpegBlob);
      expect(success).toBe(true);
      expect(writeMock).toHaveBeenCalledTimes(1);
    } finally {
      window.Image = originalImage;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    }
  });
});
