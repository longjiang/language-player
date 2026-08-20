-- Security Phase 1: establish canonical UUID ownership without discarding
-- legacy/orphaned rows.
--
-- Existing user tables contain a mixture of UUID strings, legacy numeric IDs,
-- and rows whose original auth user was deleted. The new auth_user_id columns
-- are nullable during reconciliation: a null value is intentionally denied by
-- the future RLS policies, while the original row remains recoverable.

begin;

create schema if not exists security;
revoke all on schema security from public, anon, authenticated;

do $$
declare
  table_name text;
  constraint_name text;
begin
  foreach table_name in array array[
    'user_bookshelf',
    'user_channel_preferences',
    'user_history',
    'user_likes',
    'user_notes',
    'user_playlists',
    'user_progress',
    'user_saved_phrases',
    'user_saved_word_sync_backup_20260810',
    'user_saved_words',
    'user_settings',
    'user_srs_cards',
    'user_srs_settings',
    'user_watch_history'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists auth_user_id uuid',
      table_name
    );

    execute format(
      'create index if not exists %I on public.%I (auth_user_id)',
      left('idx_' || table_name || '_auth_user_id', 63),
      table_name
    );

    -- Preserve valid current UUID owners.
    execute format($sql$
      update public.%1$I as target
      set auth_user_id = users.id
      from auth.users as users
      where target.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and target.user_id::uuid = users.id
    $sql$, table_name);

    -- Resolve any remaining legacy numeric owner through the bridge table.
    execute format($sql$
      update public.%1$I as target
      set auth_user_id = mapping.auth_user_id
      from public.user_id_map as mapping
      join auth.users as users on users.id = mapping.auth_user_id
      where target.user_id ~ '^[0-9]+$'
        and mapping.directus_user_id = target.user_id::bigint
    $sql$, table_name);

    constraint_name := left('fk_' || table_name || '_auth_user', 63);
    if not exists (
      select 1
      from pg_constraint
      where conrelid = format('public.%I', table_name)::regclass
        and conname = constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (auth_user_id) references auth.users(id) on delete cascade not valid',
        table_name,
        constraint_name
      );
    end if;
    execute format(
      'alter table public.%I validate constraint %I',
      table_name,
      constraint_name
    );
  end loop;
end
$$;

-- Keep the shadow owner column synchronized for future writes while legacy
-- user_id remains in place for the current Flask data layer.
create or replace function security.sync_auth_user_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.auth_user_id := null;

  if new.user_id is null or btrim(new.user_id::text) = '' then
    return new;
  end if;

  if new.user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select users.id
    into new.auth_user_id
    from auth.users as users
    where users.id = new.user_id::uuid;
  elsif new.user_id::text ~ '^[0-9]+$' then
    select mapping.auth_user_id
    into new.auth_user_id
    from public.user_id_map as mapping
    join auth.users as users on users.id = mapping.auth_user_id
    where mapping.directus_user_id = new.user_id::bigint;
  end if;

  return new;
end
$$;

revoke all on function security.sync_auth_user_id() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_bookshelf',
    'user_channel_preferences',
    'user_history',
    'user_likes',
    'user_notes',
    'user_playlists',
    'user_progress',
    'user_saved_phrases',
    'user_saved_word_sync_backup_20260810',
    'user_saved_words',
    'user_settings',
    'user_srs_cards',
    'user_srs_settings',
    'user_watch_history'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || table_name || '_auth_user_id', table_name);
    execute format(
      'create trigger %I before insert or update of user_id, auth_user_id on public.%I for each row execute function security.sync_auth_user_id()',
      'trg_' || table_name || '_auth_user_id',
      table_name
    );
  end loop;
end
$$;

-- The already-UUID tables can be linked directly to auth.users. The sync log
-- retains an orphan owner separately before allowing account deletion to
-- null the live owner column.
alter table public.user_sync_log add column if not exists orphan_user_id uuid;
alter table public.user_sync_log alter column user_id drop not null;
update public.user_sync_log as log
set orphan_user_id = log.user_id,
    user_id = null
where not exists (
  select 1 from auth.users as users where users.id = log.user_id
);

do $$
declare
  item record;
  table_name text;
  column_name text;
  delete_action text;
  constraint_name text;
begin
  for item in
    select * from (values
      ('feedback', 'user_id', 'set null'),
      ('user_acquisition', 'user_id', 'cascade'),
      ('user_srs_review_log', 'user_id', 'cascade'),
      ('user_subscriptions', 'user_id', 'cascade'),
      ('user_sync_log', 'user_id', 'set null'),
      ('user_sync_ops', 'user_id', 'cascade')
    ) as owners(table_name, column_name, delete_action)
  loop
    table_name := item.table_name;
    column_name := item.column_name;
    delete_action := item.delete_action;
    constraint_name := left('fk_' || table_name || '_auth_user', 63);
    if not exists (
      select 1
      from pg_constraint
      where conrelid = format('public.%I', table_name)::regclass
        and conname = constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete %s not valid',
        table_name,
        constraint_name,
        column_name,
        delete_action
      );
    end if;
    execute format(
      'alter table public.%I validate constraint %I',
      table_name,
      constraint_name
    );
  end loop;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_id_map'::regclass
      and conname = 'fk_user_id_map_auth_user'
  ) then
    alter table public.user_id_map
      add constraint fk_user_id_map_auth_user
      foreign key (auth_user_id) references auth.users(id)
      on delete cascade not valid;
  end if;
  alter table public.user_id_map validate constraint fk_user_id_map_auth_user;
end
$$;

commit;
