import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { Download, FilePlus2, Trash2, Upload } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { downloadBlob, downloadText, formatWhen } from '../../lib/download';
import {
  countDrawn,
  createSceneStore,
  diagramFilename,
  EXCALIDRAW_ASSET_PATH,
  hasDrawing,
  IMPORT_POLICY,
  loadExcalidrawIo,
  type SceneData,
} from '../../lib/diagram-scene';
import { errorMessage } from '../../lib/errors';
import { assertFilesAllowed, FileInputError } from '../../lib/files';

const AUTOSAVE_DELAY_MS = 500;
const sceneStore = createSceneStore();

// The engine (and its stylesheet) only load when someone opens this tool.
const ExcalidrawCanvas = lazy(async () => {
  window.EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_PATH;
  const [module] = await Promise.all([import('@excalidraw/excalidraw'), import('@excalidraw/excalidraw/index.css')]);
  return { default: module.Excalidraw };
});

async function restoreInitialScene(): Promise<ExcalidrawInitialDataState | null> {
  const stored = sceneStore.load();
  if (!stored.json) return null;
  try {
    const io = await loadExcalidrawIo();
    const scene = await io.parse(new Blob([stored.json], { type: 'application/json' }));
    return scene as ExcalidrawInitialDataState;
  } catch {
    return null;
  }
}

export function DiagramWorkspace() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI>();
  const [initialData] = useState(() => restoreInitialScene());
  const [savedAt, setSavedAt] = useState(() => sceneStore.load().savedAt);
  const [elementCount, setElementCount] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [busy, setBusy] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const currentScene = (): SceneData | undefined =>
    api ? { elements: api.getSceneElements(), appState: api.getAppState() as unknown as Record<string, unknown>, files: api.getFiles() } : undefined;

  const persist = async (scene: SceneData) => {
    try {
      const io = await loadExcalidrawIo();
      const savedNow = Date.now();
      sceneStore.save({ json: hasDrawing(scene.elements) ? io.serialize(scene) : '', savedAt: savedNow });
      setSavedAt(savedNow);
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
      api.scrollToContent();
      setMessage(`Imported ${file.name}.`);
      setError('');
      void persist(scene);
    } catch (reason) {
      setError(
        reason instanceof FileInputError
          ? reason.message
          : `${file.name} is not a diagram FileKit can open. Use an .excalidraw file or a PNG/SVG exported with scene data.`,
      );
    }
  };

  const startNew = () => {
    api?.resetScene();
    sceneStore.clear();
    setSavedAt(0);
    setElementCount(0);
    setConfirmingNew(false);
    setMessage('Started a new drawing.');
  };

  const hasElements = elementCount > 0;

  return (
    <div className="diagram-workspace">
      <div className="editor-toolbar">
        {confirmingNew ? (
          <span className="option-row">
            <span>Discard this drawing?</span>
            <button className="button button-secondary" type="button" onClick={startNew}>
              Yes, start new
            </button>
            <button className="button button-secondary" type="button" onClick={() => setConfirmingNew(false)}>
              Keep it
            </button>
          </span>
        ) : (
          <button className="button button-secondary" type="button" disabled={!api} onClick={() => (hasElements ? setConfirmingNew(true) : startNew())}>
            <FilePlus2 aria-hidden="true" size={15} /> New
          </button>
        )}
        <label className={`button button-secondary${api ? '' : ' is-disabled'}`}>
          <Upload aria-hidden="true" size={15} /> Import
          <input
            className="sr-only"
            type="file"
            accept=".excalidraw,.json,.png,.svg,application/json,image/png,image/svg+xml"
            aria-label="Import a diagram file"
            disabled={!api}
            onChange={(event) => void importFile(event)}
          />
        </label>
        <span className="spacer" />
        <button className="button button-secondary" type="button" disabled={!hasElements || Boolean(busy)} onClick={() => exportAs('png')}>
          <Download aria-hidden="true" size={15} /> {busy === 'png' ? 'Exporting…' : 'PNG'}
        </button>
        <button className="button button-secondary" type="button" disabled={!hasElements || Boolean(busy)} onClick={() => exportAs('svg')}>
          <Download aria-hidden="true" size={15} /> {busy === 'svg' ? 'Exporting…' : 'SVG'}
        </button>
        <button className="button button-secondary" type="button" disabled={!hasElements || Boolean(busy)} onClick={() => exportAs('excalidraw')}>
          <Download aria-hidden="true" size={15} /> {busy === 'excalidraw' ? 'Exporting…' : '.excalidraw'}
        </button>
        <button className="button button-secondary" type="button" disabled={!savedAt} onClick={() => { sceneStore.clear(); setSavedAt(0); setMessage('Saved copy removed from this browser.'); }}>
          <Trash2 aria-hidden="true" size={15} /> Forget saved copy
        </button>
      </div>

      <div className="diagram-canvas" data-testid="diagram-canvas">
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
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="status-line" role="status">
        <span>
          {elementCount} {elementCount === 1 ? 'element' : 'elements'}
        </span>
        <span className={savedAt ? 'pill-ok' : ''}>{savedAt ? `Saved in this browser ${formatWhen(savedAt)}` : 'Not saved yet — start drawing'}</span>
        {message ? <span>{message}</span> : null}
      </p>
    </div>
  );
}
