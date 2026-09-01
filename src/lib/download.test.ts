import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyText, downloadBlob, downloadText, formatWhen } from './download';

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:download'),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('clicks a temporary anchor and revokes the URL afterwards', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadText('hello', 'hello.txt');

    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('hello.txt');
    expect(anchor.href).toContain('blob:download');
    expect(document.body.contains(anchor)).toBe(false);

    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download');
    click.mockRestore();
  });

  it('accepts a custom blob type and document', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadBlob(new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'shape.svg', document);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});

describe('copyText', () => {
  it('resolves true on success and false when the clipboard rejects', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    expect(await copyText('abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');

    writeText.mockRejectedValue(new Error('denied'));
    expect(await copyText('abc')).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('formatWhen', () => {
  const now = new Date(2026, 8, 1, 15, 30).getTime();

  it('labels today and yesterday with a time and older dates with a short date', () => {
    expect(formatWhen(new Date(2026, 8, 1, 9, 5).getTime(), now)).toMatch(/^Today /);
    expect(formatWhen(new Date(2026, 7, 31, 23, 59).getTime(), now)).toMatch(/^Yesterday /);
    expect(formatWhen(new Date(2026, 0, 2).getTime(), now)).toMatch(/2026/);
  });

  it('defaults to the current time', () => {
    expect(formatWhen(Date.now())).toMatch(/^Today /);
  });
});
