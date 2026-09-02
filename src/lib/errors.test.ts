import { describe, expect, it } from 'vitest';

import { errorMessage, isAbortError } from './errors';

describe('errorMessage', () => {
  it('prefers a real error message and falls back otherwise', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(errorMessage('string', 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
  });
});

describe('isAbortError', () => {
  it('recognises abort exceptions by name only', () => {
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
