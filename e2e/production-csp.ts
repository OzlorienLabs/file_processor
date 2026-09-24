import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/** The Content-Security-Policy Vercel sends in production, read from vercel.json. */
export const productionCsp: string = (JSON.parse(readFileSync('vercel.json', 'utf8')).headers as HeaderRule[])
  .flatMap((rule) => rule.headers)
  .find((header) => header.key === 'Content-Security-Policy')!.value;

/**
 * Excalidraw appends its CDN to the same `@font-face src:` list it serves locally, so Chrome
 * reports the refused entry even though the fonts load from /excalidraw/fonts (see CLAUDE.md).
 */
const knownNoise = /font-src[\s\S]*esm\.sh|esm\.sh[\s\S]*font-src/i;

/**
 * `vite preview` sends no CSP. This serves every HTML document with the production policy
 * and returns the violations Chrome reports, so tests can assert the list stays empty.
 */
export async function withProductionCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/content security policy/i.test(text) && !knownNoise.test(text)) violations.push(text);
  });
  await page.route(
    (url) => !/\.[a-z0-9]+$/i.test(url.pathname),
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': productionCsp } });
    },
  );
  return violations;
}
