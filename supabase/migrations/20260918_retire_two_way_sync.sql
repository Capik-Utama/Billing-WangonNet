-- Retire the sync-only runtime indexes added by
-- 20260918_enable_two_way_sync.sql without rewriting that historical migration.
-- Keep broader import/data-integrity structures intact.
do $$
begin
  if to_regclass('public.customers') is not null
     and exists (
       select 1
       from pg_constraint
       where conname = 'customers_updated_at_sync_idx'
         and conrelid = to_regclass('public.customers')
     ) then
    alter table public.customers drop constraint if exists customers_updated_at_sync_idx;
  else
    drop index if exists public.customers_updated_at_sync_idx;
  end if;

  if to_regclass('public.sync_runs') is not null
     and exists (
       select 1
       from pg_constraint
       where conname = 'sync_runs_spreadsheet_direction_idx'
         and conrelid = to_regclass('public.sync_runs')
     ) then
    alter table public.sync_runs drop constraint if exists sync_runs_spreadsheet_direction_idx;
  else
    drop index if exists public.sync_runs_spreadsheet_direction_idx;
  end if;

  if to_regclass('public.sync_conflicts') is not null
     and exists (
       select 1
       from pg_constraint
       where conname = 'sync_conflicts_key_idx'
         and conrelid = to_regclass('public.sync_conflicts')
     ) then
    alter table public.sync_conflicts drop constraint if exists sync_conflicts_key_idx;
  else
    drop index if exists public.sync_conflicts_key_idx;
  end if;
end $$;
