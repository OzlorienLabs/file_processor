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

/** Minimal Clay/Ivory stylesheet used by exported documents and the HTML preview frame. */
export const documentCss = `
:root { color-scheme: light; }
body { margin: 0; padding: 1.5rem; background: #faf9f5; color: #141413; font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
.markdown-body { max-width: 46rem; margin: 0 auto; }
h1, h2, h3, h4 { font-family: Georgia, "Times New Roman", serif; letter-spacing: -0.02em; line-height: 1.15; margin: 1.6em 0 0.6em; }
h1 { font-size: 2.2rem; margin-top: 0; }
h2 { font-size: 1.6rem; }
h3 { font-size: 1.25rem; }
p, ul, ol, blockquote, pre, table { margin: 0 0 1rem; }
a { color: #b85c3e; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: #f0eee6; padding: 0.1em 0.35em; border-radius: 0.3em; }
pre { background: #f0eee6; border: 1px solid #d1cfc5; border-radius: 0.5rem; padding: 1rem; overflow: auto; }
pre code { background: none; padding: 0; }
blockquote { margin-left: 0; padding: 0.25rem 1rem; border-left: 3px solid #d97757; color: #5f5e58; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d1cfc5; padding: 0.45rem 0.7rem; text-align: left; }
th { background: #f0eee6; }
img { max-width: 100%; }
hr { border: 0; border-top: 1px solid #d1cfc5; margin: 2rem 0; }
input[type="checkbox"] { accent-color: #d97757; }
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
