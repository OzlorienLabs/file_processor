import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '../../lib/download';
import { summarizeText } from '../../lib/summarize';
import { extractText } from '../../lib/text-extract';
import { SummarizeWorkspace } from './SummarizeWorkspace';

vi.mock('../../lib/text-extract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/text-extract')>();
  return { ...actual, extractText: vi.fn() };
});
vi.mock('../../lib/summarize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/summarize')>();
  return { ...actual, summarizeText: vi.fn() };
});
vi.mock('../../lib/download', () => ({ downloadBlob: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

async function uploadReport(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['doc'], 'report.pdf', { type: 'application/pdf' });
  await user.upload(screen.getByLabelText(/choose a file to summarize/i), file);
  await screen.findByRole('group', { name: /ai model and key/i });
  return file;
}

async function addKey(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('API key'), 'sk-test');
}

describe('SummarizeWorkspace', () => {
  it('keeps the run button blocked until a provider key is present', async () => {
    const user = userEvent.setup();
    render(<SummarizeWorkspace />);
    await uploadReport(user);

    expect(screen.getByRole('button', { name: /add your provider key/i })).toBeDisabled();
    await addKey(user);
    expect(screen.getByRole('button', { name: /^summarize$/i })).toBeEnabled();
  });

  it('extracts locally, summarizes in the chosen shape, and shows the summary', async () => {
    vi.mocked(extractText).mockResolvedValue('Long document text');
    vi.mocked(summarizeText).mockResolvedValue('A crisp summary');
    const user = userEvent.setup();
    render(<SummarizeWorkspace />);
    const file = await uploadReport(user);
    await addKey(user);

    await user.click(screen.getByRole('radio', { name: /plain summary/i }));
    await user.click(screen.getByRole('button', { name: /^summarize$/i }));

    expect(extractText).toHaveBeenCalledWith(file, undefined, expect.any(AbortSignal), expect.any(Function));
    expect(summarizeText).toHaveBeenCalledWith(
      'Long document text',
      expect.objectContaining({ detail: 'plain', apiKey: 'sk-test' }),
    );
    expect(await screen.findByText('A crisp summary')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download brief/i }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'report-summary.txt');
  });

  it('says where the work runs while the provider request is in flight', async () => {
    vi.mocked(extractText).mockImplementation(async (_file, _open, _signal, onProgress) => {
      onProgress?.(1, 2);
      return 'text';
    });
    vi.mocked(summarizeText).mockImplementation(
      (_text, options) =>
        new Promise((_resolve, reject) => {
          options.onProgress?.('Summarizing');
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was cancelled.', 'AbortError')),
          );
        }),
    );
    const user = userEvent.setup();
    render(<SummarizeWorkspace />);
    await uploadReport(user);
    await addKey(user);
    await user.click(screen.getByRole('button', { name: /^summarize$/i }));

    expect(await screen.findByText(/sent to your provider with your key/i)).toBeInTheDocument();
    expect(screen.getByText(/only its text reaches the provider you chose/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /^summarize$/i })).toBeEnabled();
  });

  it('surfaces provider errors', async () => {
    vi.mocked(extractText).mockResolvedValue('text');
    vi.mocked(summarizeText).mockRejectedValue(new Error('The provider returned no summary text.'));
    const user = userEvent.setup();
    render(<SummarizeWorkspace />);
    await uploadReport(user);
    await addKey(user);
    await user.click(screen.getByRole('button', { name: /^summarize$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no summary text/i);
  });
});
