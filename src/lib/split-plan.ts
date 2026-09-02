import { parsePageSelection } from './page-ranges';

/** The four ways the split tool can carve a document, in catalog order. */
export type SplitMode = 'every-page' | 'ranges' | 'selected' | 'every-n';

export const splitModes: SplitMode[] = ['every-page', 'ranges', 'selected', 'every-n'];

export interface SplitPlanInput {
  pageCount: number;
  /** Comma-separated ranges typed by the reader, for the `ranges` mode. */
  ranges: string;
  /** 1-based page numbers ticked in the preview, for the `selected` mode. */
  selectedPages: number[];
  /** Pages per output file, for the `every-n` mode. */
  size: number;
}

/** The page groups each output PDF is built from. */
export function planSplit(mode: SplitMode, input: SplitPlanInput): number[][] {
  const { pageCount } = input;
  if (mode === 'every-page') {
    return Array.from({ length: pageCount }, (_, index) => [index + 1]);
  }
  if (mode === 'ranges') {
    return input.ranges
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => parsePageSelection(part, pageCount));
  }
  if (mode === 'selected') {
    return [[...input.selectedPages].sort((a, b) => a - b)];
  }
  const size = Math.max(1, input.size);
  const groups: number[][] = [];
  for (let start = 1; start <= pageCount; start += size) {
    groups.push(
      Array.from({ length: Math.min(size, pageCount - start + 1) }, (_, index) => start + index),
    );
  }
  return groups;
}

/** The "Pages per file" slider spans 1 to 25, which covers the useful range. */
export function pagesPerFile(quality: number): number {
  return Math.round((quality / 100) * 24) + 1;
}
