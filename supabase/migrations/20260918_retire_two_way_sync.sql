-- Retire the sync-only runtime indexes added by
-- 20260918_enable_two_way_sync.sql without rewriting that historical migration.
-- Exact retired index names copied from that migration:
--   customers_updated_at_sync_idx
--   sync_runs_spreadsheet_direction_idx
--   sync_conflicts_key_idx
-- The same historical file also declared source_sheet_rows_spreadsheet_sheet_row_key
-- and pppoe_configs_username_key, but those uniqueness-oriented indexes are left
-- intact here so broader import/data-integrity behavior is preserved.
drop index if exists public.customers_updated_at_sync_idx;
drop index if exists public.sync_runs_spreadsheet_direction_idx;
drop index if exists public.sync_conflicts_key_idx;
