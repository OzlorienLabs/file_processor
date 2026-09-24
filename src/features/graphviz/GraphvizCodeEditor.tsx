import { useMemo, useRef, type UIEvent } from 'react';

import { tokenizeDot, type DotTokenKind } from '../../lib/graphviz-syntax';

interface GraphvizCodeEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

const tokenClass: Record<DotTokenKind, string> = {
  comment: 'mm-comment',
  string: 'mm-string',
  html: 'gv-html',
  keyword: 'mm-keyword',
  edge: 'mm-arrow',
  attribute: 'gv-attr',
  number: 'mm-number',
};

/** A textarea over a highlighted copy of the DOT source, sharing the Mermaid editor's box. */
export function GraphvizCodeEditor({ id = 'graphviz-code', value, onChange }: GraphvizCodeEditorProps) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const highlighted = useMemo(
    () =>
      tokenizeDot(value).map((token, index) =>
        typeof token === 'string' ? (
          token
        ) : (
          <span key={index} className={tokenClass[token.kind]}>
            {token.text}
          </span>
        ),
      ),
    [value],
  );

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const layer = highlightRef.current;
    if (!layer) return;
    layer.scrollTop = event.currentTarget.scrollTop;
    layer.scrollLeft = event.currentTarget.scrollLeft;
  };

  return (
    <div className="mermaid-source-box">
      <pre ref={highlightRef} className="mermaid-highlight-layer scroll" aria-hidden="true">
        <code>
          {highlighted}
          {value.endsWith('\n') ? ' ' : ''}
        </code>
      </pre>
      <textarea
        className="mermaid-textarea scroll"
        id={id}
        aria-label="Graphviz DOT code"
        value={value}
        spellCheck={false}
        placeholder={'digraph {\n  a -> b\n}'}
        onScroll={syncScroll}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
