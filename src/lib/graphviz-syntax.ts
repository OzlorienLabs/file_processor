export type DotTokenKind = 'comment' | 'string' | 'html' | 'keyword' | 'edge' | 'attribute' | 'number';

export interface DotToken {
  kind: DotTokenKind;
  text: string;
}

/** Keywords are case-insensitive in DOT; attribute names are followed by `=`. */
const TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|^[ \t]*#[^\n]*)|("(?:[^"\\]|\\[\s\S])*"?)|(\b(?:strict|digraph|graph|subgraph|node|edge)\b)|(->|--)|(\b[A-Za-z_][\w]*(?=\s*=))|(-?(?:\.\d+|\b\d+(?:\.\d*)?))/gim;

/** Returns the length of a balanced `<...>` HTML-like label starting at `start`, or 0. */
function htmlLabelLength(code: string, start: number): number {
  let depth = 0;
  for (let index = start; index < code.length; index += 1) {
    if (code[index] === '<') depth += 1;
    else if (code[index] === '>') {
      depth -= 1;
      if (depth === 0) return index - start + 1;
    }
  }
  return 0;
}

/**
 * Splits DOT source into plain text and highlighted tokens for the editor's colour layer.
 * Concatenating every token's text always gives back the input exactly.
 */
export function tokenizeDot(code: string): (string | DotToken)[] {
  const out: (string | DotToken)[] = [];
  let plain = '';
  let index = 0;
  let nextLt = code.indexOf('<');
  const flush = () => {
    if (plain) out.push(plain);
    plain = '';
  };

  while (index < code.length) {
    // HTML-like labels: `label=<...>` where `<` follows `=` (with optional spaces).
    if (code[index] === '<' && /=\s*$/.test(code.slice(Math.max(0, index - 20), index))) {
      const length = htmlLabelLength(code, index);
      if (length) {
        flush();
        out.push({ kind: 'html', text: code.slice(index, index + length) });
        index += length;
        continue;
      }
    }
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(code);
    if (!match || match.index > index) {
      // Plain text up to the next token or possible HTML label; always advance at least one character.
      if (nextLt !== -1 && nextLt <= index) nextLt = code.indexOf('<', index + 1);
      const end = Math.min(match ? match.index : code.length, nextLt === -1 ? code.length : nextLt);
      const stop = Math.max(end, index + 1);
      plain += code.slice(index, stop);
      index = stop;
      continue;
    }
    flush();
    const [text, comment, string, keyword, edge, attribute] = match;
    const kind: DotTokenKind = comment
      ? 'comment'
      : string
        ? 'string'
        : keyword
          ? 'keyword'
          : edge
            ? 'edge'
            : attribute
              ? 'attribute'
              : 'number';
    out.push({ kind, text });
    index += text.length;
  }
  flush();
  return out;
}
