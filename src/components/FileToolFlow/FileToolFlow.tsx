import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import type { ToolDefinition, ToolOutput } from '../../app/tool-catalog';
import { downloadBlob } from '../../lib/download';
import { FileInputError, assertFilesAllowed, formatBytes, type FilePolicy } from '../../lib/files';
import { ToolMark } from '../ToolMark/ToolMark';

/** What the source panel learned about the chosen files. */
export interface SourceDescription {
  /** The line under the file name, e.g. "14 pages · 6.4 MB". */
  meta: string;
  /** One label per page thumbnail, e.g. "p. 1". Empty for tools with no page preview. */
  pages?: string[];
}

export interface FlowState {
  files: File[];
  /** Index into the option list shown in "2 · Settings". */
  output: number;
  quality: number;
  extra: boolean;
  /** 1-based page numbers ticked in the preview, when the tool allows it. */
  selectedPages: number[];
  working: boolean;
}

export interface FlowRun extends FlowState {
  signal: AbortSignal;
  /** Real completion, 0 to 1. Call it from the engine, never on a timer. */
  report: (fraction: number) => void;
}

/** Handles the tool-specific slots get for editing the flow's own state. */
export interface FlowActions {
  setFiles: (files: File[]) => void;
}

export interface FlowResult {
  blob: Blob;
  filename: string;
  /** The plate numeral beside the result title: a saving, a count, or a tick. */
  figure: string;
  title: string;
  meta: string;
  /** Overrides the catalog's `out` on the download button. */
  out?: string;
  /** Text results show their real content on the result sheet and offer Copy. */
  text?: string;
}

interface FileToolFlowProps {
  tool: ToolDefinition;
  policy: FilePolicy;
  /** Accessible name of the file input. */
  inputLabel: string;
  /** Replaces the catalog options where the real set depends on the file. */
  outputs?: ToolOutput[];
  /** Reads the files: the meta line, the page thumbnails, or a thrown message. */
  describe?: (files: File[]) => Promise<SourceDescription> | SourceDescription;
  /** Page thumbnails become checkboxes when this returns true for the current option. */
  pagesSelectable?: (state: FlowState) => boolean;
  /** Tool-specific content under the file card in "1 · Source". */
  sourceExtra?: (state: FlowState, actions: FlowActions) => ReactNode;
  /** Tool-specific controls, rendered inside "2 · Settings" under the shared ones. */
  settings?: (state: FlowState, actions: FlowActions) => ReactNode;
  /** A reason the run button is unavailable, or undefined when it is ready. */
  runBlocked?: (state: FlowState) => string | undefined;
  /** Renders the slider value; the default is a percentage. */
  formatQuality?: (value: number) => string;
  /** Middle progress-log line. The default states that nothing goes over the network. */
  workLog?: string;
  /** Footer line under the progress log. */
  runningNote?: string;
  onRun: (run: FlowRun) => Promise<FlowResult>;
}

type Phase = 'idle' | 'ready' | 'working' | 'done';

const DEFAULT_WORK_LOG = 'Worker started — no network request';
const DEFAULT_RUNNING_NOTE = 'Running on this device. Closing the tab cancels it and keeps nothing.';

function capitalise(value: string): string {
  return value.replace(/^\w/, (character) => character.toUpperCase());
}

function stageLabel(pct: number, runLabel: string): string {
  if (pct < 34) return 'Reading the file';
  if (pct < 72) return `${capitalise(runLabel)}…`;
  return 'Writing the result';
}

/**
 * The stacked flow every file tool runs: one centred column of three glass panels —
 * source, settings, result. Copy and options come from the tool catalog; the work, the
 * progress and the result figures come from the tool's own engine.
 */
export function FileToolFlow({
  tool,
  policy,
  inputLabel,
  outputs,
  describe,
  pagesSelectable,
  sourceExtra,
  settings,
  runBlocked,
  formatQuality = (value) => `${value}%`,
  workLog = DEFAULT_WORK_LOG,
  runningNote = DEFAULT_RUNNING_NOTE,
  onRun,
}: FileToolFlowProps) {
  const flow = tool.flow!;
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<SourceDescription>({ meta: '', pages: [] });
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [output, setOutput] = useState(0);
  const [quality, setQuality] = useState(72);
  const [extra, setExtra] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FlowResult>();
  const [dragging, setDragging] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => controller.current?.abort(), []);

  const options = outputs ?? flow.outputs;
  const state: FlowState = { files, output, quality, extra, selectedPages, working: phase === 'working' };
  const blocked =
    phase === 'working'
      ? 'Working…'
      : files.length === 0
        ? 'Choose a file first'
        : runBlocked?.(state);
  const pages = source.pages ?? [];
  const selectable = Boolean(pagesSelectable?.(state)) && pages.length > 0;
  const actions: FlowActions = { setFiles };

  function reset() {
    controller.current?.abort();
    setFiles([]);
    setSource({ meta: '', pages: [] });
    setSelectedPages([]);
    setPhase('idle');
    setPct(0);
    setError('');
    setResult(undefined);
  }

  async function receive(next: File[]) {
    if (!next.length) return;
    try {
      assertFilesAllowed(next, policy);
    } catch (reason) {
      setError(reason instanceof FileInputError ? reason.message : 'Those files could not be added.');
      return;
    }
    setError('');
    setFiles(next);
    setPhase('ready');
    setResult(undefined);
    setPct(0);
    const fallback = { meta: next.map((file) => formatBytes(file.size)).join(' · '), pages: [] };
    if (!describe) {
      setSource(fallback);
      return;
    }
    try {
      const described = await describe(next);
      setSource(described);
      setSelectedPages(described.pages?.map((_, index) => index + 1) ?? []);
    } catch (reason) {
      setFiles([]);
      setPhase('idle');
      setSource(fallback);
      setError(reason instanceof Error ? reason.message : 'That file could not be read.');
    }
  }

  async function run() {
    const next = new AbortController();
    controller.current = next;
    setPhase('working');
    setPct(0);
    setError('');
    try {
      const produced = await onRun({
        ...state,
        working: true,
        signal: next.signal,
        report: (fraction) => setPct(Math.max(0, Math.min(99, Math.round(fraction * 100)))),
      });
      setResult(produced);
      setPct(100);
      setPhase('done');
    } catch (reason) {
      if ((reason as Error).name === 'AbortError') {
        setPhase('ready');
        setPct(0);
        return;
      }
      setPhase('ready');
      setError(reason instanceof Error ? reason.message : `${tool.name} could not finish.`);
    }
  }

  return (
    <div className="flow scroll">
      <section className="flow-panel g flow-source" aria-labelledby={`${inputId}-source`}>
        <p className="panel-label" id={`${inputId}-source`}>1 · Source</p>

        {files.length === 0 ? (
          <div
            className="flow-drop"
            data-dragging={dragging}
            data-testid="dropzone"
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void receive(Array.from(event.dataTransfer.files));
            }}
          >
            <label className="flow-drop-target" htmlFor={inputId}>
              <span className="flow-drop-mark drift" aria-hidden="true">
                <ToolMark tool={tool.id} />
              </span>
              <strong>Drop a file, or click to choose</strong>
              <span className="flow-drop-accept">{tool.accept.join(' · ')}</span>
              <span className="flow-drop-size">{tool.maxSize}</span>
            </label>
            <input
              className="sr-only"
              id={inputId}
              type="file"
              aria-label={inputLabel}
              accept={[...policy.accept, ...policy.extensions.map((extension) => `.${extension}`)].join(',')}
              multiple={policy.maxFiles > 1}
              onChange={(event) => {
                const chosen = Array.from(event.target.files ?? []);
                event.target.value = '';
                void receive(chosen);
              }}
            />
          </div>
        ) : (
          <div className="flow-loaded">
            <div className="flow-file gi fu">
              <span className="flow-file-mark" aria-hidden="true">
                <ToolMark tool={tool.id} />
              </span>
              <span className="flow-file-name">
                <strong>{files.map((file) => file.name).join(', ')}</strong>
                <span>{source.meta}</span>
              </span>
              <button className="flow-remove ctl" type="button" onClick={reset}>
                Remove
              </button>
            </div>

            {sourceExtra?.(state, actions)}

            {pages.length ? (
              <div className="flow-preview gi">
                <p className="panel-label">Preview</p>
                <div className="flow-pages scroll">
                  {pages.map((label, index) => {
                    const page = index + 1;
                    const on = selectedPages.includes(page);
                    const sheet = (
                      <>
                        <span className="flow-page-bar" />
                        <span className="flow-page-bar is-light" />
                        <span className="flow-page-bar is-light is-short" />
                        <span className="flow-page-fill" />
                        <span className="flow-page-label">{label}</span>
                      </>
                    );
                    return selectable ? (
                      <button
                        className="flow-page ctl"
                        type="button"
                        key={label}
                        aria-pressed={on}
                        data-selected={on}
                        onClick={() =>
                          setSelectedPages((current) =>
                            current.includes(page)
                              ? current.filter((value) => value !== page)
                              : [...current, page].sort((a, b) => a - b),
                          )
                        }
                      >
                        {sheet}
                      </button>
                    ) : (
                      <span className="flow-page" key={label}>
                        {sheet}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="flow-panel g flow-settings" aria-labelledby={`${inputId}-settings`}>
        <p className="panel-label" id={`${inputId}-settings`}>2 · Settings</p>

        <fieldset className="flow-options">
          <legend>{flow.outputLabel}</legend>
          {options.map((option, index) => (
            <label className="flow-option ctl" key={`${option.label}-${option.note}`}>
              <input
                type="radio"
                name={`${inputId}-output`}
                checked={output === index}
                onChange={() => setOutput(index)}
              />
              <span className="flow-radio" aria-hidden="true" />
              <span className="flow-option-label">{option.label}</span>
              <span className="flow-option-note">{option.note}</span>
            </label>
          ))}
        </fieldset>

        {flow.quality ? (
          <div className="flow-quality">
            <div className="flow-quality-head">
              <label htmlFor={`${inputId}-quality`}>{flow.quality}</label>
              <strong>{formatQuality(quality)}</strong>
            </div>
            <input
              id={`${inputId}-quality`}
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
          </div>
        ) : null}
        <p className="flow-hint">{flow.qualityHint}</p>

        {flow.extra ? (
          <label className="flow-extra">
            <input type="checkbox" checked={extra} onChange={(event) => setExtra(event.target.checked)} />
            <span>{flow.extra}</span>
          </label>
        ) : null}

        {settings?.(state, actions)}

        <button className="button button-primary flow-run" type="button" disabled={Boolean(blocked)} onClick={run}>
          {blocked ?? flow.runLabel}
        </button>
      </section>

      <section className="flow-panel g flow-result" aria-labelledby={`${inputId}-result`}>
        <p className="panel-label" id={`${inputId}-result`}>3 · Result</p>

        {phase === 'idle' || phase === 'ready' ? (
          <div className="flow-empty">
            <span className="flow-crosshair spin" aria-hidden="true">
              <span />
              <span />
            </span>
            <p>Nothing yet. The result appears here and downloads straight to your device.</p>
          </div>
        ) : null}

        {phase === 'working' ? (
          <div className="flow-working">
            <div>
              <div className="flow-working-head">
                <strong>{stageLabel(pct, flow.runLabel)}</strong>
                <span>{pct}%</span>
              </div>
              <div
                className="flow-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label={`${tool.name} progress`}
              >
                <div className="flow-fill" style={{ width: `${pct}%` }} />
                <div className="flow-sweep sweep" aria-hidden="true" />
              </div>
            </div>
            <ul className="flow-log">
              <li>
                <span aria-hidden="true">✓</span> Loaded into memory in this tab
              </li>
              <li>
                <span aria-hidden="true">{pct > 40 ? '✓' : '·'}</span> {workLog}
              </li>
              <li>
                <span aria-hidden="true">{pct > 80 ? '✓' : '·'}</span> Assembling the output
              </li>
            </ul>
            <p className="flow-running-note">{runningNote}</p>
            <p className="sr-only" role="status">
              {stageLabel(pct, flow.runLabel)} {pct}%
            </p>
            <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>
              Cancel
            </button>
          </div>
        ) : null}

        {phase === 'done' && result ? (
          <div className="flow-done">
            <div className="flow-done-head fu">
              <span className="cmyk-num flow-figure">
                <span className="paper">{result.figure}</span>
                <span className="plate plate-c" aria-hidden="true">{result.figure}</span>
                <span className="plate plate-m" aria-hidden="true">{result.figure}</span>
                <span className="plate plate-y" aria-hidden="true">{result.figure}</span>
              </span>
              <div>
                <strong>{result.title}</strong>
                <span>{result.meta}</span>
              </div>
            </div>
            <div className="flow-sheet-wrap gi">
              <div className="flow-sheet">
                {result.text === undefined ? (
                  <>
                    <span className="flow-sheet-bar is-title" />
                    <span className="flow-sheet-bar" />
                    <span className="flow-sheet-bar" />
                    <span className="flow-sheet-bar is-short" />
                    <span className="flow-sheet-bar is-light" />
                    <span className="flow-sheet-fill" />
                    <span className="flow-sheet-bar is-light is-short" />
                  </>
                ) : (
                  <p className="flow-sheet-text">{result.text.slice(0, 900)}</p>
                )}
              </div>
              <span className="flow-stamp stamp" aria-hidden="true">
                Done
              </span>
            </div>
            <div className="flow-actions">
              <button
                className="button button-primary flow-download"
                type="button"
                onClick={() => downloadBlob(result.blob, result.filename)}
              >
                Download {result.out ?? flow.out}
              </button>
              <button className="button button-secondary" type="button" onClick={reset}>
                Start over
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
