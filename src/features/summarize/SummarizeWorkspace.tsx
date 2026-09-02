import { useState } from 'react';

import { coreTools } from '../../app/tool-catalog';
import { AiSettingsPanel } from '../../components/AiSettings/AiSettingsPanel';
import { FileToolFlow, type FlowRun } from '../../components/FileToolFlow/FileToolFlow';
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

const tool = coreTools.find((candidate) => candidate.id === 'summarize')!;

/** Catalog shapes in order: Key points, Executive brief, Section by section, Plain summary. */
const shapes: SummaryDetail[] = ['brief', 'balanced', 'detailed', 'plain'];

export function SummarizeWorkspace() {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());

  const model = effectiveModel(settings);
  const ready = Boolean(settings.apiKey.trim() && model && isValidModelId(model));

  function updateSettings(next: AiSettings) {
    setSettings(next);
    saveAiSettings(next);
  }

  async function run({ files, output, signal, report }: FlowRun) {
    const file = files[0];
    // Reading the document is local; only the extracted text leaves, and only then.
    const text = await extractText(file as NamedBlob, undefined, signal, (done, total) =>
      report((done / total) * 0.4),
    );
    report(0.45);
    const summary = await summarizeText(text, {
      provider: settings.provider,
      model,
      apiKey: settings.apiKey.trim(),
      detail: shapes[output],
      signal,
      onProgress: () => report(0.75),
    });
    return {
      blob: new Blob([summary], { type: 'text/plain;charset=utf-8' }),
      filename: `${safeBaseName(file.name)}-summary.txt`,
      figure: '✓',
      title: 'Summarize complete',
      meta: `${summary.length.toLocaleString()} characters from ${text.length.toLocaleString()} of source text`,
      text: summary,
    };
  }

  return (
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose a file to summarize"
      describe={(files) => ({ meta: formatBytes(files[0].size) })}
      workLog="Extracted text sent to your provider with your key"
      runningNote="The file is read on this device. Only its text reaches the provider you chose."
      settings={() => (
        <>
          <AiSettingsPanel settings={settings} onChange={updateSettings} />
          {ready ? null : (
            <p className="inline-note">Add your provider API key above to enable summarizing.</p>
          )}
        </>
      )}
      runBlocked={() => (ready ? undefined : 'Add your provider key')}
      onRun={run}
    />
  );
}
