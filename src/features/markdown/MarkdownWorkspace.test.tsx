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

  it('copies Markdown or HTML and downloads all formats', async () => {
    const user = userEvent.setup();
    render(<MarkdownWorkspace />);
    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    await user.type(screen.getByLabelText(/^markdown$/i), '# Title');

    await user.click(screen.getByRole('button', { name: /^markdown$/i }));
    expect(copyText).toHaveBeenLastCalledWith('# Title');
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^html$/i }));
    await waitFor(() => expect(copyText).toHaveBeenLastCalledWith('<h1>Title</h1>'));

    await user.click(screen.getByRole('button', { name: /^\.md$/i }));
    expect(downloadText).toHaveBeenLastCalledWith('# Title', 'document.md', expect.stringContaining('markdown'));

    // With title set
    await user.type(screen.getByLabelText(/document title/i), 'Notes');
    await user.click(screen.getByRole('button', { name: /^\.html$/i }));
    await waitFor(() =>
      expect(downloadText).toHaveBeenLastCalledWith(
        expect.stringContaining('<h1>Title</h1>'),
        'Notes.html',
        expect.stringContaining('html'),
      ),
    );

    await user.click(screen.getByRole('button', { name: /^\.pdf$/i }));
    await waitFor(() =>
      expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'Notes.pdf'),
    );
  });

  it('does not flash the copied state when the clipboard is unavailable', async () => {
    vi.mocked(copyText).mockResolvedValue(false);
    const user = userEvent.setup();
    render(<MarkdownWorkspace />);
    await user.click(screen.getByRole('button', { name: /^markdown$/i }));
    expect(screen.queryByRole('button', { name: /^copied$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^html$/i }));
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

  it('manages document history: creates new, searches, deletes, exports and imports', async () => {
    const user = userEvent.setup();
    render(<MarkdownWorkspace />);

    await user.click(screen.getByRole('button', { name: /new document/i }));
    await user.type(screen.getByLabelText(/document title/i), 'API Specs');
    await user.type(screen.getByLabelText(/^markdown$/i), '# API Documentation');

    expect(screen.getByText(/api specs/i)).toBeInTheDocument();

    // Search documents
    await user.type(screen.getByLabelText(/search documents/i), 'Specs');
    await user.clear(screen.getByLabelText(/search documents/i));
    await user.type(screen.getByLabelText(/search documents/i), 'zzz');
    expect(screen.getByText(/no documents match that search/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/search documents/i));

    // Export zip
    await user.click(screen.getByRole('button', { name: /export all/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'filekit-markdown-docs.zip'));

    // Import JSON (single)
    const singlePayload = JSON.stringify([
      { id: 'single-md', createdAt: 1, updatedAt: 1, title: 'Single MD', markdown: '# Single', view: 'split' },
    ]);
    await user.upload(screen.getByLabelText(/import markdown json/i), new File([singlePayload], 's.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 1 document; skipped 0/i)).toBeInTheDocument();

    // Import JSON (multiple)
    const payload = JSON.stringify([
      { id: 'imp-md', createdAt: 2, updatedAt: 2, title: 'Imported MD', markdown: '# Hello', view: 'split' },
      { id: 'imp-md-2', createdAt: 3, updatedAt: 3, title: 'Second Doc', markdown: '# Two', view: 'split' },
    ]);
    await user.upload(screen.getByLabelText(/import markdown json/i), new File([payload], 'm.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 2 documents; skipped 0/i)).toBeInTheDocument();

    // Open imported document by clicking it in the list
    await user.click(screen.getByRole('button', { name: /imported md/i }));
    expect(screen.getByLabelText(/document title/i)).toHaveValue('Imported MD');

    // Delete document
    await user.click(screen.getByRole('button', { name: /delete document/i }));
    expect(screen.getByText(/document deleted/i)).toBeInTheDocument();

    // Open API Specs, then blanking it removes it from store
    await user.click(screen.getByRole('button', { name: /api specs/i }));
    await user.clear(screen.getByLabelText(/document title/i));
    await user.clear(screen.getByLabelText(/^markdown$/i));
    expect(screen.queryByRole('button', { name: /api specs/i })).not.toBeInTheDocument();

    // Import invalid JSON
    await user.upload(screen.getByLabelText(/import markdown json/i), new File(['not json'], 'bad.json', { type: 'application/json' }));

    // Clear all
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /keep them/i }));
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /yes, delete all/i }));
    expect(screen.getByText(/all documents were removed/i)).toBeInTheDocument();
  });
});
