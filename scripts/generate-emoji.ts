// Regenerates public/emoji/catalog.json from the vendored Unicode data.
// Usage: node scripts/generate-emoji.ts
// Source: https://unicode.org/Public/17.0.0/emoji/emoji-test.txt
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { parseEmojiTest } from '../src/lib/emoji.ts';

const source = readFileSync(new URL('./emoji-test-17.0.txt', import.meta.url), 'utf8');
const catalog = parseEmojiTest(source);

if (!catalog.count || !catalog.version) {
  throw new Error('The emoji source file did not parse into a catalog.');
}

mkdirSync(new URL('../public/emoji/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/emoji/catalog.json', import.meta.url), JSON.stringify(catalog));
console.log(`Wrote ${catalog.count} emoji across ${catalog.groups.length} groups (Emoji ${catalog.version}).`);
