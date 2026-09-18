create unique index if not exists source_sheet_rows_spreadsheet_sheet_row_key
  on public.source_sheet_rows(spreadsheet_id, sheet_name, source_row_number);

create unique index if not exists pppoe_configs_username_key
  on public.pppoe_configs(pppoe_username)
  where pppoe_username is not null;

create index if not exists customers_updated_at_sync_idx
  on public.customers(updated_at, id);

create index if not exists sync_runs_spreadsheet_direction_idx
  on public.sync_runs(spreadsheet_id, direction, started_at desc);

create index if not exists sync_conflicts_key_idx
  on public.sync_conflicts(sheet_name, business_key, created_at desc);
