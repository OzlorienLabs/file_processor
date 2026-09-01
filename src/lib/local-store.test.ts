import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  createCollection,
  createValueStore,
  LocalStoreError,
  newId,
  stampNew,
  storedRecordSchema,
} from './local-store';

const noteSchema = storedRecordSchema.extend({ title: z.string() });
type Note = z.infer<typeof noteSchema>;

function note(id: string, updatedAt: number, title = id): Note {
  return { id, createdAt: updatedAt, updatedAt, title };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('createCollection', () => {
  it('starts empty, upserts newest-first, replaces by id, and removes', () => {
    const notes = createCollection({ key: 'test.notes', schema: noteSchema });
    expect(notes.list()).toEqual([]);

    notes.upsert(note('a', 1));
    notes.upsert(note('b', 2));
    expect(notes.list().map((item) => item.id)).toEqual(['b', 'a']);

    notes.upsert(note('a', 3, 'edited'));
    expect(notes.list().map((item) => item.id)).toEqual(['a', 'b']);
    expect(notes.get('a')?.title).toBe('edited');
    expect(notes.get('missing')).toBeUndefined();

    expect(notes.remove('b').map((item) => item.id)).toEqual(['a']);
    notes.clear();
    expect(notes.list()).toEqual([]);
    expect(localStorage.getItem('test.notes')).toBeNull();
  });

  it('caps the collection at max records, dropping the oldest', () => {
    const notes = createCollection({ key: 'test.capped', schema: noteSchema, max: 2 });
    notes.upsert(note('old', 1));
    notes.upsert(note('mid', 2));
    const list = notes.upsert(note('new', 3));
    expect(list.map((item) => item.id)).toEqual(['new', 'mid']);
  });

  it('ignores corrupt, non-array, and invalid stored data', () => {
    const storage = memoryStorage({
      corrupt: '{not json',
      object: '{"id":"x"}',
      mixed: JSON.stringify([note('ok', 5), { id: 'bad' }, 42]),
    });
    expect(createCollection({ key: 'corrupt', schema: noteSchema, storage }).list()).toEqual([]);
    expect(createCollection({ key: 'object', schema: noteSchema, storage }).list()).toEqual([]);
    expect(createCollection({ key: 'mixed', schema: noteSchema, storage }).list()).toEqual([note('ok', 5)]);
  });

  it('turns quota failures into a friendly LocalStoreError', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    const notes = createCollection({ key: 'full', schema: noteSchema, storage });
    expect(() => notes.upsert(note('a', 1))).toThrow(LocalStoreError);
    expect(() => notes.upsert(note('a', 1))).toThrow(/run out of local storage/);
  });

  it('exports an envelope and imports it back, merging newer records only', () => {
    const source = createCollection({ key: 'test.export', schema: noteSchema });
    source.upsert(note('a', 10, 'from export'));
    source.upsert(note('b', 20));
    const json = source.exportJson();
    expect(JSON.parse(json)).toMatchObject({ key: 'test.export', version: 1, items: expect.any(Array) });

    const target = createCollection({ key: 'test.import', schema: noteSchema });
    target.upsert(note('a', 50, 'newer local'));
    target.upsert(note('c', 5));

    const result = target.importJson(json);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.list.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(target.get('a')?.title).toBe('newer local');
  });

  it('imports a bare array and skips invalid entries', () => {
    const target = createCollection({ key: 'test.bare', schema: noteSchema });
    const result = target.importJson(JSON.stringify([note('z', 1), { nope: true }]));
    expect(result).toMatchObject({ imported: 1, skipped: 1 });
    expect(target.list()).toHaveLength(1);
  });

  it('rejects malformed import files clearly', () => {
    const target = createCollection({ key: 'test.reject', schema: noteSchema });
    expect(() => target.importJson('not json')).toThrow(/not valid JSON/);
    expect(() => target.importJson('{"hello":"world"}')).toThrow(/exported FileKit collection/);
  });
});

describe('createValueStore', () => {
  const schema = z.object({ text: z.string() });

  it('returns the fallback when empty, corrupt, or invalid', () => {
    const storage = memoryStorage({ corrupt: '{', invalid: '{"text":1}' });
    const fallback = { text: 'default' };
    expect(createValueStore({ key: 'missing', schema, fallback, storage }).load()).toEqual(fallback);
    expect(createValueStore({ key: 'corrupt', schema, fallback, storage }).load()).toEqual(fallback);
    expect(createValueStore({ key: 'invalid', schema, fallback, storage }).load()).toEqual(fallback);
  });

  it('saves, loads, and clears a value using localStorage by default', () => {
    const store = createValueStore({ key: 'test.value', schema, fallback: { text: '' } });
    store.save({ text: 'draft' });
    expect(store.load()).toEqual({ text: 'draft' });
    store.clear();
    expect(store.load()).toEqual({ text: '' });
  });

  it('reports quota failures', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('full');
    };
    const store = createValueStore({ key: 'k', schema, fallback: { text: '' }, storage });
    expect(() => store.save({ text: 'x' })).toThrow(LocalStoreError);
  });
});

describe('record helpers', () => {
  it('creates unique ids and consistent timestamps', () => {
    expect(newId()).not.toBe(newId());
    const stamp = stampNew();
    expect(stamp.createdAt).toBe(stamp.updatedAt);
    expect(storedRecordSchema.safeParse(stamp).success).toBe(true);
  });
});
