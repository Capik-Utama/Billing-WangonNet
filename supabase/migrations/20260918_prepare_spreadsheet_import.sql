create extension if not exists pgcrypto;

create table if not exists public.data_import_batches (
  id uuid primary key default gen_random_uuid(),
  spreadsheet_id text not null,
  source_title text,
  imported_at timestamptz not null default now(),
  status text not null default 'prepared' check (status in ('prepared','running','completed','failed')),
  notes text
);

create table if not exists public.source_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.data_import_batches(id) on delete cascade,
  sheet_name text not null,
  source_row_number integer not null,
  row_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (batch_id, sheet_name, source_row_number)
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  source_code text,
  branch_name text not null,
  branch_code text,
  source_row_id uuid references public.source_sheet_rows(id) on delete set null,
  raw_record jsonb not null default '{}'::jsonb,
  unique (source_code)
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  area_code text not null unique,
  area_name text,
  branch_code text,
  area_abbreviation text,
  source_row_id uuid references public.source_sheet_rows(id) on delete set null,
  raw_record jsonb not null default '{}'::jsonb
);

create table if not exists public.internet_packages (
  id uuid primary key default gen_random_uuid(),
  branch_code text,
  package_code text not null,
  package_name text,
  price numeric(14,2) not null default 0,
  mikrotik_profile_name text,
  upload_max_limit_mbps numeric,
  upload_burst_limit_mbps numeric,
  upload_burst_threshold_mbps numeric,
  upload_burst_time_seconds numeric,
  download_max_limit_mbps numeric,
  download_burst_limit_mbps numeric,
  download_burst_threshold_mbps numeric,
  download_burst_time_seconds numeric,
  source_row_id uuid references public.source_sheet_rows(id) on delete set null,
  raw_record jsonb not null default '{}'::jsonb,
  unique (branch_code, package_code)
);

create table if not exists public.odps (
  id uuid primary key default gen_random_uuid(),
  odp_name text,
  area_code text,
  capacity integer,
  used_ports integer,
  latitude numeric(10,7),
  longitude numeric(10,7),
  odp_code text,
  location_code text,
  location_name text,
  source_row_id uuid references public.source_sheet_rows(id) on delete set null,
  raw_record jsonb not null default '{}'::jsonb,
  unique (odp_code)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  source_no integer,
  name text not null,
  customer_code text unique,
  branch_code text,
  area_code text,
  package_name text,
  sales_name text,
  national_id text,
  phone text,
  email text,
  whatsapp text,
  address text,
  rt text,
  rw text,
  village text,
  district text,
  city_regency text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  join_date date,
  billing_day integer,
  status text,
  active_period text,
  source_row_id uuid references public.source_sheet_rows(id) on delete set null,
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_network (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  pppoe_username text,
  pppoe_password text,
  onu_serial text,
  olt text,
  pon text,
  vlan text,
  odp_code text,
  odp_port text,
  modem_type text,
  mac_address text,
  ip_address inet,
  onu_attenuation numeric,
  odp_attenuation numeric,
  rx_ont numeric,
  rx_odp numeric,
  raw_record jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_speed_tests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  download_mbps numeric,
  upload_mbps numeric,
  ping_ms numeric,
  jitter_ms numeric,
  notes text,
  tested_at timestamptz,
  source_row_id uuid references public.source_sheet_rows(id) on delete set null,
  raw_record jsonb not null default '{}'::jsonb
);

create table if not exists public.pppoe_configs (
  id uuid primary key default gen_random_uuid(),
  pppoe_username text,
  pppoe_password text,
  profile text,
  ip_address inet,
  comment text,
  customer_name text,
  generated_username text,
  generated_password text,
  generated_ip inet,
  is_enabled boolean,
  source_row_id uuid references public.source_sheet_rows(id) on delete set null,
  raw_record jsonb not null default '{}'::jsonb
);

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  brand_name text,
  logo_url text,
  address text,
  phone text,
  email text,
  website text,
  tax_number text,
  receipt_number_format text,
  receipt_template jsonb not null default '{}'::jsonb,
  member_card_template jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_types (
  id uuid primary key default gen_random_uuid(),
  payment_type_code text unique,
  payment_type_name text not null,
  category text,
  provider_name text,
  admin_fee numeric(14,2) not null default 0,
  is_active boolean not null default true,
  raw_record jsonb not null default '{}'::jsonb
);

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  payment_type_id uuid references public.payment_types(id) on delete set null,
  bank_name text,
  account_number text,
  account_holder text,
  qris_payload text,
  is_active boolean not null default true,
  raw_record jsonb not null default '{}'::jsonb
);

create table if not exists public.member_cards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid unique references public.customers(id) on delete cascade,
  card_number text unique,
  name_on_card text,
  photo_url text,
  barcode text,
  qr_code text,
  issued_at date,
  expires_at date,
  status text,
  raw_record jsonb not null default '{}'::jsonb
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  invoice_number text unique,
  billing_period date,
  issued_at date,
  due_date date,
  amount numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  admin_fee numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) not null default 0,
  payment_status text not null default 'unpaid',
  notes text,
  raw_record jsonb not null default '{}'::jsonb
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  payment_type_id uuid references public.payment_types(id) on delete set null,
  reference_number text,
  paid_at timestamptz,
  amount numeric(14,2) not null default 0,
  admin_fee numeric(14,2) not null default 0,
  notes text,
  raw_record jsonb not null default '{}'::jsonb
);

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  channel text not null check (channel in ('whatsapp','email','sms','push','other')),
  message_template text,
  is_active boolean not null default true,
  raw_record jsonb not null default '{}'::jsonb
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  template_id uuid references public.notification_templates(id) on delete set null,
  channel text,
  destination text,
  sent_at timestamptz,
  delivery_status text,
  error_message text,
  raw_record jsonb not null default '{}'::jsonb
);

create index if not exists customers_branch_idx on public.customers(branch_code);
create index if not exists customers_area_idx on public.customers(area_code);
create index if not exists customers_status_idx on public.customers(status);
create index if not exists customer_network_ip_idx on public.customer_network(ip_address);
create index if not exists source_sheet_rows_sheet_idx on public.source_sheet_rows(sheet_name, source_row_number);
create index if not exists invoices_customer_period_idx on public.invoices(customer_id, billing_period);
create index if not exists payments_customer_paid_at_idx on public.payments(customer_id, paid_at);

alter table public.data_import_batches enable row level security;
alter table public.source_sheet_rows enable row level security;
alter table public.branches enable row level security;
alter table public.areas enable row level security;
alter table public.internet_packages enable row level security;
alter table public.odps enable row level security;
alter table public.customers enable row level security;
alter table public.customer_network enable row level security;
alter table public.customer_speed_tests enable row level security;
alter table public.pppoe_configs enable row level security;
alter table public.company_settings enable row level security;
alter table public.payment_types enable row level security;
alter table public.payment_accounts enable row level security;
alter table public.member_cards enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notifications enable row level security;
