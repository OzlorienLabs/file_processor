import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { transcribeLocally, transcribeViaApi } from '../../lib/transcribe';
import { AudioToTextWorkspace } from './AudioToTextWorkspace';

vi.mock('../../lib/transcribe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/transcribe')>();
  return { ...actual, transcribeLocally: vi.fn(), transcribeViaApi: vi.fn() };
});

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:transcript'),
    revokeObjectURL: vi.fn(),
  });
});

beforeEach(() => vi.clearAllMocks());

async function uploadRecording(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['audio'], 'standup meeting.mp3', { type: 'audio/mpeg' });
  await user.upload(screen.getByLabelText(/choose audio to transcribe/i), file);
  return file;
}

describe('AudioToTextWorkspace', () => {
  it('transcribes on-device by default and offers TXT plus SRT downloads', async () => {
    vi.mocked(transcribeLocally).mockResolvedValue({
      text: 'Hello meeting',
      segments: [{ start: 0, end: 2, text: 'Hello meeting' }],
    });
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);

    const file = await uploadRecording(user);
    await user.selectOptions(screen.getByLabelText(/spoken language/i), 'en');
    await user.click(screen.getByRole('button', { name: /transcribe audio/i }));

    expect(transcribeLocally).toHaveBeenCalledWith(
      file,
      { model: 'onnx-community/whisper-tiny', languageCode: 'en' },
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(await screen.findByLabelText('Transcript')).toHaveValue('Hello meeting');
    expect(screen.getByRole('link', { name: /download text/i })).toHaveAttribute(
      'download',
      'standup-meeting-transcript.txt',
    );
    expect(screen.getByRole('link', { name: /download subtitles/i })).toHaveAttribute(
      'download',
      'standup-meeting.srt',
    );
  });

  it('requires a key for the API engine and passes the chosen model', async () => {
    vi.mocked(transcribeViaApi).mockResolvedValue({ text: 'api transcript', segments: [] });
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);

    const file = await uploadRecording(user);
    await user.click(screen.getByRole('radio', { name: /with my openai api key/i }));
    expect(screen.getByRole('button', { name: /transcribe audio/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/^openai api key$/i), 'sk-audio');
    await user.selectOptions(screen.getByLabelText(/transcription model/i), 'gpt-4o-transcribe');
    await user.click(screen.getByRole('button', { name: /transcribe audio/i }));

    expect(transcribeViaApi).toHaveBeenCalledWith(
      file,
      { model: 'gpt-4o-transcribe', languageCode: '', apiKey: 'sk-audio' },
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(await screen.findByLabelText('Transcript')).toHaveValue('api transcript');
    expect(screen.queryByRole('link', { name: /download subtitles/i })).not.toBeInTheDocument();
  });

  it('remembers the engine and key across visits', async () => {
    vi.mocked(transcribeViaApi).mockResolvedValue({ text: 'x', segments: [] });
    const user = userEvent.setup();
    const { unmount } = render(<AudioToTextWorkspace />);

    await uploadRecording(user);
    await user.click(screen.getByRole('radio', { name: /with my openai api key/i }));
    await user.type(screen.getByLabelText(/^openai api key$/i), 'sk-saved');
    unmount();

    render(<AudioToTextWorkspace />);
    await uploadRecording(user);
    expect(screen.getByRole('radio', { name: /with my openai api key/i })).toBeChecked();
    expect(screen.getByLabelText(/^openai api key$/i)).toHaveValue('sk-saved');
  });

  it('surfaces transcription failures', async () => {
    vi.mocked(transcribeLocally).mockRejectedValue(new Error('decode failed'));
    const user = userEvent.setup();
    render(<AudioToTextWorkspace />);

    await uploadRecording(user);
    await user.click(screen.getByRole('button', { name: /transcribe audio/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('decode failed');
  });
});
