export interface EmojiEntry {
  /** The fully-qualified emoji sequence, ready to copy. */
  e: string;
  /** The official Unicode name. */
  n: string;
}

export interface EmojiGroup {
  name: string;
  emojis: EmojiEntry[];
}

export interface EmojiCatalog {
  version: string;
  count: number;
  groups: EmojiGroup[];
}

const GROUP_PATTERN = /^# group: (.+)$/;
const VERSION_PATTERN = /^# Version: (.+)$/;
const ENTRY_PATTERN = /^[0-9A-F][0-9A-F ]*;\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/;

/** Parses Unicode's emoji-test.txt into a catalog of fully-qualified sequences. */
export function parseEmojiTest(source: string): EmojiCatalog {
  let version = '';
  let currentGroup: EmojiGroup | undefined;
  const groups: EmojiGroup[] = [];
  let count = 0;

  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    const versionMatch = VERSION_PATTERN.exec(trimmed);
    if (versionMatch) {
      version = versionMatch[1].trim();
      continue;
    }
    const groupMatch = GROUP_PATTERN.exec(trimmed);
    if (groupMatch) {
      currentGroup = { name: groupMatch[1].trim(), emojis: [] };
      groups.push(currentGroup);
      continue;
    }
    const entryMatch = ENTRY_PATTERN.exec(trimmed);
    if (entryMatch && currentGroup) {
      currentGroup.emojis.push({ e: entryMatch[1], n: entryMatch[2].trim() });
      count += 1;
    }
  }

  return { version, count, groups: groups.filter((group) => group.emojis.length > 0) };
}

export function filterEmojis(
  catalog: EmojiCatalog,
  query: string,
  groupName: string,
): EmojiEntry[] {
  const normalized = query.trim().toLowerCase();
  const groups = groupName
    ? catalog.groups.filter((group) => group.name === groupName)
    : catalog.groups;
  const all = groups.flatMap((group) => group.emojis);
  if (!normalized) return all;
  return all.filter((entry) => entry.n.toLowerCase().includes(normalized) || entry.e === normalized);
}
