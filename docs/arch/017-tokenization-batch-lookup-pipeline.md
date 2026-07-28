# Tokenization & Batch Lookup Pipeline

## Metadata
- **ARch ID**: ARCH-017
- **Feature**: Lemmatization, dictionary batch lookup, and request optimization strategies
- **Status**: active (maintained)
- **Created**: 2026-07-26
- **Updated**: 2026-07-28 — mobile gap status updated; video lemmatization flow documented; server-side normalizer chain detailed
- **ROADMAP Phase**: Cross-cutting (all phases)
- **Scope**: Web (Next.js), Mobile (React Native/Expo), Python (Flask)
- **See also**: [SPEC-019: Mobile Tokenization & Batch Lookup Completion](../specs/019-mobile-tokenization-batch-lookup-completion.md) — mobile gap closure plan

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

**Lemmatizer dispatch:** `lemmatize_unified.lemmatize()` routes to language-specific lemmatizers via `LEMMATIZER_REGISTRY`:

| Language(s) | Module | Engine | Output format |
|---|---|---|---|
| `zh`, `yue` | `lemmatize_chinese` | Jieba (dict.txt.big) | `[{word, pos, pronunciation}]` |
| `ja` | `lemmatize_japanese` | MeCab + IPADIC | `[{word, lemma, pos, pronunciation}]` |
| `ko` | `lemmatize_korean` | OKT (Open Korean Text) | `[{text, stem, pos}]` |
| `ru` | `lemmatize_russian` | pymorphy2 | `[{word, lemmas: [{lemma, pos, morphologies}]}]` |
| `ar` | `lemmatize_arabic` | Qalsadi | `[[{word, lemma, pos, pronunciation}]]` (nested) |
| `fa`, `tr`, `my` | `lemmatize_persian` / `_turkish` / `_burmese` | Language-specific | Flat `[{word, lemma, pos}]` |
| `ca`, `de`, `en`, `es`, `fr`, `it`, `pt`, `ro`, `sv`, `uk` | `lemmatize_lemmatization_lists` | Static lookup tables (zero runtime cost) | `[{text, lemma, pos}]` |
| `da`, `el`, `fi`, `lt`, `mk`, `nb`, `nl`, `pl`, … | `lemmatize_simple` | Simplemma (lightweight dictionary) | `[{text, lemma, pos}]` |
| `hr` (Croatian) | `lemmatize_spacy` | spaCy (last resort — no lighter alternative) | `[{word, lemma, pos}]` |
| Any other | — | Space-split fallback | Surface = lemma |

Each lemmatizer returns a module-specific raw format. `_normalize_*()` converters unify these into the standard `{ tokens: LemmatizedToken[] }` shape:

- `_normalize_mecab()` — MeCab `{word, lemma, pos, pronunciation}` → `LemmatizedToken`
- `_normalize_okt()` — OKT `{text, stem, pos}` → `LemmatizedToken` (adds romanized pronunciation)
- `_normalize_jieba()` — Jieba `{word, pos, pronunciation}` → `LemmatizedToken`
- `_normalize_pymorphy()` — pymorphy2 nested `{lemmas: […]}` → `LemmatizedToken`
- `_normalize_qalsadi()` — Qalsadi nested group `[[…]]` → `LemmatizedToken`
- `_normalize_spacy()` / `_normalize_simple()` / `_normalize_lemmatization_list()` — flat formats → `LemmatizedToken`
- `_normalize_flat()` — generic fallback for unknown lemmatizers

**Post-processing:** `_recover_spaces()` reconstructs whitespace tokens from the original text. `_romanize_if_needed()` adds pronunciation via the `romanize` module (language-specific romanizers for Cyrillic, Greek, Thai, etc.).

**Video cache storage:** `/lemmatize-video-normalized` accepts a video's subtitle CSV, lemmatizes every line, and returns an MD5-keyed map:

```
GET /lemmatize-video-normalized?video_id=123&lang=ja

Response:
{
  "d41d8cd98f00b204e9800998ecf8427e": { "tokens": [{ "text": "今日", ... }, ...] },
  "e99a18c428cb38d5f260853678922e03": { "tokens": [{ "text": "天気", ... }, ...] },
  ...
}
```

**Server-side flow:**
1. Fetch subtitle CSV from Directus `youtube_videos.subs_l2` or YouTube transcript API
2. Parse CSV into individual subtitle lines
3. For each line, compute `MD5(line_text)` as the cache key
4. Call `lemmatize_unified.lemmatize(line_text, l2)` → `LemmatizedToken[]`
5. Store on disk via `utils_cache.py` (`save_to_lemmatized_subs_cache`)
6. Return `{ md5_hash: { tokens: LemmatizedToken[] } }` to client

**Client-side flow (both platforms):**
1. `useVideoTokenCache(videoId, l2Code)` calls `GET /lemmatize-video-normalized`
2. Response loaded into `TokenCache` (md5-keyed `Map<string, LemmatizedToken[]>`)
3. `TokenCache.get(text)` computes `md5(text)` and returns cached tokens — O(1) per line
4. Passed as `tokenCache` prop through `SubtitleDisplay` → `TokenizedText`
5. `TokenizedText` checks the cache before falling back to per-line `POST /lemmatize-normalized`

The MD5 key scheme means two subtitle lines with identical text share one cache entry across the entire transcript. On the server, `load_from_lemmatized_subs_cache` / `save_to_lemmatized_subs_cache` persist results to disk so subsequent requests for the same video are instant.

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
├── Batch dictionary lookup (bulkLookupWords)
├── Saved words context (isSaved per token)
└── TokenSpan × N (individual tokens)
    ├── Ruby text (<ruby> + <rt>)
    ├── Chinese script conversion (OpenCC per-token, ADR-0019)
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

### Chinese Script Conversion (Web, ADR-0019)

Per [ADR-0019](../adr/0019-chinese-script-conversion-at-render-layer.md), Chinese script conversion was moved from `TokenizedText` (pre-tokenization) to `TokenSpan` (per-token render layer).

**Rationale:**
1. **Better tokenization**: Tokenizing the original text gives Jieba the script it's optimized for (simplified). Traditional learners no longer send traditional text to a simp-optimized tokenizer.
2. **Unified video token cache**: One cache entry per subtitle line regardless of learner's script preference — simplified and traditional learners share the same `GET /lemmatize-video-normalized` cache.
3. **Consistent architecture**: Chinese script conversion joins Korean hanja and Vietnamese hán tự as per-token rendering concerns in `TokenSpan`.
4. **Server-side improvement**: Python backend loads `jieba.set_dictionary('dict.txt.big')` for equal-quality segmentation on both scripts.

**Before (removed):**
```
text → [OpenCC cn→twp] → POST /lemmatize-normalized → tokens → TokenSpan (no conversion)
```

**After (current):**
```typescript
// apps/web/src/components/token-span.tsx (lines 106–125)
const isChinese = base === 'zh';
const useTraditional = isChinese && l2Settings.display.traditional;

const [displayText, setDisplayText] = useState(token.text);
useEffect(() => {
  if (!useTraditional) { setDisplayText(token.text); return; }
  let cancelled = false;
  import('@/lib/chinese-script').then(({ toTraditional }) => {
    toTraditional(token.text).then(result => {
      if (!cancelled) setDisplayText(result);
    });
  });
  return () => { cancelled = true; };
}, [token.text, useTraditional]);
```

- OpenCC `cn→twp` is idempotent on already-traditional text — no-op for traditional source content
- Lazy-loaded per `TokenSpan` instance, stays in memory
- No new props — `TokenSpan` reads `display.traditional` directly from `useSettingsContext()`
- `TokenizedText` no longer has any conversion logic (~25 lines removed)

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
| **Lazy loading** | IntersectionObserver 200px margin | Not implemented (no browser API) | ⬜ Open — FlatList viewability config possible |
| **In-flight lemmatize dedup** | `lemmatizeInflight` Map | `lemmatizeInflight` Map in `tokenizer.ts` | ✅ Done — same pattern, different file |
| **Traditional Chinese** | OpenCC per-token in TokenSpan (ADR-0019) | Pre-converted at TokenizedText level via `getConverter()` | ✅ Done — batch conversion of unique texts, same OpenCC lib |
| **hardWords filter** | `getWordDifficulty()` in TokenSpan | `getWordDifficulty()` + `shouldShowPhonetics()` in TokenizedText | ✅ Done |
| **quickGloss** | `QuickGloss` component for saved words | Inline `savedFormSet` + `firstDef` from dict cache | ✅ Done — rendered as small muted text after word |
| **byeonggi** | Per-token `useMemo` from cache | `getTokenEntryData()` per token | ✅ Done |
| **Quiz mode** | TokenSpan per-word blanking | `revealedTokens` Set | ✅ Done |
| **Interlinear gloss** | Via `definition.show` in TokenSpan | First lemma below/beside word | ✅ Done |
| **Batch dict lookup** | `bulkLookupWords()` + `cacheVersion` | Same pattern | ✅ Done |
| **Video token cache** | Passed through to TokenizedText | Passed through to TokenizedText (fixed 2026-07-28) | ✅ Done |
| **Ruby rendering** | HTML `<ruby>` + `<rt>` | Custom View-based flex row via `buildRuby()` | ✅ Different render, same logic |
| **TokenSpan child component** | Separate `token-span.tsx` (260 lines) | Inline rendering in `TokenizedText.tsx` | Architectural difference — mobile uses a single-file approach |

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

### Mobile Local Tokenization Chain

When the server is unreachable (offline, timeout), mobile falls back to a local chain via `lemmatizeText()` in `apps/mobile/lib/tokenizer.ts`:

```
1. IN-MEMORY CACHE (LRU, max 2000 entries) — keyed by "l2:text"
     │
     miss
     ▼
2. POST /lemmatize-normalized (server, 3s timeout) — best accuracy
     │
     fail/timeout
     ▼
3. kuromoji / kuromoji-ko (ja, ko only) — full morphological analysis
   Requires downloaded data pack (~3 MB IPADIC / ~2 MB mecab-ko-dic)
   Falls through to generic path if data pack not downloaded
     │
     not ja/ko, or kuromoji unavailable
     ▼
4. DICT-BASED SEGMENTATION (CJK + SEA scriptio continua languages)
   Loads headwords from offline dictionary SQLite
   Forward maximum matching (same algorithm as Jieba core)
   Falls through to regex if dict not downloaded
     │
     ▼
5. REGEX WORD-SPLIT (all other languages)
     │
     ▼
6. LEMMA RESOLUTION (per-word fallback chain):
   a) Lemma table SQLite lookup (if `hasLemmaTable`)
   b) Snowball stemmer (if `snowballCode` configured)
   c) arabic-stem (Arabic only, ~85% coverage)
   d) Surface form as lemma (always available)
```

**In-flight dedup:** A module-level `lemmatizeInflight` Map ensures concurrent `lemmatizeText()` calls for the same `l2:text` key share one Promise — matching the web's `lemmatizeInflight` pattern exactly.

**Background download:** On first local fallback for a language with `hasLemmaTable`, a fire-and-forget download of the lemma table is triggered. Failed downloads are retried after 5 minutes.

### Mobile Batch Lookup Flow

After tokens are loaded (via any path — server, local, video cache, or preloaded prop):

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

### Mobile: Video Cache Wiring (2026-07-28 Fix)

The video token cache IS wired through to `TokenizedText` on both platforms. The props flow:

```
Watch page
  │
  ├── useVideoTokenCache(videoId, l2Code)  ← GET /lemmatize-video-normalized
  │   └── { cache: TokenCache, loaded: boolean }
  │
  ├── SubtitleDisplay
  │   └── tokenCache={tokenCache}  tokenCacheLoaded={tokenCacheLoaded}
  │
  └── TokenizedText × N
      ├── Checks tokenCache.get(text) first (O(1) MD5 lookup)
      ├── Falls through to lemmatizeText() on cache miss
      └── Uses AbortController for cleanup
```

**Previous bug (fixed 2026-07-28):** The cache WAS wired through, but a stale-placeholder issue prevented actual tokenization. When `tokenCacheLoaded` was `false`, `TokenizedText` set a placeholder `[{ text, lemmas: [] }]`. When `tokenCacheLoaded` flipped to `true`, a skip-guard that checked `tokens.length > 0` (the placeholder has length 1) caused the effect to return early without ever checking the now-populated cache or calling `lemmatizeText()`. The fix changed the guard to check for *real* tokens (those with lemmas) rather than just any token count.

**`useVideoTokenCache` hook** (`apps/mobile/hooks/use-video-token-cache.ts`): Creates a `TokenCache` ref, fetches on `videoId` change, uses `AbortController` for cancellation. Resets cache and `loaded` state when `videoId` changes to avoid stale data from previous videos.

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
| **In-flight lemmatize dedup** | `lemmatizeInflight` Map (both platforms — web in `tokenized-text.tsx`, mobile in `tokenizer.ts`) | Concurrent requests for same text share one API call |
| **IntersectionObserver** | Web only, rootMargin: 200px | Don't tokenize off-screen lines at all until they approach viewport |
| **In-memory dictionary cache** | `dictionary-cache.ts` (both platforms) | Same word looked up once, reused by all TokenSpan instances |
| **In-flight dict dedup** | `_inflightRequests` Map (both platforms) | Concurrent bulkLookupWords calls share one API call |
| **Chunked translation** | `use-subtitle-translation.ts`, chunks of 5 | Don't translate all 500+ lines at once — prioritize active line ±3 chunks |
| **cacheVersion invalidation** | `setCacheVersion(v => v + 1)` (both platforms) | Signal TokenSpan to re-read cache after async population |
| **Generation counter** | `tokenLoadGenRef` in useEpubPagination | Cancel stale requests on rapid page changes |
| **AbortController** | All fetch calls (both platforms) | Cancel in-flight requests on unmount or dependency change |

### Request Count Example

For a video transcript with 500 subtitle lines, 200 unique lemmas:

| Scenario | API Calls | Notes |
|---|---|---|
| **Naive** (no caching) | 500 tokenize + 500 dict lookup = 1,000 | Per-line, per-word |
| **Web optimized** | 1 video cache + 0 tokenize + 1 batch dict = 2 | IntersectionObserver prevents off-screen lines from even trying |
| **Mobile (current)** | 1 video cache + 0 tokenize + 1 batch dict = 2 | Same as web — video cache wired, in-flight dedup in place, LRU cache + server-first pipeline |

### Known Gaps (Mobile)

The only remaining structural gap between web and mobile is **lazy loading**. React Native has no `IntersectionObserver`. Possible approaches: FlatList `viewabilityConfig`, scroll-position-based visibility tracking, or `onLayout`-based container measurement. All other gaps (in-flight dedup, hardWords, quickGloss, Chinese script conversion, video cache wiring) are now implemented.

| # | Gap | Status |
|---|---|---|
| 1 | Lazy loading / viewport-based tokenization | ⬜ Open — needs React Native-specific approach |

---

## File Index

| File | Platform | Lines | Purpose |
|---|---|---|---|
| `packages/shared/src/types.ts` | Shared | — | `LemmatizedToken`, `Lemma`, `DictionaryEntry`, `LexicalEntry` types |
| `packages/utils/src/token-cache.ts` | Shared | 48 | `TokenCache` class (md5-keyed, used by both platforms) |
| `packages/utils/src/furigana.ts` | Shared | ~330 | `buildRuby()`, `matchHiragana()` — language-aware ruby segmentation |
| `zerotohero-python-server/lemmatize_unified.py` | Backend | ~350 | Unified lemmatizer dispatch: registry, normalizers, space recovery, romanization |
| `zerotohero-python-server/lemmatize_japanese.py` | Backend | ~70 | MeCab + IPADIC lemmatizer for Japanese |
| `zerotohero-python-server/lemmatize_korean.py` | Backend | ~60 | OKT lemmatizer for Korean |
| `zerotohero-python-server/lemmatize_chinese.py` | Backend | ~80 | Jieba lemmatizer for Chinese (with dict.txt.big) |
| `zerotohero-python-server/routes/text_routes.py` | Backend | ~200 | `/lemmatize-normalized`, `/lemmatize-video-normalized`, `/lemmatize-normalized/batch` |
| `zerotohero-python-server/routes/dictionary.py` | Backend | ~200 | `/dictionary/lookup-batch` endpoint |
| `apps/web/src/components/tokenized-text.tsx` | Web | ~375 | Container: lazy loading, caching, batch lookup (conversion moved to TokenSpan per ADR-0019) |
| `apps/web/src/components/token-span.tsx` | Web | ~290 | Individual token: ruby, Chinese script conversion, byeonggi, quiz, gloss, hardWords, karaoke |
| `apps/web/src/lib/dictionary-cache.ts` | Web | 83 | Client-side dict cache + `bulkLookupWords()` |
| `apps/web/src/hooks/use-subtitle-translation.ts` | Web | 209 | Chunked L1 translation for video subtitles |
| `apps/web/src/hooks/use-video-token-cache.ts` | Web | ~30 | Fetch + populate TokenCache from /lemmatize-video-normalized |
| `apps/web/src/lib/chinese-script.ts` | Web | ~50 | OpenCC Simplified→Traditional conversion |
| `apps/mobile/components/TokenizedText.tsx` | Mobile | ~550 | Single-file: lemmatization, caching, batch lookup, inline token rendering (no TokenSpan) |
| `apps/mobile/lib/tokenizer.ts` | Mobile | ~780 | `lemmatizeText()` — server-first, local-fallback pipeline: kuromoji, dict segmentation, lemma tables, snowball, arabic-stem |
| `apps/mobile/lib/dictionary-cache.ts` | Mobile | 83 | Identical to web — shared cache + `bulkLookupWords()` |
| `apps/mobile/lib/chinese-script.ts` | Mobile | ~50 | OpenCC simplified→traditional (same lib, RN-compatible) |
| `apps/mobile/hooks/use-epub-pagination.ts` | Mobile | ~200 | EPUB reader batch lemmatization via `/lemmatize-normalized/batch` |
| `apps/mobile/hooks/use-video-token-cache.ts` | Mobile | ~45 | Fetch + populate TokenCache, AbortController-based, resets on videoId change |
| `apps/mobile/lib/kuromoji-loader.ts` | Mobile | ~60 | Custom RN loader for kuromoji data pack from device filesystem |
| `apps/mobile/lib/kuromoji-ko-loader.ts` | Mobile | ~60 | Custom RN loader for kuromoji-ko (Korean) data pack |
| `apps/mobile/lib/tokenizer-db.ts` | Mobile | ~200 | SQLite-backed: lemma table storage/lookup, kuromoji data pack management |
