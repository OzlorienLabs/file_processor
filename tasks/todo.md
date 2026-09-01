# FileKit task checklist

## Task 1: Scaffold the verified foundation

**Acceptance criteria:**
- [x] React/Vite/TypeScript app, lint, Vitest coverage, Playwright, Vercel, and git-ignore configuration exist.
- [x] Coverage thresholds are 91% for statements, branches, functions, and lines.
- [x] Security headers and SPA rewrites are configured.

**Verification:** `npm run lint && npm run typecheck && npm run test:coverage && npm run build`

**Dependencies:** None

**Files likely touched:** configuration and entry files (split into focused commits)

## Task 2: Build the home and navigation slice

**Acceptance criteria:**
- [x] `/en` presents every requested tool, privacy statement, supported-format overview, and three-step use flow.
- [x] Routes are keyboard accessible, responsive, and visually original.
- [x] Heavy file engines are not in the initial route chunk.

**Verification:** focused component/integration tests, build chunk review, browser at 320/1440 px

**Dependencies:** Task 1

**Files likely touched:** app shell, router, tool catalog, home component, global CSS

## Task 3: Build shared file-workspace primitives

**Acceptance criteria:**
- [x] Validated drop zone/file list/task progress/result/download states are reusable across tools.
- [x] Keyboard, error, cancellation, object-URL cleanup, and live announcements are tested.
- [x] File policy errors explain accepted formats and limits.

**Verification:** unit and component tests

**Dependencies:** Task 1

**Files likely touched:** shared component and lib modules with colocated tests

## Task 4: Complete merge PDF

**Acceptance criteria:**
- [x] PDFs/images can be ordered, merged locally, renamed, and downloaded.
- [x] Invalid/encrypted/oversized inputs produce safe errors.
- [x] Three concise usage steps are present.

**Verification:** processor unit tests plus upload-to-download integration test

**Dependencies:** Tasks 2-3

**Files likely touched:** merge feature and PDF primitive modules

## Task 5: Complete split PDF

**Acceptance criteria:**
- [x] Every-page, range, and selected-page modes work locally.
- [x] Range syntax is validated without duplicate/out-of-range pages.
- [x] Single output downloads as PDF and multiple outputs as ZIP.

**Verification:** parser/processor tests plus integration flow

**Dependencies:** Tasks 3-4

**Files likely touched:** split feature and range utility modules

## Task 6: Complete compression

**Acceptance criteria:**
- [x] Images and PDFs compress locally at selectable quality.
- [x] Before/after sizes and savings are reported.
- [x] PDF rasterization tradeoff is acknowledged before processing.

**Verification:** deterministic image/PDF tests and component flow

**Dependencies:** Tasks 3-4

**Files likely touched:** compression feature and image/PDF helpers

## Task 7: Complete document conversions

**Acceptance criteria:**
- [x] DOCX-to-PDF and PDF-to-DOCX routes create downloadable outputs.
- [x] Fidelity limitations and accepted formats are visible.
- [x] Representative text, paragraph, and multi-page fixtures pass.

**Verification:** processor and integration tests

**Dependencies:** Tasks 3-4

**Files likely touched:** Word/PDF conversion features and text extraction helper

## Task 8: Complete the general converter

**Acceptance criteria:**
- [x] Supported mappings resolve from detected input and impossible pairs are disabled with explanation.
- [x] Image, PDF/image, PDF/TXT, TXT/PDF, DOCX/PDF, and audio/WAV paths download correctly.
- [x] The route lists only real supported formats.

**Verification:** mapping unit tests and one integration test per conversion family

**Dependencies:** Tasks 3, 6-7

**Files likely touched:** convert feature, mapping resolver, audio/image helpers

## Task 9: Complete OCR

**Acceptance criteria:**
- [x] Images and rendered PDF pages are recognized client-side with progress/cancel.
- [x] Text can be edited, copied, and downloaded.
- [x] Workers/canvases are cleaned up after success, error, or cancellation.

**Verification:** mocked-worker unit/integration tests and a tiny real OCR browser fixture

**Dependencies:** Tasks 3-4

**Files likely touched:** OCR feature, worker adapter, PDF render helper

## Task 10: Complete summarization

**Acceptance criteria:**
- [x] PDF/DOCX/TXT/MD text extracts and chunks locally.
- [x] Model/detail settings, masked key, opt-in persistence, clear action, and privacy boundary work.
- [x] Summary is copyable/downloadable and provider errors are actionable.

**Verification:** chunk/settings/component tests plus mocked API integration

**Dependencies:** Tasks 3 and 7

**Files likely touched:** summarize feature, settings/text helpers, one API function and tests

## Task 11: Complete audio transcription

**Acceptance criteria:**
- [x] Supported audio decodes/chunks locally and transcribes sequentially.
- [x] Progress, cancel, language/model options, copy, and TXT download work.
- [x] Every function chunk stays below the Vercel payload boundary.

**Verification:** audio/chunk unit tests, API tests, and mocked integration flow

**Dependencies:** Tasks 3 and 10

**Files likely touched:** audio feature, chunk encoder, one API function and tests

## Task 12: Add the complete emoji explorer

**Acceptance criteria:**
- [x] Generator consumes Unicode 17.0 `emoji-test.txt` and produces every fully-qualified sequence.
- [x] Lazy explorer supports search, category filters, count, and click-to-copy.
- [x] Emoji data is not part of the home initial JavaScript chunk.

**Verification:** generator/data integrity test, UI integration, bundle review

**Dependencies:** Tasks 1-2

**Files likely touched:** generator, generated JSON, explorer component and tests

## Task 13: Final quality and deployment gate

**Acceptance criteria:**
- [x] Every requested route has the shared focused flow and three-step instructions.
- [x] All four coverage metrics exceed 90%, all automated checks pass, and no tests are skipped.
- [x] Browser console/network/a11y/performance and 320/768/1024/1440 layouts are clean.

**Verification:** `npm run verify && npm run test:e2e && npm audit --audit-level=high`

**Dependencies:** Tasks 1-12

**Files likely touched:** tests, README, final scoped fixes
