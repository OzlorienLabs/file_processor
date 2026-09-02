import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { coreTools } from '../../app/tool-catalog';
import { FileToolFlow, type FlowRun } from '../../components/FileToolFlow/FileToolFlow';
import { formatBytes, safeBaseName } from '../../lib/files';
import {
  apiTranscribeModels,
  localWhisperModels,
  modelForQuality,
  toParagraphs,
  toSrt,
  toVtt,
  transcribeLanguages,
  transcribeLocally,
  transcribeViaApi,
} from '../../lib/transcribe';
import {
  clearTranscribeSettings,
  defaultTranscribeSettings,
  loadTranscribeSettings,
  saveTranscribeSettings,
  type TranscribeSettings,
} from '../../lib/transcribe-settings';

const MB = 1024 * 1024;
const policy = {
  accept: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac'],
  extensions: ['mp3', 'm4a', 'wav', 'webm', 'ogg', 'flac'],
  maxBytes: 100 * MB,
  maxFiles: 1,
};

const tool = coreTools.find((candidate) => candidate.id === 'audio-to-text')!;

/** Catalog transcript formats in order: plain text, SRT, VTT. */
const formats = [
  { extension: 'txt', type: 'text/plain;charset=utf-8', out: 'transcript' },
  { extension: 'srt', type: 'text/plain;charset=utf-8', out: 'subtitles' },
  { extension: 'vtt', type: 'text/vtt;charset=utf-8', out: 'captions' },
];

export function AudioToTextWorkspace() {
  const [settings, setSettings] = useState<TranscribeSettings>(() => loadTranscribeSettings());
  const [showKey, setShowKey] = useState(false);

  const local = settings.engine === 'local';

  function updateSettings(next: TranscribeSettings) {
    setSettings(next);
    saveTranscribeSettings(next);
  }

  async function run({ files, output, quality, extra, signal, report }: FlowRun) {
    const file = files[0];
    const transcription = await (local
      ? transcribeLocally(
          file,
          { model: modelForQuality(quality), languageCode: settings.languageCode },
          signal,
          (_label, fraction) => report(fraction ?? 0),
        )
      : transcribeViaApi(
          file,
          {
            model: settings.apiModel,
            languageCode: settings.languageCode,
            apiKey: settings.apiKey.trim(),
          },
          signal,
          (_label, fraction) => report(fraction ?? 0),
        )
    ).catch((reason: Error) => {
      if (reason.name === 'AbortError') throw reason;
      throw new Error(
        reason.message && reason.message !== 'Failed to fetch'
          ? reason.message
          : 'The recording could not be transcribed. Try a different engine or file.',
      );
    });

    const format = formats[output];
    const plain = extra
      ? toParagraphs(transcription.segments, transcription.text)
      : transcription.text;
    const text =
      output === 1
        ? toSrt(transcription.segments)
        : output === 2
          ? toVtt(transcription.segments)
          : plain;

    return {
      blob: new Blob([text], { type: format.type }),
      filename: `${safeBaseName(file.name)}.${format.extension}`,
      figure: transcription.segments.length ? String(transcription.segments.length) : '✓',
      title: 'Transcribe complete',
      meta: `${transcription.segments.length} segments · ${local ? 'transcribed on this device' : 'transcribed with your OpenAI key'}`,
      out: format.out,
      text,
    };
  }

  return (
    <FileToolFlow
      tool={tool}
      policy={policy}
      inputLabel="Choose audio to transcribe"
      describe={(files) => ({ meta: formatBytes(files[0].size) })}
      formatQuality={(value) =>
        localWhisperModels.find((model) => model.id === modelForQuality(value))?.label ?? ''
      }
      workLog={local ? 'Speech model running on this device' : 'Audio chunks sent to OpenAI with your key'}
      runningNote={
        local
          ? 'Running on this device. Closing the tab cancels it and keeps nothing.'
          : 'Audio is sent to OpenAI in short chunks using your own key. Nothing is kept here.'
      }
      settings={() => (
        <>
          <fieldset className="choice-group">
            <legend>Transcription engine</legend>
            <label>
              <input
                type="radio"
                name="transcribe-engine"
                checked={local}
                onChange={() => updateSettings({ ...settings, engine: 'local' })}
              />
              <span>
                <strong>On this device</strong>
                <small>Free and private. Downloads a speech model on first use; slower for long recordings.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="transcribe-engine"
                checked={!local}
                onChange={() => updateSettings({ ...settings, engine: 'api' })}
              />
              <span>
                <strong>With my OpenAI API key</strong>
                <small>Faster and more accurate. Audio is sent to OpenAI in short chunks.</small>
              </span>
            </label>
          </fieldset>

          {local ? null : (
            <>
              <label className="field-label" htmlFor="api-transcribe-model">
                Transcription model
                <select
                  id="api-transcribe-model"
                  value={settings.apiModel}
                  onChange={(event) => updateSettings({ ...settings, apiModel: event.target.value })}
                >
                  {apiTranscribeModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label" htmlFor="transcribe-key">
                OpenAI API key
                <span className="input-with-suffix">
                  <input
                    id="transcribe-key"
                    type={showKey ? 'text' : 'password'}
                    value={settings.apiKey}
                    autoComplete="off"
                    placeholder="An OpenAI API key from platform.openai.com"
                    onChange={(event) => updateSettings({ ...settings, apiKey: event.target.value })}
                  />
                  <button
                    className="inline-icon-button"
                    type="button"
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    onClick={() => setShowKey((value) => !value)}
                  >
                    {showKey ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                  </button>
                </span>
              </label>
              <div className="ai-settings-footer">
                <label className="acknowledge-row">
                  <input
                    type="checkbox"
                    checked={settings.remember}
                    onChange={(event) => updateSettings({ ...settings, remember: event.target.checked })}
                  />
                  <span>Remember my engine, model, and key in this browser.</span>
                </label>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    clearTranscribeSettings();
                    setSettings({ ...defaultTranscribeSettings, engine: 'api', remember: false });
                  }}
                >
                  <Trash2 aria-hidden="true" size={16} /> Forget key on this device
                </button>
              </div>
            </>
          )}

          <label className="field-label" htmlFor="transcribe-language">
            Spoken language
            <select
              id="transcribe-language"
              value={settings.languageCode}
              onChange={(event) => updateSettings({ ...settings, languageCode: event.target.value })}
            >
              {transcribeLanguages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      runBlocked={() => (!local && !settings.apiKey.trim() ? 'Add your OpenAI key' : undefined)}
      onRun={run}
    />
  );
}
