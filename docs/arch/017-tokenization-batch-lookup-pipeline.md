# Tokenization & Batch Lookup Pipeline

## Metadata
- **Arch ID**: ARCH-017
- **Feature**: Lemmatization, dictionary batch lookup, and request optimization strategies
- **Status**: draft
- **Created**: 2026-07-26
- **ROADMAP Phase**: Cross-cutting (all phases)
- **Scope**: Web (Next.js), Mobile (React Native/Expo), Python (Flask)

---

## Overview

The tokenization pipeline converts natural-language text into clickable, annotated word tokens. Each token carries lemmas, pronunciation, and links to dictionary entries. The pipeline has three layers:

1. **Lemmatization** — text → `LemmatizedToken[]` (surface form, lemmas, pronunciation)
2. **Batch dictionary lookup** — unique lemmas → `DictionaryEntry[]` (definitions, levels, hanja/hán tự)
3. **Token rendering** — annotated display with ruby text, interlinear gloss, quiz blanking, script variants

The challenge is doing this efficiently at scale — a single video transcript can have 500+ subtitle lines, each needing tokenization and dictionary lookups. Without optimization, this means 500+ API calls and thousands of dictionary queries.

```
                       POST /lemmatize-normalized
  Raw text ──────────────────────────────────────→ LemmatizedToken[]
                         (single or batch)

                       GET /lemmatize-video-normalized
  Video subtitles ───────────────────────────────→ TokenCache
                       (pre-computed, md5-keyed)

                       POST /dictionary/lookup-batch
  Unique lemmas ─────────────────────────────────→ DictionaryEntry[]
                       (one request, all words)
```

---

## Layer 1: Lemmatization

### Backend Endpoints (Flask)

**File:** `zerotohero-python-server/routes/text_routes.py`

| Endpoint | Method | Input | Output | Used by |
|---|---|---|---|---|
| `/lemmatize-normalized` | POST | `{ text, l2 }` | `{ tokens: LemmatizedToken[] }` | TokenizedText (per-line fallback) |
| `/lemmatize-normalized/batch` | POST | `{ texts[], l2 }` | `{ results: LemmatizedToken[][] }` | EPUB reader (per-page blocks) |
| `/lemmatize-video-normalized` | GET | `?video_id=X&lang=Y` | `{ md5_hash: { tokens } }` | Video subtitle pre-cache |

**Lemmatizer dispatch:** `lemmatize_unified.lemmatize()` routes to language-specific lemmatizers:
- `zh`/`yue` → Jieba (Chinese segmentation + pinyin/jyutping)
- `ja` → MeCab (morphological analysis + kana readings)
- `ko` → OKT (Korean morphological analysis)
- `hr` → spaCy
- Most European languages → Simplemma
- `ca`/`de`/`en`/`es`/`fr`/`it`/`pt`/`ro`/`sv`/`uk` → LemmatizationLists (static dictionaries)

**Post-processing:** `_recover_spaces()` reconstructs whitespace tokens from the original text. `_romanize_if_needed()` adds pronunciation via the `romanize` module (language-specific romanizers for Cyrillic, Greek, Thai, etc.).

**Video cache storage:** `/lemmatize-video-normalized` caches results on disk via `utils_cache.py` (`load_from_lemmatized_subs_cache` / `save_to_lemmatized_subs_cache`). Keys are MD5 hashes of original subtitle lines. This wraps the legacy `/lemmatize-video` endpoint and normalizes output via `normalize_by_lang()`.

### Response Shape

```typescript
// LemmatizedToken (packages/shared/src/types.ts)
interface LemmatizedToken {
  text: string;        // surface form as in text
  lemmas: Lemma[];     // empty = non-word (space, punctuation)
  pronunciation?: string | null;
}

interface Lemma {
  lemma: string;
  part_of_speech?: string;
  pronunciation?: string;
}
```

---

## Layer 2: Dictionary Batch Lookup

### Backend Endpoint

**File:** `zerotohero-python-server/routes/dictionary.py`

```
POST /dictionary/lookup-batch
Request:  { "words": [{ "text": "吃饭", "l2": "zh", "l1": "en" }, ...] }
Response: { "results": { "吃饭": [DictionaryEntry, ...], ... } }
```

Each word is looked up independently via `_lookup_word()`:
1. Load language-appropriate dictionary (EDICT for ja, CEDICT for zh, etc.)
2. Try exact match → lemma match → fuzzy match
3. Chinese: retry with simplified if traditional lookup fails (OpenCC `t2s`)
4. LLM fallback (`_llm_lookup`) if no entries found
5. If L1 is not English, translate definitions to user's L1

### Client-Side Cache

**Files:** `apps/web/src/lib/dictionary-cache.ts`, `apps/mobile/lib/dictionary-cache.ts`

Both platforms use an identical shared cache module:

```typescript
// In-memory cache: l2Code:text → DictionaryEntry[]
const cache = new Map<string, DictionaryEntry[]>();
let _cacheVersion = 0;  // monotonic counter for invalidation

export function getCachedEntries(l2Code: string, text: string): DictionaryEntry[] | undefined
export function setCachedEntries(l2Code: string, text: string, entries: DictionaryEntry[]): void
export function getCacheVersion(): number
export async function bulkLookupWords(words: { text, l2Code, l1Code }[]): Promise<void>
```

**Cache key:** `${l2Code}:${text}` — lemma text is language-specific since the same string can mean different things in different languages.

### In-Flight Request Deduplication

```typescript
const _inflightRequests = new Map<string, Promise<void>>();

// When many TokenizedText instances mount simultaneously with the same lemmas,
// only one request is made — subsequent callers reuse the in-flight promise.
const batchKey = uncached.length === 1
  ? `1:${l2Code}:${text}`    // single word
  : `N:${count}:${l2Code}`;  // multi-word batch

const existing = _inflightRequests.get(batchKey);
if (existing) return existing;  // reuse
```

This is critical in transcript mode where 500+ `TokenizedText` instances all try to pre-populate the same dictionary cache with the same set of unique words.

### DictionaryEntry Shape (for rendering)

```typescript
interface DictionaryEntry {
  definitions: string[];       // L1 translations
  han_script?: {
    hanja?: string | null;     // Korean hanja
    hantu?: string | null;     // Vietnamese hán tự
    traditional?: string;      // Chinese traditional
    simplified?: string;       // Chinese simplified
  } | null;
  levels?: {                   // proficiency grading
    scale: string;             // 'hsk_2010', 'cefr', 'jlpt'
    value: number | string;    // 3, 'B1', 'N4'
    numeric: number;           // 1–7 normalized across all scales
  }[] | null;
  frequencyLevel?: number;     // 1–7 from Zipf thresholds
}
```

---

## Layer 3: Token Rendering (Web)

### Component Architecture (Web)

```
TokenizedText (container)
├── IntersectionObserver ← lazy loading
├── Lemmatize cache + in-flight dedup
├── Traditional Chinese conversion (OpenCC)
├── Batch dictionary lookup (bulkLookupWords)
├── Saved words context (isSaved per token)
└── TokenSpan × N (individual tokens)
    ├── Ruby text (<ruby> + <rt>)
    ├── Byeonggi (hanja/hán tự from dict cache)
    ├── Quiz blanking (blank → tap → reveal)
    ├── QuickGloss (first definition for saved words)
    ├── HardWords filter (phonetics only on difficult words)
    ├── Interlinear gloss (definition.show)
    └── Karaoke highlight (isKaraokeSpoken dimming)
```

**File:** `apps/web/src/components/tokenized-text.tsx` (418 lines)
**File:** `apps/web/src/components/token-span.tsx` (260 lines)

### Lazy Loading Strategy (Web)

The web app uses `IntersectionObserver` with `rootMargin: '200px'`:

```
                         viewport
              ┌──────────────────────────┐
              │                          │
              │   Visible subtitles      │  ← already tokenized
              │                          │
              │──────────────────────────│  ← viewport bottom
              │   rootMargin: 200px      │
              │   (pre-load zone)        │  ← tokenizing now
              │                          │
              │   Off-screen subtitles   │  ← plain text, not tokenized yet
              │                          │
              └──────────────────────────┘
```

- Tokenization starts 200px **before** the element enters the viewport
- Once `hasBeenVisible` flips to `true`, the observer disconnects permanently — the element stays tokenized
- Before visible: renders plain text with `animate-pulse` loading indicator

### Request Optimization Chain (Web)

When a `TokenizedText` instance mounts:

```
1. PRELOADED? ──yes──→ Use `tokens` prop directly, skip API
     │
     no
     ▼
2. TOKEN CACHE WAITING? ──yes──→ Render plain text dummy, wait for tokenCacheLoaded
     │
     no
     ▼
3. VIDEO TOKEN CACHE? ──hit──→ Use cached LemmatizedToken[], add to in-memory cache
     │
     miss
     ▼
4. IN-MEMORY CACHE? ──hit──→ Use cached LemmatizedToken[]
     │
     miss
     ▼
5. IN-FLIGHT DEDUP? ──hit──→ Reuse existing Promise<LemmatizedToken[]>
     │
     miss
     ▼
6. POST /lemmatize-normalized ──→ Fetch from server, cache the result
```

After tokens are loaded (any path above):

```
7. GATHER UNIQUE LEMMAS ──→ Extract all lemma.lemma + token.text
     │
     ▼
8. FILTER UNCACHED ──→ Remove words already in dictionary cache
     │
     ▼
9. IN-FLIGHT DEDUP ──hit──→ Reuse existing Promise<void>
     │
     miss
     ▼
10. POST /dictionary/lookup-batch ──→ Populate dictionary cache, increment cacheVersion
```

### cacheVersion Propagation

After `bulkLookupWords` completes, `cacheVersion` is incremented. Each `TokenSpan` child receives `cacheVersion` as a prop. Since `TokenSpan` reads from the dictionary cache in its rendering logic (not in a memoized hook), React's normal re-render cycle picks up the new cache entries automatically. The comment in `token-span.tsx:159` explains why `showPhonetics` is NOT memoized:

> *"NOT memoized: the dictionary cache is populated asynchronously. memoizing would lock in the initial (cache-miss) result and never recompute when entries arrive."*

### hardWords Filter (Web)

`TokenSpan` determines word difficulty from the dictionary cache:

```typescript
function getWordDifficulty(l2Code: string, lemmas: Lemma[]): WordDifficulty {
  // | kind            | meaning                    | show phonetics? |
  // | not_cached      | wait for async lookup      | NO              |
  // | unclassified    | unknown word               | YES (treat as hard) |
  // | classified      | has levels[].numeric       | YES if level >= userLevel |
}
```

- `not_cached` — the word hasn't been looked up yet → don't show phonetics (wait)
- `unclassified` — cached but no level data → show phonetics (unknown = hard)
- `classified` with `value >= userLevel` → show phonetics (word is difficult)
- `classified` with `value < userLevel` → don't show phonetics (word is easy)

### Traditional Chinese Conversion (Web)

When `l2Code` is Chinese and `l2Settings.display.traditional` is true:

```typescript
const { toTraditional } = await import('@/lib/chinese-script');
const result = await toTraditional(text);
```

- **File:** `apps/web/src/lib/chinese-script.ts`
- Uses `opencc-js` (lazy-loaded, ~250KB gzipped)
- Converts Simplified → Traditional via `cn → twp`
- The conversion happens before tokenization — `TokenizedText` tokenizes the converted text
- Has its own `converting` state — tokenization waits for conversion to complete

---

## Layer 3: Token Rendering (Mobile)

### Component Architecture (Mobile)

```
TokenizedText (single file, ~360 lines)
├── Lemmatize cache (shared in-memory)
├── Batch dictionary lookup (bulkLookupWords)
├── getTokenEntryData (per-token cache read)
└── Inline token rendering (no TokenSpan child component)
    ├── Ruby text (View-based flex row, no HTML <ruby>)
    ├── Byeonggi (hanja/hán tự above word, small muted)
    ├── Quiz blanking (▯ → tap → reveal)
    ├── Interlinear gloss (lemma below word)
    └── DictionaryPopup (modal on word tap)
```

**File:** `apps/mobile/components/TokenizedText.tsx` (~370 lines after batch lookup additions)

### Mobile vs Web: Key Differences

| Area | Web | Mobile | Status |
|---|---|---|---|
| **Lazy loading** | IntersectionObserver 200px margin | Not implemented | ⬜ Gap — mobile fetches all tokens immediately |
| **In-flight dedup** | `lemmatizeInflight` Map | Only `loadingRef.current` guard | ⬜ Gap — can have duplicate requests |
| **Traditional Chinese** | OpenCC auto-conversion | TODO (G11) | ⬜ Feature gap |
| **hardWords filter** | `getWordDifficulty()` | TODO (G9) | ⬜ Feature gap |
| **quickGloss** | `QuickGloss` for saved words | TODO (G7) | ⬜ Feature gap |
| **byeonggi** | Per-token `useMemo` from cache | ✅ `getTokenEntryData()` | ✅ Done |
| **Quiz mode** | TokenSpan per-word blanking | ✅ `revealedTokens` Set | ✅ Done |
| **Interlinear gloss** | Via definition.show | ✅ First lemma below/beside word | ✅ Done |
| **Batch dict lookup** | `bulkLookupWords()` + `cacheVersion` | Same pattern | ✅ Done |
| **Video token cache** | Passed to SubtitleDisplay → TokenizedText | Fetched but NOT passed to SubtitleDisplay | ❌ Bug |
| **Ruby rendering** | HTML `<ruby>` + `<rt>` | Custom View-based flex row | ✅ Different render, same concept |

### Mobile Ruby Rendering

The mobile app cannot use HTML `<ruby>` tags (React Native has no native ruby annotation support). Instead, it uses a flex row layout:

```
┌─────────────────┐
│  nǐ hǎo  (ruby) │  ← reading size (0.55× base)
│  한자     (hanja)│  ← byeonggi (if ko + byeonggi enabled)
│  你好     (word) │  ← base text
│  hello    (gloss)│  ← first lemma (if definition.show)
└─────────────────┘
```

Each character group is a `<View className="items-center mx-px">`. The ruby, byeonggi, and gloss text use the same `readingSize` (max(8, round(baseSize × 0.55))).

### Mobile Batch Lookup Flow

```
1. Tokens loaded (via preloaded prop, video cache, in-memory cache, or API)
     │
     ▼
2. Gather unique lemmas + surface forms
     │
     ▼
3. bulkLookupWords({ text, l2Code, l1Code }[])
     │  (filters already-cached, dedups in-flight)
     ▼
4. setCacheVersion(v => v + 1) → TokenizedText re-renders
     │
     ▼
5. getTokenEntryData() recomputes per token, picks up hanja/definitions
```

---

## Video Subtitle Tokenization

### Web: Full Optimization Pipeline

```
Watch page
  │
  ├── useVideoTokenCache(videoId, l2Code)  ← GET /lemmatize-video-normalized
  │   └── TokenCache (md5 → LemmatizedToken[])
  │
  ├── useSubtitleTranslation(l2Lines, l1, l2)
  │   └── POST /translate_array (chunks of 5, ±3 chunks from active line)
  │
  └── SubtitleDisplay
      └── TokenizedText × N (one per subtitle line)
          ├── tokenCache={tokenCache}
          ├── tokenCacheLoaded={tokenCacheLoaded}
          └── karaokeProgress={karaokeProgress}
```

**Translation strategy:** `use-subtitle-translation.ts` translates in chunks of 5 lines, prioritizing the active line and expanding outward (±3 chunks). If a chunk fails, the loop stops immediately (no hammering the server). This means the user sees translations for nearby lines but not for the entire 500+ line transcript at once.

### Mobile: Missing Video Cache Wiring

```
Watch page
  │
  ├── useVideoTokenCache(videoId, l2Code)  ← GET /lemmatize-video-normalized
  │   └── TokenCache (populated but NOT passed down)
  │
  └── SubtitleDisplay
      └── TokenizedText × N
          └── No tokenCache prop! ← falls back to per-line API calls
```

**Bug:** The mobile watch page fetches `tokenCache` and `tokenCacheLoaded` from `useVideoTokenCache()` but does not pass them to `SubtitleDisplay` → `TokenizedText`. This means every subtitle line triggers a separate `POST /lemmatize-normalized` call (mitigated somewhat by the shared in-memory lemmatize cache after the first line is tokenized, but still wasteful for the initial pass).

### TokenCache Class (Shared)

**File:** `packages/utils/src/token-cache.ts`

```typescript
export class TokenCache implements ITokenCache {
  private map = new Map<string, LemmatizedToken[]>();

  load(hashTable: Record<string, { tokens: LemmatizedToken[] }>): void {
    for (const [hash, entry] of Object.entries(hashTable)) {
      if (entry.tokens?.length > 0) {
        this.map.set(hash, entry.tokens);
      }
    }
  }

  get(text: string): LemmatizedToken[] | undefined {
    const hash = md5(text);
    return this.map.get(hash);
  }
}
```

- Keyed by MD5 hash of original text (matches server-side cache keys from `/lemmatize-video-normalized`)
- `load()` populates from server response
- `get()` hashes the text and looks up — O(1) per line
- Shared between web and mobile via `@langplayer/utils`

---

## Request Optimization Summary

### Strategies Used

| Strategy | Where | Purpose |
|---|---|---|
| **Video token cache** | `GET /lemmatize-video-normalized` | Pre-compute all subtitle tokens server-side. One request per video instead of N per line. |
| **In-memory lemmatize cache** | `lemmatizeCache` Map (module-level, shared across all instances) | Same text tokenized once, reused by all TokenizedText instances |
| **In-flight lemmatize dedup** | `lemmatizeInflight` Map (web only) | Concurrent requests for same text share one API call |
| **IntersectionObserver** | Web only, rootMargin: 200px | Don't tokenize off-screen lines at all until they approach viewport |
| **In-memory dictionary cache** | `dictionary-cache.ts` (both platforms) | Same word looked up once, reused by all TokenSpan instances |
| **In-flight dict dedup** | `_inflightRequests` Map (both platforms) | Concurrent bulkLookupWords calls share one API call |
| **Chunked translation** | `use-subtitle-translation.ts`, chunks of 5 | Don't translate all 500+ lines at once — prioritize active line ±3 chunks |
| **cacheVersion invalidation** | `setCacheVersion(v => v + 1)` (both platforms) | Signal TokenSpan to re-read cache after async population |
| **Generation counter** | `tokenLoadGenRef` in useEpubPagination | Cancel stale requests on rapid page changes |
| **AbortController** | All fetch calls (both platforms) | Cancel in-flight requests on unmount or dependency change |

### Request Count Example

For a video transcript with 500 subtitle lines, unique 200 lemmas:

| Scenario | API Calls | Notes |
|---|---|---|
| **Naive** (no caching) | 500 tokenize + 500 dict lookup = 1,000 | Per-line, per-word |
| **Web optimized** | 1 video cache + 0 tokenize + 1 batch dict = 2 | IntersectionObserver prevents off-screen lines from even trying |
| **Mobile current** | 1 video cache + 500 tokenize + 1 batch dict = 502 | Video cache fetched but not wired through; in-memory cache mitigates after first line |
| **Mobile fixed** (wire tokenCache) | 1 video cache + 0 tokenize + 1 batch dict = 2 | Same as web |

### Known Gaps (Mobile)

| # | Gap | Impact | Fix |
|---|---|---|---|
| 1 | Video token cache not passed to SubtitleDisplay → TokenizedText | 500 tokenize calls per video (cached after first line, but still wasteful) | Pass `tokenCache` + `tokenCacheLoaded` props through |
| 2 | No in-flight lemmatize dedup | Concurrent TokenizedText instances for same text launch separate API calls | Add `lemmatizeInflight` Map (same pattern as web) |
| 3 | No IntersectionObserver lazy loading | All subtitle lines tokenized immediately on mount, even off-screen | Implement via `onLayout` + scroll position tracking or FlatList viewability |
| 4 | hardWords filtering | Phonetics shown for all words regardless of difficulty | Implement `getWordDifficulty()` using dictionary cache levels |
| 5 | Traditional Chinese conversion | No character conversion for Chinese script variant | Port OpenCC or use server-side conversion |
| 6 | quickGloss rendering | Dictionary definitions available in cache but not rendered for saved words | Integrate `useSavedWords()` context into TokenizedText |

---

## File Index

| File | Platform | Lines | Purpose |
|---|---|---|---|
| `packages/shared/src/types.ts` | Shared | — | `LemmatizedToken`, `Lemma`, `DictionaryEntry`, `LexicalEntry` types |
| `packages/utils/src/token-cache.ts` | Shared | 48 | `TokenCache` class (md5-keyed) |
| `zerotohero-python-server/routes/text_routes.py` | Backend | ~200 | `/lemmatize-normalized`, `/lemmatize-video-normalized` endpoints |
| `zerotohero-python-server/routes/dictionary.py` | Backend | ~200 | `/dictionary/lookup-batch` endpoint |
| `apps/web/src/components/tokenized-text.tsx` | Web | 418 | Container: lazy loading, caching, batch lookup, conversion |
| `apps/web/src/components/token-span.tsx` | Web | 260 | Individual token: ruby, byeonggi, quiz, gloss, hardWords, karaoke |
| `apps/web/src/lib/dictionary-cache.ts` | Web | 83 | Client-side dict cache + `bulkLookupWords()` |
| `apps/web/src/hooks/use-subtitle-translation.ts` | Web | 209 | Chunked L1 translation for video subtitles |
| `apps/web/src/hooks/use-video-token-cache.ts` | Web | ~30 | Fetch + populate TokenCache from /lemmatize-video-normalized |
| `apps/web/src/lib/chinese-script.ts` | Web | ~50 | OpenCC Simplified→Traditional conversion |
| `apps/web/src/lib/video-token-cache.ts` | Web | ~20 | API client wrapper for video token cache |
| `apps/mobile/components/TokenizedText.tsx` | Mobile | ~370 | Single-file tokenization + rendering + batch lookup |
| `apps/mobile/lib/dictionary-cache.ts` | Mobile | 83 | Identical to web — shared cache + `bulkLookupWords()` |
| `apps/mobile/hooks/use-epub-pagination.ts` | Mobile | ~200 | EPUB reader batch lemmatization via `/lemmatize-normalized/batch` |
| `apps/mobile/hooks/use-video-token-cache.ts` | Mobile | ~30 | Same as web — fetches token cache (but not wired through to subtitles) |
