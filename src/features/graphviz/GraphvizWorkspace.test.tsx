import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyText, downloadBlob, downloadText } from '../../lib/download';
import { graphToPdf, GraphvizSyntaxError, renderGraphviz, renderGraphvizText } from '../../lib/graphviz-render';
import { defaultGraphvizCode } from '../../lib/graphviz-samples';
import { rasterizeSvg } from '../../lib/mermaid-render';
import { GraphvizWorkspace } from './GraphvizWorkspace';

vi.mock('../../lib/graphviz-render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/graphviz-render')>();
  return { ...actual, renderGraphviz: vi.fn(), renderGraphvizText: vi.fn(), graphToPdf: vi.fn() };
});
vi.mock('../../lib/mermaid-render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/mermaid-render')>();
  return { ...actual, rasterizeSvg: vi.fn() };
});
vi.mock('../../lib/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/download')>();
  return { ...actual, downloadBlob: vi.fn(), downloadText: vi.fn(), copyText: vi.fn().mockResolvedValue(true) };
});

beforeAll(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:graph'), revokeObjectURL: vi.fn() });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(renderGraphviz).mockImplementation(async (code) => {
    if (code.includes('BROKEN')) throw new GraphvizSyntaxError("syntax error in line 1 near '}'");
    return {
      svg: `<svg viewBox="0 0 10 10" width="10" height="10">${code.length}</svg>`,
      width: 10,
      height: 10,
      warnings: code.includes('WARN') ? ['using box for unknown shape bogus'] : [],
    };
  });
  vi.mocked(renderGraphvizText).mockResolvedValue('digraph { laid out }');
  vi.mocked(rasterizeSvg).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  vi.mocked(graphToPdf).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
});

const list = () => screen.getByRole('complementary', { name: /saved graphs/i });
const editor = () => screen.getByLabelText(/graphviz dot code/i) as HTMLTextAreaElement;
const status = () => screen.getByRole('status');

describe('GraphvizWorkspace', () => {
  it('renders the default sample, re-renders on edits and engine changes, and keeps the last good preview', async () => {
    const user = userEvent.setup();
    render(<GraphvizWorkspace />);
    expect(editor()).toHaveValue(defaultGraphvizCode);
    expect(await screen.findByRole('img', { name: /rendered graphviz graph/i })).toHaveAttribute('src', 'blob:graph');
    await waitFor(() => expect(status()).toHaveTextContent(/graph up to date/i));
    expect(renderGraphviz).toHaveBeenLastCalledWith(defaultGraphvizCode, 'dot');

    await user.selectOptions(screen.getByLabelText(/layout engine/i), 'twopi');
    await waitFor(() => expect(renderGraphviz).toHaveBeenLastCalledWith(defaultGraphvizCode, 'twopi'));
    fireEvent.change(screen.getByLabelText(/layout engine/i), { target: { value: 'not-an-engine' } });
    expect(screen.getByLabelText(/layout engine/i)).toHaveValue('twopi');

    fireEvent.change(editor(), { target: { value: 'digraph { BROKEN }' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/syntax error in line 1.*showing the last graph/i);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(status()).toHaveTextContent(/syntax error/i);

    fireEvent.change(editor(), { target: { value: 'graph { layout=circo; a [shape=WARN] }' } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByText(/graphviz notes: using box for unknown shape/i)).toBeInTheDocument();
    expect(status()).toHaveTextContent(/source sets layout=circo/i);
  });

  it('inserts samples with their engine, saves, updates, reloads, and deletes graphs', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<GraphvizWorkspace />);
    await screen.findByRole('img');
    await user.selectOptions(screen.getByLabelText(/start from a sample/i), 'radial');
    expect(editor().value).toContain('digraph Radial');
    expect(screen.getByLabelText(/layout engine/i)).toHaveValue('twopi');

    await user.click(screen.getByRole('button', { name: /save graph/i }));
    expect(screen.getByLabelText(/graph name/i)).toHaveValue('Radial');
    await user.clear(screen.getByLabelText(/graph name/i));
    await user.type(screen.getByLabelText(/graph name/i), 'Tool map{enter}');
    expect(screen.getByText(/graph saved in this browser/i)).toBeInTheDocument();
    expect(within(list()).getByRole('button', { name: /tool map.*twopi/i })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText(/editing “tool map”/i)).toBeInTheDocument();

    fireEvent.change(editor(), { target: { value: `${editor().value}\n// extra` } });
    await user.click(screen.getByRole('button', { name: /update saved/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(screen.getByText(/saved graph updated/i)).toBeInTheDocument();
    unmount();

    render(<GraphvizWorkspace />);
    expect(editor().value).toContain('// extra');
    expect(screen.getByLabelText(/layout engine/i)).toHaveValue('twopi');
    await user.selectOptions(screen.getByLabelText(/start from a sample/i), 'fdp');
    expect(screen.getByLabelText(/layout engine/i)).toHaveValue('fdp');
    await user.click(within(list()).getByRole('button', { name: /tool map/i }));
    expect(editor().value).toContain('digraph Radial');
    expect(screen.getByLabelText(/layout engine/i)).toHaveValue('twopi');

    await user.click(screen.getByRole('button', { name: /update saved/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.click(screen.getByRole('button', { name: /delete saved/i }));
    expect(screen.getByText(/saved graph deleted/i)).toBeInTheDocument();
    expect(screen.getByText(/graphs you save appear here/i)).toBeInTheDocument();
  });

  it('copies code and Markdown and exports SVG, PNG and PDF', async () => {
    const user = userEvent.setup();
    render(<GraphvizWorkspace />);
    await screen.findByRole('img');

    await user.click(screen.getByRole('button', { name: /copy code/i }));
    expect(copyText).toHaveBeenLastCalledWith(defaultGraphvizCode);
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /copy as markdown/i }));
    expect(copyText).toHaveBeenLastCalledWith(expect.stringMatching(/^```dot\n/));

    await user.click(screen.getByRole('button', { name: /^svg$/i }));
    expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'filekit.svg');

    await user.click(screen.getByRole('button', { name: /^png$/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'filekit.png'));
    expect(rasterizeSvg).toHaveBeenCalledWith(expect.objectContaining({ width: 10, height: 10 }), 2);

    await user.click(screen.getByRole('button', { name: /^pdf$/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'filekit.pdf'));

    vi.mocked(rasterizeSvg).mockRejectedValueOnce(new Error('This browser cannot create an image canvas.'));
    await user.click(screen.getByRole('button', { name: /^png$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot create an image canvas/i);
    vi.mocked(graphToPdf).mockRejectedValueOnce('nope');
    await user.click(screen.getByRole('button', { name: /^pdf$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/the pdf could not be created/i);

    await user.click(screen.getByLabelText(/actual size/i));
    expect(screen.getByRole('img').parentElement).toHaveAttribute('data-actual', 'true');
  });

  it('creates source and Graphviz output files and reports failures', async () => {
    const user = userEvent.setup();
    render(<GraphvizWorkspace />);
    await screen.findByRole('img');

    await user.click(screen.getByRole('button', { name: /create file/i }));
    expect(downloadText).toHaveBeenLastCalledWith(defaultGraphvizCode, 'filekit.gv', 'text/vnd.graphviz;charset=utf-8');

    await user.selectOptions(screen.getByLabelText(/file format/i), 'json');
    await user.click(screen.getByRole('button', { name: /create file/i }));
    await waitFor(() =>
      expect(downloadText).toHaveBeenLastCalledWith('digraph { laid out }', 'filekit.json', 'application/json;charset=utf-8'),
    );
    expect(renderGraphvizText).toHaveBeenLastCalledWith(defaultGraphvizCode, 'json', 'dot');

    await user.selectOptions(screen.getByLabelText(/file format/i), 'eps');
    vi.mocked(renderGraphvizText).mockRejectedValueOnce(new GraphvizSyntaxError("syntax error in line 2 near 'x'"));
    await user.click(screen.getByRole('button', { name: /create file/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/syntax error in line 2/i);
    vi.mocked(renderGraphvizText).mockRejectedValueOnce('nope');
    await user.click(screen.getByRole('button', { name: /create file/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/encapsulated postscript.*could not be created/i);

    fireEvent.change(editor(), { target: { value: 'digraph Flow { a }' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/file format/i), 'source');
    await user.click(screen.getByRole('button', { name: /create file/i }));
    expect(downloadText).toHaveBeenLastCalledWith('digraph Flow { a }', 'flow.gv', expect.any(String));
  });

  it('exports and imports saved graphs as JSON and reports bad files', async () => {
    const user = userEvent.setup();
    render(<GraphvizWorkspace />);
    await screen.findByRole('img');
    expect(screen.getByRole('button', { name: /export all/i })).toBeDisabled();

    const payload = JSON.stringify([
      { id: 'g1', createdAt: 1, updatedAt: 1, name: 'Imported graph', code: 'graph { a }', engine: 'neato' },
      { nope: 1 },
    ]);
    await user.upload(screen.getByLabelText(/import graphs json/i), new File([payload], 'g.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 1 graph; skipped 1/i)).toBeInTheDocument();
    expect(within(list()).getByRole('button', { name: /imported graph/i })).toBeInTheDocument();

    const more = JSON.stringify([
      { id: 'g2', createdAt: 1, updatedAt: 1, name: 'Two', code: 'graph {}' },
      { id: 'g3', createdAt: 1, updatedAt: 1, name: 'Three', code: 'graph {}' },
    ]);
    await user.upload(screen.getByLabelText(/import graphs json/i), new File([more], 'more.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 2 graphs; skipped 0/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/import graphs json/i), { target: { files: [] } });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: /export all/i }));
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('Imported graph'), 'filekit-graphviz-graphs.json', 'application/json');

    await user.upload(screen.getByLabelText(/import graphs json/i), new File(['bad'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid json/i);
  });

  it('falls back to a suggested name when the typed name is blank and ignores the placeholder sample', async () => {
    const user = userEvent.setup();
    render(<GraphvizWorkspace />);
    await screen.findByRole('img');
    fireEvent.change(screen.getByLabelText(/start from a sample/i), { target: { value: '' } });
    expect(editor()).toHaveValue(defaultGraphvizCode);

    await user.click(screen.getByRole('button', { name: /save graph/i }));
    await user.clear(screen.getByLabelText(/graph name/i));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(within(list()).getByRole('button', { name: /^filekit/i })).toBeInTheDocument();
  });

  it('shows the error in the preview area when nothing has rendered yet', async () => {
    vi.mocked(renderGraphviz).mockRejectedValue(new GraphvizSyntaxError('Write some DOT to see a graph.'));
    localStorage.setItem('filekit.graphviz-draft.v1', JSON.stringify({ code: '', engine: 'dot' }));
    render(<GraphvizWorkspace />);
    expect(await screen.findByText(/write some dot/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save graph/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /create file/i })).toBeDisabled();
  });

  it('keeps working when the draft cannot be saved', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<GraphvizWorkspace />);
    await screen.findByRole('img');
    fireEvent.change(editor(), { target: { value: 'graph { a }' } });
    await waitFor(() => expect(renderGraphviz).toHaveBeenLastCalledWith('graph { a }', 'dot'));
    setItem.mockRestore();
  });

  it('supports search, new graph, clear all, and highlights DOT', async () => {
    const user = userEvent.setup();
    render(<GraphvizWorkspace />);
    await screen.findByRole('img');

    fireEvent.change(editor(), { target: { value: '// note\ndigraph G {\n  a -> b [label=<<b>x</b>>, weight=2, color="red"]\n}\n' } });
    expect(document.querySelector('.mm-comment')).toHaveTextContent('// note');
    expect(document.querySelector('.mm-keyword')).toHaveTextContent('digraph');
    expect(document.querySelector('.mm-arrow')).toHaveTextContent('->');
    expect(document.querySelector('.gv-html')).toHaveTextContent('<b>x</b>');
    expect(document.querySelector('.gv-attr')).toHaveTextContent('label');
    expect(document.querySelector('.mm-number')).toHaveTextContent('2');
    expect(document.querySelector('.mm-string')).toHaveTextContent('"red"');
    fireEvent.scroll(editor(), { target: { scrollTop: 40, scrollLeft: 10 } });
    expect(document.querySelector('.mermaid-highlight-layer')!.scrollTop).toBe(40);

    await user.click(screen.getByRole('button', { name: /save graph/i }));
    await user.clear(screen.getByLabelText(/graph name/i));
    await user.type(screen.getByLabelText(/graph name/i), 'Flow1{enter}');
    expect(within(list()).getByRole('button', { name: /flow1/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /new graph/i }));
    expect(screen.getByText(/started a new graph/i)).toBeInTheDocument();
    expect(editor()).toHaveValue(defaultGraphvizCode);

    await user.type(screen.getByLabelText(/search graphs/i), 'Flow1');
    expect(within(list()).getByRole('button', { name: /flow1/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/search graphs/i), 'zzz');
    expect(screen.getByText(/no graphs match that search/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/search graphs/i));

    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /keep them/i }));
    expect(within(list()).getByRole('button', { name: /flow1/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /yes, delete all/i }));
    expect(screen.getByText(/all graphs were removed/i)).toBeInTheDocument();
  });

  it('imports .gv and .dot files as saved graphs and handles read errors', async () => {
    const user = userEvent.setup();
    render(<GraphvizWorkspace />);
    await screen.findByRole('img');
    const input = () => screen.getByLabelText(/import a graphviz file/i);

    await user.upload(input(), new File(['digraph { a -> b }'], 'build-graph.gv', { type: 'text/vnd.graphviz' }));
    expect(await screen.findByText(/imported build-graph\.gv/i)).toBeInTheDocument();
    expect(editor()).toHaveValue('digraph { a -> b }');
    expect(within(list()).getByRole('button', { name: /build-graph/i })).toHaveAttribute('aria-current', 'true');

    await user.upload(input(), new File(['graph Net { a -- b }'], '.dot', { type: 'text/plain' }));
    expect(await screen.findByText(/imported \.dot/i)).toBeInTheDocument();
    expect(within(list()).getByRole('button', { name: /^net/i })).toBeInTheDocument();

    fireEvent.change(input(), { target: { files: [] } });

    const broken = new File(['bad'], 'corrupt.gv', { type: 'text/plain' });
    vi.spyOn(broken, 'text').mockRejectedValueOnce(new Error('Cannot read file'));
    await user.upload(input(), broken);
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot read file/i);
  });

  it('handles unmount while rendering is pending', () => {
    const { unmount } = render(<GraphvizWorkspace />);
    unmount();
  });
});
