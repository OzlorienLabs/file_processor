import { Check, Copy, Download, Eraser, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { z } from 'zod';

import { MarkdownPreview } from '../../components/MarkdownPreview/MarkdownPreview';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { copyText, downloadBlob, downloadText } from '../../lib/download';
import { createValueStore } from '../../lib/local-store';
import {
  applyMarkdownFormat,
  countText,
  markdownToHtml,
  markdownToPdf,
  sampleMarkdown,
  wrapHtmlDocument,
  type MarkdownFormat,
} from '../../lib/markdown';

const formats: { id: MarkdownFormat; label: string }[] = [
  { id: 'bold', label: 'Bold' },
  { id: 'italic', label: 'Italic' },
  { id: 'heading', label: 'Heading' },
  { id: 'link', label: 'Link' },
  { id: 'code', label: 'Code' },
];

type View = 'split' | 'editor' | 'preview';

const draftStore = createValueStore({
  key: 'filekit.markdown.v1',
  schema: z.object({ markdown: z.string().max(2_000_000), view: z.enum(['split', 'editor', 'preview']) }),
  fallback: { markdown: sampleMarkdown, view: 'split' as View },
});

export function MarkdownWorkspace() {
  const [draft, setDraft] = useState(() => draftStore.load());
  const editor = useRef<HTMLTextAreaElement>(null);
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

  const format = (kind: MarkdownFormat) => {
    const field = editor.current;
    if (!field) return;
    const next = applyMarkdownFormat(draft.markdown, field.selectionStart, field.selectionEnd, kind);
    commit({ ...draft, markdown: next.text });
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
    if (await copyText(draft.markdown)) flashCopied('markdown');
  };

  const copyHtml = async () => {
    if (await copyText(await markdownToHtml(draft.markdown))) flashCopied('html');
  };

  const downloadHtml = async () => {
    const html = wrapHtmlDocument(await markdownToHtml(draft.markdown), 'Markdown export');
    downloadText(html, 'document.html', 'text/html;charset=utf-8');
  };

  const downloadPdf = async () => {
    const bytes = await markdownToPdf(draft.markdown);
    downloadBlob(new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }), 'document.pdf');
  };

  return (
    <div className="ed markdown-workspace">
      <div className="ed-bar g">
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
          {(['editor', 'split', 'preview'] as View[]).map((view) => (
            <button key={view} type="button" aria-pressed={draft.view === view} onClick={() => setView(view)}>
              {view === 'editor' ? 'Editor' : view === 'split' ? 'Split' : 'Preview'}
            </button>
          ))}
        </div>
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
          onClick={() => downloadText(draft.markdown, 'document.md', 'text/markdown;charset=utf-8')}
        >
          <Download aria-hidden="true" size={15} /> .md
        </button>
        <button className="button button-secondary" type="button" onClick={downloadHtml}>
          <Download aria-hidden="true" size={15} /> .html
        </button>
        <button className="button button-secondary" type="button" onClick={downloadPdf}>
          <Download aria-hidden="true" size={15} /> .pdf
        </button>
        <button className="button button-secondary" type="button" onClick={() => setMarkdown(sampleMarkdown)}>
          <RotateCcw aria-hidden="true" size={15} /> Sample
        </button>
        <button className="button button-secondary" type="button" disabled={!draft.markdown} onClick={() => setMarkdown('')}>
          <Eraser aria-hidden="true" size={15} /> Clear
        </button>
        <span className="ed-note" role="status">
          {stats.words.toLocaleString()} words · {stats.lines} lines
        </span>
        <span className="ed-pill gi">Draft saved here</span>
      </div>

      <div className="ed-grid" data-panes="split" data-view={draft.view}>
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
            value={draft.markdown}
            spellCheck
            placeholder="# Start writing Markdown"
            onChange={(event) => setMarkdown(event.target.value)}
          />
        </section>
        <section className="ed-pane g">
          <div className="ed-head">
            <h3 className="panel-label">Preview</h3>
          </div>
          <div className="ed-prose scroll">
            <MarkdownPreview markdown={preview} />
          </div>
        </section>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
