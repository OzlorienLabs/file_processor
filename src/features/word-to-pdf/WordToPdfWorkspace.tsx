import { useRef, useState } from 'react';

import { FileDropzone } from '../../components/FileDropzone/FileDropzone';
import { ResultDownload } from '../../components/ResultDownload/ResultDownload';
import { formatBytes, safeBaseName } from '../../lib/files';
import { convertDocxToPdf } from '../../lib/docx-convert';
import type { NamedBlob } from '../../lib/pdf';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  extensions: ['docx'],
  maxBytes: 25 * MB,
  maxFiles: 1,
};

export function WordToPdfWorkspace() {
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<Blob>();
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  const reset = () => {
    controller.current?.abort();
    setFile(undefined);
    setResult(undefined);
    setError('');
    setIsWorking(false);
  };

  const convert = async () => {
    if (!file) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setError('');
    setIsWorking(true);
    try {
      const bytes = await convertDocxToPdf(file as NamedBlob, undefined, nextController.signal);
      setResult(new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }));
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setError('This DOCX could not be converted. It may be damaged or password protected.');
      }
    } finally {
      setIsWorking(false);
    }
  };

  if (result && file) {
    return (
      <ResultDownload
        blob={result}
        filename={`${safeBaseName(file.name)}.pdf`}
        label="Download PDF"
        onReset={reset}
      />
    );
  }

  return (
    <div aria-busy={isWorking}>
      <FileDropzone
        id="word-to-pdf-file"
        label="Choose a Word document"
        hint="DOCX — up to 25 MB"
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
          <p className="fidelity-note">
            Text, headings, and lists convert cleanly. Complex Word layouts such as columns,
            text boxes, and embedded charts are simplified.
          </p>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <div className="workflow-actions">
            <button className="button button-primary" type="button" disabled={isWorking} onClick={convert}>
              {isWorking ? 'Converting…' : 'Convert to PDF'}
            </button>
            {isWorking ? (
              <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="empty-workspace">Add a DOCX file. Conversion happens on this device.</p>
      )}
    </div>
  );
}
