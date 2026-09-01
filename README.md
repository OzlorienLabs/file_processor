# FileKit — private, client-first file tools

Free online tools for everyday files: merge, split, compress, convert, OCR, summarize,
transcribe, and a complete emoji library. No login, no database, no tracking — files are
processed in your browser's memory and disappear when you close the page.

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
| `/en/emojis` | Every fully-qualified Unicode Emoji 17.0 sequence, searchable, click-to-copy | Browser |

AI keys are yours: they are sent per-request in a header through a stateless Vercel
function that stores and logs nothing. Model/key preferences live in your browser's
localStorage with a one-click "Forget key on this device" control.

## Stack

Vite + React 19 + TypeScript SPA, native CSS (warm Clay/Ivory light theme), React Router
for stable `/en/...` URLs, deployed on Vercel with two Node functions (`api/ai/*`) used
only for AI provider calls. Heavy engines — pdf-lib, PDF.js, Tesseract, mammoth, jsPDF,
docx, JSZip, transformers.js — are dynamic imports, kept out of the initial chunk.

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
