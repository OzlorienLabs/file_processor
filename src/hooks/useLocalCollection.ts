import { useCallback, useState } from 'react';

import { LocalStoreError, type Collection, type ImportResult, type StoredRecord } from '../lib/local-store';

export interface LocalCollectionState<T extends StoredRecord> {
  items: T[];
  error: string;
  upsert: (record: T) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  importJson: (json: string) => ImportResult<T> | undefined;
  dismissError: () => void;
}

function describe(reason: unknown): string {
  return reason instanceof LocalStoreError ? reason.message : 'The change could not be saved in this browser.';
}

/** React state mirror of a localStorage collection with friendly error reporting. */
export function useLocalCollection<T extends StoredRecord>(collection: Collection<T>): LocalCollectionState<T> {
  const [items, setItems] = useState<T[]>(() => collection.list());
  const [error, setError] = useState('');

  const upsert = useCallback(
    (record: T) => {
      try {
        setItems(collection.upsert(record));
        setError('');
        return true;
      } catch (reason) {
        setError(describe(reason));
        return false;
      }
    },
    [collection],
  );

  const remove = useCallback(
    (id: string) => {
      try {
        setItems(collection.remove(id));
      } catch (reason) {
        setError(describe(reason));
      }
    },
    [collection],
  );

  const clear = useCallback(() => {
    collection.clear();
    setItems([]);
    setError('');
  }, [collection]);

  const importJson = useCallback(
    (json: string) => {
      try {
        const result = collection.importJson(json);
        setItems(result.list);
        setError('');
        return result;
      } catch (reason) {
        setError(describe(reason));
        return undefined;
      }
    },
    [collection],
  );

  return { items, error, upsert, remove, clear, importJson, dismissError: () => setError('') };
}
