import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eraser,
  FilePlus2,
  FolderDown,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';

import { useLocalCollection } from '../../hooks/useLocalCollection';
import {
  createDiffCollection,
  createSavedDiff,
  displayDiffTitle,
  isBlankDiff,
  searchDiffs,
  type DiffViewMode,
  type SavedDiff,
} from '../../lib/diff-history';
import { copyText, downloadText, formatWhen } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { touch } from '../../lib/local-store';
import {
  computeDiff,
  readDiffFile,
  unifiedPatch,
  type DiffLine,
  type DiffResult,
  type DiffRow,
} from '../../lib/text-diff';

const diffCollection = createDiffCollection();

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
  const store = useLocalCollection(diffCollection);
  const [current, setCurrent] = useState<SavedDiff>(() => store.items[0] ?? createSavedDiff());
  const [result, setResult] = useState<DiffResult>();
  const [error, setError] = useState('');
  const [wrap, setWrap] = useState(true);
  const [hunk, setHunk] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => searchDiffs(store.items, query), [store.items, query]);
  const isSaved = store.items.some((item) => item.id === current.id);

  const compare = (diffToCompare: SavedDiff = current) => {
    try {
      const computed = computeDiff(diffToCompare.original, diffToCompare.changed, {
        ignoreWhitespace: diffToCompare.ignoreWhitespace,
        ignoreCase: diffToCompare.ignoreCase,
      });
      setResult(computed);
      setHunk(computed.hunks.length ? 0 : -1);
      setError('');
    } catch (reason) {
      setResult(undefined);
      setError(errorMessage(reason, 'The texts could not be compared.'));
    }
  };

  const update = (patch: Partial<Pick<SavedDiff, 'title' | 'original' | 'changed' | 'ignoreWhitespace' | 'ignoreCase' | 'view'>>) => {
    const next = touch<SavedDiff>(current, patch);
    setCurrent(next);
    if (!isBlankDiff(next)) {
      store.upsert(next);
    } else if (isSaved) {
      store.remove(next.id);
    }
    return next;
  };

  const loadDiff = (diff: SavedDiff) => {
    setCurrent(diff);
    if (diff.original || diff.changed) {
      compare(diff);
    } else {
      setResult(undefined);
    }
  };

  const open = (diff: SavedDiff) => {
    setMessage('');
    loadDiff(diff);
  };

  const startNew = () => {
    const fresh = createSavedDiff();
    setCurrent(fresh);
    setResult(undefined);
    setError('');
    setMessage('');
  };

  const deleteCurrent = () => {
    store.remove(current.id);
    const remaining = store.items.filter((item) => item.id !== current.id);
    const next = remaining[0] ?? createSavedDiff();
    loadDiff(next);
    setMessage('Comparison deleted.');
  };

  const clearAll = () => {
    store.clear();
    setCurrent(createSavedDiff());
    setResult(undefined);
    setConfirmingClear(false);
    setMessage('All comparisons were removed from this browser.');
  };

  const toggleOption = (key: 'ignoreWhitespace' | 'ignoreCase', value: boolean) => {
    const next = update({ [key]: value });
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
      setError(errorMessage(reason, `${file.name} could not be read.`));
    }
  };

  const swap = () => {
    const next = update({ original: current.changed, changed: current.original });
    if (result) compare(next);
  };

  const clearInputs = () => {
    update({ original: '', changed: '' });
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

  const patch = () => unifiedPatch(current.original, current.changed);

  const copyPatch = async () => {
    setCopied(await copyText(patch()));
    setTimeout(() => setCopied(false), 2000);
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const parsed = store.importJson(await file.text());
    if (parsed) {
      setMessage(`Imported ${parsed.imported} ${parsed.imported === 1 ? 'comparison' : 'comparisons'}; skipped ${parsed.skipped}.`);
      setError('');
    } else {
      setError(`${file.name} is not a valid comparisons export.`);
    }
  };

  const canCompare = current.original.length > 0 || current.changed.length > 0;
  const currentRow = result && hunk >= 0 ? result.hunks[hunk] : -1;

  return (
    <div className="ed-grid diff-workspace" data-panes="note">
      <aside className="ed-pane g side-list" data-pad="true" aria-label="Saved comparisons">
        <button className="button button-primary" type="button" onClick={startNew}>
          <FilePlus2 aria-hidden="true" size={16} /> New comparison
        </button>
        <label className="field-label" htmlFor="diff-search">
          <span className="sr-only">Search comparisons</span>
          <span className="input-with-suffix">
            <input
              id="diff-search"
              value={query}
              placeholder="Search comparisons"
              onChange={(event) => setQuery(event.target.value)}
            />
            <Search aria-hidden="true" size={15} />
          </span>
        </label>
        {visible.length ? (
          <ul>
            {visible.map((diff) => (
              <li key={diff.id}>
                <button
                  type="button"
                  aria-current={diff.id === current.id ? 'true' : undefined}
                  onClick={() => open(diff)}
                >
                  <strong>{displayDiffTitle(diff)}</strong>
                  <small>{formatWhen(diff.updatedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inline-note">
            {store.items.length ? 'No comparisons match that search.' : 'Comparisons you run appear here and stay in this browser.'}
          </p>
        )}

        <div className="side-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={!store.items.length}
            onClick={() => downloadText(diffCollection.exportJson(), 'filekit-diff-history.json', 'application/json')}
          >
            <FolderDown aria-hidden="true" size={15} /> Export history
          </button>
          <label className="button button-secondary">
            <Upload aria-hidden="true" size={15} /> Import JSON
            <input
              className="sr-only"
              type="file"
              accept="application/json,.json"
              aria-label="Import diffs JSON"
              onChange={(event) => void importFile(event)}
            />
          </label>
          {confirmingClear ? (
            <span className="option-row">
              <span>Delete {store.items.length} comparisons?</span>
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

      <section className="ed-pane g diff-main" aria-label="Diff comparison">
        <div className="ed-head">
          <input
            className="note-title"
            aria-label="Comparison title"
            value={current.title}
            placeholder="Untitled comparison"
            onChange={(event) => update({ title: event.target.value })}
          />
          {isSaved ? (
            <button className="button button-secondary" type="button" onClick={deleteCurrent}>
              <Trash2 aria-hidden="true" size={15} /> Delete comparison
            </button>
          ) : null}
        </div>

        <div className="ed-grid" data-panes="split">
          {(['original', 'changed'] as const).map((side) => (
            <section className="ed-pane g" key={side}>
              <div className="ed-head">
                <label className="panel-label" htmlFor={`diff-${side}`}>
                  {side === 'original' ? 'Original text' : 'Changed text'}
                </label>
                <label className="diff-file-label">
                  <Upload aria-hidden="true" size={14} /> Upload file
                  <input
                    className="sr-only"
                    type="file"
                    aria-label={side === 'original' ? 'Upload original file' : 'Upload changed file'}
                    onChange={(event) => void loadFile(side, event)}
                  />
                </label>
              </div>
              <textarea
                className="ed-code scroll"
                id={`diff-${side}`}
                value={current[side]}
                spellCheck={false}
                placeholder={side === 'original' ? 'Paste the original text here' : 'Paste the changed text here'}
                onChange={(event) => update({ [side]: event.target.value })}
              />
            </section>
          ))}
        </div>

        <div className="ed-bar g">
          <button className="button button-primary" type="button" disabled={!canCompare} onClick={() => compare()}>
            Find difference
          </button>
          <button className="button button-secondary" type="button" disabled={!canCompare} onClick={swap}>
            <ArrowLeftRight aria-hidden="true" size={15} /> Swap
          </button>
          <button className="button button-secondary" type="button" disabled={!canCompare} onClick={clearInputs}>
            <Eraser aria-hidden="true" size={15} /> Clear
          </button>
          <span className="spacer" />
          <div className="option-row">
            <label>
              <input
                type="checkbox"
                checked={current.ignoreWhitespace}
                onChange={(event) => toggleOption('ignoreWhitespace', event.target.checked)}
              />
              Ignore whitespace
            </label>
            <label>
              <input
                type="checkbox"
                checked={current.ignoreCase}
                onChange={(event) => toggleOption('ignoreCase', event.target.checked)}
              />
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
          <section className="ed diff-result" aria-label="Comparison result">
            <div className="ed-bar g">
              <p className="status-line" role="status">
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
              <div className="seg gi" role="group" aria-label="Diff view">
                {(['split', 'unified'] as DiffViewMode[]).map((view) => (
                  <button key={view} type="button" aria-pressed={current.view === view} onClick={() => update({ view })}>
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
            <div className="diff-scroll g scroll" ref={scroller}>
              <table className="diff-table" data-wrap={wrap ? 'true' : 'false'}>
                <tbody>
                  {current.view === 'split' ? (
                    <SplitRows rows={result.rows} current={currentRow} />
                  ) : (
                    <UnifiedRows rows={result.rows} current={currentRow} />
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <p className="ed-note">
            Paste or upload two versions, then find the difference. Nothing leaves this browser.
          </p>
        )}

        <div className="ed-foot">
          <span className="ed-note" role="status">
            {store.items.length} {store.items.length === 1 ? 'comparison' : 'comparisons'} saved in this browser
          </span>
          {message ? <span className="ed-pill gi">{message}</span> : null}
        </div>
      </section>
    </div>
  );
}
