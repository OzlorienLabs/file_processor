import { useEffect } from 'react';

import type { MarkId } from '../components/ToolMark/marks';
import { useFavicon } from './useFavicon';

interface ToolMeta {
  mark: MarkId;
  title: string;
  description: string;
}

const BASE_TITLE = 'FileKit';

function metaTag(attribute: 'property' | 'name', key: string): HTMLMetaElement {
  const existing = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (existing) return existing;
  const tag = document.createElement('meta');
  tag.setAttribute(attribute, key);
  document.head.append(tag);
  return tag;
}

/** The social card generated from this mark by `scripts/generate-marks.ts`. */
export function socialImageHref(mark: MarkId): string {
  return `/og/${mark}.png`;
}

/**
 * Names the page after the tool and points the social card and favicon at the tool's own
 * registration mark. Restores the FileKit defaults when the route unmounts.
 */
export function useToolMeta({ mark, title, description }: ToolMeta): void {
  useFavicon(mark);

  useEffect(() => {
    const previousTitle = document.title;
    const pageTitle = `${title} — ${BASE_TITLE}`;
    const tags: [HTMLMetaElement, string][] = [
      [metaTag('name', 'description'), description],
      [metaTag('property', 'og:title'), pageTitle],
      [metaTag('property', 'og:description'), description],
      [metaTag('property', 'og:image'), socialImageHref(mark)],
      [metaTag('name', 'twitter:card'), 'summary_large_image'],
    ];
    const previous = tags.map(([tag]) => tag.content);

    document.title = pageTitle;
    tags.forEach(([tag, value]) => {
      tag.content = value;
    });

    return () => {
      document.title = previousTitle;
      tags.forEach(([tag], index) => {
        tag.content = previous[index];
      });
    };
  }, [mark, title, description]);
}
