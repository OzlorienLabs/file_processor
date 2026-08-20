# Implementation Plan: FileKit Browser File Tools

## Overview

Build the app as thin, testable vertical slices. Establish file and privacy contracts first, then complete the smallest end-to-end local tools, add heavy browser engines behind dynamic imports, add the two short-lived AI boundaries, and finish with responsive/accessibility/security verification.

## Architecture decisions

- Use a Vite React SPA with the exact `/en/...` routes and Vercel rewrites; it is smaller and faster than adding SSR to a file utility.
- Keep processing functions framework-independent and pass `File`/`ArrayBuffer` values in and `Blob`/text results out.
- Use a shared workspace shell but keep each processor explicit; a generic plugin system would add complexity without helping nine known tools.
- Lazy-load PDF.js, Tesseract, Mammoth, jsPDF, DOCX, JSZip, and the emoji catalog at the route or action boundary.
- Use the Node layer only for model-provider calls; all file manipulation and text extraction stay in the browser.
- Enforce 91% coverage thresholds so the requested “more than 90%” cannot pass at exactly 90%.

## Dependency graph

```text
tool metadata + routing + design tokens
  -> shared upload/task workspace + file policies
    -> PDF primitives -> merge/split -> PDF compression/conversion/OCR
    -> text extraction -> summarization -> AI function contract
    -> audio decode/chunk -> transcription function contract
    -> Unicode generator -> emoji explorer
  -> integration/e2e/accessibility/performance verification
```

## Phases

### Phase 1: Foundation

- [ ] Scaffold Vite/React/TypeScript, lint, Vitest, coverage, Vercel config, and security headers.
- [ ] Add router, app shell, semantic tool metadata, global tokens, and responsive home route.
- [ ] Add shared file validation, download lifecycle, task state, drop zone, file list, progress, and instructions components through failing-first tests.

### Checkpoint: Foundation

- [ ] Home route and a demo local text conversion work at desktop/mobile sizes.
- [ ] Lint, typecheck, coverage, and build are green.

### Phase 2: Local PDF and conversion slices

- [ ] Merge PDF/images end to end with ordering and output naming.
- [ ] Split PDF by validated range/selection with PDF-or-ZIP download.
- [ ] Add image/PDF compression with size-before/after reporting and rasterization warning.
- [ ] Add DOCX-to-PDF and PDF-to-DOCX with explicit fidelity notes.
- [ ] Add the general conversion route and supported mapping resolver.

### Checkpoint: Local tools

- [ ] Every local tool completes against small deterministic fixtures.
- [ ] Heavy code is absent from the home-route initial chunk.

### Phase 3: OCR and AI slices

- [ ] Add image/PDF OCR with sequential pages, language choice, cancel, copy, and TXT download.
- [ ] Add local text extraction/chunking plus summarization settings and result flow.
- [ ] Implement/test the summary function boundary with no-store/error/timeout controls.
- [ ] Add browser audio decode/chunking and the transcription function/result flow.

### Checkpoint: External boundary

- [ ] Keys/content never appear in logs, URLs, or persisted test snapshots.
- [ ] Provider requests are mocked in automated tests and inspected in local browser network checks.

### Phase 4: Catalog, polish, and release gate

- [ ] Generate and lazy-load the Unicode 17.0 fully-qualified emoji catalog with search/category/copy.
- [ ] Complete instructions, helpful states, keyboard/accessibility, reduced motion, and mobile layouts on every route.
- [ ] Add integration and Playwright critical flows; raise coverage above 90% across all metrics.
- [ ] Run audit, verify, bundle inspection, real-browser screenshots/console/network/a11y/performance, and update README.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Browser memory spikes on large PDFs/audio | High | byte/page/duration caps, sequential work, cleanup, cancellation |
| DOCX/PDF conversion fidelity expectations | High | honest UI labels, simple-layout guarantee, representative fixtures |
| Tesseract/PDF.js bundle weight | Medium | dynamic imports, workers, home-chunk inspection |
| Vercel request limit for audio | High | decode/chunk below 3.75 MB before sequential proxy requests |
| Provider model/API drift | Medium | typed boundary, custom model ID, current documented presets, isolated adapters |
| API key exposure on shared devices | High | memory-only default, opt-in storage warning, one-click clear, no logs |
| Coverage inflated by trivial tests | Medium | behavior-focused unit tests plus integration and browser critical flows |
| Huge emoji catalog slows rendering | Medium | lazy JSON, category/search filtering, incremental display batches |

## Verification checkpoints

After each slice, run its focused test plus `npm run typecheck`. After each phase, run `npm run verify`. The final gate also runs Playwright, `npm audit --audit-level=high`, bundle inspection, and real-browser checks at 320, 768, 1024, and 1440 px.
