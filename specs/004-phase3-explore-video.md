# SPEC-004: Phase 3 — Explore + Video Player

## Metadata
- **Spec ID**: SPEC-004
- **Feature**: Video browse, search, YouTube playback, and subtitle display
- **Status**: complete (updated 2026-07-12 with Phase 4 additions)
- **Created**: 2026-07-12
- **ROADMAP Phase**: Phase 3 — Explore + Video Player

---

## What Was Built

### Part A: Data Layer

- **`lib/video-service.ts`** — Server-side video fetching from Python backend
  - `getRecommendedVideos(l2, level?, page, pageSize)` → calls `/recommend-videos`
  - `getVideoById(youtubeId)` → calls `/check-youtube`
  - `youtubeThumbnail(id, quality)` — thumbnail URL builder
- **`hooks/use-videos.ts`** — Client-side pagination + level filtering hook
  - States: loading skeleton, empty, error with retry, load more
- **`app/api/videos/recommend/route.ts`** — Proxy endpoint: `/api/videos/recommend?l2=ja&limit=24`
- **`app/api/videos/[videoId]/route.ts`** — Single video lookup: `/api/videos/{id}?l2=ja`
- **`app/api/videos/[videoId]/subtitles/route.ts`** — Subtitle data from Directus
- Added `category`, `tags`, `type`, `made_for_kids` fields to `YouTubeVideo` type in `@langplayer/shared`

### Part B: Explore Page (`/[l1]/[l2]/explore`)

- **`VideoCard`** — Thumbnail (`mqdefault.jpg`), play overlay on hover, difficulty badge (C1/B2 etc.), duration badge (MM:SS), views count
- **`VideoGrid`** — Responsive grid: 4 cols → 2 cols → 1 col
- **`LevelFilter`** — CEFR pill selector: All / A1 / A2 / B1 / B2 / C1 / C2 / Native, color-coded
- **Explore page** — Real data fetching, loading skeleton cards (8-placeholder), error state with retry, empty state with suggestion, "Load More" button with spinner

### Part C: Video Player (`/[l1]/[l2]/watch/[videoId]`)

- **`YouTubePlayer`** — Iframe-based embed with YouTube IFrame API
  - Play/pause/seek via `postMessage`
  - Time polling at 500ms intervals
  - Dynamic script injection for IFrame API
  - ID-based container (not element ref) for API compatibility
- **`VideoMeta`** — Title, views, likes, comments, date, CEFR level badge, locale, category
- **Watch page** — Player + metadata + subtitles + up-next sidebar (stub)

### Part D: Subtitle Display

- **`SubtitleDisplay`** — L2 captions always shown, L1 translations below (when enabled)
  - Auto-scroll to current line based on playback time
  - Active line highlighted with ring + background
  - Translation toggle button (single pill, not dual pills)
  - Progress counter: "Translating… 15/89"
- **`hooks/use-subtitle-translation.ts`** — Chunked translation via DeepSeek LLM
  - Ported from Classic's `autoTranslateMixin.js`
  - 5 lines per API call to `POST /translate_array`
  - AbortController for cancellation on navigation
  - Progressive UI update as chunks arrive
- **`lib/settings.ts`** — localStorage wrapper for client preferences
  - `showTranslation` key, default: `true`

## Research Summary

### How Classic Works (explore-media.vue, 289 lines)

- **VideoHero** at top — featured/promoted video with watch button
- **Continue Watching** — horizontal carousel from watch history
- **Recommended** — `YouTubeVideoList` with infinite scroll, triggered by `v-observe-visibility`
- **Content sections**: Music, TV Shows, Movies, YouTube, Live TV, News, Audiobooks, Kids
- **Level filtering**: content matched to user's CEFR level
- Data fetched via Vuex store actions, backed by Directus `youtube_videos_*` tables

### How GO Works (732 lines across 6 components)

- **YouTubeVideo** (414 lines) — Cross-platform player using WebView on native / iframe on web. Communicates via `postMessage`. Supports: play, pause, seekTo, mute, unmute, time polling. Uses YouTube IFrame API internally.
- **VideoHero** (90 lines) — Gradient overlay, title, watch button
- **YouTubeVideoCard** — Thumbnail from `img.youtube.com/vi/{id}/0.jpg`, difficulty badge (CEFR level), duration badge, views count
- **YouTubeVideoList** — Grid/flat list
- **VideoWithTranscript** (143 lines) — Player + synced dual subtitles
- **SyncedTranscript** (85 lines) — Tokenized lines with tap-to-dictionary

### API Layer

**Directus 8** (auth + CMS):
- Videos stored in sharded tables: `youtube_videos_2`, `youtube_videos_3`, ... `youtube_videos_14`
- Each table holds videos for specific language groups (e.g., `_4` = zh, `_5` = en, `_9` = es/ca/ru)
- Key fields: `id`, `youtube_id`, `title`, `l2`, `difficulty`, `lex_div`, `word_freq`, `views`, `likes`, `comments`, `duration`, `locale`, `tv_show`, `talk`, `date`, `tags`, `category`, `made_for_kids`, `subs_l1`, `subs_l2`

**Python Backend** (video endpoints):
| Endpoint | Purpose |
|----------|---------|
| `/video/recommend` | Get recommended videos for L2 + level |
| `/video/subs-search` | Search subtitles |
| `/video/channel-preferences` | User channel prefs |
| `/video/sync-subtitles` | Get synced L1/L2 subtitle lines |
| `/video/youtube-embed-proxy` | Proxy YouTube embed requests |

---

## Research Summary (Updated with Discoveries)

### Directus 8 API

**Base URL**: `https://directusvps.zerotohero.ca/zerotohero`

**Table Sharding** — Videos are split across 13 sharded tables by language:
| Table | Languages |
|-------|-----------|
| `youtube_videos_2` | eu, vi |
| `youtube_videos_3` | ko |
| `youtube_videos_4` | zh |
| `youtube_videos_5` | en |
| `youtube_videos_6` | de |
| `youtube_videos_7` | ja |
| `youtube_videos_8` | fr |
| `youtube_videos_9` | es, ca, ru |
| `youtube_videos_10` | tr, pl, nl |
| `youtube_videos_11` | he, pt, el, uk, cs, ar, sk, ms |
| `youtube_videos_12` | it |
| `youtube_videos_13` | id, sv, no, nan |
| `youtube_videos_14` | th, my |

**Filter format**: Directus 8 uses bracket notation, NOT JSON:
```
✅ filter[youtube_id][eq]=VHKMwue-jUE
❌ filter={"youtube_id":{"eq":"VHKMwue-jUE"}}
```

**Subtitle storage format**: `subs_l2` and `subs_l1` are stored as **CSV strings**, not JSON arrays:
```
starttime,line
31.54,SO CHECK IT OUT AND TURN UP THE BASS
33.78,AND LET YOU KNOW THAT WE&#39;RE THE BEST
```
- Must parse with CSV parser (header row: `starttime,line`)
- HTML entities need unescaping: `&#39;` → `'`, `&amp;` → `&`
- GO app uses PapaParse; our implementation uses a simple manual parser

### Python Backend Endpoints (Actual)

**Base URL**: `https://pythonvps.zerotohero.ca`

| Endpoint | Method | Purpose | Key Params |
|----------|--------|---------|------------|
| `/recommend-videos` | GET | Video recommendations | `l2`, `limit`, `level` |
| `/translate_array` | POST | Translate batch of lines | `{ texts, l1, l2 }` → `{ translated_texts }` |
| `/translate` | GET/POST | Translate single text | `text`, `l1`, `l2` |
| `/check-youtube` | GET | Check YouTube availability | `youtube_ids` |
| `/subs-search` | GET | Search subtitles | `terms`, `l2` |
| `/sync-srt` | POST | Sync subtitle timing | `youtube_id`, `srt_content` |

**Translation API**: Uses DeepSeek LLM (not Azure). Called via `app_translator_chatgpt.chatgpt_translate_text_array()`.

**Key discovery**: The `/recommend-videos` endpoint uses `limit` parameter (not `page`/`page_size`). Our implementation initially used `page_size` which returned empty results.

### Classic Nuxt App Reference

**Subtitle flow**:
1. `videoLoaderMixin.js` → `getVideoFromDB()` fetches video from Directus with `subs_l2`
2. `delete video.subs_l1` — stored translations are ALWAYS discarded (quality may be stale)
3. `autoTranslateMixin.js` → `translateSubtitlesInChunks()` sends 5 lines at a time to `POST /translate_array`
4. Results stored in Vuex `shows/MODIFY_ITEM` — progressive UI update
5. `syncLines(l1Lines, l2Lines)` matches by closest `starttime`

**Translation cancellation**: Uses `AbortController` passed to Axios. Navigation away from video cancels in-flight translation requests.

### GO App Reference

**Subtitle sync algorithm** (`src/subs.ts`):
- `syncLines(l1Lines, l2Lines)` — greedy matching by closest starttime difference
- `findSubtitle(currentTime, syncedLines)` — binary search for current line
- Uses `subs_l1` from Directus if available, otherwise calls translation API

---

## Implementation Notes & Lessons Learned

### Bugs Encountered & Fixed

1. **API route 404** — Middleware blocked `/api/videos/*`. Fixed by adding to bypass list.
2. **Empty video results** — Used wrong endpoint path (`/video/recommend` → `/recommend-videos`) and wrong param (`page_size` → `limit`).
3. **Single video 404** — Python has no `/video/{id}` endpoint. Fixed by passing `l2` param and fetching from `/recommend-videos` with filtering.
4. **Empty subtitles** — Directus stores `subs_l2` as CSV string, not JSON. Fixed with `parseCSVSubtitles()` including HTML entity decoding.
5. **TS2742 type error** — NextAuth v5 beta cannot export destructured `auth`. Fixed by not exporting `auth`, using manual cookie checks in middleware.
6. **`useSearchParams()` prerender error** — Must be wrapped in `<Suspense>` boundary. Fixed login page component structure.
7. **Missing `'use client'`** — `/[l1]/[l2]/*` pages calling hooks without the directive. Fixed all 4 language-scoped pages.

### Architecture Decisions

- **No shared UI between web and mobile** — confirmed by ADR-0003
- **npm workspaces with `*` version** — not `workspace:*` (npm limitation, see ADR-0001)
- **L1/L2 routing via URL params** — matches Classic pattern, enables shareable URLs
- **Translation default ON** — matches Classic behavior, with toggle to disable

### What Was NOT Built (Deferred)

- ❌ VideoHero / featured video banner (lower priority than grid browse)
- ❌ Continue Watching carousel (needs watch history — Phase 6)
- ❌ TV Shows / Live TV pages (Phase 5)
- ❌ Persisting translations to Directus (Classic doesn't either)
- ✅ ~~Tap-to-dictionary~~ → built (Phase 4)
- ✅ ~~Tokenization/lemmatization display~~ → built (Phase 4)

---

## Phase 4 Additions — Video Controls, Queue, Dictionary

### Part E: Video Control Bar

- **`VideoControlBar`** — Full control bar below the player, matching Classic/GO layout
  - **Play/Pause** (Space) — toggle button with state-aware icon
  - **Previous/Next Line** (←/→) — seeks to previous/next subtitle line boundary
  - **Rewind** (R) — jumps back 2 seconds
  - **Speed toggle** (M) — cycles: 1× → 0.75× → 0.5× → 1×, badge highlights when active
  - **Prev/Next Video** (Shift+←/→) — skip through the player queue
  - **Progress bar** — clickable seek bar with fill indicator
  - **Time display** — MM:SS / MM:SS format
- **`YouTubePlayer` refactor** — converted to `forwardRef`, exposes `YouTubePlayerHandle` (play, pause, seekTo, setPlaybackRate)

### Part F: Player Queue

- **`QueueManager`** (`lib/queue-manager.ts`) — singleton class matching GO architecture
  - Three queue types: `recommended` (explore feed), `tvShow` (episodes), `search` (results)
  - Tracks current video by `youtube_id`, provides `getNext()`/`getPrevious()`
- **`VideoPlayerProvider`** (`providers/video-player-provider.tsx`) — React context wrapping language layout
  - `playVideo(video, queue, queueType)` — set queue + navigate
  - `playNext()` / `playPrevious()` — skip forward/back in queue
  - `hasNext` / `hasPrevious` booleans for UI state
- **`VideoQueueList`** — Up Next sidebar showing full queue as a scrollable list
  - Current video highlighted with primary border
  - Click any item to jump to that position
- **`VideoCard` list variant** — `layout="list"` renders compact horizontal row (thumb + title + badges)

### Part G: Subtitle Improvements

- **Duration prefix stripping** — raw `"0.64,来"` → clean `"来"` via `stripDurationPrefix()`
- **Clickable subtitle lines** — clicking a line (outside a word) seeks to that timestamp
  - Word clicks still open dictionary popup (via `stopPropagation`)
- **Prev/Next line by subtitle boundaries** — `onLinesLoaded(startTimes[])` callback enables precise line navigation

### Part H: `lib/utils.ts`

- **`cn()`** — Tailwind class merging utility (`clsx` + `tailwind-merge`) for conditional styling

---

## Python Backend — Dictionary LLM Fallback

### Dictionary Lookup (`POST /dictionary/lookup`)

- **CSV dictionaries** — CEDICT (zh), EDICT (ja), CC-Canto (yue), Kengdic (ko), Klingonska (tlh), Wiktionary (all others)
- **LLM fallback** — when no CSV entry found, generates via DeepSeek (`_llm_lookup`)
  - Cache: MD5-hashed JSON files in `cache/dictionary_llm/`
  - Guards: skip empty/punctuation-only queries
  - Response strips markdown fences, parses CEFR level, builds phonetic detail
- **Fuzzy match fix** — `CedictLoader` now requires `len(key) > 1` for character substring matches (matching `CantoLoader`), preventing single-char matches from blocking LLM fallback
- **Route-level safety net** — when all results are fuzzy and no head equals query, also tries LLM

---

## Files Created (Final)

| File | Lines | Purpose |
|------|-------|---------|
| `components/video/video-card.tsx` | ~140 | Thumbnail card, supports `layout="card"|"list"` |
| `components/video/video-grid.tsx` | ~25 | Responsive 4→2→1 column grid |
| `components/video/video-queue-list.tsx` | ~25 | Up Next sidebar queue list |
| `components/video/video-control-bar.tsx` | ~170 | Play/pause, seek, speed, prev/next, progress bar |
| `components/video/level-filter.tsx` | 52 | CEFR pill selector |
| `components/video/youtube-player.tsx` | ~200 | YouTube IFrame API embed with ref handle |
| `components/video/subtitle-display.tsx` | ~180 | L2 captions + L1 translations, line click seeking |
| `components/tokenized-text.tsx` | ~170 | Lemmatized word tokens with dictionary popup |
| `lib/queue-manager.ts` | ~130 | QueueManager singleton (recommended/tvShow/search) |
| `lib/utils.ts` | 6 | `cn()` classname utility |
| `providers/video-player-provider.tsx` | ~100 | React context for queue navigation |
| `hooks/use-videos.ts` | ~75 | Client-side pagination hook |
| `hooks/use-subtitle-translation.ts` | ~80 | Chunked LLM translation |
| `app/[l1]/[l2]/watch/[videoId]/page.tsx` | ~200 | Watch page: player + controls + subs + sidebar |
| `app/[l1]/[l2]/explore/page.tsx` | ~90 | Explore page with level filter + video grid |
| `app/api/videos/recommend/route.ts` | 20 | Proxy: /api/videos/recommend |
| `app/api/videos/[videoId]/route.ts` | 25 | Proxy: /api/videos/{id} |
| `app/api/videos/[videoId]/subtitles/route.ts` | 95 | Subtitle CSV parser with HTML entity decode |
| `components/video/video-meta.tsx` | 107 | Title, stats, level badge |
| `components/video/subtitle-display.tsx` | 135 | L2 captions + L1 translation display |
| `components/video/index.ts` | 6 | Barrel export |
| `hooks/use-videos.ts` | 78 | Pagination + level filtering |
| `hooks/use-subtitle-translation.ts` | 78 | Chunked DeepSeek translation |
| `lib/video-service.ts` | 99 | Server-side video data fetching |
| `lib/settings.ts` | 43 | localStorage preferences wrapper |
| `app/[l1]/[l2]/explore/page.tsx` | 109 | Explore page (rewritten from stub) |
| `app/[l1]/[l2]/watch/[videoId]/page.tsx` | 91 | Video player page |
| `app/api/videos/recommend/route.ts` | 20 | Proxy: Python recommendations |
| `app/api/videos/[videoId]/route.ts` | 26 | Proxy: single video lookup |
| `app/api/videos/[videoId]/subtitles/route.ts` | 117 | Directus CSV subtitle fetch |

**Total**: 16 files, ~1,250 lines of new code.
