import { Check, ExternalLink, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { copyText } from '../../lib/download';
import { filterEmojis, type EmojiCatalog } from '../../lib/emoji';

const INITIAL_VISIBLE = 360;

type CatalogState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; catalog: EmojiCatalog };

let cachedCatalog: EmojiCatalog | null = null;

export interface EmojiReferencePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertEmoji: (emoji: string) => void;
}

export function EmojiReferencePanel({ isOpen, onClose, onInsertEmoji }: EmojiReferencePanelProps) {
  const [state, setState] = useState<CatalogState>(() =>
    cachedCatalog ? { status: 'ready', catalog: cachedCatalog } : { status: 'loading' },
  );
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE);
  const [statusMessage, setStatusMessage] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || cachedCatalog) return;

    let cancelled = false;
    fetch('/emoji/catalog.json')
      .then((response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return response.json() as Promise<EmojiCatalog>;
      })
      .then((catalog) => {
        cachedCatalog = catalog;
        if (!cancelled) setState({ status: 'ready', catalog });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Focus search on open
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const matches = useMemo(
    () => (state.status === 'ready' ? filterEmojis(state.catalog, query, group) : []),
    [state, query, group],
  );
  const visible = matches.slice(0, visibleLimit);

  const handleSelect = async (emoji: string, name: string) => {
    onInsertEmoji(emoji);
    if (await copyText(emoji)) {
      setStatusMessage(`Inserted ${emoji} (${name}) into note & copied`);
    } else {
      setStatusMessage(`Inserted ${emoji} (${name}) into note`);
    }
    setTimeout(() => setStatusMessage(''), 3000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="emoji-ref-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Emoji library reference tool"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="emoji-reference-panel">
        <div className="emoji-ref-header">
          <div className="emoji-ref-title">
            <span className="pill-tool-badge">
              <Sparkles aria-hidden="true" size={13} /> Reference tool
            </span>
            <h3>Emoji library</h3>
          </div>
          <div className="emoji-ref-actions">
            <Link
              className="button-ghost-sm"
              to="/en/emojis"
              target="_blank"
              rel="noopener noreferrer"
              title="Open full page emoji catalog in a new tab"
            >
              <ExternalLink aria-hidden="true" size={14} /> Full page
            </Link>
            <button
              className="button-ghost-sm close-button"
              type="button"
              aria-label="Close emoji reference"
              onClick={onClose}
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        <p className="emoji-ref-desc">
          Search and click any emoji to insert it into your note at the cursor and copy it.
        </p>

        {state.status === 'loading' ? (
          <p className="progress-note" role="status">
            Loading the emoji library…
          </p>
        ) : null}

        {state.status === 'error' ? (
          <p className="field-error" role="alert">
            The emoji catalog could not be loaded. Check your connection.
          </p>
        ) : null}

        {state.status === 'ready' ? (
          <>
            <div className="emoji-ref-controls">
              <label className="field-label" htmlFor="emoji-ref-search">
                <span className="sr-only">Search emoji</span>
                <span className="input-with-suffix">
                  <input
                    id="emoji-ref-search"
                    ref={searchInputRef}
                    value={query}
                    placeholder="Search emoji (smile, heart, flag…)"
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setVisibleLimit(INITIAL_VISIBLE);
                    }}
                  />
                  <Search aria-hidden="true" size={15} />
                </span>
              </label>

              <label className="field-label" htmlFor="emoji-ref-group">
                <span className="sr-only">Category</span>
                <select
                  id="emoji-ref-group"
                  value={group}
                  onChange={(event) => {
                    setGroup(event.target.value);
                    setVisibleLimit(INITIAL_VISIBLE);
                  }}
                >
                  <option value="">All categories</option>
                  {state.catalog.groups.map((candidate) => (
                    <option key={candidate.name} value={candidate.name}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="emoji-ref-status" role="status">
              {statusMessage ? (
                <span className="pill-ok">
                  <Check aria-hidden="true" size={13} /> {statusMessage}
                </span>
              ) : (
                <span>{matches.length.toLocaleString()} emoji available</span>
              )}
            </div>

            {matches.length ? (
              <div className="emoji-ref-scroll">
                <ul className="emoji-ref-grid">
                  {visible.map((entry) => (
                    <li key={entry.e}>
                      <button
                        type="button"
                        title={`${entry.n} (Click to insert & copy)`}
                        aria-label={`Insert ${entry.n} ${entry.e}`}
                        onClick={() => void handleSelect(entry.e, entry.n)}
                      >
                        {entry.e}
                      </button>
                    </li>
                  ))}
                </ul>
                {matches.length > visible.length ? (
                  <button
                    className="button button-secondary button-sm emoji-more-btn"
                    type="button"
                    onClick={() => setVisibleLimit(matches.length)}
                  >
                    Show all {matches.length.toLocaleString()} matches
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="empty-workspace">No emoji match that search.</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
