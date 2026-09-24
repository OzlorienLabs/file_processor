import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { downloadBlob } from '../../lib/download';
import { clearHandedOffVideo, handOffVideo, peekHandedOffVideo } from '../../lib/media-handoff';
import { createVideoGrabber, probeVideo, type FrameGrabber } from '../../lib/video-frames';
import { encodeGif, type EncodeGifOptions } from '../../lib/video-to-gif';
import { VideoToGifWorkspace } from './VideoToGifWorkspace';

vi.mock('../../lib/video-frames', () => ({ probeVideo: vi.fn(), createVideoGrabber: vi.fn() }));
vi.mock('../../lib/video-to-gif', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/video-to-gif')>();
  return { ...actual, encodeGif: vi.fn() };
});
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

let grabber: FrameGrabber & { release: Mock<() => void> };
let urls = 0;

beforeAll(() => {
  Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${++urls}`), revokeObjectURL: vi.fn() });
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  clearHandedOffVideo();
  grabber = { width: 800, height: 450, grab: vi.fn(), release: vi.fn<() => void>() };
  vi.mocked(probeVideo).mockResolvedValue({ width: 1920, height: 1080, duration: 10 });
  vi.mocked(createVideoGrabber).mockResolvedValue(grabber);
  vi.mocked(encodeGif).mockImplementation(async ({ plan, onProgress }: EncodeGifOptions) => {
    onProgress?.(plan.times.length, plan.times.length);
    return { blob: new Blob(['GIF89a'], { type: 'image/gif' }), width: 800, height: 450, frames: 42, duration: 10 };
  });
});

const clip = (name = 'clip.mp4', type = 'video/mp4') => new File(['video'], name, { type });

function renderTool() {
  return render(
    <MemoryRouter>
      <VideoToGifWorkspace />
    </MemoryRouter>,
  );
}

async function load(user = userEvent.setup()) {
  renderTool();
  await user.upload(screen.getByLabelText(/choose a video/i), clip());
  await screen.findByLabelText('Video: clip.mp4');
  return user;
}

const estimate = () => screen.getByText(/frames? ·/, { selector: '.gif-estimate' });

describe('VideoToGifWorkspace', () => {
  it('starts empty with a way to record first', () => {
    renderTool();
    expect(screen.getByText(/drop a video, or click to choose/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /record your screen first/i })).toHaveAttribute('href', '/en/screen-recorder');
    expect(screen.getByRole('button', { name: /choose a video first/i })).toBeDisabled();
    expect(screen.getByLabelText('GIF width')).toBeDisabled();
  });

  it('loads a video and creates a GIF with the chosen settings', async () => {
    const user = await load();
    expect(probeVideo).toHaveBeenCalledWith('blob:' + urls);
    expect(screen.getByText(/1920 × 1080 · 0:10.0 · 5 B/)).toBeInTheDocument();
    expect(screen.getByLabelText('GIF width')).toHaveValue('800');
    expect(estimate()).toHaveTextContent('150 frames · 800 × 450 px · plays 0:10.0');

    await user.selectOptions(screen.getByLabelText('GIF width'), '640');
    await user.selectOptions(screen.getByLabelText('Frame rate'), '10');
    await user.selectOptions(screen.getByLabelText('Speed'), '2');
    await user.selectOptions(screen.getByLabelText('Colours'), '64');
    await user.click(screen.getByLabelText(/dithering/i));
    await user.click(screen.getByLabelText(/loop forever/i));
    expect(estimate()).toHaveTextContent('50 frames · 640 × 360 px · plays 0:05.0');

    await user.click(screen.getByRole('button', { name: /create gif/i }));
    expect(createVideoGrabber).toHaveBeenCalledWith(expect.stringMatching(/^blob:/), { x: 0, y: 0, width: 1920, height: 1080 }, 640, 360);
    expect(encodeGif).toHaveBeenCalledWith(
      expect.objectContaining({ grabber, settings: { colors: 64, dither: true, loop: false }, signal: expect.any(AbortSignal) }),
    );
    expect(vi.mocked(encodeGif).mock.lastCall![0].plan.times).toHaveLength(50);

    const result = await screen.findByRole('region', { name: /your gif/i });
    expect(screen.getByRole('img', { name: /gif made from clip.mp4/i })).toHaveAttribute('src', expect.stringMatching(/^blob:/));
    expect(result).toHaveTextContent('800 × 450 · 42 frames · 0:10.0 · 6 B');
    expect(grabber.release).toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /download gif/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'clip.gif');
  });

  it('shows progress and cancels a GIF in the making', async () => {
    let release: () => void = () => undefined;
    vi.mocked(encodeGif).mockImplementation(({ onProgress, signal }: EncodeGifOptions) => {
      onProgress?.(30, 150);
      return new Promise((_, reject) => {
        release = () => reject(new DOMException('cancelled', 'AbortError'));
        signal?.addEventListener('abort', () => release());
      });
    });
    const user = await load();
    await user.click(screen.getByRole('button', { name: /create gif/i }));
    expect(await screen.findByRole('progressbar', { name: /gif progress/i })).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByText('Frame 30 of 150')).toBeInTheDocument();
    expect(screen.getByLabelText('Frame rate')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(await screen.findByRole('button', { name: /create gif/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(grabber.release).toHaveBeenCalled();
  });

  it('reports a GIF that could not be made', async () => {
    vi.mocked(encodeGif).mockRejectedValueOnce(new Error('The video stopped responding while frames were read.'));
    const user = await load();
    await user.click(screen.getByRole('button', { name: /create gif/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/stopped responding/);

    vi.mocked(createVideoGrabber).mockRejectedValueOnce('nope');
    await user.click(screen.getByRole('button', { name: /create gif/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be created/);

    // A still clip collapses into a single frame.
    vi.mocked(encodeGif).mockResolvedValueOnce({ blob: new Blob(['G']), width: 10, height: 10, frames: 1, duration: 2 });
    await user.click(screen.getByRole('button', { name: /create gif/i }));
    expect(await screen.findByRole('region', { name: /your gif/i })).toHaveTextContent('10 × 10 · 1 frame · 0:02.0');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('trims with the sliders and the playhead', async () => {
    await load();
    const player = screen.getByLabelText('Video: clip.mp4') as HTMLVideoElement;
    expect(player).toHaveAttribute('controls');
    const start = screen.getByLabelText('Start');
    const end = screen.getByLabelText('End');

    fireEvent.change(start, { target: { value: '2' } });
    expect(player.currentTime).toBe(2);
    fireEvent.change(end, { target: { value: '1' } });
    expect(end).toHaveValue('2.1');
    expect(estimate()).toHaveTextContent('2 frames');

    player.currentTime = 6;
    fireEvent.click(screen.getByRole('button', { name: /end at playhead/i }));
    player.currentTime = 9;
    fireEvent.click(screen.getByRole('button', { name: /start at playhead/i }));
    expect(start).toHaveValue('5.9');
    expect(screen.getByText(/Clip: 0:05.9 – 0:06.0 \(0:00.1\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Frame rate'), { target: { value: '5' } });
    expect(estimate()).toHaveTextContent(/^1 frame ·/);
  });

  it('crops to an area and offers widths that fit it', async () => {
    const user = await load();
    await user.click(screen.getByLabelText(/crop to an area/i));
    expect(screen.getByRole('group', { name: /area to keep/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Video: clip.mp4')).not.toHaveAttribute('controls');
    expect(screen.getByText(/turn crop off to use the player controls/i)).toBeInTheDocument();
    expect(screen.getByLabelText('GIF width')).toHaveValue('800');
    expect(Array.from((screen.getByLabelText('GIF width') as HTMLSelectElement).options).map((option) => option.value)[0]).toBe('1536');

    await user.selectOptions(screen.getByLabelText('GIF width'), '1536');
    const width = screen.getByLabelText('Width');
    await user.clear(width);
    await user.type(width, '600{Enter}');
    expect(screen.getByLabelText('GIF width')).toHaveValue('600');

    await user.click(screen.getByRole('button', { name: /create gif/i }));
    expect(createVideoGrabber).toHaveBeenLastCalledWith(expect.any(String), { x: 192, y: 108, width: 600, height: 864 }, 600, 864);

    await user.click(screen.getByLabelText(/crop to an area/i));
    await user.click(screen.getByLabelText(/crop to an area/i));
    expect(screen.getByLabelText('Width')).toHaveValue(600);
  });

  it('blocks clips that would be too many frames', async () => {
    vi.mocked(probeVideo).mockResolvedValue({ width: 320, height: 240, duration: 100 });
    await load();
    expect(estimate()).toHaveTextContent(/1201 frames .* over the 1200-frame limit/);
    expect(estimate()).toHaveClass('is-over');
    expect(screen.getByRole('button', { name: /create gif/i })).toBeDisabled();
    expect(screen.getByLabelText('GIF width')).toHaveValue('320');
  });

  it('rejects files it cannot use', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderTool();
    await user.upload(screen.getByLabelText(/choose a video/i), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('notes.txt is not a supported file.');

    vi.mocked(probeVideo).mockRejectedValueOnce(new Error('This browser cannot play that video.'));
    await user.upload(screen.getByLabelText(/choose a video/i), clip('broken.mov', 'video/quicktime'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot play that video/);
    expect(URL.revokeObjectURL).toHaveBeenCalled();

    vi.mocked(probeVideo).mockRejectedValueOnce(undefined);
    await user.upload(screen.getByLabelText(/choose a video/i), clip());
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be opened/);
    fireEvent.change(screen.getByLabelText(/choose a video/i), { target: { files: [] } });
  });

  it('accepts a dropped video and can remove it again', async () => {
    renderTool();
    const zone = screen.getByTestId('dropzone');
    fireEvent.dragEnter(zone);
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragOver(zone);
    // Moving over the zone's own label is not leaving it.
    const inside = createEvent.dragLeave(zone);
    Object.defineProperty(inside, 'relatedTarget', { value: zone.firstChild });
    fireEvent(zone, inside);
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragLeave(zone, { relatedTarget: document.body });
    expect(zone).toHaveAttribute('data-dragging', 'false');
    fireEvent.drop(zone, { dataTransfer: { files: [clip('drop.webm', 'video/webm')] } });
    expect(await screen.findByLabelText('Video: drop.webm')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove video/i }));
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [] } });
    expect(probeVideo).toHaveBeenCalledTimes(1);
  });

  it('opens a recording handed over from the screen recorder', async () => {
    handOffVideo(clip('screen-recording.webm', 'video/webm'));
    const view = renderTool();
    expect(await screen.findByLabelText('Video: screen-recording.webm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove video/i }));
    expect(peekHandedOffVideo()).toBeUndefined();
    view.unmount();
  });

  it('skips the hand-off when the page is gone before it opens', async () => {
    handOffVideo(clip('late.webm', 'video/webm'));
    const view = renderTool();
    view.unmount();
    await act(async () => undefined);
    expect(probeVideo).not.toHaveBeenCalled();
    await waitFor(() => expect(peekHandedOffVideo()?.name).toBe('late.webm'));
  });
});
