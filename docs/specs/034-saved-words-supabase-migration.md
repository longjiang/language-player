# SPEC-034: Saved Words — Supabase Row-Level Migration (Complete)

## Metadata
- **Spec ID**: SPEC-034
- **Feature**: Move saved-words storage from the Directus `user_data.saved_words` JSON blob to normalized `user_saved_words` tables in Supabase, with row-level CRUD through Flask on all three apps and a Directus blob mirror/reconciler for legacy Classic bundles
- **Status**: complete (2026-08-04)
- **Created**: 2026-08-02
- **Updated**: 2026-08-04 — split out of the full-database migration spec; remaining Directus migration → SPEC-039; video content migration → SPEC-038
- **ROADMAP Phase**: Phase 9: Backend Consolidation (cross-cutting)
- **See also**: [SPEC-039 (Full Database Migration)](039-full-database-migration-supabase.md), [SPEC-038 (Video Content to Supabase)](038-video-content-supabase.md), [ADR-0023 (Proxy GoTrue Through Flask)](../adr/0023-proxy-supabase-auth-through-flask.md), [ARCH-014 (Saved Words Data Flow)](../arch/014-saved-words-data-flow.md)

## Overview

Saved words previously lived as one large JSON blob (`saved_words`) inside the
Directus `user_data` table. Web and mobile uploaded the whole blob to Flask on
every change, Classic PATCHed the same blob directly, and last-writer-wins meant
deletes could silently resurrect. This spec replaced the blob with a
row-per-word `user_saved_words` table in Supabase so that "added once → added
everywhere, deleted once → deleted everywhere" is real behavior, while Classic
kept working through a Directus blob mirror during rollout.

The row API is **unconditional**: web and mobile are pre-launch, so there are no
client-side feature flags — both apps always use `/saved-words`, and the legacy
full-blob sync path was removed from their code. Classic's new bundle also uses
the row API.

## Status (2026-08-04)

Implemented end-to-end and verified:

- **Phase 0** — schema + idempotent backfill: 6,414 users with data, 482,589
  word rows = 482,589 instance rows, `user_saved_word_sync` initialized; second
  run is a no-op.
- **Phase 1** — Flask row API (`/saved-words` GET/PUT/DELETE) + mirror +
  reconciler + sweep, deployed to production.
- **Phases 2–4** — web, mobile, and Classic all read/write saved words through
  Flask → Supabase (**T-switch achieved**).
- **Gap catch-up** — full diff-based reconcile absorbed all adds/deletes made
  by live Classic between backfill and rollout; final verify: word delta 0,
  instance delta 0; Mary PASS (2,186/2,186), Bob PASS (4/4).
- **Live sweep** — per-minute cron (`/saved-words/reconcile-sweep`) absorbs
  old-bundle writes during rollout; sha-skip keeps unchanged users cheap.

The mirror/reconciler/sweep scaffolding is retained until Directus is
decommissioned (SPEC-039, sub-phase 5.9 / WS-8).

## Supabase Schema

```sql
create table user_saved_words (
  id bigint generated always as identity primary key,
  user_id bigint not null,            -- Directus user id during transition; auth.users id after SPEC-039 5.7 remap
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

create table user_saved_word_sync (   -- scaffolding; dropped at SPEC-039 teardown
  user_id bigint primary key,
  last_classic_blob jsonb,
  blob_sha256 text,
  mirror_pending boolean not null default false,
  last_sync_at timestamptz not null default now()
);

create index on user_saved_words (user_id, l2);
create index on user_saved_words (user_id, updated_at);
```

## Flask API

| Endpoint | Method | Purpose |
|---|---|---|
| `/saved-words?l2=zh` | GET | Rows grouped by L2 into `{ words: SavedLexicalItemStore }`; lazy-reconciles the user (scaffolding) |
| `/saved-words` | PUT | Upsert word: union `forms`, append/merge instance, `first_saved_at` = min, `updated_at` = max |
| `/saved-words/{l2}/{wordId}` | DELETE | Hard-delete word row (instances cascade) |
| `/saved-words/reconcile` | POST | Internal (scaffolding): reconcile one user; optional `skip_if_unchanged` |
| `/saved-words/reconcile-sweep` | POST | Internal (scaffolding): dirty-user sweep, cron-invoked; compact count-only response |

## Write Path

1. Apply the row op to Supabase in one transaction (bulk upserts for the
   reconciler; single-record upsert for client PUT).
2. Scaffolding: rebuild the canonical Directus blob, PATCH `user_data` with
   `activity_skip=1` (preserving the other columns). Mirror failure sets
   `mirror_pending`; Supabase stays authoritative.

## Reconciler (scaffolding)

Diff `last_classic_blob` → current blob and apply only real changes: appeared →
insert, disappeared → delete, both → merge (union, idempotent), unchanged →
no-op. Then rewrite the blob from canonical Supabase rows and advance the base:
`last_classic_blob` = the classic-written blob, `blob_sha256` = the canonical
blob's sha. Null base = import the whole blob (new users).

- Bulk `execute_values` upserts keep large users fast (O(1) round trips).
- `skip_if_unchanged` compares the current blob sha against `blob_sha256` and
  no-ops (used by the sweep; settings/progress-only activity no longer rewrites
  saved-words blobs).
- Dirty discovery: lazy on `GET /saved-words` (sha compare) + per-minute cron
  sweep via Directus activity (`action_on`), with checksum fallback if activity
  is truncated.

## Backfill & Catch-Up Tooling

`zerotohero-python-server/tmp/supabase-saved-words-migrate.py` (`python3.10` +
psycopg2) — idempotent, per-user checksum skipping:

- `--source mysql` (default; streaming, ID-chunked) or `--source api`.
- `--verify` — global count delta + Mary/Bob word-set diff.
- `--reconcile [--users ...]` — the diff-based gap catch-up (adds AND deletes;
  never resets the diff base).
- `--limit`, `--reset` for smoke runs / clean rebuilds.

## Conflict Semantics

| Case | Behavior |
|---|---|
| Old Classic bundle with stale cache PATCHes the blob (rollout window) | Old→new diff treats unchanged words as no-op; only real adds/deletes apply (scaffolding) |
| Old Classic re-adds a word after a web delete | Treated as a Classic add (consistent with its visible state); ends when the bundle is gone |
| Web/mobile offline | Per-op queue with `updated_at`; server LWW; instance union prevents loss on concurrent adds |
| Duplicate instances | `dedupe_key = sha1(timestamp\|form\|context.text)` |
| Mirror (Directus) failure | Supabase authoritative; `mirror_pending` retry |
| Reconcile with null `last_classic_blob` | Import the whole blob — never treat as "Classic deleted everything" |
| Re-save of an existing word | Union merge in `upsert_word`; dates min/max; no instance loss |

## Success Criteria (met)

1. A word added on any app appears on all apps.
2. A word deleted on any app disappears everywhere (≤ one sweep interval for
   Classic-originated changes during rollout).
3. No full-blob `saved_words` sync calls remain in web/mobile/Classic source.
4. Backfill + reconcile idempotent, verified delta 0 against the source.
5. Zero planned downtime; rollback by revert (no feature flags).

## Out of Scope → SPEC-039

The rest of the Directus → Supabase migration: remaining user-data columns
(progress/SRS/settings/phrases), watch history/likes/playlists, notes,
subscriptions/payments, auth cutover + user-id remap, content read-path
cutover, Classic Directus consolidation, scaffolding teardown, and
decommission. Video content data migration (already loaded) → SPEC-038.
