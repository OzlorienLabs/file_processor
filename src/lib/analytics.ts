/**
 * Google Analytics 4, page views only.
 *
 * FileKit sends route paths and nothing else: no file names, sizes, text, or AI
 * settings, and no query string or hash. It stays inert without a measurement ID,
 * so tests, local dev and forks without `VITE_GA_MEASUREMENT_ID` never load gtag.js.
 */

export const GTAG_ORIGIN = 'https://www.googletagmanager.com';
const MEASUREMENT_ID_SHAPE = /^G-[A-Z0-9]+$/;

let activeId: string | null = null;

/** Local builds (`vite preview`, the e2e suite) must never report to the live stream. */
export function isLocalHost(hostname: string = window.location.hostname): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
}

export function getMeasurementId(raw: string | undefined = import.meta.env.VITE_GA_MEASUREMENT_ID): string | null {
  const id = raw?.trim().toUpperCase() ?? '';
  return MEASUREMENT_ID_SHAPE.test(id) ? id : null;
}

/** Loads gtag.js once and configures the stream with automatic page views off (the router sends them). */
export function initAnalytics(measurementId: string | null = getMeasurementId()): boolean {
  if (!measurementId || isLocalHost()) return false;
  if (activeId === measurementId) return true;

  window.dataLayer = window.dataLayer ?? [];
  if (typeof window.gtag !== 'function') {
    // gtag.js only treats `arguments` objects as commands; a rest-param array is ignored.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
  }

  if (!document.querySelector(`script[src^="${GTAG_ORIGIN}/gtag/js"]`)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `${GTAG_ORIGIN}/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });
  activeId = measurementId;
  return true;
}

/** Sends one page view for an SPA route. Query strings and hashes are never included. */
export function trackPageView(pathname: string): void {
  if (!activeId || typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', {
    page_path: pathname,
    page_location: `${window.location.origin}${pathname}`,
    page_title: document.title,
  });
}

/** Test hygiene only. */
export function resetAnalyticsForTesting(): void {
  activeId = null;
}
