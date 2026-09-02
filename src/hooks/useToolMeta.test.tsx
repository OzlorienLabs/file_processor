import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { socialImageHref, useToolMeta } from './useToolMeta';

function meta(attribute: string, key: string): string | undefined {
  return document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)?.content;
}

describe('useToolMeta', () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta, link[rel="icon"]').forEach((node) => node.remove());
    document.title = 'FileKit';
  });

  it('names the page after the tool and points the card at its mark', () => {
    renderHook(() =>
      useToolMeta({ mark: 'merge', title: 'Merge PDF', description: 'Combine PDFs and images.' }),
    );

    expect(document.title).toBe('Merge PDF — FileKit');
    expect(meta('property', 'og:title')).toBe('Merge PDF — FileKit');
    expect(meta('property', 'og:description')).toBe('Combine PDFs and images.');
    expect(meta('property', 'og:image')).toBe(socialImageHref('merge'));
    expect(meta('name', 'description')).toBe('Combine PDFs and images.');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href')).toBe(
      '/marks/merge.svg',
    );
  });

  it('restores the document defaults when the route unmounts', () => {
    const existing = document.createElement('meta');
    existing.setAttribute('name', 'description');
    existing.content = 'FileKit — private file tools.';
    document.head.append(existing);

    const { unmount } = renderHook(() =>
      useToolMeta({ mark: 'ocr', title: 'OCR', description: 'Read printed text.' }),
    );
    expect(meta('name', 'description')).toBe('Read printed text.');

    unmount();
    expect(document.title).toBe('FileKit');
    expect(meta('name', 'description')).toBe('FileKit — private file tools.');
  });
});
