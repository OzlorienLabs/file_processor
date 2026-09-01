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
- New tools: add to `coreTools` in `tool-catalog.ts` (routes/cards/steps derive from it), register the workspace in `ToolPage`'s map, define its `FilePolicy` inside the workspace, keep exactly one short "How to" section per page.
- UI theme: light Clay/Ivory tokens in `src/styles/global.css` (`--paper #FAF9F5`, `--ink #141413`, clay accent `#D97757`). Light theme only — no dark default.
- Tests mock the heavy engines at the module boundary (`vi.mock` on `src/lib/*`), and lib tests inject adapters (see `RasterAdapter`, `OpenPdfRasterDocument`) instead of touching canvas/workers.

## Gotchas

- `pdfjs-dist` v6: worker via `?url` import; destroy through the loading task; jsdom has no canvas — keep pdf.js behind injectable adapters.
- Vercel function payload limit ~4.5 MB: audio chunks must stay below 3.75 MB before base64 wrapping.
- Coverage thresholds (95) fail the build on untested branches — add tests with the code, not after.
- `npm audit` flags @huggingface/transformers' Node-only transitive deps (onnxruntime-node → adm-zip, sharp). They never reach the browser bundle (it uses onnxruntime-web); re-check on transformers upgrades.
