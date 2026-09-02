import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { coreTools } from '../../app/tool-catalog';
import { ToolMark } from './ToolMark';
import { inkHex, markIds, marks, markSvg, type MarkId } from './marks';

const publicDirectory = path.join(process.cwd(), 'public');

describe('registration marks', () => {
  it('gives the brand and every tool id its own mark', () => {
    expect(markIds).toHaveLength(coreTools.length + 1);
    expect(markIds).toContain('brand');
    for (const tool of coreTools) {
      expect(marks[tool.id]).toBeDefined();
      expect(marks[tool.id].shapes.length).toBeGreaterThan(1);
    }
  });

  it('draws each mark in cyan with ink or a single magenta element', () => {
    for (const id of markIds) {
      const inks = new Set(marks[id].shapes.map((shape) => shape.fill ?? shape.stroke));
      expect(inks.has('accent')).toBe(true);
      expect(inks.has('accent-2')).toBe(true);
    }
  });

  it('ships a standalone file per mark that matches the component definition', () => {
    for (const id of markIds) {
      const file = path.join(publicDirectory, 'marks', `${id}.svg`);
      expect(existsSync(file), `${id}.svg is missing — run node scripts/generate-marks.ts`).toBe(true);
      expect(readFileSync(file, 'utf8')).toBe(markSvg(id));
    }
  });

  it('ships a social card per mark', () => {
    for (const id of markIds) {
      expect(existsSync(path.join(publicDirectory, 'og', `${id}.png`)), `${id}.png is missing`).toBe(true);
    }
  });

  it('writes literal Broadsheet inks into the standalone files', () => {
    const brand = markSvg('brand');
    expect(brand).toContain(inkHex.accent);
    expect(brand).toContain(inkHex['accent-2']);
    expect(brand).toContain(inkHex.text);
    expect(brand).not.toContain('var(--');
  });
});

describe('ToolMark', () => {
  it('renders inline SVG that takes its inks from the theme', () => {
    const { container } = render(<ToolMark tool="merge" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.innerHTML).toContain('var(--color-accent)');
    expect(svg?.innerHTML).toContain('var(--color-accent-2)');
  });

  it('becomes a labelled image when it stands alone', () => {
    render(<ToolMark tool="brand" label="FileKit home" />);
    expect(screen.getByRole('img', { name: 'FileKit home' })).toBeInTheDocument();
  });

  it('lets the brand plate bleed outside the grid and clips the rest', () => {
    const { container: brand } = render(<ToolMark tool="brand" />);
    expect(brand.querySelector('svg')).toHaveStyle({ overflow: 'visible' });
    const { container: split } = render(<ToolMark tool="split" />);
    expect(split.querySelector('svg')?.style.overflow).toBe('');
  });

  it('renders paths, circles, and rectangles from the same definition', () => {
    const ids: MarkId[] = ['diff', 'mermaid', 'ocr'];
    for (const id of ids) {
      const { container } = render(<ToolMark tool={id} />);
      expect(container.querySelectorAll('path, circle, rect')).toHaveLength(marks[id].shapes.length);
    }
  });
});
