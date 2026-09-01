import { ArrowLeft, CheckCircle2, HardDrive, Sparkles } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';

import type { ToolDefinition, ToolId } from '../app/tool-catalog';
import { FileDropzone } from '../components/FileDropzone/FileDropzone';
import { CompressionWorkspace } from '../features/compress/CompressionWorkspace';
import { ConvertWorkspace } from '../features/convert/ConvertWorkspace';
import { MergeWorkspace } from '../features/merge/MergeWorkspace';
import { OcrWorkspace } from '../features/ocr/OcrWorkspace';
import { PdfToWordWorkspace } from '../features/pdf-to-word/PdfToWordWorkspace';
import { SplitWorkspace } from '../features/split/SplitWorkspace';
import { SummarizeWorkspace } from '../features/summarize/SummarizeWorkspace';
import { WordToPdfWorkspace } from '../features/word-to-pdf/WordToPdfWorkspace';
import { formatBytes, type FilePolicy } from '../lib/files';

const workspaces: Partial<Record<ToolId, ComponentType>> = {
  merge: MergeWorkspace,
  split: SplitWorkspace,
  compress: CompressionWorkspace,
  'word-to-pdf': WordToPdfWorkspace,
  'pdf-to-word': PdfToWordWorkspace,
  convert: ConvertWorkspace,
  ocr: OcrWorkspace,
  summarize: SummarizeWorkspace,
};

const MB = 1024 * 1024;

function policyFor(tool: ToolDefinition): FilePolicy {
  const commonImages = ['image/png', 'image/jpeg', 'image/webp'];
  switch (tool.id) {
    case 'merge':
      return { accept: ['application/pdf', ...commonImages], extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'], maxBytes: 100 * MB, maxFiles: 20, minFiles: 2, maxTotalBytes: 150 * MB };
    case 'ocr':
      return { accept: ['application/pdf', ...commonImages], extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'], maxBytes: 25 * MB, maxFiles: 1 };
    case 'summarize':
      return { accept: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'], extensions: ['pdf', 'docx', 'txt', 'md'], maxBytes: 25 * MB, maxFiles: 1 };
    case 'audio-to-text':
      return { accept: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/flac'], extensions: ['mp3', 'm4a', 'wav', 'webm', 'ogg', 'flac'], maxBytes: 100 * MB, maxFiles: 1 };
    case 'compress':
      return { accept: ['application/pdf', ...commonImages], extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'], maxBytes: 100 * MB, maxFiles: 1 };
    case 'word-to-pdf':
      return { accept: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], extensions: ['docx'], maxBytes: 25 * MB, maxFiles: 1 };
    case 'split':
    case 'pdf-to-word':
      return { accept: ['application/pdf'], extensions: ['pdf'], maxBytes: tool.id === 'split' ? 100 * MB : 50 * MB, maxFiles: 1 };
    case 'convert':
      return { accept: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', ...commonImages, 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'], extensions: ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'mp3', 'wav', 'webm', 'ogg'], maxBytes: 100 * MB, maxFiles: 1 };
  }
}

function uploadLabel(tool: ToolDefinition): string {
  if (tool.id === 'merge') return 'Choose files to merge';
  if (tool.id === 'ocr') return 'Choose a file for OCR';
  if (tool.id === 'audio-to-text') return 'Choose audio to transcribe';
  return `Choose a file to ${tool.shortName.toLowerCase()}`;
}

export function ToolPage({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const isLocal = tool.processing === 'browser';
  const Workspace = workspaces[tool.id];

  return (
    <main id="main-content" className="tool-page">
      <section className="tool-hero">
        <div className="shell narrow-page">
          <Link className="back-link" to="/en">
            <ArrowLeft aria-hidden="true" size={17} /> All tools
          </Link>
          <div className="processing-pill">
            {isLocal ? <HardDrive aria-hidden="true" size={15} /> : <Sparkles aria-hidden="true" size={15} />}
            {isLocal ? 'Runs in your browser' : 'Browser + your AI provider'}
          </div>
          <h1>{tool.name}</h1>
          <p className="lede">{tool.description}</p>
        </div>
      </section>

      <section className="shell narrow-page workspace-section" aria-label={`${tool.name} workspace`}>
        <div className="privacy-note">
          <CheckCircle2 aria-hidden="true" size={19} />
          <p>
            {isLocal
              ? 'Your files stay on this device. Processing happens in browser memory and disappears when you close or refresh this page.'
              : 'The file is read locally. Only the content needed for this AI task is sent to the provider you select; FileKit does not save it.'}
          </p>
        </div>
        <div className="workspace-card">
          {Workspace ? <Workspace /> : <>
          <FileDropzone
            id={`${tool.id}-files`}
            label={uploadLabel(tool)}
            hint={`${tool.accept.join(' · ')} — ${tool.maxSize}`}
            policy={policyFor(tool)}
            onFiles={setFiles}
          />
          {files.length ? (
            <ul className="selected-files" aria-label="Selected files">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`}>
                  <span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
                  <CheckCircle2 aria-label="Ready" size={20} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-workspace">Nothing leaves this page until you start the task.</p>
          )}
          </>}
        </div>
      </section>

      <section className="shell narrow-page instructions-section" aria-labelledby="instructions-title">
        <p className="eyebrow">Quick instructions</p>
        <h2 id="instructions-title">How to {tool.shortName.toLowerCase()}</h2>
        <ol className="instruction-grid">
          {tool.steps.map((step, index) => (
            <li data-testid="instruction-step" key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
