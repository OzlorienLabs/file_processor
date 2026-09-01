import { useRef, useState } from 'react';

import { FileDropzone } from '../../components/FileDropzone/FileDropzone';
import { TextResult } from '../../components/TextResult/TextResult';
import { formatBytes, safeBaseName } from '../../lib/files';
import { ocrFile, ocrLanguages } from '../../lib/ocr';
import type { NamedBlob } from '../../lib/pdf';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'],
  maxBytes: 25 * MB,
  maxFiles: 1,
};

export function OcrWorkspace() {
  const [file, setFile] = useState<File>();
  const [language, setLanguage] = useState('eng');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<string>();
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  const reset = () => {
    controller.current?.abort();
    setFile(undefined);
    setProgress('');
    setResult(undefined);
    setError('');
    setIsWorking(false);
  };

  const start = async () => {
    if (!file) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setError('');
    setIsWorking(true);
    setProgress('Loading the recognition engine…');
    try {
      const text = await ocrFile(
        file as NamedBlob,
        language,
        undefined,
        nextController.signal,
        (label, ratio) => setProgress(`${label} — ${Math.round(ratio * 100)}%`),
      );
      setResult(text);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setError('The text could not be recognized. Try a sharper scan or a different language.');
      }
    } finally {
      setIsWorking(false);
      setProgress('');
    }
  };

  if (result !== undefined && file) {
    return (
      <TextResult
        title="Text extracted"
        label="Extracted text"
        text={result}
        filename={`${safeBaseName(file.name)}-ocr.txt`}
        onReset={reset}
      />
    );
  }

  return (
    <div aria-busy={isWorking}>
      <FileDropzone
        id="ocr-file"
        label="Choose a file for OCR"
        hint="PDF · PNG · JPG · WebP — up to 25 MB"
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
          <label className="field-label" htmlFor="ocr-language">
            Document language
            <select
              id="ocr-language"
              value={language}
              disabled={isWorking}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {ocrLanguages.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </select>
          </label>
          <p className="fidelity-note">
            The first run downloads the recognition engine and language data, then everything
            happens on this device. Clear, high-contrast scans read best.
          </p>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          {isWorking && progress ? <p className="progress-note" role="status">{progress}</p> : null}
          <div className="workflow-actions">
            <button className="button button-primary" type="button" disabled={isWorking} onClick={start}>
              {isWorking ? 'Recognizing…' : 'Start OCR'}
            </button>
            {isWorking ? (
              <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="empty-workspace">Add a scan, screenshot, or photo of text. OCR runs on this device.</p>
      )}
    </div>
  );
}
