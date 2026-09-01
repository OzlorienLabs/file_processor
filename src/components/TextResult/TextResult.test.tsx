import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TextResult } from './TextResult';

beforeAll(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:text-result'),
    revokeObjectURL: vi.fn(),
  });
});

beforeEach(() => vi.clearAllMocks());

function renderResult(onReset = vi.fn()) {
  render(
    <TextResult
      title="Text extracted"
      label="Extracted text"
      text="original words"
      filename="scan-ocr.txt"
      onReset={onReset}
    />,
  );
  return onReset;
}

describe('TextResult', () => {
  it('shows editable text with character count and a named download', () => {
    renderResult();
    expect(screen.getByLabelText('Extracted text')).toHaveValue('original words');
    expect(screen.getByText('14 characters')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download text/i })).toHaveAttribute('download', 'scan-ocr.txt');
  });

  it('copies the current, possibly edited, text', async () => {
    const user = userEvent.setup();
    renderResult();

    await user.clear(screen.getByLabelText('Extracted text'));
    await user.type(screen.getByLabelText('Extracted text'), 'edited');
    await user.click(screen.getByRole('button', { name: /copy text/i }));

    expect(await navigator.clipboard.readText()).toBe('edited');
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('starts over through the reset callback', async () => {
    const user = userEvent.setup();
    const onReset = renderResult();
    await user.click(screen.getByRole('button', { name: /start over/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it('reverts the copied confirmation after a moment', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
    });
    try {
      renderResult();

      fireEvent.click(screen.getByRole('button', { name: /copy text/i }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(screen.getByRole('button', { name: /copy text/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
