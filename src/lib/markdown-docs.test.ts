import { describe, expect, it } from 'vitest';

import {
  createInitialMarkdownDoc,
  createMarkdownCollection,
  createMarkdownDoc,
  displayMarkdownTitle,
  exportMarkdownDocsZip,
  isBlankMarkdownDoc,
  LEGACY_MARKDOWN_KEY,
  MARKDOWN_DOCS_KEY,
  markdownDocFilename,
  searchMarkdownDocs,
} from './markdown-docs';

describe('markdown-docs', () => {
  it('creates and identifies blank markdown documents', () => {
    const doc = createMarkdownDoc();
    expect(isBlankMarkdownDoc(doc)).toBe(true);
    expect(displayMarkdownTitle(doc)).toBe('Untitled document');

    const titled = createMarkdownDoc('Spec', '# Content');
    expect(isBlankMarkdownDoc(titled)).toBe(false);
    expect(displayMarkdownTitle(titled)).toBe('Spec');

    const untitledWithContent = createMarkdownDoc('', '# Heading 1\nbody');
    expect(displayMarkdownTitle(untitledWithContent)).toBe('Heading 1');
  });

  it('generates safe filenames', () => {
    const doc = createMarkdownDoc('My Project: Notes', '# Hello');
    expect(markdownDocFilename(doc)).toBe('My-Project-Notes.md');
    expect(markdownDocFilename(doc, 'html')).toBe('My-Project-Notes.html');
  });

  it('filters documents by title and content search', () => {
    const d1 = createMarkdownDoc('Design', 'Architecture diagram');
    const d2 = createMarkdownDoc('Recipe', 'Pasta sauce');
    expect(searchMarkdownDocs([d1, d2], 'arch')).toEqual([d1]);
    expect(searchMarkdownDocs([d1, d2], 'sauce')).toEqual([d2]);
    expect(searchMarkdownDocs([d1, d2], '')).toEqual([d1, d2]);
  });

  it('migrates legacy draft store on collection creation', () => {
    const storage = new Map<string, string>();
    storage.set(LEGACY_MARKDOWN_KEY, JSON.stringify({ markdown: '# Legacy', view: 'editor' }));
    const mockStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    };
    const collection = createMarkdownCollection(mockStorage);
    const items = collection.list();
    expect(items).toHaveLength(1);
    expect(items[0].markdown).toBe('# Legacy');
    expect(items[0].view).toBe('editor');
  });

  it('exports documents as a ZIP archive', async () => {
    const d1 = createMarkdownDoc('Doc 1', 'Content 1');
    const d2 = createMarkdownDoc('Doc 1', 'Content 2');
    const blob = await exportMarkdownDocsZip([d1, d2], '[]');
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/zip');
  });

  it('truncates very long first line titles and handles empty/corrupt migration', () => {
    const longTitle = createMarkdownDoc('', 'A'.repeat(80));
    expect(displayMarkdownTitle(longTitle)).toHaveLength(60); // 59 chars + ellipsis

    const storage = new Map<string, string>();
    storage.set(LEGACY_MARKDOWN_KEY, 'corrupt-json');
    const mockStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    };
    const collection = createMarkdownCollection(mockStorage);
    expect(collection.list()).toHaveLength(0);

    storage.set(LEGACY_MARKDOWN_KEY, JSON.stringify({ markdown: '   ' }));
    const emptyMig = createMarkdownCollection(mockStorage);
    expect(emptyMig.list()).toHaveLength(0);

    storage.set(MARKDOWN_DOCS_KEY, JSON.stringify([createMarkdownDoc('Existing')]));
    storage.set(LEGACY_MARKDOWN_KEY, JSON.stringify({ markdown: 'ignored' }));
    const existingCol = createMarkdownCollection(mockStorage);
    expect(existingCol.list()).toHaveLength(1);
    expect(existingCol.list()[0].title).toBe('Existing');
  });

  it('creates initial sample document', () => {
    const doc = createInitialMarkdownDoc();
    expect(displayMarkdownTitle(doc)).toBe('Markdown live preview');
    expect(doc.markdown).toContain('# Markdown live preview');
  });
});
