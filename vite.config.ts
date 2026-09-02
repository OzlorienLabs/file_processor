import { createReadStream, cpSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
const excalidrawFonts = path.join(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts');
const FONT_ROUTE = '/excalidraw/fonts';

/**
 * Excalidraw loads its fonts from `window.EXCALIDRAW_ASSET_PATH` (set by the diagram
 * workspace) and would otherwise fall back to a CDN that the CSP blocks. This plugin
 * serves the package's fonts in dev and copies them into dist/ so they ship with the app.
 */
function excalidrawAssets(): Plugin {
  return {
    name: 'filekit-excalidraw-assets',
    configureServer(server) {
      server.middlewares.use(FONT_ROUTE, (req, res, next) => {
        const relative = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = path.join(excalidrawFonts, relative);
        if (!file.startsWith(excalidrawFonts) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(excalidrawFonts)) {
        cpSync(excalidrawFonts, path.join(root, 'dist', 'excalidraw', 'fonts'), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), excalidrawAssets()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // The emoji catalog test renders ~4k items; shared CI runners can exceed the 5 s default.
    testTimeout: 20_000,
    exclude: ['**/node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
      exclude: [
        'src/main.tsx',
        'src/**/*.d.ts',
        'src/test/**',
        'src/**/types.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
