# ADR-0050: Derived content data is maintained by the cheapest mechanism that guarantees correctness

**Date**: 2026-10-19
**Status**: accepted
**See also**:
[SPEC-106](../specs/106-derived-data-maintenance.md),
[SPEC-105](../specs/105-video-content-index-cleanup.md),
[ARCH-037](../arch/037-video-content-schema.md),
[ARCH-036](../arch/036-subs-search-architecture.md),
[ADR-0021](0021-migrate-video-content-to-supabase.md),
[ARCH-034](../arch/034-video-lemmatization-cache.md),
[SPEC-044](../specs/044-subs-search-db-optimizations.md)

## Context

`public.youtube_videos` is the source of truth. Everything else is derived:
full-text and n-gram indexes, the trigram fallback, metadata embeddings, the
whole-video lemmatization cache and the subs-search result cache. Each artifact
had grown its own maintenance rule:

- full-text/trigram indexes: maintained by Postgres (correct);
- `subs_ngram_tsv`: nulled by a trigger on every subtitle write and repaired by
  a manual backfill, so new videos and edited subtitles fell out of continua
  search;
- metadata embeddings: a one-time 2026-08-02/03 backfill, so new videos had no
  vector and edits left stale vectors in the HNSW index;
- lemmatization cache: written on import, never invalidated, so deleted ids
  could be inherited after id reuse;
- subs-search cache: no TTL and no invalidation, so deleted/renamed videos were
  still served.

## Decision

One pipeline, with a per-artifact rule:

1. **If Postgres can maintain it, let Postgres.** Full-text, trigram and
   b-tree indexes need no application code.
2. **Cheap local CPU is computed synchronously in the write path.**
   `subs_ngram_tsv` is computed by the shared tokenizer in `create_video` /
   `update_video`; a subtitle or L2 edit deletes the lemma cache and
   recomputes `lex_div` / `word_freq` / `difficulty` before returning.
3. **External or expensive work uses a dirty flag plus a scheduled worker.**
   A trigger sets `needs_embedding` (+ attempts/error/requested_at) on insert
   and on embedding-field updates, and deletes the old vector ("absent, never
   stale"). A daily VPS cron or the admin **Update now** action drains the
   flag. The trigger covers direct SQL and future services.
4. **Caches are versioned, never searched by content.** A statement trigger
   bumps `content_revision` on every video write; subs-search entries store
   `saved_at` and a read is a miss when it predates the revision (30-day
   configurable backstop, `0` = indefinite). Per-video lemma entries are
   deleted on subtitle/L2 change and on delete.

Supporting rules: reconciliation is report-only (the initial backlog is a
manual one-off); the embedding drain is bounded (≤ 50 per admin click, ≤ 100
per batch); failed state and the dedupe backups are retained for 7 days.

## Consequences

Positive:

- New and edited videos are indexed for subs-search immediately.
- Embeddings are refreshed within a day, or immediately on demand.
- Subtitle edits never leave stale scores; deletes and renames stop leaking
  through caches; direct SQL is covered by the triggers.
- No new scheduler, extension or always-on process; one Python worker and one
  admin panel.
- The `model`/`kind` columns keep a future embedding-model change a versioned
  re-embed rather than a redesign.

Negative:

- Recommendations can lag by up to a day (the admin button shortens that).
- The flag covers one artifact; if subtitle embeddings or a dual-model
  transition arrive, it upgrades to a `derived_jobs` table.
- Triggers add a small write overhead and a global cache revision bump.
- The VPS cron is an operational dependency; the health panel makes a missed
  run visible.
- The admin video dialog still re-sends `subs_l2` on every save; correctness is
  preserved by the server-side recompute, but the dirty-check is a follow-up.

## Alternatives considered

- **Supabase `pg_cron` + `pg_net`** — rejected: `pg_cron` runs SQL only, so it
  would need a second extension, a Vault secret and an HTTP hop to the same
  Flask worker. The VPS already runs `prune_cache.py` on cron.
- **An always-on queue/worker** — overkill for one asynchronous artifact.
- **A nightly full reconciliation** — too slow and still misses edits between
  runs; the dirty flag is incremental.
- **A 24-hour cache TTL** — unnecessary once every write bumps the revision;
  the long backstop only protects against a missed/broken trigger.
- **Application-only invalidation** — would miss direct SQL and future writers;
  the triggers are the safety net.
