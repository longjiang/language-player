# ADR-0028: Consolidate Modern Standard Arabic (`arb`) into Arabic (`ar`)

**Date**: 2026-08-08
**Status**: accepted
**See also**: [SPEC-013](../specs/013-mobile-offline-dictionary.md),
[ARCH-016](../arch/016-server-tokenization.md),
[ADR-0021](0021-migrate-video-content-to-supabase.md)

## Context

`arb` (ISO 639-3, Modern Standard Arabic) existed as a separate content bucket
alongside `ar` (ISO 639-1, the Arabic macrolanguage). The two were unequal in
practice:

- `ar` had 9,017 videos, a server lemmatizer (Qalsadi), a dictionary download,
  and a proper product name ("Standard Arabic").
- `arb` had 164 videos, **no** lemmatizer registration, **no** dictionary
  download, **no** localized display name (it rendered as "ARB"), and no
  offline tokenizer config.

`arb` was effectively an MSA-specific subset of the same language, but it
surfaced as a full language row in the language picker, the offline-dictionary
screen, and `SUPPORTED_L2S` — which implied capabilities it did not have.

## Decision

Consolidate `arb` into `ar`:

1. **Migrate all `arb` content rows to `ar`** in the Supabase `public` schema:
   `youtube_videos` (164), `video_embeddings` (164), `youtube_channels` (15),
   `talks` (3), `tv_shows` (3), `phrasebooks` (3).
2. **Drop the now-empty partial index**
   `video_embeddings_hnsw_l2_arb` (the existing `..._l2_ar` partial index
   covers the migrated rows).
3. **Remove `arb` from the supported language lists**:
   - `packages/shared/src/constants.ts` → `SUPPORTED_L2S` (feeds both
     `apps/web` and `apps/mobile`);
   - `apps/web/src/lib/language-data.ts` → `LANGUAGE_NAMES`;
   - `zerotohero-python-server/utils_language.py` → `LANGUAGES_WITH_CONTENT`
     and `LANGUAGE_VIDEO_COUNT` (with `ar` updated 9,017 → 9,181).
4. **Leave user-data rows referencing `arb` untouched for now**
   (`user_watch_history` 180, `user_progress` 52, `user_likes` 15,
   `user_notes` 4, `user_saved_words` 2, `user_saved_phrases` 1). A blind
   `UPDATE` conflicts with unique keys such as
   `user_progress (user_id, l2)` and `user_saved_words (user_id, l2, word_id)`
   where the same user already has `ar` rows; migrating them requires a
   deliberate merge policy (sum time, keep max level, dedupe words/phrases)
   and is tracked as a follow-up.

## Consequences

- `ar` now has 9,181 videos; the language picker and offline-dictionary screen
  no longer list `arb`.
- Existing `arb` video URLs/ids are unchanged; only the `l2` code changed.
- Any client-side filters built around `SUPPORTED_L2S` no longer see `arb`.
- User data in `arb` is hidden from UI surfaces that enumerate supported
  languages until the follow-up merge migration runs (no data is deleted).
- The Glottolog reference files (`data/languages.csv`, the `languages` table)
  keep `arb` — they are canonical ISO reference data, not product-supported
  lists.

## Migration & Rollback

Executed transactionally on 2026-08-08. Affected row keys were copied to
`public.backup_arb_to_ar_20260808` (`table_name`, `row_id`) before the update
so the content tables can be restored with
`UPDATE <table> SET l2 = 'arb' WHERE <pk> IN (SELECT <pk> FROM backup ...)`
if ever needed. The dropped partial index can be recreated as:

```sql
CREATE INDEX video_embeddings_hnsw_l2_arb
ON public.video_embeddings USING hnsw (embedding vector_cosine_ops)
WHERE kind = 'metadata' AND model = 'gemini-embedding-2@1024' AND l2 = 'arb';
```
