import { describe, expect, it } from 'vitest';

import { countText, markdownToHtml, markdownToPdf, sampleMarkdown, sanitizeHtmlDocument, wrapHtmlDocument } from './markdown';

describe('markdownToHtml', () => {
  it('renders GitHub-flavoured Markdown and escapes raw HTML', async () => {
    const html = await markdownToHtml('# Title\n\n- [x] done\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>\n\n~~gone~~');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<del>gone</del>');
    expect(html).not.toContain('<script>');
  });

  it('renders the sample document', async () => {
    const html = await markdownToHtml(sampleMarkdown);
    expect(html).toContain('Markdown live preview');
    expect(html).toContain('<code');
  });
});

describe('wrapHtmlDocument', () => {
  it('produces a standalone page with an escaped title and the stylesheet', () => {
    const doc = wrapHtmlDocument('<p>hi</p>', 'Notes <&> "quotes"');
    expect(doc).toContain('<title>Notes &lt;&amp;&gt; &quot;quotes&quot;</title>');
    expect(doc).toContain('<main class="markdown-body">\n<p>hi</p>');
    expect(doc).toContain('Source Serif 4');
  });
});

describe('sanitizeHtmlDocument', () => {
  it('keeps author styles and markup but strips scripts, frames, handlers, and forms', () => {
    const doc = sanitizeHtmlDocument(
      '<html><head><style>p{color:red}</style><script>evil()</script></head><body><p onclick="x()">Hi</p><iframe src="x"></iframe><form><input></form><a href="javascript:alert(1)" target="_blank">link</a></body></html>',
    );
    expect(doc).toContain('<style>p{color:red}</style>');
    expect(doc).toContain('<p>Hi</p>');
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).not.toContain('<script');
    expect(doc).not.toContain('<iframe');
    expect(doc).not.toContain('<form');
    expect(doc).not.toContain('onclick');
    expect(doc).not.toContain('javascript:');
    expect(doc).not.toContain('target=');
  });

  it('wraps fragments into a full document', () => {
    const doc = sanitizeHtmlDocument('<h1>Just a fragment</h1>');
    expect(doc).toMatch(/^<html><head>/);
    expect(doc).toContain('<body><h1>Just a fragment</h1></body>');
  });
});

describe('countText', () => {
  it('counts words, characters, and lines', () => {
    expect(countText('')).toEqual({ words: 0, characters: 0, lines: 0 });
    expect(countText('one two\nthree ')).toEqual({ words: 3, characters: 14, lines: 2 });
  });
});

describe('markdownToPdf', () => {
  it('converts markdown to a valid PDF byte array', async () => {
    const bytes = await markdownToPdf('# Markdown Title\n\nThis is a paragraph with **bold** text.');
    expect(bytes).toBeInstanceOf(Uint8Array);
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw.startsWith('%PDF')).toBe(true);
    expect(raw).toContain('Markdown Title');
    expect(raw).toContain('This is a paragraph with bold text.');
  });

  it('handles empty markdown producing placeholder page', async () => {
    const bytes = await markdownToPdf('');
    expect(bytes).toBeInstanceOf(Uint8Array);
    const raw = new TextDecoder('latin1').decode(bytes);
    expect(raw.startsWith('%PDF')).toBe(true);
    expect(raw).toContain('no extractable text');
  });
});
