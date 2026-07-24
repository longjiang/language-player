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
      → subs_l1 (CSV) is DEPRECATED — no longer stored; always empty
    → parseCSVSubtitles(item.subs_l2) → SubtitleLine[]  (L2: original language)
    → parseCSVSubtitles(item.subs_l1 ?? '') → []       (L1: deprecated, always empty)
    → syncLines([], l2Lines) → SyncedLine[]             (wraps L2 lines; L1 always empty)
    → return { video, lines: syncedLines }              (lines have no L1 translations)
```

### Key facts

- **Directus is the source of truth for L2 subtitles.** `subs_l2` (original language) is stored as a CSV string in the `youtube_videos_{suffix}` table, uploaded during video ingestion.
- **`subs_l1` (pre-translated subtitles) is deprecated.** It is no longer stored in Directus. The `parseCSVSubtitles` call always returns an empty array for L1. Translations are now computed on-the-fly via `/translate_array` (see Pipeline 4).
- **`syncLines` is effectively obsolete.** Since L1 is always empty, it simply wraps each L2 line in a `SyncedLine` struct with `l1Line: ''`. The greedy-nearest-neighbor pairing logic never executes.
- **YouTube fallback for L2 only.** If Directus has no L2 subtitles, the API falls back to `/get_best_l2_subs` (YouTube auto-captions). `/get_best_l1_subs` is no longer called — L1 translations are always live-translated (see Pipeline 4).
- **Watch page receives `data.lines`** (paired L2 + empty L1, since `subs_l1` is deprecated) and passes them as `initialLines` to `SubtitleDisplay`.

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

Since `subs_l1` is deprecated (no pre-translated subtitles in Directus), all L1 translations come from one of two sources:

```
SubtitleDisplay
  → receives initialLines (SyncedLine[] from API — L2 only, no L1)
  → useSubtitleTranslation(l2Lines, l1, l2, enabled)
    → calls /translate_array in chunks of 5 (sequential)
      → Python: app_translator_chatgpt.chatgpt_translate_text_array()
        → checks server-side translation cache first
        → cache MISS → ChatGPT API → stores in cache
        → cache HIT → returns cached translation instantly
  → syncLines(translatedLines, l2Lines) → paired output
```

### Key facts

- **Server-side translation cache exists.** The Python `/translate_array` endpoint caches translations per (text, l1, l2) tuple. Repeated views of the same video reuse cached translations without additional ChatGPT calls.
- **Chunk size of 5 is intentional** — it shows progressive results to the user (translations appear chunk by chunk). With a warm cache, each chunk returns near-instantly.
- **`useSubtitleTranslation` is enabled/disabled by `display.translation` setting.** When disabled, no translation calls are made.
- **In subtitles mode**, translation only affects the single visible line overlay band (one `TokenizedText` per active line).
- **In transcript mode**, all 300 lines are in the DOM. Translation chunks run sequentially and update `translatedLines` state progressively, causing `syncedLines` to re-sync with each chunk, and all rendered lines to update.

### Files

| File | Role |
|---|---|
| `apps/web/src/components/video/subtitle-display.tsx` | Receives `initialLines`, triggers translation |
| `apps/web/src/hooks/use-subtitle-translation.ts` | Chunked `/translate_array` calls (fallback only) |
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
├─ 4. Translation (SubtitleDisplay)
│   ├─ initialLines have empty L1 (subs_l1 deprecated)
│   └─ useSubtitleTranslation → /translate_array, chunks of 5, sequential
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
| `/translate_array` called for every video (no pre-translated subs) | `subs_l1` is deprecated; L1 translations must be computed on-the-fly | Normal operation. Each 300-line video = 60 sequential ChatGPT calls. No server-side cache. | — |

---

## Server-Side Caching

| Endpoint | Cache Strategy |
|---|---|
| `/lemmatize-video-normalized` | Server-side disk cache via `utils_video_lemma.py`. Lemmatized once, served from cache on subsequent requests. |
| `/dictionary/lookup-batch` | LLM results cached in `cache/dictionary_llm/{l1}/{l2}-{hash}.json`. CSV dictionaries are in-memory SQLite. |
| `/translate_array` | Server-side translation cache per (text, l1, l2). Cold: calls ChatGPT. Warm: instant. |

---

## Risks & Open Issues

| Risk | Status |
|---|---|
| YouTube L2 fallback (`/get_best_l2_subs`) may not exist in current Python server | ⚠️ Unverified — videos without Directus L2 subs might show no subtitles |
| YouTube L1 fallback (`/get_best_l1_subs`) no longer used | ✅ All L1 translations are live-translated via `/translate_array` with server cache |
