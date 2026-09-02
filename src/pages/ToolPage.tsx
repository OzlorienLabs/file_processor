import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { lazy, Suspense, type ComponentType } from 'react';
import { Link } from 'react-router-dom';

import type { ToolDefinition, ToolId } from '../app/tool-catalog';
import { describeProcessing } from './tool-disclosure';
import { AudioToTextWorkspace } from '../features/audio-to-text/AudioToTextWorkspace';
import { CompressionWorkspace } from '../features/compress/CompressionWorkspace';
import { ConvertWorkspace } from '../features/convert/ConvertWorkspace';
import { MergeWorkspace } from '../features/merge/MergeWorkspace';
import { OcrWorkspace } from '../features/ocr/OcrWorkspace';
import { PdfToWordWorkspace } from '../features/pdf-to-word/PdfToWordWorkspace';
import { SplitWorkspace } from '../features/split/SplitWorkspace';
import { SummarizeWorkspace } from '../features/summarize/SummarizeWorkspace';
import { WordToPdfWorkspace } from '../features/word-to-pdf/WordToPdfWorkspace';

// Editor tools are route-level chunks so their engines never reach the initial bundle.
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
  diagram: lazy(() => import('../features/diagram/DiagramWorkspace').then((m) => ({ default: m.DiagramWorkspace }))),
  diff: lazy(() => import('../features/diff/DiffWorkspace').then((m) => ({ default: m.DiffWorkspace }))),
  markdown: lazy(() => import('../features/markdown/MarkdownWorkspace').then((m) => ({ default: m.MarkdownWorkspace }))),
  notepad: lazy(() => import('../features/notepad/NotepadWorkspace').then((m) => ({ default: m.NotepadWorkspace }))),
  snippets: lazy(() => import('../features/snippets/SnippetsWorkspace').then((m) => ({ default: m.SnippetsWorkspace }))),
  mermaid: lazy(() => import('../features/mermaid/MermaidWorkspace').then((m) => ({ default: m.MermaidWorkspace }))),
  'snippet-generator': lazy(() =>
    import('../features/snippet-generator/SnippetGeneratorWorkspace').then((m) => ({ default: m.SnippetGeneratorWorkspace })),
  ),
};

function WorkspaceLoading({ name }: { name: string }) {
  return (
    <p className="progress-note" role="status">
      Loading the {name} workspace…
    </p>
  );
}

export function ToolPage({ tool }: { tool: ToolDefinition }) {
  const Workspace = workspaces[tool.id];
  const disclosure = describeProcessing(tool);
  const Icon = disclosure.icon;
  const width = tool.layout === 'wide' ? 'wide-page' : 'narrow-page';

  return (
    <main id="main-content" className="tool-page">
      <section className="tool-hero">
        <div className="shell narrow-page">
          <Link className="back-link" to="/en">
            <ArrowLeft aria-hidden="true" size={17} /> All tools
          </Link>
          <div className="processing-pill">
            <Icon aria-hidden="true" size={15} />
            {disclosure.pill}
          </div>
          <h1>{tool.name}</h1>
          <p className="lede">{tool.description}</p>
        </div>
      </section>

      <section className={`shell ${width} workspace-section`} aria-label={`${tool.name} workspace`}>
        <div className="privacy-note">
          <CheckCircle2 aria-hidden="true" size={19} />
          <p>{disclosure.note}</p>
        </div>
        <div className="workspace-card" data-layout={tool.layout ?? 'narrow'}>
          <Suspense fallback={<WorkspaceLoading name={tool.shortName} />}>
            <Workspace />
          </Suspense>
        </div>
      </section>

      <section className="shell narrow-page instructions-section" aria-labelledby="instructions-title">
        <p className="eyebrow">Quick instructions</p>
        <h2 id="instructions-title">{tool.howTo}</h2>
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
