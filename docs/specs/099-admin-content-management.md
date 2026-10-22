# SPEC-099: Admin Console — Content Management (videos / channels / TV shows / talks by L2)

## Metadata

- **Spec ID**: SPEC-099
- **Feature**: The `apps/admin` content-management surface: discover, import,
  and manage videos, channels, TV shows and talks per language (L2), plus the
  navigation shell (Insights / Users / Content, current order)
- **Status**: complete (2026-10-16); `/content/import` reworked 2026-10-19
- **Created**: 2026-10-16
- **Implemented**: 2026-10-16. `apps/admin` — `defc95bc` (shell + `/users`),
  `7ab9ee4e` (content API + types), `fd2fb6aa` (i18n keys), `02bf34e4`
  (videos), `a0ec0e5d` (import), `f0c9c909` (discover), `324f41d7` (shows),
  `e9a72137` (channels + sweep). `zerotohero-python-server` — `de20196`
  (`_show_dict`), `4af6f33` (`q` filter).
- **Updated**: 2026-10-19 — `/content/import` is now three phases
  (Discover → Check transcripts → Add). Discovery uses the new read-only
  `/admin/videos/ids`, `/admin/videos/screen` and `/admin/videos/transcripts` endpoints (backend
  `7f6025e`), shows the found videos before spending caption calls, then
  checks transcripts one row at a time through the transcript-only endpoint
  (so it does not re-fetch metadata), with a per-row spinner. Shorts
  (duration ≤ `SHORTS_MAX_SECONDS`, default 180s) are excluded in Discover.
  The add phase imports individual rows or every eligible row across the full
  result set.
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
- an **import** screen (single id, batch, channel, playlist) split into a
  read-only **Discover** phase, a **Check transcripts** phase and an
  **Add** phase: it enumerates ids and fetches metadata first (so the admin
  sees whether videos were found), then lists caption tracks with a per-row
  spinner, then imports eligible rows through the SPEC-096 pipeline with a
  filterable infinite-scroll table,
- a **discovery** screen (SPEC-098) that reviews candidates before importing,
- a **shows & talks** manager (list by L2, create / edit / delete, member
  videos),
- a **channels** browser (list by L2, resolve a handle, import uploads, open
  a channel detail page, and delete a channel together with its videos for
  that language),
- an **unavailable sweep** screen (report first, delete opt-in).

It also documents five backend changes (see § "Backend changes"), all in
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
- As an admin, I want to see which candidates are already stored, unavailable,
  region-restricted, in another declared language, or missing a transcript
  before anything is written, and hide any of those groups, so I can choose
  what to add from one review table.
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
| Channels | `pages/_l1/_l2/youtube/channels.vue`, `components/ChannelCard.vue` | Read-only channel cards from `GET /channels`; the channel page showed playlists behind `$adminMode` | `/content/channels` — clickable rows, channel detail page, resolve, import uploads, delete channel + its L2 videos |
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
| `/content/import` | **Discover → Check transcripts → Add**: single · batch · channel · playlist; Discover fetches ids + metadata, Check lists caption tracks with per-row spinners, Add shows an infinite-scroll table with opt-in *Show* filters and imports individual/all eligible rows | `POST /admin/videos/ids`, `POST /admin/videos/screen`, `POST /admin/videos/transcripts`, `POST /admin/videos/add`, `POST /admin/videos/add-batch`, `GET /admin/channels/resolve` |
| `/content/discover` | discovery: generate/review candidates, then import selected | `POST /admin/videos/preflight`, `POST /admin/videos/discover` |
| `/content/shows` | TV shows + talks: list by L2 (incl. hidden), create / edit / delete, member videos | `GET /tv-shows`, `GET /talks`, `GET /tv-shows|/talks/<id>/episodes`, `POST|PATCH|DELETE /admin/tv-shows|/admin/talks` |
| `/content/channels` | channels: list by L2, click a row for its channel page, resolve a handle, import uploads | `GET /channels`, `GET /admin/channels/resolve`, `POST /admin/channels/add` |
| `/content/channels/[channelId]` | channel detail: stored channel metadata, stored-video count, video grid + *Load more*, *Import* (deep-links to the prefilled import screen), *Delete channel* (confirm + cascade for that L2) | `GET /admin/channels/<id>?l2=`, `GET /channels/<id>/videos`, `DELETE /admin/channels/<id>?l2=` |
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
console never re-implements locale matching: doing that client-side would
flag real locale variants (`zh-Hant` under `zh`, `pt-BR` under `pt`, `nb`
under `no`). `/admin/videos/screen` now carries the same raw verdict on every
screened row, so the import screen gets the warning without a second YouTube
call; `preflight` remains the endpoint for `/content/discover` (SPEC-098).

Wiring:

| Where | When | What the admin sees |
|---|---|---|
| Import → Discover | while screening, and again before any add | the check panel built from the screened rows' raw flags (`declared_audio_locale`, `audio_matches_l2`, `block_reason`); it grows page by page |
| Import → Add all eligible | before the batch | a confirm dialog if any row being added declares another language (only possible for a soft block with Force on) |
| Import → single-row Add | before that add | the same confirm for that row |
| Discover | after *Find candidates*, and again before importing the selection | the check panel; confirm before importing a mismatching selection |
| Discover → Import top results | advisory only | a caveat note, because that path re-runs the search and may import different ids |

The console applies only the documented **Force** override (region and
declared-locale are soft; unavailable, non-embeddable and no-transcript are
not) when it decides which rows are eligible. The underlying locale verdict
still comes from the backend.

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
  `DELETE /admin/videos/<id>`). *Create* is `POST /admin/videos`; it returns
  `409` when that `(youtube_id, l2)` row already exists (the unique index added
  2026-10-19, SPEC-105).
- **Edit / create dialog** fields — exactly `ADMIN_VIDEO_WRITABLE` (24
  columns): `youtube_id`, `title`, `topic`, `level`, `l2`, `subs_l2`,
  `lesson`, `channel_id`, `date`, `notes`, `tv_show`, `talk`, `lex_div`,
  `views`, `tags`, `made_for_kids`, `category`, `likes`, `comments`,
  `locale`, `duration`, `word_freq`, `difficulty`, `type`, `status`.
  `tv_show`/`talk` accept an id or a title; empty means *unassign* (the API
  sends explicit `null`). Create requires `youtube_id` + `l2`. **`l2` is
  selectable only on create** — on edit it is shown disabled, because the id
  block is language-specific. The dialog sends `subs_l2` only when it changed
  (SPEC-106).
- **Bulk actions** (when rows are selected): *Assign to TV show*, *Assign to
  talk*, *Clear assignment*, *Delete selected*. These are UI-side loops over
  `PATCH`/`DELETE` with a progress counter — no new endpoint (the backend
  has no bulk route and SPEC-096 rejected a background-job registry).
- **Paging**: `limit` (50/100/200) + `offset`; prev/next. `GET /admin/videos`
  returns bare `{data: [...]}` with no total, so the UI shows "showing N" and
  disables *next* when a short page comes back.

### `/content/import` — Discover → Check transcripts → Add

Three phases on one screen. **Discover** and **Check transcripts** write
nothing; **Add** calls the ordinary SPEC-096 importer.

| Mode | Input | Discovery source |
|---|---|---|
| Single | one YouTube id / URL | the id itself |
| Batch | a textarea of ids (newlines or commas) | the pasted list, paged by `cursor.offset` |
| Channel | `@handle` / `UC…` / channel URL, with a *Resolve* button showing title, handle, subscribers, video count, uploads playlist | `POST /admin/videos/ids` |
| Playlist | playlist id or any URL containing `list=` | `POST /admin/videos/ids` |

Channel/playlist modes also expose `match_keywords` (comma-separated
regexes). The old `limit` / `max_pages` / `use_circuit_break` fields are gone:
discovery walks the source to the end (or until *Stop*); the check phase uses
one-id requests and the add phase 25-id batches.

**1. Discover**

- *Find videos* runs a browser-driven loop. A pasted list is enqueued up
  front; a channel/playlist asks `/admin/videos/ids` for one page (max 50) of
  ids at a time. Each batch of ≤50 goes to `/admin/videos/screen` with
  **`check_transcripts: false`**, so this phase answers already-stored ids
  from the DB and batches `videos.list` for the rest — **no caption request
  is spent here**.
- The table appears as soon as the first metadata batch lands. All found
  videos are shown (the *Show* filters are disabled until Add) so the admin
  can confirm the source actually yielded videos before paying for transcript
  lookups. The transcript column reads *Not checked*.
- **Shorts are excluded here.** The Data API has no Shorts flag, so the
  backend filters duration ≤ `SHORTS_MAX_SECONDS` (default 180s = YouTube's
  3-minute Shorts maximum). They are removed before the table and before any
  caption request, including already-stored Shorts; the progress line shows
  *Shorts excluded: N*. The threshold is env-configurable (set 60 for classic
  short-form only).
- Live progress: *IDs found*, *Screened*, *Already in DB*, *Metadata
  checked*, *Shorts excluded*, *0 of N transcripts checked*, *Eligible* (0
  here), plus a stage line (listing / fetching metadata / finished /
  stopped). *Stop* takes effect after the in-flight request; *Continue*
  resumes from the queue/cursor. An empty result is reported explicitly.
- Invalid ids are listed once (first 10 in the line, all in the tooltip).
- Language mismatch uses the rows' own raw metadata verdicts, so the panel
  grows as pages arrive and never costs a second YouTube call.

**2. Check transcripts**

- *Check transcripts (N)* walks the rows that still need a listing **one at a
  time**. The current row is marked `checking`, so the table shows a spinner
  in its transcript column; the result (manual / auto-generated / no
  transcript / caption failure) replaces the spinner before the next row
  starts. There is a 250ms gap between requests to avoid a burst.
- It calls `POST /admin/videos/transcripts` with one id. That endpoint lists
  the caption tracks only — no transcript download, and **no metadata or DB
  re-fetch** (Discover already has the metadata). Rows already in the DB,
  unavailable, or non-embeddable are skipped; a previous caption-service
  failure is retried.
- **Caption listings are cached.** `list_transcripts_result()` reads
  `load_from_caption_cache(video_id, type='list')` before calling YouTube and
  writes the successful listing back to the two-tier `caption` bucket (local
  disk → shared host), keyed per video (the listing contains every track, so
  it is language-independent). Re-running this phase only lists videos that
  were never listed; failures are not cached.
- Progress is *checked / total* with *Stop* and resume. A caption-service
  failure shows a **short** message, stops the run, and offers *Retry
  unchecked (N)*. The backend throttles listings and retries one rate-limited
  listing, but a sustained YouTube `/sorry/index` 429 can still stop a run;
  the full upstream exception is only in the server log.
- All rows remain visible during this phase (filters still disabled), so the
  admin can watch results instead of rows disappearing. When every checkable
  row has a result, the page moves to Add and enables the *Show* filters.

**3. Add**

- The result table is **client-side infinite scroll**: it renders 50 rows per
  step from the full accumulated array via an `IntersectionObserver` sentinel
  (with a *Load more* fallback), so "all rows" really means the whole result
  set. Columns: thumbnail, title + YouTube id + channel, duration, views,
  audio locale, transcript locale (`code (auto|manual)` / `Stored` / `Not
  checked`), status badges, *Add*.
- **Only eligible rows are shown by default.** A *Show* row has one opt-in
  checkbox per excluded category, each with a count: already in DB,
  unavailable/not embeddable, region restricted, audio ≠ L2, no transcript,
  auto-generated transcript, and transcript not checked/caption lookup
  failed. Checking a category includes those rows; a non-eligible row is
  shown when at least one of its categories is checked. *Show all* checks
  every category; *Reset* unchecks them all (back to eligible-only). The
  hidden count is shown, and an empty table explains that categories can be
  enabled. The previous *Eligible only* toggle is gone — eligible-only is the
  default in this phase.
- The add card is visible once Discover has rows (so the admin can add rows
  already checked if the check was stopped early); its buttons are disabled
  while a check is running.

- Options: `force`, `clean_generated`, `refresh_existing`, talk, TV show.
- `force` changes eligibility exactly as the importer does: region-restricted
  and declared-locale-mismatch rows become addable; unavailable,
  non-embeddable and no-transcript rows never do. **Auto-generated
  transcripts are never eligible.** A row is eligible when
  `!in_db && blockReasonFor(row, force) === null &&
  transcript_status === 'found' && transcript.is_generated === false`.
  This is a console/import policy: the importer itself still accepts ASR for
  other callers (ARCH-035).
- *Add all eligible (N)* adds the **full eligible set** — not just the rows
  currently rendered, and not only the rows passing the *Show* filters — in
  batches of **25** through `POST /admin/videos/add-batch` (50 transcript
  downloads inside one request can outlive the Cloudflare/gunicorn timeout;
  a 502 gateway response has no CORS header and surfaces as a misleading
  CORS error). Individual rows use `POST /admin/videos/add`.
- Per-row results (`added` / `updated` / `skipped` / `failed` + reason) and
  the summary chips stay visible. A row that becomes in-DB after an add
  follows the normal `Already in DB` rule: it is hidden unless that *Show*
  category is checked.
- The language-mismatch confirm runs before a bulk or single add whose rows
  declare another language. That is only reachable with `force` on, because
  without it those rows are not eligible.
- `utils_video_import.import_videos()` commits per video, so stopping or
  failing an add batch loses nothing already imported. Page failures surface
  the Flask error body (400/404/502) and mark the in-flight rows `failed`.

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
  description (truncated). Clicking a row (or its title link) opens
  `/content/channels/<channel_id>?l2=<code>`; the *Videos* action keeps the
  inline pager and *Import* keeps filling the lookup card.
- *Resolve* panel: `GET /admin/channels/resolve?channel=<ref>` shows the live
  YouTube metadata (title, handle, subscribers, video count, uploads
  playlist) for the referenced channel.
- The import card is laid out in two sections: the channel lookup (input +
  *Look up*, hint, and the optional resolved metadata) on top, then an
  **Import options** section holding the title filters (full width), limit
  and talk / TV-show assignment in an aligned grid, with the circuit-break
  toggle and the *Import uploads* / *Stop* actions in a footer row. The
  import runs the same cursor loop as `/content/import`.
- **Channel detail** (`/content/channels/[channelId]?l2=…`): the header shows
  the stored channel metadata (thumbnail, title, channel id, subscribers,
  YouTube upload count, country, custom URL, description) and a
  `stored_video_count` badge. Actions:
  - *Import* deep-links to
    `/content/import?mode=channel&l2=<code>&channel=<ref>`, which opens the
    Channel tab with the language and reference prefilled.
  - *Delete channel* opens a confirmation naming the exact number of stored
    videos, then calls `DELETE /admin/channels/<channel_id>?l2=<code>`. The
    delete is **L2-scoped**: it removes the channel row and every
    `youtube_videos` row for `(channel_id, l2)` and leaves other languages'
    registrations and videos untouched.
  - The video grid pages `GET /channels/<channel_id>/videos?l2=<code>&page=N&page_size=24`
    with *Load more*; cards open the video on YouTube.
- Channel rows are **deletable** (not fully read-only). Create/edit/hide still
  have no backend path — see Open Questions.

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
`DELETE /admin/channels/<id>`, `/admin/playlists/add`,
`/admin/videos/discover`, `/admin/videos/sweep-unavailable`) are all on
`admin_bp` behind the blueprint-level `require_admin()` hook, so a demoted
admin's stale session still gets 403s on every mutation. The channel detail
lookup (`GET /admin/channels/<id>`) is also admin-only: it returns the stored
row plus the stored-video count, which is what the delete confirmation
promises.

`GET /tv-shows/<id>/episodes` and `/talks/<id>/episodes` are called **with an
explicit `?l2=`** even after the `_show_dict` fix, because the fallback path
depends on the response's `l2Code` and passing the code the filter already
knows is cheaper and unambiguous.

## Backend changes

Four changes in `zerotohero-python-server` (a separate Git repository; each is
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
  run — `transcript_too_short`/`caption_service_unavailable` need a caption
  download, which is the import itself. (The import screen's discovery phase
  instead uses `/admin/videos/screen`, which lists caption *tracks* without
  downloading them; `/content/discover` keeps using `preflight`.)
- `matches_l2` is `null` (not `true`) when YouTube returned no video, so "no
  verdict" cannot be read as "compatible".
- No database access: it is a pure read of the YouTube API plus the locale
  map. `test_admin_video_preflight.py` asserts that by failing if
  `get_conn()` is called.
- A failed `videos.list` is a `502`, never a silent all-clear.
- Admin-only by construction (the blueprint's `before_request` hook); the
  existing structural test enumerates every rule on the blueprint and
  requires 401/403, so it covers this route too.

### 4. `GET` / `DELETE /admin/channels/<channel_id>` (new)

- `GET /admin/channels/<channel_id>?l2=<code>` returns
  `{ "channel": <youtube_channels row>, "stored_video_count": N }`.
  `stored_video_count` counts `youtube_videos` rows for `(channel_id, l2)` —
  not the channel's YouTube `video_count` — so the delete confirmation names
  exactly what will be removed. 404 for an unknown row, 400 for a bad `l2`.
- `DELETE /admin/channels/<channel_id>?l2=<code>` removes the channel row and
  every `youtube_videos` row for `(channel_id, l2)`. The content delete
  commits before the cache cleanup. Lemma cache keys are invalidated in
  batches via `remote_cache.delete_many()` →
  `delete-flask-cache-batch.php` (one request per 1,000 keys), not one HTTPS
  request per video. Returns `{ "deleted_videos": N }`. Other languages'
  registrations and videos are untouched. 404 when the channel row does not
  exist.

Both are on `admin_bp`, so the blueprint-level `require_admin()` covers them.
`utils_content.get_channel`, `count_channel_videos` and `delete_channel`
implement the reads/writes; `test_admin_video_import.py` covers the routing,
the 404/400 paths, the admin gate and the L2 scoping. This reverses the
earlier "channels are read-only" decision and resolves the delete half of the
channel-CRUD open question.

### 5. `POST /admin/videos/ids` + `/admin/videos/screen` + `/admin/videos/transcripts` (new, 2026-10-19)

The three-phase import needs read-only discovery/check steps that neither the
importer nor `preflight` provides:

- **`/admin/videos/ids`** enumerates candidate ids from a pasted list, a
  channel's uploads playlist, or a playlist — one YouTube page (max 50) per
  call, no import.
- **`/admin/videos/screen`** accepts up to 50 ids and returns, per id: the
  stored-row verdict (`in_db`, stored title/duration/locale), YouTube
  metadata (one batched `videos.list` call), and optionally the L2
  caption-track listing. It also drops Shorts (duration ≤
  `SHORTS_MAX_SECONDS`, default 180s) before the table and before any caption
  call, counting them in `summary.shorts_excluded`. Already-stored ids skip
  both API calls. Soft blocks (region / declared locale) still get a listing
  so `force` adds need no second pass.
- **`/admin/videos/transcripts`** accepts one id (the console) or up to 50
  and lists the caption tracks only — no metadata, no DB, no transcript
  download. This is what makes the Check phase independent of Discover and
  lets the table show exactly one spinner.

The full body/response contracts, the Shorts rule, the caption-failure
semantics (`caption_error` + `not_checked`, never a false `no_transcript`)
and the caps are documented in
[SPEC-096](096-admin-video-ingestion.md#post-adminvideosscreen). The backend
files are `utils_video_screening.py`, `utils_video_import.list_video_ids()`
and `utils_content.get_videos_for_screening()`; `test_admin_video_screening.py`
covers them (22 cases). These routes are on `admin_bp`, so the structural
401/403 test covers them automatically.

No other route changes. [ARCH-003](../arch/003-python-backend-architecture.md)
carries the updated `admin_bp` route list.

## Components & files

| File | Role |
|---|---|
| `apps/admin/src/components/layout/admin-shell.tsx` | Sidebar + header wrapper for every authenticated page |
| `apps/admin/src/components/layout/nav-items.ts` | The Users / Content menu definition |
| `apps/admin/src/app/page.tsx` | `/` → redirect to `/users` |
| `apps/admin/src/app/users/page.tsx` | User search dashboard (moved from `/`) |
| `apps/admin/src/app/content/videos/page.tsx` | Video manager |
| `apps/admin/src/app/content/import/page.tsx` | Discover → Check transcripts → Add: enumeration/metadata loop, per-row transcript check, add phase |
| `apps/admin/src/components/content/screening-table.tsx` | Filterable infinite-scroll result table (view toggles, per-row Add) |
| `apps/admin/src/lib/screening.ts` | Eligibility/force rule, raw preflight builder, ISO duration formatting, row merge |
| `apps/admin/src/app/content/discover/page.tsx` | Candidate review + import |
| `apps/admin/src/app/content/shows/page.tsx` | TV shows + talks manager |
| `apps/admin/src/app/content/channels/page.tsx` | Channels browser + resolve + import; row click opens the detail page |
| `apps/admin/src/app/content/channels/[channelId]/page.tsx` | Channel detail: metadata, video grid + load more, import deep-link, delete confirm |
| `apps/admin/src/app/content/sweep/page.tsx` | Unavailable sweep |
| `apps/admin/src/components/content/video-dialog.tsx` | Create/edit one video (all `ADMIN_VIDEO_WRITABLE` fields) |
| `apps/admin/src/components/content/show-dialog.tsx` | Create/edit one TV show or talk |
| `apps/admin/src/components/content/{l2-select,field,confirm-dialog}.tsx` | L2 picker, labelled field/section, destructive-action confirm |
| `apps/admin/src/components/content/language-check.tsx` | The pre-import language-check panel and its confirm-dialog copy |
| `apps/admin/src/hooks/use-auth-ready.ts` | Wait for the mirrored access token before the first fetch |
| `apps/admin/src/lib/content-api.ts` | Typed clients for every content route |
| `apps/admin/src/lib/video-ids.ts` | Extract ids from pasted ids/URLs |
| `apps/admin/src/types/content.ts` | `AdminVideo`, `AdminShow`, `AdminChannel`, `AdminChannelDetail`, `ScreeningRow` / `ScreeningResponse`, import/discovery/sweep result types |
| `zerotohero-python-server/utils_content.py` | `_show_dict` de-duplication, `list_admin_videos(q=…)`, `get_videos_for_screening`, `get_channel` / `count_channel_videos` / `delete_channel` |
| `zerotohero-python-server/routes/admin.py` | `q` query parameter, `POST /admin/videos/preflight`, `POST /admin/videos/ids`, `POST /admin/videos/screen`, `GET` / `DELETE` on `/admin/channels/<id>` |
| `zerotohero-python-server/utils_video_screening.py` | The read-only discovery screen (DB + metadata + caption listing) |
| `zerotohero-python-server/test_admin_video_screening.py` | Screening, Shorts, transcript-only check, enumeration, routes (22 cases) |
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
`action.delete_channel`, `msg.confirm_delete_channel`, `msg.channel_deleted`,
`msg.stored_videos_count`, `error.general`, …). The admin app still renders
English only (SPEC-060 § i18n); the keys exist so the convention holds and a
future locale toggle works.

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
cursor transition, the stop/continue decision, and every error body. Discovery
adds one line per listed page (cursor + source), one per screened batch
(size), one per add batch (size + offset), and the stop/finish decisions. All
of these are `log()` (info, `LOG_LEVEL=3`) per the project's
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
language. Login requires `app_metadata.is_admin = true`. Flask's CORS
allowlist contains both `http://localhost:3100` and
`https://language-player-admin.netlify.app`, and
`test_admin_cors_preflight_is_not_authenticated` is parametrized over both,
so the deployed admin origin cannot be dropped without a failing test
(ARCH-029 § 11.4).

### Channel detail & delete (2026-10-19)

- Backend: `python3.10 -m pytest test_admin_video_import.py` — 78 passed,
  including six new cases for `GET` / `DELETE /admin/channels/<id>` (stored
  count, 404/400, admin gate, L2-scoped deletion, lemma-cache cleanup).
- Bulk cache invalidation: `test_derived_data.py` adds four cases for
  `remote_cache.delete_many()` (chunking, local removal, swallowed remote
  failure) and the `utils_cache` / `utils_content` wiring; the combined run is
  90 passed.
- The PHP `delete-flask-cache-batch.php` endpoint mirrors
  `load-flask-cache-batch.php`; there is no PHP binary in the dev environment,
  so it was reviewed but not `php -l`-ed here.
- Admin: `tsc --noEmit` and ESLint pass for the changed files.
- Manual: no local admin account was available (`tester.mary` / `tester.bob`
  report `isAdmin: false`), so the detail page, delete confirmation and
  load-more flow still need one click-through by an admin.

### Three-phase import (2026-10-19)

- Backend: `python3.10 -m pytest test_admin_video_screening.py` — 22 passed;
  the combined `test_admin_video_import.py test_admin_video_preflight.py
  test_video_discovery.py` run stays at 99 passed.
- Real-data smoke checks against the local Supabase + YouTube:
  - `screen_videos('zh', ['dQw4w9WgXcQ'])` returned metadata (`PT3M34S`,
    `defaultAudioLanguage: en`) and `no_transcript` for the zh locale family,
    with `block_reason: locale_mismatch`;
  - an already-stored zh id (`tPy6JzKR7cs`) returned `in_db: true`,
    `checked_metadata: 0`, `transcript_status: stored`, and made no YouTube
    call.
  - Shorts filter: a `ja` discovery page containing `dr8_TBxMFSo` (29s),
    `hiN0hyvPnGA` (18s), `RRGTx5-HR5E` (1:36) and `tPy6JzKR7cs` (47:24)
    returned only the 47-minute video with `shorts_excluded: 3`.
  - transcript-only check: `check_transcripts_for_ids('ja',
    ['dr8_TBxMFSo'])` returned the auto-generated track with no metadata
    fetch or DB access.
  - the caption **list** cache is real: `load_from_caption_cache(
    'dQw4w9WgXcQ', type='list')` returned 6 tracks, and a second
    `list_transcripts_result` completed in ~0.0s from the local cache (154
    list entries on disk at the time of the check). Video metadata
    (`videos.list`) is **not** cached; it is fetched once in Discover and the
    Check phase does not re-fetch it.
- Admin: `tsc --noEmit` and ESLint pass.
- Manual: needs an admin account (none of the test users is an admin), so the
  full Discover → Check transcripts → Add click-through — listing, metadata
  progress, per-row transcript spinners, filter toggles, per-row Add and
  Add all — still needs one pass in the browser.
  Restart `next dev` after `sync-translations` (see the i18n note above).

## Known limitations

- **No single-video GET.** `GET /admin/videos/<id>` does not exist, so the
  edit dialog is fed from the loaded list row and there is no
  `/content/videos/<id>` deep link. Adding the endpoint is an Open Question.
- **Channel delete is L2-scoped, and only delete exists.** Deleting a channel
  removes its row and every video stored under it in the selected language;
  other languages' registrations are untouched. There is still no
  create/edit/hide path for `youtube_channels`.
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
  a clean panel means "nothing declared otherwise", not "verified". The
  import screen's panel is built from the screened rows (no separate
  preflight call); `/content/discover` still uses
  `POST /admin/videos/preflight` and audits a selection before importing.
- **The import discovery result set lives only in the browser.** There is no
  server-side job, so a reload loses the discovered rows; re-running is
  read-only and successful caption listings are cached. The add phase is
  unaffected — rows already imported stay in the DB.
- **The *Show* filters only run in the Add phase.** Discover and Check show
  every found row (with a hint saying so), because during those phases the
  admin is answering "did we find videos?" and "what did the transcript check
  say?", not narrowing an add set. The filters default to eligible-only once
  Check finishes.
- **The Check phase makes one request per video.** It uses
  `/admin/videos/transcripts`, so the spinner is exactly one row, but a
  500-video check is 500 small requests. Each is a caption listing or a cache
  hit; Stop/Continue and the cache keep it practical.
- **Video metadata is not cached.** Discover fetches `videos.list` once per
  video; the transcript-only Check does not re-fetch it. Re-running Discover
  does fetch metadata again. The caption **listings** are cached per video in
  the two-tier `caption` bucket (`list/<hash>`); only successful listings are
  stored and failures are not, so a Check re-run is near-instant for videos
  already listed.
- **Shorts detection is duration-based.** The Data API exposes no Shorts
  flag, so `SHORTS_MAX_SECONDS` (default 180s) is the proxy; a normal 2–3
  minute video is filtered too. Set the env var to 60 for classic short-form
  only.
- **The discovery transcript column is a track listing, not a transcript.**
  It proves a track in the L2 locale family exists; the add phase still
  enforces the 4-line minimum and can report `transcript_too_short`.
- **Auto-generated transcripts are shown but never addable here.** The table
  and `summary.auto_generated_transcript` include ASR, but eligibility
  requires `transcript.is_generated === false`. The importer itself still
  accepts ASR when called directly (ARCH-035), so this is a console policy,
  not a server-side rejection.
- **Already-in-DB rows skip YouTube entirely.** Their title/duration/locale
  come from the database and their transcript column shows `Stored` (or
  `Not checked` when `subs_l2` is empty), so the table cannot show their
  transcript locale.
- **"Add all eligible" ignores the *Show* filters by design.** It covers the
  full eligible result set, including rows not yet rendered by the infinite
  scroll and rows whose category is toggled off. Use the per-row *Add*
  buttons for a filtered subset. A row that becomes in-DB after an add is
  hidden again unless `Already in DB` is checked.
- **The screen endpoint caps at 50 ids; the console pages the slow work.**
  Discover uses 50-id metadata pages, Check uses **one id per request** (so
  exactly one spinner is visible), and Add uses **25-id** pages (each id
  downloads and scores a transcript inside the request). This keeps a
  request inside gunicorn's timeout and respects YouTube's rate limit; a
  500-video channel still takes many calls across the three phases. Listings
  are throttled (0.2s by default) and a rate-limited listing is retried once,
  but a sustained `/sorry/index` 429 still stops the check and leaves the rest
  for *Retry unchecked*.

## Open Questions

- Should `GET /admin/videos/<id>` be added so video editing gets a deep link
  (and `/content/videos/[id]` a real page)?
- Should `GET /admin/videos` return a total count (`meta.filter_count`) so the
  table can show "1–50 of N" and page properly?
- Should channel rows gain create/edit/hide in Flask now that delete exists,
  or should they stay a read-only mirror apart from deletion?
- Should duplicate detection (`youtube_id` / identical `subs_l2`, Classic's
  `db-audit`) be ported into the videos table as a highlighted flag?
- Should the importer remember "term X was searched on date Y" so discovery
  can skip already-searched terms (SPEC-098 Open Question)?
- Do we want Classic's subtitle tooling (SRT upload, `sync-srt`,
  break-lines, renumber-notes) in the admin console at all, or is subtitle
  authoring retired with the crawler?
- Should the sidebar group the maintenance-style screens (import / discover /
  sweep) separately from the browsing screens (videos / shows / channels)?
- Should discovery persist its screened rows (session storage or a table) so
  a reload or a very large channel can resume without re-screening? Deferred:
  the re-run is read-only and caption listings are cached, and a persisted
  result would need invalidation when the catalogue changes.
- Should the screening table offer row checkboxes (add a selected subset) in
  addition to per-row *Add* and *Add all eligible*? The current two paths
  cover "one" and "everything"; a middle path would need its own selection
  state and i18n.
- Should `/admin/videos/screen` list captions with a bounded worker pool
  (2–4) instead of serially? Faster on large channels, but needs a measured
  rate-limit trial before changing it.
