import { useRef, useState } from 'react';

import { FileDropzone } from '../../components/FileDropzone/FileDropzone';
import { ResultDownload } from '../../components/ResultDownload/ResultDownload';
import { conversionsFor, type ConversionOption } from '../../lib/convert-map';
import { formatBytes } from '../../lib/files';

const MB = 1024 * 1024;
const policy = {
  accept: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
    'audio/flac',
  ],
  extensions: ['pdf', 'docx', 'txt', 'md', 'png', 'jpg', 'jpeg', 'webp', 'mp3', 'm4a', 'wav', 'webm', 'ogg', 'flac'],
  maxBytes: 100 * MB,
  maxFiles: 1,
};

export function ConvertWorkspace() {
  const [file, setFile] = useState<File>();
  const [options, setOptions] = useState<ConversionOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ blob: Blob; filename: string }>();
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  const reset = () => {
    controller.current?.abort();
    setFile(undefined);
    setOptions([]);
    setSelectedId('');
    setProgress('');
    setResult(undefined);
    setError('');
    setIsWorking(false);
  };

  const selectFile = ([nextFile]: File[]) => {
    const nextOptions = conversionsFor(nextFile);
    setFile(nextFile);
    setOptions(nextOptions);
    setSelectedId(nextOptions[0]?.id ?? '');
    setError(
      nextOptions.length
        ? ''
        : `${nextFile.name} has no supported conversions. Try a PDF, DOCX, text, image, or audio file.`,
    );
  };

  const convert = async () => {
    const option = options.find((candidate) => candidate.id === selectedId);
    if (!file || !option) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setError('');
    setIsWorking(true);
    try {
      setResult(
        await option.run(file, nextController.signal, (completed, total) =>
          setProgress(`Converting part ${completed} of ${total}`),
        ),
      );
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setError('This file could not be converted. It may be damaged or use an unsupported codec.');
      }
    } finally {
      setIsWorking(false);
      setProgress('');
    }
  };

  if (result) {
    return (
      <ResultDownload blob={result.blob} filename={result.filename} label="Download converted file" onReset={reset} />
    );
  }

  return (
    <div aria-busy={isWorking}>
      <FileDropzone
        id="convert-file"
        label="Choose a file to convert"
        hint="PDF · DOCX · TXT · Images · Audio — up to 100 MB"
        policy={policy}
        disabled={isWorking}
        onFiles={selectFile}
      />
      {file && options.length ? (
        <div className="workflow-controls">
          <div className="control-heading">
            <div><strong>{file.name}</strong><p>{formatBytes(file.size)}</p></div>
            <span>Ready</span>
          </div>
          <fieldset className="choice-group">
            <legend>Convert to</legend>
            {options.map((option) => (
              <label key={option.id}>
                <input
                  type="radio"
                  name="convert-target"
                  checked={selectedId === option.id}
                  disabled={isWorking}
                  onChange={() => setSelectedId(option.id)}
                />
                <span><strong>{option.label}</strong><small>{option.hint}</small></span>
              </label>
            ))}
          </fieldset>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          {isWorking && progress ? <p className="progress-note" role="status">{progress}</p> : null}
          <div className="workflow-actions">
            <button className="button button-primary" type="button" disabled={isWorking} onClick={convert}>
              {isWorking ? 'Converting…' : 'Convert file'}
            </button>
            {isWorking ? (
              <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          {!file ? (
            <p className="empty-workspace">Add a file to see its available formats. Everything converts on this device.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
