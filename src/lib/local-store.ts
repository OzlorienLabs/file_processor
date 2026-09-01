import { z } from 'zod';

/** Every persisted record carries an id and timestamps so lists can sort and merge. */
export interface StoredRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export const storedRecordSchema = z.object({
  id: z.string().min(1).max(64),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export class LocalStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalStoreError';
  }
}

const QUOTA_MESSAGE =
  'This browser has run out of local storage for FileKit. Export and delete some saved items to make room.';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function newId(): string {
  return crypto.randomUUID();
}

export function stampNew(): StoredRecord {
  const now = Date.now();
  return { id: newId(), createdAt: now, updatedAt: now };
}

/** Returns a copy of the record with `updatedAt` set to now. */
export function touch<T extends StoredRecord>(record: T, patch: Partial<T> = {}): T {
  return { ...record, ...patch, updatedAt: Date.now() };
}

function writeRaw(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    throw new LocalStoreError(QUOTA_MESSAGE);
  }
}

export interface CollectionOptions<T extends StoredRecord> {
  key: string;
  schema: z.ZodType<T>;
  /** Newest `max` records (by updatedAt) are kept; older ones are dropped on write. */
  max?: number;
  storage?: StorageLike;
}

export interface ImportResult<T> {
  list: T[];
  imported: number;
  skipped: number;
}

export interface Collection<T extends StoredRecord> {
  readonly key: string;
  list(): T[];
  get(id: string): T | undefined;
  upsert(record: T): T[];
  remove(id: string): T[];
  clear(): void;
  exportJson(): string;
  importJson(json: string): ImportResult<T>;
}

const exportSchema = z.object({
  key: z.string(),
  version: z.literal(1),
  items: z.array(z.unknown()),
});

function byNewest<T extends StoredRecord>(records: T[]): T[] {
  return [...records].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * A validated, versioned list stored under one localStorage key. Corrupt or foreign data
 * is treated as an empty list instead of crashing the page; quota errors surface as a
 * LocalStoreError with a friendly message.
 */
export function createCollection<T extends StoredRecord>(options: CollectionOptions<T>): Collection<T> {
  const storage = options.storage ?? localStorage;
  const { key, schema } = options;
  const max = options.max ?? Number.POSITIVE_INFINITY;

  const read = (): T[] => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const valid: T[] = [];
      for (const item of parsed) {
        const result = schema.safeParse(item);
        if (result.success) valid.push(result.data);
      }
      return byNewest(valid);
    } catch {
      return [];
    }
  };

  const write = (records: T[]): T[] => {
    const trimmed = byNewest(records).slice(0, max);
    writeRaw(storage, key, JSON.stringify(trimmed));
    return trimmed;
  };

  return {
    key,
    list: read,
    get: (id) => read().find((record) => record.id === id),
    upsert: (record) => write([record, ...read().filter((existing) => existing.id !== record.id)]),
    remove: (id) => write(read().filter((record) => record.id !== id)),
    clear: () => storage.removeItem(key),
    exportJson: () => JSON.stringify({ key, version: 1, exportedAt: Date.now(), items: read() }, null, 2),
    importJson: (json) => {
      let payload: unknown;
      try {
        payload = JSON.parse(json);
      } catch {
        throw new LocalStoreError('That file is not valid JSON.');
      }
      const envelope = exportSchema.safeParse(payload);
      const items = envelope.success ? envelope.data.items : Array.isArray(payload) ? payload : undefined;
      if (!items) throw new LocalStoreError('That file does not contain an exported FileKit collection.');

      const current = new Map(read().map((record) => [record.id, record]));
      let imported = 0;
      let skipped = 0;
      for (const item of items) {
        const result = schema.safeParse(item);
        if (!result.success) {
          skipped += 1;
          continue;
        }
        const existing = current.get(result.data.id);
        if (!existing || existing.updatedAt < result.data.updatedAt) {
          current.set(result.data.id, result.data);
          imported += 1;
        } else {
          skipped += 1;
        }
      }
      return { list: write([...current.values()]), imported, skipped };
    },
  };
}

export interface ValueStoreOptions<T> {
  key: string;
  schema: z.ZodType<T>;
  fallback: T;
  storage?: StorageLike;
}

export interface ValueStore<T> {
  readonly key: string;
  load(): T;
  save(value: T): void;
  clear(): void;
}

/** A single validated value (a draft, a scene, the last inputs) under one key. */
export function createValueStore<T>(options: ValueStoreOptions<T>): ValueStore<T> {
  const storage = options.storage ?? localStorage;
  const { key, schema, fallback } = options;
  return {
    key,
    load: () => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return fallback;
        const result = schema.safeParse(JSON.parse(raw));
        return result.success ? result.data : fallback;
      } catch {
        return fallback;
      }
    },
    save: (value) => writeRaw(storage, key, JSON.stringify(value)),
    clear: () => storage.removeItem(key),
  };
}
