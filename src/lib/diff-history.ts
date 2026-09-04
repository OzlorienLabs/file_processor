import { z } from 'zod';

import { createCollection, stampNew, storedRecordSchema, type Collection } from './local-store';

export const diffViewModes = ['split', 'unified'] as const;
export type DiffViewMode = (typeof diffViewModes)[number];

export const savedDiffSchema = storedRecordSchema.extend({
  title: z.string().max(200),
  original: z.string().max(6_000_000),
  changed: z.string().max(6_000_000),
  ignoreWhitespace: z.boolean(),
  ignoreCase: z.boolean(),
  view: z.enum(diffViewModes),
});
export type SavedDiff = z.infer<typeof savedDiffSchema>;

export const DIFF_HISTORY_KEY = 'filekit.diff.history.v1';
export const LEGACY_DIFF_KEY = 'filekit.diff.v1';
export const MAX_SAVED_DIFFS = 200;

export function createSavedDiff(
  title = '',
  original = '',
  changed = '',
  options?: { ignoreWhitespace?: boolean; ignoreCase?: boolean; view?: DiffViewMode },
): SavedDiff {
  return {
    ...stampNew(),
    title,
    original,
    changed,
    ignoreWhitespace: options?.ignoreWhitespace ?? false,
    ignoreCase: options?.ignoreCase ?? false,
    view: options?.view ?? 'split',
  };
}

export function isBlankDiff(diff: Pick<SavedDiff, 'original' | 'changed'>): boolean {
  return !diff.original.trim() && !diff.changed.trim();
}

export function displayDiffTitle(diff: Pick<SavedDiff, 'title' | 'original' | 'changed'>): string {
  const title = diff.title.trim();
  if (title) return title;
  const firstOriginal = diff.original.split('\n').find((line) => line.trim())?.trim();
  const firstChanged = diff.changed.split('\n').find((line) => line.trim())?.trim();
  const preview = firstOriginal || firstChanged;
  if (!preview) return 'Untitled comparison';
  return preview.length > 50 ? `${preview.slice(0, 49)}…` : preview;
}

export function searchDiffs(diffs: SavedDiff[], query: string): SavedDiff[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return diffs;
  return diffs.filter(
    (diff) =>
      diff.title.toLowerCase().includes(needle) ||
      diff.original.toLowerCase().includes(needle) ||
      diff.changed.toLowerCase().includes(needle),
  );
}

export function createDiffCollection(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
): Collection<SavedDiff> {
  const collection = createCollection<SavedDiff>({
    key: DIFF_HISTORY_KEY,
    schema: savedDiffSchema,
    max: MAX_SAVED_DIFFS,
    storage,
  });

  // Migrate legacy single-draft store if collection is newly created and empty
  try {
    const items = collection.list();
    if (items.length === 0) {
      const legacyRaw = storage.getItem(LEGACY_DIFF_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as {
          original?: string;
          changed?: string;
          ignoreWhitespace?: boolean;
          ignoreCase?: boolean;
          view?: DiffViewMode;
        };
        if ((legacy.original && legacy.original.trim()) || (legacy.changed && legacy.changed.trim())) {
          const migrated = createSavedDiff('', legacy.original ?? '', legacy.changed ?? '', {
            ignoreWhitespace: legacy.ignoreWhitespace,
            ignoreCase: legacy.ignoreCase,
            view: legacy.view && diffViewModes.includes(legacy.view) ? legacy.view : 'split',
          });
          collection.upsert(migrated);
        }
      }
    }
  } catch {
    // Ignore migration failure and return collection as-is
  }

  return collection;
}
