import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:summary'),
    revokeObjectURL: vi.fn(),
  });
});

beforeEach(() => vi.clearAllMocks());

async function uploadReport(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['doc'], 'report.pdf', { type: 'application/pdf' });
  await user.upload(screen.getByLabelText(/choose a file to summarize/i), file);
  return file;
}

describe('SummarizeWorkspace', () => {
  it('keeps the button disabled until an API key is provided', async () => {
    const user = userEvent.setup();
    render(<SummarizeWorkspace />);
    await uploadReport(user);

    const button = screen.getByRole('button', { name: /summarize file/i });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/^api key$/i), 'sk-test');
    expect(button).toBeEnabled();
  });

  it('extracts locally, summarizes with the chosen settings, and shows the summary', async () => {
    vi.mocked(extractText).mockResolvedValue('Extracted document text');
    vi.mocked(summarizeText).mockResolvedValue('A useful summary.');
    const user = userEvent.setup();
    render(<SummarizeWorkspace />);

    const file = await uploadReport(user);
    await user.selectOptions(screen.getByLabelText(/ai provider/i), 'anthropic');
    await user.type(screen.getByLabelText(/^api key$/i), 'sk-ant');
    await user.click(screen.getByRole('radio', { name: /detailed/i }));
    await user.click(screen.getByRole('button', { name: /summarize file/i }));

    expect(extractText).toHaveBeenCalledWith(file, undefined, expect.any(AbortSignal), expect.any(Function));
    expect(summarizeText).toHaveBeenCalledWith('Extracted document text', expect.objectContaining({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      apiKey: 'sk-ant',
      detail: 'detailed',
    }));
    expect(await screen.findByLabelText('Summary')).toHaveValue('A useful summary.');
    expect(screen.getByRole('link', { name: /download text/i })).toHaveAttribute(
      'download',
      'report-summary.txt',
    );
  });

  it('remembers settings across visits by default', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SummarizeWorkspace />);
    await uploadReport(user);
    await user.type(screen.getByLabelText(/^api key$/i), 'sk-persisted');
    unmount();

    render(<SummarizeWorkspace />);
    await uploadReport(user);
    expect(screen.getByLabelText(/^api key$/i)).toHaveValue('sk-persisted');
  });

  it('surfaces provider errors from the summarize call', async () => {
    vi.mocked(extractText).mockResolvedValue('text');
    vi.mocked(summarizeText).mockRejectedValue(new Error('The provider rejected this API key.'));
    const user = userEvent.setup();
    render(<SummarizeWorkspace />);

    await uploadReport(user);
    await user.type(screen.getByLabelText(/^api key$/i), 'sk-bad');
    await user.click(screen.getByRole('button', { name: /summarize file/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The provider rejected this API key.');
  });
});
