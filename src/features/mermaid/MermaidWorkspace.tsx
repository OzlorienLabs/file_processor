import { Check, Copy, FolderDown, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useLocalCollection } from '../../hooks/useLocalCollection';
import { copyText, downloadBlob, downloadText, formatWhen } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { touch } from '../../lib/local-store';
import {
  createDiagramCollection,
  createDiagramDraftStore,
  createSavedDiagram,
  markdownFence,
  suggestDiagramName,
  type SavedDiagram,
} from '../../lib/mermaid-diagrams';
import { rasterizeSvg, renderMermaid, svgBlob, type RenderedDiagram } from '../../lib/mermaid-render';
import { mermaidSamples } from '../../lib/mermaid-samples';

interface Preview extends RenderedDiagram {
  url: string;
  code: string;
}

const saved = createDiagramCollection();
const draftStore = createDiagramDraftStore();

export function MermaidWorkspace() {
  const store = useLocalCollection(saved);
  const [code, setCode] = useState(() => draftStore.load().code);
  const debounced = useDebouncedValue(code, 400);
  const [preview, setPreview] = useState<Preview>();
  const [settledFor, setSettledFor] = useState<string>();
  const [error, setError] = useState('');
  const [currentId, setCurrentId] = useState<string>();
  const [saveName, setSaveName] = useState<string>();
  const [actualSize, setActualSize] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<'code' | 'markdown' | ''>('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let live = true;
    renderMermaid(debounced)
      .then((diagram) => {
        if (!live) return;
        setPreview({ ...diagram, url: URL.createObjectURL(svgBlob(diagram.svg)), code: debounced });
        setError('');
      })
      .catch((reason: Error) => {
        if (live) setError(reason.message);
      })
      .finally(() => {
        if (live) setSettledFor(debounced);
      });
    return () => {
      live = false;
    };
  }, [debounced]);

  const url = preview?.url;
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const isRendering = settledFor !== debounced || debounced !== code;
  const current = currentId ? store.items.find((item) => item.id === currentId) : undefined;

  const changeCode = (next: string) => {
    setCode(next);
    setMessage('');
    try {
      draftStore.save({ code: next });
    } catch {
      // The draft autosave is a convenience; rendering continues regardless.
    }
  };

  const load = (diagram: SavedDiagram) => {
    changeCode(diagram.code);
    setCurrentId(diagram.id);
    setSaveName(undefined);
  };

  const commitSave = (typedName: string) => {
    const name = typedName.trim() || suggestDiagramName(code);
    const record = current ? touch<SavedDiagram>(current, { name, code }) : createSavedDiagram(name, code);
    if (store.upsert(record)) {
      setCurrentId(record.id);
      setSaveName(undefined);
      setMessage(current ? 'Saved diagram updated.' : 'Diagram saved in this browser.');
    }
  };

  const deleteCurrent = (diagram: SavedDiagram) => {
    store.remove(diagram.id);
    setCurrentId(undefined);
    setMessage('Saved diagram deleted.');
  };

  const flash = (kind: 'code' | 'markdown') => {
    setCopied(kind);
    setTimeout(() => setCopied(''), 2000);
  };

  const exportPng = async (diagram: Preview) => {
    setExporting(true);
    try {
      downloadBlob(await rasterizeSvg(diagram, 2), `${suggestDiagramName(code).toLowerCase().replace(/\s+/g, '-')}.png`);
    } catch (reason) {
      setError(errorMessage(reason, 'The PNG could not be created.'));
    } finally {
      setExporting(false);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = store.importJson(await file.text());
    if (result) setMessage(`Imported ${result.imported} ${result.imported === 1 ? 'diagram' : 'diagrams'}; skipped ${result.skipped}.`);
  };

  return (
    <div className="ed mermaid">
      <div className="ed-bar g">
        {saveName === undefined ? (
          <button
            className="button button-primary"
            type="button"
            disabled={!code.trim()}
            onClick={() => setSaveName(current?.name ?? suggestDiagramName(code))}
          >
            <Save aria-hidden="true" size={15} /> {current ? 'Update saved' : 'Save diagram'}
          </button>
        ) : (
          <form
            className="option-row"
            onSubmit={(event) => {
              event.preventDefault();
              commitSave(saveName);
            }}
          >
            <input
              className="note-title"
              aria-label="Diagram name"
              value={saveName}
              autoFocus
              onChange={(event) => setSaveName(event.target.value)}
            />
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
        <span className="spacer" />
        <button className="button button-secondary" type="button" onClick={async () => (await copyText(code)) && flash('code')}>
          {copied === 'code' ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
          {copied === 'code' ? 'Copied' : 'Copy code'}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={async () => (await copyText(markdownFence(code))) && flash('markdown')}
        >
          {copied === 'markdown' ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
          {copied === 'markdown' ? 'Copied' : 'Copy as Markdown'}
        </button>
        <span className="ed-status" role="status">
          {isRendering ? (
            <span>Rendering…</span>
          ) : error ? (
            <span className="ed-pill gi">Syntax error</span>
          ) : (
            <span className="ed-pill gi">Diagram up to date</span>
          )}
          {current ? <span className="ed-note">Editing “{current.name}”</span> : null}
          {message ? <span className="ed-pill gi">{message}</span> : null}
        </span>
      </div>

      <div className="ed-grid" data-panes="side">
        <section className="ed-pane g" aria-label="Mermaid editor">
          <div className="ed-head">
            <p className="panel-label">Mermaid source</p>
            <label className="field-label mermaid-samples" htmlFor="mermaid-sample">
              <span className="sr-only">Start from a sample</span>
              <select
                id="mermaid-sample"
                aria-label="Start from a sample"
                value=""
                onChange={(event) => {
                  const sample = mermaidSamples.find((candidate) => candidate.id === event.target.value);
                  if (sample) {
                    changeCode(sample.code);
                    setCurrentId(undefined);
                  }
                }}
              >
                <option value="">Samples…</option>
                {mermaidSamples.map((sample) => (
                  <option key={sample.id} value={sample.id}>
                    {sample.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="sr-only" htmlFor="mermaid-code">
            Mermaid code
          </label>
          <textarea
            className="ed-code scroll"
            id="mermaid-code"
            value={code}
            spellCheck={false}
            placeholder="flowchart TD&#10;  A --> B"
            onChange={(event) => changeCode(event.target.value)}
          />

          <aside className="mermaid-saved scroll" aria-label="Saved diagrams">
            {store.items.length ? (
              <ul>
                {store.items.map((diagram) => (
                  <li key={diagram.id}>
                    <button
                      type="button"
                      aria-current={diagram.id === currentId ? 'true' : undefined}
                      onClick={() => load(diagram)}
                    >
                      <strong>{diagram.name}</strong>
                      <small>{formatWhen(diagram.updatedAt)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-note">Diagrams you save appear here and stay in this browser.</p>
            )}
            <div className="side-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={!store.items.length}
                onClick={() => downloadText(saved.exportJson(), 'filekit-mermaid-diagrams.json', 'application/json')}
              >
                <FolderDown aria-hidden="true" size={15} /> Export all
              </button>
              <label className="button button-secondary">
                <Upload aria-hidden="true" size={15} /> Import JSON
                <input
                  className="sr-only"
                  type="file"
                  accept="application/json,.json"
                  aria-label="Import diagrams JSON"
                  onChange={(event) => void importFile(event)}
                />
              </label>
            </div>
          </aside>

          <div className="ed-foot">
            <span className="ed-pill-dot blink" aria-hidden="true" />
            Live render · saved in this browser
          </div>
        </section>

        <section className="ed-pane g mermaid-stage" aria-label="Diagram preview">
          <div
            className={`mermaid-preview scroll${preview ? '' : ' is-empty'}`}
            data-actual={actualSize ? 'true' : 'false'}
          >
            {preview ? (
              <img src={preview.url} width={preview.width} height={preview.height} alt="Rendered Mermaid diagram" />
            ) : (
              <p>{error || 'Rendering the diagram…'}</p>
            )}
          </div>
          <div className="ed-float g" data-at="top-right">
            <label className="mermaid-fit">
              <input
                type="checkbox"
                checked={actualSize}
                onChange={(event) => setActualSize(event.target.checked)}
              />
              Actual size
            </label>
            <button
              type="button"
              disabled={!preview}
              onClick={() =>
                preview &&
                downloadBlob(svgBlob(preview.svg), `${suggestDiagramName(code).toLowerCase().replace(/\s+/g, '-')}.svg`)
              }
            >
              SVG
            </button>
            <button type="button" disabled={!preview || exporting} onClick={() => preview && exportPng(preview)}>
              {exporting ? 'Exporting…' : 'PNG'}
            </button>
          </div>
        </section>
      </div>

      {error && preview ? (
        <p className="field-error" role="alert">
          {error}
          {preview.code !== debounced ? ' Showing the last diagram that rendered.' : ''}
        </p>
      ) : null}
      {store.error ? (
        <p className="field-error" role="alert">
          {store.error}
        </p>
      ) : null}
    </div>
  );
}
