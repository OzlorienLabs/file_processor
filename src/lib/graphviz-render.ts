import { rasterizeSvg, withExplicitSize, type RasterDeps, type RenderedDiagram } from './mermaid-render';

/** One Graphviz diagnostic, as the engine reports it. */
export interface GraphvizMessage {
  level?: 'error' | 'warning';
  message: string;
}

export type GraphvizResult =
  | { status: 'success'; output: string; errors: GraphvizMessage[] }
  | { status: 'failure'; output?: undefined; errors: GraphvizMessage[] };

/** Minimal surface of the @viz-js/viz instance that the renderer relies on. */
export interface GraphvizEngine {
  graphvizVersion: string;
  render(code: string, options: { format: string; engine: string }): GraphvizResult;
}

export class GraphvizSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphvizSyntaxError';
  }
}

export interface RenderedGraph extends RenderedDiagram {
  /** Non-fatal notes such as unknown shapes or colours; the graph still rendered. */
  warnings: string[];
}

export const MAX_GRAPHVIZ_CHARS = 100_000;

/** Every layout engine Graphviz ships, in the order graphviz.org documents them. */
export const layoutEngines = [
  { id: 'dot', label: 'dot', note: 'hierarchical, layered' },
  { id: 'neato', label: 'neato', note: 'spring model' },
  { id: 'fdp', label: 'fdp', note: 'force-directed' },
  { id: 'sfdp', label: 'sfdp', note: 'large graphs' },
  { id: 'circo', label: 'circo', note: 'circular' },
  { id: 'twopi', label: 'twopi', note: 'radial' },
  { id: 'osage', label: 'osage', note: 'clustered array' },
  { id: 'patchwork', label: 'patchwork', note: 'squarified tree map' },
  { id: 'nop', label: 'nop', note: 'keep node positions' },
  { id: 'nop1', label: 'nop1', note: 'keep node positions' },
  { id: 'nop2', label: 'nop2', note: 'keep node and edge positions' },
] as const;

export type LayoutEngine = (typeof layoutEngines)[number]['id'];

export function isLayoutEngine(value: string): value is LayoutEngine {
  return layoutEngines.some((engine) => engine.id === value);
}

/**
 * The Graphviz output formats this tool can write as files. SVG and PNG come from the
 * preview; everything here is produced by Graphviz itself as text.
 */
export const textFormats = [
  { id: 'gv', label: 'DOT with layout (.gv)', extension: 'gv', mime: 'text/vnd.graphviz' },
  { id: 'canon', label: 'Canonical DOT (.gv)', extension: 'gv', mime: 'text/vnd.graphviz' },
  { id: 'xdot', label: 'xdot drawing (.xdot)', extension: 'xdot', mime: 'text/vnd.graphviz' },
  { id: 'plain', label: 'Plain text (.plain)', extension: 'plain', mime: 'text/plain' },
  { id: 'plain-ext', label: 'Plain text with ports (.plain)', extension: 'plain', mime: 'text/plain' },
  { id: 'json', label: 'JSON with drawing (.json)', extension: 'json', mime: 'application/json' },
  { id: 'json0', label: 'JSON layout (.json)', extension: 'json', mime: 'application/json' },
  { id: 'dot_json', label: 'JSON graph (.json)', extension: 'json', mime: 'application/json' },
  { id: 'xdot_json', label: 'JSON xdot (.json)', extension: 'json', mime: 'application/json' },
  { id: 'eps', label: 'Encapsulated PostScript (.eps)', extension: 'eps', mime: 'application/postscript' },
  { id: 'ps', label: 'PostScript (.ps)', extension: 'ps', mime: 'application/postscript' },
  { id: 'ps2', label: 'PostScript for PDF (.ps)', extension: 'ps', mime: 'application/postscript' },
  { id: 'fig', label: 'Xfig (.fig)', extension: 'fig', mime: 'text/plain' },
  { id: 'pic', label: 'PIC / troff (.pic)', extension: 'pic', mime: 'text/plain' },
  { id: 'pov', label: 'POV-Ray scene (.pov)', extension: 'pov', mime: 'text/plain' },
  { id: 'tk', label: 'Tk canvas (.tk)', extension: 'tk', mime: 'text/plain' },
  { id: 'cmapx', label: 'HTML image map (.map)', extension: 'map', mime: 'text/html' },
  { id: 'imap', label: 'Server-side image map (.map)', extension: 'map', mime: 'text/plain' },
] as const;

export type TextFormat = (typeof textFormats)[number]['id'];

let enginePromise: Promise<GraphvizEngine> | undefined;

/** Loads the Graphviz WebAssembly build once, at the first render. */
export async function loadGraphviz(): Promise<GraphvizEngine> {
  enginePromise ??= import('@viz-js/viz').then(({ instance }) => instance() as Promise<GraphvizEngine>);
  return enginePromise;
}

/** Graphviz writes sizes in points; the preview and PNG work in CSS pixels. */
const PX_PER_PT = 96 / 72;

/** Reads the intrinsic size in pixels from the viewBox Graphviz always writes. */
export function graphSize(svg: string): { width: number; height: number } {
  const match = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  if (!match) return { width: 800, height: 600 };
  return {
    width: Math.max(1, Math.ceil(Number(match[1]) * PX_PER_PT)),
    height: Math.max(1, Math.ceil(Number(match[2]) * PX_PER_PT)),
  };
}

/** Drops the XML prologue, doctype and banner comment so the SVG can be re-wrapped by `svgBlob`. */
export function stripPrologue(svg: string): string {
  const start = svg.indexOf('<svg');
  return start > 0 ? svg.slice(start) : svg;
}

function messages(errors: GraphvizMessage[], level?: 'error'): string[] {
  return errors
    .filter((error) => !level || (error.level ?? 'error') === level)
    .map((error) => error.message.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function check(code: string) {
  if (!code.trim()) throw new GraphvizSyntaxError('Write some DOT to see a graph, for example: digraph { a -> b }');
  if (code.length > MAX_GRAPHVIZ_CHARS) {
    throw new GraphvizSyntaxError(`Graphs are limited to ${MAX_GRAPHVIZ_CHARS.toLocaleString()} characters.`);
  }
}

function run(code: string, format: string, layout: LayoutEngine, viz: GraphvizEngine): { output: string; warnings: string[] } {
  let result: GraphvizResult;
  try {
    result = viz.render(code, { format, engine: layout });
  } catch (reason) {
    // A WebAssembly trap leaves the instance's memory corrupt; load a fresh one next time.
    enginePromise = undefined;
    const detail = reason instanceof Error && reason.message ? ` (${reason.message})` : '';
    throw new GraphvizSyntaxError(
      `Graphviz stopped while laying out this graph${detail}. Try another layout engine; for sfdp, adding levels=1 to the graph often helps.`,
    );
  }
  if (result.status !== 'success') {
    throw new GraphvizSyntaxError(messages(result.errors, 'error').join(' ') || 'Graphviz could not parse this graph.');
  }
  // Graphviz reports some non-fatal problems at "error" level; the graph still rendered.
  return { output: result.output, warnings: messages(result.errors) };
}

/**
 * Lays out DOT source with `layout` and returns a sized SVG. A `layout=` attribute in the
 * source still wins, exactly as it does on the Graphviz command line.
 */
export async function renderGraphviz(code: string, layout: LayoutEngine = 'dot', engine?: GraphvizEngine): Promise<RenderedGraph> {
  check(code);
  const viz = engine ?? (await loadGraphviz());
  const { output, warnings } = run(code, 'svg', layout, viz);
  const svg = stripPrologue(output);
  const { width, height } = graphSize(svg);
  return { svg: withExplicitSize(svg, width, height), width, height, warnings };
}

/** Produces one of Graphviz's own text output formats, ready to save as a file. */
export async function renderGraphvizText(
  code: string,
  format: TextFormat,
  layout: LayoutEngine = 'dot',
  engine?: GraphvizEngine,
): Promise<string> {
  check(code);
  const viz = engine ?? (await loadGraphviz());
  return run(code, format, layout, viz).output;
}

export interface PdfWriter {
  addImage(data: Uint8Array, format: 'PNG', x: number, y: number, width: number, height: number): unknown;
  output(type: 'arraybuffer'): ArrayBuffer;
}

export type CreatePdf = (width: number, height: number) => Promise<PdfWriter>;

const createJsPdf: CreatePdf = async (width, height) => {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'px', format: [width, height], orientation: width > height ? 'landscape' : 'portrait', hotfixes: ['px_scaling'] });
};

/** A single-page PDF the size of the graph, holding a 2x raster of the preview. */
export async function graphToPdf(
  graph: RenderedDiagram,
  createPdf: CreatePdf = createJsPdf,
  deps?: RasterDeps,
): Promise<Blob> {
  const png = await rasterizeSvg(graph, 2, deps);
  const pdf = await createPdf(graph.width, graph.height);
  pdf.addImage(new Uint8Array(await png.arrayBuffer()), 'PNG', 0, 0, graph.width, graph.height);
  return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
}
