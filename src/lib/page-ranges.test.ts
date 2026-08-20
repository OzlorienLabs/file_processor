import { describe, expect, it } from 'vitest';

import { PageRangeError, parsePageSelection } from './page-ranges';

describe('parsePageSelection', () => {
  it('expands ranges, sorts pages, and removes duplicates', () => {
    expect(parsePageSelection('5, 1-3, 3, 7-6', 8)).toEqual([
      1, 2, 3, 5, 6, 7,
    ]);
  });

  it.each(['', 'two', '1-', '0', '8', '1.5'])('rejects invalid input %s', (value) => {
    expect(() => parsePageSelection(value, 7)).toThrow(PageRangeError);
  });

  it('rejects documents with no pages', () => {
    expect(() => parsePageSelection('1', 0)).toThrow('does not contain pages');
  });
});
