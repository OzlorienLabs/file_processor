/** Minimal surface of the mermaid module that the renderer relies on. */
export interface MermaidEngine {
  initialize(config: Record<string, unknown>): void;
  render(id: string, code: string): Promise<{ svg: string }>;
}

export class MermaidSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MermaidSyntaxError';
  }
}

export interface RenderedDiagram {
  svg: string;
  width: number;
  height: number;
}

export const MAX_MERMAID_CHARS = 50_000;

let enginePromise: Promise<MermaidEngine> | undefined;
let renderCounter = 0;

/**
 * Mermaid in the Broadsheet inks: white or cyan-100 node fills, 1.6px ink or cyan borders,
 * serif labels. The values are literal because the SVG is exported and rasterised on its own,
 * away from any page that could supply the custom properties.
 */
export const mermaidTheme = {
  background: '#ffffff',
  primaryColor: '#e9f8ff',
  primaryBorderColor: '#0088b0',
  primaryTextColor: '#201e1d',
  secondaryColor: '#ffffff',
  secondaryBorderColor: '#201e1d',
  secondaryTextColor: '#201e1d',
  tertiaryColor: '#f8f4f4',
  tertiaryBorderColor: '#605d5d',
  tertiaryTextColor: '#201e1d',
  lineColor: '#201e1d',
  textColor: '#201e1d',
  mainBkg: '#ffffff',
  nodeBorder: '#201e1d',
  nodeTextColor: '#201e1d',
  clusterBkg: '#f8f4f4',
  clusterBorder: '#d7d3d3',
  titleColor: '#201e1d',
  edgeLabelBackground: '#f3f2f2',
  actorBkg: '#e9f8ff',
  actorBorder: '#0088b0',
  actorTextColor: '#201e1d',
  signalColor: '#201e1d',
  signalTextColor: '#201e1d',
  labelBoxBkgColor: '#ffffff',
  labelBoxBorderColor: '#201e1d',
  noteBkgColor: '#fff1f4',
  noteBorderColor: '#d6006c',
  noteTextColor: '#201e1d',
  pie1: '#0088b0',
  pie2: '#d6006c',
  pie3: '#edbb00',
  pie4: '#99e0ff',
  pie5: '#ffc0d0',
  fontFamily: '"Source Serif 4", ui-serif, Georgia, serif',
  fontSize: '15px',
} as const;

/** 1.6px strokes on every node and edge, per the diagram spec. */
const MERMAID_CSS = `
  .node rect, .node circle, .node ellipse, .node polygon, .node path,
  .cluster rect, .actor, .labelBox { stroke-width: 1.6px; }
  .edgePath .path, .flowchart-link, .messageLine0, .messageLine1 { stroke-width: 1.6px; }
  .nodeLabel, .edgeLabel, .label, text { font-family: "Source Serif 4", ui-serif, Georgia, serif; }
`;

async function loadEngine(): Promise<MermaidEngine> {
  enginePromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: mermaidTheme,
      themeCSS: MERMAID_CSS,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
      fontFamily: mermaidTheme.fontFamily,
    });
    return mermaid as unknown as MermaidEngine;
  });
  return enginePromise;
}

/** Reads the intrinsic size from the SVG viewBox (mermaid always sets one). */
export function svgSize(svg: string): { width: number; height: number } {
  const match = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  if (!match) return { width: 800, height: 600 };
  return { width: Math.max(1, Math.ceil(Number(match[1]))), height: Math.max(1, Math.ceil(Number(match[2]))) };
}

/** Gives the root element explicit pixel dimensions so browsers treat the SVG as a sized image. */
export function withExplicitSize(svg: string, width: number, height: number): string {
  return svg.replace(/<svg\b([^>]*)>/, (_match, attributes: string) => {
    const cleaned = attributes.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${cleaned} width="${width}" height="${height}">`;
  });
}

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  const firstLines = message.split('\n').slice(0, 3).join(' ').replace(/\s+/g, ' ').trim();
  return firstLines || 'Mermaid could not parse this diagram.';
}

export async function renderMermaid(code: string, engine?: MermaidEngine): Promise<RenderedDiagram> {
  if (!code.trim()) throw new MermaidSyntaxError('Write some Mermaid syntax to see a diagram.');
  if (code.length > MAX_MERMAID_CHARS) {
    throw new MermaidSyntaxError(`Diagrams are limited to ${MAX_MERMAID_CHARS.toLocaleString()} characters.`);
  }
  const mermaid = engine ?? (await loadEngine());
  renderCounter += 1;
  const id = `filekit-mermaid-${renderCounter}`;
  try {
    const { svg } = await mermaid.render(id, code);
    const { width, height } = svgSize(svg);
    return { svg: withExplicitSize(svg, width, height), width, height };
  } catch (reason) {
    throw new MermaidSyntaxError(describeError(reason));
  } finally {
    // mermaid leaves its scratch container behind when parsing fails.
    document.getElementById(`d${id}`)?.remove();
  }
}

export function svgBlob(svg: string): Blob {
  return new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', svg], { type: 'image/svg+xml;charset=utf-8' });
}

export interface RasterDeps {
  loadImage(url: string): Promise<CanvasImageSource>;
  createCanvas(width: number, height: number): HTMLCanvasElement;
}

export const browserRasterDeps: RasterDeps = {
  loadImage: (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The diagram image could not be decoded.'));
      image.src = url;
    }),
  createCanvas: (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
};

/** Paints the SVG onto a white canvas at `scale` and returns a PNG. */
export async function rasterizeSvg(diagram: RenderedDiagram, scale = 2, deps: RasterDeps = browserRasterDeps): Promise<Blob> {
  const url = URL.createObjectURL(svgBlob(diagram.svg));
  try {
    const image = await deps.loadImage(url);
    const canvas = deps.createCanvas(Math.ceil(diagram.width * scale), Math.ceil(diagram.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot create an image canvas.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be encoded.'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
