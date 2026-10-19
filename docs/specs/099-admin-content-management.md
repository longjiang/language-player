# SPEC-099: Admin Console — Content Management (videos / channels / TV shows / talks by L2)

## Metadata

- **Spec ID**: SPEC-099
- **Feature**: The `apps/admin` content-management surface: discover, import,
  and manage videos, channels, TV shows and talks per language (L2), plus a
  two-group navigation shell (Users / Content)
- **Status**: complete (2026-10-16)
- **Created**: 2026-10-16
- **Implemented**: 2026-10-16. `apps/admin` — `defc95bc` (shell + `/users`),
  `7ab9ee4e` (content API + types), `fd2fb6aa` (i18n keys), `02bf34e4`
  (videos), `a0ec0e5d` (import), `f0c9c909` (discover), `324f41d7` (shows),
  `e9a72137` (channels + sweep). `zerotohero-python-server` — `de20196`
  (`_show_dict`), `4af6f33` (`q` filter).
- **ROADMAP Phase**: Phase 10: Admin Console
- **See also**:
  - [ADR-0032 — Admin Console as a Separate Next.js App](<../adr/0032-admin-console-app.md>)
  - [SPEC-060 — Admin Console: User Management](060-admin-console-user-management.md) — the app, auth, token mirror, CORS and i18n conventions this spec follows
  - [SPEC-096 — Admin Video Ingestion](096-admin-video-ingestion.md) — the import pipeline this UI drives
  - [SPEC-098 — Video Discovery](098-video-discovery.md) — the discovery endpoint this UI drives
  - [SPEC-038 — Video Content Supabase](038-video-content-supabase.md) — the consolidated video-id contract
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md) § 5.8 — the `/admin/videos`, `/admin/tv-shows`, `/admin/talks` CRUD routes this UI uses
  - [ARCH-003 — Python Backend Architecture](../arch/003-python-backend-architecture.md) — blueprint/route map
  - [ARCH-032 — YouTube Video Difficulty](../arch/032-youtube-video-difficulty.md) / [ARCH-033 — Difficulty → Level Bucketing](../arch/033-difficulty-level-bucketing.md) — what `lex_div` / `word_freq` / `difficulty` mean
  - `zerotohero-nuxt/components/VideoAdmin.vue`, `components/ShowCard.vue`, `pages/_l1/_l2/show/_type/_id.vue`, `pages/admin/db-audit.vue` — the Classic features this replaces

## Overview

SPEC-096 and SPEC-098 shipped the *backend* for adding YouTube content —
seven admin-gated endpoints that fetch metadata, download the L2 transcript,
populate the lemmatization cache and score difficulty. SPEC-060 shipped the
admin app, but only its user-management half, so those endpoints are still
called by hand (curl) and the ROADMAP item *"Content moderation (videos /
shows / talks) in the admin console"* is still open. SPEC-039 § 5.8's
`/admin/videos` CRUD routes (used by Classic's `VideoAdmin`, db-audit and the
show/talk editors) have never had a new-stack caller at all.

This spec adds that surface to `apps/admin`:

- a **navigation shell** with two groups — *Users* and *Content* — so the
  existing user management and the new content management are both reachable,
- a **videos** manager (browse / filter by L2 / search / edit / create /
  delete / bulk-assign to a talk or show),
- an **import** screen (single id, batch, channel, playlist) that drives the
  SPEC-096 pipeline including its cursor paging,
- a **discovery** screen (SPEC-098) that reviews candidates before importing,
- a **shows & talks** manager (list by L2, create / edit / delete, member
  videos),
- a **channels** browser (list by L2, resolve a handle, import uploads — no
  channel write path exists, by decision),
- an **unavailable sweep** screen (report first, delete opt-in).

It also contains two small backend fixes (see § "Backend changes"), both in
`zerotohero-python-server` and committed there.

Everything is admin-gated server-side: the app's NextAuth credentials provider
still refuses non-admins at login, and every Flask route used here is on
`admin_bp` (blueprint-level `require_admin()`) or checks `is_admin` itself.
The one exception is deliberate: **listing** shows/talks/channels uses the
public `/tv-shows`, `/talks` and `/channels` endpoints, because no admin list
route exists. § "Why some routes are public" explains why that is acceptable
and what it costs.

## User Stories

- As an admin, I want one nav menu that reaches user management *and* content
  management, so I don't have to know URLs.
- As an admin, I want to pick an L2 and see that language's videos with
  filters and paging, so I can find a specific row without SQL.
- As an admin, I want to search videos by title, so I can find a row whose id
  I don't know.
- As an admin, I want to fix a video's metadata in place (title, level, show,
  tags, status, …), so a bad import is repairable through the UI.
- As an admin, I want to add one video, a batch of ids, a channel, or a
  playlist, and watch the per-video results stream in page by page, so I know
  what was added, skipped and why.
- As an admin, I want discovery to show me candidates before they are
  imported, so the fragile Google scrape can't silently fill the catalogue.
- As an admin, I want to be warned when the content I am importing declares a
  language other than the one I selected, so nothing lands in the wrong
  language by accident.
- As an admin, I want the language to start empty, so I can never import into
  English (or any other language) just because a form had a default.
- As an admin, I want to create, rename, hide, re-cover and delete a TV show
  or talk and see its member videos, so the catalogue keeps its shape.
- As an admin, I want to find videos YouTube no longer serves and delete them
  only after seeing the list.
- As an admin, I want a bulk assign/delete for videos, so cleaning up a
  channel import isn't hundreds of dialogs.

## How It Worked in Classic (Nuxt)

Classic's content admin is a client-side `$adminMode` toggle
(`components/QuickSettings/index.vue`, `store/settings.js`) that reveals
controls inside the public pages. There is **no route guard** — any visitor
can load `/admin/db-audit`; only the API calls fail. Feature by feature:

| Classic | Where | What it did | This spec |
|---|---|---|---|
| Video edit panel | `components/VideoAdmin.vue` (579 lines) | Upload L2/L1 `.srt`, "Add Video", assign/clear TV show + talk, Remove, Sync Subs (`POST /sync-srt`), edit notes, shift the first subtitle line, clear subs/translation | Metadata edit + delete on `/content/videos`; **subtitle text editing and SRT upload are out of scope** (see Open Questions) |
| Video list admin bar | `components/YouTubeVideoListAdminBar.vue` + `lib/mixins/youtubeVideoListAdminMixin.js` | Check Saved, Add All, Survey Channels, Remove All, assign show/talk to all, bulk SRT drop, sort/keyword filters | Bulk assign + bulk delete + title search on `/content/videos`; no SRT drop |
| Video card | `components/YouTubeVideoCard/index.vue` | Inline title edit, Remove, Assign show/talk, Remove already-saved | Edit dialog + row actions; no inline contenteditable |
| Show assignment | `components/AssignShow.vue`, `components/NewShow.vue`, `components/ShowBadge.vue` | Pick an existing show/talk from a `<select>` or create one from the video's title | `talk` / `tv_show` fields on the edit and import screens — the backend accepts **an id or a title** and creates the show from the first imported video |
| Show / talk cards | `components/ShowCard.vue` | Toggle `hidden`, toggle `audiobook`, delete | `/content/shows` row actions |
| Show / talk detail | `pages/_l1/_l2/show/_type/_id.vue` | Rename (contenteditable), edit cover `youtube_id`, delete, episode search/sort, episode count (`GET /videos/count`) | `/content/shows` edit dialog + member-video panel (`GET /tv-shows|/talks/<id>/episodes`) |
| DB audit | `pages/admin/db-audit.vue` | Paged `GET /admin/videos`, duplicate `youtube_id` / `subs_l2` detection, per-row delete, Remove All Dupes | The videos table (search/sort/paging/delete) and bulk delete; duplicate highlighting is a follow-up (Open Questions) |
| Text survey | `pages/admin/ngram.vue` | Select a show/talk/all and download subtitle text | Out of scope |
| Lesson assignment | `pages/admin/assign-lesson-videos.vue` | Match lesson vocabulary against `subs-search`, set `level`/`lesson` | Out of scope; `level`, `lesson` and `topic` are editable fields on the video edit dialog |
| Bulk crawl | `pages/_l1/_l2/youtube/search.vue` + `YouTubeSearchResults.vue` | Scrape Google video results, "Load N pages", Add All | `/content/discover` (the SPEC-098 port of the same scraper) |
| Channels | `pages/_l1/_l2/youtube/channels.vue`, `components/ChannelCard.vue` | Read-only channel cards from `GET /channels`; the channel page showed playlists behind `$adminMode` | `/content/channels` — list, resolve, import uploads, view channel videos |
| Subtitles / text tools | `break-lines.vue`, `renumber-notes.vue`, `json-to-csv.vue`, `corpora-csv.vue`, `wiktionary-csv.vue` | Offline text munging | Out of scope (no video-management coupling) |

Two Classic quirks are deliberately **not** ported:

1. `POST admin/videos` in Classic sent a CSV `subs_l2` built by `$subs.unparseSubs`
   and retried by halving the subtitle count. The admin console edits
   metadata; it does not author subtitles. `subs_l2` stays editable as raw
   text so a broken row can be repaired, but there is no SRT parsing.
2. `VideoAdmin.vue`'s `changeLevel` / `changeTopic` were dead code (no UI),
   so Classic had **no** level/topic editor. This spec adds both fields.

## Navigation & routing design

The app gets a two-group shell. `apps/admin/src/app/page.tsx` (the user search
dashboard) moves to `/users`; `/` becomes a redirect to `/users`.

```text
┌──────────────────────────────────────────────────────────────┐
│  🛡  Language Player — Admin              [Sign out]          │  ← AppHeader
├───────────────┬──────────────────────────────────────────────┤
│ USERS         │                                              │
│  User search  │  page content                                │
│ CONTENT       │                                              │
│  Videos       │                                              │
│  Import       │                                              │
│  Discover     │                                              │
│  Shows & Talks│                                              │
│  Channels     │                                              │
│  Unavailable  │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

| Route | Screen | Primary routes called |
|---|---|---|
| `/` | redirect → `/users` | — |
| `/users` | user search (moved from `/`) | `GET /admin/users/search` |
| `/users/[id]` | user detail (unchanged) | `GET /admin/users/<id>` + subscription/admin mutations |
| `/content/videos` | video manager: filter by L2, search by title, sort, page; edit / create / delete / bulk assign / bulk delete | `GET /admin/videos`, `POST /admin/videos`, `PATCH /admin/videos/<id>`, `DELETE /admin/videos/<id>` |
| `/content/import` | import: single · batch · channel · playlist, with cursor paging, a live result log and the language check | `POST /admin/videos/preflight`, `POST /admin/videos/add`, `/admin/videos/add-batch`, `GET /admin/channels/resolve`, `POST /admin/channels/add`, `POST /admin/playlists/add` |
| `/content/discover` | discovery: generate/review candidates, then import selected | `POST /admin/videos/preflight`, `POST /admin/videos/discover` |
| `/content/shows` | TV shows + talks: list by L2 (incl. hidden), create / edit / delete, member videos | `GET /tv-shows`, `GET /talks`, `GET /tv-shows|/talks/<id>/episodes`, `POST|PATCH|DELETE /admin/tv-shows|/admin/talks` |
| `/content/channels` | channels: list by L2, resolve a handle, view channel videos, import uploads | `GET /channels`, `GET /channels/<id>/videos`, `GET /admin/channels/resolve`, `POST /admin/channels/add` |
| `/content/sweep` | unavailable sweep: check, review, opt-in delete | `POST /admin/videos/sweep-unavailable` |

The sidebar is `apps/admin/src/components/layout/admin-shell.tsx` (client
component) driven by `apps/admin/src/components/layout/nav-items.ts`, and uses
`usePathname()` for the active item. Every page renders `<AdminShell>` instead
of the bare `<AppHeader>`; `/login` keeps its own layout. UI primitives stay
inside `apps/admin` (ADR-0003: UI components are not shared between apps).

## Language safety

Two rules, both aimed at the same failure: content filed under the wrong
language without anyone noticing.

### 1. The language never defaults

Every content screen starts with **no language selected** (`useState(null)`).
Nothing is written until an admin picks one:

- import / discover / channels / sweep — the run button is disabled and the
  picker shows *"Choose a language first"*; the backend's own
  `require_l2()` also rejects a missing language with 400.
- videos / shows — empty means *all languages* for a **filter**, which is a
  read, and the picker can no longer silently show `en`.

A default of `en` was how an admin could paste a Japanese channel and import
it into English without ever choosing a language.

### 2. Warn before (and while) importing

`POST /admin/videos/preflight` returns the **importer's own** metadata verdict
for a set of ids — `declared_locale` (`snippet.defaultAudioLanguage`),
`matches_l2`, and `block_reason` (`unavailable` / `not_embeddable` /
`region_restricted` / `locale_mismatch`) — computed with the same
`video_import_block_reason()` and `l2_locales()` the importer applies. The
console never re-implements the rule: doing that client-side would flag real
locale variants (`zh-Hant` under `zh`, `pt-BR` under `pt`, `nb` under `no`).

Wiring:

| Where | When | What the admin sees |
|---|---|---|
| Import → single | before `add` | the check panel; a confirm dialog if the id declares another language |
| Import → batch | before the first page, for the whole list | same, with the mismatch count and a sample of ids |
| Import → channel / playlist | after **each** page (the ids only exist as the walk returns them) | the panel grows per page; the header note says the walk is checked page by page |
| Discover | after *Find candidates*, and again before importing the selection | the check panel; confirm before importing a mismatching selection |
| Discover → Import top results | advisory only | a caveat note, because that path re-runs the search and may import different ids |

The confirm dialog exists because `Force` legitimately overrides
`locale_mismatch`: the console explains that the importer will **skip** the
videos as `locale_mismatch` unless Force is on, and lets the admin proceed
deliberately. The panel always adds the honest caveat — YouTube omits
`defaultAudioLanguage` on many uploads, so a clean check is not a guarantee.

## Screen designs

### `/content/videos`

- **Toolbar**: L2 select (all + `SUPPORTED_L2S`), title search (`q`),
  assignment filter (`All` / `In a TV show` / `In a talk` / `Unassigned`),
  sort select (`-id`, `-date`, `-views`, `title`, `difficulty`, …), page size.
- **Table** columns: selection checkbox, thumbnail/YouTube link, title,
  `youtube_id`, L2, level, views, difficulty, status, assigned show/talk.
  Rows are the `_admin_video_dict` shape (`l2` comes back as the legacy
  Directus numeric id — the UI shows the L2 code from the filter and the
  format helper, and never round-trips the numeric id into a request).
- **Row actions**: *Edit* (dialog), *Delete* (confirm dialog →
  `DELETE /admin/videos/<id>`).
- **Edit / create dialog** fields — exactly `ADMIN_VIDEO_WRITABLE` (24
  columns): `youtube_id`, `title`, `topic`, `level`, `l2`, `subs_l2`,
  `lesson`, `channel_id`, `date`, `notes`, `tv_show`, `talk`, `lex_div`,
  `views`, `tags`, `made_for_kids`, `category`, `likes`, `comments`,
  `locale`, `duration`, `word_freq`, `difficulty`, `type`, `status`.
  `tv_show`/`talk` accept an id or a title; empty means *unassign* (the API
  sends explicit `null`). Create requires `youtube_id` + `l2`.
- **Bulk actions** (when rows are selected): *Assign to TV show*, *Assign to
  talk*, *Clear assignment*, *Delete selected*. These are UI-side loops over
  `PATCH`/`DELETE` with a progress counter — no new endpoint (the backend
  has no bulk route and SPEC-096 rejected a background-job registry).
- **Paging**: `limit` (50/100/200) + `offset`; prev/next. `GET /admin/videos`
  returns bare `{data: [...]}` with no total, so the UI shows "showing N" and
  disables *next* when a short page comes back.

### `/content/import`

Four modes in tabs; shared option block (L2, `force`, `clean_generated`,
`refresh_existing`, `talk`, `tv_show`, `limit`).

| Mode | Input | Endpoint |
|---|---|---|
| Single | one YouTube id / URL | `POST /admin/videos/add` |
| Batch | a textarea of ids (newlines or commas) | `POST /admin/videos/add-batch` with `cursor.offset` |
| Channel | `@handle` / `UC…` / channel URL, with a *Resolve* button showing title, handle, subscribers, video count, uploads playlist | `GET /admin/channels/resolve`, then `POST /admin/channels/add` with `cursor.{page_token,skip}` |
| Playlist | playlist id or any URL containing `list=` | `POST /admin/playlists/add` with `cursor.{page_token,skip}` |

Channel/playlist modes also expose `match_keywords` (comma-separated regexes)
and `use_circuit_break`.

**Cursor loop**: *Start* runs one page, appends its `results` to a log table,
adds its `summary`, and re-calls with `next_cursor` until it is `null`,
`circuit_broken` is true, the user presses *Stop*, or `max_pages` (default 20)
is reached (then a *Continue* button appears). The loop is `async` with an
`AbortController`-style `useRef` flag, so *Stop* takes effect before the next
page. Each page commits server-side (`import_videos()` commits per video), so
stopping early loses nothing. Failure of a page surfaces the Flask error body
(400/404/502) and stops the loop.

### `/content/discover`

- Inputs: L2 (required, no default), `terms` (empty = the shipped popular-topics + Google-Trends
  terms), `term_limit`, `pages` (1–5), `max_per_channel`.
- *Find candidates* → report-only call. Renders the candidate table
  (checkbox, title, channel, views, term) **best-first as returned**, plus a
  *Skipped* breakdown (`already_stored`, `unavailable`, `not_embeddable`,
  `region_restricted`, `locale_mismatch`, `channel_diversity`) and the
  scraped count so "the scraper returned nothing" is visible.
- Two import paths, labelled so neither over-promises:
  - *Import selected (N)* sends exactly the ticked candidates to the **batch
    importer** (`POST /admin/videos/add-batch`, 50 per call), so the review
    selection is honoured literally;
  - *Import top results* re-runs the discovery call with `import: true` and
    `limit` = the N in the box, letting the backend import its best N.
  Both render the shared summary chips and per-video result table.

### `/content/shows`

- Tabs: **TV Shows** / **Talks**; L2 select, *include hidden* toggle, title
  filter (client-side), *New show* / *New talk*.
- Table: cover (`https://i.ytimg.com/vi/<youtube_id>/default.jpg` when set),
  title, L2 code, hidden badge, `audiobook` badge (talks), `year` (shows),
  `avg_views`, `lex_div`, tags, status.
- Create / edit dialog fields = `_SHOW_WRITABLE_BY_TABLE`:
  `title`, `youtube_id`, `channel_id`, `year` (tv_shows only), `l2`, `hidden`,
  `audiobook` (talks only), `tags`, `made_for_kids`, `lex_div`, `avg_views`,
  `category`, `locale`, `status`. Create requires `title`.
- Delete requires a confirm dialog. Deleting a show does not detach its
  videos server-side (a known backend limitation) — the dialog says so.
- *Episodes* expands a panel: `GET /tv-shows|/talks/<id>/episodes?l2=<code>&limit=100`,
  listing title, youtube id, views, difficulty.

### `/content/channels`

- L2 select → `GET /channels?l2=<code>`; table: thumbnail, title, channel id
  (copy button), subscribers, video count, country, custom URL, views,
  description (truncated).
- *Resolve* panel: `GET /admin/channels/resolve?channel=<ref>` shows the live
  YouTube metadata (title, handle, subscribers, video count, uploads
  playlist) for the referenced channel.
- The import card is laid out in two sections: the channel lookup (input +
  *Look up*, hint, and the optional resolved metadata) on top, then an
  **Import options** section holding the title filters (full width), limit
  and talk / TV-show assignment in an aligned grid, with the circuit-break
  toggle and the *Import uploads* / *Stop* actions in a footer row. The
  import runs the same cursor loop as `/content/import`.
- *Videos* expands a panel: `GET /channels/<channel_id>/videos?l2=<code>&page=N&page_size=24`
  with prev/next.
- Channel rows are **read-only** — `public.youtube_channels` has no write
  path anywhere in the backend. This is a decision, not an omission
  (see Open Questions).

### `/content/sweep`

- Inputs: L2, optional `youtube_ids` textarea (skip table paging), `limit`.
- *Check* → `POST /admin/videos/sweep-unavailable` with `delete: false`
  (report-first). Renders `checked`, the unavailable rows with checkboxes,
  and `next_cursor`; a *Continue* button follows the `{after_id}` keyset
  cursor.
- *Delete selected* → same endpoint with `delete: true` and the selected
  `youtube_ids` (the report used one "checked" call to build the list, the
  delete call is scoped to those ids). A 502 from the YouTube API never
  deletes anything — the endpoint reports before it deletes.

## Why some routes are public

`GET /tv-shows`, `GET /talks`, `GET /channels` and
`GET /channels/<id>/videos` are unauthenticated. There is no admin list route
for shows, talks or channels (SPEC-039 § 5.8 shipped create/patch/delete
only), and adding one is out of scope for this spec.

Using the public routes here is acceptable because they are **read-only** and
their payload is the same catalogue the public site already serves; the
console never writes through them. The write routes it does use
(`/admin/tv-shows`, `/admin/talks`, `/admin/videos`, `/admin/channels/add`,
`/admin/playlists/add`, `/admin/videos/discover`,
`/admin/videos/sweep-unavailable`) are all on `admin_bp` behind the
blueprint-level `require_admin()` hook, so a demoted admin's stale session
still gets 403s on every mutation.

`GET /tv-shows/<id>/episodes` and `/talks/<id>/episodes` are called **with an
explicit `?l2=`** even after the `_show_dict` fix, because the fallback path
depends on the response's `l2Code` and passing the code the filter already
knows is cheaper and unambiguous.

## Backend changes

Two changes in `zerotohero-python-server` (a separate Git repository; each is
committed there):

### 1. `utils_content._show_dict` is defined twice

`utils_content.py` defines `_show_dict` at line 159 (the public shape, which
includes `l2Code`) and again at line 1606 (added later by SPEC-039 § 5.8, the
admin shape with `status` / `created_on` / `year`). The second definition
wins at import time, so:

- `get_tv_shows` / `get_tv_show` / `get_talks` / `get_talk` return the admin
  shape — **without `l2Code`** — and with `status` / `created_on` / `year`
  always `None` because `_SHOW_FIELDS` does not select them.
- `routes/tv_shows.py:66` and `:123` read `show.get("l2Code")`, so
  `GET /tv-shows/<id>/episodes` (and the talks equivalent) return
  `500 {"error": "TV show has no l2"}` unless the caller passes `?l2=`.

**Fix**: keep one `_show_dict` — the union of both key sets (`id`, `status`,
`created_on`, `youtube_id`, `l2`, `l2Code`, `title`, `channel_id`, `year`,
`avg_views`, `hidden`, `tags`, `category`, `locale`, `made_for_kids`,
`lex_div`, `audiobook` when `talk`) — and delete the second definition. No key
that either shape returned today disappears, and the public routes regain
`l2Code`, which repairs the episodes fallback and gives the console the L2
code it needs for a cross-language list.

### 2. `GET /admin/videos` gains a `q` (title) filter

The list route supports `l2`, `sort`, `limit`, `offset`, `tv_show`, `talk` and
the `nnull` filters, but no text search, so finding a row by title means
paging. Add:

- `q` (optional) — case-insensitive `v.title ILIKE %q%`, with `%` / `_`
  escaped by the existing `_escape_like()` helper so a literal `%` cannot
  turn into a wildcard.

`utils_content.list_admin_videos(..., q=None)` gains the parameter;
`routes/admin.py` reads `request.args.get('q')`. The same filter is what
Classic's db-audit and video list approximated client-side.

### 3. `POST /admin/videos/preflight` (new)

The language warning needs the importer's locale rule, which lives in
`utils_youtube.l2_locales()` → `caption_selection.l2_locale_priority()`. The
console must not approximate it, so one small admin route exposes the
metadata-only verdict:

```json
POST /admin/videos/preflight   { "l2": "ja", "youtube_ids": ["dQw4w9WgXcQ"] }
{
  "l2": "ja",
  "l2_locales": ["ja", "ja-JP"],
  "results": [{ "youtube_id": "dQw4w9WgXcQ", "title": "…",
                "declared_locale": "en", "matches_l2": false,
                "block_reason": "locale_mismatch" }],
  "invalid": [],
  "summary": { "total": 1, "mismatched": 1, "unavailable": 0,
               "not_embeddable": 0, "region_restricted": 0, "invalid": 0 }
}
```

- Metadata only. The transcript checks (`no_transcript`,
  `transcript_too_short`, `caption_service_unavailable`) are deliberately not
  run — each needs a caption download, which is the import itself.
- `matches_l2` is `null` (not `true`) when YouTube returned no video, so "no
  verdict" cannot be read as "compatible".
- No database access: it is a pure read of the YouTube API plus the locale
  map. `test_admin_video_preflight.py` asserts that by failing if
  `get_conn()` is called.
- A failed `videos.list` is a `502`, never a silent all-clear.
- Admin-only by construction (the blueprint's `before_request` hook); the
  existing structural test enumerates every rule on the blueprint and
  requires 401/403, so it covers this route too.

No other route changes. Documented in
[ARCH-003](../arch/003-python-backend-architecture.md) and in the SPEC-039
§ 5.8 route list note.

## Components & files

| File | Role |
|---|---|
| `apps/admin/src/components/layout/admin-shell.tsx` | Sidebar + header wrapper for every authenticated page |
| `apps/admin/src/components/layout/nav-items.ts` | The Users / Content menu definition |
| `apps/admin/src/app/page.tsx` | `/` → redirect to `/users` |
| `apps/admin/src/app/users/page.tsx` | User search dashboard (moved from `/`) |
| `apps/admin/src/app/content/videos/page.tsx` | Video manager |
| `apps/admin/src/app/content/import/page.tsx` | Single / batch / channel / playlist importer |
| `apps/admin/src/app/content/discover/page.tsx` | Candidate review + import |
| `apps/admin/src/app/content/shows/page.tsx` | TV shows + talks manager |
| `apps/admin/src/app/content/channels/page.tsx` | Channels browser + resolve + import |
| `apps/admin/src/app/content/sweep/page.tsx` | Unavailable sweep |
| `apps/admin/src/components/content/video-dialog.tsx` | Create/edit one video (all `ADMIN_VIDEO_WRITABLE` fields) |
| `apps/admin/src/components/content/show-dialog.tsx` | Create/edit one TV show or talk |
| `apps/admin/src/components/content/{l2-select,field,confirm-dialog}.tsx` | L2 picker, labelled field/section, destructive-action confirm |
| `apps/admin/src/components/content/language-check.tsx` | The pre-import language-check panel and its confirm-dialog copy |
| `apps/admin/src/hooks/use-auth-ready.ts` | Wait for the mirrored access token before the first fetch |
| `apps/admin/src/lib/content-api.ts` | Typed clients for every content route |
| `apps/admin/src/lib/video-ids.ts` | Extract ids from pasted ids/URLs |
| `apps/admin/src/types/content.ts` | `AdminVideo`, `AdminShow`, `AdminChannel`, import/discovery/sweep result types |
| `zerotohero-python-server/utils_content.py` | `_show_dict` de-duplication, `list_admin_videos(q=…)` |
| `zerotohero-python-server/routes/admin.py` | `q` query parameter, `POST /admin/videos/preflight` |
| `zerotohero-python-server/test_admin_videos_list.py` | `q` filter + escaping + route tests |
| `zerotohero-python-server/test_content_shows.py` | `_show_dict` regression test (`l2Code` present, keys preserved) |
| `zerotohero-python-server/test_admin_video_preflight.py` | Preflight decisions and validation (no DB access) |

## i18n

Every new string goes through `useT()` and a `translations.csv` key (18
locales, added with `scripts/add-translation-key.mjs` then
`scripts/sync-translations.mjs csv-to-json`). Existing keys are reused
wherever they already say the right thing (`action.search`, `action.save`,
`action.delete`, `action.edit`, `action.cancel`, `action.import`,
`action.view_on_youtube`, `title.user_management`, `title.channels`,
`title.tv_shows`, `title.episodes`, `label.level`, `label.status`,
`label.videos`, `label.subscribers`, `msg.no_videos_found`,
`msg.no_shows_found`, `msg.confirm_remove_video`, `msg.loading`,
`error.general`, …). The admin app still renders English only (SPEC-060 §
i18n); the keys exist so the convention holds and a future locale toggle
works.

**Watch out when reusing a key: placeholder keys need their arguments.**
Ten call sites initially reused an existing key purely for its English text
and threw `IntlError: FORMATTING_ERROR` in the console — `title.views` is
`"{numViews} Views"`, `title.video_count` is `"Video {index} of {total}"`,
`placeholder.filter_videos` is `"Filter {n} videos"`, and the pre-existing
`label.words` is an ICU plural needing `{count}`. Two placeholder-free keys
were added (`label.views`, `placeholder.filter_by_title`) and the plural
call site now passes `count`. A whole-tree check — for every `t('key')`,
compare the ICU variables in the resolved English value against the
arguments at the call site — is worth automating (Open Questions).

## Logging

`apps/admin/src/lib/logger.ts` (`[LP Admin]`, `NEXT_PUBLIC_LOG_LEVEL`) is used
for every request/response and branch on these screens: the request body sent
(never the whole `subs_l2` blob — length only), the per-page summary, the
cursor transition, the stop/continue decision, and every error body. All of
these are `log()` (info, `LOG_LEVEL=3`) per the project's
"logging defaults to INFO" rule; only caught exceptions use `logerr()`.

## Testing & verification

What was run when this shipped:

- Backend, from `zerotohero-python-server/`:
  `python3.10 -m pytest test_content_shows.py test_admin_videos_list.py
  test_admin_video_import.py test_video_discovery.py` — 86 passed. The new
  cases cover the `_show_dict` union shape, one-definition-by-AST, `l2Code`
  on the public getters, the episodes route working without `?l2=`, and the
  `q` filter (escaping, composition with the other filters, blank `q`,
  route pass-through, 401 without a token).
- `test_app.py` still has its pre-existing failures (golden-output drift in
  lemmatize/translate/GA endpoints and data files absent from a clean
  checkout). Verified by running the same file in a worktree of the commit
  before this work: the current failures are a strict subset of that
  baseline, i.e. nothing here introduced one.
- Admin app: `npx turbo typecheck --filter=@langplayer/admin` and
  `npx turbo lint --filter=@langplayer/admin` both pass. Lint needed
  `apps/admin/eslint.config.mjs` to ignore `.netlify/**` — the gitignored
  Netlify output made `eslint .` report ~400 errors from bundled JS over
  clean source.
- `npm run build:check -w apps/admin`: **pass** (11 routes, isolated
  `.next-check`, cleaned up).
- Live against the running Flask dev server (public routes, so no admin
  session needed):
  - `GET /tv-shows?l2=en` and `GET /talks?l2=en` now return `l2Code` — and
    still return `status` / `created_on` / `year`, so no key the old shape
    produced disappeared;
  - `GET /tv-shows/307/episodes` **without** `?l2=` returns `200` with 367
    episodes (the pre-fix behaviour was `500 "TV show has no l2"`);
  - `GET /channels?l2=en` returns the channels listing the console renders;
  - a **non-admin** token gets `403` on `GET /admin/videos?q=hello`, and the
    write-only admin routes answer `405` to `GET` — i.e. they exist and are
    gated, not missing.
- Remaining manual check (needs an admin account, which no test user has —
  both `tester.mary` and `tester.bob` report `isAdmin: false`):
  reload `/content/videos` in the browser and click through the six screens.
- **Restart `next dev` after regenerating locale JSONs.** The admin app's
  `src/i18n.ts` imports `packages/shared/locales/en.json`, which sits outside
  the app directory, so Turbopack serves a stale messages module: the i18n
  fix above looked unfixed in the browser (as `MISSING_MESSAGE` for the
  newly added keys) until the dev server was restarted, even though the file
  on disk was correct. Noted in the file itself too.

Manual check when the backend is up: log in as an admin and exercise
videos / import / discover / shows / channels / sweep against a real
language. Login requires `app_metadata.is_admin = true`; Flask's CORS
allowlist already contains `http://localhost:3100` (ARCH-029 § 11).

## Known limitations

- **No single-video GET.** `GET /admin/videos/<id>` does not exist, so the
  edit dialog is fed from the loaded list row and there is no
  `/content/videos/<id>` deep link. Adding the endpoint is an Open Question.
- **Channel rows are read-only** — the backend has no `youtube_channels`
  write path.
- **Deleting a show does not detach its videos** (the backend deletes only
  the show row), so orphans keep their `tv_show` / `talk` id until edited.
- **Cross-language shows list is approximate.** The `l2` returned by
  `/tv-shows` / `/talks` is the legacy Directus numeric id; the UI shows the
  L2 code only when the list is filtered to one language (or derives it from
  the selected L2). A code→name mapping for arbitrary ids is not needed
  because the console is always used per-L2.
- **Bulk actions are serial UI loops**, not atomic operations. A mid-loop
  failure leaves the earlier rows applied and is reported in the progress
  panel.
- **Discovery has no cross-run memory** (SPEC-098 § Known Limitations) and
  its scraper can return "few results" without an error signal, which is why
  import is opt-in on that screen.
- **Subtitle authoring is not in this spec**: no SRT upload, no `.ass`
  parsing, no line-breaking/normalising tools, no `POST /sync-srt` caller.
  `subs_l2` is editable as raw text on the video dialog.
- **`POST /admin/videos` (create) bypasses `next_video_id()`**, so a
  hand-created row can land in another language's id block. The console does
  not attempt to fix or hide that: the import screens (which do allocate
  correctly) are the intended path, and the create dialog exists for rows the
  importer cannot produce.
- **Editing cannot clear a text field.** Flask's `_clean_video_payload`
  drops `null` for every column except `tv_show` / `talk` (which are
  explicit-unassign), so an emptied input is omitted rather than written as
  NULL.
- **The shows table's title filter is client-side** over the loaded page
  (up to 1000 rows); the public listing has no search parameter.
- **The language warning is only as good as YouTube's declaration.**
  `defaultAudioLanguage` is absent on many uploads, and the check says so —
  a clean panel means "nothing declared otherwise", not "verified". Channel
  and playlist walks are audited *after* each page commits, because their ids
  do not exist before the walk; a mismatch there is reported, not prevented.
- **A batch preflight costs one request per 50 ids** (plus a YouTube
  `videos.list` call server-side). A 500-id paste therefore spends 10
  preflight calls before the first import page.

## Open Questions

- Should `GET /admin/videos/<id>` be added so video editing gets a deep link
  (and `/content/videos/[id]` a real page)?
- Should `GET /admin/videos` return a total count (`meta.filter_count`) so the
  table can show "1–50 of N" and page properly?
- Should channel row CRUD be added to Flask (create/edit/hide
  `youtube_channels`), or are channel rows purely a mirror of YouTube?
- Should duplicate detection (`youtube_id` / identical `subs_l2`, Classic's
  `db-audit`) be ported into the videos table as a highlighted flag?
- Should the importer remember "term X was searched on date Y" so discovery
  can skip already-searched terms (SPEC-098 Open Question)?
- Do we want Classic's subtitle tooling (SRT upload, `sync-srt`,
  break-lines, renumber-notes) in the admin console at all, or is subtitle
  authoring retired with the crawler?
- Should the sidebar group the maintenance-style screens (import / discover /
  sweep) separately from the browsing screens (videos / shows / channels)?
