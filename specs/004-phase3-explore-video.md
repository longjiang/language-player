# SPEC-004: Phase 3 — Explore + Video Player

## Metadata
- **Spec ID**: SPEC-004
- **Feature**: Video browse, search, and YouTube playback
- **Status**: draft
- **Created**: 2026-07-12
- **ROADMAP Phase**: Phase 3 — Explore + Video Player

## Overview

Implement video discovery and playback. Users can browse videos by language/level, see recommended content, watch a YouTube video with embedded player, and view basic video metadata (title, duration, difficulty, thumbnail).

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

## Implementation Plan

### Part A: Data Layer — Video API Client

Add video endpoints to `@langplayer/api-client` that both web and (eventually) mobile can use.

#### Tasks

1. **`packages/api-client/src/videos.ts`** — enhance existing stubs:
   - `getRecommended(l2: string, level?: number, page?: number)` → fetches from Python `/video/recommend`
   - `getByL2(l2: string, params: { level?, page?, search?, category? })` → fetches from Directus via Python
   - `getById(id: string)` → single video with subtitles
   - `getSubtitles(videoId: string)` → synced L1/L2 subtitle lines
   - `searchSubtitles(q: string, l2: string)` → Python `/video/subs-search`

2. **`apps/web/src/lib/video-service.ts`** — Next.js-specific service layer:
   - Server Component-friendly data fetching (without hooks)
   - Caches responses where appropriate
   - Handles Directus table sharding internally

### Part B: Explore Page

Rebuild Classic's `explore-media.vue` for the Next.js App Router at `/[l1]/[l2]/explore`.

#### Tasks

1. **Video grid** — `YouTubeVideoCard` component:
   - Thumbnail: `https://img.youtube.com/vi/{youtube_id}/mqdefault.jpg`
   - Title (truncated to 2 lines)
   - Difficulty badge (CEFR level with color)
   - Duration badge
   - Views count
   - Responsive grid: 4 cols desktop → 2 cols tablet → 1 col mobile

2. **Difficulty filter bar** — horizontal pill selector:
   - Levels 1–7 with labels (Beginner I → Mastery)
   - Color-coded to match Classic/GO's level colors
   - Default to user's saved level

3. **Infinite scroll** / "Load more" button:
   - Fetch next page when user scrolls to bottom
   - Loading skeleton cards while fetching

4. **Video card states**:
   - **Loading**: skeleton pulse animation
   - **Empty**: "No videos found for this level" with suggestion to try lower level
   - **Error**: retry button
   - **Loaded**: thumbnail + metadata

5. **URL search params** (optional, nice-to-have):
   - `?level=3` — filter by level
   - `?q=search+term` — search query
   - Enables shareable filtered views

### Part C: Video Player Page

Create `/[l1]/[l2]/watch/[videoId]` — the video playback page.

#### Tasks

1. **YouTube player embed** — `YouTubePlayer` component:
   - Iframe-based (not WebView — web only for now)
   - YouTube IFrame API for play/pause/seek control
   - Responsive 16:9 container
   - Autoplay support
   - Mute/unmute toggle

2. **Video metadata sidebar/below**:
   - Title, channel, published date
   - Difficulty level badge
   - Views, likes, comments count
   - "Save to watch later" button (stub — actual saving in Phase 6)

3. **"Up next" / recommended sidebar**:
   - 3–5 related videos (same L2, similar difficulty)
   - Click to navigate to next video

4. **Player states**:
   - **Loading**: skeleton for video container
   - **Video unavailable**: "This video is no longer available" with suggestion
   - **Error**: retry / report issue

### Part D: Simple Subtitle Display (no interaction yet)

Display subtitles below the video — no tap-to-dictionary yet (that's Phase 4).

#### Tasks

1. **Subtitle line display**:
   - L2 line (target language) — larger, prominent
   - L1 line (native translation) — smaller, muted
   - Current line highlighted
   - Auto-scroll to current line

2. **Subtitle toggle**:
   - Show/hide L1 translation
   - Show/hide L2 captions

### What We're NOT Building in Phase 3

- ❌ Tap-to-dictionary (Phase 4)
- ❌ Tokenization/lemmatization display (Phase 4)
- ❌ Word saving (Phase 4)
- ❌ Synced transcript with precise timing (Phase 3 uses basic line sync)
- ❌ Live TV (Phase 5)
- ❌ TV Shows page (Phase 5)
- ❌ Playback speed control (nice-to-have, can add in Phase 3 if time allows)

---

## Component Tree

```
/[l1]/[l2]/layout.tsx (existing)
└── Explore Page
    ├── LevelFilterBar          ← Horizontal pill selector (level 1–7)
    ├── VideoGrid               ← Responsive grid
    │   └── VideoCard[]         ← Thumbnail, title, difficulty, duration
    └── LoadMore                ← Infinite scroll trigger

/[l1]/[l2]/watch/[videoId]
├── YouTubePlayer              ← Iframe embed with controls
├── VideoMeta                  ← Title, stats, level badge
├── SubtitleDisplay            ← L1 + L2 lines, highlighted current
└── UpNext[]                   ← Recommended videos sidebar
```

## Files to Create / Modify

### New Files
| File | Purpose |
|------|---------|
| `apps/web/src/components/video/video-card.tsx` | Thumbnail card with metadata |
| `apps/web/src/components/video/video-grid.tsx` | Responsive grid of VideoCards |
| `apps/web/src/components/video/level-filter.tsx` | Level pill selector |
| `apps/web/src/components/video/youtube-player.tsx` | YouTube iframe embed |
| `apps/web/src/components/video/video-meta.tsx` | Title, stats, level badge |
| `apps/web/src/components/video/subtitle-display.tsx` | L1/L2 subtitle lines |
| `apps/web/src/components/video/up-next.tsx` | Recommended sidebar |
| `apps/web/src/app/[l1]/[l2]/watch/[videoId]/page.tsx` | Video player page |
| `apps/web/src/lib/video-service.ts` | Data fetching layer |
| `apps/web/src/hooks/use-videos.ts` | SWR/React Query hook for videos |
| `apps/web/src/hooks/use-youtube-player.ts` | YouTube IFrame API hook |

### Modified Files
| File | Change |
|------|--------|
| `apps/web/src/app/[l1]/[l2]/explore/page.tsx` | Replace stub with real implementation |
| `packages/api-client/src/videos.ts` | Add real endpoint implementations |
| `apps/web/next.config.js` | Add YouTube image domains |

## API Flow

```
User visits /en/zh/explore
  → page loads
  → useVideos() hook fetches GET /video/recommend?l2=zh&level=3&page=1
  → Python backend queries Directus youtube_videos_4 table
  → Returns: [{ id, youtube_id, title, difficulty, duration, views, ... }]
  → VideoGrid renders VideoCards with thumbnails from img.youtube.com

User clicks a video card
  → navigates to /en/zh/watch/{youtube_id}
  → page loads video metadata + subtitles
  → GET /video/sync-subtitles?video_id=xxx&l1=en&l2=zh
  → YouTubePlayer mounts iframe with youtube_id
  → SubtitleDisplay shows L1/L2 lines
```

## Verification Checklist

- [ ] `npx turbo build` passes
- [ ] `/en/zh/explore` shows video grid with thumbnails, titles, difficulty badges
- [ ] Level filter changes which videos are shown
- [ ] Clicking a video card navigates to `/en/zh/watch/{youtube_id}`
- [ ] YouTube player loads and plays the video
- [ ] Subtitle lines display below the player
- [ ] "Up next" shows related videos
- [ ] Video card skeleton shows while loading
- [ ] Empty state shows when no videos match filter
- [ ] Error state shows retry button on fetch failure
