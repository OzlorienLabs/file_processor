import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownPreview } from './MarkdownPreview';

describe('MarkdownPreview', () => {
  it('shows a hint when there is nothing to render', () => {
    render(<MarkdownPreview markdown="   " emptyHint="Nothing yet" />);
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('renders GFM elements and opens links safely in a new tab', () => {
    render(
      <MarkdownPreview markdown={'# Heading\n\n- [ ] task\n\n| a |\n| - |\n| 1 |\n\n[site](https://example.com)\n\n~~old~~'} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('old').tagName).toBe('DEL');
    const link = screen.getByRole('link', { name: 'site' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never injects raw HTML from the source', () => {
    render(<MarkdownPreview markdown={'before\n\n<img src=x onerror="alert(1)">\n\n<b>bold?</b>'} />);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText('before')).toBeInTheDocument();
  });
});
