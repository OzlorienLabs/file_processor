/**
 * jsdom implements no matchMedia, and the app shell uses one to force the icon rail under
 * 1000px. This installs a controllable stand-in: tests call `setMatchedMedia` to say which
 * queries currently match, and subscribers are notified as a real MediaQueryList would.
 */
type Listener = (event: MediaQueryListEvent) => void;

const listeners = new Map<string, Set<Listener>>();
let matched = new Set<string>();

function listenersFor(query: string): Set<Listener> {
  const existing = listeners.get(query);
  if (existing) return existing;
  const created = new Set<Listener>();
  listeners.set(query, created);
  return created;
}

export function installMatchMedia(): void {
  window.matchMedia = ((query: string) => ({
    media: query,
    matches: matched.has(query),
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => listenersFor(query).add(listener),
    removeEventListener: (_type: string, listener: Listener) => listenersFor(query).delete(listener),
    addListener: (listener: Listener) => listenersFor(query).add(listener),
    removeListener: (listener: Listener) => listenersFor(query).delete(listener),
    dispatchEvent: () => true,
  })) as typeof window.matchMedia;
}

export function setMatchedMedia(queries: string[]): void {
  const next = new Set(queries);
  const changed = [...new Set([...matched, ...next])].filter(
    (query) => matched.has(query) !== next.has(query),
  );
  matched = next;
  for (const query of changed) {
    for (const listener of listenersFor(query)) {
      listener({ matches: next.has(query), media: query } as MediaQueryListEvent);
    }
  }
}

export function resetMatchedMedia(): void {
  matched = new Set();
  listeners.clear();
}
