# ADR 0015: Video Loading Pipeline — Subtitle, Lemmatization, Translation, Dictionary

> **Status:** Documented (as-built)
> **Date:** 2026-07-24
> **See also:**
> - `apps/web/src/app/[l1]/[l2]/watch/[videoId]/page.tsx` — watch page
> - `apps/web/src/app/api/videos/[videoId]/route.ts` — Next.js API proxy
> - `apps/web/src/components/video/subtitle-display.tsx` — subtitle rendering + translation trigger
> - `apps/web/src/components/tokenized-text.tsx` — per-line lemmatization + dictionary pre-fetch
> - `apps/web/src/hooks/use-video-token-cache.ts` — video-level lemmatization cache
> - `apps/web/src/hooks/use-subtitle-translation.ts` — chunked subtitle translation
> - `apps/web/src/lib/dictionary-cache.ts` — client-side dictionary entry cache
> - `zerotohero-python-server/routes/text_routes.py` — lemmatization endpoints
> - `zerotohero-python-server/routes/translate.py` — translation endpoint
> - `zerotohero-python-server/routes/dictionary.py` — dictionary lookup endpoint

---

## Context

When a user opens a video on the watch page, five distinct data pipelines fire to populate the UI: video metadata + subtitles, lemmatization, dictionary lookups, translation, and user data. Several of these pipelines suffered from thundering-herd problems where hundreds of `TokenizedText` instances (one per subtitle line, ~300 lines in transcript mode) launched redundant API calls simultaneously.

This ADR documents the end-to-end data flow as it currently stands, including all fixes applied.

---

## Pipeline 1: Video Metadata + Subtitle Lines

### Flow

```
watch page (page.tsx)
  → fetch(`/api/videos/${youtubeId}?l2=ja&l1=en`)
    → Directus: GET /items/youtube_videos_{suffix}?filter[youtube_id][eq]=...
      → response includes subs_l2 (CSV)
      → subs_l1 (CSV) is DEPRECATED — no longer read or stored
    → parseCSVSubtitles(item.subs_l2) → SubtitleLine[]  (L2: original language)
    → l2Lines.map(...) → SyncedLine[]                   (wrapped with empty l1Line)
    → return { video, lines: syncedLines }              (lines have no L1 translations)
```

### Key facts

- **Directus is the source of truth for L2 subtitles.** `subs_l2` (original language) is stored as a CSV string in the `youtube_videos_{suffix}` table, uploaded during video ingestion.
- **`subs_l1` is deprecated and no longer read.** The API route no longer parses `subs_l1` from Directus and does not set `video.subs_l1`. The field remains in the `YouTubeVideo` type only for backward compatibility with cached API responses.
- **No `syncLines` call in the API.** Each L2 line is directly mapped to a `SyncedLine` struct with `l1Line: ''`. Translations are applied later by `SubtitleDisplay` via `/translate_array`.
- **YouTube fallback for L2 only.** If Directus has no L2 subtitles, the API calls `/get_best_l2_subs` (YouTube auto-captions). L1 subtitles are never fetched from YouTube — all translations come from `/translate_array` (see Pipeline 4).
- **Watch page receives `data.lines`** (L2 with empty L1 placeholders) and passes them as `initialLines` to `SubtitleDisplay`.

### Files

| File | Role |
|---|---|
| `apps/web/src/app/api/videos/[videoId]/route.ts` | Next.js API route — fetches from Directus, parses CSV, pairs lines |
| `apps/web/src/lib/subtitle-csv.ts` | `parseCSVSubtitles()` (CSV → `SubtitleLine[]`), `syncLines()` (structurally wraps L2; pairing logic is dead code) |
| `apps/web/src/lib/video-service.ts` | `fetchYouTubeL2Captions()` — YouTube fallback for L2 captions only |
| `apps/web/src/app/[l1]/[l2]/watch/[videoId]/page.tsx` | Watch page — fetches from API, stores in `subtitleLines` state |

---

## Pipeline 2: Lemmatization (Tokenization)

### Two-tier architecture

Lemmatization uses a **video-level cache** to avoid per-line API calls:

```
watch page
  → useVideoTokenCache(video?.id, l2Code)              ← Directus video ID (NOT YouTube ID!)
    → GET /lemmatize-video-normalized?video_id={id}&lang=zh
      → Python: app_directus.get_and_lemmatize_video_by_id_normalized()
        → lemmatizes ALL subtitle lines at once (server-side cache)
        → returns { md5(line): { tokens: [...] }, ... }

  → SubtitleDisplay passes tokenCache to each TokenizedText
    → TokenizedText: check tokenCache.get(line)         ← instant, cache hit
    → if cache MISS (shouldn't happen): fallback to POST /lemmatize-normalized
```

### Key facts

- **Video cache is fetched ONCE per video** via `useVideoTokenCache`. It calls `/lemmatize-video-normalized` which lemmatizes all subtitle lines server-side and returns a hash table keyed by MD5 of each line.
- **Watch page passes `video?.id` (Directus ID) — NOT the YouTube ID.** `videoId` from `params.videoId` is the YouTube ID from the URL, but the backend endpoint expects a Directus video ID. Fixed: pass `video?.id` which is available after the video metadata loads (commit `92990974`).
- **TokenizedText defers until cache is ready.** If `tokenCache` is provided but `tokenCacheLoaded === false`, `TokenizedText` shows plain text without making API calls. When `tokenCacheLoaded` flips to `true`, the effect re-fires and hits the now-populated cache.
- **Per-line fallback (`/lemmatize-normalized`) is a last resort.** It's only reached if the video cache misses for a specific line. In-flight request deduplication prevents thundering herd if multiple lines hit it simultaneously.
- **Batch endpoint (`/lemmatize-normalized/batch`)** is used by the reader (epub, reader, web-reader pages), not the watch page.

### Deduplication

```
TokenizedText (×300 instances)
  → lemmatizeCache (module-level Map<key, tokens[]>)     ← synchronous cache check
  → lemmatizeInflight (module-level Map<key, Promise>)   ← in-flight dedup
  → POST /lemmatize-normalized                           ← only if both miss
```

When 300 `TokenizedText` instances mount simultaneously in transcript mode and the video cache hasn't loaded yet, the first one hits the API. The other 299 find the in-flight promise and await it — one API call, not 300 (commit `3b4034a3`).

### Files

| File | Role |
|---|---|
| `apps/web/src/hooks/use-video-token-cache.ts` | Fetches video-level token cache (once per video) |
| `apps/web/src/components/tokenized-text.tsx` | Per-line lemmatization with module-level cache + in-flight dedup |
| `packages/api-client/src/videos.ts` | `getVideoTokenCache()` — calls `/lemmatize-video-normalized` |
| `zerotohero-python-server/routes/text_routes.py` | `/lemmatize-video-normalized`, `/lemmatize-normalized`, `/lemmatize-normalized/batch` |
| `zerotohero-python-server/lemmatize_unified.py` | Language-specific lemmatizer dispatch |

---

## Pipeline 3: Dictionary Lookup

### Flow

```
TokenizedText (after tokens load)
  → useEffect: gather unique lemmas from all tokens in this line
    → bulkLookupWords(words)                                   ← dictionary-cache.ts
      → filter already-cached words (module-level Map)
      → deduplicate in-flight batches (module-level Map<key, Promise>)
      → POST /dictionary/lookup-batch                          ← Python endpoint
        → Python: _lookup_word() for each word
          → CSV dictionary loader (edict, cedict, etc.)
          → LLM fallback (DeepSeek) if no dictionary match
          → translate definitions to user's L1 if not English
        → cache entries in client-side Map
```

### Key facts

- **Triggered per `TokenizedText` instance.** After tokens load, each instance gathers its own unique lemmas and calls `bulkLookupWords`. With 300 lines, that's 300 calls to `bulkLookupWords` — but most return immediately because the cache is already populated.
- **In-flight deduplication prevents thundering herd.** Before the fix (commit `3b4034a3`), all 300 instances checked the empty cache simultaneously and launched 300 duplicate API calls. Now, a `Map<batchKey, Promise>` tracks in-flight requests and concurrent callers reuse the existing promise.
- **Client-side cache is keyed by `l2Code:text`.** Once a dictionary entry is cached, all subsequent `TokenizedText` instances reuse it without API calls.
- **LLM fallback** generates dictionary entries via DeepSeek when no CSV dictionary has the word. Results are cached server-side in `cache/dictionary_llm/{l1}/{l2}-{hash}.json`.

### Files

| File | Role |
|---|---|
| `apps/web/src/lib/dictionary-cache.ts` | Client-side cache + `bulkLookupWords()` with in-flight dedup |
| `apps/web/src/components/tokenized-text.tsx` | Triggers `bulkLookupWords` after tokens load |
| `zerotohero-python-server/routes/dictionary.py` | `/dictionary/lookup-batch`, `/dictionary/lookup`, `/dictionary/entry` |

---

## Pipeline 4: Subtitle Translation (L2 → L1)

### Flow

Since `subs_l1` is deprecated, all L1 translations come from `/translate_array` with a server-side cache. Translation is **lazy** — only chunks near the user's viewport are translated eagerly; the rest fills in the background.

```
SubtitleDisplay
  → useSubtitleTranslation(l2Lines, l1, l2, enabled, activeIndex)
    → _pickNextChunk(activeIndex, done, totalChunks)  ← priority order
      1. Chunk 0 (top of transcript — always first)
      2. Chunks ±LOOKAHEAD_CHUNKS around activeIndex
      3. Remaining chunks sequentially (background fill)
    → POST /translate_array { texts: chunk }
      → Python: server-side cache → cache HIT returns instantly
      → cache MISS → ChatGPT → stores in cache
  → syncLines(validTranslatedLines, l2Lines) → paired output
```

### Priority-based lazy loading

Instead of translating all 300 lines eagerly (60 API calls), the hook uses `_pickNextChunk()` to order chunks by relevance to the user's current position:

| Priority | What | When |
|---|---|---|
| 1 | Chunk 0 (lines 0–4) | Immediately — fills initial viewport |
| 2 | Chunks ±3 around `activeIndex` | Keeps ahead of the user as they watch/scroll |
| 3 | Remaining chunks in order | Background fill once priority chunks are done |

The user's `activeIndex` is read via a **ref** (not an effect dependency), so the translation loop isn't restarted on every frame during playback. Priority is re-checked before each chunk via `_pickNextChunk()`.

A 300-line transcript costs ~10 API calls for a typical viewing session instead of 60. Jumping to line 250 mid-session prioritizes that region without discarding already-translated chunks.

### Error handling

If a chunk fails (network error, server down), the loop **stops immediately** rather than retrying every remaining chunk. The hook returns:

- `error: string | null` — set to a translation key on failure
- `retry()` — increments a counter that restarts the loop, preserving already-translated chunks

Error is auto-cleared when `l2Lines` changes (new video).

### Key facts

- **Server-side translation cache** per `(text, l1, l2)`. Warm cache returns instantly — no ChatGPT cost. Cold cache calls ChatGPT and stores the result.
- **Chunk size of 5** is intentional — shows progressive results. With a warm cache, each chunk returns near-instantly regardless of priority.
- **`display.translation` setting** enables/disables the entire pipeline. When disabled, no API calls are made.
- **Transcript mode**: all lines in DOM, translation is lazy. **Subtitles mode**: only the active line renders, so only one chunk is ever needed.

### Files

| File | Role |
|---|---|
| `apps/web/src/components/video/subtitle-display.tsx` | Receives `initialLines`, triggers translation |
| `apps/web/src/hooks/use-subtitle-translation.ts` | Lazy, priority-based `/translate_array` calls with stop-on-error, retry, and ref-based activeIndex tracking |
| `zerotohero-python-server/routes/translate.py` | `/translate_array` — ChatGPT-powered translation |

---

## Pipeline 5: User Data (Progress Level)

### Flow

```
TokenizedText (×300 instances)
  → useProgressLevel(l2Code)                    ← lightweight hook (NO cloud fetch)
    → reads localStorage('zthProgress')          ← synchronous, instant
    → listens for cross-tab storage events

Explore page / Music page / Profile page
  → useProgress(l2Code)                         ← full hook (WITH cloud sync)
    → reads localStorage
    → GET /user-data (cloud load, once)
    → debounced POST /user-data/sync (on change)
```

### Key facts

- **`TokenizedText` uses `useProgressLevel` — NOT `useProgress`.** This was a critical bug (commit `96f37f46`): `useProgress` does a `GET /user-data` cloud fetch on mount. With 300 `TokenizedText` instances, that was 300 redundant API calls. `useProgressLevel` reads only from localStorage (instant, no API).
- **Cloud sync is page-level only.** `useProgress` (with cloud fetch + sync) is only used at the page/layout level (explore, music, profile). It updates localStorage, which `useProgressLevel` then reads.
- **Cross-tab sync:** `useProgressLevel` listens for `storage` events so if the user changes their level in another tab, `TokenizedText` picks it up without re-fetching.

### Files

| File | Role |
|---|---|
| `apps/web/src/hooks/use-progress.ts` | `useProgress()` (page-level, cloud sync) + `useProgressLevel()` (component-level, localStorage only) |
| `apps/web/src/components/tokenized-text.tsx` | Uses `useProgressLevel()` |
| `apps/web/src/app/[l1]/[l2]/explore/page.tsx` | Uses `useProgress()` |

---

## Complete Sequence Diagram

```
User opens video
│
├─ 1. Watch page mounts
│   ├─ fetch /api/videos/{youtubeId}?l2=ja&l1=en
│   │   └─ Directus → subs_l2 (CSV) → parsed → syncLines → data.lines (no L1)
│   ├─ setVideo(data.video) → video?.id available (Directus ID)
│   └─ setSubtitleLines(data.lines)
│
├─ 2. Video token cache (triggered by video?.id becoming available)
│   └─ GET /lemmatize-video-normalized?video_id={directusId}&lang=ja
│       └─ Returns { md5(line): { tokens } } for ALL subtitle lines
│
├─ 3. Subtitles render (300 TokenizedText instances mount in transcript mode)
│   │
│   ├─ 3a. Lemmatization (per TokenizedText)
│   │   ├─ Check video token cache → HIT (instant, no API call)
│   │   └─ Fallback (if cache miss): POST /lemmatize-normalized (deduped)
│   │
│   ├─ 3b. Dictionary lookup (per TokenizedText, after tokens load)
│   │   └─ bulkLookupWords(lemmas) → POST /dictionary/lookup-batch (deduped)
│   │
│   └─ 3c. User level (per TokenizedText)
│       └─ useProgressLevel() → localStorage read (instant, no API)
│
├─ 4. Translation (SubtitleDisplay — lazy, priority-based)
│   ├─ _pickNextChunk(activeIndex) → chunk 0 first, then chunks near user
│   ├─ POST /translate_array (only chunks near user's viewport)
│   └─ Remaining chunks fill in background as user scrolls
│
└─ 5. UI ready — video plays, subtitles show with word-level dictionary popups
```

---

## Thundering-Herd Fixes Applied

| Problem | Cause | Fix | Commit |
|---|---|---|---|
| 300× `GET /user-data` on watch page | `TokenizedText` called `useProgress()` (cloud fetch) per instance | Added `useProgressLevel()` — localStorage-only hook | `96f37f46` |
| 300× `POST /dictionary/lookup-batch` | All instances check empty cache before first response | In-flight promise dedup in `bulkLookupWords()` | `3b4034a3` |
| 300× `POST /lemmatize-normalized` fallback | All instances check empty cache before first response | In-flight promise dedup in `TokenizedText` | `3b4034a3` |
| `/lemmatize-video-normalized` called with wrong ID | YouTube ID (`params.videoId`) passed instead of Directus ID | Pass `video?.id` (Directus ID) instead | `92990974` |
| — | — | — | — |
| `/translate_array` eager for all 300 lines | `subs_l1` is deprecated; translations must be computed on-the-fly | Lazy, priority-based loading: only chunks near viewport. ~10 calls per session instead of 60. Stop-on-error with retry. | `bbd6522c` |

---

## Server-Side Caching

| Endpoint | Cache Strategy |
|---|---|
| `/lemmatize-video-normalized` | Server-side disk cache via `utils_video_lemma.py`. Lemmatized once, served from cache on subsequent requests. |
| `/dictionary/lookup-batch` | LLM results cached in `cache/dictionary_llm/{l1}/{l2}-{hash}.json`. CSV dictionaries are in-memory SQLite. |
| `/translate_array` | Server-side cache per (text, l1, l2). Frontend lazy-loads by priority — only chunks near viewport requested. Stop-on-error with retry. |

---

## Risks & Open Issues

| Risk | Status |
|---|---|
| YouTube L2 fallback (`/get_best_l2_subs`) may not exist in current Python server | ⚠️ Unverified — videos without Directus L2 subs might show no subtitles |
| YouTube L1 fallback (`/get_best_l1_subs`) no longer used | ✅ All L1 translations are live-translated via `/translate_array` with server cache |
