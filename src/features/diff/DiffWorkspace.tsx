import { ArrowLeftRight, Check, ChevronDown, ChevronUp, Copy, Download, Eraser, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { z } from 'zod';

import { copyText, downloadText } from '../../lib/download';
import { createValueStore } from '../../lib/local-store';
import {
  computeDiff,
  DiffInputError,
  readDiffFile,
  unifiedPatch,
  type DiffLine,
  type DiffResult,
  type DiffRow,
} from '../../lib/text-diff';

type View = 'split' | 'unified';

const draftSchema = z.object({
  original: z.string().max(6_000_000),
  changed: z.string().max(6_000_000),
  ignoreWhitespace: z.boolean(),
  ignoreCase: z.boolean(),
  view: z.enum(['split', 'unified']),
});
type Draft = z.infer<typeof draftSchema>;

const diffDraftStore = createValueStore<Draft>({
  key: 'filekit.diff.v1',
  schema: draftSchema,
  fallback: { original: '', changed: '', ignoreWhitespace: false, ignoreCase: false, view: 'split' },
});

function Segments({ line }: { line: DiffLine }) {
  if (!line.segments) return <>{line.text}</>;
  return (
    <>
      {line.segments.map((segment, index) =>
        segment.changed ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}

function SplitRows({ rows, current }: { rows: DiffRow[]; current: number }) {
  return (
    <>
      {rows.map((row, index) => (
        <tr key={index} data-kind={row.kind} data-current={index === current ? 'true' : undefined} data-row={index}>
          <td className="num">{row.left?.number ?? ''}</td>
          <td className={`code${row.kind === 'changed' ? ' left-changed' : ''}${row.left ? '' : ' empty'}`}>
            {row.left ? <Segments line={row.left} /> : null}
          </td>
          <td className="num">{row.right?.number ?? ''}</td>
          <td className={`code${row.kind === 'changed' ? ' right-changed' : ''}${row.right ? '' : ' empty'}`}>
            {row.right ? <Segments line={row.right} /> : null}
          </td>
        </tr>
      ))}
    </>
  );
}

function UnifiedRows({ rows, current }: { rows: DiffRow[]; current: number }) {
  return (
    <>
      {rows.flatMap((row, index) => {
        const lines: Array<{ kind: 'same' | 'added' | 'removed'; line: DiffLine; leftNumber?: number; rightNumber?: number }> = [];
        if (row.kind === 'same' && row.left && row.right) {
          lines.push({ kind: 'same', line: row.left, leftNumber: row.left.number, rightNumber: row.right.number });
        }
        if ((row.kind === 'changed' || row.kind === 'removed') && row.left) {
          lines.push({ kind: 'removed', line: row.left, leftNumber: row.left.number });
        }
        if ((row.kind === 'changed' || row.kind === 'added') && row.right) {
          lines.push({ kind: 'added', line: row.right, rightNumber: row.right.number });
        }
        return lines.map((entry, position) => (
          <tr
            key={`${index}-${position}`}
            data-kind={entry.kind}
            data-current={index === current ? 'true' : undefined}
            data-row={position === 0 ? index : undefined}
          >
            <td className="num">{entry.leftNumber ?? ''}</td>
            <td className="num">{entry.rightNumber ?? ''}</td>
            <td className="mark">{entry.kind === 'added' ? '+' : entry.kind === 'removed' ? '−' : ' '}</td>
            <td className="code">
              <Segments line={entry.line} />
            </td>
          </tr>
        ));
      })}
    </>
  );
}

export function DiffWorkspace() {
  const [draft, setDraft] = useState<Draft>(() => diffDraftStore.load());
  const [result, setResult] = useState<DiffResult>();
  const [error, setError] = useState('');
  const [wrap, setWrap] = useState(true);
  const [hunk, setHunk] = useState(-1);
  const [copied, setCopied] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      diffDraftStore.save(draft);
    } catch {
      // A full storage only loses the autosave; the comparison itself still works.
    }
  }, [draft]);

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const compare = (next: Draft = draft) => {
    try {
      const computed = computeDiff(next.original, next.changed, {
        ignoreWhitespace: next.ignoreWhitespace,
        ignoreCase: next.ignoreCase,
      });
      setResult(computed);
      setHunk(computed.hunks.length ? 0 : -1);
      setError('');
    } catch (reason) {
      setResult(undefined);
      setError(reason instanceof DiffInputError ? reason.message : 'The texts could not be compared.');
    }
  };

  const toggleOption = (key: 'ignoreWhitespace' | 'ignoreCase', value: boolean) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (result) compare(next);
  };

  const loadFile = async (side: 'original' | 'changed', event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      update({ [side]: await readDiffFile(file) });
      setError('');
    } catch (reason) {
      setError(reason instanceof DiffInputError ? reason.message : `${file.name} could not be read.`);
    }
  };

  const swap = () => {
    const next = { ...draft, original: draft.changed, changed: draft.original };
    setDraft(next);
    if (result) compare(next);
  };

  const clearAll = () => {
    setDraft((current) => ({ ...current, original: '', changed: '' }));
    setResult(undefined);
    setError('');
    setHunk(-1);
  };

  const jump = (direction: 1 | -1) => {
    if (!result?.hunks.length) return;
    const next = (hunk + direction + result.hunks.length) % result.hunks.length;
    setHunk(next);
    scroller.current
      ?.querySelector(`[data-row="${result.hunks[next]}"]`)
      ?.scrollIntoView?.({ block: 'center' });
  };

  const patch = () => unifiedPatch(draft.original, draft.changed);

  const copyPatch = async () => {
    setCopied(await copyText(patch()));
    setTimeout(() => setCopied(false), 2000);
  };

  const canCompare = draft.original.length > 0 || draft.changed.length > 0;
  const currentRow = result && hunk >= 0 ? result.hunks[hunk] : -1;

  return (
    <div className="diff-workspace">
      <div className="diff-inputs">
        {(['original', 'changed'] as const).map((side) => (
          <div className="editor-pane" key={side}>
            <header>
              <label htmlFor={`diff-${side}`}>{side === 'original' ? 'Original text' : 'Changed text'}</label>
              <label className="diff-file-label">
                <Upload aria-hidden="true" size={14} /> Upload file
                <input
                  className="sr-only"
                  type="file"
                  aria-label={side === 'original' ? 'Upload original file' : 'Upload changed file'}
                  onChange={(event) => void loadFile(side, event)}
                />
              </label>
            </header>
            <textarea
              className="code-editor"
              id={`diff-${side}`}
              value={draft[side]}
              spellCheck={false}
              placeholder={side === 'original' ? 'Paste the original text here' : 'Paste the changed text here'}
              onChange={(event) => update({ [side]: event.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="editor-toolbar" style={{ marginTop: '0.75rem' }}>
        <button className="button button-primary" type="button" disabled={!canCompare} onClick={() => compare()}>
          Find difference
        </button>
        <button className="button button-secondary" type="button" disabled={!canCompare} onClick={swap}>
          <ArrowLeftRight aria-hidden="true" size={15} /> Swap
        </button>
        <button className="button button-secondary" type="button" disabled={!canCompare} onClick={clearAll}>
          <Eraser aria-hidden="true" size={15} /> Clear
        </button>
        <span className="spacer" />
        <div className="option-row">
          <label>
            <input
              type="checkbox"
              checked={draft.ignoreWhitespace}
              onChange={(event) => toggleOption('ignoreWhitespace', event.target.checked)}
            />
            Ignore whitespace
          </label>
          <label>
            <input type="checkbox" checked={draft.ignoreCase} onChange={(event) => toggleOption('ignoreCase', event.target.checked)} />
            Ignore case
          </label>
          <label>
            <input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />
            Wrap lines
          </label>
        </div>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="diff-result" aria-label="Comparison result">
          <div className="editor-toolbar">
            <p className="status-line" role="status" style={{ margin: 0 }}>
              {result.identical ? (
                <span className="pill-ok">The two texts are identical.</span>
              ) : (
                <>
                  <span className="pill-warn">{result.hunks.length} change {result.hunks.length === 1 ? 'block' : 'blocks'}</span>
                  <span>{result.added} added</span>
                  <span>{result.removed} removed</span>
                  <span>{result.unchanged} unchanged</span>
                </>
              )}
            </p>
            <span className="spacer" />
            <div className="toggle-group" role="group" aria-label="Diff view">
              {(['split', 'unified'] as View[]).map((view) => (
                <button key={view} type="button" aria-pressed={draft.view === view} onClick={() => update({ view })}>
                  {view === 'split' ? 'Side by side' : 'Unified'}
                </button>
              ))}
            </div>
            <button className="button button-secondary" type="button" disabled={!result.hunks.length} onClick={() => jump(-1)}>
              <ChevronUp aria-hidden="true" size={15} /> Previous
            </button>
            <button className="button button-secondary" type="button" disabled={!result.hunks.length} onClick={() => jump(1)}>
              <ChevronDown aria-hidden="true" size={15} /> Next
            </button>
            <button className="button button-secondary" type="button" onClick={copyPatch}>
              {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
              {copied ? 'Copied' : 'Copy patch'}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => downloadText(patch(), 'changes.patch', 'text/x-patch;charset=utf-8')}
            >
              <Download aria-hidden="true" size={15} /> Download .patch
            </button>
          </div>
          <div className="diff-scroll" ref={scroller}>
            <table className="diff-table" data-wrap={wrap ? 'true' : 'false'}>
              <tbody>
                {draft.view === 'split' ? (
                  <SplitRows rows={result.rows} current={currentRow} />
                ) : (
                  <UnifiedRows rows={result.rows} current={currentRow} />
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="empty-workspace">Paste or upload two versions, then find the difference. Nothing leaves this browser.</p>
      )}
    </div>
  );
}
