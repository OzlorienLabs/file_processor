import { describe, expect, it } from 'vitest';

import { applyMarkdownFormat } from './markdown';

describe('applyMarkdownFormat', () => {
  it('wraps and unwraps a selection', () => {
    const bold = applyMarkdownFormat('make me bold', 8, 12, 'bold');
    expect(bold.text).toBe('make me **bold**');
    expect(bold.selectionStart).toBe(10);

    const back = applyMarkdownFormat(bold.text, 10, 14, 'bold');
    expect(back.text).toBe('make me bold');
    expect(back.selectionStart).toBe(8);
  });

  it('uses one underscore for italic and one backtick for code', () => {
    expect(applyMarkdownFormat('a b', 0, 1, 'italic').text).toBe('_a_ b');
    expect(applyMarkdownFormat('a b', 2, 3, 'code').text).toBe('a `b`');
  });

  it('adds and removes a heading on the line the caret sits in', () => {
    const added = applyMarkdownFormat('first\nsecond', 7, 7, 'heading');
    expect(added.text).toBe('first\n## second');
    expect(added.selectionStart).toBe(10);
    expect(applyMarkdownFormat(added.text, 10, 10, 'heading').text).toBe('first\nsecond');
  });

  it('inserts a link around the selection and selects the URL', () => {
    const result = applyMarkdownFormat('see docs', 4, 8, 'link');
    expect(result.text).toBe('see [docs](https://)');
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe('https://');
  });

  it('offers placeholder text when nothing is selected', () => {
    expect(applyMarkdownFormat('', 0, 0, 'link').text).toBe('[link text](https://)');
  });
});
