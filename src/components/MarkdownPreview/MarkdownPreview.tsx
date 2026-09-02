import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
  markdown: string;
  emptyHint?: string;
}

const components = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/**
 * Renders Markdown as React elements. Raw HTML inside the Markdown is never injected: the
 * renderer drops it, so untrusted text can only produce the safe element set below.
 */
export function MarkdownPreview({ markdown, emptyHint = 'Start typing Markdown to see the preview.' }: MarkdownPreviewProps) {
  if (!markdown.trim()) {
    return (
      <div className="preview-surface is-empty" data-testid="markdown-preview">
        <p>{emptyHint}</p>
      </div>
    );
  }
  return (
    <div className="preview-surface markdown-body" data-testid="markdown-preview">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
