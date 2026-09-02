import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkChromeAi } from '../../lib/chrome-ai';
import { copyText, downloadText } from '../../lib/download';
import { generateSnippet } from '../../lib/snippet-generate';
import { SnippetGeneratorWorkspace } from './SnippetGeneratorWorkspace';

vi.mock('../../lib/chrome-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/chrome-ai')>();
  return { ...actual, checkChromeAi: vi.fn() };
});
vi.mock('../../lib/snippet-generate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/snippet-generate')>();
  return { ...actual, generateSnippet: vi.fn() };
});
vi.mock('../../lib/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/download')>();
  return { ...actual, downloadText: vi.fn(), copyText: vi.fn().mockResolvedValue(true) };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkChromeAi).mockResolvedValue('available');
  vi.mocked(generateSnippet).mockResolvedValue({ code: 'export const answer = 42;', explanation: 'Use it anywhere.', raw: '' });
});

const historyList = () => screen.getByRole('complementary', { name: /generation history/i });

async function describeAndGenerate(user: ReturnType<typeof userEvent.setup>, text = 'the answer constant') {
  await user.type(screen.getByLabelText(/describe the snippet/i), text);
  await user.click(screen.getByRole('button', { name: /generate snippet|generate again/i }));
  await screen.findByRole('article', { name: /generated snippet/i });
}

describe('SnippetGeneratorWorkspace', () => {
  it('generates on device, shows the highlighted result, keeps history, and saves to snippets', async () => {
    const user = userEvent.setup();
    render(<SnippetGeneratorWorkspace />);
    expect(await screen.findByText(/built-in model is ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate snippet/i })).toBeDisabled();

    await describeAndGenerate(user);
    expect(generateSnippet).toHaveBeenCalledWith(
      { description: 'the answer constant', language: 'typescript', context: '', explain: true },
      expect.objectContaining({ engine: 'chrome', model: 'gemini-nano', apiKey: '' }),
    );
    await waitFor(() => expect(document.querySelector('.hljs-keyword')).not.toBeNull());
    expect(screen.getByText('Use it anywhere.')).toBeInTheDocument();
    expect(screen.getByText(/stayed on device/i)).toBeInTheDocument();
    expect(within(historyList()).getByRole('button', { name: /the answer constant/i })).toHaveAttribute('aria-current', 'true');

    await user.click(screen.getByRole('button', { name: /save to snippets/i }));
    expect(screen.getByText(/saved to your snippets/i)).toBeInTheDocument();
    expect(localStorage.getItem('filekit.snippets.v1')).toContain('export const answer = 42;');

    await user.click(screen.getByRole('button', { name: /copy code/i }));
    expect(copyText).toHaveBeenCalledWith('export const answer = 42;');
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^download$/i }));
    expect(downloadText).toHaveBeenCalledWith('export const answer = 42;', 'the-answer-constant.ts');
  });

  it('explains when the on-device model is missing and falls back to a provider key', async () => {
    vi.mocked(checkChromeAi).mockResolvedValue('unsupported');
    const user = userEvent.setup();
    render(<SnippetGeneratorWorkspace />);
    expect(await screen.findByText(/does not expose chrome's built-in model/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/describe the snippet/i), 'sort a list');
    expect(screen.getByRole('button', { name: /generate snippet/i })).toBeDisabled();
    expect(screen.getByText(/on-device model is not ready here/i)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /^cloud provider with your api key/i }));
    expect(screen.getByText(/add your provider api key/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/ai provider/i), 'google');
    await user.type(screen.getByLabelText(/^api key$/i), 'g-key');
    await user.selectOptions(screen.getByLabelText(/^language$/i), 'python');
    await user.click(screen.getByLabelText(/include a short explanation/i));
    await user.click(screen.getByLabelText(/add context/i));
    await user.type(screen.getByLabelText(/extra context/i), 'items are ints');

    await user.click(screen.getByRole('button', { name: /generate snippet/i }));
    await screen.findByRole('article');
    expect(generateSnippet).toHaveBeenCalledWith(
      { description: 'sort a list', language: 'python', context: 'items are ints', explain: false },
      expect.objectContaining({ engine: 'google', model: 'gemini-2.5-flash', apiKey: 'g-key' }),
    );
    expect(screen.getByText(/via your key/i)).toBeInTheDocument();
  });

  it('remembers engine, language, and explanation preferences', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SnippetGeneratorWorkspace />);
    await user.click(screen.getByRole('radio', { name: /^cloud provider with your api key/i }));
    await user.selectOptions(screen.getByLabelText(/^language$/i), 'go');
    await user.click(screen.getByLabelText(/include a short explanation/i));
    unmount();

    render(<SnippetGeneratorWorkspace />);
    expect(screen.getByRole('radio', { name: /^cloud provider with your api key/i })).toBeChecked();
    expect(screen.getByLabelText(/^language$/i)).toHaveValue('go');
    expect(screen.getByLabelText(/include a short explanation/i)).not.toBeChecked();
  });

  it('reports generation errors and stays quiet on cancel', async () => {
    vi.mocked(generateSnippet).mockRejectedValueOnce(new Error('The provider rejected this API key.'));
    const user = userEvent.setup();
    render(<SnippetGeneratorWorkspace />);
    await user.type(screen.getByLabelText(/describe the snippet/i), 'anything');
    await user.click(await screen.findByRole('button', { name: /generate snippet/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected this api key/i);

    vi.mocked(generateSnippet).mockImplementationOnce(
      (_request, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
        }),
    );
    await user.click(screen.getByRole('button', { name: /generate snippet/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/preparing the request/i);
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(await screen.findByRole('button', { name: /generate snippet/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('searches, reopens, removes, exports, and clears history', async () => {
    const user = userEvent.setup();
    render(<SnippetGeneratorWorkspace />);
    await describeAndGenerate(user, 'first idea');
    await user.clear(screen.getByLabelText(/describe the snippet/i));
    vi.mocked(generateSnippet).mockResolvedValueOnce({ code: 'second()', explanation: '', raw: '' });
    await describeAndGenerate(user, 'second idea');
    expect(within(historyList()).getAllByRole('listitem')).toHaveLength(2);

    await user.type(screen.getByLabelText(/search history/i), 'first');
    expect(within(historyList()).getAllByRole('listitem')).toHaveLength(1);
    await user.click(within(historyList()).getByRole('button', { name: /first idea/i }));
    expect(screen.getByLabelText(/describe the snippet/i)).toHaveValue('first idea');
    expect(screen.getByText('Use it anywhere.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/search history/i));
    await user.type(screen.getByLabelText(/search history/i), 'zzz');
    expect(screen.getByText(/nothing in history matches/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/search history/i));

    await user.click(screen.getByRole('button', { name: /export history/i }));
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('first idea'), 'filekit-generated-snippets.json', 'application/json');

    await user.click(screen.getByRole('button', { name: /remove from history/i }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(within(historyList()).getAllByRole('listitem')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /clear history/i }));
    await user.click(screen.getByRole('button', { name: /^keep$/i }));
    expect(within(historyList()).getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /clear history/i }));
    await user.click(screen.getByRole('button', { name: /yes, clear/i }));
    expect(screen.getByText(/history cleared/i)).toBeInTheDocument();
    expect(screen.getByText(/generated snippets are kept here/i)).toBeInTheDocument();
  });

  it('shows the downloadable hint and a storage error when saving fails', async () => {
    vi.mocked(checkChromeAi).mockResolvedValue('downloadable');
    const user = userEvent.setup();
    render(<SnippetGeneratorWorkspace />);
    expect(await screen.findByText(/ready to download/i)).toBeInTheDocument();
    await describeAndGenerate(user);

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    await user.click(screen.getByRole('button', { name: /save to snippets/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/out of local storage/i);

    await user.click(screen.getByRole('button', { name: /generate again/i }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent(/out of local storage/i);
    setItem.mockRestore();
  });
});
