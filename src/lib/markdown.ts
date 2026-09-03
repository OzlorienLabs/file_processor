import DOMPurify from 'dompurify';

export const sampleMarkdown = `# Markdown live preview

Type on the left, see the result on the right. Everything stays in this browser.

## What works

- **Bold**, _italic_, ~~strikethrough~~, and \`inline code\`
- Lists, nested lists, and task lists
  - [x] Write the draft
  - [ ] Share the HTML
- [Links](https://example.com) and images
- Tables, block quotes, and fenced code

| Feature | Supported |
| --- | :---: |
| GFM tables | ✅ |
| Task lists | ✅ |
| Raw HTML | escaped |

> "Simplicity is prerequisite for reliability." — Edsger W. Dijkstra

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`
`;

/** Converts Markdown (GitHub flavoured) to sanitised HTML using the remark/rehype pipeline. */
export async function markdownToHtml(markdown: string): Promise<string> {
  const [{ unified }, remarkParse, remarkGfm, remarkRehype, rehypeSanitize, rehypeStringify] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-gfm'),
    import('remark-rehype'),
    import('rehype-sanitize'),
    import('rehype-stringify'),
  ]);
  const file = await unified()
    .use(remarkParse.default)
    .use(remarkGfm.default)
    .use(remarkRehype.default)
    .use(rehypeSanitize.default)
    .use(rehypeStringify.default)
    .process(markdown);
  return String(file);
}

/** Converts Markdown to PDF bytes using the document block layout. */
export async function markdownToPdf(markdown: string): Promise<Uint8Array> {
  const html = await markdownToHtml(markdown);
  const { htmlToBlocks } = await import('./doc-blocks');
  const { renderBlocksToPdf } = await import('./blocks-to-pdf');
  const blocks = htmlToBlocks(html);
  return renderBlocksToPdf(blocks);
}

/** Minimal Clay/Ivory stylesheet used by exported documents and the HTML preview frame. */
/**
 * Broadsheet in literal inks, for exported documents and the sandboxed HTML preview: a
 * standalone file has no page to inherit the custom properties from.
 */
export const documentCss = `
:root { color-scheme: light; }
body { margin: 0; padding: 30px; background: #f3f2f2; color: #201e1d; font: 16px/1.6 "Source Serif 4", ui-serif, Georgia, serif; }
.markdown-body { max-width: 46rem; margin: 0 auto; }
h1, h2, h3, h4 { font-weight: 600; letter-spacing: -0.02em; line-height: 1.12; margin: 1.1em 0 0.45em; }
h1 { font-size: 34px; margin-top: 0; }
h2 { font-size: 25px; }
h3 { font-size: 20px; }
p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
a { color: #006786; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; background: #e9f8ff; padding: 1px 5px; }
pre { background: #f8f4f4; border: 1px solid #d7d3d3; padding: 12px 14px; overflow: auto; }
pre code { background: none; padding: 0; }
blockquote { margin-left: 0; padding: 2px 0 2px 16px; border-left: 2px solid #d6006c; font-style: italic; color: #790e3d; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d7d3d3; padding: 7px 11px; text-align: left; }
th { background: #f8f4f4; }
img { max-width: 100%; }
hr { border: 0; border-top: 1px solid #d7d3d3; margin: 30px 0; }
input[type="checkbox"] { accent-color: #0088b0; }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wraps rendered body HTML in a standalone, self-styled document for download. */
export function wrapHtmlDocument(bodyHtml: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${documentCss}</style>
</head>
<body>
<main class="markdown-body">
${bodyHtml}
</main>
</body>
</html>
`;
}

/**
 * Sanitises user-authored HTML for the sandboxed preview frame. The frame has no scripts and
 * no origin, so this is defence in depth: it removes scripts, handlers, and embedded frames
 * while keeping the author's own styles.
 */
export function sanitizeHtmlDocument(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'base', 'meta', 'link'],
    FORBID_ATTR: ['formaction', 'target'],
  });
  return clean.replace('<head>', `<head><meta charset="utf-8"><style>${documentCss}</style>`);
}

export interface TextStats {
  words: number;
  characters: number;
  lines: number;
}

export function countText(text: string): TextStats {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    characters: text.length,
    lines: text ? text.split('\n').length : 0,
  };
}

/** The inline and block formats the Markdown toolbar applies. */
export type MarkdownFormat = 'bold' | 'italic' | 'heading' | 'link' | 'code';

export interface FormatResult {
  text: string;
  /** Where the caret should land afterwards, so typing continues naturally. */
  selectionStart: number;
  selectionEnd: number;
}

const wraps: Record<'bold' | 'italic' | 'code', string> = {
  bold: '**',
  italic: '_',
  code: '`',
};

/**
 * Applies one toolbar format to the selected range. Wrapping formats toggle off when the
 * selection already carries them, so a second press undoes the first.
 */
export function applyMarkdownFormat(
  text: string,
  start: number,
  end: number,
  format: MarkdownFormat,
): FormatResult {
  const selected = text.slice(start, end);

  if (format === 'heading') {
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const existing = /^(#{1,6}) /.exec(text.slice(lineStart));
    const prefix = existing ? '' : '## ';
    const removed = existing ? existing[0].length : 0;
    const next = text.slice(0, lineStart) + prefix + text.slice(lineStart + removed);
    const shift = prefix.length - removed;
    return { text: next, selectionStart: start + shift, selectionEnd: end + shift };
  }

  if (format === 'link') {
    const label = selected || 'link text';
    const inserted = `[${label}](https://)`;
    return {
      text: text.slice(0, start) + inserted + text.slice(end),
      selectionStart: start + label.length + 3,
      selectionEnd: start + inserted.length - 1,
    };
  }

  const token = wraps[format];
  const before = text.slice(Math.max(0, start - token.length), start);
  const after = text.slice(end, end + token.length);
  if (before === token && after === token) {
    return {
      text: text.slice(0, start - token.length) + selected + text.slice(end + token.length),
      selectionStart: start - token.length,
      selectionEnd: end - token.length,
    };
  }
  return {
    text: text.slice(0, start) + token + selected + token + text.slice(end),
    selectionStart: start + token.length,
    selectionEnd: end + token.length,
  };
}
