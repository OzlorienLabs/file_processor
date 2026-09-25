# FileKit — private, client-first file tools

## Web App - [FileKit](https://filekit.ozlorienlabs.com/)

Free online tools for everyday files: merge, split, compress, convert, OCR, summarize,
transcribe, take screenshots, and a complete emoji library, plus a set of local-first editors — whiteboard
diagrams, Mermaid, Graphviz, diff checking, notes, Markdown, code snippets, and an AI snippet
generator — and two media tools, a screen recorder and a video-to-GIF converter. No login, no
database, no tracking. File tools work in browser memory and forget everything on refresh; the
editors keep your work in this browser's localStorage only, with export and clear controls on
every page.

Release 1.1.1

## Tools

| Route | What it does | Where it runs |
|---|---|---|
| `/en/merge` | Combine PDFs and images into one PDF | Browser |
| `/en/split` | Split a PDF by pages or ranges (PDF or ZIP out) | Browser |
| `/en/compress` | Shrink images and PDFs at a chosen quality | Browser |
| `/en/convert` | Images ⇄ formats, image→PDF, PDF→images/text, DOCX→PDF/text, text→PDF, audio→WAV | Browser |
| `/en/convert/word/pdf` | DOCX → PDF | Browser |
| `/en/convert/pdf/word` | PDF → editable DOCX | Browser |
| `/en/ocr` | Read text from scans and images (15 languages) | Browser (Tesseract WASM) |
| `/en/summarize` | Summarize PDF/DOCX/TXT/MD with your own OpenAI, Anthropic, or Gemini key | Browser + stateless proxy |
| `/en/audiototext` | Transcribe recordings — on-device Whisper by default, or your OpenAI key | Browser (optionally + proxy) |
| `/en/screen-capture` | Take screenshot images of screen, window, or tab (full or cropped) in PNG/JPEG with history | Browser (IndexedDB) |
| `/en/emojis` | Every fully-qualified Unicode Emoji 17.0 sequence, searchable, click-to-copy | Browser |

### Editors (saved in this browser's localStorage)

| Route | What it does | Storage key |
|---|---|---|
| `/en/diagram` | Excalidraw whiteboard: shapes, arrows, text, images; PNG/SVG/`.excalidraw` export and import | `filekit.diagram.v1` |
| `/en/mermaid` | Mermaid editor with live preview, samples, saved diagrams, SVG/PNG export | `filekit.mermaid.v1`, `filekit.mermaid-draft.v1` |
| `/en/graphviz` | Graphviz DOT editor: all 11 layout engines (dot, neato, fdp, sfdp, circo, twopi, osage, patchwork, nop, nop1, nop2), 20 samples, `.gv` import, saved graphs; SVG/PNG/PDF plus 18 Graphviz output formats (DOT, canon, xdot, plain, JSON, PostScript, …) | `filekit.graphviz.v1`, `filekit.graphviz-draft.v1` |
| `/en/diff` | Side-by-side or unified text/file diff with word-level highlights and `.patch` export | `filekit.diff.v1` |
| `/en/notepad` | Notes with history, plain/Markdown/HTML preview, per-note or ZIP export, JSON import | `filekit.notes.v1` |
| `/en/markdown` | Markdown live previewer (GFM), copy/download Markdown or standalone HTML | `filekit.markdown.v1` |
| `/en/snippets` | Code snippet manager with detection, highlighting, tags, search, JSON export/import | `filekit.snippets.v1` |
| `/en/snippet-generator` | Generate snippets with Chrome's built-in model (on device) or your OpenAI/Anthropic/Gemini key; searchable history | `filekit.generated.v1`, `filekit.generator.v1` |

### Media tools (memory only, never stored)

| Route | What it does |
|---|---|
| `/en/screen-recorder` | Record a browser tab, a window, or the whole screen — all of it or a dragged/typed area — as WebM or MP4 (whatever `MediaRecorder` offers); frame rate, bitrate, tab/system sound, microphone voice-over (mixed with Web Audio), pointer, countdown, pause/resume. WebM files get their missing duration written in so they seek. "Make a GIF" hands the take straight to the converter. |
| `/en/video-to-gif` | Turn MP4/WebM/MOV (or a handed-over recording) into a GIF: trim, crop, width, frame rate, speed, 32–256 colours, optional dithering, loop. Each frame gets its own palette and only changed pixels are redrawn (transparent over the previous frame), so screen text stays crisp and files stay small. Encoded with gifenc in the tab. |

AI keys are yours: they are sent per-request in a header through a stateless Vercel
function that stores and logs nothing. Model/key preferences live in your browser's
localStorage with a one-click "Forget key on this device" control.

## Stack

Vite + React 19 + TypeScript SPA, native CSS (warm Clay/Ivory light theme), React Router
for stable `/en/...` URLs, deployed on Vercel with three Node functions (`api/ai/*`) used
only for AI provider calls. Heavy engines — pdf-lib, PDF.js, Tesseract, mammoth, jsPDF,
docx, JSZip, transformers.js, Excalidraw, Mermaid, Graphviz (`@viz-js/viz` WebAssembly), gifenc,
fix-webm-duration, the remark/rehype Markdown pipeline, and lowlight — are dynamic imports or route-level chunks, kept out of the initial bundle.
Untrusted content (Markdown, model output, highlighted code) is rendered as React elements
from syntax trees, never as injected HTML; user HTML previews live in a sandboxed iframe.

## Develop

```bash
npm install
npm run dev             # app only
npm run dev:vercel      # app + api functions
npm run verify          # lint + typecheck + coverage (≥95% gates) + build
npm run audit           # dependency audit; must be clean before release
npm run test:e2e        # Playwright critical flows (desktop + mobile)
node scripts/generate-emoji.ts   # regenerate public/emoji/catalog.json
```

The product contract lives in `tasks/spec.md`; agent conventions in `CLAUDE.md`.
