-- SPEC-105 — the surviving `public.youtube_videos` index set.
--
-- One idempotent file so a fresh database gets the same indexes the live one
-- has. On the current database every statement is a no-op except the new
-- `tags` trigram index.
--
-- Run with psql (autocommit), not inside a transaction: CREATE INDEX
-- CONCURRENTLY cannot run in a transaction block.
--
--   psql "$DIRECT_DATABASE_URL" -f 202610190002_video_content_indexes.sql
--
-- The drop side is a separate file (202610190003_video_content_index_drops.sql)
-- because drops are destructive and reviewed separately.

create extension if not exists pg_trgm;

-- Identity / dedupe -------------------------------------------------------

create unique index concurrently if not exists youtube_videos_youtube_id_l2_key
  on public.youtube_videos (youtube_id, l2);

-- Language + listing ------------------------------------------------------

create index concurrently if not exists idx_youtube_videos_l2
  on public.youtube_videos (l2);

-- Subs-search early-stop walk (SPEC-044).
create index concurrently if not exists idx_youtube_videos_l2_views
  on public.youtube_videos (l2, views desc nulls last);

-- Popular feed: `views IS NOT NULL ORDER BY views DESC` (chosen even with an
-- `l2` filter — verified 2026-10-19; keep).
create index concurrently if not exists idx_youtube_videos_views
  on public.youtube_videos (views);

create index concurrently if not exists idx_youtube_videos_difficulty
  on public.youtube_videos (difficulty);

create index concurrently if not exists idx_youtube_videos_tv_show
  on public.youtube_videos (tv_show);

create index concurrently if not exists idx_youtube_videos_talk
  on public.youtube_videos (talk);

create index concurrently if not exists idx_youtube_videos_channel_id
  on public.youtube_videos (channel_id);

create index concurrently if not exists idx_youtube_videos_category
  on public.youtube_videos (category);

create index concurrently if not exists idx_youtube_videos_lesson
  on public.youtube_videos (lesson);

create index concurrently if not exists idx_youtube_videos_level
  on public.youtube_videos (level);

-- Search ----------------------------------------------------------------

-- Word-language full-text (SPEC-039/044). Continua languages evaluate to
-- NULL via subs_tsv_config() and are not indexed here.
create index concurrently if not exists youtube_videos_subs_tsv_idx
  on public.youtube_videos
  using gin (to_tsvector(public.subs_tsv_config(l2), subs_l2));

-- Continua n-gram tokens (SPEC-045). Keep the language list in sync with
-- public.subs_tsv_config()'s NULL branch and utils_subs_ngram.CONTINUA_L2.
create index concurrently if not exists youtube_videos_subs_ngram_tsv_idx
  on public.youtube_videos using gin (subs_ngram_tsv)
  where l2 in (
    'zh', 'yue', 'cmn', 'nan', 'wuu', 'hak', 'hsn', 'cjy', 'mnp', 'cpx',
    'gan', 'csp', 'czo', 'leiz1236', 'hain1238', 'lzh', 'ltc', 'och',
    'ja', 'ryu', 'ojp', 'ain', 'ii',
    'th', 'lo', 'km', 'my', 'bo', 'dz'
  );

-- Wildcard/space-term fallback. 6.2 GB, retained deliberately (SPEC-105):
-- the n-gram tokens split on \S+ runs and cannot match across a space.
create index concurrently if not exists youtube_videos_subs_l2_trgm_idx
  on public.youtube_videos using gin (subs_l2 gin_trgm_ops);

-- Tag search (SPEC-107): `tags ILIKE '%tag%'`, leading wildcard, so a btree
-- cannot serve it.
create index concurrently if not exists idx_youtube_videos_tags_trgm
  on public.youtube_videos using gin (tags gin_trgm_ops);

-- Verify:
--   select c.relname, pg_size_pretty(pg_relation_size(i.indexrelid))
--   from pg_index i join pg_class c on c.oid = i.indexrelid
--   join pg_class t on t.oid = i.indrelid
--   where t.relname = 'youtube_videos' order by 1;
