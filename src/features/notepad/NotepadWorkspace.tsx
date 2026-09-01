import { Check, Copy, Download, FilePlus2, FolderDown, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useState, type ChangeEvent } from 'react';

import { HtmlPreview } from '../../components/HtmlPreview/HtmlPreview';
import { MarkdownPreview } from '../../components/MarkdownPreview/MarkdownPreview';
import { useLocalCollection } from '../../hooks/useLocalCollection';
import { copyText, downloadBlob, downloadText, formatWhen } from '../../lib/download';
import { touch } from '../../lib/local-store';
import { countText } from '../../lib/markdown';
import {
  createNote,
  createNotesCollection,
  displayTitle,
  exportNotesZip,
  isBlankNote,
  noteFilename,
  noteModes,
  noteToHtml,
  searchNotes,
  type Note,
  type NoteMode,
} from '../../lib/notes';

type View = 'edit' | 'split' | 'preview';

const modeLabels: Record<NoteMode, string> = { plain: 'Plain text', markdown: 'Markdown', html: 'HTML' };
const notes = createNotesCollection();

export function NotepadWorkspace() {
  const store = useLocalCollection(notes);
  const [current, setCurrent] = useState<Note>(() => store.items[0] ?? createNote());
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('split');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const visible = useMemo(() => searchNotes(store.items, query), [store.items, query]);
  const stats = countText(current.body);
  const isSaved = store.items.some((note) => note.id === current.id);

  const change = (patch: Partial<Pick<Note, 'title' | 'body' | 'mode'>>) => {
    const next = touch(current, patch);
    setCurrent(next);
    if (!isBlankNote(next)) store.upsert(next);
    else if (isSaved) store.remove(next.id);
  };

  const open = (note: Note) => {
    setCurrent(note);
    setMessage('');
  };

  const startNew = () => {
    setCurrent(createNote(current.mode));
    setMessage('');
  };

  const deleteCurrent = () => {
    store.remove(current.id);
    const remaining = store.items.filter((note) => note.id !== current.id);
    setCurrent(remaining[0] ?? createNote(current.mode));
    setMessage('Note deleted.');
  };

  const clearAll = () => {
    store.clear();
    setCurrent(createNote(current.mode));
    setConfirmingClear(false);
    setMessage('All notes were removed from this browser.');
  };

  const copyBody = async () => {
    if (await copyText(current.body)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadHtml = async () => {
    downloadText(await noteToHtml(current), noteFilename(current, 'html'), 'text/html;charset=utf-8');
  };

  const exportAll = async () => {
    downloadBlob(await exportNotesZip(store.items, notes.exportJson()), 'filekit-notes.zip');
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = store.importJson(await file.text());
    if (result) setMessage(`Imported ${result.imported} ${result.imported === 1 ? 'note' : 'notes'}; skipped ${result.skipped}.`);
  };

  const showPreview = current.mode !== 'plain';
  const layoutView: View = showPreview ? view : 'edit';

  return (
    <div className="side-layout notepad">
      <aside className="side-list" aria-label="Saved notes">
        <button className="button button-primary" type="button" onClick={startNew}>
          <FilePlus2 aria-hidden="true" size={16} /> New note
        </button>
        <label className="field-label" htmlFor="note-search">
          <span className="sr-only">Search notes</span>
          <span className="input-with-suffix">
            <input id="note-search" value={query} placeholder="Search notes" onChange={(event) => setQuery(event.target.value)} />
            <Search aria-hidden="true" size={15} />
          </span>
        </label>
        {visible.length ? (
          <ul>
            {visible.map((note) => (
              <li key={note.id}>
                <button type="button" aria-current={note.id === current.id ? 'true' : undefined} onClick={() => open(note)}>
                  <strong>{displayTitle(note)}</strong>
                  <small>
                    {formatWhen(note.updatedAt)} · {modeLabels[note.mode]}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inline-note">{store.items.length ? 'No notes match that search.' : 'Notes you write appear here and stay in this browser.'}</p>
        )}
        <div className="editor-toolbar" style={{ marginBottom: 0 }}>
          <button className="button button-secondary" type="button" disabled={!store.items.length} onClick={exportAll}>
            <FolderDown aria-hidden="true" size={15} /> Export all (.zip)
          </button>
          <label className="button button-secondary">
            <Upload aria-hidden="true" size={15} /> Import JSON
            <input className="sr-only" type="file" accept="application/json,.json" aria-label="Import notes JSON" onChange={(event) => void importFile(event)} />
          </label>
          {confirmingClear ? (
            <span className="option-row">
              <span>Delete {store.items.length} notes?</span>
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

      <section className="note-editor" aria-label="Note editor">
        <div className="editor-toolbar">
          <input
            className="note-title"
            aria-label="Note title"
            value={current.title}
            placeholder="Untitled note"
            onChange={(event) => change({ title: event.target.value })}
          />
          <label className="field-label">
            <span className="sr-only">Note format</span>
            <select aria-label="Note format" value={current.mode} onChange={(event) => change({ mode: event.target.value as NoteMode })}>
              {noteModes.map((mode) => (
                <option key={mode} value={mode}>
                  {modeLabels[mode]}
                </option>
              ))}
            </select>
          </label>
          {showPreview ? (
            <div className="toggle-group" role="group" aria-label="Layout">
              {(['edit', 'split', 'preview'] as View[]).map((option) => (
                <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}>
                  {option === 'edit' ? 'Edit' : option === 'split' ? 'Split' : 'Preview'}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="editor-split" data-view={layoutView === 'edit' ? 'editor' : layoutView}>
          <div className="editor-pane">
            <header>
              <label htmlFor="note-body">Note</label>
              <small>{isSaved ? 'Saved' : isBlankNote(current) ? 'Start typing to save' : 'Not saved'}</small>
            </header>
            <textarea
              className="code-editor note-body"
              id="note-body"
              value={current.body}
              placeholder={current.mode === 'plain' ? 'Write anything…' : current.mode === 'markdown' ? '# Write Markdown…' : '<h1>Write HTML…</h1>'}
              spellCheck={current.mode !== 'html'}
              onChange={(event) => change({ body: event.target.value })}
            />
          </div>
          {showPreview ? (
            <div className="editor-pane">
              <header>
                <h3>Preview</h3>
              </header>
              {current.mode === 'markdown' ? <MarkdownPreview markdown={current.body} /> : <HtmlPreview html={current.body} />}
            </div>
          ) : null}
        </div>

        <div className="editor-toolbar" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          <button className="button button-secondary" type="button" disabled={!current.body} onClick={copyBody}>
            {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={isBlankNote(current)}
            onClick={() => downloadText(current.body, noteFilename(current))}
          >
            <Download aria-hidden="true" size={15} /> Download .{noteFilename(current).split('.').pop()}
          </button>
          {current.mode !== 'html' ? (
            <button className="button button-secondary" type="button" disabled={isBlankNote(current)} onClick={downloadHtml}>
              <Download aria-hidden="true" size={15} /> Download as HTML
            </button>
          ) : null}
          <button className="button button-secondary" type="button" disabled={!isSaved} onClick={deleteCurrent}>
            <Trash2 aria-hidden="true" size={15} /> Delete note
          </button>
        </div>

        {store.error ? (
          <p className="field-error" role="alert">
            {store.error}
          </p>
        ) : null}
        <p className="status-line" role="status">
          <span>{stats.words.toLocaleString()} words</span>
          <span>{stats.characters.toLocaleString()} characters</span>
          <span>
            {store.items.length} {store.items.length === 1 ? 'note' : 'notes'} in this browser
          </span>
          {message ? <span className="pill-ok">{message}</span> : null}
        </p>
      </section>
    </div>
  );
}
