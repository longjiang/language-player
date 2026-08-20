-- Security Phase 2: add authenticated owner policies and least-privilege
-- grants for user-owned learning data.

begin;

grant usage on schema public to authenticated;

-- These are the only tables in the public schema that receive direct
-- authenticated API grants. Anonymous access and all server-only tables stay
-- denied by the Phase 0 baseline.
do $$
declare
  owner_table text;
  sequence_name text;
begin
  foreach owner_table in array array[
    'user_bookshelf',
    'user_channel_preferences',
    'user_history',
    'user_likes',
    'user_notes',
    'user_playlists',
    'user_progress',
    'user_saved_phrases',
    'user_saved_words',
    'user_settings',
    'user_srs_cards',
    'user_srs_settings',
    'user_watch_history'
  ]
  loop
    execute format('alter table public.%I enable row level security', owner_table);

    execute format('drop policy if exists %I on public.%I', 'owner_select', owner_table);
    execute format('drop policy if exists %I on public.%I', 'owner_insert', owner_table);
    execute format('drop policy if exists %I on public.%I', 'owner_update', owner_table);
    execute format('drop policy if exists %I on public.%I', 'owner_delete', owner_table);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = auth_user_id)',
      'owner_select', owner_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = auth_user_id)',
      'owner_insert', owner_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = auth_user_id) with check ((select auth.uid()) = auth_user_id)',
      'owner_update', owner_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = auth_user_id)',
      'owner_delete', owner_table
    );

    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      owner_table
    );

    sequence_name := null;
    if exists (
      select 1
      from information_schema.columns as columns
      where columns.table_schema = 'public'
        and columns.table_name = owner_table
        and columns.column_name = 'id'
    ) then
      sequence_name := pg_get_serial_sequence('public.' || owner_table, 'id');
    end if;
    if sequence_name is not null then
      execute format('grant usage, select on sequence %s to authenticated', sequence_name);
    end if;
  end loop;
end
$$;

-- Child saved-word instances inherit ownership from their parent word row.
alter table public.saved_word_instances enable row level security;
drop policy if exists owner_select on public.saved_word_instances;
drop policy if exists owner_insert on public.saved_word_instances;
drop policy if exists owner_update on public.saved_word_instances;
drop policy if exists owner_delete on public.saved_word_instances;

create policy owner_select on public.saved_word_instances
for select to authenticated
using (
  exists (
    select 1
    from public.user_saved_words as words
    where words.id = saved_word_instances.saved_word_id
      and words.auth_user_id = (select auth.uid())
  )
);

create policy owner_insert on public.saved_word_instances
for insert to authenticated
with check (
  exists (
    select 1
    from public.user_saved_words as words
    where words.id = saved_word_instances.saved_word_id
      and words.auth_user_id = (select auth.uid())
  )
);

create policy owner_update on public.saved_word_instances
for update to authenticated
using (
  exists (
    select 1
    from public.user_saved_words as words
    where words.id = saved_word_instances.saved_word_id
      and words.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.user_saved_words as words
    where words.id = saved_word_instances.saved_word_id
      and words.auth_user_id = (select auth.uid())
  )
);

create policy owner_delete on public.saved_word_instances
for delete to authenticated
using (
  exists (
    select 1
    from public.user_saved_words as words
    where words.id = saved_word_instances.saved_word_id
      and words.auth_user_id = (select auth.uid())
  )
);

grant select, insert, update, delete on table public.saved_word_instances to authenticated;
do $$
declare
  sequence_name text := pg_get_serial_sequence('public.saved_word_instances', 'id');
begin
  if sequence_name is not null then
    execute format('grant usage, select on sequence %s to authenticated', sequence_name);
  end if;
end
$$;

-- Keep future SQL-created tables deny-by-default for the API roles.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;

commit;
