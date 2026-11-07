# Feature Specification: Subs Search Content Filter Pills

## Metadata
- **Spec ID**: SPEC-079
- **Feature**: Subs search content filter pills (All / TV Shows / Entertainment / Other)
- **Status**: complete
- **Created**: 2026-02-11
- **Amended**: 2026-11-08 — relabeled and reordered the pills (see
  [Amendment](#amendment--2026-11-08))
- **ROADMAP Phase**: Media — Subtitle Search

## Overview
The subs-search results component (`SubsSearchResults`) shows a nav bar above the
result list. Next to the existing exact-match forms toggle ("This form / All
forms"), we render a group of content-filter pills: **All**, **TV Shows**,
**Entertainment**, and **Other**. They filter the fetched results client-side by
the video's YouTube `category` and `tv_show` membership, so a learner can e.g.
restrict examples to TV-show dialogue, to entertainment videos (music and
entertainment categories), or to everything outside those categories.

## User Stories
- As a learner, I want to see only TV-show examples so I can study a familiar
  series' dialogue.
- As a learner, I want to see only entertainment examples (music videos and
  entertainment-category videos) when I'm focused on lyrics or performance.
- As a learner, I want to see only other videos (news, education, vlogs, …) so
  example sentences come from ordinary speech rather than performances.

## How It Works in Classic (Nuxt)
Classic's subs search (`zerotohero-nuxt/components/SearchSubsComp.vue`) reads a
`categoryFilter` from `$l2Settings`, and elsewhere treats `category == 10` /
`tv_show` as music markers (`components/VideoDetails.vue`). Classic's browse page
excludes music with `filter[category][nin]=10`. There is no exact pill-group UI in
Classic; this spec adds it directly to the Next.js subs search results.

## How It Works in GO (React Native)
The mobile `SubsSearchResults`
(`apps/mobile/components/video/SubsSearchResults.tsx`) ports the same pills and
filter (SPEC-082 Task 6), so both clients show the same four labels in the same
order.

## Implementation Plan (Next.js)

### Route
No route changes — `SubsSearchResults` is embedded in the dictionary entry tabs
(`apps/web/src/components/dictionary-entry-tabs.tsx`).

### Data Flow
1. `/subs-search` already returns `category` and `tv_show` columns per row
   (the Postgres query in `utils_content.py`; the MySQL
   `app_subs_search.py` it replaced was deleted on 2026-10-16). The client previously
   dropped them; now the fetch maps them onto `SubsSearchVideo` via `Number()`.
2. The pills set a `videoFilter` state (`'all' | 'tvShows' | 'entertainment' |
   'other'`). **Entertainment** matches `category === 10 || 24` (YouTube Music +
   Entertainment) and **Other** is its complement; TV Shows matches a non-falsy
   `tv_show`. `applyVideoFilter` narrows the fetched pool before the free-user
   quota is applied, so free users see up to 5 hits *within* the chosen filter.
3. The same filter is applied when auto-skipping failed embeds so the index
   math stays consistent.

### Components
- `apps/web/src/components/video/subs-search-results.tsx` — `FILTER_PILLS`
  constant, `videoFilter` state, `applyVideoFilter`, `filterPills` JSX rendered
  in the nav bar (loading / empty / main states).
- `apps/mobile/components/video/SubsSearchResults.tsx` — the same pills and
  filter for mobile (SPEC-082).

### API Endpoints
- No new endpoints. Filtering is client-side because the server has no
  "category NOT IN" expression (Other cannot be expressed server-side).

### States
- **Loading**: pills render as real, clickable buttons; the forms toggle shows
  its skeleton.
- **Empty**: pills stay visible so the user can switch filters (e.g. a word with
  no TV-show hits may have entertainment hits).
- **Error**: unchanged (error text only).
- **Edge cases**: switching a pill resets `currentIndex` to 0 since the list may
  shrink; the exact-match cached-path rows carry `category`/`tv_show` because
  they come from the same fetch mapping.

## Amendment — 2026-11-08
The pills were relabeled and reordered in both clients:

| Before | After |
|---|---|
| All, Non-Music, Music, TV Shows | All, TV Shows, Entertainment, Other |

- **Labels**: "Music" → **Entertainment** (`category.entertainment` in
  `translations.csv`) and "Non-Music" → **Other** (`label.other`). Both keys
  already existed in all 18 locales, so no new translation keys were added and
  the locale JSONs were not regenerated.
- **Order**: TV Shows now comes first after All; Entertainment and Other follow.
- **Behavior**: unchanged — Entertainment still matches `category === 10 || 24`
  and Other is its complement. This is a label-and-order change only; no
  filtering logic changed.
- **Internal keys**: the `VideoFilterKey` values were renamed from `music` /
  `nonMusic` to `entertainment` / `other` so the identifiers match the labels.
- `filter.music` and `filter.non_music` remain in `translations.csv` (unused by
  these pills) so other surfaces or future copy can still use them.

## Dependencies
- `packages/shared/src/types.ts` — `SubsSearchVideo` gained `category?` /
  `tv_show?` (`number | null`).
- `translations.csv` — reuses `filter.all` ("All"), `title.tv_shows`
  ("TV Shows"), `category.entertainment` ("Entertainment"), and `label.other`
  ("Other").

## Open Questions
- None.
