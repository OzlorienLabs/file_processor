import { describe, expect, it } from 'vitest';

import { htmlToBlocks, textToBlocks } from './doc-blocks';

describe('htmlToBlocks', () => {
  it('extracts headings, paragraphs, and nested lists in order', () => {
    const blocks = htmlToBlocks(`
      <h1>Report</h1>
      <p>First   paragraph with
      wrapped text.</p>
      <ul>
        <li>Top item<ul><li>Nested item</li></ul></li>
      </ul>
      <h3>Details</h3>
      <table><tr><td>Cell value</td></tr></table>
    `);

    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Report' },
      { kind: 'paragraph', level: 0, text: 'First paragraph with wrapped text.' },
      { kind: 'list-item', level: 0, text: 'Top item' },
      { kind: 'list-item', level: 1, text: 'Nested item' },
      { kind: 'heading', level: 3, text: 'Details' },
      { kind: 'paragraph', level: 0, text: 'Cell value' },
    ]);
  });

  it('skips empty elements and treats markup as text only', () => {
    const blocks = htmlToBlocks('<p>  </p><p>Safe <script>alert(1)</script> text</p>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('Safe');
    expect(blocks[0].text).not.toContain('<script>');
  });

  it('recurses through wrappers and handles list items without own text', () => {
    const blocks = htmlToBlocks(`
      <div><section><h2>  </h2><p>Wrapped</p></section></div>
      <ul><li><ul><li>Only nested</li></ul></li></ul>
      <table><tr><th>Header cell</th><th> </th></tr></table>
      <ol><li>Item<ul><li>  </li></ul></li></ol>
    `);
    expect(blocks).toEqual([
      { kind: 'paragraph', level: 0, text: 'Wrapped' },
      { kind: 'list-item', level: 1, text: 'Only nested' },
      { kind: 'paragraph', level: 0, text: 'Header cell' },
      { kind: 'list-item', level: 0, text: 'Item' },
    ]);
  });
});

describe('textToBlocks', () => {
  it('splits plain text into paragraphs on blank lines', () => {
    expect(textToBlocks('One line\nstill one\n\nTwo\r\n\r\nThree  ')).toEqual([
      { kind: 'paragraph', level: 0, text: 'One line still one' },
      { kind: 'paragraph', level: 0, text: 'Two' },
      { kind: 'paragraph', level: 0, text: 'Three' },
    ]);
  });

  it('returns no blocks for whitespace-only input', () => {
    expect(textToBlocks('  \n \n ')).toEqual([]);
  });
});
