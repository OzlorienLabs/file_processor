/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GA4 measurement ID (`G-…`). Analytics stays inert when it is unset. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface Window {
  /** Base URL Excalidraw uses for its self-hosted fonts (see vite.config.ts and diagram-scene.ts). */
  EXCALIDRAW_ASSET_PATH?: string;
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}
