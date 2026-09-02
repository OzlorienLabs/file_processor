import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '../../lib/download';
import { transcribeLocally, transcribeViaApi } from '../../lib/transcribe';
import { AudioToTextWorkspace } from './AudioToTextWorkspace';

vi.mock('../../lib/transcribe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/transcribe')>();
  return { ...actual, transcribeLocally: vi.fn(), transcribeViaApi: vi.fn() };
});
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

async function uploadRecording(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['audio'], 'standup meeting.mp3', { type: 'audio/mpeg' });
  await user.upload(screen.getByLabelText(/choose audio to transcribe/i), file);
  await screen.findByRole('group', { name: /transcription engine/i });
  return file;
}

const transcript = {
  text: 'Hello meeting',
  segments: [
    { start: 0, end: 2, text: 'Hello' },
    { start: 6, end: 8, text: 'meeting' },
  ],
};

describe('AudioToTextWorkspace', () => {
  it('transcribes on this device by default and downloads the transcript', async () => {
    vi.mocked(transcribeLocally).mockResolvedValue(transcript);
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    const file = await uploadRecording(user);

    await user.selectOptions(screen.getByLabelText(/spoken language/i), 'en');
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));

    expect(transcribeLocally).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ languageCode: 'en' }),
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(await screen.findByText('Transcribe complete')).toBeInTheDocument();
    expect(screen.getByText(/transcribed on this device/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download transcript/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'standup-meeting.txt');
  });

  it('writes SRT and VTT from the same segments', async () => {
    vi.mocked(transcribeLocally).mockResolvedValue(transcript);
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);

    await user.click(screen.getByRole('radio', { name: /with timestamps/i }));
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));
    await user.click(await screen.findByRole('button', { name: /download subtitles/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'standup-meeting.srt');

    await user.click(screen.getByRole('button', { name: /start over/i }));
    await uploadRecording(user);
    await user.click(screen.getByRole('radio', { name: /captions/i }));
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));
    await user.click(await screen.findByRole('button', { name: /download captions/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'standup-meeting.vtt');
  });

  it('splits the plain transcript into paragraphs at pauses', async () => {
    vi.mocked(transcribeLocally).mockResolvedValue(transcript);
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));

    expect(await screen.findByText(/Hello\s+meeting/)).toBeInTheDocument();
  });

  it('requires a key for the API engine and discloses where the audio goes', async () => {
    vi.mocked(transcribeViaApi).mockResolvedValue(transcript);
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);

    await user.click(screen.getByRole('radio', { name: /with my openai api key/i }));
    expect(screen.getByRole('button', { name: /add your openai key/i })).toBeDisabled();

    await user.type(screen.getByLabelText('OpenAI API key'), 'sk-live');
    await user.selectOptions(screen.getByLabelText(/transcription model/i), 'whisper-1');
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));

    expect(transcribeViaApi).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ apiKey: 'sk-live', model: 'whisper-1' }),
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(await screen.findByText(/transcribed with your OpenAI key/i)).toBeInTheDocument();
  });

  it('threads the engine fraction into the progress bar and cancels quietly', async () => {
    vi.mocked(transcribeLocally).mockImplementation(
      (_file, _options, signal, onProgress) =>
        new Promise((_resolve, reject) => {
          onProgress?.('Transcribing on this device', 0.5);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText(/speech model running on this device/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /^transcribe$/i })).toBeEnabled();
  });

  it('surfaces transcription failures', async () => {
    vi.mocked(transcribeLocally).mockRejectedValue(new Error('Failed to fetch'));
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/different engine or file/i);
  });

  it('shows and hides the key, and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);

    await user.click(screen.getByRole('radio', { name: /with my openai api key/i }));
    const field = screen.getByLabelText('OpenAI API key');
    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show api key/i }));
    expect(screen.getByLabelText('OpenAI API key')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: /hide api key/i }));
    expect(screen.getByLabelText('OpenAI API key')).toHaveAttribute('type', 'password');

    await user.click(screen.getByLabelText(/remember my engine, model, and key/i));
    expect(localStorage.getItem('filekit.transcribe.v1')).toBeNull();
  });

  it('reports the API chunk progress', async () => {
    vi.mocked(transcribeViaApi).mockImplementation(
      (_file, _options, signal, onProgress) =>
        new Promise((_resolve, reject) => {
          onProgress?.('Transcribing part 1 of 2', 0.3);
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);

    await user.click(screen.getByRole('radio', { name: /with my openai api key/i }));
    await user.type(screen.getByLabelText('OpenAI API key'), 'sk-live');
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
    expect(screen.getByText(/audio chunks sent to openai with your key/i)).toBeInTheDocument();
    expect(screen.getByText(/short chunks using your own key/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /^transcribe$/i })).toBeEnabled();
  });

  it('falls back to a tick when a transcript has no segments', async () => {
    vi.mocked(transcribeLocally).mockResolvedValue({ text: 'no timings', segments: [] });
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));
    expect(await screen.findByText('no timings')).toBeInTheDocument();
  });

  it('keeps the raw transcript when paragraph splitting is off', async () => {
    vi.mocked(transcribeLocally).mockResolvedValue(transcript);
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);

    await user.click(screen.getByLabelText(/split into paragraphs at pauses/i));
    await user.click(screen.getByRole('button', { name: /^transcribe$/i }));
    expect(await screen.findByText('Hello meeting')).toBeInTheDocument();
  });

  it('forgets a stored key on request', async () => {
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);
    await uploadRecording(user);

    await user.click(screen.getByRole('radio', { name: /with my openai api key/i }));
    await user.type(screen.getByLabelText('OpenAI API key'), 'sk-live');
    expect(localStorage.getItem('filekit.transcribe.v1')).toContain('sk-live');

    await user.click(screen.getByRole('button', { name: /forget key on this device/i }));
    expect(screen.getByLabelText('OpenAI API key')).toHaveValue('');
  });
});
