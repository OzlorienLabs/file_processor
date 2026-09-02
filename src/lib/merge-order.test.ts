import { describe, expect, it } from 'vitest';

import { mergeOrders, orderFiles } from './merge-order';

const files = [
  { name: 'charlie.pdf', lastModified: 300 },
  { name: 'alpha.pdf', lastModified: 900 },
  { name: 'bravo.pdf', lastModified: 100 },
];

describe('merge order', () => {
  it('lists the four catalog orders', () => {
    expect(mergeOrders).toEqual(['as-added', 'by-name', 'by-date', 'reverse']);
  });

  it('keeps the order files were added in', () => {
    expect(orderFiles(files, 'as-added').map((file) => file.name)).toEqual([
      'charlie.pdf',
      'alpha.pdf',
      'bravo.pdf',
    ]);
  });

  it('sorts by name and by date without mutating the input', () => {
    expect(orderFiles(files, 'by-name').map((file) => file.name)).toEqual([
      'alpha.pdf',
      'bravo.pdf',
      'charlie.pdf',
    ]);
    expect(orderFiles(files, 'by-date').map((file) => file.name)).toEqual([
      'bravo.pdf',
      'charlie.pdf',
      'alpha.pdf',
    ]);
    expect(files[0].name).toBe('charlie.pdf');
  });

  it('reverses the added order', () => {
    expect(orderFiles(files, 'reverse').map((file) => file.name)).toEqual([
      'bravo.pdf',
      'alpha.pdf',
      'charlie.pdf',
    ]);
  });
});
