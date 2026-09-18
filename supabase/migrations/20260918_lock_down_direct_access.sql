-- Deny direct REST access for public and authenticated clients.
-- The server endpoints use the service role key and the custom HMAC session.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'app_users', 'data_import_batches', 'source_sheet_rows', 'branches', 'areas',
    'internet_packages', 'odps', 'customers', 'customer_network',
    'customer_speed_tests', 'pppoe_configs', 'company_settings', 'payment_types',
    'payment_accounts', 'member_cards', 'invoices', 'payments',
    'notification_templates', 'notifications', 'sync_runs', 'sync_conflicts'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists deny_direct_public_access on public.%I', table_name);
      execute format(
        'create policy deny_direct_public_access on public.%I for all to anon, authenticated using (false) with check (false)',
        table_name
      );
    end if;
  end loop;
end $$;
