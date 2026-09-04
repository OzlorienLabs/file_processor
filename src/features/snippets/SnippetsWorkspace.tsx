import { Check, Copy, Download, FilePlus2, FolderDown, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';

import { CodeBlock } from '../../components/CodeBlock/CodeBlock';
import { useLocalCollection } from '../../hooks/useLocalCollection';
import { touch } from '../../lib/local-store';
import { copyText, downloadText, formatWhen } from '../../lib/download';
import { AUTO_LANGUAGE, detectLanguage, languageLabel, languageOptions } from '../../lib/highlight';
import {
  allTags,
  createSnippet,
  createSnippetsCollection,
  filterSnippets,
  parseTags,
  snippetFilename,
  usedLanguages,
  type Snippet,
} from '../../lib/snippets';

type Screen = { kind: 'list' } | { kind: 'new' } | { kind: 'view'; id: string } | { kind: 'edit'; id: string };

interface FormState {
  title: string;
  language: string;
  tags: string;
  code: string;
}

const emptyForm: FormState = { title: '', language: AUTO_LANGUAGE, tags: '', code: '' };
const snippets = createSnippetsCollection();

function toForm(snippet: Snippet): FormState {
  return { title: snippet.title, language: snippet.language, tags: snippet.tags.join(', '), code: snippet.code };
}

export function SnippetsWorkspace() {
  const store = useLocalCollection(snippets);
  const [screen, setScreen] = useState<Screen>(() => (store.items.length ? { kind: 'list' } : { kind: 'new' }));
  const [form, setForm] = useState<FormState>(emptyForm);
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('');
  const [tag, setTag] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => filterSnippets(store.items, { query, language, tag }), [store.items, query, language, tag]);
  const tags = useMemo(() => allTags(store.items), [store.items]);
  const languages = useMemo(() => usedLanguages(store.items), [store.items]);
  const selected = screen.kind === 'view' || screen.kind === 'edit' ? store.items.find((item) => item.id === screen.id) : undefined;

  const startNew = () => {
    setForm(emptyForm);
    setScreen({ kind: 'new' });
    setMessage('');
  };

  const startEdit = (snippet: Snippet) => {
    setForm(toForm(snippet));
    setScreen({ kind: 'edit', id: snippet.id });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.code.trim()) return;
    setSaving(true);
    const resolvedLanguage = form.language === AUTO_LANGUAGE ? await detectLanguage(form.code) : form.language;
    const fields = {
      title: form.title.trim() || 'Untitled snippet',
      language: resolvedLanguage,
      tags: parseTags(form.tags),
      code: form.code,
    };
    const record: Snippet = screen.kind === 'edit' && selected ? touch(selected, fields) : createSnippet(fields);
    setSaving(false);
    if (store.upsert(record)) {
      setScreen({ kind: 'view', id: record.id });
      setMessage(screen.kind === 'edit' ? 'Snippet updated.' : 'Snippet saved in this browser.');
    }
  };

  const remove = (snippet: Snippet) => {
    store.remove(snippet.id);
    setScreen({ kind: 'list' });
    setMessage('Snippet deleted.');
  };

  const copy = async (snippet: Snippet) => {
    if (await copyText(snippet.code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = store.importJson(await file.text());
    if (result) {
      setMessage(`Imported ${result.imported} ${result.imported === 1 ? 'snippet' : 'snippets'}; skipped ${result.skipped}.`);
      setScreen({ kind: 'list' });
    }
  };

  const clearAll = () => {
    store.clear();
    setConfirmingClear(false);
    setScreen({ kind: 'new' });
    setForm(emptyForm);
    setMessage('All snippets were removed from this browser.');
  };

  const showForm = screen.kind === 'new' || screen.kind === 'edit';

  return (
    <div className="ed-grid snippets" data-panes="snippets">
      <section className="ed-pane g snippet-tags" data-pad="true">
        <p className="panel-label">Tags</p>
        {tags.length ? (
          <div className="chip-row" role="group" aria-label="Filter by tag">
            {tags.slice(0, 24).map((candidate) => (
              <button
                key={candidate}
                className="chip"
                type="button"
                data-active={tag.toLowerCase() === candidate.toLowerCase() ? 'true' : undefined}
                aria-pressed={tag.toLowerCase() === candidate.toLowerCase()}
                onClick={() => setTag(tag.toLowerCase() === candidate.toLowerCase() ? '' : candidate)}
              >
                #{candidate}
              </button>
            ))}
          </div>
        ) : (
          <p className="inline-note">Tags you add to snippets appear here.</p>
        )}
      </section>

      <aside className="ed-pane g side-list" data-pad="true" aria-label="Saved snippets">
        <button className="button button-primary" type="button" onClick={startNew}>
          <FilePlus2 aria-hidden="true" size={16} /> New snippet
        </button>
        <div className="snippet-filters">
          <label className="field-label" htmlFor="snippet-search">
            <span className="sr-only">Search snippets</span>
            <span className="input-with-suffix">
              <input id="snippet-search" value={query} placeholder="Search snippets" onChange={(event) => setQuery(event.target.value)} />
              <Search aria-hidden="true" size={15} />
            </span>
          </label>
          {languages.length > 1 ? (
            <label className="field-label" htmlFor="snippet-language-filter">
              <span className="sr-only">Filter by language</span>
              <select id="snippet-language-filter" value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="">All languages</option>
                {languages.map((id) => (
                  <option key={id} value={id}>
                    {languageLabel(id)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {visible.length ? (
          <ul>
            {visible.map((snippet) => (
              <li key={snippet.id}>
                <button
                  type="button"
                  aria-current={selected?.id === snippet.id ? 'true' : undefined}
                  onClick={() => {
                    setScreen({ kind: 'view', id: snippet.id });
                    setMessage('');
                  }}
                >
                  <strong>{snippet.title}</strong>
                  <small>
                    {languageLabel(snippet.language)} · {formatWhen(snippet.updatedAt)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inline-note">{store.items.length ? 'No snippets match those filters.' : 'Saved snippets appear here and stay in this browser.'}</p>
        )}
        <div className="side-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={!store.items.length}
            onClick={() => downloadText(snippets.exportJson(), 'filekit-snippets.json', 'application/json')}
          >
            <FolderDown aria-hidden="true" size={15} /> Export JSON
          </button>
          <label className="button button-secondary">
            <Upload aria-hidden="true" size={15} /> Import JSON
            <input className="sr-only" type="file" accept="application/json,.json" aria-label="Import snippets JSON" onChange={(event) => void importFile(event)} />
          </label>
          {confirmingClear ? (
            <span className="option-row">
              <span>Delete {store.items.length} snippets?</span>
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

      <section className="ed-pane g snippet-main" data-pad="true" aria-label={showForm ? 'Snippet form' : 'Snippet details'}>
        {showForm ? (
          <form className="snippet-form" onSubmit={(event) => void save(event)}>
            <div className="snippet-title-bar">
              <label className="field-label snippet-title-field" htmlFor="snippet-title">
                <span className="snippet-field-title">Snippet title</span>
                <input
                  id="snippet-title"
                  className="snippet-title-input"
                  aria-label="Snippet title"
                  value={form.title}
                  placeholder="Snippet title"
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </label>
              <label className="field-label snippet-lang-field" htmlFor="snippet-language-select">
                <span className="snippet-field-title">Language</span>
                <select
                  id="snippet-language-select"
                  aria-label="Language"
                  value={form.language}
                  onChange={(event) => setForm({ ...form, language: event.target.value })}
                >
                  <option value={AUTO_LANGUAGE}>Detect language</option>
                  {languageOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field-label" htmlFor="snippet-tags">
              Tags
              <input
                id="snippet-tags"
                value={form.tags}
                placeholder="react, hooks, util"
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
              />
            </label>
            <label className="field-label" htmlFor="snippet-code">
              Code
              <textarea
                className="code-editor"
                id="snippet-code"
                value={form.code}
                spellCheck={false}
                placeholder="Paste or type the snippet"
                onChange={(event) => setForm({ ...form, code: event.target.value })}
              />
            </label>
            <div className="workflow-actions">
              <button className="button button-primary" type="submit" disabled={!form.code.trim() || saving}>
                {saving ? 'Saving…' : screen.kind === 'edit' ? 'Save changes' : 'Save snippet'}
              </button>
              {store.items.length ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setScreen(screen.kind === 'edit' ? { kind: 'view', id: screen.id } : { kind: 'list' })}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : selected ? (
          <article className="snippet-detail">
            <div className="control-heading">
              <div>
                <strong>{selected.title}</strong>
                <p>
                  Saved {formatWhen(selected.createdAt)}
                  {selected.updatedAt !== selected.createdAt ? ` · edited ${formatWhen(selected.updatedAt)}` : ''}
                </p>
              </div>
              <span>{languageLabel(selected.language)}</span>
            </div>
            {selected.tags.length ? (
              <div className="chip-row">
                {selected.tags.map((candidate) => (
                  <span className="chip" key={candidate}>
                    #{candidate}
                  </span>
                ))}
              </div>
            ) : null}
            <CodeBlock code={selected.code} language={selected.language} />
            <div className="ed-bar-inline">
              <button className="button button-secondary" type="button" onClick={() => copy(selected)}>
                {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
                {copied ? 'Copied' : 'Copy code'}
              </button>
              <button className="button button-secondary" type="button" onClick={() => downloadText(selected.code, snippetFilename(selected))}>
                <Download aria-hidden="true" size={15} /> Download {snippetFilename(selected)}
              </button>
              <button className="button button-secondary" type="button" onClick={() => startEdit(selected)}>
                <Pencil aria-hidden="true" size={15} /> Edit
              </button>
              <button className="button button-secondary" type="button" onClick={() => remove(selected)}>
                <Trash2 aria-hidden="true" size={15} /> Delete
              </button>
            </div>
          </article>
        ) : (
          <p className="ed-note">Pick a snippet from the list, or add a new one.</p>
        )}
        {store.error ? (
          <p className="field-error" role="alert">
            {store.error}
          </p>
        ) : null}
        <p className="ed-status" role="status">
          <span className="ed-note">
            {store.items.length} {store.items.length === 1 ? 'snippet' : 'snippets'} in this browser
          </span>
          {message ? <span className="ed-pill gi">{message}</span> : null}
        </p>
      </section>
    </div>
  );
}
