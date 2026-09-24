import { Check, Copy, Download, FilePlus2, FolderDown, Save, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useLocalCollection } from '../../hooks/useLocalCollection';
import { copyText, downloadBlob, downloadText, formatWhen } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { touch } from '../../lib/local-store';
import {
  createGraphCollection,
  createGraphDraftStore,
  createSavedGraph,
  fileStem,
  markdownFence,
  suggestGraphName,
  type SavedGraph,
} from '../../lib/graphviz-diagrams';
import {
  graphToPdf,
  isLayoutEngine,
  layoutEngines,
  renderGraphviz,
  renderGraphvizText,
  textFormats,
  type LayoutEngine,
  type RenderedGraph,
  type TextFormat,
} from '../../lib/graphviz-render';
import { defaultGraphvizSample, graphvizSamples } from '../../lib/graphviz-samples';
import { rasterizeSvg, svgBlob } from '../../lib/mermaid-render';
import { GraphvizCodeEditor } from './GraphvizCodeEditor';

interface Preview extends RenderedGraph {
  url: string;
  request: string;
}

type FileFormat = 'source' | TextFormat;

const saved = createGraphCollection();
const draftStore = createGraphDraftStore();

/** Engine plus debounced code: the pair a finished render answers. */
const requestKey = (engine: LayoutEngine, code: string) => `${engine}\n${code}`;

/** The `layout=` a graph sets for itself, which Graphviz applies over the picked engine. */
function sourceLayout(code: string): string | undefined {
  return /\blayout\s*=\s*"?([A-Za-z0-9]+)/.exec(code)?.[1];
}

export function GraphvizWorkspace() {
  const store = useLocalCollection(saved);
  const [initial] = useState(() => draftStore.load());
  const [code, setCode] = useState(initial.code);
  const [engine, setEngine] = useState<LayoutEngine>(initial.engine);
  const debounced = useDebouncedValue(code, 400);
  const [preview, setPreview] = useState<Preview>();
  const [settledFor, setSettledFor] = useState<string>();
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [currentId, setCurrentId] = useState<string>();
  const [saveName, setSaveName] = useState<string>();
  const [actualSize, setActualSize] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<'code' | 'markdown' | ''>('');
  const [exporting, setExporting] = useState<'' | 'png' | 'pdf' | 'file'>('');
  const [fileFormat, setFileFormat] = useState<FileFormat>('source');
  const [query, setQuery] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const request = requestKey(engine, debounced);

  useEffect(() => {
    let live = true;
    const key = requestKey(engine, debounced);
    renderGraphviz(debounced, engine)
      .then((graph) => {
        if (!live) return;
        setPreview({ ...graph, url: URL.createObjectURL(svgBlob(graph.svg)), request: key });
        setError('');
        setSettledFor(key);
      })
      .catch((reason: Error) => {
        if (!live) return;
        setError(reason.message);
        setSettledFor(key);
      });
    return () => {
      live = false;
    };
  }, [debounced, engine]);

  const url = preview?.url;
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const isRendering = settledFor !== request || debounced !== code;
  const current = currentId ? store.items.find((item) => item.id === currentId) : undefined;
  const overriddenBy = sourceLayout(code);
  const stem = fileStem(current?.name ?? suggestGraphName(code));

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return store.items;
    return store.items.filter((item) => item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle));
  }, [store.items, query]);

  const saveDraft = (nextCode: string, nextEngine: LayoutEngine) => {
    try {
      draftStore.save({ code: nextCode, engine: nextEngine });
    } catch {
      // The draft autosave is a convenience; rendering continues regardless.
    }
  };

  const changeCode = (next: string, nextEngine: LayoutEngine = engine) => {
    setCode(next);
    setEngine(nextEngine);
    setMessage('');
    setExportError('');
    saveDraft(next, nextEngine);
  };

  const load = (graph: SavedGraph) => {
    changeCode(graph.code, graph.engine);
    setCurrentId(graph.id);
    setSaveName(undefined);
  };

  const startNew = () => {
    changeCode(defaultGraphvizSample.code, defaultGraphvizSample.engine);
    setCurrentId(undefined);
    setSaveName(undefined);
    setMessage('Started a new graph.');
  };

  const commitSave = (typedName?: string) => {
    const name = (typedName ?? saveName ?? '').trim() || suggestGraphName(code);
    const record = current ? touch<SavedGraph>(current, { name, code, engine }) : createSavedGraph(name, code, engine);
    if (store.upsert(record)) {
      setCurrentId(record.id);
      setSaveName(undefined);
      setMessage(current ? 'Saved graph updated.' : 'Graph saved in this browser.');
    }
  };

  const deleteCurrent = (graph: SavedGraph) => {
    store.remove(graph.id);
    setCurrentId(undefined);
    setMessage('Saved graph deleted.');
  };

  const clearAll = () => {
    store.clear();
    setCurrentId(undefined);
    setConfirmingClear(false);
    setMessage('All graphs were removed from this browser.');
  };

  const flash = (kind: 'code' | 'markdown') => {
    setCopied(kind);
    setTimeout(() => setCopied(''), 2000);
  };

  const exportImage = async (graph: Preview, kind: 'png' | 'pdf') => {
    setExporting(kind);
    setExportError('');
    try {
      downloadBlob(kind === 'png' ? await rasterizeSvg(graph, 2) : await graphToPdf(graph), `${stem}.${kind}`);
    } catch (reason) {
      setExportError(errorMessage(reason, `The ${kind.toUpperCase()} could not be created.`));
    } finally {
      setExporting('');
    }
  };

  const exportFile = async () => {
    setExportError('');
    if (fileFormat === 'source') {
      downloadText(code, `${stem}.gv`, 'text/vnd.graphviz;charset=utf-8');
      return;
    }
    const format = textFormats.find((candidate) => candidate.id === fileFormat)!;
    setExporting('file');
    try {
      const output = await renderGraphvizText(code, format.id, engine);
      downloadText(output, `${stem}.${format.extension}`, `${format.mime};charset=utf-8`);
    } catch (reason) {
      setExportError(errorMessage(reason, `The ${format.label} file could not be created.`));
    } finally {
      setExporting('');
    }
  };

  const importCollection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = store.importJson(await file.text());
    if (result) setMessage(`Imported ${result.imported} ${result.imported === 1 ? 'graph' : 'graphs'}; skipped ${result.skipped}.`);
  };

  const importGraphFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      changeCode(text);
      const name = file.name.replace(/\.[^.]+$/, '').trim() || suggestGraphName(text);
      const record = createSavedGraph(name, text, engine);
      if (store.upsert(record)) {
        setCurrentId(record.id);
        setSaveName(undefined);
      }
      setMessage(`Imported ${file.name}.`);
    } catch (reason) {
      setExportError(errorMessage(reason, `${file.name} could not be read.`));
    }
  };

  return (
    <div className="ed-grid mermaid graphviz" data-panes="note">
      <aside className="ed-pane g side-list" data-pad="true" aria-label="Saved graphs">
        <button className="button button-primary" type="button" onClick={startNew}>
          <FilePlus2 aria-hidden="true" size={16} /> New graph
        </button>
        <label className="field-label" htmlFor="graphviz-search">
          <span className="sr-only">Search graphs</span>
          <span className="input-with-suffix">
            <input id="graphviz-search" value={query} placeholder="Search graphs" onChange={(event) => setQuery(event.target.value)} />
            <Search aria-hidden="true" size={15} />
          </span>
        </label>
        {visible.length ? (
          <ul>
            {visible.map((graph) => (
              <li key={graph.id}>
                <button type="button" aria-current={graph.id === currentId ? 'true' : undefined} onClick={() => load(graph)}>
                  <strong>{graph.name}</strong>
                  <small>
                    {graph.engine} · {formatWhen(graph.updatedAt)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inline-note">{store.items.length ? 'No graphs match that search.' : 'Graphs you save appear here and stay in this browser.'}</p>
        )}

        <div className="side-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={!store.items.length}
            onClick={() => downloadText(saved.exportJson(), 'filekit-graphviz-graphs.json', 'application/json')}
          >
            <FolderDown aria-hidden="true" size={15} /> Export all
          </button>
          <label className="button button-secondary">
            <Upload aria-hidden="true" size={15} /> Import JSON
            <input
              className="sr-only"
              type="file"
              accept="application/json,.json"
              aria-label="Import graphs JSON"
              onChange={(event) => void importCollection(event)}
            />
          </label>
          {confirmingClear ? (
            <span className="option-row">
              <span>Delete {store.items.length} graphs?</span>
              <button className="button button-secondary" type="button" onClick={clearAll}>
                Yes, delete all
              </button>
              <button className="button button-secondary" type="button" onClick={() => setConfirmingClear(false)}>
                Keep them
              </button>
            </span>
          ) : (
            <button className="button button-secondary" type="button" disabled={!store.items.length} onClick={() => setConfirmingClear(true)}>
              <Trash2 aria-hidden="true" size={15} /> Clear all
            </button>
          )}
        </div>
      </aside>

      <section className="ed-pane g mermaid-main" aria-label="Graphviz editor">
        <div className="ed-head">
          {saveName === undefined ? (
            <button
              className="button button-primary"
              type="button"
              disabled={!code.trim()}
              onClick={() => setSaveName(current?.name ?? suggestGraphName(code))}
            >
              <Save aria-hidden="true" size={15} /> {current ? 'Update saved' : 'Save graph'}
            </button>
          ) : (
            <form
              className="option-row"
              onSubmit={(event) => {
                event.preventDefault();
                commitSave(saveName);
              }}
            >
              <input className="note-title" aria-label="Graph name" value={saveName} autoFocus onChange={(event) => setSaveName(event.target.value)} />
              <button className="button button-primary" type="submit">
                Save
              </button>
              <button className="button button-secondary" type="button" onClick={() => setSaveName(undefined)}>
                Cancel
              </button>
            </form>
          )}
          {current ? (
            <button className="button button-secondary" type="button" onClick={() => deleteCurrent(current)}>
              <Trash2 aria-hidden="true" size={15} /> Delete saved
            </button>
          ) : null}
          <label className="field-label mermaid-samples" htmlFor="graphviz-sample">
            <span className="sr-only">Start from a sample</span>
            <select
              id="graphviz-sample"
              aria-label="Start from a sample"
              value=""
              onChange={(event) => {
                const sample = graphvizSamples.find((candidate) => candidate.id === event.target.value);
                if (sample) {
                  changeCode(sample.code, sample.engine);
                  setCurrentId(undefined);
                }
              }}
            >
              <option value="">Samples…</option>
              {graphvizSamples.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label mermaid-samples" htmlFor="graphviz-engine">
            <span className="sr-only">Layout engine</span>
            <select
              id="graphviz-engine"
              aria-label="Layout engine"
              value={engine}
              onChange={(event) => {
                if (isLayoutEngine(event.target.value)) changeCode(code, event.target.value);
              }}
            >
              {layoutEngines.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} — {option.note}
                </option>
              ))}
            </select>
          </label>
          <span className="spacer" />
          <label className="button button-secondary">
            <Upload aria-hidden="true" size={15} /> Import graph
            <input
              className="sr-only"
              type="file"
              accept=".gv,.dot,.txt,text/vnd.graphviz,text/plain"
              aria-label="Import a Graphviz file"
              onChange={(event) => void importGraphFile(event)}
            />
          </label>
          <button className="button button-secondary" type="button" onClick={async () => (await copyText(code)) && flash('code')}>
            {copied === 'code' ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
            {copied === 'code' ? 'Copied' : 'Copy code'}
          </button>
          <button className="button button-secondary" type="button" onClick={async () => (await copyText(markdownFence(code))) && flash('markdown')}>
            {copied === 'markdown' ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
            {copied === 'markdown' ? 'Copied' : 'Copy as Markdown'}
          </button>
          <span className="ed-status" role="status">
            {isRendering ? (
              <span>Rendering…</span>
            ) : error ? (
              <span className="ed-pill gi">Syntax error</span>
            ) : (
              <span className="ed-pill gi">Graph up to date</span>
            )}
            {overriddenBy && overriddenBy !== engine ? <span className="ed-note">Source sets layout={overriddenBy}</span> : null}
            {current ? <span className="ed-note">Editing “{current.name}”</span> : null}
            {message ? <span className="ed-pill gi">{message}</span> : null}
          </span>
        </div>

        <div className="ed-grid" data-panes="split">
          <div className="mermaid-editor-pane">
            <div className="note-pane-head">
              <label className="panel-label" htmlFor="graphviz-code">
                DOT source (editable)
              </label>
              <span className="ed-pill gi">Syntax highlighted</span>
            </div>
            <GraphvizCodeEditor id="graphviz-code" value={code} onChange={(next) => changeCode(next)} />
            <form
              className="option-row graphviz-file"
              onSubmit={(event) => {
                event.preventDefault();
                void exportFile();
              }}
            >
              <label className="field-label mermaid-samples" htmlFor="graphviz-format">
                <span className="sr-only">File format</span>
                <select
                  id="graphviz-format"
                  aria-label="File format"
                  value={fileFormat}
                  onChange={(event) => setFileFormat(event.target.value as FileFormat)}
                >
                  <option value="source">DOT source as written (.gv)</option>
                  {textFormats.map((format) => (
                    <option key={format.id} value={format.id}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button button-secondary" type="submit" disabled={!code.trim() || exporting === 'file'}>
                <Download aria-hidden="true" size={15} /> {exporting === 'file' ? 'Creating…' : 'Create file'}
              </button>
            </form>
          </div>

          <section className="ed-pane g mermaid-stage" aria-label="Graph preview">
            <div className={`mermaid-preview scroll${preview ? '' : ' is-empty'}`} data-actual={actualSize ? 'true' : 'false'}>
              {preview ? (
                <img src={preview.url} width={preview.width} height={preview.height} alt="Rendered Graphviz graph" />
              ) : (
                <p>{error || 'Loading Graphviz…'}</p>
              )}
            </div>
            <div className="ed-float g" data-at="top-right">
              <label className="mermaid-fit">
                <input type="checkbox" checked={actualSize} onChange={(event) => setActualSize(event.target.checked)} />
                Actual size
              </label>
              <button type="button" disabled={!preview} onClick={() => preview && downloadBlob(svgBlob(preview.svg), `${stem}.svg`)}>
                SVG
              </button>
              <button type="button" disabled={!preview || exporting === 'png'} onClick={() => preview && exportImage(preview, 'png')}>
                {exporting === 'png' ? 'Exporting…' : 'PNG'}
              </button>
              <button type="button" disabled={!preview || exporting === 'pdf'} onClick={() => preview && exportImage(preview, 'pdf')}>
                {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
              </button>
            </div>
          </section>
        </div>

        <div className="ed-foot">
          <span className="ed-pill-dot blink" aria-hidden="true" />
          Live Graphviz render · saved in this browser
        </div>

        {error && preview ? (
          <p className="field-error" role="alert">
            {error}
            {preview.request !== request ? ' Showing the last graph that rendered.' : ''}
          </p>
        ) : null}
        {!error && !isRendering && preview?.warnings.length ? (
          <p className="inline-note graphviz-warnings">Graphviz notes: {preview.warnings.join(' · ')}</p>
        ) : null}
        {exportError ? (
          <p className="field-error" role="alert">
            {exportError}
          </p>
        ) : null}
        {store.error ? (
          <p className="field-error" role="alert">
            {store.error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
