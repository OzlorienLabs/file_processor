import { BookmarkPlus, Check, Copy, Download, FolderDown, Search, Trash2, WandSparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { AiSettingsPanel } from '../../components/AiSettings/AiSettingsPanel';
import { CodeBlock } from '../../components/CodeBlock/CodeBlock';
import { useLocalCollection } from '../../hooks/useLocalCollection';
import { effectiveModel, isValidModelId, loadAiSettings, saveAiSettings, type AiSettings } from '../../lib/ai-settings';
import { checkChromeAi, chromeAiHints, type ChromeAiAvailability } from '../../lib/chrome-ai';
import { copyText, downloadText, formatWhen } from '../../lib/download';
import { errorMessage, isAbortError } from '../../lib/errors';
import { languageOptions } from '../../lib/highlight';
import { createValueStore, stampNew } from '../../lib/local-store';
import {
  createGeneratedCollection,
  generatedTitle,
  generateSnippet,
  searchGenerated,
  type GeneratedSnippet,
} from '../../lib/snippet-generate';
import { createSnippet, createSnippetsCollection, snippetFilename } from '../../lib/snippets';

type EngineChoice = 'chrome' | 'provider';

const prefsStore = createValueStore({
  key: 'filekit.generator.v1',
  schema: z.object({ engine: z.enum(['chrome', 'provider']), language: z.string().min(1).max(40), explain: z.boolean() }),
  fallback: { engine: 'chrome' as EngineChoice, language: 'typescript', explain: true },
});
const history = createGeneratedCollection();
const savedSnippets = createSnippetsCollection();
const generationLanguages = languageOptions.filter((option) => option.id !== 'plaintext');

export function SnippetGeneratorWorkspace() {
  const store = useLocalCollection(history);
  const [prefs, setPrefs] = useState(() => prefsStore.load());
  const [ai, setAi] = useState<AiSettings>(() => loadAiSettings());
  const [availability, setAvailability] = useState<ChromeAiAvailability | 'checking'>('checking');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [progress, setProgress] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeneratedSnippet>();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    let live = true;
    checkChromeAi().then((state) => {
      if (live) setAvailability(state);
    });
    return () => {
      live = false;
      controller.current?.abort();
    };
  }, []);

  const visible = useMemo(() => searchGenerated(store.items, query), [store.items, query]);

  const updatePrefs = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      prefsStore.save(next);
    } catch {
      // Preferences are a convenience; generation still works without persisting them.
    }
  };

  const updateAi = (next: AiSettings) => {
    setAi(next);
    saveAiSettings(next);
  };

  const model = effectiveModel(ai);
  const chromeReady = availability === 'available' || availability === 'downloadable' || availability === 'downloading';
  const providerReady = Boolean(ai.apiKey.trim() && model && isValidModelId(model));
  const engineReady = prefs.engine === 'chrome' ? chromeReady : providerReady;
  const canGenerate = description.trim().length > 0 && !isWorking && engineReady;

  const generate = async () => {
    const nextController = new AbortController();
    controller.current = nextController;
    setError('');
    setMessage('');
    setIsWorking(true);
    setProgress('Preparing the request');
    const request = { description: description.trim(), language: prefs.language, context: context.trim(), explain: prefs.explain };
    const engine = prefs.engine === 'chrome' ? 'chrome' : ai.provider;
    const usedModel = prefs.engine === 'chrome' ? 'gemini-nano' : model;
    try {
      const output = await generateSnippet(request, {
        engine,
        model: usedModel,
        apiKey: ai.apiKey.trim(),
        signal: nextController.signal,
        onProgress: setProgress,
      });
      const record: GeneratedSnippet = {
        ...stampNew(),
        ...request,
        engine,
        model: usedModel,
        code: output.code,
        explanation: output.explanation,
      };
      store.upsert(record);
      setResult(record);
    } catch (reason) {
      if (!isAbortError(reason)) setError(errorMessage(reason, 'The snippet could not be generated.'));
    } finally {
      setIsWorking(false);
      setProgress('');
    }
  };

  const openHistory = (item: GeneratedSnippet) => {
    setResult(item);
    setDescription(item.description);
    setContext(item.context);
    setShowContext(Boolean(item.context));
    updatePrefs({ language: item.language, explain: item.explain });
    setMessage('');
    setError('');
  };

  const copyCode = async (item: GeneratedSnippet) => {
    if (await copyText(item.code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const saveToSnippets = (item: GeneratedSnippet) => {
    try {
      savedSnippets.upsert(
        createSnippet({ title: generatedTitle(item.description), language: item.language, tags: ['generated'], code: item.code }),
      );
      setMessage('Saved to your snippets.');
    } catch (reason) {
      setError(errorMessage(reason, 'The snippet could not be saved.'));
    }
  };

  const deleteFromHistory = (item: GeneratedSnippet) => {
    store.remove(item.id);
    if (result?.id === item.id) setResult(undefined);
  };

  const clearHistory = () => {
    store.clear();
    setResult(undefined);
    setConfirmingClear(false);
    setMessage('History cleared from this browser.');
  };

  return (
    <div className="ed-grid generator" data-panes="generator">
      <section className="ed-pane g generator-main" data-pad="true" aria-label="Snippet generator" aria-busy={isWorking}>
        <fieldset className="choice-group engine-choice" disabled={isWorking}>
          <legend>Where the model runs</legend>
          <label>
            <input type="radio" name="engine" checked={prefs.engine === 'chrome'} onChange={() => updatePrefs({ engine: 'chrome' })} />
            <span>
              <strong>Chrome built-in AI (on this device)</strong>
              <small>{availability === 'checking' ? 'Checking availability…' : chromeAiHints[availability]}</small>
            </span>
          </label>
          <label>
            <input type="radio" name="engine" checked={prefs.engine === 'provider'} onChange={() => updatePrefs({ engine: 'provider' })} />
            <span>
              <strong>Cloud provider with your API key</strong>
              <small>OpenAI, Anthropic, or Google Gemini through FileKit's stateless proxy. Only the prompt is sent.</small>
            </span>
          </label>
        </fieldset>

        {prefs.engine === 'provider' ? <AiSettingsPanel settings={ai} onChange={updateAi} disabled={isWorking} /> : null}

        <div className="workflow-controls">
          <label className="field-label" htmlFor="generator-description">
            Describe the snippet you need
            <textarea
              id="generator-description"
              className="code-editor generator-description"
              value={description}
              disabled={isWorking}
              placeholder="e.g. A React hook that debounces a value with a configurable delay"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="ed-bar-inline">
            <label className="field-label" htmlFor="generator-language">
              Language
              <select id="generator-language" value={prefs.language} disabled={isWorking} onChange={(event) => updatePrefs({ language: event.target.value })}>
                {generationLanguages.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="option-row">
              <label>
                <input type="checkbox" checked={prefs.explain} disabled={isWorking} onChange={(event) => updatePrefs({ explain: event.target.checked })} />
                Include a short explanation
              </label>
              <label>
                <input type="checkbox" checked={showContext} disabled={isWorking} onChange={(event) => setShowContext(event.target.checked)} />
                Add context (types, existing code, constraints)
              </label>
            </div>
          </div>
          {showContext ? (
            <label className="field-label" htmlFor="generator-context">
              Extra context
              <textarea
                id="generator-context"
                className="code-editor generator-context"
                value={context}
                disabled={isWorking}
                placeholder="Paste related code or list constraints"
                onChange={(event) => setContext(event.target.value)}
              />
            </label>
          ) : null}
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="workflow-actions">
            <button className="button button-primary" type="button" disabled={!canGenerate} onClick={generate}>
              <WandSparkles aria-hidden="true" size={16} /> {isWorking ? 'Generating…' : result ? 'Generate again' : 'Generate snippet'}
            </button>
            {isWorking ? (
              <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            ) : null}
          </div>
          {!engineReady && !isWorking ? (
            <p className="ed-note">
              {prefs.engine === 'chrome'
                ? "Chrome's on-device model is not ready here. Switch to a cloud provider or enable the built-in AI."
                : 'Add your provider API key above to enable generating.'}
            </p>
          ) : null}
        </div>

        <p className="panel-label">Recent</p>
        <aside className="generator-history scroll" aria-label="Generation history">
          <label className="field-label" htmlFor="history-search">
            <span className="sr-only">Search history</span>
            <span className="input-with-suffix">
              <input id="history-search" value={query} placeholder="Search history" onChange={(event) => setQuery(event.target.value)} />
              <Search aria-hidden="true" size={15} />
            </span>
          </label>
        {visible.length ? (
          <ul>
            {visible.map((item) => (
              <li key={item.id}>
                <button type="button" aria-current={result?.id === item.id ? 'true' : undefined} onClick={() => openHistory(item)}>
                  <strong>{generatedTitle(item.description)}</strong>
                  <small>
                    {item.language} · {item.engine === 'chrome' ? 'on-device' : item.model} · {formatWhen(item.updatedAt)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="inline-note">{store.items.length ? 'Nothing in history matches that search.' : 'Generated snippets are kept here, in this browser only.'}</p>
        )}
        <div className="side-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={!store.items.length}
            onClick={() => downloadText(history.exportJson(), 'filekit-generated-snippets.json', 'application/json')}
          >
            <FolderDown aria-hidden="true" size={15} /> Export history
          </button>
          {confirmingClear ? (
            <span className="option-row">
              <span>Delete {store.items.length} entries?</span>
              <button className="button button-secondary" type="button" onClick={clearHistory}>
                Yes, clear
              </button>
              <button className="button button-secondary" type="button" onClick={() => setConfirmingClear(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button className="button button-secondary" type="button" disabled={!store.items.length} onClick={() => setConfirmingClear(true)}>
              <Trash2 aria-hidden="true" size={15} /> Clear history
            </button>
          )}
        </div>
        </aside>
        </section>

        <section className="ed-pane g generator-stage" data-pad="true" aria-label="Generated snippet">
        {isWorking ? (
          <div className="generator-busy">
            <span className="generator-spinner spin" aria-hidden="true" />
            <p role="status">{progress || 'Generating…'}</p>
          </div>
        ) : result ? (
          <article className="generator-result fi">
            <div className="control-heading">
              <div>
                <strong>{generatedTitle(result.description)}</strong>
                <p>
                  {result.language} · {result.engine === 'chrome' ? 'Chrome on-device model' : result.model} · {formatWhen(result.updatedAt)}
                </p>
              </div>
              <span>{result.engine === 'chrome' ? 'Stayed on device' : 'Via your key'}</span>
            </div>
            <CodeBlock code={result.code} language={result.language} />
            {result.explanation ? <p className="inline-note generator-explanation">{result.explanation}</p> : null}
            <div className="ed-bar-inline">
              <button className="button button-secondary" type="button" onClick={() => copyCode(result)}>
                {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
                {copied ? 'Copied' : 'Copy code'}
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => downloadText(result.code, snippetFilename({ title: generatedTitle(result.description), language: result.language }))}
              >
                <Download aria-hidden="true" size={15} /> Download
              </button>
              <button className="button button-secondary" type="button" onClick={() => saveToSnippets(result)}>
                <BookmarkPlus aria-hidden="true" size={15} /> Save to snippets
              </button>
              <button className="button button-secondary" type="button" onClick={() => deleteFromHistory(result)}>
                <Trash2 aria-hidden="true" size={15} /> Remove from history
              </button>
            </div>
          </article>
        ) : (
          <p className="ed-note">
            Describe the snippet you need on the left. The result appears here and is kept in
            this browser only.
          </p>
        )}
        {store.error ? (
          <p className="field-error" role="alert">
            {store.error}
          </p>
        ) : null}
        {message ? (
          <p className="ed-status" role="status">
            <span className="ed-pill gi">{message}</span>
          </p>
        ) : null}
      </section>
    </div>
  );
}
