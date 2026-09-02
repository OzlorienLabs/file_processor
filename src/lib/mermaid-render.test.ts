import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  browserRasterDeps,
  MAX_MERMAID_CHARS,
  MermaidSyntaxError,
  rasterizeSvg,
  renderMermaid,
  svgBlob,
  svgSize,
  withExplicitSize,
  type MermaidEngine,
} from './mermaid-render';

const sampleSvg = '<svg viewBox="0 0 120.5 40" width="100%" style="max-width: 120px" xmlns="http://www.w3.org/2000/svg"><g/></svg>';

function fakeEngine(result: string | Error = sampleSvg): MermaidEngine {
  return {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => {
      const scratch = document.createElement('div');
      scratch.id = `d${id}`;
      document.body.appendChild(scratch);
      if (result instanceof Error) throw result;
      return { svg: result };
    }),
  };
}

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg viewBox="0 0 30 20"></svg>' })),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('svg helpers', () => {
  it('reads the size from the viewBox and falls back sensibly', () => {
    expect(svgSize(sampleSvg)).toEqual({ width: 121, height: 40 });
    expect(svgSize('<svg viewBox="0 0 0 0"/>')).toEqual({ width: 1, height: 1 });
    expect(svgSize('<svg/>')).toEqual({ width: 800, height: 600 });
  });

  it('replaces width and height on the root element only', () => {
    const sized = withExplicitSize(sampleSvg, 121, 40);
    expect(sized.startsWith('<svg viewBox="0 0 120.5 40" style="max-width: 120px" xmlns="http://www.w3.org/2000/svg" width="121" height="40">')).toBe(true);
    expect(sized.match(/width=/g)).toHaveLength(1);
  });

  it('wraps SVG text in a typed blob with an XML prologue', async () => {
    const blob = svgBlob('<svg/>');
    expect(blob.type).toContain('image/svg+xml');
    expect(await blob.text()).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<svg/>');
  });
});

describe('renderMermaid', () => {
  it('renders through the engine, sizes the SVG, and cleans up scratch nodes', async () => {
    const engine = fakeEngine();
    const result = await renderMermaid('flowchart TD\n A-->B', engine);
    expect(result.width).toBe(121);
    expect(result.height).toBe(40);
    expect(result.svg).toContain('width="121" height="40"');
    expect(document.querySelectorAll('div[id^="dfilekit-mermaid-"]')).toHaveLength(0);
  });

  it('turns engine failures into a concise MermaidSyntaxError and removes leftovers', async () => {
    const engine = fakeEngine(new Error('Parse error on line 2:\n...A-->\n----^\nExpecting NODE_STRING'));
    await expect(renderMermaid('flowchart TD\n A-->', engine)).rejects.toThrow(MermaidSyntaxError);
    await expect(renderMermaid('flowchart TD\n A-->', engine)).rejects.toThrow('Parse error on line 2: ...A--> ----^');
    expect(document.querySelectorAll('div[id^="dfilekit-mermaid-"]')).toHaveLength(0);

    const stringy = { initialize: vi.fn(), render: vi.fn(async () => { throw 'nope'; }) };
    await expect(renderMermaid('x', stringy)).rejects.toThrow('nope');
    const empty = { initialize: vi.fn(), render: vi.fn(async () => { throw new Error('   '); }) };
    await expect(renderMermaid('x', empty)).rejects.toThrow(/could not parse/);
  });

  it('loads and configures the real engine when none is injected', async () => {
    const result = await renderMermaid('pie\n "a": 1');
    expect(result).toMatchObject({ width: 30, height: 20 });
    const mermaid = (await import('mermaid')).default;
    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: 'strict', htmlLabels: false }));
  });

  it('rejects empty and oversized input before touching the engine', async () => {
    const engine = fakeEngine();
    await expect(renderMermaid('   ', engine)).rejects.toThrow(/write some mermaid/i);
    await expect(renderMermaid('a'.repeat(MAX_MERMAID_CHARS + 1), engine)).rejects.toThrow(/limited to/);
    expect(engine.render).not.toHaveBeenCalled();
  });
});

describe('rasterizeSvg', () => {
  const diagram = { svg: sampleSvg, width: 100, height: 50 };

  it('draws the image on a white canvas at the requested scale', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:svg'), revokeObjectURL: vi.fn() });
    const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' };
    const image = {} as CanvasImageSource;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(new Blob(['png'], { type: 'image/png' }))),
    } as unknown as HTMLCanvasElement;
    const deps = { loadImage: vi.fn(async () => image), createCanvas: vi.fn(() => canvas) };

    const blob = await rasterizeSvg(diagram, 2, deps);
    expect(blob.type).toBe('image/png');
    expect(deps.loadImage).toHaveBeenCalledWith('blob:svg');
    expect(deps.createCanvas).toHaveBeenCalledWith(200, 100);
    expect(context.fillStyle).toBe('#ffffff');
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 0, 0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:svg');
  });

  it('fails clearly without a 2d context or when encoding fails', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:svg'), revokeObjectURL: vi.fn() });
    const noContext = { loadImage: async () => ({}) as CanvasImageSource, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement };
    await expect(rasterizeSvg(diagram, 1, noContext)).rejects.toThrow(/cannot create an image canvas/);

    const noBlob = {
      loadImage: async () => ({}) as CanvasImageSource,
      createCanvas: () =>
        ({
          getContext: () => ({ fillRect: vi.fn(), drawImage: vi.fn() }),
          toBlob: (callback: (blob: Blob | null) => void) => callback(null),
        }) as unknown as HTMLCanvasElement,
    };
    await expect(rasterizeSvg(diagram, 1, noBlob)).rejects.toThrow(/PNG could not be encoded/);
  });

  it('has browser defaults that load images and size canvases', async () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        if (value.includes('bad')) this.onerror?.();
        else this.onload?.();
      }
    }
    vi.stubGlobal('Image', FakeImage);
    await expect(browserRasterDeps.loadImage('blob:ok')).resolves.toBeInstanceOf(FakeImage);
    await expect(browserRasterDeps.loadImage('blob:bad')).rejects.toThrow(/could not be decoded/);

    const canvas = browserRasterDeps.createCanvas(30, 20);
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.width).toBe(30);
    expect(canvas.height).toBe(20);
  });
});
