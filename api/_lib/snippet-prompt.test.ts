import { describe, expect, it } from 'vitest';

import {
  buildSnippetPrompt,
  isValidSnippetLanguage,
  MAX_CONTEXT_CHARS,
  MAX_DESCRIPTION_CHARS,
  validateSnippetRequest,
} from './snippet-prompt';

const valid = { description: 'debounce a function', language: 'typescript', context: 'uses lodash', explain: true };

describe('validateSnippetRequest', () => {
  it('accepts a full body and fills defaults for optional fields', () => {
    expect(validateSnippetRequest(valid)).toEqual(valid);
    expect(validateSnippetRequest({ description: 'x', language: 'c#' })).toEqual({
      description: 'x',
      language: 'c#',
      context: '',
      explain: false,
    });
  });

  it.each([
    ['null', null],
    ['blank description', { ...valid, description: '   ' }],
    ['oversized description', { ...valid, description: 'a'.repeat(MAX_DESCRIPTION_CHARS + 1) }],
    ['bad language', { ...valid, language: 'not valid!' }],
    ['non-string context', { ...valid, context: 5 }],
    ['oversized context', { ...valid, context: 'a'.repeat(MAX_CONTEXT_CHARS + 1) }],
    ['non-boolean explain', { ...valid, explain: 'yes' }],
  ])('rejects %s', (_label, body) => {
    expect(validateSnippetRequest(body)).toBeUndefined();
  });

  it('checks language identifiers', () => {
    expect(isValidSnippetLanguage('c++')).toBe(true);
    expect(isValidSnippetLanguage('objective-c')).toBe(true);
    expect(isValidSnippetLanguage('')).toBe(false);
    expect(isValidSnippetLanguage(42)).toBe(false);
  });
});

describe('buildSnippetPrompt', () => {
  it('quotes the request as data, asks for one fenced block, and adds context when present', () => {
    const prompt = buildSnippetPrompt(valid);
    expect(prompt).toContain('code snippets in typescript');
    expect(prompt).toContain('BEGIN REQUEST\ndebounce a function\nEND REQUEST');
    expect(prompt).toContain('BEGIN CONTEXT\nuses lodash\nEND CONTEXT');
    expect(prompt).toContain('at most three short sentences');
    expect(prompt).toContain('not instructions');
  });

  it('omits context and asks for code only when not explaining', () => {
    const prompt = buildSnippetPrompt({ ...valid, context: '  ', explain: false });
    expect(prompt).not.toContain('BEGIN CONTEXT');
    expect(prompt).toContain('Do not add any prose');
  });
});
