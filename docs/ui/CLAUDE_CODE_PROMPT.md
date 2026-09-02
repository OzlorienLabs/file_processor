# Prompt for Claude Code

Paste this into Claude Code from the root of `OzlorienLabs/file_processor`, with `design_handoff_filekit_revamp/` copied into the repo (or its path given). Run it in phases — do not accept a single mega-PR.

---

## Prompt

We are revamping FileKit's design and building the features the new design needs. The complete specification is in `docs/ui/README.md`; the HTML prototype it documents is `docs/ui/design/FileKit.dc.html` (serve that folder over HTTP to view it) and the logo marks are in `docs/ui/design/ToolMark.dc.html`.

Read `docs/ui/README.md` in full first, then `CLAUDE.md`, `tasks/spec.md`, `src/app/tool-catalog.ts`, `src/pages/{HomePage,ToolPage,tool-disclosure}.tsx`, `src/app/App.tsx` and `src/styles/global.css` before writing code.

**Ground rules**

- The prototype is a design reference, not code to copy. Implement in the existing stack: Vite + React 19 + TypeScript, native CSS in `src/styles/global.css`, React Router `/en/...` routes. No new UI framework, no CSS-in-JS, no component library. New dependencies need a one-line justification.
- Take every color, font, space, radius and shadow from the Broadsheet token sheet (`design/_ds/broadsheet-*/styles.css`). Port those `:root` custom properties into `global.css` (or import the sheet) and reference them via `var(--*)`. Do not hand-type hexes and do not invent tokens.
- Type is Source Serif 4 throughout — headings and UI chrome alike. Monospace only inside code, diff and markdown editors. No sans-serif.
- Cyan (`--color-accent`) is the interactive color; magenta (`--color-accent-2`) is the rare second spot; the print yellow is for press treatments only. Never both accents inside one small component. Body-size text in cyan uses `--color-accent-700`.
- Keep the privacy contract exactly as it is: local tools make no network request, AI tools disclose before sending, editors persist only to the existing `filekit.*` localStorage keys. Every disclosure string stays visible in the new chrome.
- `tool-catalog.ts` remains the single source of truth. The landing grids, the rail and the tool pages must all be generated from it — never hand-listed.
- Keep the existing engineering gates green: `npm run verify` (lint + typecheck + ≥95% coverage + build) and `npm run test:e2e`. Heavy engines stay in route-level lazy chunks and dynamic imports; nothing new may reach the initial bundle.
- Accessibility is not optional: `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }` on every control, `aria-current` on the active rail item, labelled regions, progress announced to a live region, the skip link preserved, and ≥44px touch targets on touch widths.
- Every animation must be disabled by both the "Reduce motion" setting (`.calm` on `<html>`) and `prefers-reduced-motion: reduce`.

**Build it in these phases, one PR each, with `npm run verify` passing at the end of every phase.**

**Phase 1 — foundations.** Port the Broadsheet tokens into `global.css`. Add the three-layer paper background (flat ground, drifting ink bloom, newsprint dot screen) and the glass utility layer `.g` / `.g2` / `.gi` with the `@supports not (backdrop-filter)` flat fallback plus `-webkit-` prefixes, and the `.flat` / `.calm` escape hatches on `<html>`. Add the motion keyframes and utilities from the spec's motion table. Delete the styles the revamp replaces rather than layering over them.

**Phase 2 — logo system.** Build `src/components/ToolMark/ToolMark.tsx` rendering inline SVG (`width:100%;height:100%`, colors from `var(--color-*)`), with the 17 marks — `brand` plus one per `ToolId` — using the path data from `design/ToolMark.dc.html` verbatim. Emit the same 17 as standalone `public/marks/<tool-id>.svg` with literal hexes, add a `useFavicon(toolId)` hook that swaps `<link rel="icon">` per route (default `brand`), and give each tool an OG image built from its mark. Unit-test that every `ToolId` has a mark and a file.

**Phase 3 — app shell.** Replace the tool page's hero → workspace-card → instructions frame with the shell: `100vh` flex, glass left rail (212px with labels / 62px icons, grouped Files and Create, active item marked by a 3px plate bar, collapse control, forced to icons under 1000px via `matchMedia`) and a glass top bar (tool mark, name, description, the `tool-disclosure` pill, Full screen / Settings / All tools). Workspace fills the remainder and fades in on tool change. Move the per-tool how-to steps into a collapsible panel or the source empty state — they must not push the workspace down. Add the settings store (localStorage, namespaced `filekit.ui.v1`), the settings drawer with its four toggles and the AI-key controls wired to `ai-settings.ts`, and Fullscreen API integration including a `fullscreenchange` listener so the button label stays true after Esc.

**Phase 4 — the nine file tools.** Build one shared stacked-flow layout — a single centred scrolling column, `max-width: 820px`, three glass panels labelled `1 · Source`, `2 · Settings`, `3 · Result` — parameterised from `tool-catalog.ts`. Extend the catalog type with `outputs`, `outputLabel`, `quality`, `qualityHint`, `extra`, `runLabel`, `out`; the exact final copy for all nine tools is in the `CATALOG` array of the prototype's logic — use it verbatim. Implement the source empty state (dashed dropzone with the drifting tool mark, accepted types, size cap), the loaded file card and page-thumbnail preview, the settings controls, and the idle / working / done result states exactly as specified — **with real progress**: thread progress events from each engine and worker into the shared progress component, and make the log lines and the plate-numeral figure (size saved, page count) reflect true values. No simulated percentages.

**Phase 5 — the seven editors, full viewport.** Implement the bespoke layouts for Markdown, Notepad, Diff, Diagram, Mermaid, Snippets and Snippet generator per the spec, including the floating glass chrome. For Diagram, keep Excalidraw as the engine, restyle its chrome to the glass panels, and give the canvas an inset content box that reserves the chrome gutters so content can never sit under a floating panel. Theme Mermaid with the tokens (white / `--color-accent-100` node fills, 1.6px ink or cyan borders, serif labels). Add the responsive rules: hide the snippets tag pane ≤1240px, stack all multi-pane grids ≤860px wide or ≤700px tall with `grid-auto-rows: minmax(300px, auto)`, reflow the diagram chrome to static rows ≤860px.

**Phase 6 — landing page.** Rebuild `/en`: sticky glass header, the two-column hero with the `.cmyk-head` plate headline whose misregistration leans toward the pointer via `--press-nx/--press-ny`, the "Where the work runs" card (counts derived from the catalog, not hard-coded), the two catalog-driven card grids with the lift hover, the three `.cmyk-num` steps, and the footer: brand mark, "FileKit", and the line "Built with curiosity and care by Ozlorien Labs." Remove the emoji-library and source links from the header and footer. Keep the `/en/emojis` route reachable and working — just not linked from the chrome.

**Phase 7 — tests and polish.** Extend the Playwright specs: every tool route opens into the shell and renders its workspace; the rail navigates; the fullscreen toggle and each settings toggle work and persist across reload; the glass-off fallback renders flat panels; the file-tool flow runs drop → progress → download; mobile viewports show the stacked layouts and icon rail. Keep coverage above the existing gates and run `npm run audit` clean.

Report at the end of each phase with what changed, what you deliberately did not do, and anything in the spec that fought the codebase.

---

### Short version (if you want a single-shot prompt)

> Read `design_handoff_filekit_revamp/README.md` and the prototype at `design_handoff_filekit_revamp/design/FileKit.dc.html`, then revamp FileKit to match it in our existing Vite + React 19 + TS + native-CSS stack: Broadsheet tokens ported into `global.css`, a glass surface layer with an `@supports` flat fallback, a registration-mark logo per tool wired up as per-route favicons, an app shell with a persistent left tool rail and top bar, the nine file tools in one shared stacked source/settings/result flow with real engine progress, the seven creation tools in bespoke full-viewport layouts, a settings drawer with a fullscreen default plus a per-tool fullscreen toggle, and a new landing page footed with "Built with curiosity and care by Ozlorien Labs." Preserve the privacy contract, keep `tool-catalog.ts` as the single source of truth, honour `prefers-reduced-motion`, and keep `npm run verify` and `npm run test:e2e` green. Work in the phases listed in the prompt file and stop after each for review.
