import {
  Check,
  Copy,
  Download,
  Eraser,
  FilePlus2,
  FolderDown,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';

import { MarkdownPreview } from '../../components/MarkdownPreview/MarkdownPreview';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useLocalCollection } from '../../hooks/useLocalCollection';
import { copyText, downloadBlob, downloadText, formatWhen } from '../../lib/download';
import { touch } from '../../lib/local-store';
import {
  applyMarkdownFormat,
  countText,
  markdownToHtml,
  markdownToPdf,
  sampleMarkdown,
  wrapHtmlDocument,
  type MarkdownFormat,
} from '../../lib/markdown';
import {
  createInitialMarkdownDoc,
  createMarkdownCollection,
  createMarkdownDoc,
  displayMarkdownTitle,
  exportMarkdownDocsZip,
  isBlankMarkdownDoc,
  markdownDocFilename,
  searchMarkdownDocs,
  type MarkdownDoc,
  type MarkdownViewMode,
} from '../../lib/markdown-docs';

const formats: { id: MarkdownFormat; label: string }[] = [
  { id: 'bold', label: 'Bold' },
  { id: 'italic', label: 'Italic' },
  { id: 'heading', label: 'Heading' },
  { id: 'link', label: 'Link' },
  { id: 'code', label: 'Code' },
];

const docsCollection = createMarkdownCollection();

export function MarkdownWorkspace() {
  const store = useLocalCollection(docsCollection);
  const [current, setCurrent] = useState<MarkdownDoc>(() => store.items[0] ?? createInitialMarkdownDoc());
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<'markdown' | 'html' | ''>('');
  const [message, setMessage] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  const visible = useMemo(() => searchMarkdownDocs(store.items, query), [store.items, query]);
  const preview = useDebouncedValue(current.markdown, 150);
  const stats = countText(current.markdown);
  const isSaved = store.items.some((item) => item.id === current.id);

  const change = (patch: Partial<Pick<MarkdownDoc, 'title' | 'markdown' | 'view'>>) => {
    const next = touch<MarkdownDoc>(current, patch);
    setCurrent(next);
    if (!isBlankMarkdownDoc(next)) {
      store.upsert(next);
    } else if (isSaved) {
      store.remove(next.id);
    }
  };

  const open = (doc: MarkdownDoc) => {
    setCurrent(doc);
    setMessage('');
  };

  const startNew = () => {
    const fresh = createMarkdownDoc('', '', current.view);
    setCurrent(fresh);
    setMessage('');
  };

  const deleteCurrent = () => {
    store.remove(current.id);
    const remaining = store.items.filter((item) => item.id !== current.id);
    setCurrent(remaining[0] ?? createMarkdownDoc('', '', current.view));
    setMessage('Document deleted.');
  };

  const clearAll = () => {
    store.clear();
    setCurrent(createMarkdownDoc('', '', current.view));
    setConfirmingClear(false);
    setMessage('All documents were removed from this browser.');
  };

  const format = (kind: MarkdownFormat) => {
    const field = editor.current;
    if (!field) return;
    const next = applyMarkdownFormat(current.markdown, field.selectionStart, field.selectionEnd, kind);
    change({ markdown: next.text });
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };

  const flashCopied = (kind: 'markdown' | 'html') => {
    setCopied(kind);
    setTimeout(() => setCopied(''), 2000);
  };

  const copyMarkdown = async () => {
    if (await copyText(current.markdown)) flashCopied('markdown');
  };

  const copyHtml = async () => {
    if (await copyText(await markdownToHtml(current.markdown))) flashCopied('html');
  };

  const docFilename = (ext: string) => (current.title.trim() ? markdownDocFilename(current, ext) : `document.${ext}`);

  const downloadHtml = async () => {
    const html = wrapHtmlDocument(await markdownToHtml(current.markdown), displayMarkdownTitle(current));
    downloadText(html, docFilename('html'), 'text/html;charset=utf-8');
  };

  const downloadPdf = async () => {
    const bytes = await markdownToPdf(current.markdown);
    downloadBlob(new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }), docFilename('pdf'));
  };

  const exportAll = async () => {
    downloadBlob(await exportMarkdownDocsZip(store.items, docsCollection.exportJson()), 'filekit-markdown-docs.zip');
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = store.importJson(await file.text());
    if (result) {
      setMessage(`Imported ${result.imported} ${result.imported === 1 ? 'document' : 'documents'}; skipped ${result.skipped}.`);
    }
  };

  return (
    <div className="ed-grid markdown-workspace" data-panes="note">
      <aside className="ed-pane g side-list" data-pad="true" aria-label="Saved documents">
        <button className="button button-primary" type="button" onClick={startNew}>
          <FilePlus2 aria-hidden="true" size={16} /> New document
        </button>
        <label className="field-label" htmlFor="markdown-search">
          <span className="sr-only">Search documents</span>
          <span className="input-with-suffix">
            <input
              id="markdown-search"
              value={query}
              placeholder="Search documents"
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
                  onClick={() => open(doc)}
                >
                  <strong>{displayMarkdownTitle(doc)}</strong>
                  <small>{formatWhen(doc.updatedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inline-note">
            {store.items.length ? 'No documents match that search.' : 'Documents you write appear here and stay in this browser.'}
          </p>
        )}

        <div className="side-actions">
          <button className="button button-secondary" type="button" disabled={!store.items.length} onClick={exportAll}>
            <FolderDown aria-hidden="true" size={15} /> Export all (.zip)
          </button>
          <label className="button button-secondary">
            <Upload aria-hidden="true" size={15} /> Import JSON
            <input
              className="sr-only"
              type="file"
              accept="application/json,.json"
              aria-label="Import markdown JSON"
              onChange={(event) => void importFile(event)}
            />
          </label>
          {confirmingClear ? (
            <span className="option-row">
              <span>Delete {store.items.length} documents?</span>
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

      <section className="ed-pane g markdown-main" aria-label="Markdown editor">
        <div className="ed-head">
          <input
            className="note-title"
            aria-label="Document title"
            value={current.title}
            placeholder="Untitled document"
            onChange={(event) => change({ title: event.target.value })}
          />
          {formats.map((entry) => (
            <button
              className="button button-secondary"
              type="button"
              key={entry.id}
              onClick={() => format(entry.id)}
            >
              {entry.label}
            </button>
          ))}
          <div className="seg gi" role="group" aria-label="Layout">
            {(['editor', 'split', 'preview'] as MarkdownViewMode[]).map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={current.view === view}
                onClick={() => change({ view })}
              >
                {view === 'editor' ? 'Editor' : view === 'split' ? 'Split' : 'Preview'}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <button
            className="button button-secondary"
            type="button"
            onClick={() => change({ markdown: sampleMarkdown })}
          >
            <RotateCcw aria-hidden="true" size={15} /> Sample
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={!current.markdown}
            onClick={() => change({ markdown: '' })}
          >
            <Eraser aria-hidden="true" size={15} /> Clear
          </button>
        </div>

        <div className="ed-grid" data-panes="split" data-view={current.view}>
          <section className="ed-pane g">
            <div className="ed-head">
              <label className="panel-label" htmlFor="markdown-source">
                Markdown
              </label>
            </div>
            <textarea
              className="ed-code scroll"
              id="markdown-source"
              ref={editor}
              value={current.markdown}
              spellCheck
              placeholder="# Start writing Markdown"
              onChange={(event) => change({ markdown: event.target.value })}
            />
          </section>
          <section className="ed-pane g">
            <div className="ed-head">
              <h3 className="panel-label">Preview</h3>
            </div>
            <div className="ed-prose scroll">
              {preview.trim() ? (
                <MarkdownPreview markdown={preview} />
              ) : (
                <p className="inline-note">Start typing Markdown on the left to see the rendered preview.</p>
              )}
            </div>
          </section>
        </div>

        <div className="ed-foot">
          <span>{isSaved ? 'Saved locally' : isBlankMarkdownDoc(current) ? 'Start typing to save' : 'Not saved'}</span>
          <span className="spacer" />
          <button className="button button-secondary" type="button" onClick={copyMarkdown}>
            {copied === 'markdown' ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
            {copied === 'markdown' ? 'Copied' : 'Markdown'}
          </button>
          <button className="button button-secondary" type="button" onClick={copyHtml}>
            {copied === 'html' ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
            {copied === 'html' ? 'Copied' : 'HTML'}
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => downloadText(current.markdown, docFilename('md'), 'text/markdown;charset=utf-8')}
          >
            <Download aria-hidden="true" size={15} /> .md
          </button>
          <button className="button button-secondary" type="button" onClick={downloadHtml}>
            <Download aria-hidden="true" size={15} /> .html
          </button>
          <button className="button button-secondary" type="button" onClick={downloadPdf}>
            <Download aria-hidden="true" size={15} /> .pdf
          </button>
          <button className="button button-secondary" type="button" disabled={!isSaved} onClick={deleteCurrent}>
            <Trash2 aria-hidden="true" size={15} /> Delete document
          </button>
        </div>

        <div className="ed-foot">
          <span className="ed-note" role="status">
            {stats.words.toLocaleString()} words · {stats.lines} lines · {store.items.length}{' '}
            {store.items.length === 1 ? 'document' : 'documents'} in this browser
          </span>
          {message ? <span className="ed-pill gi">{message}</span> : null}
          {store.error ? (
            <span className="field-error" role="alert">
              {store.error}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
