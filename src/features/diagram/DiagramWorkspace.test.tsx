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
      Promise.resolve(props.initialData).then((data) => setRestored(data ? 'restored' : 'blank'));
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

  it('restores a saved scene on the next visit and can forget it', async () => {
    localStorage.setItem('filekit.diagram.v1', JSON.stringify({ json: '{"type":"excalidraw"}', savedAt: Date.now() }));
    const user = userEvent.setup();
    render(<DiagramWorkspace />);
    expect(await screen.findByText(/canvas: restored/i)).toBeInTheDocument();
    expect(io.parse).toHaveBeenCalled();
    expect(screen.getByText(/saved in this browser today/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /forget saved copy/i }));
    expect(localStorage.getItem('filekit.diagram.v1')).toBeNull();
    expect(screen.getByText(/saved copy removed/i)).toBeInTheDocument();
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

  it('imports scene files, rejects unsupported ones, and confirms before starting over', async () => {
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

    await user.click(screen.getByRole('button', { name: /^new$/i }));
    expect(fakeApi.resetScene).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /^draw$/i }));
    await user.click(screen.getByRole('button', { name: /^new$/i }));
    await user.click(screen.getByRole('button', { name: /keep it/i }));
    expect(fakeApi.resetScene).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /^new$/i }));
    await user.click(screen.getByRole('button', { name: /yes, start new/i }));
    expect(fakeApi.resetScene).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/started a new drawing/i)).toBeInTheDocument();
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
});
