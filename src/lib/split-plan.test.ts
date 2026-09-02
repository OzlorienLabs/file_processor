import { describe, expect, it } from 'vitest';

import { pagesPerFile, planSplit, splitModes } from './split-plan';

const base = { pageCount: 5, ranges: '', selectedPages: [], size: 2 };

describe('split plan', () => {
  it('lists the four catalog modes', () => {
    expect(splitModes).toEqual(['every-page', 'ranges', 'selected', 'every-n']);
  });

  it('makes one group per page', () => {
    expect(planSplit('every-page', base)).toEqual([[1], [2], [3], [4], [5]]);
  });

  it('makes one group per typed range', () => {
    expect(planSplit('ranges', { ...base, ranges: '1-2, 4' })).toEqual([[1, 2], [4]]);
    expect(planSplit('ranges', { ...base, ranges: '  ' })).toEqual([]);
  });

  it('makes one group from the ticked pages, in order', () => {
    expect(planSplit('selected', { ...base, selectedPages: [4, 1] })).toEqual([[1, 4]]);
  });

  it('makes fixed-size groups, with a short final group', () => {
    expect(planSplit('every-n', base)).toEqual([[1, 2], [3, 4], [5]]);
    expect(planSplit('every-n', { ...base, size: 0 })).toHaveLength(5);
  });

  it('maps the slider onto 1 to 25 pages per file', () => {
    expect(pagesPerFile(0)).toBe(1);
    expect(pagesPerFile(100)).toBe(25);
    expect(pagesPerFile(50)).toBe(13);
  });
});
