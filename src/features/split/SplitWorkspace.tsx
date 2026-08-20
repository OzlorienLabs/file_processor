import { useRef, useState } from 'react';

import { FileDropzone } from '../../components/FileDropzone/FileDropzone';
import { ResultDownload } from '../../components/ResultDownload/ResultDownload';
import { safeBaseName } from '../../lib/files';
import { parsePageSelection } from '../../lib/page-ranges';
import { getPdfPageCount, splitPdf, type NamedBlob } from '../../lib/pdf';

const MB = 1024 * 1024;
const policy = {
  accept: ['application/pdf'],
  extensions: ['pdf'],
  maxBytes: 100 * MB,
  maxFiles: 1,
};

type SplitMode = 'every' | 'selected';

export function SplitWorkspace() {
  const [file, setFile] = useState<File>();
  const [pageCount, setPageCount] = useState(0);
  const [mode, setMode] = useState<SplitMode>('every');
  const [selection, setSelection] = useState('');
  const [result, setResult] = useState<{ blob: Blob; filename: string }>();
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);

  const reset = () => {
    controller.current?.abort();
    setFile(undefined);
    setPageCount(0);
    setResult(undefined);
    setError('');
    setSelection('');
    setMode('every');
  };

  const selectFile = async ([nextFile]: File[]) => {
    setFile(nextFile);
    setPageCount(0);
    setError('');
    try {
      setPageCount(await getPdfPageCount(nextFile as NamedBlob));
    } catch {
      setFile(undefined);
      setError('This PDF could not be read. It may be encrypted or damaged.');
    }
  };

  const process = async () => {
    if (!file || !pageCount) return;
    try {
      const groups = mode === 'every'
        ? Array.from({ length: pageCount }, (_, index) => [index + 1])
        : [parsePageSelection(selection, pageCount)];
      const nextController = new AbortController();
      controller.current = nextController;
      setIsWorking(true);
      setError('');
      const outputs = await splitPdf(file as NamedBlob, groups, nextController.signal);
      const baseName = safeBaseName(file.name);

      if (outputs.length === 1) {
        const pages = groups[0].join('-');
        setResult({ blob: new Blob([Uint8Array.from(outputs[0])], { type: 'application/pdf' }), filename: `${baseName}-pages-${pages}.pdf` });
      } else {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        outputs.forEach((bytes, index) => zip.file(`${baseName}-page-${index + 1}.pdf`, Uint8Array.from(bytes)));
        setResult({ blob: await zip.generateAsync({ type: 'blob' }), filename: `${baseName}-split-pages.zip` });
      }
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'The PDF could not be split.');
    } finally {
      setIsWorking(false);
    }
  };

  if (result) return <ResultDownload blob={result.blob} filename={result.filename} label={result.filename.endsWith('.zip') ? 'Download split PDFs' : 'Download split PDF'} onReset={reset} />;

  return (
    <div aria-busy={isWorking}>
      <FileDropzone id="split-file" label="Choose a PDF to split" hint="PDF — up to 100 MB or 500 pages" policy={policy} disabled={isWorking} onFiles={selectFile} />
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {file && pageCount ? (
        <div className="workflow-controls">
          <div className="control-heading"><div><strong>{file.name}</strong><p>{pageCount} pages detected</p></div><span>Ready</span></div>
          <fieldset className="choice-group">
            <legend>How should we split it?</legend>
            <label><input type="radio" name="split-mode" checked={mode === 'every'} onChange={() => setMode('every')} /> <span><strong>Every page</strong><small>Create one PDF per page in a ZIP.</small></span></label>
            <label><input type="radio" name="split-mode" checked={mode === 'selected'} onChange={() => setMode('selected')} /> <span><strong>Selected pages</strong><small>Combine chosen pages into one new PDF.</small></span></label>
          </fieldset>
          {mode === 'selected' ? <label className="field-label" htmlFor="split-selection">Pages or ranges<input id="split-selection" placeholder="For example: 1-3, 5, 8" value={selection} onChange={(event) => setSelection(event.target.value)} /></label> : null}
          <div className="workflow-actions"><button className="button button-primary" type="button" disabled={isWorking || (mode === 'selected' && !selection.trim())} onClick={process}>{isWorking ? 'Splitting…' : 'Split PDF'}</button>{isWorking ? <button className="button button-secondary" type="button" onClick={() => controller.current?.abort()}>Cancel</button> : null}</div>
        </div>
      ) : null}
    </div>
  );
}
