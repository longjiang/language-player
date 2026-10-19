-- SPEC-106 — derived content data: n-gram trigger, embedding dirty flag,
-- content revision and maintenance run ledger.
--
-- Run with psql (autocommit). The file mixes ordinary DDL with
-- CREATE INDEX CONCURRENTLY, so it must not run inside a transaction block.
--
--   psql "$DIRECT_DATABASE_URL" -f 202610190004_video_derived_data.sql

-- 1. N-gram invalidation: keep a caller-supplied value, null an omitted one.
--    The application computes tokens synchronously (utils_subs_ngram); this
--    trigger stays as the safety net for raw SQL / future writers.
create or replace function public.invalidate_subs_ngram_tsv()
returns trigger language plpgsql as $$
begin
  if new.l2 not in (
    'zh', 'yue', 'cmn', 'nan', 'wuu', 'hak', 'hsn', 'cjy', 'mnp', 'cpx',
    'gan', 'csp', 'czo', 'leiz1236', 'hain1238', 'lzh', 'ltc', 'och',
    'ja', 'ryu', 'ojp', 'ain', 'ii',
    'th', 'lo', 'km', 'my', 'bo', 'dz'
  ) then
    new.subs_ngram_tsv := null;
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Keep an explicitly supplied tsvector (the app path); NULL otherwise.
    return new;
  end if;
  if new.subs_l2 is distinct from old.subs_l2
     and new.subs_ngram_tsv is not distinct from old.subs_ngram_tsv then
    new.subs_ngram_tsv := null;
  end if;
  return new;
end $$;

-- 2. Embedding dirty flag. A BEFORE trigger sets it without a second write;
--    an AFTER trigger removes the old vector so recommendations are absent
--    (never stale) until the worker re-embeds.
alter table public.youtube_videos
  add column if not exists needs_embedding boolean not null default false,
  add column if not exists embed_attempts integer not null default 0,
  add column if not exists embed_error text,
  add column if not exists embed_requested_at timestamptz;

create index concurrently if not exists youtube_videos_needs_embedding_idx
  on public.youtube_videos (embed_requested_at)
  where needs_embedding;

create or replace function public.flag_video_embedding()
returns trigger language plpgsql as $$
begin
  new.needs_embedding := true;
  new.embed_requested_at := now();
  new.embed_attempts := 0;
  new.embed_error := null;
  return new;
end $$;

drop trigger if exists youtube_videos_flag_embedding on public.youtube_videos;
create trigger youtube_videos_flag_embedding
before insert or update of
  title, tags, topic, category, channel_id, locale, level, type, l2
on public.youtube_videos
for each row execute function public.flag_video_embedding();

create or replace function public.invalidate_video_embedding()
returns trigger language plpgsql as $$
begin
  delete from public.video_embeddings where video_id = new.id;
  return null;
end $$;

drop trigger if exists youtube_videos_invalidate_embedding on public.youtube_videos;
create trigger youtube_videos_invalidate_embedding
after update of
  title, tags, topic, category, channel_id, locale, level, type, l2
on public.youtube_videos
for each row execute function public.invalidate_video_embedding();

-- 3. Embedding rows die with the video, including deletes outside the API.
do $$
begin
  if exists (
    select 1 from public.video_embeddings ve
    where not exists (select 1 from public.youtube_videos v where v.id = ve.video_id)
  ) then
    raise exception 'orphan video_embeddings rows; clean them before adding the FK';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'video_embeddings_video_id_fkey'
      and conrelid = 'public.video_embeddings'::regclass
  ) then
    alter table public.video_embeddings
      add constraint video_embeddings_video_id_fkey
      foreign key (video_id) references public.youtube_videos(id)
      on delete cascade not valid;
  end if;
end $$;

alter table public.video_embeddings
  validate constraint video_embeddings_video_id_fkey;

-- 4. Cache invalidation. Every statement that writes youtube_videos bumps one
--    revision row; the subs-search cache compares saved_at to updated_at.
create table if not exists public.content_revision (
  id smallint primary key default 1,
  rev bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint content_revision_single_row check (id = 1)
);

insert into public.content_revision (id, rev, updated_at)
values (1, 1, now())
on conflict (id) do update
  set rev = public.content_revision.rev + 1,
      updated_at = now();

create or replace function public.bump_content_revision()
returns trigger language plpgsql as $$
begin
  update public.content_revision set rev = rev + 1, updated_at = now() where id = 1;
  return null;
end $$;

drop trigger if exists youtube_videos_bump_content_revision on public.youtube_videos;
create trigger youtube_videos_bump_content_revision
after insert or update or delete on public.youtube_videos
for each statement execute function public.bump_content_revision();

-- 5. Maintenance run ledger (health panel: last successful run, processed,
--    failed). The worker and the admin "Update now" action write here.
create table if not exists public.maintenance_runs (
  id bigint generated by default as identity primary key,
  kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed integer not null default 0,
  failed integer not null default 0,
  detail text
);

create index if not exists maintenance_runs_kind_started_idx
  on public.maintenance_runs (kind, started_at desc);

-- Verify:
--   select count(*) from public.youtube_videos where needs_embedding;
--   select * from public.content_revision;
--   select convalidated from pg_constraint where conname='video_embeddings_video_id_fkey';
