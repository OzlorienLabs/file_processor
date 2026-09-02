import { useEffect } from 'react';

import type { MarkId } from '../components/ToolMark/marks';

const DEFAULT_MARK: MarkId = 'brand';

function iconLink(): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (existing) return existing;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  document.head.append(link);
  return link;
}

/** The path a mark's standalone favicon is served from. */
export function markHref(mark: MarkId): string {
  return `/marks/${mark}.svg`;
}

/**
 * Points `<link rel="icon">` at the current route's registration mark, and puts the brand
 * mark back when the route unmounts.
 */
export function useFavicon(mark: MarkId = DEFAULT_MARK): void {
  useEffect(() => {
    const link = iconLink();
    link.type = 'image/svg+xml';
    link.href = markHref(mark);
    return () => {
      link.href = markHref(DEFAULT_MARK);
    };
  }, [mark]);
}
