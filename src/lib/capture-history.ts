import { z } from 'zod';

import { stampNew, type StoredRecord } from './local-store';

export const captureRecordSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  format: z.enum(['png', 'jpeg']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative(),
  dataUrl: z.string().startsWith('data:image/'),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type CaptureRecord = z.infer<typeof captureRecordSchema>;

const captureExportSchema = z.object({
  key: z.literal('filekit.screen-capture.v1'),
  version: z.literal(1),
  items: z.array(z.unknown()),
});

export interface CaptureStore {
  list(): Promise<CaptureRecord[]>;
  get(id: string): Promise<CaptureRecord | undefined>;
  save(item: Omit<CaptureRecord, 'id' | 'createdAt' | 'updatedAt'> & Partial<StoredRecord>): Promise<CaptureRecord>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  exportJson(): Promise<string>;
  importJson(jsonString: string): Promise<{ imported: number; skipped: number }>;
}

/** In-memory store implementation, useful for tests or when IndexedDB is blocked. */
export function createMemoryCaptureStore(initialRecords: CaptureRecord[] = []): CaptureStore {
  let records: CaptureRecord[] = [...initialRecords].sort((a, b) => b.createdAt - a.createdAt);

  return {
    async list() {
      return [...records];
    },
    async get(id: string) {
      return records.find((r) => r.id === id);
    },
    async save(item) {
      const stamp = stampNew();
      const record: CaptureRecord = {
        id: item.id ?? stamp.id,
        createdAt: item.createdAt ?? stamp.createdAt,
        updatedAt: stamp.updatedAt,
        name: item.name,
        format: item.format,
        width: item.width,
        height: item.height,
        sizeBytes: item.sizeBytes,
        dataUrl: item.dataUrl,
      };
      records = [record, ...records.filter((r) => r.id !== record.id)].sort((a, b) => b.createdAt - a.createdAt);
      return record;
    },
    async remove(id: string) {
      records = records.filter((r) => r.id !== id);
    },
    async clear() {
      records = [];
    },
    async exportJson() {
      return JSON.stringify(
        {
          key: 'filekit.screen-capture.v1',
          version: 1,
          items: records,
        },
        null,
        2,
      );
    },
    async importJson(jsonString: string) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        throw new Error('The file does not contain valid JSON.');
      }
      const envelope = captureExportSchema.safeParse(parsed);
      if (!envelope.success) {
        throw new Error('The file is not a valid FileKit screen capture backup.');
      }

      let imported = 0;
      let skipped = 0;
      for (const raw of envelope.data.items) {
        const itemResult = captureRecordSchema.safeParse(raw);
        if (itemResult.success) {
          records = [itemResult.data, ...records.filter((r) => r.id !== itemResult.data.id)];
          imported++;
        } else {
          skipped++;
        }
      }
      records.sort((a, b) => b.createdAt - a.createdAt);
      return { imported, skipped };
    },
  };
}

const DB_NAME = 'filekit_screen_capture_db';
const STORE_NAME = 'captures';
const DB_VERSION = 1;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open database'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

export function createIndexedDbCaptureStore(): CaptureStore {
  async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await openIdb();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result: T;
      let fnPromiseFailed = false;

      fn(store)
        .then((res) => {
          result = res;
        })
        .catch((err) => {
          fnPromiseFailed = true;
          transaction.abort();
          reject(err);
        });

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => {
        if (!fnPromiseFailed) reject(transaction.error);
      };
      transaction.onabort = () => {
        if (!fnPromiseFailed) reject(new Error('Transaction aborted'));
      };
    });
  }

  return {
    async list() {
      return withStore('readonly', (store) => {
        return new Promise<CaptureRecord[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => {
            const items = (request.result as CaptureRecord[]) || [];
            items.sort((a, b) => b.createdAt - a.createdAt);
            resolve(items);
          };
          request.onerror = () => reject(request.error);
        });
      });
    },

    async get(id: string) {
      return withStore('readonly', (store) => {
        return new Promise<CaptureRecord | undefined>((resolve, reject) => {
          const request = store.get(id);
          request.onsuccess = () => resolve(request.result as CaptureRecord | undefined);
          request.onerror = () => reject(request.error);
        });
      });
    },

    async save(item) {
      const stamp = stampNew();
      const record: CaptureRecord = {
        id: item.id ?? stamp.id,
        createdAt: item.createdAt ?? stamp.createdAt,
        updatedAt: stamp.updatedAt,
        name: item.name,
        format: item.format,
        width: item.width,
        height: item.height,
        sizeBytes: item.sizeBytes,
        dataUrl: item.dataUrl,
      };

      await withStore('readwrite', (store) => {
        return new Promise<void>((resolve, reject) => {
          const request = store.put(record);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      });

      return record;
    },

    async remove(id: string) {
      await withStore('readwrite', (store) => {
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(id);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      });
    },

    async clear() {
      await withStore('readwrite', (store) => {
        return new Promise<void>((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      });
    },

    async exportJson() {
      const list = await this.list();
      return JSON.stringify(
        {
          key: 'filekit.screen-capture.v1',
          version: 1,
          items: list,
        },
        null,
        2,
      );
    },

    async importJson(jsonString: string) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        throw new Error('The file does not contain valid JSON.');
      }
      const envelope = captureExportSchema.safeParse(parsed);
      if (!envelope.success) {
        throw new Error('The file is not a valid FileKit screen capture backup.');
      }

      let imported = 0;
      let skipped = 0;

      await withStore('readwrite', async (store) => {
        for (const raw of envelope.data.items) {
          const itemResult = captureRecordSchema.safeParse(raw);
          if (itemResult.success) {
            await new Promise<void>((res, rej) => {
              const req = store.put(itemResult.data);
              req.onsuccess = () => {
                imported++;
                res();
              };
              req.onerror = () => rej(req.error);
            });
          } else {
            skipped++;
          }
        }
      });

      return { imported, skipped };
    },
  };
}

let activeStore: CaptureStore | undefined;

/**
 * Returns the default capture store. Uses IndexedDB if available,
 * falling back to the memory store if IndexedDB is missing or throws.
 */
export function getCaptureStore(): CaptureStore {
  if (!activeStore) {
    if (typeof indexedDB !== 'undefined' && indexedDB) {
      try {
        activeStore = createIndexedDbCaptureStore();
      } catch {
        activeStore = createMemoryCaptureStore();
      }
    } else {
      activeStore = createMemoryCaptureStore();
    }
  }
  return activeStore;
}

/** Sets or replaces the active capture store (primarily for unit testing). */
export function setCaptureStore(store: CaptureStore | undefined): void {
  activeStore = store;
}
