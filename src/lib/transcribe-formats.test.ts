import { describe, expect, it } from 'vitest';

import { localWhisperModels, modelForQuality, toParagraphs, toVtt } from './transcribe';

const segments = [
  { start: 0, end: 1.5, text: 'Good morning.' },
  { start: 1.6, end: 3, text: 'Here is the update.' },
  { start: 9, end: 11, text: 'Any questions?' },
];

describe('transcript formats', () => {
  it('writes WebVTT cues with dotted timestamps', () => {
    const vtt = toVtt(segments);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.500');
    expect(vtt).toContain('Any questions?');
  });

  it('breaks paragraphs where the speaker pauses', () => {
    expect(toParagraphs(segments, 'fallback')).toBe(
      'Good morning. Here is the update.\n\nAny questions?',
    );
  });

  it('falls back to the plain text when there are no segments', () => {
    expect(toParagraphs([], 'just the words')).toBe('just the words');
  });

  it('maps the model slider across the on-device list', () => {
    expect(modelForQuality(0)).toBe(localWhisperModels[0].id);
    expect(modelForQuality(100)).toBe(localWhisperModels[localWhisperModels.length - 1].id);
  });
});
