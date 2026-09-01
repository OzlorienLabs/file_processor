import { describe, expect, it } from 'vitest';

import { coreTools, getToolByPath } from './tool-catalog';

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
      expect(['browser', 'browser-and-provider']).toContain(tool.processing);
      expect(tool.accept).not.toHaveLength(0);
    }
  });

  it('looks up normalized paths without accepting unrelated routes', () => {
    expect(getToolByPath('/en/merge/')?.id).toBe('merge');
    expect(getToolByPath('/en/not-a-tool')).toBeUndefined();
    expect(getToolByPath('/')).toBeUndefined();
  });
});
