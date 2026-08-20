import { UploadCloud } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import {
  FileInputError,
  assertFilesAllowed,
  type FilePolicy,
} from '../../lib/files';

interface FileDropzoneProps {
  id: string;
  label: string;
  hint: string;
  policy: FilePolicy;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}

export function FileDropzone({
  id,
  label,
  hint,
  policy,
  disabled = false,
  onFiles,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const receiveFiles = (files: File[]) => {
    try {
      assertFilesAllowed(files, policy);
      setError('');
      onFiles(files);
    } catch (reason) {
      const message =
        reason instanceof FileInputError ? reason.message : 'Those files could not be added.';
      setError(message);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (!disabled) receiveFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="dropzone-wrap">
      <div
        className="dropzone"
        data-dragging={isDragging ? 'true' : 'false'}
        data-testid="dropzone"
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
      >
        <UploadCloud aria-hidden="true" size={32} strokeWidth={1.7} />
        <div>
          <strong>Drop files here</strong>
          <span>or choose from your device</span>
        </div>
        <label className="button button-primary" htmlFor={id}>
          {label}
        </label>
        <input
          className="sr-only"
          id={id}
          type="file"
          aria-label={label}
          accept={[
            ...policy.accept,
            ...policy.extensions.map((extension) => `.${extension}`),
          ].join(',')}
          multiple={policy.maxFiles > 1}
          disabled={disabled}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            receiveFiles(files);
            event.target.value = '';
          }}
        />
        <small>{hint}</small>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
