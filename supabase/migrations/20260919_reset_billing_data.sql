-- Reset all billing operational/import data for a clean manual re-entry.
-- Application users are intentionally preserved so existing logins continue to work.
truncate table
  public.payments,
  public.invoices,
  public.notifications,
  public.member_cards,
  public.customer_speed_tests,
  public.customer_network,
  public.customers,
  public.pppoe_configs,
  public.odps,
  public.internet_packages,
  public.areas,
  public.branches,
  public.source_sheet_rows,
  public.data_import_batches,
  public.payment_accounts,
  public.payment_types,
  public.notification_templates,
  public.company_settings,
  public.sync_conflicts,
  public.sync_runs
restart identity cascade;

-- Two-way synchronization is retired; remove its database-only history tables.
drop table if exists public.sync_conflicts;
drop table if exists public.sync_runs;

-- Prevent accidental recreation of the old sync-only runtime indexes.
drop index if exists public.customers_updated_at_sync_idx;
drop index if exists public.sync_runs_spreadsheet_direction_idx;
drop index if exists public.sync_conflicts_key_idx;
