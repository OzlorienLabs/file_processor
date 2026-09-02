import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { markHref, useFavicon } from './useFavicon';

function currentIcon(): string | undefined {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href') ?? undefined;
}

describe('useFavicon', () => {
  beforeEach(() => {
    document.head.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove());
  });

  it('creates the icon link and points it at the route mark', () => {
    renderHook(() => useFavicon('split'));
    expect(currentIcon()).toBe(markHref('split'));
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
  });

  it('reuses an existing link and restores the brand mark on unmount', () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = '/marks/brand.svg';
    document.head.append(link);

    const { unmount, rerender } = renderHook(({ mark }) => useFavicon(mark), {
      initialProps: { mark: 'ocr' as const },
    });
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
    expect(currentIcon()).toBe('/marks/ocr.svg');

    rerender({ mark: 'ocr' });
    unmount();
    expect(currentIcon()).toBe('/marks/brand.svg');
  });

  it('defaults to the brand mark', () => {
    renderHook(() => useFavicon());
    expect(currentIcon()).toBe('/marks/brand.svg');
  });
});
