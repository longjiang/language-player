# Media Metadata Localization & TV Show Badge

## Metadata
- **Spec ID**: SPEC-092
- **Feature**: Localized video category names + TV-show badge; TV-shows toolbar polish
- **Status**: complete
- **Created**: 2026-08-29
- **ROADMAP Phase**: Phase 3: Explore + Video Player

## Overview
Videos carry a numeric YouTube category id (`youtube_videos.category`). The
watch page displayed this raw number, and the subs-search advanced filters
only named categories 10 and 24 by hand. This spec adds a single shared
id → translation-key map, localizes every category surface in web and mobile,
and adds a TV-show badge to the video details row that links to the show's
episode list. It also polishes the TV-shows list toolbar (control heights,
responsive dropdown row, "Sort by …" labels) and removes the no-op "year"
sort — the `tv_shows` table has no year column.

## User Stories
- As a learner, I want the category badge on the watch page to read
  "Education" (or my UI language's equivalent) instead of "27".
- As a learner, I want to see which TV show a video belongs to and jump to
  its episode list with one tap.
- As a learner on a phone, I want the sort and locale dropdowns aligned with
  the search bar and predictably laid out on a narrow screen.

## Reference: Classic (Nuxt)
- `zerotohero-nuxt/lib/youtube.js` — `CATEGORIES` (id → English name),
  `CATEGORY_ICONS`, `SLUG_TO_CATEGORY_ID` (`music→10`, `news→25`, …). The
  new shared map replaces the *need* for `CATEGORIES` in active apps; Classic
  remains reference-only.

## Implementation (Next.js + React Native)

### Shared map (`packages/shared/src/youtube-categories.ts`)
- `YOUTUBE_CATEGORY_KEYS` — the 16 category ids that occur in the catalog
  (1, 2, 10, 15, 17, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30) mapped to
  `category.*` translation keys.
- `youTubeCategoryLabel(id, t, fallback)` — localized label; unknown ids fall
  back to the caller's fallback (both apps use `label.category_n`
  = "Category {n}").
- Translations live in `translations.csv` (`category.*` keys, 18 locales),
  regenerated into `packages/shared/locales/*.json` via
  `node scripts/sync-translations.mjs csv-to-json`.

### Category badge (video details)
- Web: `apps/web/src/components/video/video-meta.tsx`
- Mobile: `apps/mobile/components/video/VideoMeta.tsx`
- Both render `youTubeCategoryLabel(Number(video.category), …)` instead of
  the raw number; the badge is hidden when `category` is unset.

### TV-show badge (video details)
- Web: `apps/web/src/components/video/tv-show-badge.tsx`
- Mobile: `apps/mobile/components/video/TVShowBadge.tsx`
- Rendered next to the category badge when `video.tv_show` is set.
- Shows the show's title, fetched once per show id from `GET /tv-shows/:id`
  (Flask `routes/tv_shows.py` → `utils_content.get_tv_show`); while loading
  or on error it falls back to the localized `title.tv_show` label.
- Tap → episode list: web `/[l1]/[l2]/tv-shows/[id]`, mobile
  `/(tabs)/(media)/tv-shows/[id]`.

### Subs-search category checkboxes
- `apps/web/src/components/video/subs-search-results.tsx`,
  `apps/mobile/components/video/SubsSearchResults.tsx`
- The advanced-search checklist labels every category in the result pool via
  `youTubeCategoryLabel` (previously only 10 and 24 had names). Counts and
  the "All categories" row are unchanged. The All/Music/Non-Music/TV-Shows
  pills keep their `category === 10 || 24` behavior (SPEC-079/082).

### TV-shows list toolbar
- Web `apps/web/src/app/[l1]/[l2]/tv-shows/page.tsx`:
  - Sort + locale `SelectTrigger`s: `h-10 rounded-lg w-[180px]` so they match
    the search input's height and radius (the stock trigger is `h-8`; its
    `data-[size=default]:h-8` variant beats a plain `h-10`, but an explicit
    height wins after `tailwind-merge`).
  - `<md`: search takes a full-width row and sort/locale share the next row;
    `md+`: all inline.
- Mobile `apps/mobile/app/(tabs)/(media)/tv-shows.tsx`:
  - `DropdownPicker` chrome aligned with the shared `Input` defaults
    (`h-10`, `rounded-md`, `border-input`, `bg-background`).
  - `md+`: search flexes with fixed-width (140) dropdowns; small screens:
    search row, then a dropdown row.
- Sort options are **Views** and **Title** only, labeled with the new
  `sort.by_views` / `sort.by_title` keys ("Sort by Views" / "Sort by Title").

### Year sort — removed
`tv_shows` has no `year` column (`_SHOW_FIELDS` in
`zerotohero-python-server/utils_content.py`) and `/tv-shows` never returns
one, so the previous "Sort by Year" option sorted by `(year ?? 0)` — a
silent no-op. The option is removed from both apps. `ShowWithMeta.year` and
the card's `{show.year && …}` display guard remain, so a year will appear on
cards automatically if the column is ever added.

## API Endpoints
- `GET /tv-shows/:id` — existing; now also called by the watch-page badge.
- No backend changes.

## Dependencies
- SPEC-010 (watch page layout — badge row under the player)
- SPEC-079/082 (subs-search content filters — pills and checkbox behavior)
- AGENTS.md i18n workflow (CSV → locale JSONs)

## Open Questions
- Should `tv_shows` gain a `year` column (e.g. derived from episode dates or
  YouTube metadata) to revive year sorting/display? Deferred — the client
  side is already wired for it.
