import { describe, expect, it } from 'vitest';

import { coreTools, getToolByPath, toolsInCategory } from './tool-catalog';

const requiredPaths = [
  '/en/summarize',
  '/en/merge',
  '/en/ocr',
  '/en/audiototext',
  '/en/split',
  '/en/compress',
  '/en/convert/word/pdf',
  '/en/convert/pdf/word',
  '/en/convert',
  '/en/screen-capture',
  '/en/diagram',
  '/en/mermaid',
  '/en/graphviz',
  '/en/diff',
  '/en/notepad',
  '/en/markdown',
  '/en/snippets',
  '/en/snippet-generator',
  '/en/screen-recorder',
  '/en/video-to-gif',
];

describe('tool catalog', () => {
  it('contains every requested route exactly once', () => {
    expect(coreTools.map((tool) => tool.path).sort()).toEqual(
      [...requiredPaths].sort(),
    );
  });

  it('gives every tool three concise instructions and processing disclosure', () => {
    for (const tool of coreTools) {
      expect(tool.howTo).toMatch(/^How to /);
      expect(tool.steps).toHaveLength(3);
      expect(tool.steps.every((step) => step.length >= 12)).toBe(true);
      expect(['browser', 'browser-and-provider', 'browser-or-provider']).toContain(tool.processing);
      expect(['files', 'create']).toContain(tool.category);
      expect(tool.accept).not.toHaveLength(0);
    }
  });

  it('groups editors separately from file tools and marks what they store', () => {
    const editors = toolsInCategory('create');
    expect(editors.map((tool) => tool.id).sort()).toEqual([
      'diagram',
      'diff',
      'graphviz',
      'markdown',
      'mermaid',
      'notepad',
      'screen-recorder',
      'snippet-generator',
      'snippets',
      'video-to-gif',
    ]);
    expect(editors.every((tool) => tool.layout === 'wide')).toBe(true);
    // Recordings and GIFs are files like any other: they stay in memory, never in storage.
    const media = ['screen-recorder', 'video-to-gif'];
    expect(editors.filter((tool) => !media.includes(tool.id)).every((tool) => tool.storage === 'local')).toBe(true);
    expect(editors.filter((tool) => media.includes(tool.id)).some((tool) => tool.storage)).toBe(false);
    expect(toolsInCategory('files')).toHaveLength(10);
    expect(toolsInCategory('files').filter((tool) => tool.id !== 'screen-capture').some((tool) => tool.storage)).toBe(false);
    expect(toolsInCategory('files').find((tool) => tool.id === 'screen-capture')?.storage).toBe('local');
  });

  it('looks up normalized paths without accepting unrelated routes', () => {
    expect(getToolByPath('/en/merge/')?.id).toBe('merge');
    expect(getToolByPath('/en/screen-capture')?.id).toBe('screen-capture');
    expect(getToolByPath('/en/not-a-tool')).toBeUndefined();
    expect(getToolByPath('/')).toBeUndefined();
  });
});
