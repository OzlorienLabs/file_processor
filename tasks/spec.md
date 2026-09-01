# Spec: FileKit Browser File Tools

## Objective

Build an original, Vercel-ready file utility web app inspired by the compact tool discovery and upload flow of FileWorld. The product serves people who need a quick one-off file operation without an account. Files are processed in browser memory whenever the browser can do the work, outputs are downloaded immediately, and neither files nor results are persisted by the app.

The initial release provides these public routes:

- `/en` — tool directory
- `/en/summarize` — PDF, DOCX, TXT, and Markdown summarization
- `/en/merge` — merge PDFs and images into one PDF
- `/en/ocr` — OCR images and PDFs
- `/en/audiototext` — transcribe common audio formats
- `/en/split` — split a PDF by range, every page, or selected pages
- `/en/compress` — compress images and PDFs
- `/en/convert/word/pdf` — DOCX to PDF
- `/en/convert/pdf/word` — PDF to editable DOCX
- `/en/convert` — practical browser-supported file conversions
- `/en/emojis` — searchable list of every fully-qualified Unicode Emoji 17.0 sequence

Root and unknown language-prefixed routes redirect safely to `/en` or show a useful not-found state. There is no login, database, pricing, trust badge, testimonial, or long marketing section.

## Product assumptions

1. Modern evergreen browsers are the target. Vite 8's default production target covers browser releases from roughly mid-2023.
2. “All emojis” means all fully-qualified RGI emoji sequences from Unicode Emoji 17.0, including flags, ZWJ sequences, and skin-tone variants. The catalog is lazy-loaded so it does not slow the main tool page.
3. “Built from scratch” means original application UX and processing workflows. Maintained low-level libraries implement complex binary standards such as PDF, DOCX, OCR/WASM, and ZIP.
4. Conversion quality is honest: DOCX-to-PDF prioritizes readable layout but may not reproduce advanced Word features; PDF-to-DOCX produces editable text and basic paragraphs, not a pixel-perfect reconstruction.
5. AI provider, model, and API key preferences are saved to `localStorage` by default under one versioned key so returning users do not re-enter them. A visible “Forget key on this device” control clears them, and the UI explains the storage tradeoff. Files and outputs never use persistent browser storage.
6. Audio transcription defaults to a fully in-browser Whisper model (downloaded on first use); users can switch to their own provider API key for faster, higher-quality transcription.

## Tech stack

- Node.js 22 LTS (minimum compatible runtime: Node 20.19+)
- React 19.2.x and React DOM 19.2.x
- TypeScript 6.0.x (pinned below 6.1 for TypeScript ESLint compatibility)
- Vite 8.2.x with the official React plugin
- React Router for the requested stable URLs
- Native CSS with semantic design tokens; no UI framework
- PDF-LIB for PDF creation, merge, split, and image embedding
- Mozilla PDF.js for PDF parsing, rendering, and text extraction
- Tesseract.js WebAssembly worker for client-side OCR
- Mammoth for DOCX extraction, jsPDF for browser PDF generation, `docx` for DOCX output, and JSZip for multi-file downloads
- Lucide React for accessible, tree-shakeable interface icons
- Vercel Node.js functions for short-lived OpenAI proxy requests only
- Vitest, Testing Library, MSW, and Playwright for unit, integration, and end-to-end verification

All dependency versions are pinned by `package-lock.json` after scaffolding. Heavy processors are route-level dynamic imports.

## Commands

```bash
npm run dev                 # Vite browser development server
npm run dev:vercel          # Full app plus Vercel functions
npm run test                # Unit and integration tests
npm run test:coverage       # Coverage report with >90% gates
npm run test:e2e            # Playwright critical-path tests
npm run lint                # ESLint
npm run typecheck           # TypeScript without emit
npm run build               # Production bundle in dist/
npm run preview             # Local production preview
npm run verify              # lint + typecheck + coverage + build
```

## Project structure

```text
api/                       Vercel Node functions; no persistence
public/emoji/              Generated Unicode 17 emoji catalog
scripts/                   Deterministic Unicode-data generation
src/
  app/                     Router and app shell
  components/              Shared accessible UI
  features/                One folder per tool/workflow
  lib/                     File validation, downloads, processing primitives
  styles/                  Tokens and global responsive styles
tests/integration/         Cross-component and API-boundary tests
e2e/                       Real-browser critical flows
tasks/                     Spec, plan, and implementation checklist
```

## Architecture and data flow

### Client-first processing

- Merge and split: PDF-LIB works on `ArrayBuffer` values in the browser.
- OCR: images are recognized by a Tesseract.js worker; PDF pages are rendered to canvas by PDF.js and recognized one at a time.
- Compression: images use canvas encoding; PDFs are rendered and recomposed at user-selected quality. The UI warns that strong PDF compression rasterizes pages.
- DOCX to PDF: Mammoth converts DOCX content to safe HTML, then jsPDF renders a downloadable PDF.
- PDF to DOCX: PDF.js extracts ordered page text; `docx` generates editable paragraphs and explicit page breaks.
- General conversion: image format changes, images-to-PDF, PDF-to-images ZIP, PDF-to-TXT, TXT-to-PDF, and browser-decodable audio-to-WAV.
- Summarization: text is extracted locally and chunked locally. Only the minimum text chunks are sent to the selected AI model.

### Node boundary

Two Vercel functions forward validated, size-bounded requests to the user's chosen provider (OpenAI, Anthropic, or Google Gemini):

```ts
type SummarizeRequest = {
  provider: 'openai' | 'anthropic' | 'google';
  model: string; // preset or custom ID, validated shape
  text: string;
  detail: 'brief' | 'balanced' | 'detailed';
};

type ApiError = {
  error: { code: string; message: string };
};
```

- `POST /api/ai/summarize` accepts JSON, a key in `x-provider-key`, and at most 500,000 text characters. It calls only allowlisted provider endpoints (OpenAI Responses with `store: false`, Anthropic Messages, Gemini generateContent) and returns plain summary text.
- `POST /api/ai/transcribe` accepts one JSON-wrapped base64 WAV audio chunk below 3.75 MB plus a model ID (OpenAI transcription models). Large source audio is decoded and chunked in the browser before sequential requests. The default transcription path is in-browser Whisper and never touches this function.
- Methods, content types, model IDs, sizes, and upstream response shapes are validated. Responses use `Cache-Control: no-store` and a single consistent error shape.
- Functions never log request bodies, filenames, keys, provider responses, or stack traces.

## AI settings

- Providers: OpenAI, Anthropic, and Google Gemini. Each has model presets (fast / balanced / best) plus a custom model ID field.
- The API key field is masked and has a show/hide control.
- Provider/model/key preference is stored by default under one versioned local-storage key and can be cleared with one visible control.
- The UI states that local storage is readable by scripts running on the origin and recommends a restricted/project key.
- Extracted document text and audio are considered untrusted model input. Model output is rendered only as escaped text/Markdown primitives; never as raw HTML.

## UX and visual system

- Content-first home page with a concise title, privacy line, tool grid, supported format chips, and a short three-step process.
- Tool pages share a focused workspace: title and description, privacy boundary, drop zone/file list, task-specific options, progress, result/download, and exactly one short “How to…” section.
- Mobile-first layout verified at 320, 768, 1024, and 1440 px.
- Clear empty, processing, success, cancellation, and error states.
- Keyboard-operable drop zones, controls, reorder buttons, and dialogs; visible focus; semantic headings; live progress/status announcements; reduced-motion support; WCAG 2.1 AA contrast.
- Helpful enhancements: file-size estimator, output naming, reset/reprocess actions, local/server processing labels, cancel buttons, client capability checks, and copy/download options for text results.

## File boundaries

| Tool | Accepted input | Limit | Output |
|---|---|---:|---|
| Summarize | PDF, DOCX, TXT, MD | 25 MB; 500k extracted chars | TXT/clipboard |
| Merge | PDF, PNG, JPEG, WebP | 20 files / 150 MB total | PDF |
| OCR | PDF, PNG, JPEG, WebP | 25 MB / 50 PDF pages | TXT/clipboard |
| Audio to text | MP3, MP4, M4A, WAV, WebM, OGG, FLAC | 100 MB / 90 min decoded | TXT/SRT when available |

Audio transcription runs in-browser by default (Whisper via WebAssembly, model fetched on first use) and can optionally use the user's OpenAI key for faster, higher-quality results.
| Split | PDF | 100 MB / 500 pages | PDF or ZIP |
| Compress | PDF, PNG, JPEG, WebP | 100 MB | same family |
| Word to PDF | DOCX | 25 MB | PDF |
| PDF to Word | PDF | 50 MB / 300 pages | DOCX |
| Convert | listed practical mappings | 100 MB | selected format |

Limits protect browser memory and function payloads; they are shown before upload.

## Threat model

### Trust boundaries and assets

- Untrusted inputs: filenames, MIME metadata, binary files, extracted text, model output, API error bodies, URL paths, and local-storage values.
- Sensitive assets: user files, extracted content, AI API keys, and downloaded results.
- Boundaries: browser file picker/drop zone, browser-to-Vercel request, Vercel-to-provider request, lazy-loaded OCR/emoji assets, and download creation.

### Abuse cases and controls

- Oversized/decompression-bomb files: explicit byte/page/dimension caps and sequential processing.
- MIME spoofing: extension plus MIME and magic-byte checks for supported binary formats.
- Memory exhaustion: release object URLs/canvases/workers, process PDF pages sequentially, and expose cancel controls.
- XSS from filenames/model output/DOCX: React escaping, sanitized Mammoth output, no `dangerouslySetInnerHTML` for untrusted data.
- Key disclosure: no logs, no analytics, masked field, opt-in storage, clear control, no key in URL/error text.
- Anonymous proxy abuse: strict OpenAI-only upstream URLs, model allowlist/custom-ID validation, payload caps, request timeout, origin checks, and Vercel rate controls documented for production.
- Prompt injection: the model receives document text as quoted source material and has no tools or authority; output remains display-only text.

## Testing strategy

- Unit tests: validators, range parser, naming, file signature checks, text chunking, PDF operations, image compression helpers, API schema/error mapping, and local preference handling.
- Component/integration tests: upload-to-result flows with in-memory fixtures, drag/reorder, error/cancel states, settings persistence opt-in, routing, and mocked provider boundaries.
- API integration tests: methods, malformed input, size limits, safe upstream requests, timeout/error mapping, `store: false`, and no-store headers.
- End-to-end tests: home navigation, one fully client-side PDF flow, OCR upload state, AI settings safety, emoji search/copy, mobile menu/layout, and clean console.
- Global Vitest thresholds: statements, branches, functions, and lines must each exceed 95% (configured at 95). No skipped tests in the release gate.
- Real-browser verification: desktop and mobile screenshots, accessibility tree/keyboard flow, console warnings/errors, network request shape, and a short performance trace.

## Code style

Prefer small pure processing functions and discriminated task state:

```ts
export type TaskState<T> =
  | { status: 'idle' }
  | { status: 'working'; progress: number; label: string }
  | { status: 'success'; result: T }
  | { status: 'error'; message: string };

export function assertSupportedFile(file: File, policy: FilePolicy): void {
  if (file.size > policy.maxBytes) throw new FileInputError('File is too large.');
}
```

Components use named exports, one responsibility, semantic HTML, and colocated tests. Processing modules never import React.

## Boundaries

### Always

- Process locally unless a documented external model call is required.
- Validate files and API inputs at their trust boundary.
- Revoke object URLs, terminate workers, clear large references, and mark network responses `no-store`.
- Keep dependency-heavy routes lazy and run the full verification gate before release.

### Ask first

- Add persistent server storage, analytics, accounts, payments, a new AI provider, remote object storage, or an upload limit above the documented boundary.
- Deploy to production, purchase infrastructure, or publish externally.

### Never

- Commit keys, log file contents or credentials, store files/results on the server, silently upload client-processable files, render untrusted raw HTML, or claim pixel-perfect conversion where it is not technically true.

## Success criteria

- Every requested route exists, is linked from `/en`, has a working upload-to-download flow, and includes a concise three-step instruction section.
- Files remain in browser memory except for explicit AI requests; no database or analytics is present.
- Model/key preferences follow opt-in local-storage behavior and can be cleared.
- Unicode Emoji 17.0's fully-qualified catalog is searchable and lazy-loaded.
- Home and tool pages remain usable at 320 px without horizontal overflow and meet keyboard/accessibility checks.
- `npm run verify` and `npm run test:e2e` pass; all four coverage metrics are above 95%; the production browser console is clean.
- Vercel configuration builds the SPA, rewrites client routes, runs the Node functions, and sets security/cache headers.

## Open questions

No blocking questions. The assumptions above are the proposed v1 contract; implementation starts after review approval.
