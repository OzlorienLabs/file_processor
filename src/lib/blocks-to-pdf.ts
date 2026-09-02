import type { DocBlock } from './doc-blocks';

/** Point sizes of the page formats the Word-to-PDF tool offers. */
const FORMATS = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;

const MARGIN = 56;

export interface PageSpec {
  format: keyof typeof FORMATS;
  orientation: 'portrait' | 'landscape';
}

export const defaultPageSpec: PageSpec = { format: 'a4', orientation: 'portrait' };

function headingSize(level: number): number {
  return [22, 18, 15, 13, 12, 11][Math.min(Math.max(level, 1), 6) - 1];
}

export async function renderBlocksToPdf(
  blocks: DocBlock[],
  page: PageSpec = defaultPageSpec,
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const size = FORMATS[page.format];
  const landscape = page.orientation === 'landscape';
  const pageWidth = landscape ? size.height : size.width;
  const pageHeight = landscape ? size.width : size.height;
  const doc = new jsPDF({ unit: 'pt', format: page.format, orientation: page.orientation });
  const usableWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  for (const block of blocks) {
    const isHeading = block.kind === 'heading';
    const size = isHeading ? headingSize(block.level) : 11;
    const lineHeight = size * 1.45;
    const indent = block.kind === 'list-item' ? 14 + (block.level - 0) * 12 : 0;
    const text = block.kind === 'list-item' ? `•  ${block.text}` : block.text;

    doc.setFont('helvetica', isHeading ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines: string[] = doc.splitTextToSize(text, usableWidth - indent);

    ensureRoom(lineHeight + (isHeading ? size * 0.6 : 0));
    if (isHeading && y > MARGIN) y += size * 0.6;
    for (const line of lines) {
      ensureRoom(lineHeight);
      doc.text(line, MARGIN + indent, y + size);
      y += lineHeight;
    }
    y += size * 0.55;
  }

  if (!blocks.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('This document contained no extractable text.', MARGIN, y + 11);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
