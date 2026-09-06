import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copyText, downloadText } from '../../lib/download';
import { SnippetsWorkspace } from './SnippetsWorkspace';

vi.mock('../../lib/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/download')>();
  return { ...actual, downloadText: vi.fn(), copyText: vi.fn().mockResolvedValue(true) };
});

beforeEach(() => vi.clearAllMocks());

const list = () => screen.getByRole('complementary', { name: /saved snippets/i });

async function addSnippet(
  user: ReturnType<typeof userEvent.setup>,
  { title, code, language, tags }: { title: string; code: string; language?: string; tags?: string },
) {
  await user.click(screen.getByRole('button', { name: /new snippet/i }));
  await user.type(screen.getByLabelText(/snippet title/i), title);
  if (language) await user.selectOptions(screen.getByLabelText(/^language$/i), language);
  if (tags) await user.type(screen.getByLabelText(/^tags$/i), tags);
  await user.type(screen.getByLabelText(/^code$/i), code);
  await user.click(screen.getByRole('button', { name: /save snippet/i }));
  await screen.findByRole('article');
}

describe('SnippetsWorkspace', () => {
  it('saves a snippet with detected language, shows it highlighted, and persists it', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SnippetsWorkspace />);
    expect(screen.getByRole('button', { name: /save snippet/i })).toBeDisabled();

    await addSnippet(user, { title: 'Greeting', code: 'const greet = (name) => name.trim();', language: 'javascript', tags: 'js, util' });
    expect(screen.getByText(/snippet saved in this browser/i)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.hljs-keyword')).not.toBeNull());
    expect(within(list()).getByRole('button', { name: /greeting/i })).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByText('#js').length).toBeGreaterThan(0);
    unmount();

    render(<SnippetsWorkspace />);
    expect(within(list()).getByRole('button', { name: /greeting/i })).toBeInTheDocument();
    expect(screen.getByText(/pick a snippet from the list/i)).toBeInTheDocument();
  });

  it('filters by search, language, and tag', async () => {
    const user = userEvent.setup();
    render(<SnippetsWorkspace />);
    await addSnippet(user, { title: 'Sorter', code: 'sorted(items)', language: 'python', tags: 'algo' });
    await addSnippet(user, { title: 'Styles', code: 'a:hover', language: 'css', tags: 'ui' });

    await user.type(screen.getByLabelText(/search snippets/i), 'sorted');
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    await user.clear(screen.getByLabelText(/search snippets/i));

    await user.selectOptions(screen.getByLabelText(/filter by language/i), 'css');
    expect(within(list()).getByRole('button', { name: /styles/i })).toBeInTheDocument();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText(/filter by language/i), '');

    const algo = within(screen.getByRole('group', { name: /filter by tag/i })).getByRole('button', { name: '#algo' });
    await user.click(algo);
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    await user.click(algo);
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);

    await user.type(screen.getByLabelText(/search snippets/i), 'nothing');
    expect(screen.getByText(/no snippets match/i)).toBeInTheDocument();
  });

  it('copies, downloads, edits, and deletes a snippet', async () => {
    const user = userEvent.setup();
    render(<SnippetsWorkspace />);
    await addSnippet(user, { title: 'Query', code: 'SELECT 1;', language: 'sql' });

    await user.click(screen.getByRole('button', { name: /copy code/i }));
    expect(copyText).toHaveBeenCalledWith('SELECT 1;');
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download query\.sql/i }));
    expect(downloadText).toHaveBeenCalledWith('SELECT 1;', 'Query.sql');

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByLabelText(/^code$/i)).toHaveValue('SELECT 1;');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('article')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.type(screen.getByLabelText(/^code$/i), ' -- edited');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/snippet updated/i)).toBeInTheDocument();
    expect(screen.getByText(/edited today/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(screen.getByText(/snippet deleted/i)).toBeInTheDocument();
    expect(screen.getByText(/saved snippets appear here/i)).toBeInTheDocument();
  });

  it('exports and imports JSON and clears everything after confirming', async () => {
    const user = userEvent.setup();
    render(<SnippetsWorkspace />);
    await addSnippet(user, { title: 'Keep', code: 'x = 1', language: 'python' });

    await user.click(screen.getByRole('button', { name: /export json/i }));
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"Keep"'), 'filekit-snippets.json', 'application/json');

    const payload = JSON.stringify([
      { id: 'imp', createdAt: 1, updatedAt: 1, title: 'Imported', language: 'go', tags: ['x'], code: 'package main' },
    ]);
    await user.upload(screen.getByLabelText(/import snippets json/i), new File([payload], 's.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 1 snippet; skipped 0/i)).toBeInTheDocument();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);

    const more = JSON.stringify([
      { id: 'imp2', createdAt: 1, updatedAt: 1, title: 'Two', language: 'go', tags: [], code: 'b' },
      { id: 'imp3', createdAt: 1, updatedAt: 1, title: 'Three', language: 'go', tags: [], code: 'c' },
    ]);
    await user.upload(screen.getByLabelText(/import snippets json/i), new File([more], 'more.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 2 snippets; skipped 0/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/import snippets json/i), { target: { files: [] } });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(4);

    await user.upload(screen.getByLabelText(/import snippets json/i), new File(['bad'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid json/i);

    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /keep them/i }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /yes, delete all/i }));
    expect(screen.getByText(/all snippets were removed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save snippet/i })).toBeInTheDocument();
  });

  it('cancelling a new snippet returns to the list and untitled snippets get a name', async () => {
    const user = userEvent.setup();
    render(<SnippetsWorkspace />);
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^code$/i), 'echo hi');
    await user.click(screen.getByRole('button', { name: /save snippet/i }));
    expect(await screen.findByRole('article')).toHaveTextContent('Untitled snippet');

    await user.click(screen.getByRole('button', { name: /new snippet/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByText(/pick a snippet from the list/i)).toBeInTheDocument();
    await user.click(within(list()).getByRole('button', { name: /untitled snippet/i }));
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('reports storage failures when saving', async () => {
    const user = userEvent.setup();
    render(<SnippetsWorkspace />);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    await user.type(screen.getByLabelText(/^code$/i), 'x');
    await user.click(screen.getByRole('button', { name: /save snippet/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/out of local storage/i);
    setItem.mockRestore();
  });

  it('imports code snippet files and loads code from file into the form', async () => {
    const user = userEvent.setup();
    render(<SnippetsWorkspace />);

    // Import a Python code file via sidebar
    const pyFile = new File(['def fib(n):\n    return n if n <= 1 else fib(n-1) + fib(n-2)'], 'fibonacci.py', { type: 'text/x-python' });
    await user.upload(screen.getByLabelText(/import a code snippet file/i), pyFile);
    expect(await screen.findByText(/imported fibonacci\.py/i)).toBeInTheDocument();
    expect(within(list()).getByRole('button', { name: /fibonacci/i })).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();

    // Start editing or new snippet, and load code into form
    await user.click(screen.getByRole('button', { name: /new snippet/i }));
    const jsFile = new File(['export const add = (a, b) => a + b;'], 'math.js', { type: 'text/javascript' });
    await user.upload(screen.getByLabelText(/upload code from file/i), jsFile);
    expect(await screen.findByText(/loaded math\.js/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/snippet title/i)).toHaveValue('math');
    expect(screen.getByLabelText(/^code$/i)).toHaveValue('export const add = (a, b) => a + b;');
    expect(screen.getByLabelText(/^language$/i)).toHaveValue('javascript');

    // Upload code into form when title is already set
    await user.type(screen.getByLabelText(/snippet title/i), ' Custom Name');
    const cssFile = new File(['body { color: red; }'], 'styles.css', { type: 'text/css' });
    await user.upload(screen.getByLabelText(/upload code from file/i), cssFile);
    expect(screen.getByLabelText(/snippet title/i)).toHaveValue('math Custom Name');
    expect(screen.getByLabelText(/^code$/i)).toHaveValue('body { color: red; }');

    // Upload file into form with custom language set and unknown file extension
    await user.selectOptions(screen.getByLabelText(/^language$/i), 'ruby');
    const customFile = new File(['puts "hi"'], 'script.custom', { type: 'text/plain' });
    await user.upload(screen.getByLabelText(/upload code from file/i), customFile);
    expect(screen.getByLabelText(/^language$/i)).toHaveValue('ruby');

    // Upload file into form with auto language and unknown extension
    await user.selectOptions(screen.getByLabelText(/^language$/i), 'auto');
    const autoUnknown = new File(['hello world'], 'main.custom', { type: 'text/plain' });
    await user.upload(screen.getByLabelText(/upload code from file/i), autoUnknown);
    expect(screen.getByLabelText(/^language$/i)).toHaveValue('plaintext');

    // Empty file selection
    fireEvent.change(screen.getByLabelText(/import a code snippet file/i), { target: { files: [] } });
    fireEvent.change(screen.getByLabelText(/upload code from file/i), { target: { files: [] } });

    // File read error on sidebar import
    const broken = new File(['bad'], 'broken.ts', { type: 'text/plain' });
    vi.spyOn(broken, 'text').mockRejectedValueOnce(new Error('Cannot read file'));
    await user.upload(screen.getByLabelText(/import a code snippet file/i), broken);
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot read file/i);

    // File read error on form upload
    const brokenForm = new File(['bad'], 'broken-form.ts', { type: 'text/plain' });
    vi.spyOn(brokenForm, 'text').mockRejectedValueOnce(new Error('Form upload failed'));
    await user.upload(screen.getByLabelText(/upload code from file/i), brokenForm);
    expect(await screen.findByRole('alert')).toHaveTextContent(/form upload failed/i);

    // Import file with unknown extension and empty base name
    const unknownFile = new File(['SELECT * FROM users;'], '.unknown', { type: 'text/plain' });
    await user.upload(screen.getByLabelText(/import a code snippet file/i), unknownFile);
    expect(await screen.findByText(/imported \.unknown/i)).toBeInTheDocument();
  });
});
