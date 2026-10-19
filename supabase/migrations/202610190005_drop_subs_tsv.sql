-- SPEC-105 / ARCH-037 — drop the unused `subs_tsv` column.
--
-- `subs_tsv` was the early Supabase FTS experiment's precomputed tsvector.
-- The live full-text search uses the expression index
-- `to_tsvector(subs_tsv_config(l2), subs_l2)` (plus `subs_ngram_tsv` for
-- continua), so the column was never read or written. It was ~99.7% NULL.
--
-- Applied 2026-10-19. The 2,855 non-null values are preserved for 7 days in
-- `backup.youtube_videos_subs_tsv_20261019`.
--
-- DROP COLUMN is metadata-only in PostgreSQL; the table's physical size is not
-- reclaimed until a rewrite/VACUUM FULL, which is not needed for this column.
--
--   psql "$DIRECT_DATABASE_URL" -f 202610190005_drop_subs_tsv.sql

alter table public.youtube_videos drop column if exists subs_tsv;

-- Verify:
--   select count(*) from information_schema.columns
--   where table_schema='public' and table_name='youtube_videos'
--     and column_name='subs_tsv';           -- must be 0
--   select indisvalid from pg_index i join pg_class c on c.oid=i.indexrelid
--   where c.relname='youtube_videos_subs_tsv_idx';  -- must be true
