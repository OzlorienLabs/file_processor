import { useRef, useState } from 'react';

import { FileDropzone } from '../../components/FileDropzone/FileDropzone';
import { ResultDownload } from '../../components/ResultDownload/ResultDownload';
import { formatBytes, makeOutputName } from '../../lib/files';
import type { NamedBlob } from '../../lib/pdf';
import { compressPdf } from '../../lib/pdf-compression';
import { compressImage, type CompressionLevel } from '../../lib/raster';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'],
  maxBytes: 100 * MB,
  maxFiles: 1,
};

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function CompressionWorkspace() {
  const [file, setFile] = useState<File>();
  const [level, setLevel] = useState<CompressionLevel>('balanced');
  const [pdfAcknowledged, setPdfAcknowledged] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ blob: Blob; filename: string }>();
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  const reset = () => {
    controller.current?.abort();
    setFile(undefined);
    setLevel('balanced');
    setPdfAcknowledged(false);
    setProgress('');
    setResult(undefined);
    setError('');
    setIsWorking(false);
  };

  const compress = async () => {
    if (!file) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setError('');
    setIsWorking(true);
    try {
      if (isPdf(file)) {
        const bytes = await compressPdf(
          file as NamedBlob,
          level,
          undefined,
          nextController.signal,
          (completed, total) => setProgress(`Compressing page ${completed} of ${total}`),
        );
        setResult({
          blob: new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }),
          filename: makeOutputName(file.name, 'compressed', 'pdf'),
        });
      } else {
        const compressed = await compressImage(file, level, undefined, nextController.signal);
        setResult({
          blob: compressed.blob,
          filename: makeOutputName(file.name, 'compressed', compressed.extension),
        });
      }
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setError(reason instanceof Error ? reason.message : 'The file could not be compressed.');
      }
    } finally {
      setIsWorking(false);
      setProgress('');
    }
  };

  if (result && file) {
    const saved = file.size - result.blob.size;
    return (
      <>
        <p className="savings-note">
          {saved > 0
            ? `${formatBytes(file.size)} → ${formatBytes(result.blob.size)} — ${Math.round((saved / file.size) * 100)}% smaller.`
            : 'The file was already efficiently compressed, so it did not get smaller.'}
        </p>
        <ResultDownload blob={result.blob} filename={result.filename} label="Download compressed file" onReset={reset} />
      </>
    );
  }

  const needsAcknowledgement = Boolean(file && isPdf(file) && !pdfAcknowledged);

  return (
    <div aria-busy={isWorking}>
      <FileDropzone
        id="compress-file"
        label="Choose a file to compress"
        hint="PDF · PNG · JPG · WebP — up to 100 MB"
        policy={policy}
        disabled={isWorking}
        onFiles={([nextFile]) => {
          setFile(nextFile);
          setPdfAcknowledged(false);
          setError('');
        }}
      />
      {file ? (
        <div className="workflow-controls">
          <div className="control-heading">
            <div><strong>{file.name}</strong><p>{formatBytes(file.size)} now — smaller in a moment.</p></div>
            <span>Ready</span>
          </div>
          <label className="field-label" htmlFor="compress-level">
            Compression strength
            <select id="compress-level" value={level} disabled={isWorking} onChange={(event) => setLevel(event.target.value as CompressionLevel)}>
              <option value="light">Light — best quality, modest savings</option>
              <option value="balanced">Balanced — good quality, solid savings</option>
              <option value="strong">Strong — smallest file, visible quality loss</option>
            </select>
          </label>
          {isPdf(file) ? (
            <label className="acknowledge-row">
              <input
                type="checkbox"
                checked={pdfAcknowledged}
                disabled={isWorking}
                onChange={(event) => setPdfAcknowledged(event.target.checked)}
              />
              <span>
                I understand PDF compression will flatten text and links into page images at the
                chosen quality.
              </span>
            </label>
          ) : null}
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          {isWorking && progress ? <p className="progress-note" role="status">{progress}</p> : null}
          <div className="workflow-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={isWorking || needsAcknowledgement}
              onClick={compress}
            >
              {isWorking ? 'Compressing…' : 'Compress file'}
            </button>
            {isWorking ? (
              <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="empty-workspace">Add a PDF or image. Compression happens on this device.</p>
      )}
    </div>
  );
}
