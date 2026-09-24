import { z } from 'zod';

import { createCollection, createValueStore, stampNew, storedRecordSchema, type Collection, type ValueStore } from './local-store';
import { layoutEngines, MAX_GRAPHVIZ_CHARS, type LayoutEngine } from './graphviz-render';
import { defaultGraphvizSample } from './graphviz-samples';

const engineSchema = z.enum(layoutEngines.map((engine) => engine.id) as [LayoutEngine, ...LayoutEngine[]]);

export const savedGraphSchema = storedRecordSchema.extend({
  name: z.string().min(1).max(120),
  code: z.string().max(MAX_GRAPHVIZ_CHARS),
  engine: engineSchema.default('dot'),
});
export type SavedGraph = z.infer<typeof savedGraphSchema>;

export const graphDraftSchema = z.object({ code: z.string().max(MAX_GRAPHVIZ_CHARS), engine: engineSchema.default('dot') });
export type GraphDraft = z.infer<typeof graphDraftSchema>;

export const GRAPHVIZ_KEY = 'filekit.graphviz.v1';
export const GRAPHVIZ_DRAFT_KEY = 'filekit.graphviz-draft.v1';
export const MAX_SAVED_GRAPHS = 200;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createGraphCollection(storage?: StorageLike): Collection<SavedGraph> {
  return createCollection<SavedGraph>({ key: GRAPHVIZ_KEY, schema: savedGraphSchema, max: MAX_SAVED_GRAPHS, storage });
}

export function createGraphDraftStore(storage?: StorageLike): ValueStore<GraphDraft> {
  return createValueStore({
    key: GRAPHVIZ_DRAFT_KEY,
    schema: graphDraftSchema,
    fallback: { code: defaultGraphvizSample.code, engine: defaultGraphvizSample.engine },
    storage,
  });
}

export function createSavedGraph(name: string, code: string, engine: LayoutEngine = 'dot'): SavedGraph {
  return { ...stampNew(), name: name.trim() || suggestGraphName(code), code, engine };
}

/**
 * Uses the graph's own ID when it has one ("digraph Pipeline {" → "Pipeline"),
 * otherwise names the kind of graph.
 */
export function suggestGraphName(code: string): string {
  const header = /^\s*(?:(?:\/\/|#)[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*(strict\s+)?(digraph|graph)\s*("(?:[^"\\]|\\.)*"|[A-Za-z_\u0080-￿][\w\u0080-￿]*|-?(?:\.\d+|\d+(?:\.\d*)?))?\s*\{/i.exec(
    code,
  );
  if (!header) return 'Graph';
  const id = header[3]?.replace(/^"|"$/g, '').trim();
  if (id) return id.slice(0, 120);
  return header[2].toLowerCase() === 'digraph' ? 'Directed graph' : 'Undirected graph';
}

export function markdownFence(code: string): string {
  return `\`\`\`dot\n${code.trim()}\n\`\`\`\n`;
}

/** File-name stem for downloads: "My graph!" → "my-graph". */
export function fileStem(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'graph'
  );
}
