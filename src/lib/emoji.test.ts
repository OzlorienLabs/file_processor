import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { filterEmojis, parseEmojiTest, type EmojiCatalog } from './emoji';

const source = readFileSync('scripts/emoji-test-17.0.txt', 'utf8');
const committed = JSON.parse(readFileSync('public/emoji/catalog.json', 'utf8')) as EmojiCatalog;

describe('parseEmojiTest', () => {
  const catalog = parseEmojiTest(source);

  it('extracts every fully-qualified Emoji 17.0 sequence', () => {
    expect(catalog.version).toBe('17.0');
    expect(catalog.count).toBe(3944);
    expect(catalog.groups.map((group) => group.name)).toContain('Flags');
  });

  it('keeps simple, ZWJ, skin-tone, and flag sequences intact', () => {
    const all = catalog.groups.flatMap((group) => group.emojis);
    const names = new Map(all.map((entry) => [entry.n, entry.e]));
    expect(names.get('grinning face')).toBe('😀');
    expect(names.get('flag: India')).toBe('🇮🇳');
    expect(names.get('family: man, woman, girl, boy')).toBe('👨‍👩‍👧‍👦');
    expect(names.get('waving hand: medium skin tone')).toBe('👋🏽');
  });

  it('matches the committed public catalog exactly', () => {
    expect(catalog).toEqual(committed);
  });

  it('drops groups that contain no fully-qualified emoji', () => {
    expect(catalog.groups.map((group) => group.name)).not.toContain('Component');
  });
});

describe('filterEmojis', () => {
  const catalog: EmojiCatalog = {
    version: 'test',
    count: 3,
    groups: [
      { name: 'Faces', emojis: [{ e: '😀', n: 'grinning face' }, { e: '😢', n: 'crying face' }] },
      { name: 'Flags', emojis: [{ e: '🇮🇳', n: 'flag: India' }] },
    ],
  };

  it('returns everything for an empty query', () => {
    expect(filterEmojis(catalog, '', '')).toHaveLength(3);
  });

  it('filters by name, case-insensitively, within a category', () => {
    expect(filterEmojis(catalog, 'GRIN', 'Faces')).toEqual([{ e: '😀', n: 'grinning face' }]);
    expect(filterEmojis(catalog, 'grin', 'Flags')).toEqual([]);
  });

  it('matches a pasted emoji character', () => {
    expect(filterEmojis(catalog, '🇮🇳', '')).toEqual([{ e: '🇮🇳', n: 'flag: India' }]);
  });
});
