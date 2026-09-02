import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HtmlPreview } from './HtmlPreview';

describe('HtmlPreview', () => {
  it('shows a hint until there is HTML', () => {
    render(<HtmlPreview html="" />);
    expect(screen.getByText(/write some html/i)).toBeInTheDocument();
  });

  it('renders sanitised markup in a fully sandboxed frame', () => {
    render(<HtmlPreview html='<h1>Hello</h1><script>alert(1)</script>' title="Note preview" />);
    const frame = screen.getByTitle('Note preview');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('sandbox', '');
    const srcdoc = frame.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('<h1>Hello</h1>');
    expect(srcdoc).not.toContain('<script');
  });
});
