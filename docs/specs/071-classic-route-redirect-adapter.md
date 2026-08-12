# SPEC-071: Classic (Nuxt) Route Redirect Adapter for apps/web

## Metadata

- **Spec ID**: SPEC-071
- **Feature**: Redirect Classic-only routes from `apps/web` to `https://v2.languageplayer.io`
- **Status**: draft
- **Created**: 2026-08-12
- **ROADMAP Phase**: Phase 8 — Sunset Classic (redirect strategy from classic URLs)
- **See also**: [SPEC-069 — Web → Mobile Universal Links](069-web-mobile-universal-links.md) · [SPEC-002 — Monorepo Consolidation](archive/002-monorepo-consolidation.md) · [ROADMAP Phase 8](../../ROADMAP.md)

## 1. Overview

The Classic Nuxt app (`zerotohero-nuxt/`) is the source of truth for features
that the Next.js app (`apps/web/`) has not ported yet. Old links, bookmarks,
search-engine entries, and shared URLs still point at Classic paths. Today,
when one of those paths hits `apps/web`, the user sees a web 404 even though
the feature still exists on the Classic deployment (`v2.languageplayer.io`).

This spec audits every Classic route, compares it against the web route tree,
and defines an adapter that:

1. lets requests through when the web app has the same route,
2. internally redirects known renamed routes to their web equivalent,
3. redirects Classic-only routes to `https://v2.languageplayer.io` with the
   path and query string preserved.

The audit is read-only. Nothing in `zerotohero-nuxt/` is edited.

## 2. Goals / Non-Goals

### Goals

- Preserve access to every route that Classic can serve but `apps/web` cannot.
- Never send a web-supported URL to v2.
- Keep the redirect rules explicit, testable, and easy to update as `apps/web`
  ports more features.
- Add a minimal web `/logout` page so Classic's logout URL actually clears the
  NextAuth session before landing on `/login`.

### Non-Goals

- Porting Classic features into `apps/web` (covered by other specs).
- Changing Classic itself, including its redirects.
- Serving v2 content through the web domain (the redirect is a hop, not a proxy).
- Redirecting arbitrary unknown paths (typos stay on the web 404 page).

## 3. Audit Method

The route inventory was produced from:

- `find zerotohero-nuxt/pages -type f` — Nuxt 2 file-based routes
- `zerotohero-nuxt/nuxt.config.js` → `router.extendRoutes` — custom/alias routes
  with optional parameters
- `zerotohero-nuxt/middleware/redirectPaths.js` — legacy path rewrites
- `find apps/web/src/app -type f` — Next.js App Router pages (`page.tsx` only)

Nuxt dynamic segments (`_slug.vue`) are written as `:slug` below. Optional
segments from `extendRoutes` are written as `:param?`. Web dynamic segments
(`[videoId]`) are written as `:videoId`.

Classification:

| Class | Meaning | Adapter behavior |
|---|---|---|
| **Equivalent** | Same path shape exists in `apps/web` | No redirect |
| **Renamed** | Feature exists in web under a different path | Internal 308 redirect to the web route |
| **Classic-only** | No web equivalent | 307 redirect to `https://v2.languageplayer.io` + original path + query |

## 4. Route Audit

### 4.1 Root-level routes

| Classic route | Web route | Class |
|---|---|---|
| `/` | `/` | Equivalent |
| `/login` | `/login` | Equivalent |
| `/register` | `/register` | Equivalent |
| `/forgot-password` | `/forgot-password` | Equivalent |
| `/password-reset` | `/password-reset` | Equivalent |
| `/go-pro-error` | `/go-pro-error` | Equivalent |
| `/go-pro-success` | `/go-pro-success` | Equivalent |
| `/go-pro` | `/{l1}/{l2}/go-pro` | Renamed (pair-scoped) |
| `/verify-email` | `/register?verifyEmail=:email` (fallback `/register`) | Renamed |
| `/logout` | `/logout` (new page) | Equivalent (new) |
| `/dashboard` | `/language-select` | Renamed |
| `/delete-account` | `/{l1}/{l2}/profile` | Renamed (pair-scoped) |
| `/privacy-policy` | `/{l1}/{l2}/docs/privacy-policy` | Renamed (pair-scoped) |
| `/languages` | — | Classic-only |
| `/language-map` | — | Classic-only |
| `/language-icons` | — | Classic-only |
| `/compare-languages` (+ `:bookId?` `:en?` `:wiktionary?`) | — | Classic-only |
| `/discover-shows` (+ `:l1?` `:l2?` `:type?`) | — | Classic-only |
| `/popular` | — | Classic-only |
| `/stats` | — | Classic-only |
| `/articles` | — | Classic-only |
| `/translators` | — | Classic-only |
| `/phonological-features` | — | Classic-only |
| `/all-routes` | — | Classic-only (debug page) |
| `/admin/*` (17 pages) | — | Classic-only |
| `/:slug` content pages (19 slugs) | — | Classic-only |
| `/en/zh/textbooks-workbooks` | — | Special² |

¹ Pair-scoped routes use the last-used `l1`/`l2` cookies (already set by
`apps/web/src/proxy.ts`), falling back to `en/zh` when the cookies are absent
or invalid.

² Classic hard-redirects to `https://www.chinesezerotohero.com/textbooks-workbooks/`.
If the adapter matches it, the request should go to v2, which performs the
external redirect (no special web handling needed).

Classic content slugs (from `zerotohero-nuxt/content/*.md`):

`authentic-language-learning`, `business-language-videos`,
`choosing-authentic-video-content`, `comprehensible-input-in-practice`,
`conversational-fluency-videos`, `culture-insights-through-videos`,
`evolution-of-interactive-learning`, `impact-of-authentic-content`,
`interactive-language-practice`, `interactive-learning-videos`,
`interactive-video-case-studies`, `interactive-video-techniques`,
`krashens-comprehensible-approach`, `krashens-theory-in-action`,
`language-acquisition-research`, `native-speaker-insights`,
`role-of-context-in-language`, `role-of-interactive-video`,
`travel-language-interactive`

### 4.2 `/{l1}/{l2}` routes — Equivalent

These exact path shapes exist in both apps and must never redirect:

| Classic route | Web route |
|---|---|
| `/{l1}/{l2}` | `/{l1}/{l2}` |
| `/{l1}/{l2}/dictionary` | `/{l1}/{l2}/dictionary` |
| `/{l1}/{l2}/dictionary/word/:word` | `/{l1}/{l2}/dictionary/word/:word` |
| `/{l1}/{l2}/dictionary/entry/:dictionaryId/:entryId` | `/{l1}/{l2}/dictionary/entry/:dictionaryId/:entryId` |
| `/{l1}/{l2}/epub` | `/{l1}/{l2}/epub` |
| `/{l1}/{l2}/live-tv` | `/{l1}/{l2}/live-tv` |
| `/{l1}/{l2}/music` | `/{l1}/{l2}/music` |
| `/{l1}/{l2}/profile` | `/{l1}/{l2}/profile` |
| `/{l1}/{l2}/reader` | `/{l1}/{l2}/reader` |
| `/{l1}/{l2}/saved-words` | `/{l1}/{l2}/saved-words` |
| `/{l1}/{l2}/settings` | `/{l1}/{l2}/settings` |
| `/{l1}/{l2}/tv-shows` | `/{l1}/{l2}/tv-shows` |
| `/{l1}/{l2}/web-reader` | `/{l1}/{l2}/web-reader` |

### 4.3 `/{l1}/{l2}` routes — Renamed (internal redirect)

| Classic route | Web route | Mapping |
|---|---|---|
| `/{l1}/{l2}/explore-media` | `/{l1}/{l2}/explore` | Same path minus `-media` |
| `/{l1}/{l2}/my-playlists` | `/{l1}/{l2}/playlists` | `my-` prefix dropped |
| `/{l1}/{l2}/playlist/:id` | `/{l1}/{l2}/playlists/:id` | `playlist` → `playlists` |
| `/{l1}/{l2}/saved-words-games` | `/{l1}/{l2}/review` | Feature renamed |
| `/{l1}/{l2}/youtube/likes` | `/{l1}/{l2}/liked-videos` | Feature renamed |
| `/{l1}/{l2}/youtube/history` | `/{l1}/{l2}/watch-history` | Feature renamed |
| `/{l1}/{l2}/youtube/channels` | `/{l1}/{l2}/channels` | Channel directory (SPEC-072) |
| `/{l1}/{l2}/youtube/subscriptions` | `/{l1}/{l2}/my-channels` | Subscribed-content feed (SPEC-072) |
| `/{l1}/{l2}/youtube/search/:term?` | `/{l1}/{l2}/search?q=:term` | Term → `q`; `:start?` dropped |
| `/{l1}/{l2}/youtube/import` | `/{l1}/{l2}/search` | |
| `/{l1}/{l2}/my-text` | `/{l1}/{l2}/reader` | Notes reader |
| `/{l1}/{l2}/recommended-video` | `/{l1}/{l2}/explore` | Classic redirects to the first recommendation; explore is the safe web landing |
| `/{l1}/{l2}/saved-phrases` (+ `:initId?`) | `/{l1}/{l2}/saved-words` | `:initId?` dropped |
| `/{l1}/{l2}/dictionary/:dictionaryId/:entryId` | `/{l1}/{l2}/dictionary/entry/:dictionaryId/:entryId` | Classic entry deep link (e.g. `/dictionary/edict/92130`) |
| `/{l1}/{l2}/dictionary/:dictionaryId/random` | `/{l1}/{l2}/dictionary` | Random entry → dictionary landing |
| `/{l1}/{l2}/dictionary/hsk/:hskId` | — | Classic-only → v2 (no web HSK-id lookup) |
| `/{l1}/{l2}/reader/shared/:id` | `/{l1}/{l2}/reader?noteId=:id` | Same saved-text data via `/user-notes` |
| `/{l1}/{l2}/reader/:method/:arg` | `/{l1}/{l2}/reader?method=:method&arg=:arg` | Only for `md`, `html`, `txt`, `md-url`, `html-url` |
| `/{l1}/{l2}/youtube/channel/:channelId?/:title?` | `/{l1}/{l2}/channel/:channelId` | `youtube/` prefix dropped; title dropped |
| `/{l1}/{l2}/video-view/:type/:videoId?/:dbId?/:lesson?` | `/{l1}/{l2}/watch/:videoId` | Path `:videoId` **or** query `?v=`; `p=recommended` → `?queueType=recommended`; drops `v`/`id`/`p`/`sort`/`lesson` |
| `/{l1}/{l2}/video-view/bring-your-own` | `/{l1}/{l2}/local-media` | Custom-media upload equivalent |
| `/{l1}/{l2}/show/:type/:id` | `/{l1}/{l2}/tv-shows/:id` | Type dropped, id preserved |

`:start?` is intentionally dropped; the web search page reads `q` via
`useSearchParams` and manages pagination internally. `video-view` URLs without
a path or query video id (except `bring-your-own`) remain Classic-only.

### 4.4 `/{l1}/{l2}` routes — Classic-only

These have no web equivalent and should redirect to v2:

Chinese-specific routes (`chinese/*`, `pinyin-list`, `dictionary/hsk/*`,
`separable/*`, `lesson-videos/*`, `explore/new-levels-graphic`) normalize the
L2 segment to `zh` before redirecting — e.g. `/en/ja/chinese/pinyin-chart` →
`https://v2.languageplayer.io/en/zh/chinese/pinyin-chart`.
`new-levels-graphic` canonicalizes to `/explore/new-levels-graphic` for both
its `/chinese/` and `/explore/` variants.

| Classic route | Notes |
|---|---|
| `/about`, `/analytics` | |
| `/articles/reddit` (+ `:method?` `:args?`) | |
| `/articles/wiki` (+ `:method?` `:args?`) | |
| `/audiobooks` (+ `:category?` `:tag?` `:level?`) | |
| `/book`, `/book/chapter`, `/book/list` | Guided reader (web has EPUB/reader, not the Classic book library) |
| `/books`, `/bookshelf`, `/library` | |
| `/categories`, `/category/:slug` | |
| `/chinese/characters` | |
| `/chinese/explore-related` | |
| `/chinese/explore-roots/:arg` | |
| `/chinese/explore-topics` | |
| `/chinese/idioms` | |
| `/chinese/lesson-videos` | |
| `/chinese/lookup-by-tones` | |
| `/chinese/new-levels`, `/chinese/new-levels-graphic` | |
| `/chinese/pinyin-chart`, `/chinese/pinyin-squared` | |
| `/chinese/radicals`, `/chinese/separable` | |
| `/community` | |
| `/compare/:method/:args` | |
| `/confirm-deletion` | Web delete flow lives in profile |
| `/contact-us` | Gap — see §8 |
| `/faq` | |
| `/discussions`, `/feed` | |
| `/grammar`, `/grammar/view/:id` | |
| `/gutenberg` (+ `:id?` `:page?` `:title?`) | |
| `/hindi/bookmarklet` | |
| `/klingon/keyboard` | |
| `/language-info` | |
| `/learn` (+ `:method?` `:argsProp?` `:index?`) | |
| `/learning-path`, `/levels` | |
| `/minimal-pairs` | |
| `/dictionary/hsk/:hskId` | |
| `/reader/:method/:arg` | Only for methods web does not support (`share`, etc.) |
| `/page/:id` (+ `:title?`) | |
| `/phrase/compare/:term/:compareTerm` | |
| `/phrase/search/:term` (+ `:dict?`) | |
| `/phrasebook/:bookId`, `/phrasebook/:bookId/:phraseId` | |
| `/phrasebooks` | |
| `/pinyin-list` | |
| `/resource/list` (+ `:topic?` `:type?`) | |
| `/set-content-preferences` | |
| `/set-language-level` | |
| `/talks` (+ `:category?` `:tag?` `:level?`) | |
| `/transcription` | |
| `/tutoring` (+ `:level?`), `/tutoring/lesson/:id` | |
| `/updates` | |
| `/youtube/browse/:category/:level/:locale/:start` | |
| `/youtube/playlist` (+ `:playlistId?` `:title?`) | Distinct from web user playlists |

### 4.5 Classic custom/legacy aliases

`extendRoutes` adds these paths; all are Classic-only:

- `/{l1}/{l2}/lesson-videos/:level?/:lesson?`
- `/{l1}/{l2}/explore/new-levels-graphic`
- `/{l1}/{l2}/separable/:method?/:args?`
- `/{l1}/{l2}/admin/assign-lesson-videos/:level?/:lesson?`

The `explore/new-levels-graphic` case is important: the web route
`/{l1}/{l2}/explore` exists, but `/{l1}/{l2}/explore/*` does not, so the
classic-only pattern must be more specific than the web pattern.

### 4.6 Admin routes

All `zerotohero-nuxt/pages/admin/*.vue` routes are Classic-only:

`assign-lesson-videos`, `break-lines`, `check-cors`, `corpora-csv`, `db-audit`,
`json-to-csv`, `manage-subscriptions`, `ngram`, `phrase-survey-merge`,
`phrase-survey`, `phrasebook-creator`, `phrasebook-survey`,
`quality-assurance`, `renumber-notes`, `studysheet`, `test`,
`wiktionary-csv`

### 4.7 Classic middleware rewrites

Classic's `redirectPaths.js` normalizes a few legacy paths before routing:

- `/youtube/view/...` → `/video-view/youtube/...`
- `/zh/en/online-courses` → `https://m.cctalk.com/inst/stevmab3`
- `/en/zh/online-courses` → `https://chinesezerotohero.teachable.com/`

These are not page routes. When hit on the web domain, they should be treated
as Classic-only and redirected to v2, which performs the existing rewrite
(one extra hop, but no behavior is lost).

## 5. Adapter Design

### 5.1 Files

- `apps/web/src/lib/classic-route-redirect.ts` — pure matcher/config module
- `apps/web/src/proxy.ts` — extend the existing Next.js proxy to call the matcher
- `apps/web/src/app/logout/page.tsx` — new sign-out page
- `apps/web/src/lib/classic-route-redirect.test.ts` — Vitest tests

### 5.2 Matcher module

The module exports three ordered rule sets and one pure function
`classicRouteAction(pathname, pair)`:

1. `WEB_ROUTE_PATTERNS: RegExp[]`
   Every web page shape from §4.2 plus all web-only pages
   (`explore`, `search`, `watch/:videoId`, `channel/:channelId`,
   `tv-shows/:id`, `playlists/:playlistId`, `settings/*`, `docs/[...slug]`,
   `tokenizer`, `local-media`, `review`, `watch-history`, `liked-videos`,
   `go-pro`, auth routes, landing, etc.). If a path matches one of these,
   return `{ kind: 'pass' }`.

2. `LEGACY_ALIASES`
   The §4.3 table compiled into a tiny path-pattern matcher supporting
   `:param` and `:param?`. A match returns
   `{ kind: 'alias', path, dropSearchParams }` with the web-route path, query
   additions (such as `q=:term` or `queueType=recommended`), and the list of
   original query params to drop (`v`, `id`, `p`, `sort`, `lesson`, `email`,
   `code`).

3. `CLASSIC_ONLY_PATTERNS: RegExp[]`
   All §4.1 (excluding equivalents), §4.4, §4.5, and §4.6 patterns. A match
   returns `{ kind: 'v2' }`.

`classicRouteAction(pathname, pair, search)` receives the original query
string so query-driven aliases (`?v=`, `?email=`, `?p=`) can map it. `pair` is
`{ l1, l2 }` read from the `l1`/`l2` cookies already managed by `proxy.ts`.
Callers pass `{ l1: 'en', l2: 'zh' }` when the cookies are absent or invalid.

No new dependencies: a ~30-line converter turns `:param` / `:param?`
pattern strings into regular expressions.

### 5.3 Proxy integration

`apps/web/src/proxy.ts` already exists (Next.js 16 proxy) and handles static
assets, auth, locale cookies, and guest gating. The adapter is called from it:

1. Skip non-page requests: `/api/*`, `/_next/*`, `/og`, requests with a file
   extension, and non-GET/HEAD methods — as today.
2. For remaining requests, resolve `pair` from the `l1`/`l2` cookies
   (fallback `en/zh`) and run
   `classicRouteAction(pathname, pair, req.nextUrl.searchParams)`:
   - `pass` → continue the existing proxy flow unchanged.
   - `alias` → 308 redirect to the mapped web path (pair-scoped aliases use
     the resolved pair; original query params in `dropSearchParams` are not
     copied onto the target).
   - `v2` → 307 redirect to
     `https://v2.languageplayer.io{pathname}{search}`. Chinese-related paths
     use `v2RedirectPath()` first, which rewrites the L2 segment to `zh`.
   - No match → continue to the existing web 404 behavior.
3. `/{l1}/{l2}/...` patterns only match when both segments are in
   `SUPPORTED_L1S` / `SUPPORTED_L2S`; invalid pairs keep the current
   `/_not-found` rewrite.

The v2 origin is configurable:

```ts
const V2_ORIGIN = process.env.NEXT_PUBLIC_LEGACY_V2_ORIGIN ?? 'https://v2.languageplayer.io';
```

### 5.4 Status codes

- **308 (Permanent)** for internal renamed-route aliases — the web route is the
  replacement, and browsers may cache it.
- **307 (Temporary)** for v2 fallback — the route may be ported to web later,
  and 307 avoids stale cached redirects when that happens. Flip to 308 when the
  route inventory stabilizes.
- The new `/logout` page is a real route, not a redirect: it calls NextAuth
  `signOut({ callbackUrl: '/login' })` so the session is actually cleared.

### 5.5 Query strings

External v2 redirects append the original `search` unchanged. Internal aliases
start from the existing search and add alias-specific params (`q`,
`queueType`, `verifyEmail`, `noteId`, `method`, `arg`). Params with no web
equivalent are dropped per alias: `:start?`/`:initId?` path params, and
`v`/`id`/`p`/`sort`/`lesson`/`email`/`code` query params where consumed.

`video-view` query URLs map `p=recommended` (and `p=recommended_music`) to
`?queueType=recommended`; numeric/comma playlist ids are dropped because web's
`QueueType` has no playlist variant yet.

### 5.6 Renamed routes: internal redirects (decision)

Known renames are redirected internally (308) instead of sent to v2 because
the web app already owns those features:

- Sending `/en/ja/youtube/likes` to v2 would bounce a user to a different
  domain for something web already implements as `/liked-videos`.
- Internal redirects keep the user on the web domain, preserve the language
  pair, and are trivially reversible — when a feature is fully migrated the
  alias row is simply deleted.
- v2 fallback remains the behavior for features web does not own yet, which is
  the honest distinction this adapter is trying to draw.

The alternative (send every non-exact route to v2) was rejected because it
makes the web app appear incomplete for features it already has.

## 6. Implementation Plan

1. Add `apps/web/src/lib/classic-route-redirect.ts` with the pattern sets from
   this spec and the pair-aware `classicRouteAction()`.
2. Extend `apps/web/src/proxy.ts` to call the matcher after the static/API skip
   and before app-pair handling, using the `l1`/`l2` cookies with an `en/zh`
   fallback.
3. Add `apps/web/src/app/logout/page.tsx` that calls `clearUserData()` (matching
   Classic's `wipeLocalUserData`) then `signOut({ callbackUrl: '/login' })`.
4. Add Vitest coverage for:
   - every Equivalent route → pass
   - every Renamed route → correct web path
   - every Classic-only route family → v2 with path/query preserved
   - unknown routes → pass (web 404)
5. Verify:
   - `cd apps/web && ./node_modules/.bin/tsc --noEmit`
   - `npm run build:check -w apps/web` (isolated build check; never `next build`)
   - dev-server smoke test with `curl -I` for one route in each class
6. Deploy to Netlify and smoke-test the live domain.

## 7. Maintenance

- The matcher module is the single source of truth for route parity.
- When a Classic-only feature is ported to web, remove its pattern from
  `CLASSIC_ONLY_PATTERNS` and add the new web route to `WEB_ROUTE_PATTERNS` in
  the same PR.
- When Classic adds a route, add its pattern to the audit and matcher.
- Periodically re-run the audit commands from §3 and compare against the
  pattern sets; a failing test should accompany any drift.

## 8. Feature Gaps for Future Work

### 8.1 Channels list + subscription management

**Resolved by SPEC-072.** The channel directory and subscribed-content feed
are implemented on web and mobile:

- Channel directory: `/{l1}/{l2}/channels` (web) /
  `(tabs)/(media)/channels` (mobile)
- Subscribed-content feed: `/{l1}/{l2}/my-channels` (web) /
  `(tabs)/(media)/my-channels` (mobile)
- Per-channel subscribe / not-interested via `useChannelPreference` →
  `/channel-preferences`

Classic's `/youtube/channels` and `/youtube/subscriptions` now internally
redirect (308) to the new pages instead of going to v2 (§4.3).

### 8.2 Watch queue URL hydration (deferred)

`p=recommended` maps to `?queueType=recommended`, but apps/web only *writes*
that param — the watch page never reads it, and `QueueManager` is in-memory
only. A cold link like
`/en/ja/watch/-EVFAa8Efh4?queueType=recommended` plays the video without a
prev/next queue. To fully preserve Classic's `p=` behavior, the watch page
needs to hydrate the queue from `?queueType=` (fetching `/api/videos/recommend`
for `recommended`) on load. **Status: deferred** — the redirect already emits
the correct param; hydration will be handled in a separate change.

Related small gap: search results currently start queues with
`queueType='recommended'` instead of `'search'`, and playlist playback uses
`'recommended'` because `QueueType` has no playlist variant.

### 8.3 Playlist & note sharing (future)

User playlists (`user_playlists`) and notes (`user_notes`) are currently
private and user-scoped: every `/playlists` and `/user-notes` endpoint requires
auth and filters by `user_id`, and neither table has a public flag or share
token. Classic still has vestigial share UI for notes (a "Share Annotated
Text" button that calls a missing `upload` method), but the backend has no
public read path, and web's reader only loads notes for the signed-in owner.

Future work will implement **better playlist and note sharing with explicit
user control**:

- Per-item `is_public` / private toggle owned by the creator
- A share token + unauthenticated read-only endpoints for shared items
- Public read-only views and copy-link share buttons on web and mobile
- Private items remain inaccessible without authentication

Track as its own spec (e.g. SPEC-073) when scheduled.

### 8.4 Support / contact page

Classic `/contact-us` is a static page with:

- Discord server invite (`https://discord.gg/D7vKcuKXuA`)
- Email `jon.long@zerotohero.ca`
- Twitter `@language_player`

Recommended home in the web app:

1. New route `apps/web/src/app/[l1]/[l2]/contact-us/page.tsx` with the same
   links — no backend needed.
2. A docs entry `packages/docs/content/general/contact.md` so it appears in
   the docs sidebar and benefits from the i18n pipeline.
3. A footer link to the contact page so it is discoverable site-wide.

Until built, `/contact-us` redirects to v2.

## 9. Open Questions

- **Contact page**: is the placement recommended in §8.2 acceptable?
- **`/faq`**: should it get a docs equivalent alongside the contact page, or
  stay a v2 redirect for now?

## 10. Dependencies

- `apps/web` (Next.js proxy, Vitest, NextAuth `signOut`, `user-data-wipe`)
- Live `v2.languageplayer.io` deployment with a valid certificate
- No changes to `zerotohero-nuxt/`, `netlify.toml`, or shared packages

## 11. Redirect Test Matrix (manual click-through)

The Vitest suite covers the same cases programmatically
(`apps/web/src/lib/classic-route-redirect.test.ts`). This section is the
human-facing checklist: after deploying to Netlify, click each link below and
confirm the expected behavior in the browser address bar.

Base URL: `https://language-player.netlify.app`

Automated check (no browser — plain HTTP status/Location assertions):

```bash
npm run test:redirects                                   # live Netlify app
REDIRECT_TEST_BASE_URL=http://localhost:3000 npm run test:redirects  # local dev
```

The script (`scripts/check-redirects.mjs`) contains the same cases as the
tables below, exits non-zero on any failure, and is safe to run in CI.

Quick automated check for any row:

```bash
curl -sSI "https://language-player.netlify.app/en/ja/books" | head -8
```

### 11.1 Pass-through (web handles the route — no redirect)

| Link | Expected |
|---|---|
| [Explore](https://language-player.netlify.app/en/ja/explore) | Loads apps/web Explore (200) |
| [Dictionary](https://language-player.netlify.app/en/ja/dictionary) | Loads apps/web Dictionary (200) |
| [Watch a video](https://language-player.netlify.app/en/ja/watch/Qgzv_LBictg) | Loads apps/web watch page (200) |
| [Reader](https://language-player.netlify.app/en/ja/reader) | Loads apps/web notes reader (200) |
| [My Channels](https://language-player.netlify.app/en/ja/my-channels) | Loads apps/web My Channels (200) |

### 11.2 Internal redirects (308 → stays on web)

| Link | Expected destination |
|---|---|
| [Explore Media](https://language-player.netlify.app/en/ja/explore-media) | `/en/ja/explore` |
| [My Playlists](https://language-player.netlify.app/en/ja/my-playlists) | `/en/ja/playlists` |
| [Playlist detail](https://language-player.netlify.app/en/ja/playlist/42) | `/en/ja/playlists/42` |
| [Saved Words Games](https://language-player.netlify.app/en/ja/saved-words-games) | `/en/ja/review` |
| [YouTube Likes](https://language-player.netlify.app/en/ja/youtube/likes) | `/en/ja/liked-videos` |
| [YouTube History](https://language-player.netlify.app/en/ja/youtube/history) | `/en/ja/watch-history` |
| [Channel directory](https://language-player.netlify.app/en/ja/youtube/channels) | `/en/ja/channels` |
| [Subscribed channels](https://language-player.netlify.app/en/ja/youtube/subscriptions) | `/en/ja/my-channels` |
| [YouTube Import](https://language-player.netlify.app/en/ja/youtube/import) | `/en/ja/search` |
| [My Text](https://language-player.netlify.app/en/ja/my-text) | `/en/ja/reader` |
| [Recommended Video](https://language-player.netlify.app/en/ja/recommended-video) | `/en/ja/explore` |
| [Saved Phrases](https://language-player.netlify.app/en/ja/saved-phrases) | `/en/ja/saved-words` |
| [Channel](https://language-player.netlify.app/en/ja/youtube/channel/UC123) | `/en/ja/channel/UC123` |
| [Video view (path id)](https://language-player.netlify.app/en/ja/video-view/youtube/abc123) | `/en/ja/watch/abc123` |
| [Video view (`?v=`)](https://language-player.netlify.app/en/ja/video-view/youtube?v=Qgzv_LBictg&p=recommended) | `/en/ja/watch/Qgzv_LBictg?queueType=recommended` |
| [Bring your own](https://language-player.netlify.app/en/ja/video-view/bring-your-own) | `/en/ja/local-media` |
| [Dictionary deep link](https://language-player.netlify.app/en/ja/dictionary/edict/92130) | `/en/ja/dictionary/entry/edict/92130` |
| [Reader shared](https://language-player.netlify.app/en/ja/reader/shared/42) | `/en/ja/reader?noteId=42` |
| [Dashboard](https://language-player.netlify.app/dashboard) | `/language-select` |
| [Verify email](https://language-player.netlify.app/verify-email?email=a%40b.com) | `/register?verifyEmail=a%40b.com` |
| [Delete account](https://language-player.netlify.app/delete-account) | `/{last-pair}/profile` (fallback `/en/zh/profile`) |

### 11.3 Classic-only (307 → v2)

| Link | Expected destination |
|---|---|
| [Books](https://language-player.netlify.app/en/ja/books) | `https://v2.languageplayer.io/en/ja/books` |
| [Pinyin Chart](https://language-player.netlify.app/en/ja/chinese/pinyin-chart) | `https://v2.languageplayer.io/en/zh/chinese/pinyin-chart` |
| [Characters](https://language-player.netlify.app/en/ja/chinese/characters) | `https://v2.languageplayer.io/en/zh/chinese/characters` |
| [Explore Related](https://language-player.netlify.app/en/ja/chinese/explore-related) | `https://v2.languageplayer.io/en/zh/chinese/explore-related` |
| [Explore Roots](https://language-player.netlify.app/en/ja/chinese/explore-roots/123) | `https://v2.languageplayer.io/en/zh/chinese/explore-roots/123` |
| [Explore Topics](https://language-player.netlify.app/en/ja/chinese/explore-topics) | `https://v2.languageplayer.io/en/zh/chinese/explore-topics` |
| [Idioms](https://language-player.netlify.app/en/ja/chinese/idioms) | `https://v2.languageplayer.io/en/zh/chinese/idioms` |
| [Chinese Lesson Videos](https://language-player.netlify.app/en/ja/chinese/lesson-videos) | `https://v2.languageplayer.io/en/zh/chinese/lesson-videos` |
| [Lookup By Tones](https://language-player.netlify.app/en/ja/chinese/lookup-by-tones) | `https://v2.languageplayer.io/en/zh/chinese/lookup-by-tones` |
| [New Levels](https://language-player.netlify.app/en/ja/chinese/new-levels) | `https://v2.languageplayer.io/en/zh/chinese/new-levels` |
| [Chinese New Levels Graphic](https://language-player.netlify.app/en/ja/chinese/new-levels-graphic) | `https://v2.languageplayer.io/en/zh/explore/new-levels-graphic` |
| [Pinyin Squared](https://language-player.netlify.app/en/ja/chinese/pinyin-squared) | `https://v2.languageplayer.io/en/zh/chinese/pinyin-squared` |
| [Radicals](https://language-player.netlify.app/en/ja/chinese/radicals) | `https://v2.languageplayer.io/en/zh/chinese/radicals` |
| [Chinese Separable](https://language-player.netlify.app/en/ja/chinese/separable) | `https://v2.languageplayer.io/en/zh/chinese/separable` |
| [Pinyin List](https://language-player.netlify.app/en/ja/pinyin-list) | `https://v2.languageplayer.io/en/zh/pinyin-list` |
| [Lesson Videos](https://language-player.netlify.app/en/ja/lesson-videos) | `https://v2.languageplayer.io/en/zh/lesson-videos` |
| [Lesson Videos with level](https://language-player.netlify.app/en/ja/lesson-videos/1/2) | `https://v2.languageplayer.io/en/zh/lesson-videos/1/2` |
| [Separable](https://language-player.netlify.app/en/ja/separable/foo) | `https://v2.languageplayer.io/en/zh/separable/foo` |
| [New Levels Graphic](https://language-player.netlify.app/en/ja/explore/new-levels-graphic) | `https://v2.languageplayer.io/en/zh/explore/new-levels-graphic` |
| [Contact](https://language-player.netlify.app/en/ja/contact-us) | `https://v2.languageplayer.io/en/ja/contact-us` |
| [Languages](https://language-player.netlify.app/languages) | `https://v2.languageplayer.io/languages` |
| [HSK lookup](https://language-player.netlify.app/en/ja/dictionary/hsk/123) | `https://v2.languageplayer.io/en/zh/dictionary/hsk/123` |
| [Admin QA](https://language-player.netlify.app/admin/quality-assurance) | `https://v2.languageplayer.io/admin/quality-assurance` |

### 11.4 No redirect (web 404 / unchanged)

| Link | Expected |
|---|---|
| [Unknown route](https://language-player.netlify.app/en/ja/definitely-not-a-route) | apps/web 404, no redirect |
| [Invalid pair](https://language-player.netlify.app/xx/yy/books) | apps/web 404, no redirect (v2 is not sent invalid pairs) |

After the click-through, record any failures as a follow-up issue; a failing
row usually means the deployed bundle predates the matcher change or the route
pattern in `apps/web/src/lib/classic-route-redirect.ts` needs updating.
