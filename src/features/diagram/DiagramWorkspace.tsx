import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { Download, FilePlus2, FolderDown, Search, Trash2, Upload } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { useLocalCollection } from '../../hooks/useLocalCollection';
import { downloadBlob, downloadText, formatWhen } from '../../lib/download';
import {
  countDrawn,
  createDiagramDoc,
  createDiagramDocCollection,
  createSceneStore,
  diagramDocCollection,
  diagramFilename,
  displayDiagramDocTitle,
  EXCALIDRAW_ASSET_PATH,
  hasDrawing,
  IMPORT_POLICY,
  isBlankDiagramDoc,
  loadExcalidrawIo,
  type SavedDiagramDoc,
  type SceneData,
  searchDiagramDocs,
} from '../../lib/diagram-scene';
import { errorMessage } from '../../lib/errors';
import { assertFilesAllowed, FileInputError } from '../../lib/files';
import { touch } from '../../lib/local-store';

const AUTOSAVE_DELAY_MS = 500;
/** Leaves room for the floating tool rail, properties panel, and zoom cluster. */
const CANVAS_FIT_ZOOM = 0.7;
const sceneStore = createSceneStore();

// The engine (and its stylesheet) only load when someone opens this tool.
const ExcalidrawCanvas = lazy(async () => {
  window.EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_PATH;
  const [module] = await Promise.all([import('@excalidraw/excalidraw'), import('@excalidraw/excalidraw/index.css')]);
  return { default: module.Excalidraw };
});

/** The 22px dot grid the design calls for, drawn by the engine itself. */
const CANVAS_APP_STATE = { gridSize: 22, gridModeEnabled: true } as const;

async function restoreInitialScene(): Promise<ExcalidrawInitialDataState> {
  const collection = createDiagramDocCollection();
  const first = collection.list()[0];
  const storedJson = first?.json || sceneStore.load().json;
  if (!storedJson) return { appState: { ...CANVAS_APP_STATE } } as ExcalidrawInitialDataState;
  try {
    const io = await loadExcalidrawIo();
    const scene = (await io.parse(new Blob([storedJson], { type: 'application/json' }))) as ExcalidrawInitialDataState;
    return { ...scene, appState: { ...scene.appState, ...CANVAS_APP_STATE } };
  } catch {
    return { appState: { ...CANVAS_APP_STATE } } as ExcalidrawInitialDataState;
  }
}

export function DiagramWorkspace() {
  const store = useLocalCollection(diagramDocCollection);
  const [current, setCurrent] = useState<SavedDiagramDoc>(() => store.items[0] ?? createDiagramDoc());
  const [api, setApi] = useState<ExcalidrawImperativeAPI>();
  const [initialData] = useState(() => restoreInitialScene());
  const [savedAt, setSavedAt] = useState(() => store.items[0]?.updatedAt || sceneStore.load().savedAt);
  const [elementCount, setElementCount] = useState(0);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [busy, setBusy] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const visible = useMemo(() => searchDiagramDocs(store.items, query), [store.items, query]);
  const isSaved = store.items.some((item) => item.id === current.id);

  const currentScene = (): SceneData | undefined =>
    api ? { elements: api.getSceneElements(), appState: api.getAppState() as unknown as Record<string, unknown>, files: api.getFiles() } : undefined;

  /**
   * Excalidraw's chrome floats over the canvas, so a freshly imported scene is zoomed to sit
   * inside the gutters the panels occupy rather than under them.
   */
  const fitClearOfChrome = (elements: readonly unknown[]) => {
    try {
      (api as unknown as { scrollToContent?: (target: unknown, options?: unknown) => void })?.scrollToContent?.(
        elements,
        { fitToContent: true, viewportZoomFactor: CANVAS_FIT_ZOOM, animate: false },
      );
    } catch {
      // A version without the option simply keeps the imported viewport.
    }
  };

  const updateDoc = (patch: Partial<Pick<SavedDiagramDoc, 'title' | 'json'>>) => {
    const next = touch<SavedDiagramDoc>(currentRef.current, patch);
    setCurrent(next);
    if (!isBlankDiagramDoc(next)) {
      store.upsert(next);
    } else if (store.items.some((item) => item.id === next.id)) {
      store.remove(next.id);
    }
    sceneStore.save({ json: next.json, savedAt: next.updatedAt });
    return next;
  };

  const persist = async (scene: SceneData) => {
    try {
      const io = await loadExcalidrawIo();
      const json = hasDrawing(scene.elements) ? io.serialize(scene) : '';
      const next = updateDoc({ json });
      setSavedAt(next.updatedAt);
      setError('');
    } catch (reason) {
      setError(errorMessage(reason, 'The drawing could not be saved in this browser.'));
    }
  };

  const handleChange = (elements: readonly unknown[], appState: unknown, files: unknown) => {
    setElementCount(countDrawn(elements));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist({ elements, appState: appState as Record<string, unknown>, files: files as Record<string, unknown> });
    }, AUTOSAVE_DELAY_MS);
  };

  const loadDocScene = async (doc: SavedDiagramDoc) => {
    if (doc.json && doc.json.trim()) {
      try {
        const io = await loadExcalidrawIo();
        const scene = (await io.parse(new Blob([doc.json], { type: 'application/json' }))) as ExcalidrawInitialDataState;
        if (api) {
          api.updateScene({
            elements: scene.elements as never,
            appState: { ...scene.appState, ...CANVAS_APP_STATE } as never,
          });
          const files = Object.values(scene.files ?? {});
          if (files.length) api.addFiles(files as never);
          fitClearOfChrome(scene.elements as readonly unknown[]);
        }
        setElementCount(countDrawn((scene.elements as readonly unknown[]) ?? []));
        setSavedAt(doc.updatedAt);
      } catch {
        api?.resetScene();
        setElementCount(0);
        setSavedAt(0);
      }
    } else {
      api?.resetScene();
      setElementCount(0);
      setSavedAt(0);
    }
  };

  const openDoc = async (doc: SavedDiagramDoc) => {
    setCurrent(doc);
    setMessage('');
    setError('');
    await loadDocScene(doc);
  };

  const startNew = () => {
    const fresh = createDiagramDoc();
    setCurrent(fresh);
    api?.resetScene();
    setElementCount(0);
    setSavedAt(0);
    setMessage('Started a new diagram.');
    setError('');
  };

  const deleteCurrent = async () => {
    store.remove(current.id);
    sceneStore.clear();
    const remaining = store.items.filter((item) => item.id !== current.id);
    const next = remaining[0] ?? createDiagramDoc();
    setCurrent(next);
    await loadDocScene(next);
    setMessage('Diagram deleted.');
    setError('');
  };

  const clearAll = () => {
    store.clear();
    sceneStore.clear();
    api?.resetScene();
    setCurrent(createDiagramDoc());
    setElementCount(0);
    setSavedAt(0);
    setConfirmingClear(false);
    setMessage('All diagrams were removed from this browser.');
  };

  const exportAs = async (kind: 'png' | 'svg' | 'excalidraw') => {
    const scene = currentScene();
    if (!scene) return;
    setBusy(kind);
    try {
      const io = await loadExcalidrawIo();
      if (kind === 'png') downloadBlob(await io.toPng(scene, 2), diagramFilename('png'));
      else if (kind === 'svg') downloadText(await io.toSvg(scene), diagramFilename('svg'), 'image/svg+xml;charset=utf-8');
      else downloadText(io.serialize(scene), diagramFilename('excalidraw'), 'application/json');
      setError('');
    } catch (reason) {
      setError(errorMessage(reason, 'The diagram could not be exported.'));
    } finally {
      setBusy('');
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !api) return;
    try {
      assertFilesAllowed([file], IMPORT_POLICY);
      const io = await loadExcalidrawIo();
      const scene = await io.parse(file);
      api.updateScene({ elements: scene.elements as never, appState: scene.appState as never });
      const files = Object.values(scene.files);
      if (files.length) api.addFiles(files as never);
      fitClearOfChrome(scene.elements as readonly unknown[]);
      const nextTitle = current.title || file.name.replace(/\.[^.]+$/, '');
      const json = io.serialize(scene);
      const next = updateDoc({ title: nextTitle, json });
      setSavedAt(next.updatedAt);
      setElementCount(countDrawn((scene.elements as readonly unknown[]) ?? []));
      setMessage(`Imported ${file.name}.`);
      setError('');
    } catch (reason) {
      setError(
        reason instanceof FileInputError
          ? reason.message
          : `${file.name} is not a diagram FileKit can open. Use an .excalidraw file or a PNG/SVG exported with scene data.`,
      );
    }
  };

  const importJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const result = store.importJson(text);
      if (result) {
        const first = diagramDocCollection.list()[0];
        if (first) void openDoc(first);
        setMessage(`Imported ${result.imported} diagram${result.imported === 1 ? '' : 's'}.`);
        setError('');
      } else {
        setError(`${file.name} could not be imported.`);
      }
    } catch (reason) {
      setError(errorMessage(reason, `${file.name} could not be read.`));
    }
  };

  const hasElements = elementCount > 0;

  return (
    <div className="ed-grid diagram-workspace" data-panes="note">
      <aside className="ed-pane g side-list" data-pad="true" aria-label="Saved diagrams">
        <button className="button button-primary" type="button" onClick={startNew}>
          <FilePlus2 aria-hidden="true" size={16} /> New diagram
        </button>
        <label className="field-label" htmlFor="diagram-search">
          <span className="sr-only">Search diagrams</span>
          <span className="input-with-suffix">
            <input
              id="diagram-search"
              value={query}
              placeholder="Search diagrams"
              onChange={(event) => setQuery(event.target.value)}
            />
            <Search aria-hidden="true" size={15} />
          </span>
        </label>
        {visible.length ? (
          <ul>
            {visible.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  aria-current={doc.id === current.id ? 'true' : undefined}
                  onClick={() => void openDoc(doc)}
                >
                  <strong>{displayDiagramDocTitle(doc)}</strong>
                  <small>{formatWhen(doc.updatedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inline-note">
            {store.items.length ? 'No diagrams match that search.' : 'Drawings you create appear here and stay in this browser.'}
          </p>
        )}

        <div className="side-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={!store.items.length}
            onClick={() => downloadText(diagramDocCollection.exportJson(), 'filekit-diagrams.json', 'application/json')}
          >
            <FolderDown aria-hidden="true" size={15} /> Export diagrams
          </button>
          <label className="button button-secondary">
            <Upload aria-hidden="true" size={15} /> Import JSON
            <input
              className="sr-only"
              type="file"
              accept="application/json,.json"
              aria-label="Import diagrams JSON"
              onChange={(event) => void importJsonFile(event)}
            />
          </label>
          {confirmingClear ? (
            <span className="option-row">
              <span>Delete {store.items.length} diagrams?</span>
              <button className="button button-secondary" type="button" onClick={clearAll}>
                Yes, delete all
              </button>
              <button className="button button-secondary" type="button" onClick={() => setConfirmingClear(false)}>
                Keep them
              </button>
            </span>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              disabled={!store.items.length}
              onClick={() => setConfirmingClear(true)}
            >
              <Trash2 aria-hidden="true" size={15} /> Clear all
            </button>
          )}
        </div>
      </aside>

      <section className="ed-pane g diagram-main" aria-label="Diagram editor">
        <div className="ed-head">
          <input
            className="note-title"
            aria-label="Diagram title"
            value={current.title}
            placeholder="Untitled diagram"
            onChange={(event) => updateDoc({ title: event.target.value })}
          />
          {isSaved ? (
            <button className="button button-secondary" type="button" onClick={deleteCurrent}>
              <Trash2 aria-hidden="true" size={15} /> Delete diagram
            </button>
          ) : null}
          <span className="spacer" />
          <label className={`button button-secondary${api ? '' : ' is-disabled'}`}>
            <Upload aria-hidden="true" size={15} /> Import diagram
            <input
              className="sr-only"
              type="file"
              accept=".excalidraw,.json,.png,.svg,application/json,image/png,image/svg+xml"
              aria-label="Import a diagram file"
              disabled={!api}
              onChange={(event) => void importFile(event)}
            />
          </label>
          <button className="button button-secondary" type="button" disabled={!hasElements || Boolean(busy)} onClick={() => exportAs('png')}>
            <Download aria-hidden="true" size={15} /> {busy === 'png' ? 'Exporting…' : 'PNG'}
          </button>
          <button className="button button-secondary" type="button" disabled={!hasElements || Boolean(busy)} onClick={() => exportAs('svg')}>
            <Download aria-hidden="true" size={15} /> {busy === 'svg' ? 'Exporting…' : 'SVG'}
          </button>
          <button className="button button-secondary" type="button" disabled={!hasElements || Boolean(busy)} onClick={() => exportAs('excalidraw')}>
            <Download aria-hidden="true" size={15} /> {busy === 'excalidraw' ? 'Exporting…' : '.excalidraw'}
          </button>
        </div>

        <div className="ed-canvas diagram-canvas" data-testid="diagram-canvas">
          <Suspense
            fallback={
              <p className="progress-note diagram-loading" role="status">
                Loading the drawing canvas…
              </p>
            }
          >
            <ExcalidrawCanvas
              theme="light"
              langCode="en"
              initialData={initialData}
              excalidrawAPI={(instance) => setApi(instance)}
              onChange={handleChange}
              UIOptions={{
                canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, export: false },
              }}
            />
          </Suspense>

          <p className="gi diagram-status" role="status">
            <span>
              {elementCount} {elementCount === 1 ? 'element' : 'elements'}
            </span>
            <span aria-hidden="true">|</span>
            <span>{savedAt ? `Saved in this browser ${formatWhen(savedAt)}` : 'Not saved yet — start drawing'}</span>
            <span aria-hidden="true">|</span>
            <span>PNG</span>
            <span>SVG</span>
            <span>.excalidraw</span>
            {message ? <span className="diagram-message">{message}</span> : null}
          </p>
        </div>

        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

