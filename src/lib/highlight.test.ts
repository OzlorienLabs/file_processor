import { describe, expect, it } from 'vitest';

import {
  detectLanguage,
  extensionFor,
  highlightCode,
  languageLabel,
  languageOptions,
  MAX_HIGHLIGHT_CHARS,
  plainTree,
} from './highlight';

const sample = `import { readFile } from 'node:fs/promises';\nexport async function load(path: string): Promise<string> {\n  const text = await readFile(path, 'utf8');\n  return text.trim();\n}\n`;

function classNames(tree: Awaited<ReturnType<typeof highlightCode>>['tree']): string[] {
  const names: string[] = [];
  const walk = (node: { type: string; properties?: { className?: unknown }; children?: unknown[] }) => {
    const className = node.properties?.className;
    if (Array.isArray(className)) names.push(...(className as string[]));
    for (const child of node.children ?? []) walk(child as typeof node);
  };
  walk(tree as unknown as { type: string; children: unknown[] });
  return names;
}

describe('highlightCode', () => {
  it('highlights a known language into hast with hljs classes', async () => {
    const result = await highlightCode(sample, 'typescript');
    expect(result.language).toBe('typescript');
    expect(classNames(result.tree)).toContain('hljs-keyword');
  });

  it('auto-detects code and falls back to plain text for prose', async () => {
    const detected = await highlightCode(sample);
    expect(['typescript', 'javascript']).toContain(detected.language);
    expect(classNames(detected.tree).length).toBeGreaterThan(0);

    const prose = await highlightCode('Just a reminder to buy milk tomorrow.');
    expect(prose.language).toBe('plaintext');
    expect(prose.tree).toEqual(plainTree('Just a reminder to buy milk tomorrow.'));
    expect(await detectLanguage('hello')).toBe('plaintext');
  });

  it('returns plain trees for unknown languages, plaintext, empty, and oversized input', async () => {
    expect((await highlightCode('x = 1', 'klingon')).tree).toEqual(plainTree('x = 1'));
    expect((await highlightCode('x = 1', 'plaintext')).language).toBe('plaintext');
    expect(await highlightCode('', 'python')).toEqual({ tree: plainTree(''), language: 'python' });
    expect(await highlightCode('')).toEqual({ tree: plainTree(''), language: 'plaintext' });
    const huge = 'a'.repeat(MAX_HIGHLIGHT_CHARS + 1);
    expect((await highlightCode(huge, 'javascript')).tree).toEqual(plainTree(huge));
  });
});

describe('language metadata', () => {
  it('maps ids to labels and download extensions with sane fallbacks', () => {
    expect(languageOptions.length).toBeGreaterThan(30);
    expect(languageLabel('typescript')).toBe('TypeScript');
    expect(languageLabel('mystery')).toBe('mystery');
    expect(extensionFor('python')).toBe('py');
    expect(extensionFor('mystery')).toBe('txt');
  });
});
