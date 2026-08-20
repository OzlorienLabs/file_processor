export class PageRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageRangeError';
  }
}

export function parsePageSelection(value: string, pageCount: number): number[] {
  if (pageCount < 1) {
    throw new PageRangeError('This document does not contain pages.');
  }
  const input = value.trim();
  if (!input) {
    throw new PageRangeError('Enter pages such as 1-3, 5, 8.');
  }

  const pages = new Set<number>();
  for (const rawPart of input.split(',')) {
    const part = rawPart.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) {
      throw new PageRangeError(`“${part}” is not a valid page or range.`);
    }
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
      throw new PageRangeError(`Pages must be between 1 and ${pageCount}.`);
    }
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    for (let page = low; page <= high; page += 1) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}
