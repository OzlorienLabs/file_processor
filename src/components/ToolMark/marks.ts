import type { ToolId } from '../../app/tool-catalog';

/**
 * The FileKit registration marks: one brand mark plus one per tool, drawn on the same
 * 24x24 press grid (rings, crosshairs, plates and targets, stroke 1.7) so each reads at
 * 16px and can serve as its tool's favicon.
 *
 * Shapes are data rather than markup so the same definition renders three ways: as inline
 * SVG that follows the theme through `var(--color-*)` (ToolMark.tsx), as a standalone file
 * with literal inks (`public/marks/<id>.svg`), and as the plate on a social card
 * (`public/og/<id>.png`). `scripts/generate-marks.ts` writes the last two.
 */

/** The three press inks a mark may use. */
export type Ink = 'accent' | 'accent-2' | 'text';

export type MarkId = ToolId | 'brand';

interface Common {
  stroke?: Ink;
  fill?: Ink;
  strokeWidth?: number;
  opacity?: number;
  transform?: string;
}

export type Shape =
  | (Common & { kind: 'path'; d: string })
  | (Common & { kind: 'circle'; cx: number; cy: number; r: number })
  | (Common & { kind: 'rect'; x: number; y: number; width: number; height: number });

export interface MarkDefinition {
  /** Description used as the mark's accessible label when it is not decorative. */
  title: string;
  /** Only the brand mark's plate offset bleeds outside the 24x24 box. */
  overflowVisible?: boolean;
  strokeLinecap?: 'square';
  shapes: Shape[];
}

/**
 * Broadsheet's inks, written out for the standalone files: a favicon has no page to
 * inherit custom properties from. `inkVar` is what the React component uses instead.
 */
export const inkHex: Record<Ink, string> = {
  accent: '#0088b0',
  'accent-2': '#d6006c',
  text: '#201e1d',
};

export const inkVar: Record<Ink, string> = {
  accent: 'var(--color-accent)',
  'accent-2': 'var(--color-accent-2)',
  text: 'var(--color-text)',
};

export const marks: Record<MarkId, MarkDefinition> = {
  brand: {
    title: 'FileKit',
    overflowVisible: true,
    strokeLinecap: 'square',
    shapes: [
      { kind: 'path', d: 'M5.3 3.7h9.2l4.2 4.2v12.4H5.3z', stroke: 'accent-2', opacity: 0.72, transform: 'translate(1.1 0.85)' },
      { kind: 'path', d: 'M5.3 3.7h9.2l4.2 4.2v12.4H5.3z', stroke: 'accent' },
      { kind: 'path', d: 'M14.5 3.7v4.2h4.2', stroke: 'accent' },
      { kind: 'circle', cx: 12, cy: 13.4, r: 3.4, stroke: 'text' },
      { kind: 'path', d: 'M12 8.3v10.2M6.9 13.4h10.2', stroke: 'text', strokeWidth: 1.1 },
    ],
  },
  convert: {
    title: 'Convert files',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 8.4, stroke: 'accent' },
      { kind: 'path', d: 'M6.6 10h9.6M13.4 7.4 16.2 10l-2.8 2.6', stroke: 'text' },
      { kind: 'path', d: 'M17.4 14.4H7.8M10.6 11.8 7.8 14.4l2.8 2.6', stroke: 'accent-2' },
    ],
  },
  compress: {
    title: 'Compress files',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 8.4, stroke: 'accent' },
      { kind: 'path', d: 'M4.4 5.2h15.2M4.4 18.8h15.2', stroke: 'accent-2', strokeWidth: 1.9 },
      { kind: 'path', d: 'M12 7.6v3.2M12 16.4v-3.2M9.6 9.6 12 7.2l2.4 2.4M9.6 14.4 12 16.8l2.4-2.4', stroke: 'text' },
    ],
  },
  summarize: {
    title: 'Summarize a file',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 8.4, stroke: 'accent' },
      { kind: 'path', d: 'M6.4 8.6h11.2M6.4 12h8.2M6.4 15.4h4.8', stroke: 'text' },
      { kind: 'path', d: 'M17.6 15.4h-2.6', stroke: 'accent-2' },
    ],
  },
  merge: {
    title: 'Merge PDF',
    shapes: [
      { kind: 'circle', cx: 9.2, cy: 12, r: 6.4, stroke: 'accent' },
      { kind: 'circle', cx: 14.8, cy: 12, r: 6.4, stroke: 'accent-2' },
      { kind: 'path', d: 'M12 6.6v10.8', stroke: 'text', strokeWidth: 1.1 },
    ],
  },
  ocr: {
    title: 'Extract text with OCR',
    shapes: [
      { kind: 'path', d: 'M3.4 8V3.6h4.4M20.6 8V3.6h-4.4M3.4 16v4.4h4.4M20.6 16v4.4h-4.4', stroke: 'accent' },
      { kind: 'path', d: 'M8 14.6 12 7.4l4 7.2M9.6 12.2h4.8', stroke: 'text' },
      { kind: 'path', d: 'M7.6 17.4h8.8', stroke: 'accent-2' },
    ],
  },
  'audio-to-text': {
    title: 'Audio to text',
    shapes: [
      { kind: 'circle', cx: 8, cy: 12, r: 2.4, stroke: 'text' },
      { kind: 'path', d: 'M12.4 8.2a6 6 0 0 1 0 7.6M16 5.6a10 10 0 0 1 0 12.8', stroke: 'accent' },
      { kind: 'path', d: 'M3.6 12h1.8', stroke: 'accent-2', strokeWidth: 1.9 },
    ],
  },
  split: {
    title: 'Split PDF',
    shapes: [
      { kind: 'path', d: 'M10.2 4.4H4.6v15.2h5.6', stroke: 'accent' },
      { kind: 'path', d: 'M13.8 4.4h5.6v15.2h-5.6', stroke: 'accent-2' },
      { kind: 'path', d: 'M12 2.8v3.4M12 10.4v3.2M12 17.8v3.4', stroke: 'text', strokeWidth: 1.2 },
    ],
  },
  'word-to-pdf': {
    title: 'Word to PDF',
    shapes: [
      { kind: 'rect', x: 3.2, y: 5.2, width: 7.2, height: 13.6, stroke: 'accent' },
      { kind: 'circle', cx: 17.6, cy: 12, r: 4.4, stroke: 'accent-2' },
      { kind: 'path', d: 'M11.4 12h2.6M12.6 10.4 14.2 12l-1.6 1.6', stroke: 'text' },
    ],
  },
  'pdf-to-word': {
    title: 'PDF to Word',
    shapes: [
      { kind: 'circle', cx: 6.4, cy: 12, r: 4.4, stroke: 'accent' },
      { kind: 'rect', x: 13.6, y: 5.2, width: 7.2, height: 13.6, stroke: 'accent-2' },
      { kind: 'path', d: 'M11 12h2.6M12.2 10.4 13.8 12l-1.6 1.6', stroke: 'text' },
    ],
  },
  notepad: {
    title: 'Notepad',
    shapes: [
      { kind: 'path', d: 'M4.8 3.8h9.4l4.6 4.6v11.8H4.8z', stroke: 'accent' },
      { kind: 'path', d: 'M8 10.2h7.2M8 13.4h7.2M8 16.6h4', stroke: 'text', strokeWidth: 1.2 },
      { kind: 'path', d: 'M14.2 3.8v4.6h4.6', stroke: 'accent-2' },
    ],
  },
  markdown: {
    title: 'Markdown previewer',
    shapes: [
      { kind: 'circle', cx: 12, cy: 12, r: 8.4, stroke: 'accent' },
      { kind: 'path', d: 'M12 3.6a8.4 8.4 0 0 0 0 16.8z', fill: 'accent', opacity: 0.9 },
      { kind: 'path', d: 'M12 3.6v16.8', stroke: 'accent-2', strokeWidth: 1.2 },
    ],
  },
  diff: {
    title: 'Diff checker',
    shapes: [
      { kind: 'rect', x: 3.4, y: 4.6, width: 12, height: 12, stroke: 'accent' },
      { kind: 'rect', x: 8.6, y: 7.4, width: 12, height: 12, stroke: 'accent-2' },
      { kind: 'path', d: 'M12 2.8v18.4', stroke: 'text', strokeWidth: 1.1, opacity: 0.5 },
    ],
  },
  diagram: {
    title: 'Diagram creator',
    shapes: [
      { kind: 'rect', x: 3.4, y: 3.6, width: 6.2, height: 6.2, stroke: 'accent' },
      { kind: 'rect', x: 14.4, y: 14.2, width: 6.2, height: 6.2, stroke: 'accent' },
      { kind: 'circle', cx: 17.5, cy: 6.7, r: 3.1, stroke: 'accent-2' },
      { kind: 'path', d: 'M9.6 6.7h4.8M6.5 9.8v7.5h7.9', stroke: 'text', strokeWidth: 1.2 },
    ],
  },
  mermaid: {
    title: 'Mermaid editor',
    shapes: [
      { kind: 'circle', cx: 12, cy: 5.4, r: 2.8, stroke: 'accent' },
      { kind: 'circle', cx: 6, cy: 18, r: 2.8, stroke: 'accent' },
      { kind: 'circle', cx: 18, cy: 18, r: 2.8, stroke: 'accent-2' },
      { kind: 'path', d: 'M10.4 7.8 7.4 15.4M13.6 7.8l3 7.6', stroke: 'text', strokeWidth: 1.2 },
    ],
  },
  snippets: {
    title: 'Code snippets',
    shapes: [
      { kind: 'path', d: 'M8.2 4.6 3.6 12l4.6 7.4', stroke: 'accent' },
      { kind: 'path', d: 'M15.8 4.6 20.4 12l-4.6 7.4', stroke: 'accent' },
      { kind: 'circle', cx: 12, cy: 12, r: 2.4, stroke: 'accent-2' },
    ],
  },
  'snippet-generator': {
    title: 'Snippet generator',
    shapes: [
      { kind: 'circle', cx: 10.6, cy: 13.4, r: 6.2, stroke: 'accent' },
      { kind: 'path', d: 'M10.6 7.2v12.4M4.4 13.4h12.4', stroke: 'text', strokeWidth: 1.1, opacity: 0.55 },
      { kind: 'path', d: 'M18.4 3 19.6 6l3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z', fill: 'accent-2' },
    ],
  },
};

export const markIds = Object.keys(marks) as MarkId[];

/** Serialises one shape to SVG attributes, resolving inks through `ink`. */
export function shapeAttributes(shape: Shape, ink: Record<Ink, string>): Record<string, string> {
  const attributes: Record<string, string> = {};
  if (shape.kind === 'path') attributes.d = shape.d;
  if (shape.kind === 'circle') {
    attributes.cx = String(shape.cx);
    attributes.cy = String(shape.cy);
    attributes.r = String(shape.r);
  }
  if (shape.kind === 'rect') {
    attributes.x = String(shape.x);
    attributes.y = String(shape.y);
    attributes.width = String(shape.width);
    attributes.height = String(shape.height);
  }
  // A filled shape carries no stroke, matching the drawn marks.
  attributes.fill = shape.fill ? ink[shape.fill] : 'none';
  if (shape.fill) attributes.stroke = 'none';
  else if (shape.stroke) attributes.stroke = ink[shape.stroke];
  if (shape.strokeWidth !== undefined) attributes['stroke-width'] = String(shape.strokeWidth);
  if (shape.opacity !== undefined) attributes.opacity = String(shape.opacity);
  if (shape.transform) attributes.transform = shape.transform;
  return attributes;
}

function serialise(shape: Shape, ink: Record<Ink, string>): string {
  const attributes = shapeAttributes(shape, ink);
  const pairs = Object.entries(attributes)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ');
  return `<${shape.kind} ${pairs}/>`;
}

/** The mark as a standalone SVG document with literal inks — used for the favicon files. */
export function markSvg(id: MarkId): string {
  const mark = marks[id];
  const linecap = mark.strokeLinecap ? ` stroke-linecap="${mark.strokeLinecap}"` : '';
  const body = mark.shapes.map((shape) => `  ${serialise(shape, inkHex)}`).join('\n');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"' +
      ` fill="none" stroke-width="1.7"${linecap}>`,
    `  <title>${mark.title}</title>`,
    body,
    '</svg>',
    '',
  ].join('\n');
}
