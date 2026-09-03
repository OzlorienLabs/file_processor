export interface DocBlock {
  kind: 'heading' | 'paragraph' | 'list-item';
  level: number;
  text: string;
}

const HEADING_PATTERN = /^h([1-6])$/;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function htmlToBlocks(html: string): DocBlock[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const blocks: DocBlock[] = [];

  const visit = (element: Element, listDepth: number) => {
    const tag = element.tagName.toLowerCase();
    const headingMatch = HEADING_PATTERN.exec(tag);

    if (headingMatch) {
      const text = collapseWhitespace(element.textContent ?? '');
      if (text) blocks.push({ kind: 'heading', level: Number(headingMatch[1]), text });
      return;
    }
    if (tag === 'p' || tag === 'td' || tag === 'th' || tag === 'pre' || (tag === 'blockquote' && !element.querySelector('p'))) {
      const text = tag === 'pre' ? (element.textContent ?? '').trim() : collapseWhitespace(element.textContent ?? '');
      if (text) blocks.push({ kind: 'paragraph', level: 0, text });
      return;
    }
    if (tag === 'li') {
      const nested = element.querySelectorAll('li');
      const ownText = collapseWhitespace(
        Array.from(element.childNodes)
          .filter((node) => !(node instanceof Element && /^(ul|ol)$/i.test(node.tagName)))
          .map((node) => node.textContent ?? '')
          .join(' '),
      );
      if (ownText) blocks.push({ kind: 'list-item', level: listDepth, text: ownText });
      nested.forEach((item) => {
        const text = collapseWhitespace(item.textContent ?? '');
        if (text) blocks.push({ kind: 'list-item', level: listDepth + 1, text });
      });
      return;
    }
    Array.from(element.children).forEach((child) => visit(child, listDepth));
  };

  Array.from(parsed.body.children).forEach((child) => visit(child, 0));
  return blocks;
}

export function textToBlocks(text: string): DocBlock[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((chunk) => collapseWhitespace(chunk))
    .filter(Boolean)
    .map((chunk) => ({ kind: 'paragraph' as const, level: 0, text: chunk }));
}
