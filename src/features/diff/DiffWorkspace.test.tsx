import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copyText, downloadText } from '../../lib/download';
import { DiffWorkspace } from './DiffWorkspace';

vi.mock('../../lib/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/download')>();
  return { ...actual, downloadText: vi.fn(), copyText: vi.fn().mockResolvedValue(true) };
});

beforeEach(() => vi.clearAllMocks());

async function fillBoth(user: ReturnType<typeof userEvent.setup>, original: string, changed: string) {
  await user.clear(screen.getByLabelText(/original text/i));
  await user.clear(screen.getByLabelText(/changed text/i));
  if (original) await user.type(screen.getByLabelText(/original text/i), original);
  if (changed) await user.type(screen.getByLabelText(/changed text/i), changed);
}

describe('DiffWorkspace', () => {
  it('compares two texts, shows stats, and toggles between views', async () => {
    const user = userEvent.setup();
    render(<DiffWorkspace />);
    expect(screen.getByRole('button', { name: /find difference/i })).toBeDisabled();

    await fillBoth(user, 'alpha{enter}beta{enter}gamma', 'alpha{enter}beta two{enter}gamma{enter}delta');
    await user.click(screen.getByRole('button', { name: /find difference/i }));

    const result = screen.getByRole('region', { name: /comparison result/i });
    expect(within(result).getByRole('status')).toHaveTextContent(/2 change blocks/);
    expect(within(result).getByRole('status')).toHaveTextContent(/2 added/);
    expect(within(result).getByRole('status')).toHaveTextContent(/1 removed/);
    expect(within(result).getAllByRole('row')).toHaveLength(4);
    expect(within(result).getByText('two')).toHaveProperty('tagName', 'MARK');

    await user.click(screen.getByRole('button', { name: /unified/i }));
    expect(within(result).getAllByRole('row')).toHaveLength(5);
    expect(within(result).getAllByText('−')).toHaveLength(1);
    expect(within(result).getAllByText('+')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /side by side/i }));
    expect(within(result).getAllByRole('row')).toHaveLength(4);
  });

  it('renders removed-only rows with an empty right side', async () => {
    const user = userEvent.setup();
    render(<DiffWorkspace />);
    await fillBoth(user, 'keep{enter}gone', 'keep');
    await user.click(screen.getByRole('button', { name: /find difference/i }));
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveAttribute('data-kind', 'removed');
    expect(rows[1].querySelectorAll('td')[3]).toHaveClass('empty');
    await user.click(screen.getByRole('button', { name: /unified/i }));
    expect(screen.getAllByText('−')).toHaveLength(1);
  });

  it('ignores an empty file selection', () => {
    render(<DiffWorkspace />);
    fireEvent.change(screen.getByLabelText(/upload original file/i), { target: { files: [] } });
    expect(screen.getByLabelText(/original text/i)).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports identical texts and disables navigation', async () => {
    const user = userEvent.setup();
    render(<DiffWorkspace />);
    await fillBoth(user, 'same', 'same');
    await user.click(screen.getByRole('button', { name: /find difference/i }));
    expect(screen.getByText(/the two texts are identical/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('re-compares when options change, swaps sides, and clears', async () => {
    const user = userEvent.setup();
    render(<DiffWorkspace />);
    await fillBoth(user, 'Hello World', 'hello  world');
    await user.click(screen.getByRole('button', { name: /find difference/i }));
    expect(screen.getByText(/1 change block/)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/ignore whitespace/i));
    await user.click(screen.getByLabelText(/ignore case/i));
    expect(screen.getByText(/identical/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/ignore case/i));
    await user.click(screen.getByRole('button', { name: /swap/i }));
    expect(screen.getByLabelText(/original text/i)).toHaveValue('hello  world');
    expect(screen.getByLabelText(/changed text/i)).toHaveValue('Hello World');
    expect(screen.getByText(/1 change block/)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/wrap lines/i));
    expect(screen.getByRole('table')).toHaveAttribute('data-wrap', 'false');

    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(screen.getByLabelText(/original text/i)).toHaveValue('');
    expect(screen.queryByRole('region', { name: /comparison result/i })).not.toBeInTheDocument();
  });

  it('steps through change blocks with next and previous', async () => {
    const user = userEvent.setup();
    render(<DiffWorkspace />);
    await fillBoth(user, 'a{enter}b{enter}c{enter}d', 'a{enter}B{enter}c{enter}D');
    await user.click(screen.getByRole('button', { name: /find difference/i }));

    const rows = () => screen.getAllByRole('row').map((row) => row.getAttribute('data-current'));
    expect(rows()).toEqual([null, 'true', null, null]);

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(rows()[3]).toBe('true');
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(rows()[1]).toBe('true');
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(rows()[3]).toBe('true');
  });

  it('copies and downloads a unified patch', async () => {
    const user = userEvent.setup();
    render(<DiffWorkspace />);
    await fillBoth(user, 'one', 'two');
    await user.click(screen.getByRole('button', { name: /find difference/i }));

    await user.click(screen.getByRole('button', { name: /copy patch/i }));
    expect(copyText).toHaveBeenCalledWith(expect.stringContaining('+two'));
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download \.patch/i }));
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('-one'), 'changes.patch', expect.any(String));
  });

  it('loads text files into either side and rejects binaries', async () => {
    const user = userEvent.setup();
    render(<DiffWorkspace />);

    await user.upload(
      screen.getByLabelText(/upload original file/i),
      new File(['from file\r\n'], 'a.txt', { type: 'text/plain' }),
    );
    expect(screen.getByLabelText(/original text/i)).toHaveValue('from file\n');

    await user.upload(screen.getByLabelText(/upload changed file/i), new File([new Uint8Array([0, 1])], 'b.bin'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/binary/);
  });

  it('remembers the draft and view between visits', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DiffWorkspace />);
    await fillBoth(user, 'persisted', 'persisted!');
    await user.click(screen.getByRole('button', { name: /find difference/i }));
    await user.click(screen.getByRole('button', { name: /unified/i }));
    unmount();

    render(<DiffWorkspace />);
    expect(screen.getByLabelText(/original text/i)).toHaveValue('persisted');
    await user.click(screen.getByRole('button', { name: /find difference/i }));
    expect(screen.getByRole('button', { name: /unified/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a clear error when a side has too many lines', async () => {
    const user = userEvent.setup();
    render(<DiffWorkspace />);
    const huge = new File(['x\n'.repeat(50_001)], 'huge.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText(/upload original file/i), huge);
    await user.click(await screen.findByRole('button', { name: /find difference/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at most 50,000 lines/);
  });

  it('manages comparison history: new, rename, switch, search, delete, clear all, and import', async () => {
    const user = userEvent.setup();
    render(<DiffWorkspace />);

    // Type a title and texts
    const titleInput = screen.getByLabelText(/comparison title/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'First Diff');
    await fillBoth(user, 'first left', 'first right');
    await user.click(screen.getByRole('button', { name: /find difference/i }));

    expect(screen.getByRole('button', { name: /First Diff/i })).toBeInTheDocument();

    // Create a new comparison
    await user.click(screen.getByRole('button', { name: /new comparison/i }));
    expect(screen.getByLabelText(/comparison title/i)).toHaveValue('');
    expect(screen.getByLabelText(/original text/i)).toHaveValue('');

    // Fill second comparison
    await user.type(screen.getByLabelText(/comparison title/i), 'Second Diff');
    await fillBoth(user, 'second left', 'second right');
    await user.click(screen.getByRole('button', { name: /swap/i }));
    expect(screen.getByLabelText(/original text/i)).toHaveValue('second right');

    // Switch back to First Diff
    await user.click(screen.getByRole('button', { name: /First Diff/i }));
    expect(screen.getByLabelText(/comparison title/i)).toHaveValue('First Diff');
    expect(screen.getByLabelText(/original text/i)).toHaveValue('first left');

    // Search
    const searchInput = screen.getByPlaceholderText(/search comparisons/i);
    await user.type(searchInput, 'Second');
    expect(screen.queryByRole('button', { name: /First Diff/i })).not.toBeInTheDocument();
    await user.clear(searchInput);
    await user.type(searchInput, 'zzz');
    expect(screen.getByText(/no comparisons match that search/i)).toBeInTheDocument();
    await user.clear(searchInput);

    // Delete current comparison (First Diff)
    await user.click(screen.getByRole('button', { name: /delete comparison/i }));
    expect(screen.queryByRole('button', { name: /First Diff/i })).not.toBeInTheDocument();
    expect(screen.getByText(/comparison deleted/i)).toBeInTheDocument();

    // Export history (when items present)
    await user.click(screen.getByRole('button', { name: /export history/i }));
    expect(downloadText).toHaveBeenCalledWith(expect.any(String), 'filekit-diff-history.json', 'application/json');

    // Clear all with "Keep them" first
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(screen.getByText(/delete 1 comparisons\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /keep them/i }));
    expect(screen.queryByText(/delete 1 comparisons\?/i)).not.toBeInTheDocument();

    // Clear all confirmation
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(screen.getByText(/delete 1 comparisons\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /yes, delete all/i }));
    expect(screen.getByText(/all comparisons were removed/i)).toBeInTheDocument();

    // Export history (when empty, disabled)
    expect(screen.getByRole('button', { name: /export history/i })).toBeDisabled();

    // Import invalid JSON
    const badFile = new File(['not-json'], 'bad.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/import diffs json/i), badFile);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // Import JSON
    const validJson = JSON.stringify([
      {
        id: 'imported-1',
        title: 'Imported Comparison',
        original: 'import A',
        changed: 'import B',
        ignoreWhitespace: false,
        ignoreCase: false,
        view: 'split',
        createdAt: 1000,
        updatedAt: 2000,
      },
      {
        id: 'imported-2',
        title: 'Blank Comparison',
        original: '',
        changed: '',
        ignoreWhitespace: false,
        ignoreCase: false,
        view: 'split',
        createdAt: 1001,
        updatedAt: 2001,
      },
    ]);
    const file = new File([validJson], 'diffs.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/import diffs json/i), file);
    expect(await screen.findByRole('button', { name: /Imported Comparison/i })).toBeInTheDocument();

    // Switch to Blank Comparison
    await user.click(screen.getByRole('button', { name: /Blank Comparison/i }));
    expect(screen.getByLabelText(/comparison title/i)).toHaveValue('Blank Comparison');
    expect(screen.queryByRole('region', { name: /comparison result/i })).not.toBeInTheDocument();
  });
});

