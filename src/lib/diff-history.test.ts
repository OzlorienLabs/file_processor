import { describe, expect, it } from 'vitest';

import {
  createDiffCollection,
  createSavedDiff,
  DIFF_HISTORY_KEY,
  displayDiffTitle,
  isBlankDiff,
  LEGACY_DIFF_KEY,
  searchDiffs,
} from './diff-history';

describe('diff-history', () => {
  it('creates and identifies blank diffs', () => {
    const diff = createSavedDiff();
    expect(isBlankDiff(diff)).toBe(true);
    expect(displayDiffTitle(diff)).toBe('Untitled comparison');

    const titled = createSavedDiff('Refactor', 'const a = 1', 'const a = 2');
    expect(isBlankDiff(titled)).toBe(false);
    expect(displayDiffTitle(titled)).toBe('Refactor');

    const untitled = createSavedDiff('', 'line 1\nline 2', '');
    expect(displayDiffTitle(untitled)).toBe('line 1');
  });

  it('filters diffs by search query', () => {
    const d1 = createSavedDiff('Auth', 'login()', 'loginUser()');
    const d2 = createSavedDiff('Style', 'color: red', 'color: blue');
    expect(searchDiffs([d1, d2], 'auth')).toEqual([d1]);
    expect(searchDiffs([d1, d2], 'blue')).toEqual([d2]);
    expect(searchDiffs([d1, d2], '')).toEqual([d1, d2]);
  });

  it('migrates legacy diff draft store', () => {
    const storage = new Map<string, string>();
    storage.set(
      LEGACY_DIFF_KEY,
      JSON.stringify({ original: 'old', changed: 'new', ignoreWhitespace: true, ignoreCase: false, view: 'unified' }),
    );
    const mockStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    };
    const collection = createDiffCollection(mockStorage);
    const items = collection.list();
    expect(items).toHaveLength(1);
    expect(items[0].original).toBe('old');
    expect(items[0].changed).toBe('new');
    expect(items[0].ignoreWhitespace).toBe(true);
    expect(items[0].view).toBe('unified');

    // Empty/corrupt legacy migration
    storage.set(LEGACY_DIFF_KEY, 'corrupt');
    const corruptCol = createDiffCollection(mockStorage);
    expect(corruptCol.list()).toHaveLength(1); // from previous upsert

    storage.delete(DIFF_HISTORY_KEY);
    storage.set(LEGACY_DIFF_KEY, JSON.stringify({ original: '  ', changed: '' }));
    const blankMig = createDiffCollection(mockStorage);
    expect(blankMig.list()).toHaveLength(0);

    storage.set(LEGACY_DIFF_KEY, JSON.stringify({ changed: 'only changed', view: 'invalid-view' }));
    const changedMig = createDiffCollection(mockStorage);
    expect(changedMig.list()).toHaveLength(1);
    expect(changedMig.list()[0].view).toBe('split');
  });

  it('handles preview from changed text and truncates long preview', () => {
    const fromChanged = createSavedDiff('', '', 'changed only');
    expect(displayDiffTitle(fromChanged)).toBe('changed only');

    const longDiff = createSavedDiff('', 'B'.repeat(80), '');
    expect(displayDiffTitle(longDiff)).toHaveLength(50); // 49 chars + ellipsis
  });
});
