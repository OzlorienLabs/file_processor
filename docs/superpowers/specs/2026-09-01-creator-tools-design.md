# Creator tools: diagram, Mermaid, diff, notepad, Markdown, snippets, snippet generator

Date: 2026-09-01 · Status: approved for implementation (autonomous `/loop` run; decisions
below are stated assumptions the user can override)

## Goal

Add seven local-first "creator" tools to FileKit alongside the existing file tools. Every
tool runs entirely in the browser; anything the user wants kept between visits is saved in
`localStorage` under one versioned key per tool with visible export and clear controls.
The only network path is the snippet generator when the user explicitly chooses a cloud
provider with their own key (through the existing stateless `api/` proxy pattern).

| Route | Tool | Modeled on | Storage key |
|---|---|---|---|
| `/en/diagram` | Diagram creator (Excalidraw canvas) | excalidraw.com | `filekit.diagram.v1` |
| `/en/mermaid` | Mermaid editor with live preview | mermaideditor.io | `filekit.mermaid.v1` |
| `/en/diff` | Text and file diff checker | diffchecker.com | `filekit.diff.v1` |
| `/en/notepad` | Notepad with note history, Markdown and HTML preview | onlinenotepad.io | `filekit.notes.v1` |
| `/en/markdown` | Markdown live previewer | markdownlivepreview.com | `filekit.markdown.v1` |
| `/en/snippets` | Code snippet manager | — | `filekit.snippets.v1` |
| `/en/snippet-generator` | AI snippet generator (Chrome built-in AI or provider key) | — | `filekit.generated.v1` |

Also in scope: repair the GitHub Actions workflows (see "CI fixes").

## Architecture decisions

1. **Catalog-driven, same as file tools.** Each tool is a `ToolDefinition` in
   `coreTools`; routes, cards, and the "How to" section derive from it. The definition gains
   three optional fields: `category: 'files' | 'create'` (home page grouping), `layout:
   'wide'` (editors get a 90rem workspace instead of 58rem), and `storage: 'local'` (the
   privacy note explains local-storage persistence instead of "disappears on refresh").
   `processing` gains a third value `'browser-or-provider'` for the generator.
2. **New workspaces are route-level lazy chunks.** `ToolPage` keeps its id → component map
   but the seven new workspaces are `React.lazy` so Excalidraw, Mermaid, and the Markdown
   pipeline never touch the initial chunk. Existing workspaces stay static (unchanged
   behaviour).
3. **One local-storage primitive.** `src/lib/local-store.ts` exports
   `createCollection<T>({ key, schema, max })` returning `list / get / upsert / remove /
   clear / exportJson / importJson`. Every record has `id`, `createdAt`, `updatedAt`. Zod
   validates on read; corrupt data falls back to an empty list rather than crashing. Quota
   errors surface as a friendly `LocalStoreError`. A React hook `useLocalCollection` (in
   `src/hooks/`) wraps a collection in state. Processing modules stay React-free.
4. **Untrusted content is never injected as HTML.**
   - Markdown → React elements with `react-markdown` + `remark-gfm` (raw HTML in Markdown
     is escaped). Markdown → HTML string (for copy/download) uses the same remark pipeline
     with `rehype-sanitize`.
   - Raw HTML preview (notepad HTML mode) renders DOMPurify-sanitised markup inside an
     `<iframe sandbox>` with no `allow-scripts`/`allow-same-origin`; the frame is a real
     origin boundary and inherits the page CSP.
   - Syntax highlighting uses `lowlight` (highlight.js as a hast tree) rendered through
     `hast-util-to-jsx-runtime`, so highlighted code is React elements, not HTML.
   - Mermaid renders with `securityLevel: 'strict'` and `htmlLabels: false`; the SVG is
     shown through an `<img>` backed by a Blob URL, which also gives PNG export via canvas.
   - Model output (generator) is shown in a textarea / highlighted code view only.
5. **Heavy engines behind action-boundary dynamic imports** (`mermaid`,
   `@excalidraw/excalidraw`, `lowlight`, `jszip`, the Markdown pipeline). Lib modules take
   injectable adapters so jsdom tests never load the engines; workspace tests mock the lib.
6. **Generator providers.** Chrome's built-in Prompt API (`LanguageModel`, Gemini Nano) is
   the default when available; otherwise the user picks OpenAI / Anthropic / Gemini with
   their key through the existing `AiSettingsPanel`. A new `POST /api/ai/generate` proxy
   mirrors `summarize` (same validation, allowlisted endpoints, `no-store`, no logging).
   Prompt/response parsing is shared in `api/_lib/providers.ts`.

## Per-tool design

### Diagram creator (`/en/diagram`)
- Embeds `@excalidraw/excalidraw` (MIT) full-screen inside the workspace card, light theme,
  with the library's own toolbar (shapes, arrows, text, freedraw, images, undo, zoom).
- Autosaves elements + selected app state (view background, grid, theme) to
  `filekit.diagram.v1` on change (debounced 500 ms). Restores on load.
- Actions bar: New (clear with confirm), Import `.excalidraw`/`.png` with embedded scene,
  Export PNG / SVG / `.excalidraw` JSON, Clear saved copy.
- Fonts are served from `public/excalidraw/` via `window.EXCALIDRAW_ASSET_PATH` so the CSP
  `font-src 'self'` holds (copied from the package by a small Vite plugin at build time).

### Mermaid editor (`/en/mermaid`)
- Left: code textarea (tab inserts two spaces). Right: live preview rendered 400 ms after
  typing stops; parse errors shown inline with line info, the last good render kept.
- Sample gallery (flowchart, sequence, class, state, ER, gantt, pie, git graph, mindmap).
- Saved diagrams list (name + code, `filekit.mermaid.v1`): save, load, rename, delete,
  export all as JSON.
- Export current: SVG file, PNG (2× scale via canvas), copy code, copy as Markdown fence.

### Diff checker (`/en/diff`)
- Two panes (Original / Changed) with paste or file upload (text-like files ≤ 5 MB).
- "Find difference" computes a line diff (`diff` package, Myers) with in-line
  character-level highlights for changed line pairs.
- Views: side-by-side and unified. Options: ignore whitespace, ignore case, wrap lines.
- Stats (lines added/removed/unchanged), Next/Prev change navigation, export unified
  `.patch`, copy patch, swap sides, clear. Inputs autosave to `filekit.diff.v1`.

### Notepad (`/en/notepad`)
- Notes list sidebar (search, sorted by updated), editor with title + body, autosave
  on every change to `filekit.notes.v1`; word/character count; new/duplicate/delete.
- Modes: Plain, Markdown (rendered preview with react-markdown), HTML (sandboxed iframe
  preview). Preview toggles Edit / Split / Preview.
- Export: current note as `.txt` / `.md` / `.html`, all notes as `.zip` (one file per note
  plus `notes.json`); import `notes.json`. "Clear all notes" with confirm.

### Markdown previewer (`/en/markdown`)
- Split editor/preview with GFM (tables, task lists, strikethrough, autolinks).
- Autosaves the draft to `filekit.markdown.v1`; "Reset to sample" restores the demo doc.
- Toolbar: copy Markdown, copy HTML, download `.md`, download `.html` (standalone page with
  the Clay/Ivory stylesheet), word count, preview-only / editor-only toggles.

### Code snippets (`/en/snippets`)
- Capture form: title, language (select from lowlight's common set + "auto detect"),
  tags (comma separated), code. Saves to `filekit.snippets.v1`.
- List with search (title, tags, code), language filter, tag chips; detail view with
  highlighted code, copy, edit, delete, download with the right extension.
- Export all as JSON; import JSON (merges by id).

### Snippet generator (`/en/snippet-generator`)
- Inputs: description prompt, target language, optional extra context, output style
  (code only / code + short explanation).
- Engine: "Chrome built-in AI (on-device)" when `LanguageModel` is available (shows
  availability / download progress; explains how to enable it otherwise), or a cloud
  provider via `AiSettingsPanel` (key stays in the existing `filekit.ai.v1` preference).
- Response is parsed for the first fenced code block → code + explanation. Shown highlighted
  with copy / download / "Save to snippets" (writes into `filekit.snippets.v1`).
- History (`filekit.generated.v1`, newest first, capped at 200): prompt, language, engine,
  output; search; re-run; delete; export JSON; clear.

## Data shapes

```ts
interface StoredRecord { id: string; createdAt: number; updatedAt: number }
interface Note extends StoredRecord { title: string; body: string; mode: 'plain' | 'markdown' | 'html' }
interface Snippet extends StoredRecord { title: string; language: string; tags: string[]; code: string }
interface GeneratedSnippet extends StoredRecord {
  prompt: string; language: string; engine: 'chrome' | 'openai' | 'anthropic' | 'google';
  model: string; code: string; explanation: string;
}
interface MermaidDiagram extends StoredRecord { name: string; code: string }
```

## CI fixes

- `actions/checkout@v7`, `actions/setup-node@v7`, `actions/cache@v6`,
  `actions/upload-artifact@v7`, `actions/download-artifact@v8` (Node 24 runtimes; removes
  the Node 20 deprecation warnings and makes Dependabot's five open action PRs redundant).
- Dependency review needs the repository's Dependency graph, which is off; the job becomes
  advisory (`continue-on-error`) with a comment pointing at the setting, so it can never
  turn the workflow red on its own while still posting findings when the graph is on.
- Dependabot ignores TypeScript major updates (typescript-eslint 8 supports TS < 7).
- Home/e2e assertions derive the tool count from the catalog instead of hard-coding 9.

## Testing

- Every `src/lib/*` module: unit tests with injected adapters; ≥95% on all four metrics
  (branch margin is currently 0.7 points, so every branch gets a test).
- Every workspace: Testing Library flows with heavy libs mocked at the `src/lib` boundary
  (`vi.mock`), covering empty / working / success / error / cancel states and persistence.
- `api/ai/generate.test.ts` mirrors the summarize tests (method, validation, key, timeout,
  upstream error mapping, empty response, no-store header).
- Playwright: one flow each for diff, notepad, and Markdown (real browser, no mocks).

## Out of scope

Collaboration/sharing links, cloud sync, Excalidraw libraries browser, Mermaid → Excalidraw
conversion, streaming token display for the generator.
