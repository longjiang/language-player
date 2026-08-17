# Feature Specification: Subs Search Content Filter Pills

## Metadata
- **Spec ID**: SPEC-079
- **Feature**: Subs search content filter pills (All / Non-Music / Music / TV Shows)
- **Status**: complete
- **Created**: 2026-02-11
- **ROADMAP Phase**: Media — Subtitle Search

## Overview
The subs-search results component (`SubsSearchResults`) shows a nav bar above the
result list. Next to the existing exact-match forms toggle ("This form / All
forms"), we now render a group of content-filter pills: **All**, **Non-Music**,
**Music**, and **TV Shows**. They filter the fetched results client-side by the
video's YouTube `category` and `tv_show` membership, so a learner can e.g. exclude
music videos from example sentences or restrict them to TV-show dialogue.

## User Stories
- As a learner, I want to filter example sentences to non-music videos so I see
  conversational dialogue instead of song lyrics.
- As a learner, I want to see only TV-show examples so I can study a familiar
  series' dialogue.
- As a learner, I want to see only music examples when I'm focused on lyrics.

## How It Works in Classic (Nuxt)
Classic's subs search (`zerotohero-nuxt/components/SearchSubsComp.vue`) reads a
`categoryFilter` from `$l2Settings`, and elsewhere treats `category == 10` /
`tv_show` as music markers (`components/VideoDetails.vue`). Classic's browse page
excludes music with `filter[category][nin]=10`. There is no exact pill-group UI in
Classic; this spec adds it directly to the Next.js subs search results.

## How It Works in GO (React Native)
Not ported in this spec. The mobile `SubsSearchResults`
(`apps/mobile/components/video/SubsSearchResults.tsx`) shares the
`SubsSearchVideo` type and could adopt the same pills later.

## Implementation Plan (Next.js)

### Route
No route changes — `SubsSearchResults` is embedded in the dictionary entry tabs
(`apps/web/src/components/dictionary-entry-tabs.tsx`).

### Data Flow
1. `/subs-search` already returns `category` and `tv_show` columns per row
   (`zerotohero-python-server/app_subs_search.py` SELECT). The client previously
   dropped them; now the fetch maps them onto `SubsSearchVideo` via `Number()`.
2. The pills set a `videoFilter` state (`'all' | 'nonMusic' | 'music' |
   'tvShows'`); `applyVideoFilter` narrows the fetched pool before the free-user
   quota is applied, so free users see up to 5 hits *within* the chosen filter.
3. The same filter is applied when auto-skipping failed embeds so the index
   math stays consistent.

### Components
- `apps/web/src/components/video/subs-search-results.tsx` — `FILTER_PILLS`
  constant, `videoFilter` state, `applyVideoFilter`, `filterPills` JSX rendered
  in the nav bar (loading / empty / main states).

### API Endpoints
- No new endpoints. Filtering is client-side because the server has no
  "category NOT IN" expression (Non-Music cannot be expressed server-side).

### States
- **Loading**: pills render as real, clickable buttons; the forms toggle shows
  its skeleton.
- **Empty**: pills stay visible so the user can switch filters (e.g. a word with
  no TV-show hits may have music hits).
- **Error**: unchanged (error text only).
- **Edge cases**: switching a pill resets `currentIndex` to 0 since the list may
  shrink; the exact-match cached-path rows carry `category`/`tv_show` because
  they come from the same fetch mapping.

## Dependencies
- `packages/shared/src/types.ts` — `SubsSearchVideo` gained `category?` /
  `tv_show?` (`number | null`).
- `translations.csv` — new keys `filter.music` ("Music") and `filter.non_music`
  ("Non-Music"); reuses `filter.all` and `title.tv_shows`.

## Open Questions
- None.
