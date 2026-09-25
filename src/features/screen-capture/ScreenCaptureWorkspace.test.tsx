import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { createMemoryCaptureStore, type CaptureRecord, type CaptureStore } from '../../lib/capture-history';
import { downloadBlob } from '../../lib/download';
import { CaptureCancelledError, startCapture, type Capture, type CaptureEnvironment } from '../../lib/screen-capture';
import { isCaptureSupported } from '../../lib/screen-recording';
import { captureFrame, copyImageToClipboard } from '../../lib/screenshot';
import { ScreenCaptureWorkspace } from './ScreenCaptureWorkspace';

vi.mock('../../lib/screen-recording', () => ({
  isCaptureSupported: vi.fn(),
}));

vi.mock('../../lib/screen-capture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/screen-capture')>();
  return {
    ...actual,
    startCapture: vi.fn(),
    browserCaptureEnvironment: vi.fn(() => ({})),
  };
});

vi.mock('../../lib/screenshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/screenshot')>();
  return {
    ...actual,
    captureFrame: vi.fn(),
    copyImageToClipboard: vi.fn(),
  };
});

vi.mock('../../lib/download', () => ({
  downloadBlob: vi.fn(),
}));

class FakeTrack extends EventTarget {
  getSettings = () => ({ width: 1920, height: 1080 });
  stop = vi.fn();
}

let track: FakeTrack;
let capture: Capture & { stop: Mock<() => void> };
let store: CaptureStore;
let env: CaptureEnvironment;

const sampleBase64 = Buffer.from('sample-snap-pixel-data').toString('base64');

beforeEach(() => {
  vi.clearAllMocks();
  track = new FakeTrack();
  const display = {
    getVideoTracks: () => [track],
  } as unknown as MediaStream;

  capture = {
    display,
    warnings: [],
    stop: vi.fn<() => void>(),
  };

  store = createMemoryCaptureStore();
  env = {} as CaptureEnvironment;

  vi.mocked(isCaptureSupported).mockReturnValue(true);
  vi.mocked(startCapture).mockImplementation(async () => capture);
  vi.mocked(captureFrame).mockResolvedValue({
    blob: new Blob(['sample-snap'], { type: 'image/png' }),
    dataUrl: `data:image/png;base64,${sampleBase64}`,
    width: 1920,
    height: 1080,
    sizeBytes: 1024,
    format: 'png',
  });
  vi.mocked(copyImageToClipboard).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderCaptureWorkspace() {
  return render(<ScreenCaptureWorkspace env={env} store={store} />);
}

describe('ScreenCaptureWorkspace', () => {
  it('shows browser unsupported message when isCaptureSupported is false', () => {
    vi.mocked(isCaptureSupported).mockReturnValue(false);
    renderCaptureWorkspace();
    expect(screen.getByText(/screen capture is not available here/i)).toBeInTheDocument();
  });

  it('renders idle state and options on initial load', () => {
    renderCaptureWorkspace();
    expect(screen.getByRole('tab', { name: /^capture$/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^history/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('button', { name: /choose what to capture/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /entire screen/i })).toBeInTheDocument();
  });

  it('allows switching between Capture and History tabs', async () => {
    const user = userEvent.setup();
    renderCaptureWorkspace();

    const historyTab = screen.getByRole('tab', { name: /^history/i });
    await user.click(historyTab);
    expect(historyTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText(/search captures/i)).toBeInTheDocument();
    expect(screen.getByText(/no captures saved yet/i)).toBeInTheDocument();

    const captureTab = screen.getByRole('tab', { name: /^capture$/i });
    await user.click(captureTab);
    expect(captureTab).toHaveAttribute('aria-selected', 'true');
  });

  it('starts capture stream when clicking Choose what to capture', async () => {
    const user = userEvent.setup();
    renderCaptureWorkspace();

    const startBtn = screen.getByRole('button', { name: /choose what to capture/i });
    await user.click(startBtn);

    expect(startCapture).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /snap screenshot/i })).toBeInTheDocument();
    });
  });

  it('displays a friendly message if the user cancels display sharing', async () => {
    vi.mocked(startCapture).mockRejectedValueOnce(new CaptureCancelledError());
    const user = userEvent.setup();
    renderCaptureWorkspace();

    await user.click(screen.getByRole('button', { name: /choose what to capture/i }));

    await waitFor(() => {
      expect(screen.getByText(/selection was cancelled/i)).toBeInTheDocument();
    });
  });

  it('supports changing surface, area, format, quality, and delay settings', async () => {
    const user = userEvent.setup();
    renderCaptureWorkspace();

    // Change surface
    await user.click(screen.getByLabelText(/window/i));
    // Change area to Part of it
    await user.click(screen.getByLabelText(/part of it/i));
    // Change format to JPEG
    await user.click(screen.getByLabelText(/jpeg/i));
    expect(screen.getByText(/jpeg quality/i)).toBeInTheDocument();

    // Adjust quality slider
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '80' } });

    // Change delay to 3 seconds
    await user.click(screen.getByLabelText(/3 seconds/i));

    // Start stream
    await user.click(screen.getByRole('button', { name: /choose what to capture/i }));

    await waitFor(() => {
      expect(screen.getByRole('group', { name: /area to capture/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/left/i)).toBeInTheDocument();
    });
  });

  it('takes immediate snapshot, updates history, and allows download and copy', async () => {
    const user = userEvent.setup();
    renderCaptureWorkspace();

    await user.click(screen.getByRole('button', { name: /choose what to capture/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /snap screenshot/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /snap screenshot/i }));

    await waitFor(() => {
      expect(captureFrame).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /download png/i })).toBeInTheDocument();
    });

    // Test download
    await user.click(screen.getByRole('button', { name: /download png/i }));
    expect(downloadBlob).toHaveBeenCalled();

    // Test copy to clipboard
    await user.click(screen.getByRole('button', { name: /copy to clipboard/i }));
    expect(copyImageToClipboard).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/copied to clipboard/i)).toBeInTheDocument();
    });

    // Test delete
    await user.click(screen.getByTitle(/delete capture/i));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /choose what to capture/i })).toBeInTheDocument();
    });
  });

  it('runs countdown timer when delay is set and allows cancellation', async () => {
    renderCaptureWorkspace();

    // Click 3 seconds delay radio
    fireEvent.click(screen.getByLabelText(/3 seconds/i));

    // Start stream
    fireEvent.click(screen.getByRole('button', { name: /choose what to capture/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /snap screenshot/i })).toBeInTheDocument();
    });

    // Set fake timers before clicking snap
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole('button', { name: /snap screenshot/i }));
    expect(screen.getByRole('button', { name: /cancel countdown/i })).toBeInTheDocument();

    // Cancel countdown
    fireEvent.click(screen.getByRole('button', { name: /cancel countdown/i }));
    expect(screen.getByRole('button', { name: /snap screenshot/i })).toBeInTheDocument();

    // Trigger countdown again and advance timers to finish
    fireEvent.click(screen.getByRole('button', { name: /snap screenshot/i }));
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    vi.useRealTimers();

    await waitFor(() => {
      expect(captureFrame).toHaveBeenCalled();
    });
  });

  it('handles stream track ended event', async () => {
    const user = userEvent.setup();
    renderCaptureWorkspace();

    await user.click(screen.getByRole('button', { name: /choose what to capture/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /snap screenshot/i })).toBeInTheDocument();
    });

    // Fire track ended event (e.g. from browser bar stop button)
    act(() => {
      track.dispatchEvent(new Event('ended'));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /choose what to capture/i })).toBeInTheDocument();
    });
  });

  it('selects items from history, filters search, exports and imports JSON, and clears all', async () => {
    const existing: CaptureRecord = {
      id: 'existing-1',
      name: 'test-capture-1.png',
      format: 'png',
      width: 1280,
      height: 720,
      sizeBytes: 2048,
      dataUrl: `data:image/png;base64,${sampleBase64}`,
      createdAt: 1000,
      updatedAt: 1000,
    };
    await store.save(existing);

    const user = userEvent.setup();
    renderCaptureWorkspace();

    // Switch to history tab
    await user.click(screen.getByRole('tab', { name: /history/i }));

    // Verify item in list
    expect(screen.getByRole('button', { name: /test-capture-1\.png/i })).toBeInTheDocument();

    // Click item to view
    await user.click(screen.getByRole('button', { name: /test-capture-1\.png/i }));
    expect(screen.getByRole('heading', { level: 2, name: 'test-capture-1.png' })).toBeInTheDocument();

    // Switch back to history tab
    await user.click(screen.getByRole('tab', { name: /history/i }));

    // Filter with search
    const searchInput = screen.getByPlaceholderText(/search captures/i);
    await user.type(searchInput, 'nonexistent');
    expect(screen.queryByRole('button', { name: /test-capture-1\.png/i })).not.toBeInTheDocument();

    await user.clear(searchInput);
    expect(screen.getByRole('button', { name: /test-capture-1\.png/i })).toBeInTheDocument();

    // Export history
    await user.click(screen.getByTitle(/export history/i));
    expect(downloadBlob).toHaveBeenCalled();

    // Clear history with confirmation
    const clearBtn = screen.getByRole('button', { name: /clear history/i });
    await user.click(clearBtn);
    expect(screen.getByRole('button', { name: /confirm clear all/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm clear all/i }));
    await waitFor(() => {
      expect(screen.getByText(/no captures saved yet/i)).toBeInTheDocument();
    });
  });

  it("handles copy failure and delete active capture", async () => {
    const existing: CaptureRecord = {
      id: "del-1",
      name: "to-delete.png",
      format: "png",
      width: 100,
      height: 100,
      sizeBytes: 50,
      dataUrl: "data:image/png;base64,aaa",
      createdAt: 500,
      updatedAt: 500,
    };
    await store.save(existing);
    const user = userEvent.setup();
    renderCaptureWorkspace();

    await user.click(screen.getByRole("tab", { name: /history/i }));
    await user.click(screen.getByRole("button", { name: /to-delete\.png/i }));

    // Mock copy failure
    vi.mocked(copyImageToClipboard).mockRejectedValueOnce(new Error("Clipboard blocked"));
    await user.click(screen.getByRole("button", { name: /copy to clipboard/i }));
    expect(await screen.findByText(/clipboard blocked/i)).toBeInTheDocument();

    // Delete capture
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(screen.getByRole("button", { name: /choose what to capture/i })).toBeInTheDocument();
  });

  it("handles generic start capture error", async () => {
    vi.mocked(startCapture).mockRejectedValueOnce(new Error("Permission denied by system"));
    const user = userEvent.setup();
    renderCaptureWorkspace();

    await user.click(screen.getByRole("button", { name: /choose what to capture/i }));
    expect(await screen.findByText(/permission denied by system/i)).toBeInTheDocument();
  });

  it("adjusts jpeg quality slider and switches formats", async () => {
    const user = userEvent.setup();
    renderCaptureWorkspace();

    await user.click(screen.getByRole("radio", { name: /jpeg/i }));
    expect(screen.getByText(/jpeg quality/i)).toBeInTheDocument();

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "75" } });
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});
