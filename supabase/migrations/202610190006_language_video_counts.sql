-- SPEC-105/ARCH-037 — per-language video counts as a queryable source.
--
-- The landing page and the language picker used two hard-coded snapshots of
-- `youtube_videos` counts. This materialized view is refreshed by the daily
-- SPEC-106 maintenance worker and served by
-- `GET /stats/language-video-counts` (keyed by ISO code). The static maps stay
-- only as a build-time / API-down fallback.
--
-- The matview is ~215 rows, so a plain REFRESH is fast and takes a negligible
-- lock. The unique index is there so a future switch to
-- `REFRESH MATERIALIZED VIEW CONCURRENTLY` is a one-line change.

create materialized view if not exists public.language_video_counts as
  select l2, count(*)::bigint as total
  from public.youtube_videos
  where l2 is not null
  group by l2;

create unique index if not exists language_video_counts_l2_key
  on public.language_video_counts (l2);

-- Verify:
--   select * from public.language_video_counts order by total desc limit 10;
--   refresh materialized view public.language_video_counts;
