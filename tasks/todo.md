# FileKit task checklist

## Task 1: Scaffold the verified foundation

**Acceptance criteria:**
- [ ] React/Vite/TypeScript app, lint, Vitest coverage, Playwright, Vercel, and git-ignore configuration exist.
- [ ] Coverage thresholds are 91% for statements, branches, functions, and lines.
- [ ] Security headers and SPA rewrites are configured.

**Verification:** `npm run lint && npm run typecheck && npm run test:coverage && npm run build`

**Dependencies:** None

**Files likely touched:** configuration and entry files (split into focused commits)

## Task 2: Build the home and navigation slice

**Acceptance criteria:**
- [ ] `/en` presents every requested tool, privacy statement, supported-format overview, and three-step use flow.
- [ ] Routes are keyboard accessible, responsive, and visually original.
- [ ] Heavy file engines are not in the initial route chunk.

**Verification:** focused component/integration tests, build chunk review, browser at 320/1440 px

**Dependencies:** Task 1

**Files likely touched:** app shell, router, tool catalog, home component, global CSS

## Task 3: Build shared file-workspace primitives

**Acceptance criteria:**
- [ ] Validated drop zone/file list/task progress/result/download states are reusable across tools.
- [ ] Keyboard, error, cancellation, object-URL cleanup, and live announcements are tested.
- [ ] File policy errors explain accepted formats and limits.

**Verification:** unit and component tests

**Dependencies:** Task 1

**Files likely touched:** shared component and lib modules with colocated tests

## Task 4: Complete merge PDF

**Acceptance criteria:**
- [ ] PDFs/images can be ordered, merged locally, renamed, and downloaded.
- [ ] Invalid/encrypted/oversized inputs produce safe errors.
- [ ] Three concise usage steps are present.

**Verification:** processor unit tests plus upload-to-download integration test

**Dependencies:** Tasks 2-3

**Files likely touched:** merge feature and PDF primitive modules

## Task 5: Complete split PDF

**Acceptance criteria:**
- [ ] Every-page, range, and selected-page modes work locally.
- [ ] Range syntax is validated without duplicate/out-of-range pages.
- [ ] Single output downloads as PDF and multiple outputs as ZIP.

**Verification:** parser/processor tests plus integration flow

**Dependencies:** Tasks 3-4

**Files likely touched:** split feature and range utility modules

## Task 6: Complete compression

**Acceptance criteria:**
- [ ] Images and PDFs compress locally at selectable quality.
- [ ] Before/after sizes and savings are reported.
- [ ] PDF rasterization tradeoff is acknowledged before processing.

**Verification:** deterministic image/PDF tests and component flow

**Dependencies:** Tasks 3-4

**Files likely touched:** compression feature and image/PDF helpers

## Task 7: Complete document conversions

**Acceptance criteria:**
- [ ] DOCX-to-PDF and PDF-to-DOCX routes create downloadable outputs.
- [ ] Fidelity limitations and accepted formats are visible.
- [ ] Representative text, paragraph, and multi-page fixtures pass.

**Verification:** processor and integration tests

**Dependencies:** Tasks 3-4

**Files likely touched:** Word/PDF conversion features and text extraction helper

## Task 8: Complete the general converter

**Acceptance criteria:**
- [ ] Supported mappings resolve from detected input and impossible pairs are disabled with explanation.
- [ ] Image, PDF/image, PDF/TXT, TXT/PDF, DOCX/PDF, and audio/WAV paths download correctly.
- [ ] The route lists only real supported formats.

**Verification:** mapping unit tests and one integration test per conversion family

**Dependencies:** Tasks 3, 6-7

**Files likely touched:** convert feature, mapping resolver, audio/image helpers

## Task 9: Complete OCR

**Acceptance criteria:**
- [ ] Images and rendered PDF pages are recognized client-side with progress/cancel.
- [ ] Text can be edited, copied, and downloaded.
- [ ] Workers/canvases are cleaned up after success, error, or cancellation.

**Verification:** mocked-worker unit/integration tests and a tiny real OCR browser fixture

**Dependencies:** Tasks 3-4

**Files likely touched:** OCR feature, worker adapter, PDF render helper

## Task 10: Complete summarization

**Acceptance criteria:**
- [ ] PDF/DOCX/TXT/MD text extracts and chunks locally.
- [ ] Model/detail settings, masked key, opt-in persistence, clear action, and privacy boundary work.
- [ ] Summary is copyable/downloadable and provider errors are actionable.

**Verification:** chunk/settings/component tests plus mocked API integration

**Dependencies:** Tasks 3 and 7

**Files likely touched:** summarize feature, settings/text helpers, one API function and tests

## Task 11: Complete audio transcription

**Acceptance criteria:**
- [ ] Supported audio decodes/chunks locally and transcribes sequentially.
- [ ] Progress, cancel, language/model options, copy, and TXT download work.
- [ ] Every function chunk stays below the Vercel payload boundary.

**Verification:** audio/chunk unit tests, API tests, and mocked integration flow

**Dependencies:** Tasks 3 and 10

**Files likely touched:** audio feature, chunk encoder, one API function and tests

## Task 12: Add the complete emoji explorer

**Acceptance criteria:**
- [ ] Generator consumes Unicode 17.0 `emoji-test.txt` and produces every fully-qualified sequence.
- [ ] Lazy explorer supports search, category filters, count, and click-to-copy.
- [ ] Emoji data is not part of the home initial JavaScript chunk.

**Verification:** generator/data integrity test, UI integration, bundle review

**Dependencies:** Tasks 1-2

**Files likely touched:** generator, generated JSON, explorer component and tests

## Task 13: Final quality and deployment gate

**Acceptance criteria:**
- [ ] Every requested route has the shared focused flow and three-step instructions.
- [ ] All four coverage metrics exceed 90%, all automated checks pass, and no tests are skipped.
- [ ] Browser console/network/a11y/performance and 320/768/1024/1440 layouts are clean.

**Verification:** `npm run verify && npm run test:e2e && npm audit --audit-level=high`

**Dependencies:** Tasks 1-12

**Files likely touched:** tests, README, final scoped fixes
