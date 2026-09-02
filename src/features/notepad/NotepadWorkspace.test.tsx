import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copyText, downloadBlob, downloadText } from '../../lib/download';
import { NotepadWorkspace } from './NotepadWorkspace';

vi.mock('../../lib/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/download')>();
  return { ...actual, downloadBlob: vi.fn(), downloadText: vi.fn(), copyText: vi.fn().mockResolvedValue(true) };
});

beforeEach(() => vi.clearAllMocks());

const list = () => screen.getByRole('complementary', { name: /saved notes/i });

function renderWorkspace() {
  return render(
    <MemoryRouter>
      <NotepadWorkspace />
    </MemoryRouter>,
  );
}

describe('NotepadWorkspace', () => {
  it('saves notes as you type, lists them, and restores them on the next visit', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<NotepadWorkspace />);
    expect(screen.getByText(/notes you write appear here/i)).toBeInTheDocument();
    expect(screen.getByText(/start typing to save/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^note$/i), 'Buy milk');
    expect(within(list()).getByRole('button', { name: /buy milk/i })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText(/^saved locally$/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/note title/i), 'Groceries');
    await user.click(screen.getByRole('button', { name: /new note/i }));
    await user.type(screen.getByLabelText(/^note$/i), 'Second note');
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);
    unmount();

    render(<NotepadWorkspace />);
    expect(screen.getByLabelText(/^note$/i)).toHaveValue('Second note');
    await user.click(within(list()).getByRole('button', { name: /groceries/i }));
    expect(screen.getByLabelText(/^note$/i)).toHaveValue('Buy milk');
    expect(screen.getByRole('status')).toHaveTextContent('2 notes in this browser');
  });

  it('filters notes and removes a note that is emptied out', async () => {
    const user = userEvent.setup();
    render(<NotepadWorkspace />);
    await user.type(screen.getByLabelText(/^note$/i), 'alpha');
    await user.click(screen.getByRole('button', { name: /new note/i }));
    await user.type(screen.getByLabelText(/^note$/i), 'beta');

    await user.type(screen.getByLabelText(/search notes/i), 'alp');
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    await user.clear(screen.getByLabelText(/search notes/i));
    await user.type(screen.getByLabelText(/search notes/i), 'zzz');
    expect(screen.getByText(/no notes match/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/search notes/i));

    await user.clear(screen.getByLabelText(/^note$/i));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText(/start typing to save/i)).toBeInTheDocument();
  });

  it('previews Markdown and HTML with layout controls, hiding them for plain text', async () => {
    const user = userEvent.setup();
    render(<NotepadWorkspace />);
    expect(screen.queryByRole('group', { name: /layout/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/note format/i), 'markdown');
    await user.type(screen.getByLabelText(/^note$/i), '# Big title');
    expect(await screen.findByRole('heading', { level: 1, name: 'Big title' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^preview$/i }));
    expect(screen.getByRole('button', { name: /^preview$/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    await user.selectOptions(screen.getByLabelText(/note format/i), 'html');
    expect(screen.getByTitle(/html preview/i)).toHaveAttribute('srcdoc', expect.stringContaining('# Big title'));
    expect(screen.queryByRole('button', { name: /download as html/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download \.html/i })).toBeInTheDocument();
  });

  it('copies, downloads in the native format and as HTML, and deletes', async () => {
    const user = userEvent.setup();
    render(<NotepadWorkspace />);
    await user.selectOptions(screen.getByLabelText(/note format/i), 'markdown');
    await user.type(screen.getByLabelText(/note title/i), 'Plan');
    await user.type(screen.getByLabelText(/^note$/i), '## Steps');

    await user.click(screen.getByRole('button', { name: /^copy$/i }));
    expect(copyText).toHaveBeenCalledWith('## Steps');
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download \.md/i }));
    expect(downloadText).toHaveBeenLastCalledWith('## Steps', 'Plan.md');

    await user.click(screen.getByRole('button', { name: /download as html/i }));
    await waitFor(() =>
      expect(downloadText).toHaveBeenLastCalledWith(expect.stringContaining('<h2>Steps</h2>'), 'Plan.html', expect.any(String)),
    );

    await user.click(screen.getByRole('button', { name: /delete note/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/note deleted/i);
    expect(screen.getByLabelText(/^note$/i)).toHaveValue('');
  });

  it('exports every note as a zip, imports JSON, and clears everything after confirming', async () => {
    const user = userEvent.setup();
    render(<NotepadWorkspace />);
    await user.type(screen.getByLabelText(/^note$/i), 'to export');

    await user.click(screen.getByRole('button', { name: /export all/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'filekit-notes.zip'));

    const payload = JSON.stringify([
      { id: 'imported-1', createdAt: 1, updatedAt: 1, title: 'Imported', body: 'from file', mode: 'plain' },
      { bad: true },
    ]);
    await user.upload(screen.getByLabelText(/import notes json/i), new File([payload], 'notes.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 1 note; skipped 1/i)).toBeInTheDocument();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);

    const more = JSON.stringify([
      { id: 'imported-2', createdAt: 1, updatedAt: 1, title: 'Two', body: 'b', mode: 'plain' },
      { id: 'imported-3', createdAt: 1, updatedAt: 1, title: 'Three', body: 'c', mode: 'plain' },
    ]);
    await user.upload(screen.getByLabelText(/import notes json/i), new File([more], 'more.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 2 notes; skipped 0/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/import notes json/i), { target: { files: [] } });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /keep them/i }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /yes, delete all/i }));
    expect(screen.getByText(/all notes were removed/i)).toBeInTheDocument();
    expect(screen.getByText(/notes you write appear here/i)).toBeInTheDocument();
  });

  it('surfaces import problems and storage failures', async () => {
    const user = userEvent.setup();
    render(<NotepadWorkspace />);
    await user.upload(screen.getByLabelText(/import notes json/i), new File(['nope'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid json/i);

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    await user.type(screen.getByLabelText(/^note$/i), 'x');
    expect(screen.getByRole('alert')).toHaveTextContent(/out of local storage/i);
    setItem.mockRestore();
  });

  it('deleting the last remaining note falls back to a fresh note in the same format', async () => {
    const user = userEvent.setup();
    render(<NotepadWorkspace />);
    await user.selectOptions(screen.getByLabelText(/note format/i), 'html');
    await user.type(screen.getByLabelText(/^note$/i), '<p>only</p>');
    await user.click(screen.getByRole('button', { name: /new note/i }));
    await user.type(screen.getByLabelText(/^note$/i), '<p>second</p>');
    await user.click(screen.getByRole('button', { name: /delete note/i }));
    expect(screen.getByLabelText(/^note$/i)).toHaveValue('<p>only</p>');
    await user.click(screen.getByRole('button', { name: /delete note/i }));
    expect(screen.getByLabelText(/note format/i)).toHaveValue('html');
    expect(screen.getByLabelText(/^note$/i)).toHaveValue('');
  });

  it('opens emoji reference tool, searches, inserts emoji at cursor, copies, and closes', async () => {
    const catalog = {
      version: '17.0',
      count: 2,
      groups: [
        { name: 'Smileys & Emotion', emojis: [{ e: '😀', n: 'grinning face' }, { e: '🚀', n: 'rocket' }] },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 })),
    );

    const user = userEvent.setup();
    renderWorkspace();

    await user.type(screen.getByLabelText(/^note$/i), 'Hello world ');

    // Open emoji library reference tool from toolbar
    const emojiButtons = screen.getAllByRole('button', { name: /emoji library reference tool/i });
    await user.click(emojiButtons[0]);

    expect(screen.getByRole('dialog', { name: /emoji library reference tool/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /insert grinning face/i })).toBeInTheDocument();

    // Search emoji
    await user.type(screen.getByRole('textbox', { name: /search emoji/i }), 'rocket');
    expect(screen.queryByRole('button', { name: /insert grinning face/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /insert rocket/i })).toBeInTheDocument();

    // Click emoji to insert and copy
    await user.click(screen.getByRole('button', { name: /insert rocket/i }));
    expect(screen.getByLabelText(/^note$/i)).toHaveValue('Hello world 🚀');
    expect(screen.getByText(/inserted 🚀/i)).toBeInTheDocument();
    expect(copyText).toHaveBeenCalledWith('🚀');

    // Close reference panel
    await user.click(screen.getByRole('button', { name: /close emoji reference/i }));
    expect(screen.queryByRole('dialog', { name: /emoji library reference tool/i })).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
