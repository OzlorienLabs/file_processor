import { describe, expect, it } from 'vitest';

import {
  computeDiff,
  DiffInputError,
  MAX_DIFF_LINES,
  readDiffFile,
  splitLines,
  unifiedPatch,
} from './text-diff';

describe('splitLines', () => {
  it('drops only the final newline and keeps blank lines', () => {
    expect(splitLines('')).toEqual([]);
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
    expect(splitLines('a\n\n')).toEqual(['a', '']);
  });
});

describe('computeDiff', () => {
  it('reports identical inputs', () => {
    const result = computeDiff('same\ntext\n', 'same\ntext\n');
    expect(result.identical).toBe(true);
    expect(result.rows.every((row) => row.kind === 'same')).toBe(true);
    expect(result.unchanged).toBe(2);
    expect(result.hunks).toEqual([]);
  });

  it('pairs removed and added lines with word-level highlights', () => {
    const result = computeDiff('keep\nthe quick fox\nend\n', 'keep\nthe slow fox\nend\n');
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.unchanged).toBe(2);
    expect(result.hunks).toEqual([1]);

    const changed = result.rows[1];
    expect(changed.kind).toBe('changed');
    expect(changed.left).toMatchObject({ number: 2, text: 'the quick fox' });
    expect(changed.right).toMatchObject({ number: 2, text: 'the slow fox' });
    expect(changed.left?.segments?.filter((segment) => segment.changed).map((segment) => segment.text)).toEqual(['quick']);
    expect(changed.right?.segments?.filter((segment) => segment.changed).map((segment) => segment.text)).toEqual(['slow']);
  });

  it('keeps unpaired additions and removals as their own rows with correct numbering', () => {
    const result = computeDiff('a\nb\nc\n', 'a\nc\nd\ne\n');
    expect(result.rows.map((row) => row.kind)).toEqual(['same', 'removed', 'same', 'added', 'added']);
    expect(result.rows[1].left).toMatchObject({ number: 2, text: 'b' });
    expect(result.rows[3].right).toMatchObject({ number: 3, text: 'd' });
    expect(result.rows[4].right).toMatchObject({ number: 4, text: 'e' });
    expect(result.hunks).toEqual([1, 3]);
  });

  it('handles a removal that is not followed by an addition and additions with more lines', () => {
    const removedOnly = computeDiff('x\ny\n', 'x\n');
    expect(removedOnly.rows.map((row) => row.kind)).toEqual(['same', 'removed']);

    const moreAdded = computeDiff('one\n', 'uno\ndos\n');
    expect(moreAdded.rows.map((row) => row.kind)).toEqual(['changed', 'added']);

    const moreRemoved = computeDiff('one\ntwo\n', 'uno\n');
    expect(moreRemoved.rows.map((row) => row.kind)).toEqual(['changed', 'removed']);
  });

  it('respects ignore-whitespace and ignore-case options while showing both originals', () => {
    expect(computeDiff('Hello  World', 'hello world').identical).toBe(false);
    expect(computeDiff('Hello  World', 'hello world', { ignoreWhitespace: true, ignoreCase: false }).identical).toBe(false);
    const relaxed = computeDiff('Hello  World', 'hello world', { ignoreWhitespace: true, ignoreCase: true });
    expect(relaxed.identical).toBe(true);
    expect(relaxed.rows[0].left?.text).toBe('Hello  World');
    expect(relaxed.rows[0].right?.text).toBe('hello world');
  });

  it('treats a missing final newline as the same line', () => {
    expect(computeDiff('a\nb', 'a\nb\n').identical).toBe(true);
  });

  it('refuses inputs with too many lines', () => {
    const huge = 'x\n'.repeat(MAX_DIFF_LINES + 1);
    expect(() => computeDiff(huge, '')).toThrow(DiffInputError);
    expect(() => computeDiff('', huge)).toThrow(/at most/);
  });

  it('starts a hunk at the very first row when it differs', () => {
    expect(computeDiff('a\n', 'b\n').hunks).toEqual([0]);
  });
});

describe('unifiedPatch', () => {
  it('produces a unified diff with the given file names', () => {
    const patch = unifiedPatch('a\nb\n', 'a\nc\n', { original: 'before.txt', changed: 'after.txt' });
    expect(patch).toContain('--- before.txt');
    expect(patch).toContain('+++ after.txt');
    expect(patch).toContain('-b');
    expect(patch).toContain('+c');
  });

  it('uses default names', () => {
    expect(unifiedPatch('a\n', 'b\n')).toContain('original.txt');
  });
});

describe('readDiffFile', () => {
  it('normalises line endings and rejects binary or oversized files', async () => {
    const text = new File(['one\r\ntwo\rthree'], 'notes.txt', { type: 'text/plain' });
    expect(await readDiffFile(text)).toBe('one\ntwo\nthree');

    const binary = new File([new Uint8Array([0, 1, 2])], 'image.bin');
    await expect(readDiffFile(binary)).rejects.toThrow(/binary/);

    const big = { name: 'big.txt', size: 6 * 1024 * 1024, text: async () => '' } as unknown as File;
    await expect(readDiffFile(big)).rejects.toThrow(/larger than 5 MB/);
  });
});
