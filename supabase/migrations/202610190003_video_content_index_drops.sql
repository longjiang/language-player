-- SPEC-105 — retire indexes no current query uses.
--
-- Applied after the reproducible keep set
-- (202610190002_video_content_indexes.sql) and after the two-week scan window
-- in the live database. Each drop is reversible by rebuilding the index.
--
-- Run with psql (autocommit); DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block.
--
--   psql "$DIRECT_DATABASE_URL" -f 202610190003_video_content_index_drops.sql

-- Redundant with youtube_videos_youtube_id_l2_key (leading column).
drop index concurrently if exists public.idx_youtube_videos_youtube_id;

-- Per-language subset of youtube_videos_subs_tsv_idx; the global expression
-- index also covers `l2 = 'ru'`.
drop index concurrently if exists public.youtube_videos_subs_l2_fts_ru_idx;

-- Btree cannot serve `tags ILIKE '%tag%'`; replaced by idx_youtube_videos_tags_trgm.
drop index concurrently if exists public.idx_youtube_videos_tags;

-- Planner uses l2/channel_id then sorts; 0 recorded scans.
drop index concurrently if exists public.idx_youtube_videos_date;

-- No equality filter remains; 0 recorded scans.
drop index concurrently if exists public.idx_youtube_videos_topic;
drop index concurrently if exists public.idx_youtube_videos_type;

-- Verify the surviving set:
--   select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
--   join pg_class t on t.oid = i.indrelid
--   where t.relname = 'youtube_videos' order by 1;
