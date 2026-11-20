-- KPI Internal Sales — tabel penyimpanan hasil upload Excel per periode.
-- Jalankan sekali di Supabase SQL Editor (project TraceHub).
-- Satu baris = satu periode (YYYY-MM); upload ulang periode yang sama menimpa.

-- 1) Tabel
create table if not exists public.kpi_is_data (
  period            text primary key check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  file_name         text,
  data              jsonb not null,
  uploaded_by       uuid,
  uploaded_by_name  text,
  uploaded_at       timestamptz not null default now()
);

-- 2) Helper role user yang sedang login
create or replace function public.kpi_is_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;
grant execute on function public.kpi_is_my_role() to authenticated;

-- 3) RLS: lihat = SPM + semua IOH; tulis = SPM + internal_ioh
alter table public.kpi_is_data enable row level security;

drop policy if exists "kpi_is_select" on public.kpi_is_data;
create policy "kpi_is_select" on public.kpi_is_data for select to authenticated
  using (public.kpi_is_my_role() in ('spm_sumatera','circle','internal_ioh','ioh_north_sumatera','ioh_central_sumatera','ioh_south_sumatera'));

drop policy if exists "kpi_is_insert" on public.kpi_is_data;
create policy "kpi_is_insert" on public.kpi_is_data for insert to authenticated
  with check (public.kpi_is_my_role() in ('spm_sumatera','circle','internal_ioh'));

drop policy if exists "kpi_is_update" on public.kpi_is_data;
create policy "kpi_is_update" on public.kpi_is_data for update to authenticated
  using (public.kpi_is_my_role() in ('spm_sumatera','circle','internal_ioh'))
  with check (public.kpi_is_my_role() in ('spm_sumatera','circle','internal_ioh'));

drop policy if exists "kpi_is_delete" on public.kpi_is_data;
create policy "kpi_is_delete" on public.kpi_is_data for delete to authenticated
  using (public.kpi_is_my_role() in ('spm_sumatera','circle','internal_ioh'));
