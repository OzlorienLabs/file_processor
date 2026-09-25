import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  blobToCaptureData,
  captureFrame,
  copyImageToClipboard,
  dataUrlToBlob,
  getImageBlobFromPasteEvent,
  readImageFromClipboard,
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

describe('readImageFromClipboard', () => {
  it('throws when navigator.clipboard.read is missing', async () => {
    const originalClipboard = navigator.clipboard;
    // @ts-expect-error test override
    delete navigator.clipboard;
    try {
      await expect(readImageFromClipboard()).rejects.toThrow('not supported');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    }
  });

  it('reads image blob from clipboard items', async () => {
    const testBlob = new Blob(['clip-img'], { type: 'image/png' });
    const mockItem = {
      types: ['text/plain', 'image/png'],
      getType: vi.fn().mockResolvedValue(testBlob),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: { read: vi.fn().mockResolvedValue([mockItem]) },
      configurable: true,
    });

    const result = await readImageFromClipboard();
    expect(result).toBe(testBlob);
    expect(mockItem.getType).toHaveBeenCalledWith('image/png');
  });

  it('throws when no image type is in clipboard', async () => {
    const mockItem = {
      types: ['text/plain'],
      getType: vi.fn(),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: { read: vi.fn().mockResolvedValue([mockItem]) },
      configurable: true,
    });

    await expect(readImageFromClipboard()).rejects.toThrow('No image found');
  });
});

describe('blobToCaptureData', () => {
  it('extracts dimensions, dataUrl, and format from blob', async () => {
    const originalImage = window.Image;
    // @ts-expect-error test mock
    window.Image = class {
      naturalWidth = 640;
      naturalHeight = 480;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
      onload?: () => void;
      onerror?: () => void;
    };

    try {
      const blob = new Blob(['test-data'], { type: 'image/png' });
      const data = await blobToCaptureData(blob);
      expect(data.width).toBe(640);
      expect(data.height).toBe(480);
      expect(data.format).toBe('png');
      expect(data.sizeBytes).toBe(9);
      expect(data.dataUrl).toContain('data:image/png;base64,');
    } finally {
      window.Image = originalImage;
    }
  });
});

describe('getImageBlobFromPasteEvent', () => {
  it('extracts image blob from clipboard data items', () => {
    const file = new File(['img'], 'test.png', { type: 'image/png' });
    const fakeEvent = {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    } as unknown as ClipboardEvent;

    expect(getImageBlobFromPasteEvent(fakeEvent)).toBe(file);
  });

  it('returns null if no image in clipboard items', () => {
    const fakeEvent = {
      clipboardData: {
        items: [
          {
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
      },
    } as unknown as ClipboardEvent;

    expect(getImageBlobFromPasteEvent(fakeEvent)).toBeNull();
  });
});
