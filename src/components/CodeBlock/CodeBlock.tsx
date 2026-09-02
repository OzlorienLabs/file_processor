import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { useEffect, useState, type ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

import { highlightCode, plainTree, type HighlightResult } from '../../lib/highlight';

interface CodeBlockProps {
  code: string;
  language: string;
  /** Called once highlighting settles, with the language actually used. */
  onLanguage?: (language: string) => void;
}

function render(result: HighlightResult): ReactNode {
  return toJsxRuntime(result.tree, { Fragment, jsx, jsxs });
}

/**
 * Syntax-highlighted, read-only code. The highlighter produces a hast tree that is turned into
 * React elements, so highlighted text is never injected as HTML.
 */
export function CodeBlock({ code, language, onLanguage }: CodeBlockProps) {
  const [result, setResult] = useState<HighlightResult>(() => ({ tree: plainTree(code), language }));

  useEffect(() => {
    let cancelled = false;
    highlightCode(code, language).then((next) => {
      if (cancelled) return;
      setResult(next);
      onLanguage?.(next.language);
    });
    return () => {
      cancelled = true;
    };
    // onLanguage is a notification callback; re-highlighting only when code or language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, language]);

  return (
    <pre className="code-block" data-language={result.language}>
      <code>{render(result)}</code>
    </pre>
  );
}
