import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { filterEmojis, type EmojiCatalog } from '../lib/emoji';

const INITIAL_VISIBLE = 600;

type CatalogState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; catalog: EmojiCatalog };

export default function EmojiPage() {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/emoji/catalog.json')
      .then((response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return response.json() as Promise<EmojiCatalog>;
      })
      .then((catalog) => {
        if (!cancelled) setState({ status: 'ready', catalog });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(
    () => (state.status === 'ready' ? filterEmojis(state.catalog, query, group) : []),
    [state, query, group],
  );
  const visible = matches.slice(0, visibleLimit);

  const copy = async (emoji: string) => {
    await navigator.clipboard.writeText(emoji);
    setCopied(emoji);
  };

  return (
    <main id="main-content" className="shell narrow-page page-section emoji-page">
      <p className="eyebrow">Unicode Emoji {state.status === 'ready' ? state.catalog.version : ''}</p>
      <h1>Every emoji, one searchable library</h1>
      <p className="lede">
        All {state.status === 'ready' ? state.catalog.count.toLocaleString() : ''} fully-qualified
        emoji. Click any of them to copy it.
      </p>

      {state.status === 'loading' ? <p className="progress-note" role="status">Loading the emoji catalog…</p> : null}
      {state.status === 'error' ? (
        <p className="field-error" role="alert">The emoji catalog could not be loaded. Refresh to try again.</p>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <div className="emoji-controls">
            <label className="field-label emoji-search" htmlFor="emoji-search">
              Search by name
              <span className="input-with-suffix">
                <input
                  id="emoji-search"
                  value={query}
                  placeholder="grinning, heart, flag…"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisibleLimit(INITIAL_VISIBLE);
                  }}
                />
                <Search aria-hidden="true" size={17} />
              </span>
            </label>
            <label className="field-label" htmlFor="emoji-group">
              Category
              <select
                id="emoji-group"
                value={group}
                onChange={(event) => {
                  setGroup(event.target.value);
                  setVisibleLimit(INITIAL_VISIBLE);
                }}
              >
                <option value="">All categories</option>
                {state.catalog.groups.map((candidate) => (
                  <option key={candidate.name} value={candidate.name}>{candidate.name}</option>
                ))}
              </select>
            </label>
          </div>

          <p className="emoji-count" role="status">
            {copied
              ? `Copied ${copied} to the clipboard.`
              : `${matches.length.toLocaleString()} emoji shown.`}
          </p>

          {matches.length ? (
            <ul className="emoji-grid">
              {visible.map((entry) => (
                <li key={entry.e}>
                  <button
                    type="button"
                    title={entry.n}
                    aria-label={`Copy ${entry.n}`}
                    data-copied={copied === entry.e ? 'true' : undefined}
                    onClick={() => copy(entry.e)}
                  >
                    {entry.e}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-workspace">No emoji match that search.</p>
          )}

          {matches.length > visible.length ? (
            <button
              className="button button-secondary emoji-more"
              type="button"
              onClick={() => setVisibleLimit(matches.length)}
            >
              Show all {matches.length.toLocaleString()} matches
            </button>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
