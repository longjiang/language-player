# SPEC-078: Resizable Text|Translation Splitter in the Readers

## Metadata

- **Spec ID**: SPEC-078
- **Feature**: Draggable boundary between the L2 tokenized text and its L1 translation in the web readers, letting the user adjust the column-width distribution
- **Status**: in-progress
- **Created**: 2026-09-06
- **ROADMAP Phase**: Phase 5 (Content Features) — "Reader and Notes"
- **See also**:
  - [SPEC-077 — CSS-Columns Paginated Reader Panel](077-css-columns-paginated-reader.md) — the shared paginated reader panel this splitter lives in
  - [SPEC-051 — Mobile Text Scale Parity](051-mobile-text-scale-parity.md) — the parallel zoom/leading layout semantics this builds on

## 1. Overview

On wide screens (≥ `lg`) the readers render the tokenized L2 text and its L1 translation **side-by-side** in a fixed 3:2 split (`flex-[3]` L2, `flex-[2]` translation). This spec replaces that hard-coded split with a **draggable gutter** between the two columns. The user drags the boundary to give more or less horizontal room to the L2 text or the translation; the chosen ratio is persisted and shared across all three web readers.

## 2. User Stories

- As a reader, I want to widen the L2 text column when I'm focusing on reading and want the translation tucked out of the way.
- As a reader, I want to widen the translation column when I'm following along with the meaning without hurting the L2 text.
- As a reader, I want my preferred split to stick between page turns and across the notes / web-reader / EPUB readers.

## 3. Classic (Nuxt) Reference

No direct Classic precedent — Classic's reading layouts did not expose a draggable column split. This is new behavior on top of the shared web reader panel (SPEC-077).

## 4. How It Works

### 4.1 Persisted setting

A new field on the shared **`DisplaySettings`** (in `@langplayer/shared`):

```ts
translationSplit: number; // 0–1, fraction of the row given to the L2 column
```

- Default `0.6` in `DISPLAY_DEFAULTS`, which reproduces the legacy 3:2 `flex-[3]`/`flex-[2]` split.
- `createSettingsV2()` / `normalizeSettingsV2()` carry it automatically, so older/localStorage/cloud blobs get the default with no migration.
- Persisted through the existing `updateDisplay({ translationSplit })` path (localStorage immediately + debounced cloud sync). Both web and mobile share the type but only web renders the splitter.

### 4.2 The handle

New component `apps/web/src/components/reader/translation-split-handle.tsx`:
- Renders a slim (~16px) vertical gutter at the L2|translation boundary: `cursor-col-resize`, a faint highlight on hover/drag, `touch-none`, `select-none`.
- Sits **only** in the `lg:flex-row` (side-by-side) row — hidden when the columns stack below `lg`.
- On pointer capture, reports ratio deltas anchored to the containing row's measured width, clamped to `[0.3, 0.7]` so neither column can collapse away.
- Reports **on move** (`onChange`) for live feedback and **once on release** (`onCommit`) for persistence.

### 4.3 Layout wiring in `TextActionMenu`

`apps/web/src/components/text-action-menu.tsx` owns the shared side-by-side row. It now accepts optional `translationSplit` / `onTranslationSplitChange` / `onTranslationSplitCommit`:
- When set, the L2/translation columns use `flexBasis: 0` with `flex-grow` ratios `translationSplit` : `1 - translationSplit` (instead of the fixed `flex-[3]`/`flex-[2]`), and the handle renders between them.
- When **not** set (all non-reader callers — review page, settings preview, subtitle display, dictionary examples), behavior is unchanged: fixed 3:2, no handle, `lg:gap-4`.

### 4.4 Live drag vs. commit (perf)

Both reader panels (`ReaderPanel` and `EpubReaderPanel`) keep a **local `liveSplit`** state:
- During a drag, `onChange` updates only `liveSplit` — the row re-splits immediately, but **no settings write and no pagination re-measure**.
- `AlignedTranslation` still tracks the live width change through its existing `ResizeObserver` on the L2 anchor, so translation line-baseline alignment stays in sync while dragging.
- On release, `onCommit` writes `translationSplit` to settings **once**, which bumps the `measureNonce` → a single re-pagination instead of one per pixel.

## 5. Files Changed

- `packages/shared/src/types.ts` — `DisplaySettings.translationSplit` + `DISPLAY_DEFAULTS` default `0.6`.
- `apps/web/src/components/reader/translation-split-handle.tsx` — **new** draggable gutter.
- `apps/web/src/components/text-action-menu.tsx` — optional resizable split + handle render; non-reader callers unaffected.
- `apps/web/src/components/reader/reader-panel.tsx` — notes/web-reader wiring (live split + commit-on-release, `measureNonce` includes committed split).
- `apps/web/src/components/reader/epub-reader-panel.tsx` — EPUB wiring (same live-split + commit pattern; `measureNonce` includes committed split).

## 6. Edge Cases

- **Below `lg`**: columns stack; the handle is `hidden`, and there is nothing to drag — the saved ratio still applies next time the viewport is wide.
- **Translation off**: no translation column renders, so no handle (they're gated on `hasTranslation`).
- **Clamping**: ratio clamps to `[0.3, 0.7]` so the L2 column or translation can never be squeezed to nothing.
- **Measuring mirror**: the pagination mirror (`renderMeasureBlock`) still estimates the translation skeleton at the default split; pagination after a committed split re-measures once via `measureNonce`. The live drag does not re-paginate per pixel.

## 7. Open Questions

- Expose the same splitter anywhere else (e.g. the subtitle display in the video player has its own side-by-side `TextActionMenu`)? Kept out of scope here per the "readers only" decision.
