import { Check, Copy, Download, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface TextResultProps {
  title: string;
  label: string;
  text: string;
  filename: string;
  onReset: () => void;
}

export function TextResult({ title, label, text, filename, onReset }: TextResultProps) {
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(new Blob([value], { type: 'text/plain' }));
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [value]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="text-result" aria-live="polite">
      <div className="control-heading">
        <div><strong>{title}</strong><p>Review and edit before saving.</p></div>
        <span>{value.length.toLocaleString()} characters</span>
      </div>
      <textarea
        aria-label={label}
        rows={12}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="result-actions">
        <button className="button button-secondary" type="button" onClick={copy}>
          {copied ? <Check aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
          {copied ? 'Copied' : 'Copy text'}
        </button>
        <a className="button button-primary" href={url} download={filename}>
          <Download aria-hidden="true" size={17} /> Download text
        </a>
        <button className="button button-secondary" type="button" onClick={onReset}>
          <RotateCcw aria-hidden="true" size={17} /> Start over
        </button>
      </div>
    </section>
  );
}
