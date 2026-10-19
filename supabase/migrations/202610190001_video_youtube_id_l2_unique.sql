-- One row per (youtube_id, l2).
--
-- Context. `arb` was consolidated into `ar` on 2026-08-08 (ADR-0028) by
-- changing `youtube_videos.l2` only, so videos that existed in both buckets
-- became duplicate (youtube_id, l2) rows: 119 of the 128 duplicate groups.
-- The other 9 were repeated imports / admin creates.
--
-- Applied 2026-10-19: 128 duplicate groups were merged (keeper chosen from
-- user references, then completeness, then views, then lowest id), user
-- likes/watch history/playlist references were remapped, and the loser's
-- embedding + video rows were deleted. The removed rows and the affected
-- user rows are preserved in schema `backup` as
--   backup.youtube_videos_dedupe_20261019
--   backup.user_likes_dedupe_20261019
--   backup.user_watch_history_dedupe_20261019
--   backup.user_playlists_dedupe_20261019
--
-- This file is the reproducible constraint; the data merge was a one-off.
-- It refuses to run while duplicates remain, so it can never silently create
-- an incomplete index.
--
-- Run with psql (autocommit). CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block, so this file deliberately has no BEGIN/COMMIT.
--
--   psql "$DIRECT_DATABASE_URL" -f 202610190001_video_youtube_id_l2_unique.sql

do $$
begin
  if exists (
    select 1
    from public.youtube_videos
    group by youtube_id, l2
    having count(*) > 1
  ) then
    raise exception
      'duplicate (youtube_id, l2) rows remain; run the dedupe before this migration';
  end if;
end $$;

create unique index concurrently if not exists youtube_videos_youtube_id_l2_key
  on public.youtube_videos (youtube_id, l2);

-- Verify:
--   select indisvalid, indisunique
--   from pg_index i join pg_class c on c.oid = i.indexrelid
--   where c.relname = 'youtube_videos_youtube_id_l2_key';
--
--   select count(*) from (
--     select youtube_id, l2 from public.youtube_videos
--     group by 1,2 having count(*) > 1) d;   -- must be 0
