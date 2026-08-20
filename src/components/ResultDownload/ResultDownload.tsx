import { Download, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formatBytes } from '../../lib/files';

interface ResultDownloadProps {
  blob: Blob;
  filename: string;
  label: string;
  onReset: () => void;
}

export function ResultDownload({ blob, filename, label, onReset }: ResultDownloadProps) {
  const [url] = useState(() => URL.createObjectURL(blob));

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <section className="result-panel" aria-live="polite">
      <div>
        <p className="eyebrow">Ready to save</p>
        <h3>{filename}</h3>
        <p>{formatBytes(blob.size)} · generated in this session</p>
      </div>
      <div className="result-actions">
        <a className="button button-primary" href={url} download={filename}>
          <Download aria-hidden="true" size={18} /> {label}
        </a>
        <button className="button button-secondary" type="button" onClick={onReset}>
          <RotateCcw aria-hidden="true" size={17} /> Start over
        </button>
      </div>
    </section>
  );
}
