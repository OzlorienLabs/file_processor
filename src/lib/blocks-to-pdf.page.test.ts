import { describe, expect, it, vi } from 'vitest';

import { defaultPageSpec, renderBlocksToPdf } from './blocks-to-pdf';

const addPage = vi.fn();
const text = vi.fn();

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(public options: unknown) {}
    setFont = vi.fn();
    setFontSize = vi.fn();
    splitTextToSize = (value: string) => [value];
    text = text;
    addPage = addPage;
    output = () => new ArrayBuffer(4);
  },
}));

describe('page sizes', () => {
  it('defaults to A4 portrait', () => {
    expect(defaultPageSpec).toEqual({ format: 'a4', orientation: 'portrait' });
  });

  it('lays out landscape Letter without running off the page', async () => {
    const blocks = Array.from({ length: 40 }, (_, index) => ({
      kind: 'paragraph' as const,
      level: 0,
      text: `line ${index}`,
    }));
    const bytes = await renderBlocksToPdf(blocks, { format: 'letter', orientation: 'landscape' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    // The shorter landscape page forces more page breaks than portrait A4 would.
    expect(addPage).toHaveBeenCalled();
  });
});
