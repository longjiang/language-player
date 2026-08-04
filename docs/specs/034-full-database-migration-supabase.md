# SPEC-034: Full Database Migration — Directus → Supabase (30-Day Sunset)

## Metadata
- **Spec ID**: SPEC-034
- **Feature**: Migrate the entire Directus-backed database and every API path that touches it to Supabase, using saved words as the pilot workstream, with a Directus sunset 30 days after the full migration is transferred and thoroughly tested
- **Status**: draft
- **Created**: 2026-08-02
- **Updated**: 2026-08-03 — expanded from saved-words-only to full-database migration; auth decision resolved by ADR-0023 (proxy GoTrue through Flask)
- **ROADMAP Phase**: Phase 9: Backend Consolidation (cross-cutting)

## Overview

Everything that currently lives in Directus 8 (MySQL) moves to Supabase
(Postgres): content tables (already migrated per ADR-0021, pending the Flask
read-path cutover), auth/users, subscriptions, and every user-data table —
saved words, progress, SRS, settings, watch history, likes, playlists, and notes.
Classic is edited to call Flask instead of Directus APIs, and Directus is
decommissioned **30 days after the full migration is transferred and thoroughly
tested** (T-complete + 30 — the sunset window is an observation period, not a
countdown from the saved-words switch).

The migration is workstream-based. Saved words is the pilot:
it proves the row-level pattern, the blob mirror/reconciler scaffolding, and the
client switch mechanics on one feature before the rest of the user data follows
the same playbook. Flask remains the single API gateway for all three apps
(web, mobile, Classic), and Supabase Auth (GoTrue) is proxied through Flask per
ADR-0023.

The row API is **unconditional**: web and mobile are pre-launch, so there are no
client-side feature flags — both apps always use `/saved-words`, and the legacy
full-blob sync path has been removed from their code. Classic's new bundle also
uses the row API (Phase 4); the Directus blob mirror + reconciler exist only to
cover old Classic bundles during rollout.

## Decisions

1. **Classic will be edited.** The AGENTS.md "reference-only / never edit" rule
   for `zerotohero-nuxt/` is lifted for this migration. Classic's saved-words
   store is changed first (pilot), and the rest of Classic's Directus surface is
   migrated within the sunset window (WS-7).
2. **Directus sunset = T-complete + 30 days.** T-switch (all three apps on the
   saved-words row API) is a milestone but does **not** start the clock.
   T-complete is the point where every Phase 5 workstream has been migrated
   **and** the full cross-app test cycle passes; the 30-day sunset window is an
   observation period (stability, zero Directus traffic, final backup) before
   decommission.
3. **Auth = Supabase Auth (GoTrue) proxied through Flask** (ADR-0023). Flask
   forwards login/refresh/account flows to GoTrue and verifies the Supabase JWT
   signature on every request. Clients never call GoTrue directly and do not
   import `supabase-js` during the transition.
4. **The saved-words blob mirror and reconciler are transitional scaffolding
   only**, torn down before Directus is decommissioned.
5. **PostgREST/RLS is not used during the migration.** Flask accesses Supabase
   with the service-role key. RLS may be adopted later as defense-in-depth, but
   it is a separate ADR.

## Migration Scope (Table Inventory)

Source of truth for the inventory: `tmp/db-backup/20260802_233147/backup.sql`
(MySQL dump) and the ADR-0021 loader (`tmp/supabase-test/supabase-migrate.py`).

### Already in Supabase (ADR-0021) — pending Flask read-path cutover (WS-6)

`youtube_videos` (consolidated from 14 shards, IDs prefixed), `phrasebooks`,
`youtube_channels`, `talks`, `tv_shows`, `articles`, `resources`, `pages`,
`heroes`, `drills`, `exams`, `reading`, `communities`, `subreddits`,
`tutoring_kit`, `unavailable_videos`, `languages` (l2 columns converted to ISO
codes).

### To migrate in this spec

| Source (Directus) | Rows (approx.) | Target (Supabase) | Workstream |
|---|---|---|---|
| `directus_users` | ~100k+ | `auth.users` + `auth.identities` (GoTrue) | WS-1 |
| `user_data` (all 10 JSON columns) | ~106k | `user_saved_words` + instances, `user_progress`, `user_srs_cards`, `user_settings`, `user_saved_phrases`, etc. | WS-0, WS-2 |
| `user_watch_history` | ~256k | `user_watch_history` (remapped video ids) | WS-3 |
| `user_likes` | ~7.7k | `user_likes` (remapped) | WS-3 |
| `playlists` | ~3.2k | `user_playlists` (remapped) | WS-3 |
| `user_channel_preferences` | ~176 | `user_channel_preferences` (user-id remap) | WS-3 |
| `text` (user notes) | ~20k | `user_texts` | WS-4 |
| `subscriptions` | ~31k | `user_subscriptions` | WS-5 |
| `user_acquisition` | small | `user_acquisition` | WS-5 |
| `email_verification` | — | replaced by GoTrue email flows | WS-1 |

### Not migrated as-is (dropped at sunset)

Directus's system machinery is not copied table-for-table:
`directus_sessions`, `directus_roles`, `directus_permissions`,
`directus_collections`, `directus_fields`, `directus_relations`,
`directus_activity`, `directus_revisions`, `directus_webhooks`,
`directus_settings`, `directus_files`, `directus_folders`,
`directus_migrations`, `directus_collection_presets`, and the MySQL-only shard
structure.

## Current Architecture (As-Built)

### Writers / Readers

| Layer | Auth | Data access |
|---|---|---|
| **Classic (Nuxt)** | nuxt-auth `local` strategy → Directus `auth/authenticate`, `auth/refresh` (`nuxt.config.js`) | Directus API directly: videos, channels, tv shows, subs search, PHP tools (`count.php`, `video/`), `user_data` blob PATCHes, likes, watch history, notes, subscriptions |
| **Web (Next.js)** | NextAuth → Flask `/auth/login` (Directus proxy) | Mostly Flask; three Next.js API routes still query Directus (`/api/videos/*`, `/api/channels/*`) per SPEC-024 |
| **Mobile (Expo)** | `AuthContext` → Flask `/auth/login` (Directus proxy) | Flask; one direct Directus call for watch-history delete (SPEC-024) |
| **Flask** | accepts Directus JWT; **base64-decodes it without signature verification** (safe only because Directus validates downstream) | Directus for: auth, user_data, user_notes (`items/text`), subscriptions/payments, videos/channels/tv shows, plus `utils_subscription.py` and payment apps |

### Flask's remaining Directus dependencies

`routes/auth.py`, `routes/user_data.py`, `routes/user_notes.py`,
`routes/video.py`, `utils_directus.py`, `utils_subscription.py`,
`app_stripe_checkout.py`, `app_paypal_checkout.py`, `app_in_app_purchase.py`,
`app_email_verification.py`, `app_directus.py`.

### Problems driving the migration

1. **Whole-blob user data** (`saved_words`, `progress`, `srs_progress`,
   `settings_v2`) is last-writer-wins with no delta: deletes are expressed by
   overwriting with a smaller blob, so divergent devices re-introduce deleted
   data.
2. **Classic is a third writer outside the abstraction layer**, PATCHing
   Directus directly with no coordination with web/mobile.
3. **Directus 8 is aging and being replaced anyway**; every client that knows a
   Directus URL or schema must be reworked on migration (SPEC-024's exact
   problem).
4. **Blob churn**: multi-hundred-KB JSON rewrites per save, Directus revision
   failures (`activity_skip=1` workaround), and no queryability.

## Target Architecture

### Transition (T-switch → T-complete)

```text
apps/web ──┐
          ├── Flask (single gateway) ──▶ Supabase (source of truth)
apps/mobile┘          │
Classic ──────────────┘
                      ├── proxies auth to GoTrue (Supabase Auth)
                      └── legacy mirror/reconciler for old-Classic saved-words
                          blobs until rollout completes (scaffolding)
```

- Supabase is authoritative for all migrated data.
- Directus stays alive during the window only for: auth user import source,
  old-Classic bundles still writing the saved-words blob, and any path not yet
  cut over.

### Permanent (after decommission at T+30)

```text
apps/web ──┐
apps/mobile┼── Flask ──▶ Supabase Postgres
Classic ───┘     │
                 └── GoTrue (Supabase Auth), proxied
```

No Directus. No client SDKs for Supabase unless a future ADR adopts PostgREST.

## Workstreams

### WS-0 — Saved Words (pilot)

The full design from the original scope of this spec, unchanged.

#### Schema

```sql
create table user_saved_words (
  id bigint generated always as identity primary key,
  user_id bigint not null,            -- Directus user id during transition; auth.users id after WS-1
  l2 text not null,                   -- ISO code (ADR-0021 convention)
  word_id text not null,              -- CEDICT, w-hash, llm-…, numeric EDICT/Kengdic
  forms jsonb not null default '[]',
  first_saved_at bigint not null,
  updated_at bigint not null,
  unique (user_id, l2, word_id)
);

create table saved_word_instances (
  id bigint generated always as identity primary key,
  saved_word_id bigint not null references user_saved_words(id) on delete cascade,
  form text not null,
  timestamp bigint not null,
  context jsonb not null,
  dedupe_key text not null,           -- sha1(timestamp|form|context.text)
  unique (saved_word_id, dedupe_key)
);

create table user_saved_word_sync (   -- scaffolding; dropped in WS-8
  user_id bigint primary key,
  last_classic_blob jsonb,
  blob_sha256 text,
  mirror_pending boolean not null default false,
  last_sync_at timestamptz not null default now()
);

create index on user_saved_words (user_id, l2);
create index on user_saved_words (user_id, updated_at);
```

#### Flask API

| Endpoint | Method | Purpose |
|---|---|---|
| `/saved-words?l2=zh` | GET | Rows grouped by L2 into `{ words: SavedLexicalItemStore }`; lazy-reconciles the user (scaffolding) |
| `/saved-words` | PUT | Upsert word: union `forms`, append/merge instance, `first_saved_at` = min, `updated_at` = max |
| `/saved-words/{l2}/{wordId}` | DELETE | Hard-delete word row (instances cascade) |
| `/saved-words/reconcile` | POST | Internal (scaffolding): reconcile one user |
| `/saved-words/reconcile-sweep` | POST | Internal (scaffolding): dirty-user sweep, cron-invoked |

#### Write path

1. Apply the row op to Supabase in one transaction.
2. Scaffolding: rebuild the canonical Directus blob, PATCH `user_data` with
   `activity_skip=1` (preserving the other columns). Mirror failure sets
   `mirror_pending`; Supabase stays authoritative.

#### Reconciler (scaffolding)

Diff `last_classic_blob` → current blob and apply only real changes: appeared →
insert, disappeared → delete, both → merge, unchanged → no-op. Then rewrite the
blob from canonical Supabase rows and update the diff base. Null base = no-op
(initialized from canonical state). Dirty-user discovery: lazy on GET + sweep
via Directus revisions (Classic PATCHes create revisions), checksum fallback if
revisions are truncated.

#### Backfill

Idempotent backfill script (`zerotohero-python-server/tmp/supabase-saved-words-migrate.py`,
`python3.10` + psycopg2) — upsert, count verification, second-run no-op check.
Add `psycopg2` to `requirements.txt`. The script defaults to streaming blobs
directly from the source MySQL (`DB_*` creds, ID-chunked connections — the
ADR-0021 pattern) with a Directus API fallback (`--source api`), and supports
`--limit` smoke runs, `--reset`, per-user checksum skipping for idempotent
reruns, and `--verify` (global count delta + Mary/Bob word-set diff).

### WS-1 — Auth & Users (ADR-0023)

**Target**: all three apps authenticate via Flask → GoTrue; Directus JWTs are
gone.

1. **User import**: migrate `directus_users` → `auth.users` +
   `auth.identities` (email, name, status). Keep a mapping table
   `user_id_map(directus_user_id bigint primary key, auth_user_id uuid,
   email)` — every user-data table remaps through it.
2. **Password hashes**: store Directus bcrypt hashes where GoTrue can verify
   them. Run a `$2y$` compatibility test against GoTrue first; users with
   incompatible hashes get a forced password reset on next login.
3. **Flask endpoints**: `/auth/login`, `/auth/register`, `/auth/password-*`,
   `/auth/verify-email`, `/auth/delete-account` forward to GoTrue REST
   (`/auth/v1/token`, admin APIs with service-role key) and keep the current
   `{ token, user }` response shape.
4. **JWT verification**: add PyJWT middleware; verify signature (HS256,
   `SUPABASE_JWT_SECRET`) and `exp` on every authenticated request. Remove the
   base64-decode-without-verify pattern from `user_data.py`, `auth.py`,
   `user_notes.py`.
5. **Clients**: web keeps NextAuth (same Flask URL); mobile keeps AuthContext
   (same Flask URL); Classic retargets nuxt-auth `local` endpoints to Flask.
6. **Email verification**: replace the `email_verification` table + Directus
   flows with GoTrue email flows (or Flask codes — SPEC-024 open question).
7. **Delete account**: GoTrue admin delete + cascade user data.
8. **Admin/role gating**: Directus roles are not copied. Admin surfaces
   (e.g., Classic's `VideoAdmin.vue`) gate on a GoTrue `app_metadata` flag
   (e.g., `is_admin`) set during import or via the Supabase dashboard.

### WS-2 — Remaining User-Data Columns

The other `user_data` JSON columns follow the WS-0 row pattern:

| Column | Target table | Notes |
|---|---|---|
| `progress` | `user_progress(user_id, l2, level, time_ms, weekly_hours jsonb, updated_at)` | One row per (user, language) |
| `srs_progress` | `user_srs_cards(user_id, l2, word_id, state jsonb, updated_at)` | Same word-id scheme as saved words; cascade-friendly |
| `settings_v2` + Classic `settings` | `user_settings(user_id, settings jsonb, updated_at)` | Merge legacy Classic settings into the same row |
| `saved_phrases` | `user_saved_phrases` row table | Same CRUD pattern as WS-0 |
| `saved_hits`, `saved_collocations` | row tables or JSONB per user | Verify actual Classic usage before choosing |
| `bookshelf` | `user_bookshelf` | Small; JSONB acceptable |
| `history` | folded into `user_progress` or its own rows | Verify Classic `store/history.js` semantics |

`GET /user-data` / `POST /user-data/sync` stay alive until every field has moved;
each migrated field is removed from `_USER_DATA_SYNC_FIELDS` as its client
switch lands.

### WS-3 — Watch History, Likes, Playlists, Channel Preferences

All carry old per-shard video ids and need the ADR-0021 remap:

```text
new_video_id = prefix(l2) * 10^10 + old_video_id
prefix(l2) = shard number for that language (utils_directus.py map / l2 code)
```

| Target | Schema highlights |
|---|---|
| `user_watch_history` | `(id, user_id, video_id bigint, last_position int, date timestamptz, unique(user_id, video_id))` |
| `user_likes` | `(id, user_id, video_id bigint, l2 text, created_on, unique(user_id, video_id))` |
| `user_playlists` | `(id, user_id, title, l2 text, videos jsonb, created_on)` — remap ids inside `videos` |
| `user_channel_preferences` | `(id, user_id, channel_id, l2 text, status, unique(user_id, channel_id, l2))` |

Flask endpoints: `/watch-history` GET/POST/DELETE (the existing
`/watch-history/delete` extends), `/likes` PUT/DELETE/GET, `/playlists` CRUD.
Mobile's direct watch-history DELETE call (SPEC-024 M7) is already planned for
removal.

### WS-4 — Notes / User Texts

`routes/user_notes.py` currently proxies Directus `items/text` (title, text,
translation, l2, owner). Target: `user_texts(id, user_id, l2, title, text,
translation, created_at, updated_at)`. Same API shape, Supabase-backed; ~20k
rows, backfill with user-id remap.

### WS-5 — Subscriptions & Payments

`subscriptions` (~31k rows) gates Pro features across all apps, so it must
migrate **before** Directus dies:

| Target | Schema highlights |
|---|---|
| `user_subscriptions` | `(id, user_id, type, expires_on, payment_processor, payment_method, payment_email, payment_id, payment_date, notes, payment_customer_id)` |
| `user_acquisition` | as-is with user-id remap |

Cut over `utils_subscription.py` + `/user-subscription` and the Stripe/PayPal/
IAP apps (`app_stripe_checkout.py`, `app_paypal_checkout.py`,
`app_in_app_purchase.py`) from Directus to Supabase. Webhooks keep writing via
Flask; verify Pro gating on web/mobile/Classic after cutover.

### WS-6 — Content Read-Path Cutover (ADR-0021 completion)

1. `routes/video.py`, `routes/tv_shows.py`, and channel/talk lookups read from
   Supabase instead of Directus (`utils_directus.py` shard suffix map retires).
2. **Video-ID compatibility**: clients move to consolidated ids
   (`prefix * 10^10 + old_id`); web watch URLs, mobile routes, and Classic video
   pages must accept the new ids. Accept-and-map old ids during the transition
   if needed.
3. **Subtitle search**: MySQL FULLTEXT `subs-search` needs a Postgres
   replacement — pg_trgm now, embedding-based search later (ADR-0021).
4. **PHP tools**: replace `LP_DIRECTUS_TOOLS_URL` endpoints (`count.php`,
   `video/{suffix}/{id}`, `videos`) with Flask equivalents (e.g.,
   `/videos/count`, `/videos/{id}`).

### WS-7 — Classic Directus Call Consolidation

Full audit (files verified in the repo):

| Area | Files | Replacement |
|---|---|---|
| Auth | `nuxt.config.js` (auth strategies) | Flask `/auth/*` (WS-1) |
| User data | `store/savedWords.js`, `store/savedPhrases.js`, `store/settings.js`, `store/history.js`, `store/watchHistory.js`, `store/userLikes.js`, `store/savedText.js`, `plugins/directus.js` | Flask row endpoints (WS-0, WS-2, WS-3, WS-4) |
| Videos | `plugins/directus.js` (getVideos/getVideo/searchCaptions), `plugins/subs.js`, `components/MediaSearchResults.vue`, `components/YouTubeVideoCard/index.vue`, `components/VideoAdmin.vue`, `store/stats.js` | Flask `/videos`, `/subs-search`, `/tv-shows`, `/videos/count` (WS-6) |
| Subscriptions | `plugins/directus.js` (`items/subscriptions`) | `/user-subscription` (WS-5) |
| Account | `pages/delete-account.vue` | `/auth/delete-account` (WS-1) |

### WS-8 — Scaffolding Teardown & Decommission

1. After no old-Classic bundles remain and all workstreams are live: stop the
   mirror + reconciler, drop `user_saved_word_sync`, remove `saved_words` from
   `_USER_DATA_SYNC_FIELDS`, delete the mirror/reconcile code paths.
2. Freeze Directus writes; run a final full export (MySQL dump) and archive it
   off-box.
3. Verify zero traffic to `directusvps.zerotohero.ca` for 7 consecutive days.
4. Cut DNS, remove Directus credentials from Flask `.env`, delete the
   `directus_*`-dependent code paths.

## Phased Migration Plan

### Definitions

- **T-switch** = release where web, mobile, and Classic all read/write saved
  words through Flask/Supabase only (Phases 0–4 complete). A milestone, not a
  deadline — it does not start the sunset clock.
- **T-complete** = every Phase 5 workstream migrated AND the full cross-app
  test cycle passed. The 30-day sunset window starts here.
- **T+30** = Directus decommission deadline = T-complete + 30 days.

### When each piece is implemented

| Piece | Phase | Workstream |
|---|---|---|
| Saved-words schema + backfill | 0 | WS-0 |
| Flask saved-words backend + scaffolding | 1 | WS-0 |
| Web saved-words switch | 2 | WS-0 |
| Mobile saved-words switch | 3 | WS-0 |
| Classic saved-words edit → **T-switch** | 4 | WS-0, WS-7 (saved-words only) |
| Auth investigation + import prep (bcrypt test, `user_id_map`) | 5.1 | WS-1 |
| Remaining user-data columns | 5.2 | WS-2 |
| Watch history / likes / playlists | 5.3 | WS-3 |
| Notes | 5.4 | WS-4 |
| Subscriptions & payments | 5.5 | WS-5 |
| Content read-path cutover | 5.6 (can start immediately) | WS-6 |
| Auth cutover (GoTrue tokens in all apps; one-time user-data remap) | 5.7 | WS-1 |
| Classic Directus consolidation | 5.8 | WS-7 |
| Full test cycle → 30-day window → teardown + decommission | 5.9 | WS-8 |
| Post-sunset | 6 | — |

### Phase 0 — Saved-Words Schema + Backfill (no downtime; ~1 day)

Create the WS-0 tables; write and run the backfill script twice (idempotency
check); add `psycopg2` to `requirements.txt`. No frontend changes.

**Acceptance**: backfill run 2 changes nothing; Mary/Bob word sets identical in
Supabase and Directus.

### Phase 1 — Flask Saved-Words Backend + Scaffolding (2–3 days)

WS-0 endpoints (always on, no flag), row↔record mapping, mirror, reconciler,
mocked-Directus unit tests. No frontend changes.

**Acceptance**: writes land in Supabase + blob; simulated old-Classic blob
writes reconcile within one sweep interval.

**Rollback:** revert the Flask deploy; no client depends on the row API until
Phase 2 ships.

### Phase 2 — Web Saved-Words Switch (1 day)

`packages/api-client` row methods; `use-saved-words.ts` per-op PUT/DELETE;
provider stops hydrating `saved_words` from `/user-data`; optional anonymous-
merge env toggle; legacy full-blob sync path removed.

### Phase 3 — Mobile Saved-Words Switch (1 day)

`SavedWordsContext.tsx` per-op PUT/DELETE; SecureStore cache; optional offline
queue; legacy full-blob sync path removed.

### Phase 4 — Classic Saved-Words Edit (1–2 days; completes T-switch)

`store/savedWords.js` → Flask per-word PUT/DELETE + GET hydration;
`plugins/directus.js` stops importing `saved_words` from the blob (other fields
stay until WS-2). Roll out immediately; scaffolding covers old bundles.

**Acceptance**: save/delete in any app converges everywhere; Mary/Bob regression
passes.

**At this point T-switch has occurred** (saved words fully on the row API).
The sunset clock does **not** start here — it starts at **T-complete** once
Phase 5 is fully migrated and tested.

### Phase 5 — Full-Database Migration + Test Window (T-switch → T-complete)

There is no fixed calendar: workstreams run in parallel and the sunset
countdown starts only after T-complete. Ordering constraints:

| Sub-phase | Workstream | Timing | Dependency |
|---|---|---|---|
| 5.1 | Auth investigation + import prep (bcrypt `$2y$` test, `user_id_map`) | Early, parallel | None |
| 5.2 | Remaining user-data columns | Parallel | None (Directus ids during transition; remapped at 5.7) |
| 5.3 | Watch history / likes / playlists | Parallel | None (same) |
| 5.4 | Notes | Parallel | None (same) |
| 5.5 | Subscriptions & payments | Parallel; before T-complete | None (same; Pro gating verified before decommission) |
| 5.6 | Content read-path cutover | Parallel, can start immediately | None |
| 5.7 | Auth cutover (GoTrue tokens in all apps; one-time user-data remap) | After data migrations; before T-complete | 5.1, 5.2–5.6 |
| 5.8 | Classic Directus consolidation | Late | 5.7 + 5.6 |
| 5.9 | Full test cycle → 30-day sunset window → scaffolding teardown + decommission | Last | All of the above |

**Acceptance per sub-phase**: data counts match between Directus and Supabase
(idempotent backfill, second-run no-op), the affected app features pass Mary/Bob
regression, and the old code path is removed before the new path goes live.

**Sunset readiness checklist (all must pass during the 30-day sunset window,
T-complete → T+30):**

- [ ] All three apps authenticate through Flask → GoTrue (no Directus auth).
- [ ] Every table in the migration inventory exists in Supabase with matching
  counts.
- [ ] Full cross-app test cycle passed (Mary/Bob + regression on all three apps).
- [ ] Zero `DIRECTUS_URL` / `directusvps` references in any app source.
- [ ] Zero Directus traffic in access logs for 7 consecutive days.
- [ ] Saved-words scaffolding removed (`user_saved_word_sync` dropped).
- [ ] Final Directus backup archived off-box; credentials removed from `.env`.

### Phase 6 — Post-Sunset Work (after T+30 / decommission)

- Embedding-based video search/recommendation (pgvector).
- Optional RLS defense-in-depth (separate ADR).
- Drop legacy columns/tables and any old-id accept-and-map code.

## Conflict Semantics & Edge Cases

| Case | Behavior |
|---|---|
| Old Classic bundle with stale cache PATCHes the blob (rollout window) | Old→new diff treats unchanged words as no-op; only real adds/deletes apply (scaffolding) |
| Old Classic re-adds a word after a web delete | Treated as a Classic add (consistent with its visible state); ends when the bundle is gone |
| Web/mobile offline | Per-op queue with `updated_at`; server LWW; instance union prevents loss on concurrent adds |
| Duplicate instances | `dedupe_key = sha1(timestamp\|form\|context.text)` |
| Mirror (Directus) failure | Supabase authoritative; `mirror_pending` retry |
| Reconcile with null `last_classic_blob` | No-op; never treat as "Classic deleted everything" |
| Video-ID remap | `new_id = prefix(l2) * 10^10 + old_id`; invertible; validate zero collisions and zero unmapped l2 codes |
| User-id remap | Every user table joins through `user_id_map`; orphan check after each backfill (count rows with unmapped user ids = 0) |
| NUL bytes / longtext | Strip NULs during COPY (ADR-0021 pattern) |
| Directus down before T+30 | Saved words fine (Supabase authoritative); auth is the true dependency — WS-1 must complete before decommission; run the bcrypt investigation early |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration drags on / testing gaps | Medium | High | Workstreams run in parallel; T-complete is gated on the full test cycle, so there is no fixed calendar to slip — only the 30-day window shortens |
| Auth import breaks passwords (bcrypt `$2y$` vs GoTrue) | Medium | High | Compatibility test first; forced-reset flow for incompatible hashes; keep `user_id_map` for recovery |
| Payments/Pro gating broken at sunset | Low | High | WS-5 completes before T-complete; regression: free vs Pro behavior across all apps |
| Video-ID remap errors (likes/watch history/playlists) | Medium | Medium | Deterministic prefix function; count/join verification; keep old-id mapping view until decommission |
| Classic regressions while consolidating | Medium | High | One area at a time; per-store switches with flags; Mary/Bob regression per sub-phase |
| Subs-search replacement not ready | Medium | Medium | pg_trgm interim; ship before WS-7 retires Classic's searchCaptions |
| Old Classic bundles linger | Medium | Low–Medium | Scaffolding covers the window; monitor blob PATCH traffic |
| Reconciler loops | Medium | Medium | All Flask blob writes use `activity_skip=1`; checksum base updated transactionally |

## Success Criteria

1. Every table in the migration inventory is in Supabase with matching counts
   and zero orphaned user ids.
2. All three apps authenticate, save words, SRS/progress/settings, watch
   history, likes, playlists, notes, and subscriptions work through Flask.
3. Zero Directus traffic for 7 consecutive days; Directus decommissioned at
   T+30 (30 days after T-complete) with an archived final backup.
4. Saved-words guarantee holds everywhere: add once → added everywhere, delete
   once → deleted everywhere.
5. Zero planned downtime; every phase rolls back with a revert (no feature flags).

## Dependencies

- `docs/adr/0021-migrate-video-content-to-supabase.md` — content migration,
  ID-prefix contract, pending read-path cutover (WS-6)
- `docs/adr/0023-proxy-supabase-auth-through-flask.md` — auth decision (WS-1)
- `docs/adr/0004-directus-user-data-token-strategy.md` — JWT user-id extraction
  (superseded for auth, still relevant for the transition)
- `docs/specs/024-consolidate-directus-calls.md` — Flask-as-single-gateway;
  extends to Classic in WS-7
- `docs/arch/014-saved-words-data-flow.md` — record/instance shapes and dedupe
  rules (WS-0)
- `tmp/supabase-test/supabase-migrate.py` + `tmp/db-backup/` — migration
  patterns and verification reference
- New specs to write: user-data columns (WS-2), watch/likes/playlists (WS-3),
  subscriptions/payments (WS-5), content cutover details (WS-6)

## References

- `zerotohero-python-server/routes/` — auth, user_data, user_notes, video,
  subscriptions, payments
- `zerotohero-python-server/utils_directus.py`, `utils_subscription.py`
- `zerotohero-nuxt/nuxt.config.js`, `plugins/directus.js`, `store/*`,
  `components/*` (Classic surface)
- `apps/web/src/auth.ts`, `apps/web/src/hooks/use-saved-words.ts`,
  `apps/mobile/contexts/AuthContext.tsx`, `apps/mobile/contexts/SavedWordsContext.tsx`

## Open Questions

1. **Subs-search replacement**: pg_trgm interim acceptable, or must embedding
   search ship before sunset?
2. **Classic PHP tools**: which `LP_DIRECTUS_TOOLS_URL` endpoints are still
   exercised by real traffic, and which can be dropped?
3. **Classic legacy columns**: do `saved_hits`, `saved_collocations`,
   `bookshelf`, and `history` need row-level migration or can they move as
   JSONB until Classic retires?
4. **Email verification**: GoTrue-native flows vs Flask codes (SPEC-024 open
   question).
5. **Rollout signal**: how to measure old-Classic-bundle usage (blob PATCH
   traffic, client version header) for scaffolding teardown.
6. **Anonymous-local merge**: one-time merge of anonymous localStorage words on
   first login, or keep server-replaces-local?
7. **Directus revisions retention**: confirm truncation schedule for the
   scaffolding sweeper.
