import { describe, expect, it, vi } from 'vitest';

import {
  countDrawn,
  createExcalidrawIo,
  createSceneStore,
  diagramFilename,
  hasDrawing,
  loadExcalidrawIo,
} from './diagram-scene';

vi.mock('@excalidraw/excalidraw', () => ({
  serializeAsJSON: vi.fn(() => '{"type":"excalidraw"}'),
  loadFromBlob: vi.fn(async () => ({ elements: [{ id: 'e1' }], appState: { viewBackgroundColor: '#fff' }, files: {} })),
  exportToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  exportToSvg: vi.fn(async () => document.createElementNS('http://www.w3.org/2000/svg', 'svg')),
}));

const scene = { elements: [{ id: 'a' }], appState: { zoom: 1 }, files: { f: {} } };

describe('scene store and helpers', () => {
  it('persists the scene JSON under the versioned key', () => {
    const store = createSceneStore();
    expect(store.key).toBe('filekit.diagram.v1');
    expect(store.load()).toEqual({ json: '', savedAt: 0 });
    store.save({ json: '{}', savedAt: 5 });
    expect(store.load()).toEqual({ json: '{}', savedAt: 5 });
  });

  it('counts only elements that are not deleted', () => {
    const elements = [{ isDeleted: false }, { isDeleted: true }, {}];
    expect(hasDrawing(elements)).toBe(true);
    expect(countDrawn(elements)).toBe(2);
    expect(hasDrawing([{ isDeleted: true }])).toBe(false);
  });

  it('names exports by date', () => {
    expect(diagramFilename('png', new Date('2026-09-01T10:00:00Z'))).toBe('diagram-2026-09-01.png');
    expect(diagramFilename('excalidraw')).toMatch(/^diagram-\d{4}-\d{2}-\d{2}\.excalidraw$/);
  });
});

describe('excalidraw io adapter', () => {
  it('serialises, parses, and exports through the module', async () => {
    const module = await import('@excalidraw/excalidraw');
    const io = createExcalidrawIo(module);

    expect(io.serialize(scene)).toBe('{"type":"excalidraw"}');
    expect(module.serializeAsJSON).toHaveBeenCalledWith(scene.elements, scene.appState, scene.files, 'local');

    const parsed = await io.parse(new Blob(['{}']));
    expect(parsed.elements).toEqual([{ id: 'e1' }]);
    expect(parsed.appState).toEqual({ viewBackgroundColor: '#fff' });

    const png = await io.toPng(scene, 2);
    expect(png.type).toBe('image/png');
    const options = vi.mocked(module.exportToBlob).mock.calls[0][0];
    expect(options.mimeType).toBe('image/png');
    expect(options.appState).toMatchObject({ exportBackground: true });
    expect(options.getDimensions?.(10, 20)).toEqual({ width: 20, height: 40, scale: 2 });

    const svg = await io.toSvg(scene);
    expect(svg).toContain('<svg');
  });

  it('fills defaults when a loaded file has no elements, state, or files', async () => {
    const module = await import('@excalidraw/excalidraw');
    vi.mocked(module.loadFromBlob).mockResolvedValueOnce({} as never);
    const io = createExcalidrawIo(module);
    expect(await io.parse(new Blob(['{}']))).toEqual({ elements: [], appState: {}, files: {} });
  });

  it('loads the module once', async () => {
    const first = await loadExcalidrawIo();
    const second = await loadExcalidrawIo();
    expect(second).toBe(first);
    expect(first.serialize(scene)).toBe('{"type":"excalidraw"}');
  });
});
