import type { DocBlock } from './doc-blocks';

const PAGE = { width: 595.28, height: 841.89, margin: 56 };

function headingSize(level: number): number {
  return [22, 18, 15, 13, 12, 11][Math.min(Math.max(level, 1), 6) - 1];
}

export async function renderBlocksToPdf(blocks: DocBlock[]): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const usableWidth = PAGE.width - PAGE.margin * 2;
  let y = PAGE.margin;

  const ensureRoom = (needed: number) => {
    if (y + needed > PAGE.height - PAGE.margin) {
      doc.addPage();
      y = PAGE.margin;
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
    if (isHeading && y > PAGE.margin) y += size * 0.6;
    for (const line of lines) {
      ensureRoom(lineHeight);
      doc.text(line, PAGE.margin + indent, y + size);
      y += lineHeight;
    }
    y += size * 0.55;
  }

  if (!blocks.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('This document contained no extractable text.', PAGE.margin, y + 11);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
