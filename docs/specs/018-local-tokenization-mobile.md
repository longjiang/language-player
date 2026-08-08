# SPEC-018: Mobile Local Tokenization & Lemmatization

## Metadata
- **Spec ID**: SPEC-018
- **Feature**: On-device tokenization & lemmatization fallback for offline use, with downloadable language packs
- **Status**: draft — Phase 1–2 implemented; Phase 3 partially implemented (3a, 3c, 3d, 3e done; 3b deferred)
- **Created**: 2026-07-26
- **Last updated**: 2026-08-07
- **Supersedes**: [SPEC-016](../specs/016-mobile-local-tokenization.md)
- **See also**:
  - [ARCH-018: Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md) — per-language taxonomy and strategy reference
  - [SPEC-015: Local Tokenization & Lemmatization for Mobile](../specs/015-local-tokenization-mobile.md) — earlier exploration
  - [SPEC-013: Mobile Offline Dictionary](../specs/013-mobile-offline-dictionary.md) — download UX pattern
  - [ARCH-016: Server-Side Tokenization Pipeline](../arch/016-server-tokenization.md)
  - [ADR-0018: Tokenizer Selection — Prefer Simplemma/LemmatizationList over spaCy](../adr/0018-tokenizer-prefer-simplemma-over-spacy.md)
  - [ADR-0008: Mobile Dictionary Architecture — Online Lookup + Offline Download](../adr/0008-go-dictionary-architecture.md)
  - [SPEC-022: Tokenizer Auto-Download UI](../specs/022-tokenizer-auto-download-ui.md) — how tokenizer packs download invisibly alongside dictionaries

---

## Implementation Status

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Regex + surface-as-lemma + Arabic | ✅ Implemented (2026-07-27) | `apps/mobile/lib/tokenizer.ts` — cache → server (3s) → local fallback |
| Phase 2a — Snowball + lemma tables | ✅ Implemented | `tokenizer-db.ts`, `/lemmatization/export`, sidecar download in `DictionaryContext` |
| Phase 2b — Dict max-matching (CJK/SEA) | ✅ Implemented, enhanced 2026-08-07 | Headword set includes simplified `head` + traditional `alternate`; offline lookup matches both scripts; UI counts dict-seg languages as having a local tokenizer |
| Phase 2c — Japanese kuromoji | ✅ Implemented (2026-07-27) | Custom RN loader + IPADIC pack |
| Phase 2d — Korean kuromoji-ko | ✅ Implemented | Same loader pattern + mecab-ko-dic pack |
| Phase 3a — Server data-pack hosting | ✅ Implemented | `/lemmatization/download` + zip archives |
| Phase 3b — Bundled lemma tables | ⏳ Deferred | No bundled assets; lemma tables are download-only |
| Phase 3c — Cache eviction & memory hygiene | ✅ Implemented | LRU lemmatize cache (2000) + dict word-set LRU (3 languages) |
| Phase 3d — Silent error handling | ✅ Implemented | App logger (`logwarn`) with app-wide log gate |
| Phase 3e — Batch endpoint offline fallback | ✅ Implemented | `use-epub-pagination.ts` falls back to `lemmatizeText()` per block |

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
2. Local JS library             →  kuromoji, arabic-stem, snowball-stemmers, etc.
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
│  Level 1: Dictionary-Based Max Matching          │
│  ├─ Uses offline dictionary headwords as word    │
│  │   list (SPEC-013)                             │
│  │   — simplified head + traditional alternate   │
│  ├─ Pure JS, ~200 lines, no dependencies         │
│  └─ For CJK + SEA scriptio continua when the     │
│      offline dictionary is downloaded            │
│                                                  │
│  Level 2: Regex Word Split                       │
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

> **Intl.Segmenter is not used.** Hermes has no native `Intl.Segmenter`, and the `@formatjs/intl-segmenter` polyfill segments each Han character individually (verified 2026-08-07) — it is not a Chinese word tokenizer. Dict max-matching is the implemented CJK/SEA fallback; see [Deferred](#deferred-research-review-2026-08-07).

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

### Phase 1 — Zero-Cost Baseline ✅ IMPLEMENTED

Covers the biggest wins at near-zero bundle cost. **Implemented 2026-07-27** (commit `feat(mobile): Phase 1 — local tokenization fallback`).

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

### Phase 2 — Language-Specific Lemmatizers

Implemented in subphases ordered by effort and risk. Each subphase adds one lemmatizer type; the `lemmatizeText()` fallback chain is extended incrementally. See [ARCH-018](../arch/018-local-tokenization-strategy.md) for the full per-language taxonomy.

#### React Native Compatibility ⚠️

JS NLP libraries written for Node.js may use `fs` or `zlib` — neither exists in RN. Each library needs a different strategy:

| Library | Node APIs Used | RN Solution |
|---|---|---|
| **kuromoji** | `fs`, `zlib` (Node) — but ships a `BrowserDictionaryLoader.js` using `XMLHttpRequest` + JS inflate | ✅ Use browser build with custom loader via `expo-file-system` |
| **kuromoji-ko** | Same architecture; documented `loader` option; official browser/CDN support | ✅ Same pattern as kuromoji |
| **nlptoolkit** | `fs` via `nlptoolkit-dictionary`; no browser build | ❌ Dropped — use snowball-stemmers Turkish |
| **snowball-stemmers** | None — pure algorithmic | ✅ Works natively |
| **arabic-stem** | None | ✅ Working in Phase 1 |

---

#### Phase 2a: Snowball Stemmers + Lemma Tables ✅ IMPLEMENTED

**Goal**: Add offline lemmatization for ~40 languages at zero data-download cost. Snowball stemmers are pure JS (~30 KB each) bundled as one npm package. Lemma tables are small JSON files downloaded silently alongside the offline dictionary.

**Languages covered**: de, en, es, fr, it, pt, ro, sv, da, nb, nl, hu, fi, hy, tr (Snowball, 15 languages) + ca, cs, cy, gl, gv, sk, sl, uk, bg, el, et, is, la, lv, lt, nn, pl, sq, hr, ru, ka, sw, ast, fa (lemma tables, 24 languages).

**npm dependency** (bundled at build time, ~450 KB for all 15 stemmers):
```bash
cd apps/mobile && npm install snowball-stemmers
```

**Snowball stemmers** — pure algorithmic, no data files:
```typescript
import Snowball from 'snowball-stemmers';

const stemmers = new Map<string, (word: string) => string>();
function getSnowballStemmer(lang: string): (word: string) => string {
  if (!stemmers.has(lang)) stemmers.set(lang, Snowball.stemmer(lang));
  return stemmers.get(lang)!;
}
// Usage: getSnowballStemmer('de')('besser') → 'bess' (stem, not lemma — serves lookup)
```

**Lemma tables** — JSON `{surface: [lemma]}` downloaded on dict download, stored in SQLite:
```
GET /lemmatization/export?l2=de&format=json
→ { "table": { "ging": ["gehen"], "lief": ["laufen"], "besser": ["gut"], ... } }
```

The server reads LemmatizationList TSV files (`data/lemmatization-lists/lemmatization-{code}.txt`) and Simplemma Python dictionaries, merges, filters by frequency, and returns as compressed JSON. On the device, the JSON is stored in SQLite and queried via a simple `surface → [lemmas]` lookup.

**Fallback chain order**: Snowball stemmer (if available for the language) → downloaded lemma table lookup → regex + surface-as-lemma.

**Files touched**:

| File | Change |
|---|---|
| `apps/mobile/package.json` | Add `snowball-stemmers` |
| `apps/mobile/lib/tokenizer.ts` | Add `getSnowballStemmer()`, lemma table SQLite lookup |
| `zerotohero-python-server/` | New endpoint: `GET /lemmatization/export?l2=X&format=json` |

---

#### Phase 2b: Chinese Segmentation (Dict Max-Matching) ✅ IMPLEMENTED

**Goal**: Add word segmentation for Chinese (and fallback for Thai, Khmer, Burmese, Lao) using the offline dictionary's own headword list. No npm dependencies, no data download — reuses the existing SPEC-013 offline dictionary.

**Implementation**: Dict max-matching shipped 2026-07-27; both-scripts support, offline alternate lookup, and the UI indicator fix landed 2026-08-07 (commit `c76f1156`).

**How it works**: The offline dictionary SQLite table already contains all headwords for a language. We extract them with `SELECT head FROM dict_{l2} UNION SELECT alternate FROM dict_{l2} WHERE alternate IS NOT NULL AND alternate != ''` and build a `Set<string>`. A forward maximum matching algorithm segments text by finding the longest dictionary match at each position. For unknown characters, emit single-character tokens.

**Both scripts**: CEDICT stores the simplified form in `head` and the traditional form in `alternate` (e.g. 台湾 / 臺灣). The word set includes both, so simplified and traditional source text segment identically. Script conversion stays at the token render layer (ADR-0019), never in the tokenizer. Offline dictionary lookup matches both `head` and `alternate` for the same reason — tapping 臺灣 offline resolves to the same entry as 台湾.

```typescript
function maxMatchSegment(text: string, wordSet: Set<string>, maxWordLen: number): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
    let longestMatch = text[i]!;
    const searchEnd = Math.min(i + maxWordLen, text.length);
    for (let len = searchEnd - i; len >= 1; len--) {
      const candidate = text.slice(i, i + len);
      if (wordSet.has(candidate)) {
        longestMatch = candidate;
        break;
      }
    }
    result.push(longestMatch);
    i += longestMatch.length;
  }
  return result;
}
```

**Accuracy**: ~90% for Chinese (cedict, 125K entries downloaded). ~80-88% for Thai/Khmer/Burmese (varies by dictionary coverage). Chinese characters are always their own lemma (no inflection), so surface-as-lemma is correct.

> **Why not jieba?** jieba is the standard Chinese tokenizer (Python). Its core algorithm IS dictionary-based maximum matching plus an HMM layer for unknown words (~+5% accuracy). JS jieba ports exist (`nodejieba`, `@node-rs/jieba`) but are C++/Rust native bindings — not RN-compatible. WASM ports (`jieba-wasm`) require a WASM runtime that Expo/Hermes does not ship. Research (2026-08-07) confirmed the only jieba options are a native Turbo Module (needs dev builds, unvetted package) or porting a pure-JS engine (~700 lines) plus a ~3 MB downloadable dict pack. Our dict max-matching approach achieves ~90% accuracy with zero additional dependencies by reusing the existing offline dictionary, and including both scripts keeps it usable for simplified and traditional learners alike. If the missing ~5% from HMM proves insufficient in testing, the pure-JS jieba port remains the fallback path.

**Languages covered**: `zh`, `cmn`, `nan`, `hak`, `lzh`, `gan`, `hsn`, `wuu`, `cjy`, `cpx`, `yue` (Chinese varieties) + `th`, `km`, `lo`, `my`, `bo` — all use dict max-matching when the offline dictionary is downloaded, then regex word-split as the final fallback. No Intl.Segmenter involvement.

**Files touched**:

| File | Change |
|---|---|
| `apps/mobile/lib/tokenizer.ts` | Add `loadDictWordSet()` + `maxMatchSegment()`, integrate into fallback chain; word set = `head` UNION `alternate` |
| `apps/mobile/lib/dictionary-db.ts` | Add `alternate` column + index, one-time backfill migration, offline lookup by `head` then `alternate` |
| `apps/mobile/lib/dictionary-download.ts` | Extract `alternate` from each row while streaming NDJSON (and JSON fallback) |
| `apps/mobile/app/(tabs)/(me)/offline-dictionaries.tsx` | Dict-segmentation languages count as having a local tokenizer — no “Cannot make text interactive offline” warning for Chinese |

**UI note**: Because the dictionary IS the tokenizer for Chinese, the offline-dictionaries screen treats `needsDictSegmentation` languages as having local tokenizer support (SPEC-022 rule — no standalone pack, no warning). The warning remains for Category E languages with no strategy at all.

---

#### Phase 2c: Japanese (kuromoji) ✅ IMPLEMENTED

**Goal**: Full morphological analysis (segmentation + lemmatization) for Japanese using kuromoji with a downloaded IPADIC dictionary. This is the highest-complexity subphase — it requires a custom RN file loader.

**Implementation date**: 2026-07-27

**How it works**: Instead of monkey-patching kuromoji's internal loader, we bypass the builder entirely. The custom loader module (`kuromoji-loader.ts`) reads the 17 `.dat.gz` files from the device filesystem, decompresses them with `pako`, populates kuromoji's `DynamicDictionaries` directly, and creates a `Tokenizer` instance. This avoids all CJS/ESM compatibility issues with kuromoji's internal module resolution.

**npm dependency** (bundled at build time, ~200 KB engine):
```bash
cd apps/mobile && npm install kuromoji      # Engine
cd apps/mobile && npm install fflate         # Zip extraction for data pack
# pako is already available as a transitive dependency
```

**Custom RN loader**: Defined in `apps/mobile/lib/kuromoji-loader.ts`. The `loadKuromoji(dicPath)` function:
1. Reads `.dat.gz` files via `expo-file-system` (base64 encoding)
2. Converts base64 → Uint8Array → decompresses with `pako.ungzip()`
3. Creates `DynamicDictionaries` and loads all data (trie, token info, connection costs, unknown dict)
4. Returns a configured `Tokenizer` instance

**Integration**: `tokenizer.ts` has `getJaTokenizer()` (lazy singleton) and `tokenizeJapanese()` in the local fallback chain. When `l2 === 'ja'` and the data pack is downloaded, kuromoji is tried before the generic `segmentText + lemmatizeLocal` path.

**Download flow**: When the user downloads the Japanese offline dictionary, `DictionaryContext` checks `TOKENIZER_CONFIG.ja.needsKuromoji` and fires `downloadKuromojiData('ja', apiUrl)` which downloads a zip archive from `GET /lemmatization/download?l2=ja`, extracts `.dat.gz` files with `fflate`, and stores them in `{documentDirectory}/tokenizers/ja/`.

**Files touched**:

| File | Change |
|---|---|
| `apps/mobile/package.json` | Add `kuromoji`, `fflate` |
| `apps/mobile/lib/kuromoji-loader.ts` | **NEW** — custom RN dictionary loader (reads `.dat.gz` via expo-file-system + pako, populates DynamicDictionaries) |
| `apps/mobile/lib/tokenizer.ts` | Add `getJaTokenizer()`, `resetJaTokenizer()`, `tokenizeJapanese()`; integrate into fallback chain for `l2 === 'ja'` |
| `apps/mobile/lib/tokenizer-db.ts` | Add `hasKuromojiData()`, `getKuromojiDataPath()`, `downloadKuromojiData()`, `deleteKuromojiData()` |
| `apps/mobile/contexts/DictionaryContext.tsx` | After JP dict download, download IPADIC data pack; clean up on dict delete |
| `packages/shared/src/constants.ts` | Add `needsKuromoji` + `tokenizerDataSize` to `TokenizerConfig`; add `ja` entry to `TOKENIZER_CONFIG` |

---

#### Phase 2d: Korean (kuromoji-ko) ✅ IMPLEMENTED

**Goal**: Full morphological analysis for Korean using kuromoji-ko with a downloaded mecab-ko-dic dictionary. Same custom-loader pattern as Japanese.

**npm dependency** (bundled at build time, ~200 KB engine):
```bash
cd apps/mobile && npm install kuromoji-ko
```

**Downloaded data**: mecab-ko-dic pre-built binary `.dat` files (~2 MB pruned). Requires a one-time server-side build step:
```bash
npm run build:dict -- ./mecab-ko-dic ./dict
```
Zip the output and host at `GET /lemmatization/download?l2=ko`.

**Custom loader**: Same pattern as kuromoji — `kuromojiKo.builder({ dicPath, loader: createRNLoader() })`.

```typescript
const koTokenizer = await kuromojiKo.builder({
  dicPath: '/data/tokenizers/ko/',
  loader: createRNLoader(),
}).build();

const tokens = koTokenizer.tokenize('먹었겠습니다');
// tokens[0].surface_form = '먹', tokens[0].basic_form = '먹다' (via expression decomposition)
```

**Files touched**:

| File | Change |
|---|---|
| `apps/mobile/package.json` | Add `kuromoji-ko` |
| `apps/mobile/lib/tokenizer.ts` | Add `getKoTokenizer()`, integrate into fallback chain |
| `apps/mobile/contexts/DictionaryContext.tsx` | After KO dict download, download mecab-ko-dic data pack |
| `packages/shared/src/constants.ts` | Add KO entry to `TOKENIZER_CONFIG` |

---

#### Download Flow (all data-download subphases)

When the user downloads an offline dictionary (SPEC-013):

1. Dictionary download completes (user-visible)
2. Check `TOKENIZER_CONFIG[l2]` for a data pack URL
3. If a data pack exists, download silently to device filesystem (kuromoji needs `.dat` on disk; lemma tables go to SQLite)
4. Store metadata in the offline dictionary SQLite row: `tokenizer_ready = 1`, `tokenizer_path = '/data/...'`
5. On next `lemmatizeText()` call, the engine loads from local path

If data download fails, tokenization falls back to Phase 1 regex + surface-as-lemma. Dictionary still works.

#### Final Fallback Chain (after all subphases)

```
lemmatizeText(text, l2)
  │
  ├─ 1. In-memory cache
  ├─ 2. POST /lemmatize-normalized (server, 3s timeout)
  │
  ├─ 3. Local fallback (checked in order, first available wins):
  │      ├─ kuromoji + IPADIC dict (ja) ──────→ segmented + lemmatized
  │      ├─ kuromoji-ko + mecab-ko-dic (ko) ──→ segmented + lemmatized
  │      ├─ dict max-matching (zh, th, km, lo, my, bo) ──→ segmented
  │      ├─ snowball stemmer (de, en, es, fr, ...) ──→ stemmed
  │      ├─ lemma table lookup (ca, cs, ru, ...) ──→ lemmatized
  │      ├─ arabic-stem (ar) ──→ stemmed
  │      └─ regex word-split + surface-as-lemma ──→ baseline (always works)
  │
  └─ 4. Return result
```

#### Files to Create/Modify (cumulative)

| File | Change |
|---|---|
| `apps/mobile/package.json` | Add `snowball-stemmers`, `kuromoji`, `kuromoji-ko` |
| `apps/mobile/lib/tokenizer.ts` | Add all engine singletons, custom RN loaders, max-matching segmenter, lemma lookup, extended fallback chain |
| `apps/mobile/lib/tokenizer-db.ts` | **NEW** — track downloaded dict data, provide paths to engines |
| `apps/mobile/contexts/DictionaryContext.tsx` | After dict download, check `TOKENIZER_CONFIG` and download data pack if available |
| `packages/shared/src/constants.ts` | Add `TOKENIZER_CONFIG` map: language → subphase + data pack URL + size |
| `zerotohero-python-server/` | New endpoint: `GET /lemmatization/export?l2=X&format=json`; host dict zip archives |

---

### Phase 3 — Hardening & Polish

**Goal**: Close the remaining gaps identified during implementation review. Includes server-side data pack hosting, cache hygiene, silent error handling, batch endpoint offline fallback, and two architecture-level items from the offline chain that were deferred during earlier phases.

#### Phase 3a: Server Data Pack Hosting (`/lemmatization/download`)

**Why**: The mobile app's `downloadKuromojiData()` calls `${apiUrl}/lemmatization/download?l2=ja` (and `?l2=ko`) to fetch IPADIC/mecab-ko-dic zip archives, but **this endpoint does not exist**. The `/lemmatization/export` endpoint for lemma tables is implemented, but the zip-serving download endpoint was never wired.

**Step 1**: Create the Flask endpoint in `zerotohero-python-server/routes/text_routes.py`:

```python
@text_bp.route('/lemmatization/download')
def lemmatization_download_endpoint():
    """Download a tokenizer data pack zip archive for offline mobile use.

    GET /lemmatization/download?l2=ja

    Serves pre-built zip archives containing binary dictionary files
    (.dat.gz) for kuromoji (Japanese) and kuromoji-ko (Korean) tokenizers.
    The zip is extracted on the device by downloadKuromojiData() in
    apps/mobile/lib/tokenizer-db.ts.

    Query Parameters:
        l2 — Language code ('ja' or 'ko')

    Response: zip archive (application/zip) with .dat.gz files inside.

    Returns 404 if no data pack is available for the language.
    """
    l2 = request.args.get('l2', '')
    if not l2:
        return jsonify({"error": "Missing required parameter: l2"}), 400

    # Map language code to zip file path
    ZIP_PATHS = {
        'ja': 'data/tokenizer-packs/kuromoji-ipadic.zip',
        'ko': 'data/tokenizer-packs/mecab-ko-dic.zip',
    }
    zip_path = ZIP_PATHS.get(l2)
    if not zip_path or not os.path.exists(zip_path):
        return jsonify({"error": f"No tokenizer data pack available for language: {l2}"}), 404

    from flask import send_file
    return send_file(zip_path, mimetype='application/zip',
                     as_attachment=True,
                     download_name=f'tokenizer-{l2}.zip')
```

**Step 2**: Build and place the IPADIC zip for Japanese.

The kuromoji npm package ships IPADIC dictionary files in `node_modules/kuromoji/dict/`. These are the `.dat.gz` files (base.dat.gz, check.dat.gz, tid.dat.gz, etc.) that the mobile loader reads. Create the zip:

```bash
cd /tmp
mkdir kuromoji-ipadic
# Copy dictionary files from a fresh kuromoji install
cp -r node_modules/kuromoji/dict/*.dat.gz kuromoji-ipadic/
cd kuromoji-ipadic && zip -r ../kuromoji-ipadic.zip .
cp kuromoji-ipadic.zip /path/to/zerotohero-python-server/data/tokenizer-packs/
```

**Step 3**: Build and place the mecab-ko-dic zip for Korean.

kuromoji-ko requires building the dictionary from mecab-ko-dic source files. The spec references a build command:

```bash
cd apps/mobile
# mecab-ko-dic source is bundled with kuromoji-ko
npx kuromoji-ko-build-dict --src ./node_modules/kuromoji-ko/dict/mecab-ko-dic --dst ./build/ko-dict
cd build/ko-dict && zip -r ../../mecab-ko-dic.zip .
cp mecab-ko-dic.zip /path/to/zerotohero-python-server/data/tokenizer-packs/
```

Verify both archives contain the expected files (base.dat.gz, check.dat.gz, tid.dat.gz, tid_pos.dat.gz, tid_map.dat.gz, cc.dat.gz, unk.dat.gz, unk_pos.dat.gz, unk_map.dat.gz, unk_char.dat.gz, unk_compat.dat.gz, unk_invoke.dat.gz).

**Step 4**: Verify end-to-end:

```bash
# Start the Flask server
cd zerotohero-python-server && python3.10 app.py &

# Download JA pack
curl -o /tmp/test-ja.zip "http://127.0.0.1:5001/lemmatization/download?l2=ja"
unzip -l /tmp/test-ja.zip  # Should show .dat.gz files

# Download KO pack
curl -o /tmp/test-ko.zip "http://127.0.0.1:5001/lemmatization/download?l2=ko"
unzip -l /tmp/test-ko.zip  # Should show .dat.gz files

# Unavailable language returns 404
curl -w "%{http_code}" "http://127.0.0.1:5001/lemmatization/download?l2=de"  # → 404
```

**Files touched**:

| File | Change |
|---|---|
| `zerotohero-python-server/routes/text_routes.py` | Add `/lemmatization/download` endpoint |
| `zerotohero-python-server/data/tokenizer-packs/` | **NEW** — directory for zip archives |
| `zerotohero-python-server/data/tokenizer-packs/kuromoji-ipadic.zip` | **NEW** — IPADIC dictionary zip |
| `zerotohero-python-server/data/tokenizer-packs/mecab-ko-dic.zip` | **NEW** — mecab-ko-dic zip |

---

#### Phase 3b: Pre-Built Lemma Tables (Level 1 — Bundled Assets)

**Why**: The architecture diagram (Offline Fallback Chains → Lemmatization Level 1) describes "Top 10 languages bundled as assets" providing instant offline lemmatization on first launch, before any dictionary download. Currently all lemma tables are Level 2 (downloaded on demand), so the first-offline-launch experience for inflected languages falls straight to snowball stems or surface-as-lemma.

**Which 10 languages**: The top 10 by user base (estimated from SUPPORTED_L2 popularity):
`en`, `es`, `fr`, `de`, `pt`, `it`, `ru`, `ja`, `ko`, `zh`

Of these:
- `en`, `es`, `fr`, `de`, `pt`, `it`, `ru` have Snowball + Lemma Table data
- `ja`, `ko` have kuromoji (data pack, not bundled — already handled by Phase 3a)
- `zh` has dict-based segmentation (no lemma table needed — surface = lemma)

So bundled lemma tables are needed for: **en, es, fr, de, pt, it, ru** (7 languages, ~150 KB gzipped each ≈ ~1 MB total)

**Step 1**: Generate lemma table JSON files server-side and save as app assets.

```bash
# Generate lemma tables for each language using the /lemmatization/export endpoint
cd zerotohero-python-server && python3.10 -c "
from lemmatize_export import export_table
import json, gzip

LANGS = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ru']
for l2 in LANGS:
    result = export_table(l2)
    compressed = gzip.compress(json.dumps(result['table'], ensure_ascii=False).encode('utf-8'))
    path = f'exported-lemma-tables/lemmas-{l2}.json.gz'
    with open(path, 'wb') as f:
        f.write(compressed)
    print(f'{l2}: {len(result[\"table\"])} entries, {len(compressed)} bytes gzipped')
"
```

**Step 2**: Add the generated gzipped JSON files to the mobile app as bundled assets.

```bash
mkdir -p apps/mobile/assets/lemma-tables/
cp zerotohero-python-server/exported-lemma-tables/lemmas-*.json.gz apps/mobile/assets/lemma-tables/
```

**Step 3**: Update `loadDictWordSet` pattern — add a `loadBundledLemmaTable()` function in `tokenizer.ts` or `tokenizer-db.ts` that reads from bundled assets first before attempting a server download:

```typescript
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

/**
 * Check if a bundled lemma table exists for the language.
 * The top 7 inflected languages (en, es, fr, de, pt, it, ru) have
 * pre-built tables shipped with the app (~1 MB total).
 */
async function hasBundledLemmaTable(l2: string): Promise<boolean> {
  try {
    const asset = Asset.fromModule(
      require(`../assets/lemma-tables/lemmas-${l2}.json.gz`)
    );
    await asset.downloadAsync(); // Copies from .app bundle to cache if needed
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a bundled lemma table from app assets into the SQLite lemma table.
 * Called on first launch for the top 7 inflected languages.
 * Once loaded, subsequent lookups use the SQLite path (same as downloaded).
 */
async function loadBundledLemmaTable(l2: string): Promise<boolean> {
  try {
    const asset = Asset.fromModule(
      require(`../assets/lemma-tables/lemmas-${l2}.json.gz`)
    );
    await asset.downloadAsync();

    // Read the gzipped JSON from the local asset URI
    const base64 = await FileSystem.readAsStringAsync(asset.localUri!, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryStr = atob(base64);
    const compressed = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      compressed[i] = binaryStr.charCodeAt(i);
    }

    // Decompress gzip
    const pako = await import('pako');
    const decompressed = pako.ungzip(compressed, { to: 'string' }) as string;
    const table = JSON.parse(decompressed) as Record<string, string[]>;

    // Store in SQLite (reuses the same storeLemmaTable path as downloaded tables)
    const { storeLemmaTable } = await import('@/lib/tokenizer-db');
    const entries: Array<[string, string[]]> = Object.entries(table);
    await storeLemmaTable(l2, entries);

    return true;
  } catch {
    return false;
  }
}
```

**Step 4**: Integrate `loadBundledLemmaTable()` into the tokenizer initialization. Call it once on first `lemmatizeText()` invocation for supported languages, before checking `hasLemmaTable()`:

```typescript
// In lemmatizeLocal(), before checking tableReady:
if (!tableReady && config?.hasLemmaTable && !lemmaBootstrapAttempted.has(l2)) {
  lemmaBootstrapAttempted.add(l2);
  // Fire-and-forget — doesn't block the current call
  loadBundledLemmaTable(l2).catch(() => {});
}
```

**Step 5**: Add `expo-asset` to `apps/mobile/package.json` if not already present:

```bash
cd apps/mobile && npm install expo-asset
```

**Files touched**:

| File | Change |
|---|---|
| `apps/mobile/assets/lemma-tables/lemmas-*.json.gz` | **NEW** — 7 gzipped JSON files |
| `apps/mobile/lib/tokenizer.ts` | Add `hasBundledLemmaTable()`, `loadBundledLemmaTable()`, bootstrap integration |
| `apps/mobile/package.json` | Add `expo-asset` |

---

#### Phase 3c: Cache Eviction & Memory Hygiene

**Why**: Several in-memory caches in `tokenizer.ts` have no eviction policy:

| Cache | Type | Size per entry | Risk |
|---|---|---|---|
| `lemmatizeCache` | `Map<string, LemmatizedToken[]>` | ~1–5 KB (sentence of tokens) | Low — 500 entries ≈ 1–2.5 MB |
| `dictWordSets` | `Map<string, Set<string>>` | ~1–2 MB (entire dictionary headword list) | **High** — 5 downloaded CJK languages ≈ 5–10 MB |
| `lemmatizeInflight` | `Map<string, Promise<...>>` | ~100 bytes each, transient | None — entries self-delete after resolution |
| `snowballStemmers` | `Map<string, function>` | ~30 KB each, max 15 | None — fixed ceiling |
| `dictMaxWordLen` | `Map<string, number>` | 8 bytes each | None — trivial |

**Review finding (2026-07-27, updated 2026-08-07)**: `lemmatizeCache` entries are tiny — 500 entries ≈ 1–2.5 MB, negligible on modern phones. The real unbounded memory risk is `dictWordSets`, which loads every headword from the offline dictionary SQLite into a `Set<string>`. A Chinese download is now ~120K distinct simplified heads plus ~77K traditional alternates (~200K strings), so this cache is the dominant one and must stay capped. This was not addressed in the original plan.

**Step 1**: Add LRU eviction to `lemmatizeCache` (belt-and-suspenders, low priority):

```typescript
const MAX_LEMMATIZE_CACHE = 2000;  // ~2–10 MB worst case, large enough to be useful

function cacheSet(key: string, value: LemmatizedToken[]): void {
  if (lemmatizeCache.size >= MAX_LEMMATIZE_CACHE) {
    const firstKey = lemmatizeCache.keys().next().value;
    if (firstKey !== undefined) lemmatizeCache.delete(firstKey);
  }
  lemmatizeCache.set(key, value);
}

function cacheGet(key: string): LemmatizedToken[] | undefined {
  const value = lemmatizeCache.get(key);
  if (value !== undefined) {
    // Re-insert to promote to most-recent (LRU via Map insertion order)
    lemmatizeCache.delete(key);
    lemmatizeCache.set(key, value);
  }
  return value;
}
```

**Step 2**: Replace all `lemmatizeCache.set()`/`.get()` calls with `cacheSet()`/`cacheGet()` (5 call sites).

**Step 3**: **(Higher priority)** Add LRU eviction to `dictWordSets` — keep only the last 3 languages:

```typescript
const MAX_DICT_WORD_SETS = 3;  // ~3–6 MB max

async function loadDictWordSet(l2: string): Promise<{ wordSet: Set<string>; maxWordLen: number } | null> {
  // ... existing code ...

  // Evict oldest language if at capacity (before inserting new one)
  if (dictWordSets.size >= MAX_DICT_WORD_SETS) {
    const firstKey = dictWordSets.keys().next().value;
    if (firstKey !== undefined) {
      dictWordSets.delete(firstKey);
      dictMaxWordLen.delete(firstKey);
    }
  }

  dictWordSets.set(l2, wordSet);
  dictMaxWordLen.set(l2, maxWordLen);
  return { wordSet, maxWordLen };
}
```

**Files touched**:

| File | Change |
|---|---|
| `apps/mobile/lib/tokenizer.ts` | Add `cacheSet()`/`cacheGet()` for lemmatizeCache; add dictWordSets eviction (max 3 langs) |

---

#### Phase 3d: Silent Error Handling

**Why**: The spec's Error Handling Strategy says "Server errors are silent — no toast, no console noise for offline scenarios." But the kuromoji loader logs `console.warn` on init errors and tokenize errors. In airplane mode or during data pack download failures, these warnings are expected behavior and should not pollute the console.

**Review finding (2026-07-27)**: Deleting the warnings outright makes debugging harder — when kuromoji silently fails in development, there's no clue why. Gate with `__DEV__` instead so warnings are visible during development but suppressed in production builds.

**Step 1**: Gate `console.warn` calls with `__DEV__` in `tokenizer.ts` (3 locations):

```typescript
// Line 471 — kuromoji init error:
if (__DEV__) console.warn(`[Tokenizer] kuromoji (${l2}) init error:`, e);

// Line 538 — kuromoji tokenize error:
if (__DEV__) console.warn('[Tokenizer] kuromoji tokenize error:', e);

// Line 607 — kuromoji-ko tokenize error:
if (__DEV__) console.warn('[Tokenizer] kuromoji-ko tokenize error:', e);
```

`__DEV__` is a global boolean set by Metro/Expo — `true` in dev builds, `false` in release builds. No import needed.

**Files touched**:

| File | Change |
|---|---|
| `apps/mobile/lib/tokenizer.ts` | Add `__DEV__` guard to 3 `console.warn` lines in kuromoji error handlers |

---

#### Phase 3e: Batch Endpoint Offline Fallback

**Why**: `apps/mobile/hooks/use-epub-pagination.ts` calls `POST /lemmatize-normalized/batch` directly via `fetch()`. When offline, this request fails silently and tokens aren't cached — the reader chapter text appears without interactive tokenization. Unlike `lemmatizeText()`, this batch path has no offline fallback chain.

**Review finding (2026-07-27) — Pagination order is correct**: The original spec asked to verify whether tokenization happens before pagination. It does NOT. The execution order is: parse text → measure all blocks → compute page breaks (`pageBreaks[]`) → set `hasMeasured = true` → batch-tokenize ONLY `visibleBlocks` (current page). The `visibleBlocks` useMemo depends on `pageBreaks` and `page`, so it always returns the correctly sliced page. The batch-lemmatize effect guards on `hasMeasured`, which is set in the same render as `pageBreaks`. There is no race condition.

The actual gap is simply that when offline, `.catch(() => {})` swallows the error and no tokens are populated. The fix is simpler than adding a new `lemmatizeTextBatch()` function — just call `lemmatizeText()` in the existing `.catch()` handler. `lemmatizeText()` already has the full server-first-then-local-fallback chain, and `lemmatizeInflight` deduplication handles concurrent calls for identical text.

**Step 1**: Update the `.catch()` handler in `use-epub-pagination.ts` to fall back to per-text `lemmatizeText()`:

```typescript
// In use-epub-pagination.ts, the batch-lemmatize useEffect (~line 167).
// Replace the bare .catch(() => {}) with an offline fallback:

fetch(`${PYTHON_API_URL}/lemmatize-normalized/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ texts: missing.map(m => m.text), l2: l2Code }),
})
  .then(res => res.json())
  .then(data => {
    if (tokenLoadGenRef.current !== gen) return;
    const results: LemmatizedToken[][] = data?.results ?? [];
    setTokenCache(prev => {
      const next = { ...prev };
      missing.forEach((m, i) => { if (results[i]) next[m.idx] = results[i]!; });
      return next;
    });
  })
  .catch(async () => {
    // Offline fallback: lemmatizeText() has server-first-then-local chain.
    // lemmatizeInflight dedup handles concurrent calls for identical text.
    if (tokenLoadGenRef.current !== gen) return;
    const { lemmatizeText } = await import('@/lib/tokenizer');
    const results = await Promise.all(
      missing.map(m => lemmatizeText(m.text, l2Code))
    );
    if (tokenLoadGenRef.current !== gen) return;
    setTokenCache(prev => {
      const next = { ...prev };
      missing.forEach((m, i) => { if (results[i]) next[m.idx] = results[i]!; });
      return next;
    });
  })
  .finally(() => {
    if (tokenLoadGenRef.current === gen) setLoadingTokens(false);
  });
```

> **Why not `lemmatizeTextBatch()`?** A dedicated batch function would add ~65 lines to `tokenizer.ts` for logic that already exists in `lemmatizeText()`. The batch endpoint's value is reducing N HTTP round-trips to 1 — but in the offline fallback path there's no server to talk to, so `Promise.all` of N local calls is effectively free. The `lemmatizeInflight` dedup map already prevents duplicate work when blocks share identical text.

**Files touched**:

| File | Change |
|---|---|
| `apps/mobile/hooks/use-epub-pagination.ts` | Replace `.catch(() => {})` with offline fallback calling `lemmatizeText()` per-text |

---

#### Phase 3 Summary

| Subphase | What | Why | Effort |
|---|---|---|---|
| **3a** ✅ | Server data pack hosting (`/lemmatization/download`) | JA/KO tokenizer packs can't download — endpoint + zips missing | Medium |
| **3b** ⏳ | Pre-built bundled lemma tables (Level 1) | Top 7 langs get instant offline lemmatization without any download | Medium |
| **3c** ✅ | Cache eviction: `lemmatizeCache` (LRU, max 2000) + **`dictWordSets` (LRU, max 3)** | Prevents unbounded memory growth; `dictWordSets` is the higher risk (a full Chinese set is ~120K simplified + ~77K traditional heads) | Small |
| **3d** ✅ | Silent error handling | Kuromoji init/tokenize failures route through the app-wide `logwarn()` logger (gated by the log switch) instead of raw `console.warn` | Trivial |
| **3e** ✅ | Batch endpoint offline fallback | `use-epub-pagination.ts` catches batch failure and re-tokenizes visible blocks with `lemmatizeText()` | Trivial |

**Status**: 3a, 3c, 3d, 3e implemented; 3b remains deferred (no bundled lemma-table assets — tables are download-only).
**Server assets**: 2 zip archives (kuromoji-ipadic, mecab-ko-dic) ✅; 7 gzipped lemma-table JSONs not built.

#### Deferred (research review 2026-08-07)

- **Intl.Segmenter** — not viable for Chinese on Hermes: no native support, and the `@formatjs/intl-segmenter` polyfill emits one segment per Han character (verified 2026-08-07). Keep it out of the CJK path.
- **WASM tokenizers** (`jieba-wasm`) — blocked: Expo/Hermes has no WASM runtime (`expo-webassembly` is not published on npm as of 2026-08-07). Revisit only if a supported runtime ships.
- **Jieba (pure-JS port or native module)** — `react-native-jieba` (cppjieba Turbo Module) fits RN 0.86/New Architecture but is brand-new/unvetted and forces development builds; a pure-JS port of `jieba-node` (~700 lines) plus a ~3 MB downloadable dict pack would match server accuracy but adds memory/effort. Decision: keep dict max-matching (with both scripts) as the offline fallback; revisit if the ~5% HMM gap proves insufficient.

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

Tokenizer/lemma packs download automatically as invisible sidecars when the user downloads an offline dictionary. See [SPEC-022: Tokenizer Auto-Download UI](../specs/022-tokenizer-auto-download-ui.md) for the full lifecycle, storage accounting, and i18n details.

---

## Pros and Cons

### Pros

- **Zero user-facing complexity** — tokenizers download automatically with offline dictionaries; no separate UI to manage
- **Works offline** — subtitles and text can be tokenized without network
- **Instant** — no network latency for tokenization
- **Reduces server load** — fewer `/lemmatize-normalized` calls
- **Complements offline dictionary** (SPEC-013) — together they enable full offline reading
- **Most languages need near-zero code** — regex split + surface-as-lemma covers ~160 languages
- **Chinese needs no extra download** — the offline dictionary IS the tokenizer (dict max-matching, both scripts)

### Cons

- **Lower lemma accuracy** — pre-built tables won't have 100% coverage of inflected forms
- **New server endpoint** — needs `/lemmatization/export` to be built
- **Download size** — lemma tables add to dictionary download size (though much smaller than the dictionary itself)
- **Maintenance** — lemma tables need to be rebuilt when dictionaries update
- **Coupled lifecycle** — tokenizer is tied to the dictionary; deleting the dict also deletes the tokenizer
- **WASM and native module complexity** — if we go beyond pure JS libraries
- **Hermes lacks Intl.Segmenter** — and the pure-JS polyfill is per-character for Chinese, so dict max-matching is the real CJK fallback

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
- [jieba](https://github.com/fxsjy/jieba) — Chinese tokenizer (Python; server uses dict.txt.big)
- [jieba-node](https://www.npmjs.com/package/jieba-node) — pure-JS jieba port (Node-only loader; core is RN-portable)
- [react-native-jieba](https://github.com/leonsilicon/react-native-jieba) — cppjieba Turbo Module (RN 0.85+, New Architecture)
- [thai-segmenter](https://github.com/rayriffy/thai-segmenter) — Thai word segmentation (JS)
- [compromise](https://github.com/spencermountain/compromise) — English NLP (JS)
- [wink-nlp](https://github.com/winkjs/wink-nlp) — English NLP (JS)
- [Hermes Intl proposal](https://github.com/facebook/hermes/issues/896) — Intl.Segmenter in Hermes
