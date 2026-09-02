# FileKit — client-first file tools

Private, no-login file utilities (merge, split, compress, convert, OCR, summarize, transcribe, emoji library) served as a Vite + React SPA on Vercel. Files are processed in browser memory whenever possible; only explicit AI tasks call out through stateless `api/` functions using the user's own key.

The product contract lives in `tasks/spec.md`; the phased plan in `tasks/plan.md` and `tasks/todo.md`. Read the spec before changing behavior.

## Commands

```bash
npm run dev             # Vite dev server (no api/ functions)
npm run dev:vercel      # vercel dev — app + api/ functions
npm run test            # Vitest unit/integration (jsdom)
npm run test:coverage   # coverage; all four metrics must be ≥95%
npm run test:e2e        # Playwright against the production preview
npm run verify          # lint + typecheck + coverage + build (run before any release claim)
npm run audit           # npm audit --audit-level=high; must be clean before release
```

## Architecture rules

- Routes are `/en/...` (see `src/app/tool-catalog.ts`); Vercel rewrites all non-asset paths to `index.html`.
- Processing code lives in `src/lib/` as small pure functions that take `File`/`ArrayBuffer` and return bytes/`Blob`/text. **Processing modules never import React.**
- Each tool gets one folder in `src/features/` with a `*Workspace.tsx` component and a colocated test. `ToolPage` maps tool id → workspace.
- Heavy engines (pdf-lib, pdf.js, tesseract, mammoth, jspdf, docx, jszip, transformers) are **dynamic imports at the action boundary**, never in the initial chunk.
- `api/` functions are stateless proxies to allowlisted AI provider endpoints only. Never log bodies, filenames, or keys; always respond `Cache-Control: no-store` with the shared `{ error: { code, message } }` shape.
- User AI preferences (provider/model/key) persist in one versioned localStorage key with a visible clear control. Files and results never touch persistent storage.
- Untrusted data (file content, extracted text, model output) is rendered only as escaped text — no `dangerouslySetInnerHTML`.

## Conventions

- Named exports, one responsibility per file, colocated `*.test.ts(x)`.
- Task flow state in workspaces: `idle → working (progress, cancellable via AbortController) → success | error`. Always release object URLs, canvases, and workers.
- New tools: add to `coreTools` in `tool-catalog.ts` (routes/cards/steps derive from it), register the workspace in `ToolPage`'s map, define its `FilePolicy` inside the workspace, keep exactly one short "How to" section per page. Editors (`category: 'create'`) are `lazy()` entries with `layout: 'wide'` and `storage: 'local'`.
- Persisted user content goes through `src/lib/local-store.ts` (`createCollection` / `createValueStore`, one `filekit.<tool>.v1` key each, zod-validated, capped) and the `useLocalCollection` hook; every such page offers export and clear controls.
- Untrusted text becomes React elements, never HTML strings: Markdown via `MarkdownPreview` (react-markdown), code via `CodeBlock` (lowlight hast → JSX), author HTML only inside `HtmlPreview`'s sandboxed iframe, Mermaid SVG through an `<img>` blob URL.
- UI theme: light Clay/Ivory tokens in `src/styles/global.css` (`--paper #FAF9F5`, `--ink #141413`, clay accent `#D97757`). Light theme only — no dark default.
- Tests mock the heavy engines at the module boundary (`vi.mock` on `src/lib/*`), and lib tests inject adapters (see `RasterAdapter`, `OpenPdfRasterDocument`) instead of touching canvas/workers.

## Gotchas

- `eslint-plugin-react-hooks` v7 enforces the React Compiler rules: no `setState` directly in an effect body (save inside handlers, or set state in a promise `.then`), and no `Date.now()`/impure calls in render or handlers the linter can see — use `touch()` from `local-store.ts` for timestamps.
- Excalidraw resolves fonts from `window.EXCALIDRAW_ASSET_PATH` and otherwise falls back to a CDN the CSP blocks. `DiagramWorkspace` sets it to `/excalidraw/`; the `excalidrawAssets` Vite plugin serves the package fonts in dev and copies them into `dist/excalidraw/fonts` on build. Keep both in sync.
- `mermaid.render` appends a scratch `<div id="d<id>">` and leaves it behind on parse errors; `renderMermaid` removes it. Preview goes through `<img>` so `htmlLabels: false` matters for consistent PNG export.
- `@testing-library/user-event` honours an input's `accept` list: to test the "unsupported file" branch pass `userEvent.setup({ applyAccept: false })`.

- `pdfjs-dist` v6: worker via `?url` import; destroy through the loading task; jsdom has no canvas — keep pdf.js behind injectable adapters.
- Vercel function payload limit ~4.5 MB: audio chunks must stay below 3.75 MB before base64 wrapping.
- Coverage thresholds (95) fail the build on untested branches — add tests with the code, not after.
- `@huggingface/transformers` pins Node-only deps (`onnxruntime-node` → `adm-zip`, `sharp`) that its own semver range holds at vulnerable versions. `overrides` in `package.json` force the patched `adm-zip@^0.6.0` / `sharp@^0.35.4`; keep them until upstream bumps its pins, then re-test `npm run audit`. These never reach the browser bundle (it resolves `transformers.web.js` → onnxruntime-web), but `onnxruntime-node`'s postinstall does unzip archives on dev/CI machines — so treat findings there as real, not as noise.
