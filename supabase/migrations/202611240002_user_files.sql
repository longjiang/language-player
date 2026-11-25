-- SPEC-113 — the private user file store.
--
-- One row per file a user created. The bytes are NOT here: they live in a tree
-- outside the web root on the shared host, reachable only by Flask with the
-- store key. This table is the authority on what exists, who owns it, and
-- whether it is still live.
--
-- Ownership follows the pattern established by the affiliates migration: a real
-- FK to auth.users with ON DELETE CASCADE, so closing an account removes the
-- metadata. Storage objects are not cascaded -- routes/auth.py deletes them via
-- the batch endpoint before the GoTrue delete.
--
-- `live_key` makes "one live file per slot" a constraint rather than a
-- convention: a replacing kind writes '<kind>:<owner_type>:<owner_id>:<slot>';
-- an appending kind leaves it NULL and is unconstrained. Voided rows keep their
-- live_key -- the partial index only counts live ones -- so history still says
-- which slot a file belonged to.

begin;

create table if not exists public.user_files (
  user_id      uuid    not null references auth.users(id) on delete cascade,
  file_id      text    not null,
  kind         text    not null,
  owner_type   text    not null,
  owner_id     text    not null,
  slot         text    not null default '',
  storage_path text    not null,
  mime         text    not null,
  byte_size    integer not null check (byte_size > 0),
  duration_ms  integer,
  live_key     text,
  created_at   bigint  not null,
  voided_at    bigint,
  primary key (user_id, file_id)
);

create unique index if not exists user_files_live_key
  on public.user_files (user_id, live_key)
  where live_key is not null and voided_at is null;

create index if not exists user_files_owner
  on public.user_files (user_id, kind, owner_type, owner_id);

-- Deny-by-default baseline: RLS on, owner-scoped policies, explicit grants.
-- Defence in depth only -- clients never speak PostgREST (ADR-0023) and Flask
-- connects as its own role.
alter table public.user_files enable row level security;

drop policy if exists owner_select on public.user_files;
drop policy if exists owner_insert on public.user_files;
drop policy if exists owner_update on public.user_files;
drop policy if exists owner_delete on public.user_files;

create policy owner_select on public.user_files
  for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.user_files
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.user_files
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy owner_delete on public.user_files
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_files to authenticated;

commit;
