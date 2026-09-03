import { Check, Copy, Download, FilePlus2, FolderDown, Search, Smile, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';

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
import { EmojiReferencePanel } from './EmojiReferencePanel';

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
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const visible = useMemo(() => searchNotes(store.items, query), [store.items, query]);
  const stats = countText(current.body);
  const isSaved = store.items.some((note) => note.id === current.id);

  const change = (patch: Partial<Pick<Note, 'title' | 'body' | 'mode'>>) => {
    const next = touch<Note>(current, patch);
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

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      change({ body: current.body + emoji });
      return;
    }
    const start = textarea.selectionStart ?? current.body.length;
    const end = textarea.selectionEnd ?? current.body.length;
    const before = current.body.substring(0, start);
    const after = current.body.substring(end);
    const nextBody = before + emoji + after;
    change({ body: nextBody });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  const showPreview = current.mode !== 'plain';
  const layoutView: View = showPreview ? view : 'edit';

  return (
    <div className="ed-grid notepad" data-panes="note">
      <aside className="ed-pane g side-list" data-pad="true" aria-label="Saved notes">
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

        <div className="side-tools-section">
          <p className="side-section-label">Tools to refer to</p>
          <button
            className="button button-secondary side-tool-button"
            type="button"
            aria-label="Emoji library reference tool"
            aria-expanded={emojiPanelOpen}
            onClick={() => setEmojiPanelOpen((open) => !open)}
          >
            <Smile aria-hidden="true" size={15} /> Emoji library
          </button>
        </div>

        <div className="side-actions">
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

      <section className="ed-pane g note-editor" aria-label="Note editor">
        <div className="ed-head">
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
            <div className="seg gi" role="group" aria-label="Layout">
              {(['edit', 'split', 'preview'] as View[]).map((option) => (
                <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}>
                  {option === 'edit' ? 'Edit' : option === 'split' ? 'Split' : 'Preview'}
                </button>
              ))}
            </div>
          ) : null}
          <button
            className="button button-secondary"
            type="button"
            aria-label="Emoji library reference tool"
            aria-expanded={emojiPanelOpen}
            onClick={() => setEmojiPanelOpen((open) => !open)}
          >
            <Smile aria-hidden="true" size={15} /> Emoji library
          </button>
        </div>

        <div
          className="ed-grid note-panes"
          data-panes={showPreview ? 'split' : 'single'}
          data-view={showPreview ? (layoutView === 'edit' ? 'editor' : layoutView) : undefined}
        >
          <div className="ed-pane note-pane" data-mode={current.mode}>
            <div className="note-pane-head">
              <label className="panel-label" htmlFor="note-body">
                Note
              </label>
              <span className="ed-pill gi">
                {current.mode === 'markdown' ? 'Markdown editor' : current.mode === 'html' ? 'HTML editor' : 'Plain text'}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              className={`note-body note-edit-box scroll ${current.mode !== 'plain' ? 'is-code' : ''}`}
              id="note-body"
              value={current.body}
              placeholder={
                current.mode === 'plain'
                  ? 'Write anything…'
                  : current.mode === 'markdown'
                    ? '# Write Markdown…'
                    : '<h1>Write HTML…</h1>'
              }
              spellCheck={current.mode !== 'html'}
              onChange={(event) => change({ body: event.target.value })}
            />
          </div>
          {showPreview ? (
            <div className="ed-pane note-pane" data-mode={current.mode}>
              <div className="note-pane-head">
                <h3 className="panel-label">Preview</h3>
                <span className="ed-pill gi">
                  {current.mode === 'markdown' ? 'Rendered Markdown' : 'Rendered HTML'}
                </span>
              </div>
              <div className="note-preview-box ed-prose scroll">
                {current.mode === 'markdown' ? <MarkdownPreview markdown={current.body} /> : <HtmlPreview html={current.body} />}
              </div>
            </div>
          ) : null}
        </div>

        <div className="ed-foot">
          <span>{isSaved ? 'Saved locally' : isBlankNote(current) ? 'Start typing to save' : 'Not saved'}</span>
          <span className="spacer" />
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

        <div className="ed-foot">
          <span className="ed-status" role="status">
            <span>
              {stats.words.toLocaleString()} words · {stats.characters.toLocaleString()} characters ·{' '}
              {store.items.length} {store.items.length === 1 ? 'note' : 'notes'} in this browser
            </span>
            {message ? <span className="ed-pill gi">{message}</span> : null}
          </span>
          {store.error ? (
            <span className="field-error" role="alert">
              {store.error}
            </span>
          ) : null}
        </div>
      </section>

      <EmojiReferencePanel
        isOpen={emojiPanelOpen}
        onClose={() => setEmojiPanelOpen(false)}
        onInsertEmoji={insertEmoji}
      />
    </div>
  );
}
