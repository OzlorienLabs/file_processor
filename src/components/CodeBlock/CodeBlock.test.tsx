import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CodeBlock } from './CodeBlock';

describe('CodeBlock', () => {
  it('renders highlighted tokens as elements and reports the language used', async () => {
    const onLanguage = vi.fn();
    render(<CodeBlock code={'const answer = 42;'} language="javascript" onLanguage={onLanguage} />);
    await waitFor(() => expect(document.querySelector('.hljs-keyword')).toHaveTextContent('const'));
    expect(screen.getByText('42')).toHaveClass('hljs-number');
    expect(onLanguage).toHaveBeenCalledWith('javascript');
  });

  it('shows plain text while and after detection when nothing matches', async () => {
    const { container, rerender } = render(<CodeBlock code="plain words only" language="auto" />);
    expect(container.querySelector('pre')).toHaveTextContent('plain words only');
    await waitFor(() => expect(container.querySelector('pre')).toHaveAttribute('data-language', 'plaintext'));

    rerender(<CodeBlock code="<div>hi</div>" language="xml" />);
    await waitFor(() => expect(container.querySelector('.hljs-tag')).not.toBeNull());
  });
});
