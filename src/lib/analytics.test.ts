import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getMeasurementId,
  initAnalytics,
  isLocalHost,
  resetAnalyticsForTesting,
  trackPageView,
} from './analytics';

function gtagScripts() {
  return document.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js"]');
}

function onHost(hostname: string) {
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    hostname,
    origin: `https://${hostname}`,
  } as Location);
}

afterEach(() => {
  resetAnalyticsForTesting();
  vi.restoreAllMocks();
  gtagScripts().forEach((script) => script.remove());
  delete window.gtag;
  delete window.dataLayer;
});

describe('getMeasurementId', () => {
  it('accepts a GA4 ID and normalizes it', () => {
    expect(getMeasurementId(' g-kr73djjhx5 ')).toBe('G-KR73DJJHX5');
  });

  it.each([undefined, '', 'undefined', 'UA-12345-1', 'G-'])('rejects %s', (raw) => {
    expect(getMeasurementId(raw)).toBeNull();
  });

  it('is unset in the test environment', () => {
    expect(getMeasurementId()).toBeNull();
  });
});

describe('isLocalHost', () => {
  it.each(['localhost', '127.0.0.1', '[::1]', 'app.localhost'])('treats %s as local', (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it('treats the production host as remote', () => {
    expect(isLocalHost('filekit.ozlorienlabs.com')).toBe(false);
  });
});

describe('initAnalytics', () => {
  it('stays inert without an ID or on localhost', () => {
    expect(initAnalytics()).toBe(false);
    expect(initAnalytics(null)).toBe(false);
    expect(initAnalytics('G-KR73DJJHX5')).toBe(false); // jsdom runs on localhost
    expect(gtagScripts()).toHaveLength(0);
    expect(window.gtag).toBeUndefined();
  });

  it('loads gtag.js once and configures the stream without automatic page views', () => {
    onHost('filekit.ozlorienlabs.com');
    expect(initAnalytics('G-KR73DJJHX5')).toBe(true);
    expect(initAnalytics('G-KR73DJJHX5')).toBe(true);

    expect(gtagScripts()).toHaveLength(1);
    expect((gtagScripts()[0] as HTMLScriptElement).src).toContain('id=G-KR73DJJHX5');
    const commands = window.dataLayer!.map((entry) => Array.from(entry as IArguments));
    expect(commands).toHaveLength(2);
    expect(commands[0][0]).toBe('js');
    expect(commands[1]).toEqual(['config', 'G-KR73DJJHX5', { send_page_view: false }]);
  });

  it('reuses an existing gtag and script tag', () => {
    onHost('filekit.ozlorienlabs.com');
    const existing = vi.fn();
    window.gtag = existing;
    const script = document.createElement('script');
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-OTHER';
    document.head.appendChild(script);

    expect(initAnalytics('G-KR73DJJHX5')).toBe(true);
    expect(gtagScripts()).toHaveLength(1);
    expect(existing).toHaveBeenCalledWith('config', 'G-KR73DJJHX5', { send_page_view: false });
  });
});

describe('trackPageView', () => {
  it('does nothing before initialization', () => {
    window.gtag = vi.fn();
    trackPageView('/en/merge');
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('sends the path only, never a query string', () => {
    onHost('filekit.ozlorienlabs.com');
    initAnalytics('G-KR73DJJHX5');
    const gtag = vi.fn();
    window.gtag = gtag;
    document.title = 'Merge PDF';

    trackPageView('/en/merge');
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
      page_path: '/en/merge',
      page_location: 'https://filekit.ozlorienlabs.com/en/merge',
      page_title: 'Merge PDF',
    });
  });

  it('does nothing if gtag was removed', () => {
    onHost('filekit.ozlorienlabs.com');
    initAnalytics('G-KR73DJJHX5');
    delete window.gtag;
    expect(() => trackPageView('/en')).not.toThrow();
  });
});
