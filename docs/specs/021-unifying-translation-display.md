# SPEC-021: Unifying Translation Display

## Metadata
- **Spec ID**: SPEC-021
- **Feature**: Consistent translation loading and display across reader, video, review, and per-block actions
- **Status**: draft
- **Created**: 2026-07-27
- **ROADMAP Phase**: Cross-cutting — spans reader (Phase 3), video (Phase 4), review (Phase 1)
- **Depends on**: Phase 3 (Reader Experience — TextActionMenu ✅), Phase 4 (Video Player ✅)
- **See also**:
  - [SPEC-006: Translation](./006-translation.md) — the base translation spec (endpoints, caching, what is/isn't translated)
  - [STATUS.md](../../apps/mobile/STATUS.md) — web-reader notes "Still missing: page translation"
  - [SPEC-009: Reader Layout](./009-reader-layout.md)

---

## Overview

Translation display currently has **four distinct patterns** across the web app, each with different loading states, error handling, and rendering styles. The mobile app has only partially ported these (per-block "Translate" action only). This spec documents the current state, identifies inconsistencies, and proposes a unified approach that works for both web and mobile.

---

## Current State: Four Translation Display Patterns

### Pattern 1: Page-Level Bulk Translation — Reader Panel

**Files**: `apps/web/src/components/reader/reader-panel.tsx`, `TextActionMenu` (web)

**Trigger**: Toggle switch labeled "Translation" in the page navigation bar. Controlled by `display.translation` setting. Auto-translates all text blocks on the current page when the toggle is on AND the page changes.

**Data flow**:
```
display.translation = true
  → ReaderPanel detects page change (useEffect)
  → Calls onPageTranslate(texts[]) with all TextBlock texts on the page
  → Each page wires onPageTranslate → POST /translate_array { texts[], l1, l2 }
  → Response: { translated_texts: string[] }
  → Stored in blockTranslations[i] map (per-page, cleared on page change)
  → Passed to TextActionMenu via translation={blockTranslations[i]}
```

**API**: `POST /translate_array` (bulk, server-side). Used by all three reader pages (notes, EPUB, web-reader) with identical `onPageTranslate` implementations.

**Loading state**: Skeleton bars animated with `animate-pulse`. Number of skeleton lines = `Math.ceil(text.length / 50)`. Rendered in `TextActionMenu` when `loading={true} && !translation`.

**Rendering**: Side-by-side column layout on `xl:` screens (content flex-[3], translation flex-[2]); stacked vertically on narrow screens. Translation text is muted (`text-muted-foreground`), with per-block styling via `translationClass(tb)`:

| Block type | Translation styling |
|---|---|
| heading (h1) | `text-lg font-semibold leading-relaxed` |
| heading (h2) | `text-base font-semibold leading-relaxed` |
| heading (h3) | `text-sm font-semibold leading-relaxed` |
| blockquote | `leading-relaxed border-l-4 border-muted/40 pl-4 italic` |
| paragraph / list-item | `leading-relaxed text-sm` |

**Error state**: None. `onPageTranslate` catches errors silently (returns `[]`), so blocks simply show no translation.

**Mobile status**: ❌ Not ported. The mobile `TextActionMenu` does not accept `translation`, `loading`, or `translationClass` props. The mobile web-reader STATUS.md entry explicitly notes "Still missing: page translation."

---

### Pattern 2: Subtitle Translation — Video Player

**Files**: `apps/web/src/components/video/subtitle-display.tsx`, `subtitles-mode-band.tsx`, `apps/web/src/hooks/use-subtitle-translation.ts`

**Trigger**: Same `display.translation` setting. Automatically translates subtitle lines in chunks as the playhead moves.

**Data flow**:
```
display.translation = true
  → useSubtitleTranslation(l2Lines, l1, l2, enabled, activeIndex)
  → Translates chunks of 5 lines at a time
  → Only lines within ±LOOKAHEAD_CHUNKS (3) of the playhead are translated
  → Calls POST /translate_array { texts: chunk[], l1, l2 }
  → Uses AbortController for cancellation on video change / retry
  → resultRef.current stores sparse array (untranslated = undefined)
  → syncLines() merges translated lines with L2 lines
```

**API**: `POST /translate_array` (same endpoint as Pattern 1, but called iteratively in chunks).

**Loading state**: Video control bar shows inline progress text (e.g. "Translating 5/120"). No inline skeleton per line — untranslated lines simply show no L1 text.

**Rendering**: Plain `<p>` below each subtitle line:
```tsx
{showTranslation && line.l1Line && (
  <p className="mt-0.5 text-xs text-muted-foreground/60">{line.l1Line}</p>
)}
```
No per-line styling variation (all subtitle lines are plain text). Active line gets `text-muted-foreground` (full opacity); inactive lines get `text-muted-foreground/60`.

**Error state**: Red banner above the subtitle list with error message + "Retry" button. Translation loop stops on first error to avoid hammering the server.

**Singleline mode**: Translation is never shown (`showTranslation = isSingleline ? false : display.translation`) because singleline mode is used by subs-search where lines come from search results, not the full subtitle track.

**Mobile status**: ✅ Ported (video player + subtitle display are working).

---

### Pattern 3: Context Translation — SRS Review

**Files**: `apps/web/src/app/[l1]/[l2]/review/page.tsx`

**Trigger**: Same `display.translation` setting. Shows translation of the context sentence where the word was saved.

**Data flow**:
```
wordCtx.translation          ← pre-fetched from saved word record
contextTranslation           ← on-the-fly translated when word was saved (fallback)
```

**API**: None at review time. Translation was already fetched when the word was saved or when the review card was loaded.

**Loading state**: None. Translation is either available or not. No skeleton or spinner.

**Rendering**: Italic `<p>` below the context sentence, separated by a border:
```tsx
{showDefinition && display.translation && (wordCtx.translation || contextTranslation) && (
  <p className="text-sm mt-2 italic text-muted-foreground border-t border-border pt-2">
    {wordCtx.translation || contextTranslation}
  </p>
)}
```

**Error state**: None. Missing translation is silently absent.

**Mobile status**: ✅ Ported (review screen shows context translation).

**Same-language pairs (L1 == L2)**: When the learner's L1 equals the L2 (base
subtag, so `zh`/`zh-Hans`/`zh-Hant` are equivalent) in SRS **spell mode**, the
review context-translation slot shows a **contextual rephrasing of the target
word** rather than a sentence translation — the client sends
`rephrase_term: true` to `POST /translate` and the server rephrases the term's
meaning without repeating it, so the blanked word never appears. See
[SPEC-066 — Spell mode](../specs/066-srs-review-page.md#spell-mode).

---

### Pattern 4: Per-Block "Translate" Action — TextActionMenu

**Files**: `apps/web/src/components/text-action-menu.tsx`, `apps/mobile/components/TextActionMenu.tsx`

**Trigger**: User taps "Translate" in the ⋮ action menu on any text block.

**Data flow**:
```
User taps "Translate"
  → handleTranslate()
  → POST /translate { text, l1, l2 }  (single text, NOT /translate_array)
  → Response: { translated_text, translation, text } (fallback chain)
  → Shown in modal
```

**API**: `POST /translate` (single-text endpoint, different from `/translate_array`).

**Loading state**: `ActivityIndicator` spinner replacing the Languages icon in the action menu. Translate modal shows spinner while loading, error text on failure, translated text on success.

**Rendering**: Modal overlay with:
- Title bar: "Translation" + close button
- Body: translated text in `text-sm leading-relaxed text-foreground`
- Web uses `Popover` for the action menu; mobile uses bottom sheet + modal

**Error state**: Error message in modal (`text-destructive`). Fallback error message uses `t('error.occurred')`.

**Mobile status**: ✅ Ported (identical behavior, adapted to bottom sheet + modal).

---

## Cross-Cutting: Term Emphasis in Translations

When translating text that contains the word the learner is studying, both
endpoints accept an optional highlight term so the server **bolds that word in
its own translation** (located with the backend tokenizer, matching how the
tokenized L2 text highlights the same term):

| Endpoint | Param | Consumer |
|---|---|---|
| `POST /translate` | `form` (single string) | Review context (Pattern 3) — sends `{ text, form, l1, l2 }` |
| `POST /translate_array` | `forms` (array, parallel to `texts`) | Subtitle / subs-search translation (Pattern 2) — per-line first matching search form |

The backend wraps the term in `**…**` markers and preserves them in the
returned translation. Clients render the markers per surface:

- **Subs-search result list & subtitles (Pattern 2)**: the translation is
  rendered with ReactMarkdown and a `strong → <mark>` override, so the matched
  term shows as the same highlight ring (`bg-primary/15 … ring-primary/30`)
  used on the tokenized L2 text.
- **Review context (Pattern 3)**: the `form` is sent so the server keeps the
  translation focused on the word under review.

This behavior is **not covered in SPEC-006** — it was added after that spec.
New translation surfaces built on top of tokenized text (e.g. a corpus Examples
translation) should reuse the `form`/`forms` param + `**…**` → `<mark>`
rendering instead of inventing a separate emphasis path.

---

## Inconsistency Analysis

| Aspect | Reader (Pattern 1) | Video (Pattern 2) | Review (Pattern 3) | Action (Pattern 4) |
|---|---|---|---|---|
| **Translation source** | Bulk `/translate_array` | Chunked `/translate_array` | Pre-fetched | Single `/translate` |
| **Loading UI** | Skeleton bars (pulse) | Progress text in control bar | None | Spinner in modal |
| **Error UI** | Silent (no translation shown) | Red banner + retry button | Silent | Error text in modal |
| **Text styling** | Per-block (heading/blockquote/paragraph) | Uniform `text-xs` | `text-sm italic` | `text-sm leading-relaxed` |
| **Layout** | Side-by-side column | Below original text | Below context, with border separator | Modal overlay |
| **Toggle** | `display.translation` setting | `display.translation` setting | `display.translation` setting | Manual per-block tap |
| **Mobile ready** | ❌ | ✅ | ✅ | ✅ |

The biggest gap is **Pattern 1 (page-level translation)** on mobile. The other three patterns are already implemented on mobile and are functionally consistent with web.

---

## Proposed Unified Approach

### Guiding Principles

1. **Same setting, same behavior**: `display.translation` toggles translation visibility everywhere. When off, no translation is fetched or shown. When on, translation loads automatically where applicable (reader pages, video subtitles, review).

2. **Consistent loading UI**: Always show skeleton placeholders (not spinners, not progress text) while translation is loading. Skeleton bars adapt to the context — proportional to text length for paragraphs, single-line for subtitles, absent for pre-fetched content.

3. **Consistent error UI**: Always show an inline error banner (not a modal, not silent). Banner includes the error message and a retry button. Modeled after the video subtitle error banner (Pattern 2).

4. **Consistent text styling**: Translation text uses `text-muted-foreground` at a size one step smaller than the original. Italic for inline translations (subtitle, review). Normal weight for side-by-side translations (reader). Per-block heading sizing preserved where applicable.

5. **Shared `TextActionMenu` props**: Both web and mobile `TextActionMenu` support `translation`, `translationClass`, and `loading` props. Mobile adds these as deferred optional props (no regression on existing behavior).

6. **Term emphasis**: when the text being translated contains the word being
   studied, pass it via `form`/`forms` so the server bolds it, and render the
   returned `**…**` markers as a `<mark>` highlight — consistent with the
   highlight ring on the original tokenized text.

### Implementation Plan

#### Phase A: Mobile TextActionMenu — Add Page Translation Props (M)

Add `translation`, `translationClass`, and `loading` props to `apps/mobile/components/TextActionMenu.tsx`:

- `translation?: string` — pre-fetched translation text to display
- `translationClass?: string` — NativeWind classes for translation styling (maps to web's Tailwind classes)
- `loading?: boolean` — show skeleton placeholders while translating

**Translation rendering** (when `translation` is provided):
```tsx
{translation ? (
  <View className={`mt-1 ${translationClass || ''}`}>
    <Text className="text-sm text-muted-foreground">{translation}</Text>
  </View>
) : null}
```

**Skeleton loading** (when `loading && !translation`):
```tsx
{loading && !translation ? (
  <View className="mt-1 gap-y-1">
    {Array.from({ length: Math.max(1, Math.ceil(text.length / 50)) }).map((_, i) => (
      <View key={i} className="h-3 bg-muted rounded animate-pulse"
        style={{ width: `${['90%', '75%', '60%'][i % 3]}` }} />
    ))}
  </View>
) : null}
```

On mobile, translation renders stacked below the original text (not side-by-side — space constrained). On `xl:` screens (iPad), side-by-side could be added later per SPEC-020.

**Note on `animate-pulse`**: NativeWind supports `animate-pulse` if the Tailwind animation config is present. Verify in `tailwind.config.js`. If not available, use React Native `Animated` with opacity interpolation.

#### Phase B: Mobile Web Reader — Enable Page Translation (M)

Wire `onPageTranslate` into `apps/mobile/app/(tabs)/(reading)/web-reader.tsx`:
- Add translate toggle (switch or segmented control) in the page nav bar
- Hook into `display.translation` setting via `useSettingsContext`
- Implement `onPageTranslate` callback (same `POST /translate_array` pattern as web)
- Pass `translation`, `loading` props to `TextActionMenu` wrapping each block

Same for notes reader (`index.tsx`) and EPUB reader (`epub.tsx`) — all three use `ReaderPanel` on web; on mobile each has separate implementation.

#### Phase C: iOS Native Translation Option (S)

For iOS 18+, `TranslationSession` provides on-device translation. Explore as an option for offline/pro users. This would bypass the Python server entirely for supported language pairs. Out of scope for this spec — document in a follow-up if pursued.

#### Phase D: Unify Skeleton Components (S)

Extract the skeleton bar rendering into a shared `TranslationSkeleton` component:
```
packages/shared/ → not applicable (platform-agnostic, no RN/Web)
apps/web/src/components/translation-skeleton.tsx
apps/mobile/components/TranslationSkeleton.tsx
```
Both accept `lineCount: number` and render appropriate animated placeholders.

#### Phase E: Unify Error Banner (S)

Extract the video subtitle error banner into a shared `TranslationErrorBanner` component used by all translation patterns. Props: `message: string`, `onRetry: () => void`.

### Mobile Component Mapping

| Web | Mobile | Status |
|---|---|---|
| `TextActionMenu` (with `translation`/`loading`/`translationClass`) | `TextActionMenu` (add props) | Phase A |
| `ReaderPanel.onPageTranslate` | Inline in each reader screen | Phase B |
| Skeleton bars in `TextActionMenu` | `TranslationSkeleton` or inline | Phase D |
| Video error banner | `TranslationErrorBanner` | Phase E |

### Translation Class Mapping (Web Tailwind → Mobile NativeWind)

The web `translationClass(tb)` function returns Tailwind classes. These map directly to NativeWind since both use the same design tokens:

| Web Tailwind | NativeWind equivalent | Works? |
|---|---|---|
| `text-lg font-semibold leading-relaxed` | Same | ✅ |
| `text-sm leading-relaxed` | Same | ✅ |
| `border-l-4 border-muted/40 pl-4 italic` | Same (`italic` supported in RN `Text`) | ✅ |

---

## Open Questions

1. **Should page translation be on by default?** Currently `display.translation` defaults to off. For new users, showing translations immediately could improve comprehension but might reduce learning effectiveness. Keep current default (off) for now.

2. **Should mobile show translation side-by-side on iPad?** Per SPEC-020, iPad in landscape has enough width for a two-column layout. Defer to Phase 8 follow-up.

3. **Cache translated pages?** The web app clears `blockTranslations` on every page change and re-fetches. For mobile offline use, caching translations locally (similar to dictionary downloads) could save bandwidth. Out of scope for this spec.

4. **`/translate` vs `/translate_array` endpoint consolidation?** Pattern 4 uses the single-text `/translate` endpoint while Patterns 1 & 2 use the bulk `/translate_array`. These could be unified (single-text is just bulk with one element), but that's a backend change. Keep separate for now.
