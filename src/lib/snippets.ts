import { z } from 'zod';

import { safeBaseName } from './files';
import { extensionFor } from './highlight';
import { createCollection, stampNew, storedRecordSchema, type Collection } from './local-store';

export const snippetSchema = storedRecordSchema.extend({
  title: z.string().max(200),
  language: z.string().min(1).max(40),
  tags: z.array(z.string().min(1).max(40)).max(20),
  code: z.string().max(500_000),
});
export type Snippet = z.infer<typeof snippetSchema>;

export const SNIPPETS_KEY = 'filekit.snippets.v1';
export const MAX_SNIPPETS = 1000;

export function createSnippetsCollection(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): Collection<Snippet> {
  return createCollection<Snippet>({ key: SNIPPETS_KEY, schema: snippetSchema, max: MAX_SNIPPETS, storage });
}

export function createSnippet(fields: Pick<Snippet, 'title' | 'language' | 'tags' | 'code'>): Snippet {
  return { ...stampNew(), ...fields };
}

/** "react, Hooks ,react" → ["react", "Hooks"]: trimmed, de-duplicated case-insensitively. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(/[,\n]/)) {
    const tag = raw.trim().replace(/^#/, '').slice(0, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.slice(0, 20);
}

export interface SnippetFilter {
  query: string;
  language: string;
  tag: string;
}

export function filterSnippets(snippets: Snippet[], filter: SnippetFilter): Snippet[] {
  const needle = filter.query.trim().toLowerCase();
  const tag = filter.tag.toLowerCase();
  return snippets.filter((snippet) => {
    if (filter.language && snippet.language !== filter.language) return false;
    if (tag && !snippet.tags.some((candidate) => candidate.toLowerCase() === tag)) return false;
    if (!needle) return true;
    return (
      snippet.title.toLowerCase().includes(needle) ||
      snippet.code.toLowerCase().includes(needle) ||
      snippet.tags.some((candidate) => candidate.toLowerCase().includes(needle))
    );
  });
}

/** Tags ordered by how often they are used, then alphabetically. */
export function allTags(snippets: Snippet[]): string[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const snippet of snippets) {
    for (const tag of snippet.tags) {
      const key = tag.toLowerCase();
      const entry = counts.get(key) ?? { tag, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .map((entry) => entry.tag);
}

export function usedLanguages(snippets: Snippet[]): string[] {
  return [...new Set(snippets.map((snippet) => snippet.language))].sort();
}

export function snippetFilename(snippet: Pick<Snippet, 'title' | 'language'>): string {
  return `${safeBaseName(snippet.title || 'snippet')}.${extensionFor(snippet.language)}`;
}
