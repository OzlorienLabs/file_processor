import { describe, expect, it } from 'vitest';

import { renderBlocksToPdf } from './blocks-to-pdf';

function pdfText(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('renderBlocksToPdf', () => {
  it('renders headings, paragraphs, and list items into a valid PDF', async () => {
    const bytes = await renderBlocksToPdf([
      { kind: 'heading', level: 1, text: 'Quarterly Report' },
      { kind: 'paragraph', level: 0, text: 'Revenue grew steadily.' },
      { kind: 'list-item', level: 0, text: 'Expand the toolkit' },
    ]);

    const raw = pdfText(bytes);
    expect(raw.startsWith('%PDF')).toBe(true);
    expect(raw).toContain('Quarterly Report');
    expect(raw).toContain('Revenue grew steadily.');
    expect(raw).toContain('Expand the toolkit');
  });

  it('adds pages when content overflows one page', async () => {
    const blocks = Array.from({ length: 120 }, (_, index) => ({
      kind: 'paragraph' as const,
      level: 0,
      text: `Paragraph number ${index + 1} with enough words to occupy a full line of output.`,
    }));
    const bytes = await renderBlocksToPdf(blocks);
    const pageCount = (pdfText(bytes).match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
  });

  it('produces a placeholder page for an empty document', async () => {
    const bytes = await renderBlocksToPdf([]);
    expect(pdfText(bytes)).toContain('no extractable text');
  });
});
