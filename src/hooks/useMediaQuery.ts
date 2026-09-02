import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to one media query. Used for the layout decisions JavaScript has to make —
 * the rail collapses to icons under 1000px whatever the setting says.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
