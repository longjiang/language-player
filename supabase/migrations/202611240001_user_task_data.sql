-- SPEC-111 — task data: per-blank responses and one mutable attempt per task.
--
-- Sync contract (utils_sync.py):
--   * user_task_responses — one row per (user, task, blank), last-write-wins on
--     updated_at. Per blank, not per task, so two devices editing different
--     blanks of one task both keep their work.
--   * user_task_attempts  — one row per (user, task), last-write-wins on
--     submitted_at. Submitting replaces it; there is no append and no void.
--
-- Completion is NOT stored: it is attempt.result.complete AND every required
-- recording slot having a live public.user_files row (SPEC-113). Keeping it
-- derived means deleting a take un-completes the task, which is the intended
-- rule rather than a side effect.
--
-- Recording bytes and their metadata live in public.user_files (the
-- 202611240002 migration); nothing here duplicates them.

begin;

create table if not exists public.user_task_responses (
  user_id         uuid    not null references auth.users(id) on delete cascade,
  task_id         text    not null,
  blank_id        text    not null,
  content_version integer not null,
  value           text    not null default '',
  updated_at      bigint  not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, task_id, blank_id)
);

create index if not exists user_task_responses_task
  on public.user_task_responses (user_id, task_id);

create table if not exists public.user_task_attempts (
  user_id         uuid    not null references auth.users(id) on delete cascade,
  task_id         text    not null,
  content_version integer not null,
  responses       jsonb   not null default '{}'::jsonb,
  result          jsonb,
  submitted_at    bigint  not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, task_id)
);

create index if not exists user_task_attempts_task
  on public.user_task_attempts (user_id, task_id, submitted_at desc);

-- Deny-by-default baseline: RLS on, owner-scoped policies, explicit grants.
-- Defence in depth only — clients never speak PostgREST (ADR-0023) and Flask
-- connects as its own role.
alter table public.user_task_responses enable row level security;
alter table public.user_task_attempts  enable row level security;

do $$
declare
  owner_table text;
begin
  foreach owner_table in array array[
    'user_task_responses',
    'user_task_attempts'
  ]
  loop
    execute format('drop policy if exists owner_select on public.%I', owner_table);
    execute format('drop policy if exists owner_insert on public.%I', owner_table);
    execute format('drop policy if exists owner_update on public.%I', owner_table);
    execute format('drop policy if exists owner_delete on public.%I', owner_table);

    execute format(
      'create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      owner_table
    );
    execute format(
      'create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      owner_table
    );
    execute format(
      'create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      owner_table
    );
    execute format(
      'create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      owner_table
    );

    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      owner_table
    );
  end loop;
end
$$;

commit;
