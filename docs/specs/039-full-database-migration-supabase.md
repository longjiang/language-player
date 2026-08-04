# SPEC-039: Full Database Migration — Directus → Supabase (Remaining Workstreams)

## Metadata
- **Spec ID**: SPEC-039
- **Feature**: Complete the Directus → Supabase migration: auth/users, remaining user-data columns, watch history/likes/playlists, notes, subscriptions/payments, content read-path cutover, Classic consolidation, and decommission
- **Status**: in-progress
- **Created**: 2026-08-04 (split out of SPEC-034)
- **ROADMAP Phase**: Phase 9: Backend Consolidation (cross-cutting)
- **See also**: [SPEC-034 (Saved Words, complete)](034-saved-words-supabase-migration.md), [SPEC-038 (Video Content, complete)](038-video-content-supabase.md), [ADR-0021 (Video Content)](../adr/0021-migrate-video-content-to-supabase.md), [ADR-0023 (Proxy GoTrue Through Flask)](../adr/0023-proxy-supabase-auth-through-flask.md), [SPEC-024 (Consolidate Directus Calls)](024-consolidate-directus-calls.md)

## Overview

Two major pieces are already done and verified:

- **Saved words** (SPEC-034, complete): all three apps on the row API,
  backfilled + reconciled, mirror/reconciler/sweep live.
- **Video content data** (SPEC-038, complete): all shards consolidated into
  Supabase with the ID-prefix contract; the Flask read path still needs
  cutover.

This spec covers everything that remains before Directus can be decommissioned:
auth/users, the remaining `user_data` JSON columns, watch history, likes,
playlists, channel preferences, notes, subscriptions/payments, the content
read-path cutover, Classic's remaining Directus calls, scaffolding teardown,
and the final decommission.

Directus is sunset **30 days after everything is transferred and thoroughly
tested** (T-complete + 30) — the window is an observation period, not a
countdown from the saved-words switch.

## Decisions

1. **Classic will be edited** (already started; the AGENTS.md reference-only
   rule is lifted for this migration).
2. **Directus sunset = T-complete + 30 days.** T-switch (saved words on the row
   API) is a milestone but does not start the clock. T-complete = every
   workstream here migrated AND the full cross-app test cycle passed.
3. **Auth = Supabase Auth (GoTrue) proxied through Flask** (ADR-0023). Clients
   never call GoTrue directly and do not import `supabase-js` during the
   transition.
4. **The saved-words blob mirror/reconciler/sweep are transitional
   scaffolding**, torn down at WS-8.
5. **PostgREST/RLS is not used during the migration** — Flask uses the
   service-role key; RLS later is a separate ADR.

### Migration Rules (2026-08-04)

1. **No legacy Flask endpoints for shape compatibility.** When the canonical
   API shape (e.g. `channelId`, new video ids) is what web/mobile use, Classic
   is updated to match — legacy duplicate endpoints are deleted once all
   clients are on the canonical route. Remaining legacy routes
   (`/user-watch-history`, `/save-watch-history`, `/user-likes`,
   `/watch-history/delete`) are deprecated and removed with WS-5/WS-8.
2. **Consolidated video ids everywhere.** `new_video_id = prefix(l2) *
   10^10 + old_video_id` is used consistently across APIs and clients; the
   only exception is the Flask video-lemmatization cache loader, which rebinds
   old cache keys via the deterministic transform (ADR-0021 / SPEC-038).
3. **Channel preferences are saved with `PUT /channel-preferences`** across
   web, mobile, and Classic (JWT auth, `channelId` key).
4. **Classic never reads Directus directly.** Every Classic data access goes
   through Flask; remaining Directus reads in Classic are migration debt and
   are removed by WS-5/WS-7/5.8 (currently videos/channels/tv shows/subs search
   + the zero-data saved-hits/collocations stores).

## Migration Scope (Remaining)

| Source (Directus) | Rows (approx.) | Target (Supabase) | Workstream |
|---|---|---|---|
| `directus_users` | 75,176 | `auth.users` + `auth.identities` (GoTrue) + `user_id_map` | WS-1 |
| `email_verification` | — | replaced by GoTrue email flows | WS-1 |
| `user_data` remaining columns (`progress`, `srs_progress`, `settings_v2`, `settings`, `saved_phrases`, `saved_hits`, `saved_collocations`, `bookshelf`, `history`) | ~106k rows | `user_progress`, `user_srs_cards`, `user_settings`, `user_saved_phrases`, etc. | WS-2 |
| `user_watch_history` | ~256k | `user_watch_history` (video-ID remap) | WS-3 |
| `user_likes` | ~7.7k | `user_likes` (remap) | WS-3 |
| `playlists` | ~3.2k | `user_playlists` (CSV → jsonb, video-id remap) | WS-3 |
| `user_channel_preferences` | ~176 | `user_channel_preferences` (user-id remap) | WS-3 |
| `text` (user notes) | ~20k | `user_notes` | WS-4 |
| `youtube_videos` + `video_embeddings` (already in Supabase, SPEC-038) | 1,045,422 each | read path switched from Directus to Supabase (no row migration) | WS-5 |
| `subscriptions` | ~31k | `user_subscriptions` | WS-6 |
| `user_acquisition` | small | `user_acquisition` | WS-6 |

Already in Supabase: video content family (SPEC-038) and saved words
(SPEC-034). Directus system tables (`directus_*`) are dropped at decommission.

## Current Architecture (As-Built)

| Layer | Auth | Data access |
|---|---|---|
| **Classic (Nuxt)** | nuxt-auth `local` strategy → Directus | Directus API directly: videos, channels, tv shows, subs search, PHP tools, remaining `user_data` blob PATCHes, likes, watch history, notes, subscriptions |
| **Web (Next.js)** | NextAuth → Flask `/auth/login` (Directus proxy) | Flask; three Next.js API routes still query Directus (`/api/videos/*`, `/api/channels/*`) per SPEC-024 |
| **Mobile (Expo)** | `AuthContext` → Flask `/auth/login` (Directus proxy) | Flask; one direct Directus call for watch-history delete (SPEC-024) |
| **Flask** | accepts Directus JWT; **base64-decodes without signature verification** (safe only because Directus validates downstream) | Directus for: auth, user_data, user_notes (`items/text`), subscriptions/payments, videos/channels/tv shows, plus `utils_subscription.py` and payment apps |

Flask's remaining Directus dependencies: `routes/auth.py`, `routes/user_data.py`,
`routes/user_notes.py`, `routes/video.py`, `utils_directus.py`,
`utils_subscription.py`, `app_stripe_checkout.py`, `app_paypal_checkout.py`,
`app_in_app_purchase.py`, `app_email_verification.py`, `app_directus.py`.

## Target Architecture

Transition (until T-complete): Flask is the single gateway; Directus stays
alive only as auth import source, old-Classic bundle blob store, and
not-yet-cut-over paths. Permanent (after decommission): Flask → Supabase +
GoTrue (proxied); no Directus, no client SDKs.

## Workstreams

### WS-0 — Saved Words (pilot) — COMPLETE

See [SPEC-034](034-saved-words-supabase-migration.md). The mirror/reconciler/
sweep scaffolding remains until WS-8.

### WS-1 — Auth & Users (ADR-0023)

**Target**: all three apps authenticate via Flask → GoTrue; Directus JWTs gone.

**Investigation findings (2026-08-04):**

- Directus has **75,176 users**, all `$2y$10$` bcrypt (60 chars); statuses:
  29,691 active, 45,199 draft, 281 inactive, 5 suspended.
- **GoTrue verifies Directus `$2y$` hashes natively** (end-to-end test with
  Mary's real hash → login 200). **No forced password reset needed**.
- `public.user_id_map(directus_user_id bigint PK, auth_user_id uuid UNIQUE,
  email, imported_at)` created.
- Schema notes: `auth.users.confirmed_at` and `auth.identities.email` are
  generated columns; `auth.users` requires only `id` — but GoTrue scans
  `confirmation_token`, `recovery_token`, `email_change_token_new`, and
  `email_change` as strings, so they must be `''`, not NULL, or login fails
  with "Database error querying schema". `auth.identities.provider_id` is the
  user id (not the email), and `identity_data` should include
  `email_verified`/`phone_verified`.
- **Import policy resolved:** draft → `email_confirmed_at = NULL` (must verify
  before login); active → confirmed; inactive/suspended →
  `banned_until = 'infinity'`; admin = Directus role 1 (4 users) →
  `raw_app_meta_data.is_admin`. Roles 0/2/3/4 → regular (role 4's legacy "Pro"
  is superseded by subscriptions).
- Importer: `zerotohero-python-server/tmp/supabase-auth-import.py` — dry-run by
  default, idempotent, bulk inserts; 50-user smoke import applied and verified
  (auth.users = identities = user_id_map = 50). **Full import applied
  (2026-08-04): 75,177 users, counts match Directus; Mary/Bob login through
  GoTrue with existing passwords verified (200 + access token).**
- **Email-uniqueness audit (complete)**: 75,177 emails, zero case-insensitive
  duplicates; `auth.users` distinct count matches exactly.
- **Draft-user UX (decided)**: GoTrue rejects unconfirmed logins
  (`email_not_confirmed`); Flask surfaces that error and clients show a
  "verify your email" state with resend; Supabase email template/SMTP config is
  a 5.7 prerequisite.
- **`is_admin` consumption (decided)**: Flask `@admin_required` reads
  `app_metadata.is_admin` from the verified Supabase JWT; `/auth/login`
  includes `isAdmin` in the user payload for Classic `VideoAdmin.vue`.

**Sub-phase 5.1 is COMPLETE.**

**Cutover work (5.7):**

1. Full user import (`--apply`), then `--verify` (counts + Mary/Bob login).
2. Flask `/auth/*` endpoints forward to GoTrue (keep `{ token, user }` shape).
3. PyJWT verification middleware (HS256, `SUPABASE_JWT_SECRET`, `exp`) — remove
   the base64-decode-without-verify pattern from `user_data.py`, `auth.py`,
   `user_notes.py`.
4. Clients: web keeps NextAuth; mobile keeps AuthContext; Classic retargets
   nuxt-auth to Flask.
5. **One-time user-id remap** of `user_saved_words` and all WS-2/3/4/5 tables
   from Directus ids to `auth.users.id` via `user_id_map`.
6. Email verification flows → GoTrue; delete-account → GoTrue admin delete +
   cascade.

### WS-2 — Remaining User-Data Columns

Follow the SPEC-034 row pattern:

| Column | Target table | Notes |
|---|---|---|
| `progress` | `user_progress(user_id, l2, level, time_ms, weekly_hours jsonb, updated_at)` | One row per (user, language) |
| `srs_progress` | `user_srs_cards(user_id, l2, word_id, state jsonb, updated_at)` | Same word-id scheme as saved words |
| `settings_v2` + Classic `settings` | `user_settings(user_id, settings jsonb, updated_at)` | Merge legacy Classic settings |
| `saved_phrases` | `user_saved_phrases` row table | Same CRUD pattern as WS-0 |
| `saved_hits`, `saved_collocations` | row tables or JSONB per user | Verify Classic usage first |
| `bookshelf` | `user_bookshelf` | Small; JSONB acceptable |
| `history` | folded into `user_progress` or own rows | Verify Classic `store/history.js` |

`GET /user-data` / `POST /user-data/sync` stay alive until every field moves;
each field is removed from `_USER_DATA_SYNC_FIELDS` as its client switch lands.

**Progress (2026-08-04):**

- ✅ Schema created (7 tables) and **full backfill applied + verified**:
  `user_progress` 53,024, `user_settings` 39,705, `user_saved_phrases` 61,295,
  `user_history` 16,790, `user_bookshelf` 2,019, `user_srs_cards` 573,
  `user_srs_settings` 2. Mary spot-check passed (settings row + 3 progress
  rows).
- Tool: `zerotohero-python-server/tmp/supabase-user-data-migrate.py`
  (idempotent, dry-run/apply/verify; dedupes in-batch duplicates, coerces
  bigint-safe numerics, md5 functional index on phrases for >1KB entries).
- **Known loss (source-side)**: users 19015, 35423, 35424, 35428 have Classic
  `settings` truncated at the MySQL TEXT limit (65,528 chars → invalid JSON in
  Directus itself); not recoverable from the source.
- `saved_hits` / `saved_collocations`: zero data in production — not migrated.
- ✅ Flask row endpoints (progress/SRS/settings/phrases/bookshelf/history)
  deployed; web, mobile, and Classic all hydrate/write through them; `meta`
  jsonb preserves Classic's full phrase objects; `_USER_DATA_SYNC_FIELDS`
  trimmed to `("saved_words",)`.
- ✅ Classic history + bookshelf stores switched to Flask (their data was
  already backfilled). `saved_hits`/`saved_collocations` remain Directus-only
  (zero data in production) and are dropped/deferred at 5.8.

**Sub-phase 5.2 is COMPLETE.**

### WS-3 — Watch History, Likes, Playlists, Channel Preferences

`user_watch_history` and `user_likes` carry old per-shard video ids and need
the SPEC-038 remap:

```text
new_video_id = prefix(l2) * 10^10 + old_video_id
```

Targets:

- `user_watch_history` — `(user_id, video_id bigint remapped, last_position,
  date, unique(user_id, video_id))`.
- `user_likes` — `(user_id, video_id bigint remapped, l2 text, created_on,
  unique(user_id, video_id))`.
- `user_playlists` — `(user_id, title, l2 text, videos jsonb, created_on)`.
  The Directus `videos` column is **not a plain id CSV** — it is a header CSV
  (`id,youtube_id,title,duration`, CRLF, RFC4180-quoted titles, one row per
  video, verified on 2,605 playlists). Backfill parses it with the Python `csv`
  module into a JSONB array of `{ id, youtube_id, title, duration }`, remapping
  `id` via the SPEC-038 formula when numeric (missing ids stay `null`).
  Classic's playlist store gets a CSV↔JSON adapter at WS-7; the Flask
  `/playlists` endpoint speaks JSONB.
- `user_channel_preferences` — `(user_id, channel_id text, l2 text, status,
  unique(user_id, channel_id, l2))`. **No video-ID remap**: `channel_id` is a
  YouTube channel handle string (e.g. `UCzXjPL7zo0bxhOYDxLJ9YEg`), not a
  `youtube_channels.id` — stored as-is. (Note: `youtube_channels` itself was
  copied with original IDs per SPEC-038 — it is **not** id-prefixed — so any
  genuine channel-id references need no transformation either.)

Flask endpoints: `/watch-history` GET/POST/DELETE, `/likes` PUT/DELETE/GET,
`/playlists` CRUD.

**Progress (2026-08-04):**

- ✅ Schema + **full backfill applied + verified**: `user_watch_history`
  204,368 (deduped to latest per user+video), `user_likes` 7,170,
  `user_playlists` 2,609 (CSV → JSONB, ids remapped; 1,062 legacy entries with
  missing ids preserved as null), `user_channel_preferences` 179.
- ✅ Flask endpoints (`/watch-history`, `/likes`, `/playlists`,
  `/channel-preferences`) with legacy-id remap (ids < 10^10 remapped via
  `prefix(l2) * 10^10 + old_id`); the existing client-facing routes
  (`/user-watch-history`, `/save-watch-history`, `/user-likes`,
  `/user-channel-preferences`, `/save-channel-preference`,
  `/watch-history/delete`) are **repointed at Supabase**, so web/mobile call
  sites are unchanged.
- ✅ Classic `watchHistory.js` and `userLikes.js` switched to the row
  endpoints (old per-shard ids remapped server-side).
- ✅ Classic `store/playlists.js` switched to Flask `/playlists` (l2-filtered
  GET, create/update/delete, single-playlist GET; videos are JSONB arrays —
  CSV↔JSON conversion dropped).
- ✅ **Channel preferences moved to canonical `GET/PUT /channel-preferences`
  on web, mobile, and Classic** (`channelId` key, JWT auth, PUT to save);
  legacy `/user-channel-preferences` + `/save-channel-preference` routes
  deleted (Migration Rule 1 & 3).
- ✅ **WS-3 `l2` normalization (2026-08-04)**: the backfill stored Directus
  language ids as text (`'1824'`, `'2780'`) in `user_likes` (7,170 rows),
  `user_playlists` (2,609), and `user_channel_preferences` (179). All three
  were converted to ISO codes so code-keyed APIs (recommendations'
  not-interested/subscribed filtering, likes, playlists) match. Defensive
  numeric-id handling added to the data layer for any stragglers.
- ⏳ Legacy watch/likes GET routes (`/user-watch-history`, `/user-likes`)
  remain with old-id projections until WS-5 (Rule 2); web/mobile recorder +
  watch-history pages still use `/save-watch-history` and
  `/watch-history/delete` until WS-5.

**Sub-phase 5.3 is COMPLETE.**

### WS-4 — Notes / User Texts — COMPLETE

`routes/user_notes.py` now serves CRUD from Supabase `user_notes(id, user_id,
l2, title, text, translation, created_on, updated_at)` with the same API shape
as the old Directus `items/text` proxy (`l2` returned as the Directus internal
language id; `owner` = Directus user id until the 5.7 remap).

**Progress (2026-08-04):**

- ✅ `user_notes` DDL + **full backfill applied + verified** (16,594 notes;
  NUL-stripped; Directus ids during transition). Tool:
  `zerotohero-python-server/tmp/supabase-notes-migrate.py`.
- ✅ Flask `/user-notes` GET list / GET one / POST / PATCH / DELETE on Supabase
  (JWT auth identical to `user_data_columns.py`); `test_notes.py` covers auth,
  validation, and CRUD paths.
- ✅ Classic `store/savedText.js` retargeted to Flask `/user-notes`
  (web/mobile were already calling Flask through `@langplayer/api-client`).

**Sub-phase 5.4 is COMPLETE.**

### WS-5 — Content Read-Path Cutover (SPEC-038 completion) — COMPLETE

**Progress (2026-08-04):**

1. ✅ New `utils_content.py` Supabase read layer (videos, channels, tv_shows,
   talks, counts, subs search, recommendation joins). Response shapes keep the
   old Directus fields (`youtube_id`, `channel_id`, `l2` as Directus id) with
   **consolidated `id`s**; old per-shard ids (< 10^10) are accepted and remapped
   when `l2` is supplied.
2. ✅ `routes/video.py` + `routes/tv_shows.py` serve `/videos`,
   `/videos/subtitles`, `/search-videos`, `/subs-search`,
   `/channels/<id>/videos`, `/tv-shows`, `/talks`, episode lists, `/channels`,
   `/videos/count`, `/videos/random`, and `/videos/id/<id>` from Supabase.
3. ✅ Recommendations (`app_recommendations.py`) read Supabase: liked videos,
   viewed ids, channel preferences, and the discovery pool (random + popular +
   unique-channel modes).
4. ✅ Web/mobile watch-history recorder + pages switched to canonical
   `GET/POST /watch-history` and `DELETE /watch-history/<id>`; Classic
   `watchHistory.js` and `userLikes.js` switched to canonical
   `/watch-history` + `/likes` (joined video metadata included so the row API
   is self-sufficient). Legacy routes `/user-watch-history`,
   `/save-watch-history`, `/user-likes`, `/watch-history/delete` **deleted**.
5. ✅ Classic video reads move to Flask: `plugins/directus.js` (`getVideo`,
   `getVideos`, `checkShows`, `countShowEpisodes`, `getRandomEpisodeYouTubeId`
   with a Directus-filter → `/search-videos` adapter), `store/shows.js`,
   `store/channels.js`, `store/stats.js`, `show/_type/_id.vue`,
   `discover-shows.vue`, `feed.vue`, `lesson-videos.vue`,
   `tutoring/lesson/_id.vue`, `Shows.vue`, `MediaSearchResults`, and the
   browse/subscriptions pages (all through the adapter). Admin-only Directus
   reads (VideoAdmin, db-audit, ngram, analytics, count-all.php) remain as 5.8
   debt.
6. ✅ PHP tools replaced: `count.php` → `/videos/count`; `video/{suffix}/{id}`
   → `/videos/id/<id>`; `videos` (PHP) → `/search-videos` + `/subs-search`.
7. ⏳ Subs-search runs on Postgres `ILIKE` (functional; `pg_trgm` extension is
   now enabled in Supabase). The GIN trigram index on `subs_l2` is **not yet
   built** — it is long-running DDL on ~6.6 GB and needs a direct connection or
   the Supabase SQL editor. Script:
   `zerotohero-python-server/tmp/supabase-subs-search-index.sql`. Until built,
   caption searches are full scans (~seconds for common terms) — acceptable for
   admin use, but should be indexed before decommission.
8. ✅ **Vector recommendations switched on (2026-08-04).** `/recommend-videos`
   and `/recommend-music-entertainment` use the pgvector pipeline
   (`video_embeddings`, `gemini-embedding-2@1024`, HNSW cosine) ported from the
   `tmp/supabase-test/recommend.py` prototype: user preference vector from
   likes/watch history (Supabase), difficulty-band widening via
   `DIFFICULTY_PROFILE`, pool-size tiering, per-channel cap, cold-start seeds
   per category mode. The legacy SQL pipeline is retained as a fallback; the
   old pipeline can be restored by flipping the wrapper functions.

### WS-6 — Subscriptions & Payments

`subscriptions` (~31k rows) gates Pro features → `user_subscriptions` (same
fields); `user_acquisition` as-is. Cut over `utils_subscription.py`,
`/user-subscription`, and the Stripe/PayPal/IAP apps; webhooks keep writing via
Flask; verify Pro gating before T-complete.

### WS-7 — Classic Directus Call Consolidation

Auth (`nuxt.config.js`), user-data stores (`savedPhrases`, `settings`,
`history`, `watchHistory`, `userLikes`, `savedText`, `directus.js`), video
components (`MediaSearchResults`, `YouTubeVideoCard`, `VideoAdmin`, `stats`),
subscriptions, and `delete-account` — each retargets to Flask.

### WS-8 — Scaffolding Teardown & Decommission

1. After no old-Classic bundles remain and all workstreams are live: stop
   mirror + reconciler + sweep, drop `user_saved_word_sync` +
   `saved_words_sweep_state`, remove `saved_words` from `_USER_DATA_SYNC_FIELDS`.
2. Freeze Directus writes; final full export archived off-box.
3. Zero Directus traffic for 7 consecutive days.
4. Cut DNS; remove Directus credentials and `directus_*` code paths.

## Phased Migration Plan

### Definitions

- **T-switch** = saved words fully on the row API (SPEC-034, achieved). A
  milestone, not a deadline.
- **T-complete** = every workstream here migrated AND the full cross-app test
  cycle passed. The 30-day sunset window starts here.
- **T+30** = decommission deadline = T-complete + 30 days.

### Phases 0–4 (Saved Words) — COMPLETE

See SPEC-034. T-switch achieved 2026-08-04.

### Phase 5 — Remaining Workstreams (T-switch → T-complete)

No fixed calendar, and workstreams run **sequentially** (5.1 → 5.2 → … → 5.9)
so each is fully verified before the next starts:

| Sub-phase | Workstream | Timing | Dependency |
|---|---|---|---|
| 5.1 | Auth investigation + import prep (bcrypt test, `user_id_map`) | **COMPLETE** — full import applied + verified | None |
| 5.2 | Remaining user-data columns | **COMPLETE** | 5.1 |
| 5.3 | Watch history / likes / playlists | **COMPLETE** | 5.2 |
| 5.4 | Notes | **COMPLETE** | 5.3 |
| 5.5 | Content read-path cutover (WS-5) | **COMPLETE** | 5.4 |
| 5.6 | Subscriptions & payments (WS-6) | After 5.5 | 5.5 |
| 5.7 | Auth cutover (GoTrue tokens in all apps; one-time user-data remap) | After 5.6 | 5.1, 5.2–5.6 |
| 5.8 | Classic Directus consolidation | After 5.7 | 5.7 + 5.5 |
| 5.9 | Full test cycle → 30-day sunset window → scaffolding teardown + decommission | Last | All of the above |

### Sub-phase details

#### 5.1 — Auth investigation + import prep (in progress)

**Goal**: remove every unknown from the auth migration before the cutover.

Steps:
1. ✅ Inventory (75,176 users, all `$2y$10$`), ✅ bcrypt compatibility test
   (COMPATIBLE — no forced reset), ✅ `user_id_map` created, ✅ importer
   written + 50-user smoke applied.
2. Audit email uniqueness (Directus duplicates / case variants) against the
   `auth.users` unique index; decide handling (skip duplicates, report list).
3. Decide draft-user verification UX: GoTrue rejects unconfirmed logins — the
   Flask login response and web/mobile/Classic flows must surface "verify your
   email" and offer a re-send.
4. Define `is_admin` consumption: Flask route guard + Classic `VideoAdmin.vue`
   gate read `raw_app_meta_data.is_admin` (set during import).
5. Full import (`--apply`) + `--verify` (counts, Mary/Bob mapping, real GoTrue
   login for both).

**Acceptance**: 75,176 auth.users + identities + user_id_map rows; count
matches; Mary/Bob log in through GoTrue with their existing passwords; zero
duplicate-email import errors.

**Rollback**: import is additive (no client impact until 5.7) — delete the
imported rows via `user_id_map` and rerun later.

#### 5.2 — Remaining user-data columns

**Goal**: move `progress`, `srs_progress`, `settings_v2` (+ Classic `settings`,
`saved_phrases`, `saved_hits`, `saved_collocations`, `bookshelf`, `history`)
to row tables, one field at a time.

Steps:
1. DDL for `user_progress`, `user_srs_cards`, `user_settings`,
   `user_saved_phrases`; decide JSONB-vs-rows for the small Classic-only
   columns (open question 3).
2. Idempotent backfill scripts (MySQL → Supabase, SPEC-034 pattern) keyed on
   Directus user ids (remap at 5.7).
3. Flask row CRUD per field (GET/PUT/DELETE), same shape as WS-0.
4. Client switch per field: web hooks (`use-srs`, `use-progress`,
   `use-settings`), mobile equivalents, Classic stores (`settings.js`,
   `progress.js`, `savedPhrases.js`).
5. Remove each migrated field from `_USER_DATA_SYNC_FIELDS` after its switch.

**Acceptance per field**: counts match Directus; Mary/Bob regression on the
field across web/mobile/Classic; old blob path removed for that field.

**Rollback**: revert the client + keep `/user-data/sync` for fields not yet
migrated.

#### 5.3 — Watch history / likes / playlists / channel preferences

**Goal**: migrate the video-referencing user tables with the SPEC-038 ID remap.

Steps:
1. Backfill `user_watch_history` (~256k), `user_likes` (~7.7k),
   `user_playlists` (~3.2k, remap ids inside `videos` JSON), and
   `user_channel_preferences` (~176) with
   `new_video_id = prefix(l2) * 10^10 + old_video_id`.
2. Validate the remap: zero collisions, zero unmapped l2 codes, join checks
   against `youtube_videos`.
3. Flask endpoints: `/watch-history` GET/POST/DELETE (extends the existing
   `/watch-history/delete`), `/likes` PUT/DELETE/GET, `/playlists` CRUD,
   channel-preferences endpoints.
4. Client switches: mobile watch-history delete (SPEC-024 M7 removal), Classic
   `watchHistory.js`, `userLikes.js`, `store/stats.js` where it reads likes.

**Acceptance**: counts match; every remapped video id resolves to an existing
`youtube_videos` row; delete/add propagate across apps.

**Rollback**: revert endpoints; old Directus paths stay until cutover.

#### 5.4 — Notes / user texts

**Goal**: point the notes feature at Supabase.

Steps:
1. `user_notes` DDL; backfill ~20k rows from Directus `text` (Directus ids
   during transition).
2. Point `routes/user_notes.py` CRUD at Supabase with the same API shape.
3. Classic `store/savedText.js` retargets to Flask.

**Acceptance**: create/read/update/delete notes works on Classic and web
(notes reader); counts match; Mary/Bob round-trip.

**Rollback**: revert `user_notes.py` to the Directus proxy.

**Progress (2026-08-04):** all steps ✅ — 16,594 notes backfilled + verified;
Flask `/user-notes` CRUD on Supabase (shape-compatible, `l2` → Directus id,
`owner` = Directus user id); Classic `savedText.js` on Flask; web/mobile were
already on Flask. **Sub-phase 5.4 is COMPLETE.**

#### 5.5 — Content read-path cutover (SPEC-038 completion / WS-5)

**Goal**: Flask serves videos/channels/tv shows from Supabase.

Steps:
1. `routes/video.py`, `routes/tv_shows.py`, and channel/talk lookups read
   Supabase; old→new id mapping helper (accept old ids during transition).
2. Web Next.js API routes (`/api/videos/*`, `/api/channels/*`) call Flask
   (SPEC-024), keeping `next: { revalidate }` caching.
3. Update web watch URLs, mobile routes, and Classic video pages to the
   consolidated ids.
4. Subs-search: pg_trgm on `subs_l2` (interim) or embeddings; Flask
   `/subs-search` reads Postgres.
5. Replace PHP tools (`count.php`, `video/{suffix}/{id}`, `videos`) with Flask
   endpoints (`/videos/count`, `/videos/{id}`, etc.).

**Acceptance**: watch page, channel pages, tv-show pages, and subs-search work
from Supabase; old ids still resolve during transition; row counts match.

**Rollback**: revert the Flask read layer to Directus (data stays dual-write
until decommission).

**Progress (2026-08-04):** all steps ✅ except the pg_trgm GIN index build
(extension enabled; index DDL scripted — see WS-5 note). Content reads,
recommendations, subs-search, PHP-tool replacements, and all three clients are
on Supabase/Flask with consolidated ids; legacy watch/likes routes deleted.
**Sub-phase 5.5 is COMPLETE.**

#### 5.6 — Subscriptions & payments (WS-6)

**Goal**: Pro gating no longer depends on Directus.

Steps:
1. `user_subscriptions` + `user_acquisition` DDL and backfill (~31k rows).
2. Cut over `utils_subscription.py` and `/user-subscription`.
3. Cut over Stripe/PayPal/IAP apps (`app_stripe_checkout.py`,
   `app_paypal_checkout.py`, `app_in_app_purchase.py`); webhooks write via
   Flask into Supabase.
4. Free-vs-Pro regression matrix on web/mobile/Classic (limits, saved-words
   transcript access, dictionary features).

**Acceptance**: `/user-subscription` returns correct state for Mary/Bob and
paid test accounts; webhook events upsert rows; no payment regressions.

**Rollback**: revert payment modules; keep Directus subscriptions until the
cutover is proven.

#### 5.7 — Auth cutover (the remap step)

**Goal**: all three apps authenticate through Flask → GoTrue, and every
user-data row is re-keyed to `auth.users.id`.

Steps:
1. Prereq: full import complete (5.1).
2. Flask `/auth/login|register|password-*|verify-email|delete-account` →
   GoTrue (same `{ token, user }` shape).
3. PyJWT middleware: verify Supabase JWT signature (HS256,
   `SUPABASE_JWT_SECRET`) + `exp` on every authenticated request; remove the
   base64-decode-without-verify pattern from `user_data.py`, `auth.py`,
   `user_notes.py`.
4. Clients: web NextAuth (same Flask URL), mobile AuthContext (same Flask
   URL), Classic nuxt-auth retargeted to Flask.
5. **One-time remap**: `UPDATE user_saved_words` and every WS-2/3/4/5 table
   `user_id` → `auth_user_id` via `user_id_map`; orphan check (0 unmapped).
6. Email verification flows → GoTrue; delete-account → GoTrue admin delete +
   cascade; `is_admin` gating live.

**Acceptance**: login/register/reset/verify/delete work on all apps; Mary/Bob
see their existing saved words after the remap; old Directus tokens are
rejected by Flask.

**Rollback**: revert Flask auth + client token sources; remap is reversible via
`user_id_map` (map back to Directus ids).

#### 5.8 — Classic Directus consolidation

**Goal**: Classic has zero Directus calls.

Steps:
1. Auth (done in 5.7), then user-data stores (`savedPhrases`, `settings`,
   `history`, `watchHistory`, `userLikes`, `savedText`), video components
   (`MediaSearchResults`, `YouTubeVideoCard`, `VideoAdmin`, `stats`),
   subscriptions, `delete-account` — one area at a time.
2. Each switch: retarget to the Flask endpoint, Mary/Bob regression.
3. Remove `DIRECTUS_URL`/`LP_DIRECTUS_TOOLS_URL` usage; monitor Classic
   traffic.

**Acceptance**: zero Directus references in Classic source; full feature
regression passes.

**Rollback**: revert the individual store/component.

#### 5.9 — Test cycle → 30-day sunset window → teardown + decommission

**Goal**: prove the migration, observe it, then turn Directus off.

Steps:
1. **T-complete gate**: full cross-app test matrix (login, saved words, SRS,
   progress, settings, watch history, likes, playlists, notes, subscriptions,
   videos, search) on web/mobile/Classic with Mary/Bob + paid test accounts.
2. **30-day window**: monitor error rates, reconcile diffs, and Directus
   traffic; require 7 consecutive days of zero Directus traffic.
3. **Teardown**: stop the sweep cron, remove mirror/reconciler code, drop
   `user_saved_word_sync` + `saved_words_sweep_state`, remove `saved_words`
   from `_USER_DATA_SYNC_FIELDS`.
4. **Decommission**: freeze writes, final full MySQL export archived off-box,
   cut DNS, remove Directus credentials from Flask `.env`, delete
   `directus_*`-dependent code paths.

**Acceptance**: sunset readiness checklist all green; decommission at T+30 with
an archived backup.

**Rollback**: not applicable (point of no return) — the archived backup and
`user_id_map` are the recovery artifacts.

**Sunset readiness checklist (all must pass during the 30-day window,
T-complete → T+30):**

- [ ] All three apps authenticate through Flask → GoTrue (no Directus auth).
- [ ] Every remaining table migrated with matching counts; user-data remapped
  to `auth.users.id`.
- [ ] Full cross-app test cycle passed (Mary/Bob + regression on all apps).
- [ ] Zero `DIRECTUS_URL` / `directusvps` references in any app source.
- [ ] Zero Directus traffic for 7 consecutive days.
- [ ] Saved-words scaffolding removed.
- [ ] Final Directus backup archived off-box; credentials removed from `.env`.

### Phase 6 — Post-Sunset

Embedding-based video search (pgvector), optional RLS (separate ADR), drop
legacy columns and old-id accept-and-map code.

## Edge Cases

- Old-Classic stale blobs: covered by the SPEC-034 diff reconciler.
- User-id remap: every user table joins through `user_id_map`; orphan check
  (unmapped user ids = 0) after each migration.
- Video-ID remap: deterministic prefix function; count/join verification; keep
  old-id mapping view until decommission.
- Draft users must verify email before login (GoTrue blocks unconfirmed).
- Payments/Pro gating must be verified before decommission.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration drags on / testing gaps | Medium | High | Parallel workstreams; T-complete gated on the test cycle; no fixed calendar |
| Auth import breaks passwords | Low (tested) | High | `$2y$` verified compatible; `user_id_map` for recovery; smoke import applied |
| Payments/Pro gating broken at sunset | Low | High | WS-6 before T-complete; free-vs-Pro regression across apps |
| Video-ID remap errors | Medium | Medium | Deterministic prefix; count/join verification; old-id mapping view until decommission |
| Classic regressions while consolidating | Medium | High | One area at a time; Mary/Bob regression per sub-phase |
| Subs-search replacement not ready | Medium | Medium | pg_trgm interim; ship before WS-8 |
| Old Classic bundles linger | Medium | Low–Medium | SPEC-034 scaffolding; monitor blob PATCH traffic |

## Success Criteria

1. Every remaining table in Supabase with matching counts and zero orphaned
   user ids (after the 5.7 remap).
2. All three apps authenticate and use every migrated feature through Flask.
3. Zero Directus traffic for 7 consecutive days; decommission at T+30 with an
   archived final backup.
4. Zero planned downtime; every phase rolls back with a revert.

## Dependencies

- `docs/specs/034-saved-words-supabase-migration.md` — pilot, scaffolding,
  conflict semantics
- `docs/specs/038-video-content-supabase.md` +
  `docs/adr/0021-migrate-video-content-to-supabase.md` — content data + ID
  contract
- `docs/adr/0023-proxy-supabase-auth-through-flask.md` — auth decision
- `docs/specs/024-consolidate-directus-calls.md` — Flask-as-single-gateway
- `tmp/supabase-test/supabase-migrate.py`, `tmp/db-backup/`, and the SPEC-034
  migration tools — patterns and verification reference

## Open Questions

1. Subs-search replacement: pg_trgm interim or embeddings before sunset?
2. Classic PHP tools: which `LP_DIRECTUS_TOOLS_URL` endpoints are still used?
3. Classic legacy columns (`saved_hits`, `saved_collocations`, `bookshelf`,
   `history`): row-level or JSONB until Classic retires?
4. Email verification: GoTrue-native flows vs Flask codes?
5. Rollout signal for old-Classic bundles (for scaffolding teardown).
6. Anonymous-local merge on web first login: ship or keep server-wins?
