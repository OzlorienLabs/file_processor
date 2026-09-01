import { Download, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { FileDropzone } from '../../components/FileDropzone/FileDropzone';
import { TextResult } from '../../components/TextResult/TextResult';
import { formatBytes, safeBaseName } from '../../lib/files';
import {
  apiTranscribeModels,
  localWhisperModels,
  toSrt,
  transcribeLanguages,
  transcribeLocally,
  transcribeViaApi,
  type TranscriptionResult,
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

export function AudioToTextWorkspace() {
  const [file, setFile] = useState<File>();
  const [settings, setSettings] = useState<TranscribeSettings>(() => loadTranscribeSettings());
  const [showKey, setShowKey] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<TranscriptionResult>();
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  const updateSettings = (next: TranscribeSettings) => {
    setSettings(next);
    saveTranscribeSettings(next);
  };

  const reset = () => {
    controller.current?.abort();
    setFile(undefined);
    setProgress('');
    setResult(undefined);
    setError('');
    setIsWorking(false);
  };

  const srtUrl = useMemo(
    () =>
      result?.segments.length
        ? URL.createObjectURL(new Blob([toSrt(result.segments)], { type: 'text/plain' }))
        : '',
    [result],
  );

  const canStart = Boolean(file && (settings.engine === 'local' || settings.apiKey.trim()));

  const transcribe = async () => {
    if (!file || !canStart) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setError('');
    setIsWorking(true);
    try {
      const transcription =
        settings.engine === 'local'
          ? await transcribeLocally(
              file,
              { model: settings.localModel, languageCode: settings.languageCode },
              nextController.signal,
              setProgress,
            )
          : await transcribeViaApi(
              file,
              {
                model: settings.apiModel,
                languageCode: settings.languageCode,
                apiKey: settings.apiKey.trim(),
              },
              nextController.signal,
              setProgress,
            );
      setResult(transcription);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setError(
          reason instanceof Error && reason.message !== 'Failed to fetch'
            ? reason.message
            : 'The recording could not be transcribed. Try a different engine or file.',
        );
      }
    } finally {
      setIsWorking(false);
      setProgress('');
    }
  };

  if (result && file) {
    return (
      <>
        <TextResult
          title="Transcript ready"
          label="Transcript"
          text={result.text}
          filename={`${safeBaseName(file.name)}-transcript.txt`}
          onReset={reset}
        />
        {srtUrl ? (
          <p className="srt-row">
            <a className="text-link" href={srtUrl} download={`${safeBaseName(file.name)}.srt`}>
              <Download aria-hidden="true" size={16} /> Download subtitles (.srt)
            </a>
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div aria-busy={isWorking}>
      <FileDropzone
        id="audio-file"
        label="Choose audio to transcribe"
        hint="MP3 · M4A · WAV · WebM · OGG · FLAC — up to 100 MB"
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
          <fieldset className="choice-group">
            <legend>Transcription engine</legend>
            <label>
              <input
                type="radio"
                name="transcribe-engine"
                checked={settings.engine === 'local'}
                disabled={isWorking}
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
                checked={settings.engine === 'api'}
                disabled={isWorking}
                onChange={() => updateSettings({ ...settings, engine: 'api' })}
              />
              <span>
                <strong>With my OpenAI API key</strong>
                <small>Faster and more accurate. Audio is sent to OpenAI in short chunks.</small>
              </span>
            </label>
          </fieldset>
          {settings.engine === 'local' ? (
            <label className="field-label" htmlFor="whisper-model">
              Speech model
              <select
                id="whisper-model"
                value={settings.localModel}
                disabled={isWorking}
                onChange={(event) => updateSettings({ ...settings, localModel: event.target.value })}
              >
                {localWhisperModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="field-label" htmlFor="api-transcribe-model">
                Transcription model
                <select
                  id="api-transcribe-model"
                  value={settings.apiModel}
                  disabled={isWorking}
                  onChange={(event) => updateSettings({ ...settings, apiModel: event.target.value })}
                >
                  {apiTranscribeModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
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
              disabled={isWorking}
              onChange={(event) => updateSettings({ ...settings, languageCode: event.target.value })}
            >
              {transcribeLanguages.map((language) => (
                <option key={language.code} value={language.code}>{language.label}</option>
              ))}
            </select>
          </label>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          {isWorking && progress ? <p className="progress-note" role="status">{progress}</p> : null}
          <div className="workflow-actions">
            <button className="button button-primary" type="button" disabled={isWorking || !canStart} onClick={transcribe}>
              {isWorking ? 'Transcribing…' : 'Transcribe audio'}
            </button>
            {isWorking ? (
              <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="empty-workspace">
          Add a recording. By default it is transcribed entirely on this device.
        </p>
      )}
    </div>
  );
}
