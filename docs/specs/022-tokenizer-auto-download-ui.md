# SPEC-022: Tokenizer Auto-Download UI

## Metadata
- **Spec ID**: SPEC-022
- **Feature**: Transparent auto-download of tokenizer/lemma packs as invisible sidecars to offline dictionary downloads
- **Status**: draft
- **Created**: 2026-07-27
- **See also**:
  - [SPEC-018: Mobile Local Tokenization & Lemmatization](../specs/018-local-tokenization-mobile.md) — the tokenization pipeline that consumes the downloaded packs
  - [SPEC-013: Mobile Offline Dictionary](../specs/013-mobile-offline-dictionary.md) — the dictionary download UX pattern this spec extends
  - [ARCH-018: Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md) — per-language taxonomy for downloadable vs regex-only languages

---

## Overview

Tokenizers have **no dedicated UI**. They are downloaded automatically as a sidecar when the user downloads an offline dictionary (SPEC-013). The user only sees one download — the dictionary.

---

## What the User Sees

Nothing. The dictionary download UI is unchanged — the tokenizer is downloaded silently in the background as part of the same HTTP request or immediately after the dictionary asset completes. If the language has no downloadable tokenizer (Category E, or Phase 1 regex fallback), no download occurs.

---

## Offline Dictionary Management — Tokenizer Availability Indicator

In the Offline Dictionaries settings screen (SPEC-013, Phase 5), each language card shows whether the language has a downloadable tokenizer pack. This helps users understand which languages will have fully interactive text (tappable subtitles, lemmatized dictionary lookup) when offline.

### Wireframe — Language with Local Tokenizer (no warning)

Languages in `TOKENIZER_CONFIG` (Categories A, C1–C4, plus dict-based segmentation in Category B) have a downloadable pack. No warning is shown.

```
┌──────────────────────────────────────────┐
│  Spanish                         Download │
│  es                                      │
│  ─────────────────────────────────────── │
│  125,000 words · ~3.4 MB                 │
│                                          │
│  [===========                    ]  42%   │  ← During download (transient)
│  52,000 of 125,000 words                 │
└──────────────────────────────────────────┘
```

### Wireframe — Language WITHOUT Local Tokenizer (warning shown)

Languages NOT in `TOKENIZER_CONFIG` (Category E, ~146 regex-only languages) have no downloadable pack. A small warning appears below the word count.

```
┌──────────────────────────────────────────┐
│  Swahili                         Download │
│  sw                                      │
│  ─────────────────────────────────────── │
│  80,000 words · ~6.4 MB                  │
│  ⚠ Cannot make text interactive offline  │
└──────────────────────────────────────────┘
```

### Wireframe — Downloaded Language (both cases)

After download, the warning persists so the user knows that even though the dictionary works offline, tapping on words in subtitles/reader won't provide interactive lemmatization.

```
┌──────────────────────────────────────────┐
│  Swahili                    [↻] [🗑]     │
│  sw                                      │
│  ─────────────────────────────────────── │
│  ✅ Downloaded · 80,000 words            │
│  ⚠ Cannot make text interactive offline  │
└──────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────┐
│  Spanish                    [↻] [🗑]     │
│  es                                      │
│  ─────────────────────────────────────── │
│  ✅ Downloaded · 125,000 words           │
│                                          │  ← No warning (tokenizer available)
└──────────────────────────────────────────┘
```

### Implementation Rule

```typescript
/** A language has a downloadable tokenizer/lemma pack if it has an entry
 *  in TOKENIZER_CONFIG (packages/shared/src/constants.ts).
 *  See ARCH-018 for the per-language taxonomy. */
function hasLocalTokenizer(l2: string): boolean {
  return l2 in TOKENIZER_CONFIG;
}
```

Languages with entries in `TOKENIZER_CONFIG`:
- **Snowball + Lemma Table**: ca, cs, da, de, en, es, fi, fr, ga, hu, it, nl, pt, ro, ru, sl, sv, tr (18 langs)
- **Snowball only**: eu, hy, nb, no, ta (5 langs)
- **Lemma Table only**: ast, bg, cy, el, et, fa, gd, gl, gv, hr, is, ka, la, lt, lv, mk, nn, pl, sk, sq, sw, uk (22 langs)
- **Dict-based segmentation**: zh, cmn, nan, hak, lzh, gan, hsn, wuu, cjy, cpx, yue, th, km, lo, my, bo (16 langs)

**Total: 61 languages with local tokenizer support.** Remaining ~146 languages show the warning.

### Visual Specs

| Element | Value |
|---|---|
| Icon | `AlertTriangle` (lucide-react-native), 11px |
| Icon color | `ICON_MUTED` |
| Text | "Cannot make text interactive offline" |
| Text size | `text-xs` (12px) |
| Text color | `text-muted-foreground` |
| Spacing | `mt-1` gap `gap-1` between icon and text |
| Position | Below the word count/saved row, above the progress bar |

The warning is hidden during download (progress bar visible) and during error state.

---

## Tokenizer Lifecycle

| Event | Behavior |
|---|---|
| User downloads offline dictionary (SPEC-013) | Tokenizer/lemma pack downloads in parallel as an invisible sidecar |
| User deletes offline dictionary | Tokenizer is also deleted (no orphaned data) |
| Dictionary download fails | Tokenizer download is cancelled |
| Tokenizer download fails (but dict succeeds) | Dict works offline; tokenizer falls back to regex + surface-as-lemma |
| User switches to a new L2 with no dict | Phase 1 regex fallback applies (server remains primary) |

---

## Storage Accounting

Tokenizer storage is counted as part of the offline dictionary total in SPEC-013's storage summary. No separate line item.

---

## i18n Keys Required

**No new i18n keys.** The dictionary download row already uses `label.download_size` from SPEC-013. The combined "Dict X MB + Tokenizer Y MB" string is assembled programmatically from `TOKENIZER_CONFIG` in `packages/shared/src/constants.ts`.
