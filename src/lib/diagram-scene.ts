import { z } from 'zod';

import { createCollection, createValueStore, stampNew, storedRecordSchema, type Collection, type ValueStore } from './local-store';

export const DIAGRAM_KEY = 'filekit.diagram.v1';
export const DIAGRAM_DOCS_KEY = 'filekit.diagram.docs.v1';
export const MAX_DIAGRAM_DOCS = 100;

export const savedDiagramDocSchema = storedRecordSchema.extend({
  title: z.string().max(200),
  json: z.string().max(20_000_000),
});
export type SavedDiagramDoc = z.infer<typeof savedDiagramDocSchema>;

export function createDiagramDoc(title = '', json = ''): SavedDiagramDoc {
  return { ...stampNew(), title, json };
}

export function displayDiagramDocTitle(doc: Pick<SavedDiagramDoc, 'title'>): string {
  return doc.title.trim() || 'Untitled diagram';
}

export function searchDiagramDocs(docs: SavedDiagramDoc[], query: string): SavedDiagramDoc[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return docs;
  return docs.filter((doc) => doc.title.toLowerCase().includes(needle));
}

export function createDiagramDocCollection(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
): Collection<SavedDiagramDoc> {
  const collection = createCollection<SavedDiagramDoc>({
    key: DIAGRAM_DOCS_KEY,
    schema: savedDiagramDocSchema,
    max: MAX_DIAGRAM_DOCS,
    storage,
  });

  const migrateLegacy = () => {
    try {
      const rawCollection = storage.getItem(DIAGRAM_DOCS_KEY);
      if (!rawCollection) {
        const legacyRaw = storage.getItem(DIAGRAM_KEY);
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw) as { json?: string };
          if (legacy.json && legacy.json.trim()) {
            collection.upsert(createDiagramDoc('Saved diagram', legacy.json));
          }
        }
      }
    } catch {
      // Ignore migration failure
    }
  };

  migrateLegacy();

  return {
    ...collection,
    list: () => {
      migrateLegacy();
      return collection.list();
    },
  };
}

export const diagramDocCollection = createDiagramDocCollection();

export function isBlankDiagramDoc(doc: SavedDiagramDoc): boolean {
  return !doc.title.trim() && !doc.json.trim();
}

/** Fonts are self-hosted here so the CSP's `font-src 'self'` holds (see vite.config.ts). */
export const EXCALIDRAW_ASSET_PATH = '/excalidraw/';

export interface StoredScene {
  /** The `.excalidraw` JSON document, exactly what the export produces. */
  json: string;
  savedAt: number;
}

export function createSceneStore(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): ValueStore<StoredScene> {
  return createValueStore<StoredScene>({
    key: DIAGRAM_KEY,
    schema: z.object({ json: z.string().max(20_000_000), savedAt: z.number() }),
    fallback: { json: '', savedAt: 0 },
    storage,
  });
}

/** The parts of an Excalidraw scene the tool needs; typed loosely so the lib never imports the engine. */
export interface SceneData {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

export interface ExcalidrawIo {
  serialize(scene: SceneData): string;
  parse(blob: Blob): Promise<SceneData>;
  toPng(scene: SceneData, scale: number): Promise<Blob>;
  toSvg(scene: SceneData): Promise<string>;
}

type ExcalidrawModule = typeof import('@excalidraw/excalidraw');

let ioPromise: Promise<ExcalidrawIo> | undefined;

/** Wraps the Excalidraw data utilities behind a small interface that tests can fake. */
export function createExcalidrawIo(module: ExcalidrawModule): ExcalidrawIo {
  type Elements = Parameters<ExcalidrawModule['serializeAsJSON']>[0];
  type AppState = Parameters<ExcalidrawModule['serializeAsJSON']>[1];
  type Files = Parameters<ExcalidrawModule['serializeAsJSON']>[2];
  const cast = (scene: SceneData) => ({
    elements: scene.elements as Elements,
    appState: scene.appState as unknown as AppState,
    files: scene.files as unknown as Files,
  });
  return {
    serialize: (scene) => {
      const { elements, appState, files } = cast(scene);
      return module.serializeAsJSON(elements, appState, files, 'local');
    },
    parse: async (blob) => {
      const data = await module.loadFromBlob(blob, null, null);
      return {
        elements: data.elements ?? [],
        appState: (data.appState ?? {}) as Record<string, unknown>,
        files: (data.files ?? {}) as Record<string, unknown>,
      };
    },
    toPng: (scene, scale) => {
      const { elements, appState, files } = cast(scene);
      return module.exportToBlob({
        elements,
        appState: { ...appState, exportBackground: true },
        files,
        mimeType: 'image/png',
        exportPadding: 16,
        getDimensions: (width: number, height: number) => ({ width: width * scale, height: height * scale, scale }),
      });
    },
    toSvg: async (scene) => {
      const { elements, appState, files } = cast(scene);
      const svg = await module.exportToSvg({ elements, appState: { ...appState, exportBackground: true }, files, exportPadding: 16 });
      return new XMLSerializer().serializeToString(svg);
    },
  };
}

export async function loadExcalidrawIo(): Promise<ExcalidrawIo> {
  ioPromise ??= import('@excalidraw/excalidraw').then((module) => createExcalidrawIo(module));
  return ioPromise;
}

export function hasDrawing(elements: readonly unknown[]): boolean {
  return elements.some((element) => !(element as { isDeleted?: boolean }).isDeleted);
}

export function countDrawn(elements: readonly unknown[]): number {
  return elements.filter((element) => !(element as { isDeleted?: boolean }).isDeleted).length;
}

export function diagramFilename(extension: 'png' | 'svg' | 'excalidraw', now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `diagram-${stamp}.${extension}`;
}

export const IMPORT_POLICY = {
  accept: ['application/json', 'image/png', 'image/svg+xml'],
  extensions: ['excalidraw', 'json', 'png', 'svg'],
  maxBytes: 20 * 1024 * 1024,
  maxFiles: 1,
};
