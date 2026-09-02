# Handoff: FileKit design revamp (glass shell + Broadsheet ink + per-tool logos)

## Overview

FileKit (`OzlorienLabs/file_processor`, live at `filekit.ozlorienlabs.com/en`) is a Vite + React 19 + TS SPA of 16 client-first file/creation tools. This handoff redesigns it as a product:

- a landing page that leads with the "nothing leaves your browser" promise,
- an **app shell** for tool pages (persistent left tool rail + top bar) replacing today's hero → workspace-card → instructions page,
- **file tools keep the simple stacked flow** they have today (source → settings → result, one narrow centred column),
- **the 7 Creation & Development tools get bespoke full-viewport layouts**,
- a **glassmorphism surface language** with a flat `@supports` fallback,
- a **registration-mark logo system**: one FileKit brand mark plus one mark per tool, drawn to read at 16px so each tool page can serve its own favicon,
- restrained, precise motion throughout,
- a **fullscreen** capability: a global "open tools full screen" setting plus a per-tool toolbar toggle.

## About the design files

`design/FileKit.dc.html` and `design/ToolMark.dc.html` are **design references created in HTML** — a working prototype of look, layout and behaviour. They are **not production code to copy**. Recreate them inside FileKit's existing environment (Vite + React 19 + TypeScript + native CSS in `src/styles/global.css`, React Router `/en/...` routes) using its established patterns: `tool-catalog.ts` as the single source of tool metadata, `features/*Workspace.tsx` per tool, route-level lazy chunks for heavy engines, no new UI dependency unless it earns its place.

To open the prototype: serve the `design/` folder over HTTP (e.g. `npx serve design`) and open `FileKit.dc.html`. It streams a React tree from an inline template; ignore its authoring mechanics entirely — read it for layout, values and behaviour.

## Fidelity

**High fidelity.** Colors, type, spacing, radii, shadows, copy and interaction states are final and come from the bound **Broadsheet** design system (`design/_ds/.../styles.css`, guide in the same folder). Reproduce the values exactly; take every one from the CSS custom properties rather than re-typing hexes.

## Design tokens (from Broadsheet `styles.css` — link or port this file)

Colors
- ground `--color-bg` `#f3f2f2`; surface `#eae9e9`; ink `--color-text` `#201e1d`
- accent (cyan, interactive) `--color-accent` `#0088b0`; ramp `--color-accent-100 #e9f8ff`, `200 #cbeeff`, `300 #99e0ff`, `400 #62c5ee`, `500 #38a6cf`, `600 #1186ac`, `700 #006786`, `800 #004961`, `900 #0a303e`
- accent-2 (magenta, rare second spot) `--color-accent-2` `#d6006c`; ramp `100 #fff1f4` … `600 #d82071`, `700 #aa0b56`, `800 #790e3d`
- neutral ramp `--color-neutral-100 #f8f4f4` … `300 #d7d3d3`, `400 #bab6b6`, `500 #9b9797`, `600 #7d7979`, `700 #605d5d`, `800 #444141`, `900 #2d2b2b`
- print yellow `--color-process-yellow #edbb00` — **press treatments only**, never chrome or body copy
- Body copy in cyan must use `--color-accent-700`+ (the base accent is 3:1, chrome/large text only)

Type — Source Serif 4 for everything (`--font-heading` / `--font-body`, heading weight 600). No sans-serif anywhere; the serif is the chrome. Monospace only inside code/diff/markdown editors (`ui-monospace, Menlo, monospace`).

Type sizes used: hero `clamp(46px,7.6vw,108px)/0.94, -0.03em`; section h2 `clamp(30px,3.4vw,46px), -0.025em`; card title 20px; body 15–17px; lede `clamp(18px,1.5vw,22px)/1.5`; eyebrow 11.5–13px uppercase `letter-spacing .14em`; panel label 11.5px uppercase; monospace 13.5–14.5px/1.75–1.8.

Spacing `--space-1..8` = 5 / 10 / 15 / 20 / 30 / 40px. Radii `--radius-sm 1px`, `md 2px`, `lg 4px` — glass panels use `lg`; pills `999px`. Shadows `--shadow-sm/md/lg` only.

## The glass system (implement once, as utilities)

Three surface levels, all over the paper ground:

```css
.g  { background: rgba(255,255,255,.52); backdrop-filter: blur(22px) saturate(1.7);
      border: 1px solid rgba(255,255,255,.72); box-shadow: var(--shadow-md); }   /* panels, cards */
.g2 { background: rgba(250,248,248,.62); backdrop-filter: blur(30px) saturate(1.5);
      border: 1px solid rgba(255,255,255,.6);  box-shadow: var(--shadow-sm); }   /* rail, top bar */
.gi { background: rgba(255,255,255,.34); backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,.55); }                                 /* pills, insets, segmented tracks */

@supports not ((backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px))) {
  .g, .g2, .gi { background: #faf9f9; border-color: var(--color-neutral-300); }
}
```
Always ship the `-webkit-` prefix too. A `.flat` class on `<html>` applies the same fallback on demand (the Settings "Glass surfaces" toggle), and `.calm` disables all animation (the "Reduce motion" toggle) alongside the `prefers-reduced-motion` media query.

Behind everything, three fixed layers (z-index 0, `pointer-events:none`):
1. flat `#f3f2f2`;
2. ink bloom — `radial-gradient(38% 40% at 18% 12%, rgba(0,136,176,.24), transparent 70%)`, `radial-gradient(34% 36% at 82% 8%, rgba(214,0,108,.16), transparent 72%)`, `radial-gradient(46% 44% at 68% 88%, rgba(237,187,0,.14), transparent 70%)`, animated `drift` 26s;
3. newsprint dot screen — `radial-gradient(rgba(32,30,29,.16) .6px, transparent .7px)`, `background-size:5px 5px`, `opacity:.5`.

## The logo system (`design/ToolMark.dc.html`)

Press **registration-mark** motif: rings, crosshairs, plates and targets, stroke 1.7 on a 24×24 grid, cyan primary + one magenta element carrying a deliberate misregistration offset, ink for the crosshair. 17 marks: `brand` plus one per tool id.

- Brand: a sheet with a cut corner, a magenta plate repeat offset by `translate(1.1, 0.85)`, and an ink crosshair-in-circle at the centre.
- Per tool, one distinguishing figure inside the same furniture — e.g. convert = two opposed arrows in a ring; merge = two overlapping circles (one cyan, one magenta); diff = two misregistered squares; snippets = brackets round a registration dot; generator = target plus a magenta star target.

Deliverables in the codebase:
1. `src/components/ToolMark/ToolMark.tsx` — `<ToolMark tool={ToolId | 'brand'} />`, rendering inline SVG at `width:100%;height:100%` (the parent sizes it), colors from `var(--color-*)` so it follows the theme. Copy the path data verbatim from the prototype.
2. `public/marks/<tool-id>.svg` — the same 17 marks as standalone files with literal hex colors, for favicons.
3. Per-route favicon: on each tool route set `<link rel="icon" href="/marks/<id>.svg">` (a small `useFavicon(id)` hook, defaulting to `/marks/brand.svg`), and give each tool an OG image slot using the same mark.

## Screens / views

### 1. Landing (`/en`)

Sticky glass header (`.g2`, bottom border only, `padding: 12px clamp(16px,4vw,56px)`): 26px brand mark + "FileKit" 19px; nav links "All tools / Editors / How it works" 15px; right-aligned solid cyan CTA "Open the workspace" (`--color-accent-700`, hover `-800`, radius `lg`, 9px 16px).

Hero (`padding: clamp(40px,7vw,104px) clamp(16px,4vw,56px) clamp(32px,5vw,72px)`, `max-width:1560px`), 2-column grid `minmax(0,1.35fr) minmax(280px,.65fr)`, `align-items:end`, gap `clamp(24px,4vw,64px)`, collapsing to one column ≤1100px:
- eyebrow "No accounts · No uploads · Nothing left behind" (cyan-700, uppercase, `.14em`);
- H1 two lines: "Files in." in plain ink, then **"Result out." in the Broadsheet `.cmyk-head` plate treatment** — the paper text plus three aria-hidden cyan/magenta/yellow plate repeats. The plate offsets read `--press-nx/--press-ny` (-1…1), which a `pointermove` listener sets from the cursor position within the headline, so the misregistration leans toward the pointer. Disable when reduced motion is on.
- lede (max 52ch, `text-wrap: pretty`), then two CTAs: solid cyan "Start with a file" and a glass "See all 16 tools".
- Right: glass card "Where the work runs" with three dotted rows (cyan / magenta / yellow dots): **13 tools never leave the tab**; **3 AI tools ask first** then use your provider key; **editors save to this browser only**. Keep these counts in sync with `tool-catalog.ts`.

Two tool sections — "File operations / Pick the job, not the app" and "Creation & development / Editors that take the whole screen" — each a `repeat(auto-fill, minmax(268px,1fr))` grid of glass cards: 34px mark, 20px serif title, 15px description, uppercase footer line with the processing disclosure, and an arrow glyph top-right (cyan for file tools, magenta for editors). Card hover: `translateY(-3px)`, `--shadow-lg`, background to `rgba(255,255,255,.72)`, 320ms `cubic-bezier(.16,.84,.28,1)`. Cards come from `tool-catalog.ts` — never hand-listed.

"A short path to done / Three steps, then it is yours": 3 glass rows, each numbered with the Broadsheet `.cmyk-num` plate numeral at 44px — Choose / Adjust / Download.

Footer: brand mark + "FileKit", and the standard line **"Built with curiosity and care by Ozlorien Labs."** No emoji-library or source links.

### 2. App shell (every tool route)

`height:100vh; display:flex; overflow:hidden`.

- **Left rail** (`.g2`, right border only, `padding:12px 10px`, scrolls): brand button → home; group label "Files" (9 tools) then "Create" (7); each item = 22px mark + 14.5px name, hover `rgba(255,255,255,.62)`, active state = a 3px left plate bar (cyan for file tools, magenta for editors — never a filled row); footer button collapses the rail. Width **212px** with labels, **62px** icons-only. `matchMedia('(max-width: 1000px)')` forces icons-only regardless of the setting.
- **Top bar** (`.g2`, bottom border only, `padding:10px clamp(12px,2vw,20px)`): 26px tool mark, tool name 19px + description 12.5px (both single-line, ellipsised), a `.gi` pill with a cyan dot showing where the work runs, then right-aligned `Full screen` / `Settings` / `All tools` glass buttons (`white-space: nowrap` under 1100px).
- **Workspace** fills the rest: `padding: clamp(10px,1.4vw,18px)`, and fades in (`opacity 0→1`, 500ms) keyed on the tool id — the route transition.

### 3. File tools — the simple stacked flow (9 tools: convert, compress, summarize, merge, ocr, audio-to-text, split, word-to-pdf, pdf-to-word)

One scrolling centred column, `max-width:820px; margin:0 auto`, gap `clamp(10px,1.2vw,16px)`, three glass panels stacked with uppercase step labels:

1. **1 · Source** (`min-height:300px`) — empty state is a full-panel dashed dropzone (`1.5px dashed --color-neutral-400`, hover border cyan + `rgba(233,248,255,.5)`) holding the tool's own mark at 74px, slowly drifting, plus "Drop a file, or click to choose", the accepted-types line and the size cap from the catalog. Once a file is present: a `.gi` file card (mark, name, meta, Remove) that fades up, and a page-thumbnail preview grid (`repeat(auto-fill,minmax(96px,1fr))`, aspect 0.72, white paper cards with grey text bars and a `p. N` label).
2. **2 · Settings** — per-tool output choice as a radio list (custom 13px ring, cyan dot, hover border cyan + `rgba(233,248,255,.6)`, a right-aligned note per option), a range slider (`accent-color: var(--color-accent)`) with a live percentage in cyan-700 plus a hint line, one checkbox extra, and the primary run button. Options/labels/hints are per tool — see the `CATALOG` array in the prototype logic for the exact copy of all nine.
3. **3 · Result** — three states:
   - *idle*: a slowly rotating crosshair-in-circle (5.5s linear) and "Nothing yet. The result appears here and downloads straight to your device."
   - *working*: stage label ("Reading the file" <34%, "<Run verb>…" <72%, "Writing the result") + percentage; an 8px progress track, fill `linear-gradient(90deg, --color-accent-600, --color-accent-400)` transitioning `width .3s linear`, with a 28%-wide white gradient sweep looping 1.5s; a 3-line checklist that ticks as the percentage passes 40% and 80% ("Loaded into memory in this tab", "Worker started — no network request", "Assembling the output"); and the line "Running on this device. Closing the tab cancels it and keeps nothing."
   - *done*: a `.cmyk-num` plate figure (e.g. `68%` for compress, `14` for split, else `✓`) beside the result title and meta; a paper-sheet preview with a magenta `DONE` stamp that scales in (`cubic-bezier(.2,1.5,.4,1)`, 500ms, rotated -6°); then "Download <output>" (solid cyan) and "Start over".

   Wire these to the real feature modules: progress from the actual worker/engine, the log lines to real milestones, `savedFigure` to the true size delta or page count. Never fake progress.

### 4. Creation & Development tools — full-viewport layouts

All seven fill the workspace edge to edge; every floating control is glass; nothing sits in a page-width card.

- **Markdown previewer** — toolbar row (format buttons, live word/line count, "Draft saved here" pill), then a 1fr/1fr split: monospace editor left, rendered preview right on `rgba(255,255,255,.42)` with 26–30px padding. Keep the existing remark/rehype pipeline for the render (the prototype's mini-parser is a stand-in).
- **Notepad** — `minmax(200px,250px) / 1fr`: note list (New note, "In this browser" label, active note marked by a 3px magenta bar, Export all as ZIP pinned to the bottom) and the editor: title input set in the serif at 20px, a `.gi` segmented Plain / Markdown / HTML control (active option = white chip with `--shadow-sm`), "Saved locally", then a wide-measure body area (`padding: 30px clamp(24px,6vw,90px)`, 17px/1.68).
- **Diff checker** — toolbar with a segmented Side-by-side / Unified, a "3 added · 2 removed" summary (cyan-700 / magenta-700), and Download .patch; then two monospace panes with gutter line numbers, removed lines tinted `rgba(255,222,230,.75)` and added lines `rgba(203,238,255,.8)`, each with a `-6px 0 0` box-shadow so the tint bleeds into the gutter.
- **Diagram creator** — full-bleed canvas: `rgba(255,255,255,.34)` + 22px dot grid, glass tool rail floating left-centre (7 × 38px buttons; active = `--color-accent-100` fill + cyan border), glass "Selection" panel top-right (stroke/fill swatches, width slider, edges), glass zoom cluster bottom-right, and a `.gi` status pill bottom-centre ("Saved to this browser · PNG · SVG · .excalidraw"). **Canvas content lives in an inset content box that reserves the chrome gutters** (`left:72px; right:250px; top:16px; bottom:72px`) so shapes can never slide under a floating panel; under 860px the chrome reflows to static rows and the inset changes to `16px / 150px top`. Keep Excalidraw as the engine; restyle its chrome to these panels.
- **Mermaid editor** — `minmax(280px,400px) / 1fr`: source pane (Samples button, monospace textarea, a blinking cyan dot + "Live render · saved in this browser") and the render canvas with a floating Fit / SVG / PNG cluster. Theme Mermaid itself with the tokens: white or `--color-accent-100` node fills, 1.6px ink or cyan borders, serif labels.
- **Code snippets** — three panes `minmax(170px,210px) / minmax(220px,300px) / 1fr`: tag chips (active = `--color-accent-100` + cyan border, pill), search + snippet list (active = 3px cyan bar), and the code view with title, language pill, Copy / Download, and gutter-numbered highlighted code. Below 1240px the tag pane hides; below 860px the panes stack.
- **Snippet generator** — `minmax(280px,380px) / 1fr`: prompt textarea, a radio pair "Chrome built-in AI (on this device, no key, no network)" / "Your provider key (OpenAI, Anthropic, or Gemini)", the Generate button, and a Recent list; right pane holds the result with "Save to snippets", a cyan spinner + "Generating on device…" while busy, and the gutter-numbered code fading in when ready.

### 5. Settings drawer + fullscreen

Right-hand glass drawer (`min(400px,92vw)`, full height, left border only) over `rgba(32,30,29,.22)`, fading up on open, closing on backdrop click:
- **Open tools full screen** — persisted; when on, opening a tool calls `requestFullscreen()`.
- **Show tool names in the rail** — 212px ↔ 62px.
- **Glass surfaces** — off adds `.flat` to `<html>` (the same fallback older browsers get).
- **Reduce motion** — off/on adds `.calm`; also honour `prefers-reduced-motion`.
- **AI provider key** field + magenta-outlined "Forget key on this device" (wire to the existing `ai-settings.ts`).
- Footnote: "Settings live in this browser's local storage. Clearing site data resets them."

The top bar's Full screen button toggles the Fullscreen API and relabels to "Exit full screen"; listen for `fullscreenchange` so the label stays true when the user presses Esc. Persist settings under a namespaced key (e.g. `filekit.ui.v1`) alongside the existing `filekit.*` keys.

## Interactions & motion (restrained and precise)

| Motion | Spec |
|---|---|
| Entrance | `fu`: opacity 0→1 + `translateY(14px)`, 620ms `cubic-bezier(.16,.84,.28,1)`, staggered 70/140/210/280ms |
| Route/tool change | `fi`: opacity 0→1, 500ms, keyed on tool id |
| Card hover | `translateY(-3px)` + `--shadow-lg`, 320ms |
| Control press | `translateY(1px)`, 120ms; background/border 160ms |
| Background bloom | `drift` 26s ease-in-out infinite, ±3% translate |
| Hero plates | pointer-driven `--press-nx/--press-ny`, no transition (it tracks) |
| Progress sweep | 1.5s `cubic-bezier(.5,0,.5,1)` infinite |
| Idle crosshair | `spin` 5.5s linear infinite |
| Success stamp | `stamp` 500ms `cubic-bezier(.2,1.5,.4,1)` |
| Live indicator | `blink` 1.1s `steps(1,end)` |

All of the above are disabled by `.calm` and by `prefers-reduced-motion: reduce`.

## Responsive behaviour

- ≤1240px: snippets tag pane hides.
- ≤1100px: landing hero and "how it works" grids collapse to one column; top-bar buttons stop wrapping.
- ≤1000px (JS `matchMedia`): rail forced to icons-only.
- ≤860px: markdown/notepad/diff/mermaid/snippets/generator grids stack to one scrolling column with `grid-auto-rows: minmax(300px,auto)`; diagram chrome reflows to static rows.
- ≤700px height: the same stacking for short landscape windows.
- The file-tool column is already single-column and just narrows.
- Touch targets: keep every control ≥44px on touch widths (the 38px diagram buttons need padding on mobile).

## State

`route` (from React Router, not local state) · `pipe: 'idle' | 'ready' | 'working' | 'done'` + `pct` per file tool · `output` index, `quality`, one boolean extra · UI settings (`railLabels`, `fullscreenDefault`, `glassOn`, `calmMotion`) persisted to localStorage · `narrow` from `matchMedia` · editor state as it exists today (`filekit.*` keys) · `genState: 'ready' | 'busy'` for the generator.

## Features to build to support the design

1. App-shell route layout (rail + top bar) replacing the hero/instructions page frame; keep the processing-disclosure copy from `tool-disclosure.ts` in the top-bar pill, and move the per-tool how-to steps into a collapsible "Quick instructions" panel or the empty state — they must not push the workspace down.
2. `ToolMark` component + `public/marks/*.svg` + per-route favicon hook + OG images.
3. Glass utility layer with the `@supports` fallback, `.flat` and `.calm` switches, and the three-layer background.
4. Settings store (localStorage) + drawer + Fullscreen API integration with `fullscreenchange` handling.
5. Real progress reporting from every engine (worker `postMessage` progress → the shared progress component) so the pipeline states are honest.
6. Stacked-flow layout component shared by the nine file tools, parameterised from `tool-catalog.ts` (add `outputs`, `outputLabel`, `quality`, `qualityHint`, `extra`, `runLabel`, `out` fields — the prototype's `CATALOG` has final copy for all nine).
7. Full-viewport layouts for the 7 editors, including restyling Excalidraw and Mermaid to the tokens.
8. Accessibility pass: `:focus-visible` 2px cyan outline (offset 2px) on every control, `aria-current` on the active rail item, labelled panels, live-region progress announcements, and the skip link preserved.

## Assets

No photography. All iconography is the 17 registration marks (inline SVG, in this bundle). Broadsheet's `print-plates.js` (inlined in `_ds_bundle.js`) provides the separation filters used by `.cmyk`; the hero uses only `.cmyk-head` / `.cmyk-num`, which are pure CSS. Lucide icons currently in the app can stay for incidental UI or be replaced with Phosphor duotone per the Broadsheet guide — but tool identity must come from the marks.

## Files in this bundle

- `design/FileKit.dc.html` — the full prototype: landing, app shell, all 16 tool layouts, settings drawer, motion.
- `design/ToolMark.dc.html` — the 17 registration marks (source of the SVG path data).
- `design/support.js` — runtime for the prototype only; do not port.
- `design/_ds/broadsheet-.../styles.css` — the design-system token sheet and component classes (the authority for every value above).
- `design/_ds/broadsheet-.../_ds_bundle.js`, `readme.md` — design-system bundle and written guide.
- `CLAUDE_CODE_PROMPT.md` — a ready-to-paste prompt for implementing this in the repo.
