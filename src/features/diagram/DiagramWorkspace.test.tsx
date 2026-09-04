import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadExcalidrawIo } from '../../lib/diagram-scene';
import { downloadBlob, downloadText } from '../../lib/download';
import { DiagramWorkspace } from './DiagramWorkspace';

const fakeApi = {
  getSceneElements: vi.fn(() => [{ id: 'rect', isDeleted: false }]),
  getAppState: vi.fn(() => ({ viewBackgroundColor: '#ffffff' })),
  getFiles: vi.fn(() => ({})),
  updateScene: vi.fn(),
  addFiles: vi.fn(),
  scrollToContent: vi.fn(),
  resetScene: vi.fn(),
};

type FakeScene = { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> };
const io = {
  serialize: vi.fn(() => '{"type":"excalidraw","elements":[1]}'),
  parse: vi.fn(async (): Promise<FakeScene> => ({ elements: [{ id: 'imported' }], appState: { zoom: 1 }, files: { img: { id: 'img' } } })),
  toPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  toSvg: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg"/>'),
};

vi.mock('../../lib/diagram-scene', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/diagram-scene')>();
  return { ...actual, loadExcalidrawIo: vi.fn(async () => io) };
});
vi.mock('../../lib/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/download')>();
  return { ...actual, downloadBlob: vi.fn(), downloadText: vi.fn() };
});
vi.mock('@excalidraw/excalidraw/index.css', () => ({}));
vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: function FakeExcalidraw(props: {
    initialData: Promise<unknown> | null;
    excalidrawAPI: (api: unknown) => void;
    onChange: (elements: unknown[], appState: unknown, files: unknown) => void;
  }) {
    const [restored, setRestored] = useState('pending');
    useEffect(() => {
      props.excalidrawAPI(fakeApi);
      Promise.resolve(props.initialData).then((data) =>
        setRestored((data as { elements?: unknown[] } | null)?.elements?.length ? 'restored' : 'blank'),
      );
    }, [props]);
    return (
      <div>
        <p>canvas: {restored}</p>
        <button type="button" onClick={() => props.onChange([{ id: 'a' }, { id: 'b', isDeleted: true }], { zoom: 2 }, {})}>
          draw
        </button>
        <button type="button" onClick={() => props.onChange([{ id: 'a', isDeleted: true }], {}, {})}>
          erase
        </button>
      </div>
    );
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.EXCALIDRAW_ASSET_PATH = undefined;
});

describe('DiagramWorkspace', () => {
  it('loads the canvas lazily with self-hosted fonts and autosaves drawings', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DiagramWorkspace />);
    expect(screen.getByText(/loading the drawing canvas/i)).toBeInTheDocument();
    expect(await screen.findByText(/canvas: blank/i)).toBeInTheDocument();
    expect(window.EXCALIDRAW_ASSET_PATH).toBe('/excalidraw/');
    expect(screen.getByText(/not saved yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^draw$/i }));
    expect(screen.getByText(/^1 element$/)).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    await waitFor(() => expect(io.serialize).toHaveBeenCalledWith({ elements: [{ id: 'a' }, { id: 'b', isDeleted: true }], appState: { zoom: 2 }, files: {} }));
    await waitFor(() => expect(screen.getByText(/saved in this browser/i)).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('filekit.diagram.v1') ?? '{}').json).toContain('excalidraw');

    await user.click(screen.getByRole('button', { name: /^erase$/i }));
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('filekit.diagram.v1') ?? '{}').json).toBe(''));
    vi.useRealTimers();
  });

  it('restores a saved scene on the next visit and can delete it', async () => {
    localStorage.setItem('filekit.diagram.v1', JSON.stringify({ json: '{"type":"excalidraw"}', savedAt: Date.now() }));
    const user = userEvent.setup();
    render(<DiagramWorkspace />);
    expect(await screen.findByText(/canvas: restored/i)).toBeInTheDocument();
    expect(io.parse).toHaveBeenCalled();
    expect(screen.getByText(/saved in this browser today/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete diagram/i }));
    expect(screen.getByText(/diagram deleted/i)).toBeInTheDocument();
  });

  it('falls back to a blank canvas when the saved scene cannot be parsed', async () => {
    localStorage.setItem('filekit.diagram.v1', JSON.stringify({ json: 'corrupt', savedAt: 1 }));
    io.parse.mockRejectedValueOnce(new Error('bad'));
    render(<DiagramWorkspace />);
    expect(await screen.findByText(/canvas: blank/i)).toBeInTheDocument();
  });

  it('exports PNG, SVG, and .excalidraw files and reports export failures', async () => {
    const user = userEvent.setup();
    render(<DiagramWorkspace />);
    await screen.findByText(/canvas: blank/i);
    expect(screen.getByRole('button', { name: /^png$/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^draw$/i }));

    await user.click(screen.getByRole('button', { name: /^png$/i }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^diagram-.*\.png$/)));
    expect(io.toPng).toHaveBeenCalledWith(expect.objectContaining({ elements: [{ id: 'rect', isDeleted: false }] }), 2);

    await user.click(screen.getByRole('button', { name: /^svg$/i }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('<svg'), expect.stringMatching(/\.svg$/), expect.stringContaining('svg')));

    await user.click(screen.getByRole('button', { name: /\.excalidraw/i }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('"type":"excalidraw"'), expect.stringMatching(/\.excalidraw$/), 'application/json'));

    io.toPng.mockRejectedValueOnce(new Error('Canvas too large'));
    await user.click(screen.getByRole('button', { name: /^png$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Canvas too large');

    io.toSvg.mockRejectedValueOnce('not an error object');
    await user.click(screen.getByRole('button', { name: /^svg$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be exported/i);
  });

  it('imports scene files, rejects unsupported ones, and starts new drawings', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<DiagramWorkspace />);
    await screen.findByText(/canvas: blank/i);

    await user.upload(screen.getByLabelText(/import a diagram file/i), new File(['{}'], 'sketch.excalidraw', { type: 'application/json' }));
    await waitFor(() => expect(fakeApi.updateScene).toHaveBeenCalledWith({ elements: [{ id: 'imported' }], appState: { zoom: 1 } }));
    expect(fakeApi.addFiles).toHaveBeenCalledWith([{ id: 'img' }]);
    expect(fakeApi.scrollToContent).toHaveBeenCalled();
    expect(await screen.findByText(/imported sketch\.excalidraw/i)).toBeInTheDocument();

    await user.upload(screen.getByLabelText(/import a diagram file/i), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a supported file/i);

    io.parse.mockResolvedValueOnce({ elements: [{ id: 'bare' }], appState: {}, files: {} });
    await user.upload(screen.getByLabelText(/import a diagram file/i), new File(['{}'], 'bare.excalidraw', { type: 'application/json' }));
    await screen.findByText(/imported bare\.excalidraw/i);
    expect(fakeApi.addFiles).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(/import a diagram file/i), { target: { files: [] } });

    io.parse.mockRejectedValueOnce(new Error('nope'));
    await user.upload(screen.getByLabelText(/import a diagram file/i), new File(['x'], 'photo.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a diagram filekit can open/i);

    await user.click(screen.getByRole('button', { name: /new diagram/i }));
    expect(fakeApi.resetScene).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/started a new diagram/i)).toBeInTheDocument();
    expect(screen.getByText(/^0 elements$/)).toBeInTheDocument();
  });

  it('reports when the browser storage is full', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DiagramWorkspace />);
    await screen.findByText(/canvas: blank/i);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    await user.click(screen.getByRole('button', { name: /^draw$/i }));
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/out of local storage/i);
    setItem.mockRestore();
    expect(loadExcalidrawIo).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('manages diagram history: new, rename, switch, search, delete, clear all, and import JSON', async () => {
    const user = userEvent.setup();
    render(<DiagramWorkspace />);
    await screen.findByText(/canvas: blank/i);

    // Title input
    const titleInput = screen.getByLabelText(/diagram title/i);
    await user.type(titleInput, 'Architecture Diagram');
    await user.click(screen.getByRole('button', { name: /^draw$/i }));

    expect(screen.getByRole('button', { name: /Architecture Diagram/i })).toBeInTheDocument();

    // New diagram
    await user.click(screen.getByRole('button', { name: /new diagram/i }));
    expect(screen.getByLabelText(/diagram title/i)).toHaveValue('');

    // Name second diagram
    await user.type(screen.getByLabelText(/diagram title/i), 'Flowchart');
    await user.click(screen.getByRole('button', { name: /^draw$/i }));

    // Switch back
    await user.click(screen.getByRole('button', { name: /Architecture Diagram/i }));
    expect(screen.getByLabelText(/diagram title/i)).toHaveValue('Architecture Diagram');

    // Search
    const searchInput = screen.getByPlaceholderText(/search diagrams/i);
    await user.type(searchInput, 'Flow');
    expect(screen.queryByRole('button', { name: /Architecture Diagram/i })).not.toBeInTheDocument();
    await user.clear(searchInput);
    await user.type(searchInput, 'zzz');
    expect(screen.getByText(/no diagrams match that search/i)).toBeInTheDocument();
    await user.clear(searchInput);

    // Delete current diagram (Architecture Diagram)
    await user.click(screen.getByRole('button', { name: /delete diagram/i }));
    expect(screen.queryByRole('button', { name: /Architecture Diagram/i })).not.toBeInTheDocument();
    expect(screen.getByText(/diagram deleted/i)).toBeInTheDocument();

    // Export diagrams
    await user.click(screen.getByRole('button', { name: /export diagrams/i }));
    expect(downloadText).toHaveBeenCalledWith(expect.any(String), 'filekit-diagrams.json', 'application/json');

    // Clear all with "Keep them" first
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(screen.getByText(/delete 1 diagrams\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /keep them/i }));
    expect(screen.queryByText(/delete 1 diagrams\?/i)).not.toBeInTheDocument();

    // Clear all confirmation
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(screen.getByText(/delete 1 diagrams\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /yes, delete all/i }));
    expect(screen.getByText(/all diagrams were removed/i)).toBeInTheDocument();

    // Import invalid JSON
    const badFile = new File(['not-json'], 'bad.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/import diagrams json/i), badFile);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // Import JSON (single diagram)
    const singleJson = JSON.stringify({
      key: 'filekit.diagram.docs.v1',
      version: 1,
      items: [
        {
          id: 'single-d1',
          title: 'Single Flow',
          json: '{"type":"excalidraw"}',
          createdAt: 999,
          updatedAt: 1999,
        },
      ],
    });
    await user.upload(screen.getByLabelText(/import diagrams json/i), new File([singleJson], 'single.json', { type: 'application/json' }));
    expect(await screen.findByText(/imported 1 diagram\./i)).toBeInTheDocument();

    // Import JSON (multiple diagrams)
    const validJson = JSON.stringify({
      key: 'filekit.diagram.docs.v1',
      version: 1,
      items: [
        {
          id: 'imported-d1',
          title: 'Imported Flow',
          json: '{"type":"excalidraw"}',
          createdAt: 1000,
          updatedAt: 2000,
        },
        {
          id: 'imported-d2',
          title: 'Corrupted Flow',
          json: '{corrupt}',
          createdAt: 1001,
          updatedAt: 2001,
        },
        {
          id: 'imported-d3',
          title: 'Empty Flow',
          json: '',
          createdAt: 1002,
          updatedAt: 2002,
        },
      ],
    });
    const file = new File([validJson], 'diagrams.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/import diagrams json/i), file);
    expect(await screen.findByRole('button', { name: /Imported Flow/i })).toBeInTheDocument();

    // Click Empty Flow (blank json branch)
    await user.click(screen.getByRole('button', { name: /Empty Flow/i }));
    expect(screen.getByLabelText(/diagram title/i)).toHaveValue('Empty Flow');

    // Click Corrupted Flow (catch branch)
    io.parse.mockRejectedValueOnce(new Error('Corrupt json'));
    await user.click(screen.getByRole('button', { name: /Corrupted Flow/i }));
    expect(screen.getByLabelText(/diagram title/i)).toHaveValue('Corrupted Flow');
  });
});

