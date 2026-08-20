import { ArrowDown, ArrowUp, FileText, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import { FileDropzone } from '../../components/FileDropzone/FileDropzone';
import { ResultDownload } from '../../components/ResultDownload/ResultDownload';
import { formatBytes, safeBaseName } from '../../lib/files';
import { mergeToPdf, type NamedBlob } from '../../lib/pdf';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'],
  maxBytes: 100 * MB,
  maxFiles: 20,
  minFiles: 2,
  maxTotalBytes: 150 * MB,
};

export function MergeWorkspace() {
  const [files, setFiles] = useState<File[]>([]);
  const [outputName, setOutputName] = useState('merged-document');
  const [result, setResult] = useState<Blob>();
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  const reset = () => {
    controller.current?.abort();
    setFiles([]);
    setResult(undefined);
    setError('');
    setIsWorking(false);
  };

  const move = (index: number, delta: number) => {
    setFiles((current) => {
      const destination = index + delta;
      if (destination < 0 || destination >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[destination]] = [
        reordered[destination],
        reordered[index],
      ];
      return reordered;
    });
  };

  const merge = async () => {
    const nextController = new AbortController();
    controller.current = nextController;
    setError('');
    setIsWorking(true);
    try {
      const bytes = await mergeToPdf(files as NamedBlob[], nextController.signal);
      setResult(new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }));
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setError(reason instanceof Error ? reason.message : 'The files could not be merged.');
      }
    } finally {
      setIsWorking(false);
    }
  };

  if (result) {
    return (
      <ResultDownload
        blob={result}
        filename={`${safeBaseName(outputName)}.pdf`}
        label="Download merged PDF"
        onReset={reset}
      />
    );
  }

  return (
    <div aria-busy={isWorking}>
      <FileDropzone
        id="merge-files"
        label="Choose files to merge"
        hint="PDF · PNG · JPG · WebP — 20 files, 150 MB total"
        policy={policy}
        disabled={isWorking}
        onFiles={(nextFiles) => {
          setFiles(nextFiles);
          setError('');
        }}
      />
      {files.length ? (
        <div className="workflow-controls">
          <div className="control-heading">
            <div><strong>Arrange the pages</strong><p>Top to bottom becomes first to last.</p></div>
            <span>{files.length} files</span>
          </div>
          <ul className="file-order-list" aria-label="Files to merge">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${index}`}>
                <FileText aria-hidden="true" size={20} />
                <span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
                <div className="icon-actions">
                  <button type="button" disabled={index === 0 || isWorking} aria-label={`Move ${file.name} up`} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" /></button>
                  <button type="button" disabled={index === files.length - 1 || isWorking} aria-label={`Move ${file.name} down`} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" /></button>
                  <button type="button" disabled={isWorking} aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><Trash2 aria-hidden="true" /></button>
                </div>
              </li>
            ))}
          </ul>
          <label className="field-label" htmlFor="merge-output-name">
            Output filename
            <span className="input-with-suffix"><input id="merge-output-name" value={outputName} maxLength={80} onChange={(event) => setOutputName(event.target.value)} /><span>.pdf</span></span>
          </label>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <div className="workflow-actions">
            <button className="button button-primary" type="button" disabled={isWorking || files.length < 2} onClick={merge}>{isWorking ? 'Merging…' : `Merge ${files.length} files`}</button>
            {isWorking ? <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>Cancel</button> : null}
          </div>
        </div>
      ) : <p className="empty-workspace">Add at least two files. They never leave this browser.</p>}
    </div>
  );
}
