/** The four page orders the merge tool offers, in catalog order. */
export type MergeOrder = 'as-added' | 'by-name' | 'by-date' | 'reverse';

export const mergeOrders: MergeOrder[] = ['as-added', 'by-name', 'by-date', 'reverse'];

interface OrderableFile {
  name: string;
  lastModified: number;
}

/** Applies the chosen page order to the files as they were added. */
export function orderFiles<T extends OrderableFile>(files: T[], order: MergeOrder): T[] {
  if (order === 'by-name') return [...files].sort((a, b) => a.name.localeCompare(b.name));
  if (order === 'by-date') return [...files].sort((a, b) => a.lastModified - b.lastModified);
  if (order === 'reverse') return [...files].reverse();
  return [...files];
}
