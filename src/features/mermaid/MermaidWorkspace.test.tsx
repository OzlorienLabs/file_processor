import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyText, downloadBlob, downloadText } from '../../lib/download';
import { MermaidSyntaxError, rasterizeSvg, renderMermaid } from '../../lib/mermaid-render';
import { defaultMermaidCode } from '../../lib/mermaid-samples';
import { MermaidWorkspace } from './MermaidWorkspace';

vi.mock('../../lib/mermaid-render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/mermaid-render')>();
  return { ...actual, renderMermaid: vi.fn(), rasterizeSvg: vi.fn() };
});
vi.mock('../../lib/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/download')>();
  return { ...actual, downloadBlob: vi.fn(), downloadText: vi.fn(), copyText: vi.fn().mockResolvedValue(true) };
});

beforeAll(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:diagram'), revokeObjectURL: vi.fn() });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(renderMermaid).mockImplementation(async (code) => {
    if (code.includes('BROKEN')) throw new MermaidSyntaxError('Parse error on line 1');
    return { svg: `<svg viewBox="0 0 10 10" width="10" height="10">${code.length}</svg>`, width: 10, height: 10 };
  });
  vi.mocked(rasterizeSvg).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
});

const list = () => screen.getByRole('complementary', { name: /saved diagrams/i });
const editor = () => screen.getByLabelText(/mermaid code/i);

describe('MermaidWorkspace', () => {
  it('renders the default sample, updates on edits, and keeps the last good preview on errors', async () => {
    const user = userEvent.setup();
    render(<MermaidWorkspace />);
    expect(editor()).toHaveValue(defaultMermaidCode);
    expect(await screen.findByRole('img', { name: /rendered mermaid diagram/i })).toHaveAttribute('src', 'blob:diagram');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/diagram up to date/i));

    await user.clear(editor());
    await user.type(editor(), 'pie BROKEN');
    expect(await screen.findByRole('alert')).toHaveTextContent(/parse error on line 1.*showing the last diagram/i);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/syntax error/i);

    await user.clear(editor());
    await user.type(editor(), 'pie title ok');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(vi.mocked(renderMermaid).mock.calls.at(-1)?.[0]).toBe('pie title ok');
  });

  it('inserts samples, saves, updates, reloads, and deletes diagrams', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MermaidWorkspace />);
    await screen.findByRole('img');
    await user.selectOptions(screen.getByLabelText(/start from a sample/i), 'pie');
    expect((editor() as HTMLTextAreaElement).value).toContain('pie showData');

    await user.click(screen.getByRole('button', { name: /save diagram/i }));
    expect(screen.getByLabelText(/diagram name/i)).toHaveValue('Pie chart');
    await user.clear(screen.getByLabelText(/diagram name/i));
    await user.type(screen.getByLabelText(/diagram name/i), 'Processing split{enter}');
    expect(screen.getByText(/diagram saved in this browser/i)).toBeInTheDocument();
    expect(within(list()).getByRole('button', { name: /processing split/i })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText(/editing “processing split”/i)).toBeInTheDocument();

    await user.type(editor(), '\n "Extra" : 1');
    await user.click(screen.getByRole('button', { name: /update saved/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(screen.getByText(/saved diagram updated/i)).toBeInTheDocument();
    unmount();

    render(<MermaidWorkspace />);
    expect((editor() as HTMLTextAreaElement).value).toContain('"Extra" : 1');
    await user.selectOptions(screen.getByLabelText(/start from a sample/i), 'gantt');
    await user.click(within(list()).getByRole('button', { name: /processing split/i }));
    expect((editor() as HTMLTextAreaElement).value).toContain('pie showData');

    await user.click(screen.getByRole('button', { name: /save diagram|update saved/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.click(screen.getByRole('button', { name: /delete saved/i }));
    expect(screen.getByText(/saved diagram deleted/i)).toBeInTheDocument();
    expect(screen.getByText(/diagrams you save appear here/i)).toBeInTheDocument();
  });

  it('copies code and Markdown, exports SVG and PNG, and toggles actual size', async () => {
    const user = userEvent.setup();
    render(<MermaidWorkspace />);
    await screen.findByRole('img');

    await user.click(screen.getByRole('button', { name: /copy code/i }));
    expect(copyText).toHaveBeenLastCalledWith(defaultMermaidCode);
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /copy as markdown/i }));
    expect(copyText).toHaveBeenLastCalledWith(expect.stringMatching(/^```mermaid\n/));

    await user.click(screen.getByRole('button', { name: /^svg$/i }));
    expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'flowchart.svg');

    await user.click(screen.getByRole('button', { name: /^png$/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'flowchart.png'));
    expect(rasterizeSvg).toHaveBeenCalledWith(expect.objectContaining({ width: 10, height: 10 }), 2);

    vi.mocked(rasterizeSvg).mockRejectedValueOnce(new Error('This browser cannot create an image canvas.'));
    await user.click(screen.getByRole('button', { name: /^png$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot create an image canvas/i);

    await user.click(screen.getByLabelText(/actual size/i));
    expect(screen.getByRole('img').parentElement).toHaveAttribute('data-actual', 'true');
  });

  it('exports and imports saved diagrams as JSON and reports bad files', async () => {
    const user = userEvent.setup();
    render(<MermaidWorkspace />);
    await screen.findByRole('img');
    expect(screen.getByRole('button', { name: /export all/i })).toBeDisabled();

    const payload = JSON.stringify([{ id: 'd1', createdAt: 1, updatedAt: 1, name: 'Imported chart', code: 'pie' }, { nope: 1 }]);
    await user.upload(screen.getByLabelText(/import diagrams json/i), new File([payload], 'd.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 1 diagram; skipped 1/i)).toBeInTheDocument();
    expect(within(list()).getByRole('button', { name: /imported chart/i })).toBeInTheDocument();

    const more = JSON.stringify([
      { id: 'd2', createdAt: 1, updatedAt: 1, name: 'Two', code: 'pie' },
      { id: 'd3', createdAt: 1, updatedAt: 1, name: 'Three', code: 'pie' },
    ]);
    await user.upload(screen.getByLabelText(/import diagrams json/i), new File([more], 'more.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 2 diagrams; skipped 0/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/import diagrams json/i), { target: { files: [] } });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: /export all/i }));
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('Imported chart'), 'filekit-mermaid-diagrams.json', 'application/json');

    await user.upload(screen.getByLabelText(/import diagrams json/i), new File(['bad'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid json/i);
  });

  it('falls back to a suggested name when the typed name is blank and ignores the placeholder sample', async () => {
    const user = userEvent.setup();
    render(<MermaidWorkspace />);
    await screen.findByRole('img');
    fireEvent.change(screen.getByLabelText(/start from a sample/i), { target: { value: '' } });
    expect(editor()).toHaveValue(defaultMermaidCode);

    await user.click(screen.getByRole('button', { name: /save diagram/i }));
    await user.clear(screen.getByLabelText(/diagram name/i));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(within(list()).getByRole('button', { name: /^flowchart/i })).toBeInTheDocument();
  });

  it('shows the error in the preview area when nothing has rendered yet', async () => {
    vi.mocked(renderMermaid).mockRejectedValue(new MermaidSyntaxError('Write some Mermaid syntax to see a diagram.'));
    localStorage.setItem('filekit.mermaid-draft.v1', JSON.stringify({ code: '' }));
    render(<MermaidWorkspace />);
    expect(await screen.findByText(/write some mermaid syntax/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save diagram/i })).toBeDisabled();
  });
});
