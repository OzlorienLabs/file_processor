import { lazy, Suspense, type ComponentType } from 'react';

import type { ToolDefinition, ToolId } from '../app/tool-catalog';
import { AppShell } from '../components/AppShell/AppShell';
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

/** Every tool route is the same shell around its own workspace. */
export function ToolPage({ tool }: { tool: ToolDefinition }) {
  const Workspace = workspaces[tool.id];
  return (
    <AppShell key={tool.id} tool={tool}>
      <Suspense fallback={<WorkspaceLoading name={tool.shortName} />}>
        <Workspace />
      </Suspense>
    </AppShell>
  );
}
