import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createCollection, storedRecordSchema } from '../lib/local-store';
import { useLocalCollection } from './useLocalCollection';

const schema = storedRecordSchema.extend({ title: z.string() });
const record = (id: string, updatedAt: number) => ({ id, createdAt: updatedAt, updatedAt, title: id });

describe('useLocalCollection', () => {
  it('mirrors upsert, remove, import, and clear into state', () => {
    const collection = createCollection({ key: 'hook.items', schema });
    collection.upsert(record('seed', 1));
    const { result } = renderHook(() => useLocalCollection(collection));
    expect(result.current.items.map((item) => item.id)).toEqual(['seed']);

    act(() => {
      expect(result.current.upsert(record('fresh', 2))).toBe(true);
    });
    expect(result.current.items.map((item) => item.id)).toEqual(['fresh', 'seed']);

    act(() => result.current.remove('seed'));
    expect(result.current.items.map((item) => item.id)).toEqual(['fresh']);

    act(() => {
      expect(result.current.importJson(JSON.stringify([record('imported', 3)]))).toMatchObject({ imported: 1 });
    });
    expect(result.current.items).toHaveLength(2);

    act(() => result.current.clear());
    expect(result.current.items).toEqual([]);
    expect(collection.list()).toEqual([]);
  });

  it('reports storage errors and lets them be dismissed', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {},
    };
    const collection = createCollection({ key: 'hook.failing', schema, storage: failing });
    const { result } = renderHook(() => useLocalCollection(collection));

    act(() => {
      expect(result.current.upsert(record('a', 1))).toBe(false);
    });
    expect(result.current.error).toMatch(/run out of local storage/);

    act(() => result.current.dismissError());
    expect(result.current.error).toBe('');

    act(() => result.current.remove('a'));
    expect(result.current.error).toMatch(/run out of local storage/);

    act(() => {
      expect(result.current.importJson('nope')).toBeUndefined();
    });
    expect(result.current.error).toMatch(/not valid JSON/);
  });

  it('uses a generic message for unexpected failures', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const collection = createCollection({ key: 'hook.broken', schema, storage: broken });
    collection.importJson = () => {
      throw new Error('boom');
    };
    const { result } = renderHook(() => useLocalCollection(collection));
    act(() => {
      result.current.importJson('[]');
    });
    expect(result.current.error).toBe('The change could not be saved in this browser.');
  });
});
