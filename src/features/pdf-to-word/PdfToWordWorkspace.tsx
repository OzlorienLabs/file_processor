import { useRef, useState } from 'react';

import { FileDropzone } from '../../components/FileDropzone/FileDropzone';
import { ResultDownload } from '../../components/ResultDownload/ResultDownload';
import { formatBytes, safeBaseName } from '../../lib/files';
import type { NamedBlob } from '../../lib/pdf';
import { convertPdfToDocx } from '../../lib/pdf-to-docx';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf'],
  extensions: ['pdf'],
  maxBytes: 50 * MB,
  maxFiles: 1,
};

export function PdfToWordWorkspace() {
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<Blob>();
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

  const convert = async () => {
    if (!file) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setError('');
    setIsWorking(true);
    try {
      const blob = await convertPdfToDocx(
        file as NamedBlob,
        undefined,
        nextController.signal,
        (completed, total) => setProgress(`Extracting page ${completed} of ${total}`),
      );
      setResult(blob);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setError('This PDF could not be converted. It may be encrypted or contain no text layer.');
      }
    } finally {
      setIsWorking(false);
      setProgress('');
    }
  };

  if (result && file) {
    return (
      <ResultDownload
        blob={result}
        filename={`${safeBaseName(file.name)}.docx`}
        label="Download Word document"
        onReset={reset}
      />
    );
  }

  return (
    <div aria-busy={isWorking}>
      <FileDropzone
        id="pdf-to-word-file"
        label="Choose a PDF document"
        hint="PDF — up to 50 MB or 300 pages"
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
            The text of each page becomes editable Word paragraphs. Scanned PDFs without a text
            layer come out empty — run them through the OCR tool instead.
          </p>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          {isWorking && progress ? <p className="progress-note" role="status">{progress}</p> : null}
          <div className="workflow-actions">
            <button className="button button-primary" type="button" disabled={isWorking} onClick={convert}>
              {isWorking ? 'Converting…' : 'Convert to Word'}
            </button>
            {isWorking ? (
              <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="empty-workspace">Add a PDF file. Conversion happens on this device.</p>
      )}
    </div>
  );
}
