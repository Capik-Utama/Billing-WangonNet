-- Retire the sync-only runtime indexes added by
-- 20260918_enable_two_way_sync.sql without rewriting that historical migration.
-- The retired migration introduced these objects with CREATE INDEX, so they are
-- removed by index name only; broader import/data-integrity structures stay intact.
drop index if exists public.customers_updated_at_sync_idx;
drop index if exists public.sync_runs_spreadsheet_direction_idx;
drop index if exists public.sync_conflicts_key_idx;
