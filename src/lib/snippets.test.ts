import { describe, expect, it } from 'vitest';

import {
  allTags,
  createSnippet,
  createSnippetsCollection,
  filterSnippets,
  parseTags,
  snippetFilename,
  usedLanguages,
} from './snippets';

const make = (title: string, language: string, tags: string[], code = '') =>
  createSnippet({ title, language, tags, code });

describe('snippets helpers', () => {
  it('parses comma or newline separated tags without duplicates or hashes', () => {
    expect(parseTags('react, Hooks ,#react\n  , hooks')).toEqual(['react', 'Hooks']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(Array.from({ length: 30 }, (_, index) => `t${index}`).join(','))).toHaveLength(20);
  });

  it('filters by language, tag, and free text across title, code, and tags', () => {
    const snippets = [
      make('Fetch helper', 'typescript', ['http', 'Util'], 'export async function get() {}'),
      make('Sort list', 'python', ['algorithms'], 'sorted(items)'),
      make('Debounce', 'javascript', ['util'], 'function debounce() {}'),
    ];
    const none = { query: '', language: '', tag: '' };
    expect(filterSnippets(snippets, none)).toHaveLength(3);
    expect(filterSnippets(snippets, { ...none, language: 'python' }).map((s) => s.title)).toEqual(['Sort list']);
    expect(filterSnippets(snippets, { ...none, tag: 'UTIL' })).toHaveLength(2);
    expect(filterSnippets(snippets, { ...none, query: 'sorted' }).map((s) => s.title)).toEqual(['Sort list']);
    expect(filterSnippets(snippets, { ...none, query: 'HTTP' })).toHaveLength(1);
    expect(filterSnippets(snippets, { ...none, query: 'fetch' })).toHaveLength(1);
    expect(filterSnippets(snippets, { ...none, query: 'nothing here' })).toHaveLength(0);
  });

  it('lists tags by frequency and languages alphabetically', () => {
    const snippets = [make('a', 'go', ['zed', 'util']), make('b', 'css', ['Util']), make('c', 'go', ['alpha'])];
    expect(allTags(snippets)).toEqual(['util', 'alpha', 'zed']);
    expect(usedLanguages(snippets)).toEqual(['css', 'go']);
  });

  it('builds filenames from the title and language', () => {
    expect(snippetFilename({ title: 'Fetch helper!', language: 'typescript' })).toBe('Fetch-helper.ts');
    expect(snippetFilename({ title: '', language: 'unknown' })).toBe('snippet.txt');
  });

  it('persists under the versioned key', () => {
    const collection = createSnippetsCollection();
    expect(collection.key).toBe('filekit.snippets.v1');
    collection.upsert(make('one', 'json', [], '{}'));
    expect(collection.list()).toHaveLength(1);
  });
});
