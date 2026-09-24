import { describe, expect, it } from 'vitest';

import { clearHandedOffVideo, handOffVideo, peekHandedOffVideo } from './media-handoff';

describe('media hand-off', () => {
  it('holds one recording in memory until cleared', () => {
    expect(peekHandedOffVideo()).toBeUndefined();
    const file = new File(['v'], 'clip.webm', { type: 'video/webm' });
    handOffVideo(file);
    expect(peekHandedOffVideo()).toBe(file);
    expect(peekHandedOffVideo()).toBe(file);
    clearHandedOffVideo();
    expect(peekHandedOffVideo()).toBeUndefined();
  });
});
