import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { mergeToPdf } from '../../lib/pdf';
import { MergeWorkspace } from './MergeWorkspace';

vi.mock('../../lib/pdf', () => ({ mergeToPdf: vi.fn() }));

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:merged'),
    revokeObjectURL: vi.fn(),
  });
});

describe('MergeWorkspace', () => {
  it('reorders files, merges them, and offers a named download', async () => {
    vi.mocked(mergeToPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(<MergeWorkspace />);

    const first = new File(['one'], 'first.pdf', { type: 'application/pdf' });
    const second = new File(['two'], 'second.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/choose files to merge/i), [first, second]);

    const fileList = screen.getByRole('list', { name: /files to merge/i });
    expect(within(fileList).getAllByRole('listitem')[0]).toHaveTextContent('first.pdf');
    await user.click(screen.getByRole('button', { name: /move first.pdf down/i }));
    expect(within(fileList).getAllByRole('listitem')[0]).toHaveTextContent('second.pdf');

    const outputName = screen.getByLabelText(/output filename/i);
    await user.clear(outputName);
    await user.type(outputName, 'team-handbook');
    await user.click(screen.getByRole('button', { name: /merge 2 files/i }));

    expect(mergeToPdf).toHaveBeenCalledWith([second, first], expect.any(AbortSignal));
    expect(await screen.findByRole('link', { name: /download merged pdf/i })).toHaveAttribute(
      'download',
      'team-handbook.pdf',
    );
  });
});
