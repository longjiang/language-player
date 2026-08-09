# ADR-0031: Full Offline Dictionary Downloads (Remove the 125k Cap)

**Date**: 2026-08-09
**Status**: accepted
**Supersedes**: the 125,000-entry cap in [SPEC-013](../specs/013-mobile-offline-dictionary.md)
**See also**:
- [ADR-0008](0008-go-dictionary-architecture.md) — original offline-download architecture
- [SPEC-013](../specs/013-mobile-offline-dictionary.md) — offline dictionary spec
- [SPEC-022](../specs/022-tokenizer-auto-download-ui.md) — download UI spec

## Context

`/dictionary/download` originally served at most 125,000 entries per language:
all frequency-ranked entries first, then the longest-definition entries to fill
the cap. This kept downloads small when the client received JSON/NDJSON and had
to insert rows itself. It meant Spanish only downloaded 125,000 of its 243,711
entries, English 125,000 of 511,526, and so on.

By 2026-08-09 the pipeline had changed enough that the cap was no longer
necessary:

- The server serves a **gzipped, precompiled SQLite database** (`format=db`);
  the client writes the file directly instead of streaming and inserting rows.
- Lemma-table imports were rewritten for speed: 10k-row statements inside a
  single exclusive transaction, the redundant duplicate `surface` index was
  removed, progress updates were throttled, and the 200ms UI polling loop was
  deleted.
- Concurrent downloads now serialize shared `dictionary.db` writes (plus a
  `busy_timeout` backstop), eliminating `database is locked` failures.
- The offline dictionary SQLite handle is warmed in the background and popup
  lookups use one batch query, so the larger dictionaries remain fast to use
  offline.

A real-device trial confirmed full downloads are fast: Spanish (243,711
entries) transfers as a ~17 MB gzip, English (511,526 entries) ~46 MB.

## Alternatives Considered

1. **Keep the 125k cap** — Rejected. The precompiled-SQLite pipeline plus the
   insert/import improvements removed the main cost the cap existed to avoid.
2. **Full downloads only for a small allowlist** — Rejected. Adds per-language
   special cases without a demonstrated need; all tested languages download
   quickly.
3. **Per-language "full dictionary" UI toggle** — Deferred. Full downloads are
   acceptable everywhere today; a toggle can be added later if storage becomes
   a concern for specific languages.

## Decision

1. Remove the 125,000-entry cap permanently. The mobile client omits `limit`,
   and the server defaults to returning every entry.
2. `/dictionary/download/languages` reports `downloaded = totalEntries` and
   `capped = false`.
3. Keep `limit` as an optional query parameter for testing and API
   compatibility (`0`, `all`, or `none` also means full).
4. Bump `_DICT_EXPORT_VERSION` whenever the export shape or cap policy changes
   so stale precompiled builds are regenerated instead of served from cache.

## Consequences

- **Larger downloads and storage** for big languages. Gzip transfer roughly
  doubles for languages over 125k (e.g. Spanish ~17 MB, English ~46 MB), and
  the on-device SQLite file is several times larger than the gzip.
- **Better offline coverage** — rare and low-frequency words are now available
  offline instead of only the top 125k.
- **First full download builds server cache** — the first request for a
  language regenerates the precompiled DB on the server; subsequent requests
  are served from cache.
- **Existing users keep their capped dictionaries** until they manually
  refresh/update; there is no forced re-download.
