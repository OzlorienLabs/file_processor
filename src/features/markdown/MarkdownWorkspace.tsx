import { Check, Copy, Download, Eraser, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import { MarkdownPreview } from '../../components/MarkdownPreview/MarkdownPreview';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { copyText, downloadText } from '../../lib/download';
import { createValueStore } from '../../lib/local-store';
import { countText, markdownToHtml, sampleMarkdown, wrapHtmlDocument } from '../../lib/markdown';

type View = 'split' | 'editor' | 'preview';

const draftStore = createValueStore({
  key: 'filekit.markdown.v1',
  schema: z.object({ markdown: z.string().max(2_000_000), view: z.enum(['split', 'editor', 'preview']) }),
  fallback: { markdown: sampleMarkdown, view: 'split' as View },
});

export function MarkdownWorkspace() {
  const [draft, setDraft] = useState(() => draftStore.load());
  const [copied, setCopied] = useState<'markdown' | 'html' | ''>('');
  const [error, setError] = useState('');
  const preview = useDebouncedValue(draft.markdown, 150);
  const stats = countText(draft.markdown);

  const commit = (next: typeof draft) => {
    setDraft(next);
    try {
      draftStore.save(next);
      setError('');
    } catch {
      setError('This browser is out of local storage, so the draft is not being saved.');
    }
  };

  const setMarkdown = (markdown: string) => commit({ ...draft, markdown });
  const setView = (view: View) => commit({ ...draft, view });

  const flashCopied = (kind: 'markdown' | 'html') => {
    setCopied(kind);
    setTimeout(() => setCopied(''), 2000);
  };

  const copyMarkdown = async () => {
    if (await copyText(draft.markdown)) flashCopied('markdown');
  };

  const copyHtml = async () => {
    if (await copyText(await markdownToHtml(draft.markdown))) flashCopied('html');
  };

  const downloadHtml = async () => {
    const html = wrapHtmlDocument(await markdownToHtml(draft.markdown), 'Markdown export');
    downloadText(html, 'document.html', 'text/html;charset=utf-8');
  };

  return (
    <div className="markdown-workspace">
      <div className="editor-toolbar">
        <div className="toggle-group" role="group" aria-label="Layout">
          {(['editor', 'split', 'preview'] as View[]).map((view) => (
            <button key={view} type="button" aria-pressed={draft.view === view} onClick={() => setView(view)}>
              {view === 'editor' ? 'Editor' : view === 'split' ? 'Split' : 'Preview'}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="button button-secondary" type="button" onClick={copyMarkdown}>
          {copied === 'markdown' ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
          {copied === 'markdown' ? 'Copied' : 'Copy Markdown'}
        </button>
        <button className="button button-secondary" type="button" onClick={copyHtml}>
          {copied === 'html' ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
          {copied === 'html' ? 'Copied' : 'Copy HTML'}
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => downloadText(draft.markdown, 'document.md', 'text/markdown;charset=utf-8')}
        >
          <Download aria-hidden="true" size={15} /> Download .md
        </button>
        <button className="button button-secondary" type="button" onClick={downloadHtml}>
          <Download aria-hidden="true" size={15} /> Download .html
        </button>
        <button className="button button-secondary" type="button" onClick={() => setMarkdown(sampleMarkdown)}>
          <RotateCcw aria-hidden="true" size={15} /> Sample
        </button>
        <button className="button button-secondary" type="button" disabled={!draft.markdown} onClick={() => setMarkdown('')}>
          <Eraser aria-hidden="true" size={15} /> Clear
        </button>
      </div>

      <div className="editor-split" data-view={draft.view}>
        <div className="editor-pane">
          <header>
            <label htmlFor="markdown-source">Markdown</label>
            <small>{stats.lines} lines</small>
          </header>
          <textarea
            className="code-editor"
            id="markdown-source"
            value={draft.markdown}
            spellCheck
            placeholder="# Start writing Markdown"
            onChange={(event) => setMarkdown(event.target.value)}
          />
        </div>
        <div className="editor-pane">
          <header>
            <h3>Preview</h3>
            <small>Updates as you type</small>
          </header>
          <MarkdownPreview markdown={preview} />
        </div>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="status-line" role="status">
        <span>{stats.words.toLocaleString()} words</span>
        <span>{stats.characters.toLocaleString()} characters</span>
        <span className="pill-ok">Draft saved in this browser</span>
      </p>
    </div>
  );
}
