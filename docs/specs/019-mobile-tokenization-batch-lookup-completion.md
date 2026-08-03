# SPEC-019: Mobile Tokenization & Batch Lookup — Completion

## Metadata
- **Spec ID**: SPEC-019
- **Feature**: Close mobile gaps in tokenization pipeline, batch dictionary lookup, and request optimization
- **Status**: in-progress
- **Created**: 2026-07-26
- **ROADMAP Phase**: Phase 7 — Mobile Integration
- **Depends on**: ARCH-017 (Tokenization & Batch Lookup Pipeline), SPEC-015 (Mobile Settings)
- **See also**:
  - [ARCH-017: Tokenization & Batch Lookup Pipeline](../arch/017-tokenization-batch-lookup-pipeline.md) — full pipeline architecture (both platforms)
  - [ADR-0019: Chinese Script Conversion at Render Layer](../adr/0019-chinese-script-conversion-at-render-layer.md)

---

## Overview

ARCH-017 documents the full tokenization and batch lookup pipeline shared by both web and mobile. The web implementation is mature — IntersectionObserver lazy loading, in-flight request deduplication, video token cache wiring, hardWords filtering, per-token Chinese script conversion. The mobile implementation has functional parity for the core pipeline (lemmatization, batch dict lookup, byeonggi rendering) but has gaps in optimization, feature completeness, and wiring.

This spec tracks the remaining mobile gaps and provides a phased implementation plan to close them.

---

## Gap Inventory

### ✅ Already Done

| # | Feature | Details | Commit |
|---|---|---|---|
| 1 | Batch dictionary lookup | `bulkLookupWords()` + `cacheVersion` pattern, identical to web | `9fbc3ab` |
| 2 | Dictionary cache | `apps/mobile/lib/dictionary-cache.ts` — identical to web | `9fbc3ab` |
| 3 | Byeonggi rendering | Hanja/hán tự from dict cache, rendered above word (ruby) / prefix (word) | `9fbc3ab` |
| 4 | Quiz mode | `▯` blanking with tap-to-reveal via `revealedTokens` Set | `0bd6ea2` |
| 5 | Interlinear gloss | First lemma shown below/beside word when `definition.show` is enabled | `0bd6ea2` |
| 6 | Settings wiring | All 6 Phase 5B settings read in TokenizedText, 4 with TODO markers | `8c60b02` |

---

### ✅ Critical Bug — Video Token Cache Not Wired (fixed)

**Status**: ✅ Fixed 2026-07-28 — `tokenCache` + `tokenCacheLoaded` are now
passed through `SubtitleDisplay` → `TokenizedText` on the watch page, and
`TokenizedText` checks the video cache before falling back to per-line
lemmatization. See ARCH-017 → "Mobile: Video Cache Wiring (2026-07-28 Fix)".

**Follow-up (2026-08-02)**: Both platforms now route batch dictionary lookup
through the shared queued pipeline in `packages/utils/src/dictionary-cache.ts`
(`enqueueLookupWords`, 80ms flush, 100-word chunks, content-based in-flight
dedup, per-word fallback on batch failure). Mobile's `TokenizedText` lookup
effect is aligned with web (same lemma/surface collection, `baseCode` cache
keys), and the lemmatize queue drains beyond its 12-line cap instead of
stranding lines. Reader-panel pages (`ReaderPanel`) also mark their lines as
`deferTokenization` so the panel's own per-page lemmatization isn't duplicated
by every `TokenizedText` instance.

---

### ⬜ Optimization Gaps

| # | Gap | Web Equivalent | Impact | Effort |
|---|---|---|---|---|
| O1 | **No in-flight lemmatize dedup** | `lemmatizeInflight` Map | Concurrent TokenizedText instances for same text launch separate API calls | Small |
| O2 | **No lazy loading** | `IntersectionObserver` with `rootMargin: 200px` | All subtitle lines tokenized immediately on mount, even off-screen | Medium |

**O1 — In-flight lemmatize dedup**:
- Add a `lemmatizeInflight` Map (module-level, like `lemmatizeCache`) to `TokenizedText.tsx`
- Before calling `POST /lemmatize-normalized`, check if a promise for the same `cacheKey` is already in flight
- Reuse the existing promise instead of launching a new request
- This matches the web pattern exactly

**O2 — Lazy loading**:
- React Native has no `IntersectionObserver`. Options:
  - A: Use `FlatList` `viewabilityConfig` on the subtitle list
  - B: Track scroll position and compute which lines are within ±200px of visible area
  - C: Use `onLayout` to measure container height, render only visible + buffer
- Web's approach: tokenize when within 200px of viewport, stay tokenized once visible
- This is a larger feature and should be its own subtask

---

### ⬜ Feature Gaps (Token Rendering)

| # | Setting | Web Does | Mobile Status | Blocker |
|---|---|---|---|---|
| F1 | `phonetics.conditions` | `getWordDifficulty()` from dict cache, compares `levels[].numeric` to `userLevel` | TODO (G9) — shows phonetics on ALL tokens | Needs `useProgressLevel(l2Code)` hook + filter logic |
| F2 | `quickGloss` | `QuickGloss` component renders `firstDef` from cache for saved words only | TODO (G7) — dict data available via cache, not rendered | Needs `useSavedWords()` context integration |
| F3 | `display.traditional` | `TokenSpan` lazy-loads OpenCC, converts per-token (ADR-0019) | TODO (G11) — no conversion | Needs OpenCC port or character map |
| F4 | `tokenizedText.mode` | `TokenSpan` per-word blanking with quiz-reveal state | ✅ Done (G8) | — |
| F5 | `tokenSpan.definition.show` | Interlinear gloss from dict cache | ✅ Done (G10) | — |
| F6 | `display.byeonggi` | Rendered from dict cache han_script | ✅ Done (G12) | — |

**F1 — hardWords filter**:
- Requires `useProgressLevel(l2Code)` hook to get user's proficiency level (1–7)
- `getWordDifficulty()` needs to be ported: check `DictionaryEntry.levels[].numeric` and `frequencyLevel`
- Filter tokens: when `phonetics.conditions === 'hardWords'`, skip phonetics for tokens with difficulty < userLevel
- Words not yet in cache → don't show phonetics (wait for async bulk lookup)

**F2 — quickGloss**:
- Requires `useSavedWords()` context to know if a token's lemma is saved
- Dictionary data is already available via `getCachedEntries()` — just needs rendering
- Render as small muted text: `'first definition'` after/below the token
- Only for saved words, suppressed for highlighted terms (matches web)

**F3 — Chinese script conversion**:
- Mobile doesn't have OpenCC. Options:
  - A: Port `opencc-js` via a WebView or native module
  - B: Use server-side conversion (add `?traditional=true` to lemmatize endpoint)
  - C: Include a character map in the shared package
- Per ADR-0019, this is a per-token render-layer concern — should not affect tokenization
- This is the hardest mobile gap — needs architectural decision

---

## Implementation Plan

### Phase 1: Quick Wins (O1 + Critical Bug)

| Task | Effort | Files |
|---|---|---|
| **Wire video token cache through to subtitles** | Small | `watch/[videoId].tsx`, `SubtitleDisplay.tsx` |
| **Add in-flight lemmatize dedup** | Small | `TokenizedText.tsx` |

These two fixes reduce API calls per video from ~500 to ~2, matching web performance.

### Phase 2: Token Rendering Features (F1 + F2)

| Task | Effort | Files |
|---|---|---|
| **hardWords filter (F1)** | Medium | `TokenizedText.tsx` — add `getWordDifficulty()`, `useProgressLevel()`, filter logic |
| **quickGloss rendering (F2)** | Medium | `TokenizedText.tsx` — add `useSavedWords()`, render `firstDef` for saved tokens |

These two give functional parity for the two most impactful display settings.

### Phase 3: Chinese Script (F3)

| Task | Effort | Files |
|---|---|---|
| **Chinese script conversion (F3)** | Large | Needs architectural decision (native module vs server-side vs character map) |

This is the hardest gap. See ADR-0019 for the architectural rationale. Options:
- **Server-side**: Add `traditional: boolean` to `/lemmatize-normalized` — tokenizer sends traditional, cache is still unified (hash of original text). TokenSpan reads the setting and passes the flag.
- **Client-side**: Port `opencc-js` to React Native (WebView-based or native module). Follows ADR-0019 pattern of per-token conversion at render layer.
- **Character map**: Smaller than OpenCC, but handles ~95% of common conversions.

### Phase 4: Lazy Loading (O2)

| Task | Effort | Files |
|---|---|---|
| **Lazy tokenization** | Large | `SubtitleDisplay.tsx`, `TokenizedText.tsx`, watch page layout |

The web uses `IntersectionObserver` which doesn't exist in React Native. This needs its own design discussion and is lower priority than the above features.

---

## Request Count Impact

For a video transcript with 500 subtitle lines, 200 unique lemmas:

| Phase | API Calls | Description |
|---|---|---|
| **Current** | 1 (video cache fetch) + 500 (per-line tokenize) + 1 (batch dict) = 502 | Video cache fetched but not wired; in-memory lemmatize cache helps after first line |
| **After Phase 1** | 1 (video cache) + 0 (tokenize) + 1 (batch dict) = 2 | Same as web |
| **After Phases 1+2** | 2 | Same — no additional API calls |
| **After Phase 3** | 2 | Same — conversion is client-side |
| **After Phase 4** | 2 (but deferred — only visible lines tokenized on mount) | Same as web lazy loading |

---

## Files in Scope

| File | Phase | Change |
|---|---|---|
| `apps/mobile/app/(tabs)/(media)/watch/[videoId].tsx` | 1 | Pass `tokenCache` + `tokenCacheLoaded` to SubtitleDisplay |
| `apps/mobile/components/video/SubtitleDisplay.tsx` | 1 | Accept and forward `tokenCache` + `tokenCacheLoaded` to TokenizedText |
| `apps/mobile/components/TokenizedText.tsx` | 1, 2 | Add `lemmatizeInflight` Map (O1), `getWordDifficulty()` (F1), `useSavedWords()` (F2) |
| `apps/mobile/lib/chinese-script.ts` | 3 | (New) OpenCC port or character map for F3 |
| `apps/mobile/hooks/use-progress.ts` | 2 | (New) User proficiency level hook for F1 |
| `apps/mobile/components/video/SubtitleDisplay.tsx` | 4 | Lazy loading via viewability (O2) |

---

## Success Criteria

- [ ] Video token cache wired through to subtitle TokenizedText instances (Phase 1)
- [ ] In-flight lemmatize dedup prevents duplicate API calls (Phase 1)
- [ ] `phonetics.conditions === 'hardWords'` filters phonetics by word difficulty (Phase 2)
- [ ] `quickGloss` shows dictionary definition for saved words (Phase 2)
- [ ] Chinese script conversion works per-token on mobile (Phase 3)
- [ ] Subtitle lines lazily tokenized when approaching viewport (Phase 4)
- [ ] TypeScript compiles cleanly: `./node_modules/.bin/tsc --noEmit`
- [ ] No regression in existing tokenization behavior
