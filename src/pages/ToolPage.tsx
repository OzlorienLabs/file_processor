import { ArrowLeft, CheckCircle2, HardDrive, Sparkles } from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';

import type { ToolDefinition, ToolId } from '../app/tool-catalog';
import { AudioToTextWorkspace } from '../features/audio-to-text/AudioToTextWorkspace';
import { CompressionWorkspace } from '../features/compress/CompressionWorkspace';
import { ConvertWorkspace } from '../features/convert/ConvertWorkspace';
import { MergeWorkspace } from '../features/merge/MergeWorkspace';
import { OcrWorkspace } from '../features/ocr/OcrWorkspace';
import { PdfToWordWorkspace } from '../features/pdf-to-word/PdfToWordWorkspace';
import { SplitWorkspace } from '../features/split/SplitWorkspace';
import { SummarizeWorkspace } from '../features/summarize/SummarizeWorkspace';
import { WordToPdfWorkspace } from '../features/word-to-pdf/WordToPdfWorkspace';

const workspaces: Record<ToolId, ComponentType> = {
  merge: MergeWorkspace,
  split: SplitWorkspace,
  compress: CompressionWorkspace,
  'word-to-pdf': WordToPdfWorkspace,
  'pdf-to-word': PdfToWordWorkspace,
  convert: ConvertWorkspace,
  ocr: OcrWorkspace,
  summarize: SummarizeWorkspace,
  'audio-to-text': AudioToTextWorkspace,
};

export function ToolPage({ tool }: { tool: ToolDefinition }) {
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
          <Workspace />
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
