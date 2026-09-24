import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { downloadBlob } from '../../lib/download';
import { clearHandedOffVideo, peekHandedOffVideo } from '../../lib/media-handoff';
import { createRecordingSession, type RecordingResult, type RecordingSession } from '../../lib/recording-session';
import { CaptureCancelledError, composeRecordingStream, startCapture, type Capture } from '../../lib/screen-capture';
import { isCaptureSupported, pickMimeType, supportedFormats } from '../../lib/screen-recording';
import { ScreenRecorderWorkspace } from './ScreenRecorderWorkspace';

vi.mock('../../lib/screen-capture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/screen-capture')>();
  return { ...actual, startCapture: vi.fn(), composeRecordingStream: vi.fn(), browserCaptureEnvironment: vi.fn(() => ({})) };
});
vi.mock('../../lib/recording-session', () => ({
  createRecordingSession: vi.fn(),
  browserSessionEnvironment: vi.fn(() => ({})),
}));
vi.mock('../../lib/screen-recording', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/screen-recording')>();
  return { ...actual, isCaptureSupported: vi.fn(), supportedFormats: vi.fn(), pickMimeType: vi.fn() };
});
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

class FakeTrack extends EventTarget {
  getSettings = () => ({ width: 1280, height: 720 });
}

let track: FakeTrack;
let capture: Capture & { stop: Mock<() => void> };
let session: RecordingSession & Record<'start' | 'pause' | 'resume', Mock<() => void>> & { stop: Mock<() => Promise<RecordingResult>> };
let dispose: Mock<() => void>;

beforeAll(() => {
  // Keep URL a constructor (the router needs it); only the object-URL statics are faked.
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:recording'), revokeObjectURL: vi.fn() });
});

beforeEach(() => {
  vi.clearAllMocks();
  clearHandedOffVideo();
  track = new FakeTrack();
  const display = { getVideoTracks: () => [track] } as unknown as MediaStream;
  capture = { display, warnings: [], stop: vi.fn<() => void>() };
  dispose = vi.fn<() => void>();
  session = {
    start: vi.fn<() => void>(),
    pause: vi.fn<() => void>(),
    resume: vi.fn<() => void>(),
    stop: vi.fn(async (): Promise<RecordingResult> => ({ blob: new Blob(['video-bytes'], { type: 'video/webm' }), mimeType: 'video/webm;codecs=vp9', durationMs: 65_000 })),
    state: () => 'recording',
    elapsed: () => 3_000,
    bytes: () => 2_048,
  };
  vi.mocked(isCaptureSupported).mockReturnValue(true);
  vi.mocked(supportedFormats).mockReturnValue(['webm', 'mp4']);
  vi.mocked(pickMimeType).mockImplementation((format) => (format === 'mp4' ? 'video/mp4' : 'video/webm;codecs=vp9'));
  vi.mocked(startCapture).mockImplementation(async () => capture);
  vi.mocked(composeRecordingStream).mockReturnValue({ stream: { id: 'composed' } as unknown as MediaStream, cropMode: 'frames', dispose });
  vi.mocked(createRecordingSession).mockReturnValue(session);
});

afterEach(() => vi.useRealTimers());

function renderRecorder() {
  return render(
    <MemoryRouter initialEntries={['/en/screen-recorder']}>
      <Routes>
        <Route path="/en/screen-recorder" element={<ScreenRecorderWorkspace />} />
        <Route path="/en/video-to-gif" element={<p>GIF tool</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const heading = () => screen.getByRole('heading', { level: 2 });
const choose = () => screen.getByRole('button', { name: /choose what to record/i });

describe('ScreenRecorderWorkspace', () => {
  it('explains when this browser cannot record', () => {
    vi.mocked(isCaptureSupported).mockReturnValue(false);
    renderRecorder();
    expect(screen.getByText(/screen recording is not available here/i)).toBeInTheDocument();
    expect(choose()).toBeDisabled();
  });

  it('also stays disabled when no container format is recordable', () => {
    vi.mocked(supportedFormats).mockReturnValue([]);
    renderRecorder();
    expect(choose()).toBeDisabled();
    expect(screen.getByLabelText(/file format/i)).toBeDisabled();
  });

  it('records the whole share straight away, with pause, and hands the video to the GIF tool', async () => {
    const user = userEvent.setup();
    renderRecorder();
    expect(heading()).toHaveTextContent(/ready to record/i);
    expect(screen.getByText(/recording starts as soon as you share/i)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /browser tab/i }));
    await user.selectOptions(screen.getByLabelText(/frame rate/i), '60');
    await user.selectOptions(screen.getByLabelText(/video quality/i), 'max');
    await user.selectOptions(screen.getByLabelText(/file format/i), 'mp4');
    await user.click(screen.getByLabelText(/tab or system sound/i));
    await user.click(screen.getByLabelText(/microphone voice-over/i));
    await user.click(screen.getByLabelText(/show the mouse pointer/i));
    await user.click(screen.getByLabelText(/3-second countdown/i));
    await user.click(choose());

    expect(startCapture).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'browser', fps: 60, quality: 'max', format: 'mp4', systemAudio: true, microphone: true, cursor: false, countdown: false }),
      {},
    );
    expect(composeRecordingStream).toHaveBeenCalledWith(capture, undefined, 60, {});
    expect(createRecordingSession).toHaveBeenCalledWith({ id: 'composed' }, { mimeType: 'video/mp4', videoBitsPerSecond: 12_000_000 }, {});
    expect(session.start).toHaveBeenCalled();
    expect(heading()).toHaveTextContent(/^recording$/i);
    expect(screen.getByRole('radio', { name: /window/i })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('timer', { name: /recording time/i })).toHaveTextContent('0:03 · 2 KB'));
    expect((screen.getByLabelText(/live recording preview/i) as HTMLVideoElement).srcObject).toEqual({ id: 'composed' });

    await user.click(screen.getByRole('button', { name: /pause/i }));
    expect(session.pause).toHaveBeenCalled();
    expect(heading()).toHaveTextContent(/paused/i);
    await user.click(screen.getByRole('button', { name: /resume/i }));
    expect(session.resume).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /stop recording/i }));
    expect(await screen.findByLabelText(/finished recording/i)).toHaveAttribute('src', 'blob:recording');
    expect(heading()).toHaveTextContent(/recording finished/i);
    expect(capture.stop).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/1:05 · 11 B · screen-recording-.*\.webm/);

    await user.click(screen.getByRole('button', { name: /download webm/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(File), expect.stringMatching(/\.webm$/));

    await user.click(screen.getByRole('button', { name: /make a gif/i }));
    expect(await screen.findByText('GIF tool')).toBeInTheDocument();
    expect(peekHandedOffVideo()?.name).toMatch(/^screen-recording-.*\.webm$/);
  });

  it('lets the person pick an area, counts down, and shows capture notes', async () => {
    capture.warnings = ['No tab or system audio was shared.'];
    vi.mocked(composeRecordingStream).mockReturnValue({ stream: {} as MediaStream, cropMode: 'canvas', dispose });
    renderRecorder();
    fireEvent.click(screen.getByRole('radio', { name: /part of it/i }));
    expect(screen.getByText(/drag over the picture/i)).toBeInTheDocument();
    fireEvent.click(choose());
    expect(await screen.findByRole('group', { name: /area to record/i })).toBeInTheDocument();
    expect(heading()).toHaveTextContent(/drag over the picture/i);
    expect(screen.getByText('No tab or system audio was shared.')).toBeInTheDocument();
    expect(screen.getByTestId('region-box')).toHaveTextContent('896 × 502');
    expect(screen.getByLabelText('Width')).toHaveValue(896);

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }));
    expect(heading()).toHaveTextContent(/get ready/i);
    expect(screen.getByText('3')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('2')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(session.start).toHaveBeenCalled();
    expect(composeRecordingStream).toHaveBeenCalledWith(capture, { x: 0.15, y: 0.15, width: 0.7, height: 0.7 }, 30, {});
    expect(screen.getByText(/crops the area by redrawing it/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(screen.getByText(/crops the area by redrawing it/i)).toBeInTheDocument();
  });

  it('cancels a countdown and stops sharing from the area step', async () => {
    renderRecorder();
    fireEvent.click(screen.getByRole('radio', { name: /part of it/i }));
    fireEvent.click(choose());
    await screen.findByRole('group', { name: /area to record/i });
    fireEvent.click(screen.getByRole('button', { name: /stop sharing/i }));
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(heading()).toHaveTextContent(/ready to record/i);

    fireEvent.click(choose());
    await screen.findByRole('group', { name: /area to record/i });
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(capture.stop).toHaveBeenCalledTimes(2);
    expect(session.start).not.toHaveBeenCalled();
    expect(heading()).toHaveTextContent(/ready to record/i);
  });

  it('follows the browser’s own “Stop sharing” button', async () => {
    renderRecorder();
    fireEvent.click(screen.getByRole('radio', { name: /part of it/i }));
    fireEvent.click(choose());
    await screen.findByRole('group', { name: /area to record/i });
    act(() => void track.dispatchEvent(new Event('ended')));
    expect(heading()).toHaveTextContent(/ready to record/i);

    fireEvent.click(screen.getByLabelText(/3-second countdown/i));
    fireEvent.click(screen.getByRole('radio', { name: /all of it/i }));
    fireEvent.click(choose());
    await waitFor(() => expect(session.start).toHaveBeenCalled());
    act(() => void track.dispatchEvent(new Event('ended')));
    expect(await screen.findByLabelText(/finished recording/i)).toBeInTheDocument();
    expect(session.stop).toHaveBeenCalled();
  });

  it('reports cancelled pickers, failures, and empty or broken recordings', async () => {
    const user = userEvent.setup();
    renderRecorder();
    await user.click(screen.getByLabelText(/3-second countdown/i));

    vi.mocked(startCapture).mockRejectedValueOnce(new CaptureCancelledError());
    await user.click(choose());
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was shared/i);

    vi.mocked(startCapture).mockRejectedValueOnce(new Error('This browser could not start screen sharing.'));
    await user.click(choose());
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not start screen sharing/i);

    vi.mocked(pickMimeType).mockReturnValue(undefined);
    await user.click(choose());
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot record video/i);
    expect(capture.stop).toHaveBeenCalled();
    vi.mocked(pickMimeType).mockReturnValue('video/webm');

    session.stop.mockResolvedValueOnce({ blob: new Blob([], { type: 'video/webm' }), mimeType: 'video/webm', durationMs: 0 });
    await user.click(choose());
    await user.click(screen.getByRole('button', { name: /stop recording/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/came out empty/i);

    session.stop.mockRejectedValueOnce('boom');
    await user.click(choose());
    await user.click(screen.getByRole('button', { name: /stop recording/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be finished/i);
    expect(heading()).toHaveTextContent(/ready to record/i);
  });

  it('records again after a finished take, as MP4 when that is what came out', async () => {
    const user = userEvent.setup();
    session.stop.mockResolvedValue({ blob: new Blob(['mp4'], { type: 'video/mp4' }), mimeType: 'video/mp4', durationMs: 1000 });
    renderRecorder();
    await user.click(screen.getByLabelText(/3-second countdown/i));
    await user.click(choose());
    await user.click(screen.getByRole('button', { name: /stop recording/i }));
    expect(await screen.findByRole('button', { name: /download mp4/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /record again/i }));
    expect(heading()).toHaveTextContent(/ready to record/i);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording');
  });

  it('stops everything when the page is left mid-recording', async () => {
    session.stop.mockRejectedValue(new Error('already gone'));
    const view = renderRecorder();
    fireEvent.click(screen.getByLabelText(/3-second countdown/i));
    fireEvent.click(choose());
    await waitFor(() => expect(session.start).toHaveBeenCalled());
    view.unmount();
    expect(session.stop).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
    expect(capture.stop).toHaveBeenCalled();
  });
});
