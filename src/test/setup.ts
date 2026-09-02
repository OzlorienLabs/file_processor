import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

import { installMatchMedia, resetMatchedMedia } from './media';

installMatchMedia();

beforeEach(() => {
  resetMatchedMedia();
  installMatchMedia();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = '';
});
