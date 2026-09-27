import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const apiRoot = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

// package.json is `"type": "module"` and Vercel runs these files as native Node ESM,
// which does not guess extensions: `from './http'` crashes the function at load time
// (FUNCTION_INVOCATION_FAILED) even though Vitest and tsc resolve it happily.
describe('api/ ESM imports', () => {
  it('spell out the .js extension on every relative import', () => {
    const offenders = sourceFiles(apiRoot).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/from '(\.\.?\/[^']+)'/g)]
        .map((match) => match[1])
        .filter((specifier) => !specifier.endsWith('.js'))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });
});
