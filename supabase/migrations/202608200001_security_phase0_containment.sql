-- Security Phase 0: contain public Data API exposure.
--
-- The current Flask backend connects as the postgres database owner, so this
-- migration intentionally does not change its behavior. It removes direct
-- anon/authenticated table access and enables RLS as a deny-by-default guard
-- while the ownership migration is rolled out.

begin;

-- Remove inherited and explicit table privileges from the public API roles.
-- Existing owner/service-role grants are not removed by the targeted revokes.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all sequences in schema public from public;

-- Enable RLS on every public base/partitioned table. Until an explicit policy
-- is added, anon/authenticated cannot access rows even if a grant is later
-- reintroduced accidentally.
do $$
declare
  item record;
begin
  for item in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'alter table %I.%I enable row level security',
      item.schema_name,
      item.table_name
    );
  end loop;
end
$$;

commit;
