// Regenerates the registration-mark assets from src/components/ToolMark/marks.ts:
//   public/marks/<id>.svg  — the favicon each tool route points at
//   public/og/<id>.png     — the social card built from the same mark
// Usage: node scripts/generate-marks.ts
import { mkdirSync, writeFileSync } from 'node:fs';

import sharp from 'sharp';

import { coreTools } from '../src/app/tool-catalog.ts';
import { inkHex, markIds, marks, markSvg, type MarkId } from '../src/components/ToolMark/marks.ts';

const GROUND = '#f3f2f2';
const INK = '#201e1d';
const MUTED = '#605d5d';
const SERIF = 'Source Serif 4, Georgia, Times New Roman, serif';

const WHERE: Record<string, string> = {
  browser: 'Runs in your browser',
  'browser-and-provider': 'Browser + your AI provider',
  'browser-or-provider': 'On-device AI or your provider',
};

const cards: Record<MarkId, { title: string; description: string; where: string }> = {
  brand: {
    title: 'FileKit',
    description: 'Sixteen tools for the small jobs. The work happens in this browser, on this device, and then it is over.',
    where: 'No accounts · No uploads · Nothing left behind',
  },
} as Record<MarkId, { title: string; description: string; where: string }>;

for (const tool of coreTools) {
  cards[tool.id] = {
    title: tool.name,
    description: tool.description,
    where: WHERE[tool.processing],
  };
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Greedy wrap at an estimated character width, so long descriptions keep their measure. */
function wrap(text: string, perLine: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > perLine) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The mark's shapes re-emitted at an arbitrary size for the card plate. */
function markGroup(id: MarkId, x: number, y: number, size: number): string {
  const scale = size / 24;
  const inner = markSvg(id)
    .split('\n')
    .filter((line) => /^\s*<(path|circle|rect)/.test(line))
    .join('\n');
  const mark = marks[id];
  const linecap = mark.strokeLinecap ? ` stroke-linecap="${mark.strokeLinecap}"` : '';
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke-width="1.7"${linecap}>\n${inner}\n</g>`;
}

function cardSvg(id: MarkId): string {
  const card = cards[id];
  const description = wrap(card.description, 52);
  const title = wrap(card.title, 22);
  const titleTop = 300 - (title.length - 1) * 46;
  const titleLines = title
    .map((line, index) => `<tspan x="88" y="${titleTop + index * 96}">${escapeText(line)}</tspan>`)
    .join('');
  const descriptionLines = description
    .map((line, index) => `<tspan x="88" y="${titleTop + title.length * 74 + index * 46}">${escapeText(line)}</tspan>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bloomC" cx="18%" cy="12%" r="46%">
      <stop offset="0%" stop-color="${inkHex.accent}" stop-opacity="0.24"/>
      <stop offset="70%" stop-color="${inkHex.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomM" cx="86%" cy="10%" r="42%">
      <stop offset="0%" stop-color="${inkHex['accent-2']}" stop-opacity="0.16"/>
      <stop offset="72%" stop-color="${inkHex['accent-2']}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="screen" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="1.2" cy="1.2" r="1.2" fill="${INK}" fill-opacity="0.08"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="${GROUND}"/>
  <rect width="1200" height="630" fill="url(#bloomC)"/>
  <rect width="1200" height="630" fill="url(#bloomM)"/>
  <rect width="1200" height="630" fill="url(#screen)"/>
  ${markGroup('brand', 88, 74, 40)}
  <text x="140" y="106" font-family="${SERIF}" font-size="32" font-weight="600" fill="${INK}">FileKit</text>
  ${markGroup(id, 88, 150, 96)}
  <text font-family="${SERIF}" font-size="84" font-weight="600" fill="${INK}" letter-spacing="-2">${titleLines}</text>
  <text font-family="${SERIF}" font-size="34" fill="${MUTED}">${descriptionLines}</text>
  <text x="88" y="556" font-family="${SERIF}" font-size="24" letter-spacing="3.4" fill="${inkHex.accent}">${escapeText(card.where.toUpperCase())}</text>
  <rect x="88" y="586" width="1024" height="2" fill="${inkHex.accent}" fill-opacity="0.35"/>
</svg>`;
}

const markDirectory = new URL('../public/marks/', import.meta.url);
const ogDirectory = new URL('../public/og/', import.meta.url);
mkdirSync(markDirectory, { recursive: true });
mkdirSync(ogDirectory, { recursive: true });

for (const id of markIds) {
  writeFileSync(new URL(`${id}.svg`, markDirectory), markSvg(id));
  const png = await sharp(Buffer.from(cardSvg(id))).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(new URL(`${id}.png`, ogDirectory), png);
}

console.log(`Wrote ${markIds.length} marks to public/marks/ and ${markIds.length} social cards to public/og/.`);
