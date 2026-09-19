-- Ensure the reference data used by Kelola Data is indexed for stable menu reads.
create index if not exists areas_area_code_menu_idx on public.areas(area_code);
create index if not exists odps_area_code_menu_idx on public.odps(area_code);
create index if not exists internet_packages_name_menu_idx on public.internet_packages(package_name);
