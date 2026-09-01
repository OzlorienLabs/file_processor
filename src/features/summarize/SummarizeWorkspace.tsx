import { useRef, useState } from 'react';

import { AiSettingsPanel } from '../../components/AiSettings/AiSettingsPanel';
import { FileDropzone } from '../../components/FileDropzone/FileDropzone';
import { TextResult } from '../../components/TextResult/TextResult';
import {
  effectiveModel,
  isValidModelId,
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from '../../lib/ai-settings';
import { formatBytes, safeBaseName } from '../../lib/files';
import type { NamedBlob } from '../../lib/pdf';
import { summarizeText, type SummaryDetail } from '../../lib/summarize';
import { extractText } from '../../lib/text-extract';

const MB = 1024 * 1024;
const policy = {
  accept: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ],
  extensions: ['pdf', 'docx', 'txt', 'md'],
  maxBytes: 25 * MB,
  maxFiles: 1,
};

const detailChoices: Array<{ id: SummaryDetail; label: string; hint: string }> = [
  { id: 'brief', label: 'Brief', hint: 'A handful of bullet points' },
  { id: 'balanced', label: 'Balanced', hint: 'A few short paragraphs' },
  { id: 'detailed', label: 'Detailed', hint: 'Structured sections covering everything important' },
];

export function SummarizeWorkspace() {
  const [file, setFile] = useState<File>();
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [detail, setDetail] = useState<SummaryDetail>('balanced');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<string>();
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  const updateSettings = (next: AiSettings) => {
    setSettings(next);
    saveAiSettings(next);
  };

  const reset = () => {
    controller.current?.abort();
    setFile(undefined);
    setProgress('');
    setResult(undefined);
    setError('');
    setIsWorking(false);
  };

  const model = effectiveModel(settings);
  const canStart = Boolean(file && settings.apiKey.trim() && model && isValidModelId(model));

  const summarize = async () => {
    if (!file || !canStart) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setError('');
    setIsWorking(true);
    setProgress('Reading the document on this device');
    try {
      const text = await extractText(
        file as NamedBlob,
        undefined,
        nextController.signal,
        (completed, total) => setProgress(`Reading page ${completed} of ${total} on this device`),
      );
      const summary = await summarizeText(text, {
        provider: settings.provider,
        model,
        apiKey: settings.apiKey.trim(),
        detail,
        signal: nextController.signal,
        onProgress: setProgress,
      });
      setResult(summary);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setError(reason instanceof Error ? reason.message : 'The document could not be summarized.');
      }
    } finally {
      setIsWorking(false);
      setProgress('');
    }
  };

  if (result !== undefined && file) {
    return (
      <TextResult
        title="Summary ready"
        label="Summary"
        text={result}
        filename={`${safeBaseName(file.name)}-summary.txt`}
        onReset={reset}
      />
    );
  }

  return (
    <div aria-busy={isWorking}>
      <FileDropzone
        id="summarize-file"
        label="Choose a file to summarize"
        hint="PDF · DOCX · TXT · Markdown — up to 25 MB"
        policy={policy}
        disabled={isWorking}
        onFiles={([nextFile]) => {
          setFile(nextFile);
          setError('');
        }}
      />
      {file ? (
        <div className="workflow-controls">
          <div className="control-heading">
            <div><strong>{file.name}</strong><p>{formatBytes(file.size)}</p></div>
            <span>Ready</span>
          </div>
          <AiSettingsPanel settings={settings} onChange={updateSettings} disabled={isWorking} />
          <fieldset className="choice-group">
            <legend>Summary detail</legend>
            {detailChoices.map((choice) => (
              <label key={choice.id}>
                <input
                  type="radio"
                  name="summary-detail"
                  checked={detail === choice.id}
                  disabled={isWorking}
                  onChange={() => setDetail(choice.id)}
                />
                <span><strong>{choice.label}</strong><small>{choice.hint}</small></span>
              </label>
            ))}
          </fieldset>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          {isWorking && progress ? <p className="progress-note" role="status">{progress}</p> : null}
          <div className="workflow-actions">
            <button className="button button-primary" type="button" disabled={isWorking || !canStart} onClick={summarize}>
              {isWorking ? 'Summarizing…' : 'Summarize file'}
            </button>
            {isWorking ? (
              <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            ) : null}
          </div>
          {!settings.apiKey.trim() ? (
            <p className="empty-workspace">Add your provider API key above to enable summarizing.</p>
          ) : null}
        </div>
      ) : (
        <p className="empty-workspace">
          The document is read on this device; only its text goes to the AI provider you choose.
        </p>
      )}
    </div>
  );
}
