# SPEC-018: Mobile Local Tokenization & Lemmatization

## Metadata
- **Spec ID**: SPEC-018
- **Feature**: On-device tokenization & lemmatization fallback for offline use, with downloadable language packs
- **Status**: draft
- **Created**: 2026-07-26
- **Supersedes**: [SPEC-016](../specs/016-mobile-local-tokenization.md)
- **See also**:
  - [ARCH-018: Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md) — per-language taxonomy and strategy reference
  - [SPEC-015: Local Tokenization & Lemmatization for Mobile](../specs/015-local-tokenization-mobile.md) — earlier exploration
  - [SPEC-013: Mobile Offline Dictionary](../specs/013-mobile-offline-dictionary.md) — download UX pattern
  - [ARCH-016: Server-Side Tokenization Pipeline](../arch/016-server-tokenization.md)
  - [ADR-0018: Tokenizer Selection — Prefer Simplemma/LemmatizationList over spaCy](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md)
  - [ADR-0008: Mobile Dictionary Architecture — Online Lookup + Offline Download](../adr/0008-go-dictionary-architecture.md)

---

## Overview

Today, every `POST /lemmatize-normalized` call from the mobile app hits the Python server. This means:

- **No offline tokenization** — subtitles, reader text, and dictionary searches can't be tokenized without a network connection
- **Latency** — even with caching, every unique text string requires a round trip
- **Server load** — popular videos generate repeated tokenization requests for the same subtitle lines

This document specifies how to run tokenization and lemmatization **locally on the mobile device**, covering all 207 supported L2 languages.

Of the 207 supported L2 languages, approximately **146** can be tokenized with a simple regex word-split and need no lemmatization (surface form = lemma). The remaining **~61 languages** need more sophisticated approaches — see [ARCH-018](../arch/018-local-tokenization-strategy.md) for the complete per-language taxonomy.

### Two Independent Dimensions

| Dimension | What It Means | Hard For |
|---|---|---|
| **Segmentation** | Splitting text into word tokens | CJK, Thai, Khmer, Burmese, Lao, Tibetan |
| **Lemmatization** | Reducing inflected words to base form | All inflected languages (verbs, plurals, cases, etc.) |

A language may need zero, one, or both.

### Priority: Server First, Local as Fallback

Local tokenization exists for **graceful offline degradation** (airplane mode, tunnels, poor connectivity). The server always wins when reachable:

```
1. POST /lemmatize-normalized  →  Server (best accuracy, always preferred)
2. Local JS library             →  kuromoji, arabic-stem, nlptoolkit, snowball-stemmers, etc.
3. Downloaded lemma table       →  Language pack stored in SQLite (SPEC-013 pattern)
4. Regex word-split + surface   →  Last resort (~146 languages, zero cost)
```

Tokenizers and lemma tables are **downloadable on demand**, following the same UX pattern as offline dictionaries (see [SPEC-013](../specs/013-mobile-offline-dictionary.md)): the user selects a language, downloads its tokenizer/lemma pack, and it's stored locally in SQLite. No tokenizers are bundled with the app — everything is opt-in.

---

## Architecture & Design

### Offline Fallback Chains

When the server is reachable, `POST /lemmatize-normalized` is always preferred — it handles both tokenization and lemmatization with best accuracy. The chains below apply only when the server is unreachable.

```
┌─────────────────────────────────────────────────┐
│         Tokenization (offline chain)             │
│                                                  │
│  Level 1: Intl.Segmenter (built-in, 0 KB)       │
│  ├─ iOS: JSC native support (zh, ja, ko, th,    │
│  │   lo, km, my, ...)                            │
│  └─ Android: @formatjs/intl-segmenter polyfill   │
│      (~30 KB) for Hermes                         │
│                                                  │
│  Level 2: Dictionary-Based Max Matching          │
│  ├─ Uses offline dictionary headwords as word    │
│  │   list (SPEC-013)                             │
│  ├─ Pure JS, ~200 lines, no dependencies         │
│  └─ Fallback when Intl.Segmenter unavailable     │
│                                                  │
│  Level 3: Regex Word Split                       │
│  ├─ For all space-separated languages             │
│  ├─ Pattern: /[\w']+|[^\w\s']+/g                 │
│  └─ Handles apostrophes, punctuation              │
│                                                  │
├─────────────────────────────────────────────────┤
│         Lemmatization (offline chain)            │
│                                                  │
│  Level 1: Pre-Built Lemma Tables (bundled)       │
│  ├─ Top 10 languages bundled as assets           │
│  ├─ surface → [lemma1, lemma2, ...] mapping      │
│  └─ JSON or SQLite, ~150 KB per lang (gzipped)   │
│                                                  │
│  Level 2: Downloaded Lemma Tables (on-demand)     │
│  ├─ Same tables, downloaded like dictionaries    │
│  └─ Stored in SQLite alongside dict entries       │
│                                                  │
│  Level 3: Suffix-Stripping Rules (for regular     │
│  │   languages like English, Spanish, Turkish)    │
│  └─ Compact, always available, lower accuracy     │
│                                                  │
│  Level 4: Surface Form as Lemma (Chinese, etc.)  │
│  └─ No lemmatization needed                      │
└─────────────────────────────────────────────────┘
```

For the detailed per-language assignment of which strategy applies to which language, see [ARCH-018](../arch/018-local-tokenization-strategy.md).

### `lemmatizeText()` — Single Entry Point

A single async function in `apps/mobile/lib/tokenizer.ts` implements the server-first, local-fallback pipeline. Every component in the app calls this one function — including `TokenizedText`, the reader, and dictionary search — instead of hitting the server directly.

```
lemmatizeText(text, l2)
  │
  ├─ 1. In-memory cache hit? ────→ return cached tokens (instant)
  │
  ├─ 2. POST /lemmatize-normalized (with 3s timeout)
  │      ├─ success ──────────────→ cache & return server tokens
  │      └─ timeout / network err ─→ fall through
  │
  ├─ 3. Local fallback chain
  │      ├─ Downloaded tokenizer/lemma pack? ──→ use it (Phase 2+)
  │      ├─ arabic-stem (if l2=ar) ────────────→ stemmed tokens
  │      ├─ regex word-split ──────────────────→ per-token split
  │      └─ surface-as-lemma ─────────────────→ each token is its own lemma
  │
  └─ 4. Return result (may be empty array on total failure)
```

### Server Call with Timeout

The server call wraps `fetch` with a short timeout so offline users don't wait:

```typescript
async function lemmatizeFromServer(text: string, l2: string, signal?: AbortSignal): Promise<LemmatizedToken[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${PYTHON_API_URL}/lemmatize-normalized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, l2 }),
      signal: signal ? anySignal(signal, controller.signal) : controller.signal,
    });
    if (\!response.ok) return null;
    const data = await response.json();
    return data.tokens as LemmatizedToken[];
  } catch {
    return null; // network error or timeout → fall through to local
  } finally {
    clearTimeout(timeout);
  }
}
```

The timeout is intentionally short (3 seconds). If the server is reachable, tokenization completes in <500ms. If not, we fail fast and use local fallback rather than hanging the UI.

### Full Pipeline Implementation

```typescript
// Shared in-memory cache (keyed by `${l2}:${text}`) — deduplicates across
// all TokenizedText instances for identical text strings.
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

export async function lemmatizeText(
  text: string,
  l2: string,
  signal?: AbortSignal,
): Promise<LemmatizedToken[]> {
  const cacheKey = `${l2}:${text}`;

  // 1. In-memory cache
  const cached = lemmatizeCache.get(cacheKey);
  if (cached) return cached;

  // 2. Server (primary — always try first when reachable)
  const serverTokens = await lemmatizeFromServer(text, l2, signal);
  if (serverTokens) {
    lemmatizeCache.set(cacheKey, serverTokens);
    return serverTokens;
  }

  // 3. Local fallback
  const words = tokenizeWords(text);
  let tokens: LemmatizedToken[];

  if (l2 === 'ar') {
    tokens = lemmatizeArabic(words);
  } else {
    tokens = surfaceAsLemma(words);
  }

  lemmatizeCache.set(cacheKey, tokens);
  return tokens;
}
```

### Error Handling Strategy

| Scenario | Behavior |
|---|---|
| Server reachable, returns 200 | Use server result (best accuracy) |
| Server reachable, returns 4xx/5xx | Fall through to local fallback |
| Server unreachable (timeout 3s) | Fall through to local fallback |
| Server unreachable (instant, airplane mode) | `fetch` rejects immediately → local fallback |
| Local fallback runs | Returns regex-split + surface-as-lemma (lower accuracy, always available) |
| All paths fail | Returns empty `[]` (caller shows plain text) |

Server errors are silent — no toast, no console noise for offline scenarios. The system degrades gracefully without user awareness.

### Integration Points

| Call Site | Current | After SPEC-018 |
|---|---|---|
| `TokenizedText` (subtitles, reader) | `fetch(POST /lemmatize-normalized)` | `lemmatizeText(text, l2, signal)` |
| Dictionary search input | `fetch(POST /lemmatize-normalized)` | `lemmatizeText(text, l2, signal)` |
| Batch lemmatization (reader chapters) | `fetch(POST /lemmatize-normalized/batch)` | Keeps batch endpoint (perf optimization) |

**Before** (current `TokenizedText.tsx`, simplified):
```typescript
const response = await fetch(`${PYTHON_API_URL}/lemmatize-normalized`, { ... });
const data = await response.json();
const serverTokens = data.tokens ?? [];
// On error: falls through to empty tokens, renders plain text
```

**After** (Phase 1):
```typescript
import { lemmatizeText } from '@/lib/tokenizer';

const result = await lemmatizeText(text, l2Code, signal);
// Server tried first (3s timeout). If unreachable, local fallback kicks in.
// Result always has tokens — never empty on error.
setTokens(result);
setLoading(false);
```

The change is a single import swap + one function call. No downstream effects — `lemmatizeText()` returns the same `LemmatizedToken[]` shape that `POST /lemmatize-normalized` returns.

---

## Implementation Plan

### Phase 1 — Zero-Cost Baseline

Covers the biggest wins at zero bundle cost. Ships immediately.

| What | Languages Covered |
|---|---|
| Regex word-split tokenizer | All 207 (trivial) |
| Surface-as-lemma | ~166 languages (Categories B, D, E) |
| `arabic-stem` (zero-dep, 15 KB) | Arabic — stemmer covers ~85% of forms |
| Server (`POST /lemmatize-normalized`, primary) | Languages without downloaded packs (always preferred when reachable) |

#### Step 1: Install `arabic-stem`

```bash
cd apps/mobile && npm install arabic-stem
```

Zero native dependencies, 15 KB. The only Phase 1 npm dependency.

#### Step 2: Create `apps/mobile/lib/tokenizer.ts`

Create the single entry point that all components will use. This file contains the server-first, local-fallback pipeline:

1. `tokenizeWords(text)` — regex word-split, works for all 207 languages
2. `surfaceAsLemma(tokens)` — marks each token as its own lemma
3. `lemmatizeArabic(tokens)` — `arabic-stem` integration for Arabic
4. `lemmatizeFromServer(text, l2, signal)` — fetches from `POST /lemmatize-normalized` with 3s timeout, returns `null` on failure
5. `lemmatizeText(text, l2, signal)` — the public API: cache → server → local fallback

See [Architecture & Design](#architecture--design) above for the full implementation of each function.

```typescript
// apps/mobile/lib/tokenizer.ts — skeleton (full code in Architecture section above)

import Stemmer from 'arabic-stem';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { LemmatizedToken } from '@langplayer/shared';

const arabicStemmer = new Stemmer();
const lemmatizeCache = new Map<string, LemmatizedToken[]>();

function tokenizeWords(text: string): string[] { /* ... */ }
function surfaceAsLemma(tokens: string[]): LemmatizedToken[] { /* ... */ }
function lemmatizeArabic(tokens: string[]): LemmatizedToken[] { /* ... */ }
async function lemmatizeFromServer(text: string, l2: string, signal?: AbortSignal): Promise<LemmatizedToken[] | null> { /* ... */ }

export async function lemmatizeText(text: string, l2: string, signal?: AbortSignal): Promise<LemmatizedToken[]> { /* ... */ }
```

#### Step 3: Update `TokenizedText.tsx`

Replace the direct `fetch(POST /lemmatize-normalized)` call with `lemmatizeText()`. The component currently:

```typescript
const response = await fetch(`${PYTHON_API_URL}/lemmatize-normalized`, { ... });
const data = await response.json();
const serverTokens = data.tokens ?? [];
```

Replace with:

```typescript
import { lemmatizeText } from '@/lib/tokenizer';

const result = await lemmatizeText(text, l2Code, signal);
```

No other changes needed — `lemmatizeText()` returns the same `LemmatizedToken[]` shape. On server failure, local fallback produces tokens instead of an empty array, so the UI always has something to render.

#### Step 4: Update Dictionary search input

The dictionary search box also calls `POST /lemmatize-normalized` to lemmatize the user's query before looking it up. Replace that `fetch` with `lemmatizeText()` in the same way:

```typescript
import { lemmatizeText } from '@/lib/tokenizer';

const tokens = await lemmatizeText(query, l2Code);
```

#### Step 5: Verify

```bash
cd apps/mobile && npx tsc --noEmit   # 0 errors
npx expo start --ios                  # smoke test: tokenize subtitles, search dict
```

Test both online (server responds) and offline (airplane mode) to confirm the fallback chain works end-to-end.

**Files to create/modify**:

| File | Change |
|---|---|
| `apps/mobile/lib/tokenizer.ts` | **NEW** — `lemmatizeText()`, `lemmatizeFromServer()`, `tokenizeWords()`, `surfaceAsLemma()`, `lemmatizeArabic()` |
| `apps/mobile/components/TokenizedText.tsx` | Replace direct `fetch(POST /lemmatize-normalized)` with `lemmatizeText()` call |
| Dictionary search component | Replace direct `fetch(POST /lemmatize-normalized)` with `lemmatizeText()` call |
| `apps/mobile/package.json` | Add `arabic-stem` dependency |

### Phase 2 — Downloadable Language Packs

When the user downloads an offline dictionary for a language (SPEC-013), the corresponding tokenizer/lemma pack is **automatically downloaded alongside it** — no separate UI, no manual management. The user only sees one download (the dictionary); the tokenizer is an invisible sidecar.

Nothing is bundled with the app — everything is opt-in via dictionary download and stored in SQLite.

| Downloadable Pack | Language(s) | Size | Auto-Downloaded With |
|---|---|---|---|
| `kuromoji` + IPADIC dict (pruned top 30K) | Japanese | ~3 MB | Japanese offline dictionary |
| `kuromoji-ko` + mecab-ko-dic (pruned) | Korean | ~2 MB | Korean offline dictionary |
| `nlptoolkit-morphologicalanalysis` | Turkish | ~2 MB | Turkish offline dictionary |
| Persian lemma table (Hazm export) | Persian | ~80 KB | Persian offline dictionary |
| `snowball-stemmers` (stemmer fallback) | de, en, es, fr, ga, it, pt, ro, sv, da, nb, nl, hu, fi, hy | ~30 KB each | Respective offline dictionary |
| Pre-built lemma tables | ca, cs, cy, gl, gv, sk, sl, uk, bg, el, et, is, la, lv, lt, nn, pl, sq, hr, ru, ka, sw, ast | ~100–500 KB each | Respective offline dictionary |

**Files to create/modify**:

| File | Change |
|---|---|
| `apps/mobile/lib/tokenizer-db.ts` | **NEW** — SQLite table for downloaded tokenizer/lemma packs, lookup functions |
| `apps/mobile/lib/tokenizer.ts` | Add downloaded-pack lookup to fallback chain |
| `apps/mobile/contexts/DictionaryContext.tsx` | Trigger tokenizer download alongside dict download; call `lemmatizeText()` for offline fallback |
| `packages/shared/src/constants.ts` | Add `TOKENIZER_CONFIG` map: language → tokenizer type + size + download URL |
| SPEC-013 offline dictionary UI | Add tokenizer size to the dictionary download row (e.g., "Dictionary 12 MB + Tokenizer 3 MB") so the user sees the total download size |

### Phase 3 — Advanced Tokenization

Higher-effort improvements, deferred until Phase 1–2 accuracy is evaluated:

1. Integrate `Intl.Segmenter` with `@formatjs/intl-segmenter` polyfill for CJK + Thai + Khmer + Burmese
2. Dictionary-based max matching as fallback using offline dictionary word lists
3. Consider `kuromoji` (pruned dictionary) or `tiny-segmenter` for Japanese
4. Consider `jieba-js` WASM for Chinese only if accuracy of dict-based max matching proves insufficient

**Defer**:
- WASM-based tokenizers (`jieba-js`, etc.) — evaluate if Phase 1–2 accuracy is good enough first
- Stemming rules for agglutinative languages — pre-built tables are simpler and more accurate
- Native module tokenizers — avoid unless pure JS proves too slow

---

## New Server Endpoint

To support local lemmatization, the Python server needs to export lemma tables:

```
GET /lemmatization/export?l2=de&format=json
→ { "table": { "ging": ["gehen"], "lief": ["laufen"], "besser": ["gut"], ... } }
```

This would:
1. Read the appropriate source (LemmatizationList TSV, Simplemma dict, or generate from the dict DB)
2. Filter by frequency (top N words only)
3. Return as compressed JSON

---

## UI: Transparent Auto-Download

Tokenizers have **no dedicated UI**. They are downloaded automatically as a sidecar when the user downloads an offline dictionary (SPEC-013). The user only sees one download — the dictionary.

### What the User Sees

Nothing. The dictionary download UI is unchanged — the tokenizer is downloaded silently in the background as part of the same HTTP request or immediately after the dictionary asset completes. If the language has no downloadable tokenizer (Category E, or Phase 1 regex fallback), no download occurs.

### Tokenizer Lifecycle

| Event | Behavior |
|---|---|
| User downloads offline dictionary (SPEC-013) | Tokenizer/lemma pack downloads in parallel as an invisible sidecar |
| User deletes offline dictionary | Tokenizer is also deleted (no orphaned data) |
| Dictionary download fails | Tokenizer download is cancelled |
| Tokenizer download fails (but dict succeeds) | Dict works offline; tokenizer falls back to regex + surface-as-lemma |
| User switches to a new L2 with no dict | Phase 1 regex fallback applies (server remains primary) |

### Storage Accounting

Tokenizer storage is counted as part of the offline dictionary total in SPEC-013's storage summary. No separate line item.

### i18n Keys Required

**No new i18n keys.** The dictionary download row already uses `label.download_size` from SPEC-013. The combined "Dict X MB + Tokenizer Y MB" string is assembled programmatically from `TOKENIZER_CONFIG` in `packages/shared/src/constants.ts`.

---

## Pros and Cons

### Pros

- **Zero user-facing complexity** — tokenizers download automatically with offline dictionaries; no separate UI to manage
- **Works offline** — subtitles and text can be tokenized without network
- **Instant** — no network latency for tokenization
- **Reduces server load** — fewer `/lemmatize-normalized` calls
- **Complements offline dictionary** (SPEC-013) — together they enable full offline reading
- **Most languages need near-zero code** — regex split + surface-as-lemma covers ~160 languages
- **Intl.Segmenter is built-in on iOS** — zero-cost tokenization for CJK and scriptio continua languages

### Cons

- **Lower lemma accuracy** — pre-built tables won't have 100% coverage of inflected forms
- **New server endpoint** — needs `/lemmatization/export` to be built
- **Download size** — lemma tables add to dictionary download size (though much smaller than the dictionary itself)
- **Maintenance** — lemma tables need to be rebuilt when dictionaries update
- **Coupled lifecycle** — tokenizer is tied to the dictionary; deleting the dict also deletes the tokenizer
- **WASM and native module complexity** — if we go beyond pure JS libraries
- **Android fragmentation** — Hermes doesn't support Intl.Segmenter; needs polyfill

---

## See Also

- [ARCH-018: Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md) — per-language taxonomy, strategy details, and gotchas
- [SPEC-015: Local Tokenization & Lemmatization for Mobile](../specs/015-local-tokenization-mobile.md) — earlier exploration
- [SPEC-013: Mobile Offline Dictionary](../specs/013-mobile-offline-dictionary.md) — download UX pattern this spec follows
- [ARCH-016: Server-Side Tokenization Pipeline](../arch/016-server-tokenization.md) — server tokenizer inventory
- [ADR-0018: Tokenizer Selection](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md) — preference order

## References

- [Intl.Segmenter MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)
- [@formatjs/intl-segmenter polyfill](https://formatjs.io/docs/polyfills/intl-segmenter/)
- [kuromoji.js](https://github.com/takuyaa/kuromoji.js) — Japanese tokenizer (pure JS)
- [tiny-segmenter](https://github.com/SamuraiT/tiny-segmenter) — Tiny Japanese tokenizer
- [jieba-js](https://github.com/fxsjy/jieba) — Chinese tokenizer (WASM port available)
- [thai-segmenter](https://github.com/rayriffy/thai-segmenter) — Thai word segmentation (JS)
- [compromise](https://github.com/spencermountain/compromise) — English NLP (JS)
- [wink-nlp](https://github.com/winkjs/wink-nlp) — English NLP (JS)
- [expo-webassembly](https://docs.expo.dev/versions/latest/sdk/webassembly/) — WASM in Expo
- [Hermes Intl proposal](https://github.com/facebook/hermes/issues/896) — Intl.Segmenter in Hermes
