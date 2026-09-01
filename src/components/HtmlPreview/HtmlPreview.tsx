import { useMemo } from 'react';

import { sanitizeHtmlDocument } from '../../lib/markdown';

interface HtmlPreviewProps {
  html: string;
  title?: string;
}

/**
 * Shows author-written HTML inside a fully sandboxed frame: no scripts, no same-origin
 * access, no navigation. The markup is additionally sanitised before it reaches the frame.
 */
export function HtmlPreview({ html, title = 'HTML preview' }: HtmlPreviewProps) {
  const document = useMemo(() => sanitizeHtmlDocument(html), [html]);
  if (!html.trim()) {
    return (
      <div className="preview-surface is-empty">
        <p>Write some HTML to see it rendered here.</p>
      </div>
    );
  }
  return <iframe className="preview-surface html-preview" title={title} sandbox="" srcDoc={document} />;
}
