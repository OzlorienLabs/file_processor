import { render, screen, within } from '@testing-library/react';
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

    await user.click(screen.getByRole('button', { name: /clear/i }));
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
});
