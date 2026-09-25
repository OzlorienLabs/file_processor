import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createIndexedDbCaptureStore,
  createMemoryCaptureStore,
  getCaptureStore,
  setCaptureStore,
  type CaptureRecord,
} from './capture-history';

function sampleRecord(id: string, createdAt = Date.now(), name = `Capture ${id}`): CaptureRecord {
  return {
    id,
    name,
    format: 'png',
    width: 1920,
    height: 1080,
    sizeBytes: 1024,
    dataUrl: 'data:image/png;base64,sample',
    createdAt,
    updatedAt: createdAt,
  };
}

describe('createMemoryCaptureStore', () => {
  it('manages records in memory, newest first, and supports CRUD', async () => {
    const store = createMemoryCaptureStore();
    expect(await store.list()).toEqual([]);

    const saved1 = await store.save({
      name: 'First',
      format: 'png',
      width: 800,
      height: 600,
      sizeBytes: 500,
      dataUrl: 'data:image/png;base64,aaa',
      createdAt: 100,
    });
    expect(saved1.id).toBeDefined();

    const saved2 = await store.save({
      name: 'Second',
      format: 'jpeg',
      width: 1024,
      height: 768,
      sizeBytes: 800,
      dataUrl: 'data:image/jpeg;base64,bbb',
      createdAt: 200,
    });

    const list = await store.list();
    expect(list.map((r) => r.name)).toEqual(['Second', 'First']);

    const retrieved = await store.get(saved1.id);
    expect(retrieved?.name).toBe('First');

    await store.remove(saved1.id);
    expect((await store.list()).map((r) => r.id)).toEqual([saved2.id]);

    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('exports and imports JSON with schema validation', async () => {
    const store = createMemoryCaptureStore();
    await store.save(sampleRecord('item-1', 1000, 'Test 1'));
    await store.save(sampleRecord('item-2', 2000, 'Test 2'));

    const exported = await store.exportJson();
    expect(exported).toContain('filekit.screen-capture.v1');
    expect(exported).toContain('Test 1');

    const newStore = createMemoryCaptureStore();
    const result = await newStore.importJson(exported);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect((await newStore.list()).map((r) => r.id)).toEqual(['item-2', 'item-1']);

    // Invalid JSON
    await expect(newStore.importJson('invalid-json')).rejects.toThrow('valid JSON');

    // Wrong envelope key
    await expect(newStore.importJson(JSON.stringify({ key: 'wrong.key', version: 1, items: [] }))).rejects.toThrow(
      'not a valid FileKit screen capture backup',
    );

    // Partial item failure
    const mixedJson = JSON.stringify({
      key: 'filekit.screen-capture.v1',
      version: 1,
      items: [
        sampleRecord('valid-1', 3000),
        { invalid: true }, // will be skipped
      ],
    });
    const mixedResult = await newStore.importJson(mixedJson);
    expect(mixedResult.imported).toBe(1);
    expect(mixedResult.skipped).toBe(1);
  });
});

describe('createIndexedDbCaptureStore with mock IDB', () => {
  let originalIndexedDb: unknown;
  let mockData: Map<string, CaptureRecord>;
  let shouldFailOpen = false;
  let shouldFailTx = false;

  beforeEach(() => {
    originalIndexedDb = (globalThis as unknown as { indexedDB: unknown }).indexedDB;
    mockData = new Map<string, CaptureRecord>();
    shouldFailOpen = false;
    shouldFailTx = false;

    const fakeIndexedDB = {
      open: () => {
        const req: Record<string, unknown> = {
          result: null,
          error: null,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };

        setTimeout(() => {
          if (shouldFailOpen) {
            req.error = new Error('Database open failed');
            if (typeof req.onerror === 'function') (req.onerror as () => void)();
            return;
          }

          const db = {
            objectStoreNames: {
              contains: () => false,
            },
            createObjectStore: () => ({
              createIndex: vi.fn(),
            }),
            transaction: () => {
              const tx: Record<string, unknown> = {
                oncomplete: null,
                onerror: null,
                onabort: null,
                abort: vi.fn(() => {
                  if (typeof tx.onabort === 'function') (tx.onabort as () => void)();
                }),
                objectStore: () => ({
                  getAll: () => {
                    const r: Record<string, unknown> = {
                      result: Array.from(mockData.values()),
                      onsuccess: null,
                      onerror: null,
                    };
                    setTimeout(() => {
                      if (typeof r.onsuccess === 'function') (r.onsuccess as () => void)();
                    }, 0);
                    return r;
                  },
                  get: (id: string) => {
                    const r: Record<string, unknown> = {
                      result: mockData.get(id),
                      onsuccess: null,
                      onerror: null,
                    };
                    setTimeout(() => {
                      if (typeof r.onsuccess === 'function') (r.onsuccess as () => void)();
                    }, 0);
                    return r;
                  },
                  put: (item: CaptureRecord) => {
                    mockData.set(item.id, item);
                    const r: Record<string, unknown> = { result: item.id, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      if (typeof r.onsuccess === 'function') (r.onsuccess as () => void)();
                    }, 0);
                    return r;
                  },
                  delete: (id: string) => {
                    mockData.delete(id);
                    const r: Record<string, unknown> = { result: undefined, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      if (typeof r.onsuccess === 'function') (r.onsuccess as () => void)();
                    }, 0);
                    return r;
                  },
                  clear: () => {
                    mockData.clear();
                    const r: Record<string, unknown> = { result: undefined, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      if (typeof r.onsuccess === 'function') (r.onsuccess as () => void)();
                    }, 0);
                    return r;
                  },
                }),
              };

              setTimeout(() => {
                if (shouldFailTx) {
                  tx.error = new Error('Transaction failed');
                  if (typeof tx.onerror === 'function') (tx.onerror as () => void)();
                } else if (typeof tx.oncomplete === 'function') {
                  (tx.oncomplete as () => void)();
                }
              }, 5);

              return tx;
            },
          };

          req.result = db;
          if (typeof req.onupgradeneeded === 'function') (req.onupgradeneeded as () => void)();
          if (typeof req.onsuccess === 'function') (req.onsuccess as () => void)();
        }, 0);

        return req;
      },
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: fakeIndexedDB,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIndexedDb,
      configurable: true,
      writable: true,
    });
  });

  it('performs CRUD operations via indexedDB', async () => {
    const store = createIndexedDbCaptureStore();
    expect(await store.list()).toEqual([]);

    const saved = await store.save({
      name: 'IDB Capture',
      format: 'png',
      width: 1920,
      height: 1080,
      sizeBytes: 2048,
      dataUrl: 'data:image/png;base64,1234',
    });
    expect(saved.id).toBeDefined();

    const list = await store.list();
    expect(list.length).toBe(1);
    expect(list[0]?.name).toBe('IDB Capture');

    const item = await store.get(saved.id);
    expect(item?.id).toBe(saved.id);

    const json = await store.exportJson();
    expect(json).toContain('IDB Capture');

    await store.remove(saved.id);
    expect(await store.list()).toEqual([]);

    const importRes = await store.importJson(json);
    expect(importRes.imported).toBe(1);
    expect((await store.list()).length).toBe(1);

    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('handles database open errors gracefully', async () => {
    shouldFailOpen = true;
    const store = createIndexedDbCaptureStore();
    await expect(store.list()).rejects.toThrow('Database open failed');
  });

  it('handles transaction errors gracefully', async () => {
    shouldFailTx = true;
    const store = createIndexedDbCaptureStore();
    await expect(store.list()).rejects.toBeDefined();
  });

  it('getCaptureStore uses indexedDb when available', () => {
    setCaptureStore(undefined);
    const store = getCaptureStore();
    expect(store).toBeDefined();
  });
});

describe('getCaptureStore and setCaptureStore', () => {
  beforeEach(() => {
    setCaptureStore(undefined);
  });

  it('provides a singleton memory store when indexedDB is undefined', () => {
    const store1 = getCaptureStore();
    const store2 = getCaptureStore();
    expect(store1).toBe(store2);
  });

  it('allows overriding store with custom instance', () => {
    const custom = createMemoryCaptureStore();
    setCaptureStore(custom);
    expect(getCaptureStore()).toBe(custom);
  });

  it('createIndexedDbCaptureStore throws if indexedDB is not available', async () => {
    const store = createIndexedDbCaptureStore();
    await expect(store.list()).rejects.toThrow('IndexedDB is not supported');
  });
});
