import { z } from 'zod';

import { createCollection, createValueStore, stampNew, storedRecordSchema, type Collection, type ValueStore } from './local-store';
import { MAX_MERMAID_CHARS } from './mermaid-render';
import { defaultMermaidCode } from './mermaid-samples';

export const savedDiagramSchema = storedRecordSchema.extend({
  name: z.string().min(1).max(120),
  code: z.string().max(MAX_MERMAID_CHARS),
});
export type SavedDiagram = z.infer<typeof savedDiagramSchema>;

export const MERMAID_KEY = 'filekit.mermaid.v1';
export const MERMAID_DRAFT_KEY = 'filekit.mermaid-draft.v1';
export const MAX_SAVED_DIAGRAMS = 200;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createDiagramCollection(storage?: StorageLike): Collection<SavedDiagram> {
  return createCollection<SavedDiagram>({ key: MERMAID_KEY, schema: savedDiagramSchema, max: MAX_SAVED_DIAGRAMS, storage });
}

export function createDiagramDraftStore(storage?: StorageLike): ValueStore<{ code: string }> {
  return createValueStore({
    key: MERMAID_DRAFT_KEY,
    schema: z.object({ code: z.string().max(MAX_MERMAID_CHARS) }),
    fallback: { code: defaultMermaidCode },
    storage,
  });
}

export function createSavedDiagram(name: string, code: string): SavedDiagram {
  return { ...stampNew(), name: name.trim() || suggestDiagramName(code), code };
}

/** "flowchart TD" → "Flowchart", "sequenceDiagram" → "Sequence diagram", else "Diagram". */
export function suggestDiagramName(code: string): string {
  const firstWord = code.trim().split(/\s+/)[0].replace(/-v\d+$/, '');
  const known: Record<string, string> = {
    flowchart: 'Flowchart',
    graph: 'Flowchart',
    sequenceDiagram: 'Sequence diagram',
    classDiagram: 'Class diagram',
    stateDiagram: 'State diagram',
    erDiagram: 'Entity relationship',
    gantt: 'Gantt chart',
    pie: 'Pie chart',
    gitGraph: 'Git graph',
    mindmap: 'Mind map',
    journey: 'User journey',
    timeline: 'Timeline',
  };
  return known[firstWord] ?? 'Diagram';
}

export function markdownFence(code: string): string {
  return `\`\`\`mermaid\n${code.trim()}\n\`\`\`\n`;
}
