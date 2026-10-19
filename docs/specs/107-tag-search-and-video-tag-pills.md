# SPEC-107: Tag Search and Video-Tag Pills

## Metadata

- **Spec ID**: SPEC-107
- **Feature**: Search videos by tag (`#tag`) and show a video's tags on the watch page
- **Status**: complete
- **Created**: 2026-10-19
- **Last Updated**: 2026-10-19
- **ROADMAP Phase**: Phase 3 — Explore + Video Player
- **See also:**
  - `packages/shared/src/video-tags.ts` — `#` convention and tag parsing helpers
  - `apps/web/src/app/[l1]/[l2]/search/page.tsx` — web search page
  - `apps/web/src/components/video/video-meta.tsx` — web watch-page metadata pills
  - `apps/mobile/app/(tabs)/(media)/search.tsx` — mobile search screen
  - `apps/mobile/components/video/VideoMeta.tsx` — mobile watch-page metadata pills
  - `zerotohero-python-server/routes/video.py` — `GET /search-videos` (`tag` param)
  - SPEC-004 — original search + `VideoMeta`
  - SPEC-010 — watch-page layout
  - SPEC-105 — tag-search indexes (open question answered here)

---

## Overview

Tags used to be a dead end: clicking one on the search page filled the search
box with the bare tag and ran a **title** search, and the watch page did not
show a video's tags at all. This spec makes tags a first-class navigation
surface in both apps:

1. A tag click runs a **tag search** — `#news` in the search field, `tag=news`
   on the wire, and `?q=%23news` in the web URL. Typing the `#` yourself does
   the same thing.
2. The watch page shows the video's tags next to its category label, as pills
   with a tag icon. Only the first three are visible; the rest sit behind a
   `…` button. Tapping a pill opens the search page with that tag query.

---

## Behaviour

### The `#` convention

- Any search query whose first non-space character is `#` is a tag search.
- The search field and result summary keep the `#` (`#news`), because that is
  what tells the user (and the app) which mode is active.
- The API receives the bare tag (`tag=news`), never the `#` or a quoted term.
- A bare `#` (nothing after it) is a no-op — it never searches titles.
- A `#` query is never interpreted as a YouTube URL, even if the tag text
  looks like one.
- Web keeps the query in the URL as `?q=%23news` (`#` is percent-encoded
  because a literal `#` starts the URL fragment). The encoded URL is
  bookmarkable and is what the watch-page tag pills link to.
- Mobile keeps the query in component state; it also accepts a `?q=` route
  param so a link (universal link / WebView bridge) can open a tag search.
  `mapWebUrlToAppRoute` already forwards arbitrary query params.

### Search pages (web + mobile)

- Clicking a tag in the popular-tag cloud sets the field to `#<tag>` and runs
  a tag search.
- Submitting `#<tag>` from the keyboard runs the same tag search.
- Everything else (bare text, YouTube URLs) behaves exactly as before.
- The tag cloud itself is unchanged: same order (`/video-tags`), same
  show-more limit, same pill styling.

### Watch pages (web + mobile)

- The video's `tags` column is comma-separated; it is split, trimmed, and
  de-duplicated case-insensitively by `parseVideoTags`.
- Pills render immediately after the category label, in the same row, and use
  the same rounded/full muted pill treatment as the search tag cloud. Each
  pill carries a tag icon and the bare tag label.
- At most three tags are visible. If the video has more, a `…` pill toggles
  the rest inline (the control becomes a chevron-up when expanded). The
  control is labelled with the existing `action.show_more` /
  `action.show_less` translation keys.
- Tapping a pill navigates to the search page with `#<tag>` as the query,
  which auto-runs the tag search (web) / consumes the `q` param (mobile).
- Tags only render where the metadata block already renders; no new layout
  slots were added to subtitles mode.

---

## Implementation

### Shared

- `packages/shared/src/video-tags.ts`
  - `TAG_SEARCH_PREFIX`
  - `parseVideoTags(tags)` — comma-split, trim, case-insensitive dedupe
  - `isTagSearchQuery(query)`
  - `formatTagSearchQuery(tag)` — `news` → `#news`
  - `parseTagSearchQuery(query)` — `#news` → `news`
- Exported from `@langplayer/shared`; unit-tested in `video-tags.test.ts`.

### Web

- `apps/web/src/app/[l1]/[l2]/search/page.tsx`
  - `doSearch()` derives `byTag` from the leading `#`, sends
    `{ tag }` or `{ q }` to `searchByTitle`, keeps the raw query in `?q=`.
  - `autoSearchedRef` prevents the auto-search effect from re-running the same
    search when `doSearch()` rewrites the URL.
  - `isImport` is disabled for `#` queries.
- `apps/web/src/components/video/video-meta.tsx`
  - `parseVideoTags(video.tags)`, first three + `…` toggle, pills push
    `/{l1}/{l2}/search?q=%23<tag>`.

### Mobile

- `apps/mobile/app/(tabs)/(media)/search.tsx`
  - Same `#` handling; `useLocalSearchParams` + an auto-search effect consume
    a `q` param; tag clicks set `#<tag>`.
- `apps/mobile/components/video/VideoMeta.tsx`
  - Same pill row and `…` toggle; pills push
    `/(tabs)/(media)/search?q=%23<tag>`.

### Backend

No change. `GET /search-videos?tag=…` already filters
`youtube_videos.tags ILIKE '%tag%'` (SPEC-039). Tag matching is therefore
substring-based, not exact-token; the tag cloud always supplies real tags, so
this is acceptable for now (see Open Questions).

---

## Classic reference

`zerotohero-nuxt/pages/_l1/_l2/youtube/search.vue` splits its tag cloud from
title search with a route param (`field=tags`). This spec deliberately uses the
`#` prefix instead, because the query is visible in the search field and can be
typed by the user; the route shape (`?q=…`) stays unchanged.

---

## Dependencies

- SPEC-004 (search + `VideoMeta`)
- SPEC-010 (watch-page layout)
- SPEC-039 (`/video-tags` on Supabase, `/search-videos` tag filter)
- SPEC-105 (trigram index question for `tags ILIKE`)

---

## Open Questions

- Should tag matching become exact-token (`(',' || tags || ',') ILIKE
  '%,news,%'`) rather than substring? That would avoid returning videos whose
  tags merely contain the term, but needs a before/after latency measurement
  (see SPEC-105).
- If tag searches become common, add the trigram index discussed in SPEC-105.
- Tag order on the watch page follows the stored comma order. If that proves
  noisy, sort by relevance or alphabetically.
