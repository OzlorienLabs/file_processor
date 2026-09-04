import { z } from 'zod';

import { safeBaseName } from './files';
import { createCollection, stampNew, storedRecordSchema, type Collection } from './local-store';
import { sampleMarkdown } from './markdown';

export const markdownViewModes = ['split', 'editor', 'preview'] as const;
export type MarkdownViewMode = (typeof markdownViewModes)[number];

export const markdownDocSchema = storedRecordSchema.extend({
  title: z.string().max(200),
  markdown: z.string().max(2_000_000),
  view: z.enum(markdownViewModes),
});
export type MarkdownDoc = z.infer<typeof markdownDocSchema>;

export const MARKDOWN_DOCS_KEY = 'filekit.markdown.docs.v1';
export const LEGACY_MARKDOWN_KEY = 'filekit.markdown.v1';
export const MAX_MARKDOWN_DOCS = 500;

export function createMarkdownDoc(
  title = '',
  markdown = '',
  view: MarkdownViewMode = 'split',
): MarkdownDoc {
  return { ...stampNew(), title, markdown, view };
}

export function isBlankMarkdownDoc(doc: Pick<MarkdownDoc, 'title' | 'markdown'>): boolean {
  return !doc.title.trim() && !doc.markdown.trim();
}

export function displayMarkdownTitle(doc: Pick<MarkdownDoc, 'title' | 'markdown'>): string {
  const title = doc.title.trim();
  if (title) return title;
  const firstLine = doc.markdown
    .split('\n')
    .map((line) => line.replace(/^[#>\-*\s]+/, '').trim())
    .find(Boolean);
  if (!firstLine) return 'Untitled document';
  return firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine;
}

export function markdownDocFilename(doc: MarkdownDoc, extension = 'md'): string {
  return `${safeBaseName(displayMarkdownTitle(doc))}.${extension}`;
}

export function searchMarkdownDocs(docs: MarkdownDoc[], query: string): MarkdownDoc[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return docs;
  return docs.filter(
    (doc) => doc.title.toLowerCase().includes(needle) || doc.markdown.toLowerCase().includes(needle),
  );
}

export function createMarkdownCollection(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
): Collection<MarkdownDoc> {
  const collection = createCollection<MarkdownDoc>({
    key: MARKDOWN_DOCS_KEY,
    schema: markdownDocSchema,
    max: MAX_MARKDOWN_DOCS,
    storage,
  });

  // Migrate legacy single-draft store if collection is newly created and empty
  try {
    const items = collection.list();
    if (items.length === 0) {
      const legacyRaw = storage.getItem(LEGACY_MARKDOWN_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as { markdown?: string; view?: MarkdownViewMode };
        if (legacy.markdown && legacy.markdown.trim()) {
          const migrated = createMarkdownDoc(
            '',
            legacy.markdown,
            legacy.view && markdownViewModes.includes(legacy.view) ? legacy.view : 'split',
          );
          collection.upsert(migrated);
        }
      }
    }
  } catch {
    // Ignore migration failure and return collection as-is
  }

  return collection;
}

export async function exportMarkdownDocsZip(docs: MarkdownDoc[], exportJson: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set<string>();
  for (const doc of docs) {
    let name = markdownDocFilename(doc);
    let counter = 2;
    while (used.has(name)) {
      name = markdownDocFilename(doc).replace(/(\.[^.]+)$/, `-${counter}$1`);
      counter += 1;
    }
    used.add(name);
    zip.file(name, doc.markdown);
  }
  zip.file('markdown-docs.json', exportJson);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function createInitialMarkdownDoc(): MarkdownDoc {
  return createMarkdownDoc('', sampleMarkdown, 'split');
}
