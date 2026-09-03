import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copyText, downloadBlob, downloadText } from '../../lib/download';
import { MarkdownWorkspace } from './MarkdownWorkspace';

vi.mock('../../lib/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/download')>();
  return { ...actual, downloadBlob: vi.fn(), downloadText: vi.fn(), copyText: vi.fn().mockResolvedValue(true) };
});

beforeEach(() => vi.clearAllMocks());

describe('MarkdownWorkspace', () => {
  it('starts with the sample and previews edits live', async () => {
    const user = userEvent.setup();
    render(<MarkdownWorkspace />);
    expect(screen.getByRole('heading', { level: 1, name: /markdown live preview/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(screen.getByLabelText(/^markdown$/i)).toHaveValue('');
    expect(await screen.findByText(/start typing markdown/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^markdown$/i), '## Fresh heading');
    expect(await screen.findByRole('heading', { level: 2, name: 'Fresh heading' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3 words');
  });

  it('switches layouts, restores the sample, and remembers the draft', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MarkdownWorkspace />);
    await user.click(screen.getByRole('button', { name: /^preview$/i }));
    expect(screen.getByRole('button', { name: /^preview$/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    await user.type(screen.getByLabelText(/^markdown$/i), 'kept');
    unmount();

    render(<MarkdownWorkspace />);
    expect(screen.getByLabelText(/^markdown$/i)).toHaveValue('kept');
    expect(screen.getByRole('button', { name: /^preview$/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /^sample$/i }));
    expect((screen.getByLabelText(/^markdown$/i) as HTMLTextAreaElement).value).toContain('# Markdown live preview');
  });

  it('copies Markdown or HTML and downloads both formats', async () => {
    const user = userEvent.setup();
    render(<MarkdownWorkspace />);
    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    await user.type(screen.getByLabelText(/^markdown$/i), '# Title');

    await user.click(screen.getByRole('button', { name: /copy markdown/i }));
    expect(copyText).toHaveBeenLastCalledWith('# Title');
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /copy html/i }));
    await waitFor(() => expect(copyText).toHaveBeenLastCalledWith('<h1>Title</h1>'));

    await user.click(screen.getByRole('button', { name: /download \.md/i }));
    expect(downloadText).toHaveBeenLastCalledWith('# Title', 'document.md', expect.stringContaining('markdown'));

    await user.click(screen.getByRole('button', { name: /download \.html/i }));
    await waitFor(() =>
      expect(downloadText).toHaveBeenLastCalledWith(
        expect.stringContaining('<h1>Title</h1>'),
        'document.html',
        expect.stringContaining('html'),
      ),
    );

    await user.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() =>
      expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'document.pdf'),
    );
  });

  it('does not flash the copied state when the clipboard is unavailable', async () => {
    vi.mocked(copyText).mockResolvedValue(false);
    const user = userEvent.setup();
    render(<MarkdownWorkspace />);
    await user.click(screen.getByRole('button', { name: /copy markdown/i }));
    expect(screen.queryByRole('button', { name: /^copied$/i })).not.toBeInTheDocument();
  });

  it('warns when the draft cannot be saved', async () => {
    const user = userEvent.setup();
    render(<MarkdownWorkspace />);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    await user.type(screen.getByLabelText(/^markdown$/i), '!');
    expect(await screen.findByRole('alert')).toHaveTextContent(/out of local storage/);
    setItem.mockRestore();
    await user.type(screen.getByLabelText(/^markdown$/i), '!');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies formatting from the toolbar buttons', async () => {
    const user = userEvent.setup();
    render(<MarkdownWorkspace />);
    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    const textarea = screen.getByLabelText(/^markdown$/i) as HTMLTextAreaElement;
    await user.type(textarea, 'hello');
    textarea.setSelectionRange(0, 5);
    await user.click(screen.getByRole('button', { name: /^bold$/i }));
    expect(textarea.value).toBe('**hello**');
  });
});
