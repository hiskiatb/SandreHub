-- ============================================================
-- MartaHub — Schema v2 (align dengan MARTAHUB_AUTH_BLUEPRINT)
-- Jalankan di Supabase project MartaHub (ref: pemltwhyidrajbyzynks)
-- SETELAH project di-restore (saat ini INACTIVE).
-- Bersifat ADITIF & idempotent — aman dijalankan ulang.
--
-- Fokus v2:
--   A. Auth: SSO Google/Outlook + pre-provision (mh_assignments) + pending.
--   B. Sites: mh_sites dari List Site (Region→Area→Branch×Brand + urban/rural).
--   C. Activity Plan 3-step + check-in (extend mh_activities).
-- Konfigurasi provider Google & Azure(Outlook) dilakukan di Supabase Auth
-- dashboard (bukan SQL): tambahkan redirect URL app (deep link) + web.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── A. PROFILES (extend; app membaca `mh_profiles`) ─────────────────────────
create table if not exists public.mh_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Kolom scope & status (aman jika sudah ada)
alter table public.mh_profiles
  add column if not exists role        text default 'pending',   -- admin|head|tmv|bme|rge|pending
  add column if not exists region      text,                     -- north|central|south
  add column if not exists brand       text,                     -- im3|tri|both
  add column if not exists branch_id   text,
  add column if not exists branch_name text,
  add column if not exists coverage    text,                     -- urban(BME)|rural(RGE)
  add column if not exists status      text default 'pending',   -- active|pending
  add column if not exists assignment_id uuid;

-- ── A. ASSIGNMENTS (allowlist email — pre-provision + fallback pending) ─────
create table if not exists public.mh_assignments (
  id           uuid primary key default uuid_generate_v4(),
  email        text not null,                                    -- disimpan lowercase
  role         text not null check (role in ('head','tmv','bme','rge')),
  region       text,                                             -- north|central|south
  brand        text check (brand in ('im3','tri')),
  branch_id    text,
  branch_name  text,
  coverage     text check (coverage in ('urban','rural')),       -- bme=urban, rge=rural
  month        text,                                             -- YYYYMM sumber List Site
  assigned_by  uuid references auth.users(id),
  status       text not null default 'active' check (status in ('active','revoked','orphan')),
  note         text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
-- Satu email hanya boleh punya SATU assignment aktif.
create unique index if not exists mh_assign_email_active
  on public.mh_assignments (lower(email)) where status = 'active';
create index if not exists mh_assign_scope on public.mh_assignments (region, brand, branch_id);

-- ── B. SITES (List Site ter-normalisasi; TANPA nilai sensitif ke klien) ─────
create table if not exists public.mh_sites (
  id            uuid primary key default uuid_generate_v4(),
  site_id       text not null,
  site_name     text,
  brand         text not null check (brand in ('im3','tri')),    -- baris per brand
  circle        text,
  region        text,
  area          text,
  branch_id     text,
  branch        text,
  provinsi      text,
  kabupaten     text,
  kecamatan     text,
  coverage      text check (coverage in ('urban','rural')),      -- dari KEC RURAL/URBAN
  mc            text,                                             -- IM3: MC ; 3ID: Cluster 3ID
  site_type     text,
  network_cat   text check (network_cat in ('strong','medium','weak')),
  area_potential text check (area_potential in ('high','medium','low')),
  latitude      double precision,   -- CONFIDENTIAL — hanya utk hitung jarak check-in
  longitude     double precision,   -- CONFIDENTIAL
  first_seen_month text,
  last_seen_month  text,
  active        boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (site_id, brand)
);
create index if not exists mh_sites_branch_brand on public.mh_sites (branch_id, brand);
create index if not exists mh_sites_mc on public.mh_sites (mc);

create table if not exists public.mh_site_uploads (
  id           uuid primary key default uuid_generate_v4(),
  month        text not null,
  total        integer default 0,
  new_count    integer default 0,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz default now()
);

-- ── C. ACTIVITY PLAN 3-step (extend mh_activities yang sudah ada) ───────────
create table if not exists public.mh_activities (
  id          uuid primary key default uuid_generate_v4(),
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.mh_activities
  -- Step 1 Plan Info
  add column if not exists brand            text,                 -- im3|tri (dari user)
  add column if not exists branch_id        text,
  add column if not exists mc               text,                 -- Micro Cluster
  add column if not exists event_name       text,
  add column if not exists event_categories jsonb default '[]',   -- multi: directSelling|jointEvent|openBooth|project|sponsorship|thematic
  add column if not exists plan_date_start  date,
  add column if not exists plan_date_end    date,                 -- null = 1 hari
  -- Step 2 Location
  add column if not exists site_id          text,
  add column if not exists network_category text check (network_category in ('strong','medium','weak')),
  add column if not exists area_potential   text check (area_potential in ('high','medium','low')),
  add column if not exists address          text,
  add column if not exists poi              jsonb default '[]',   -- multi: government|market|publicArea|sportStadium|villages
  -- Step 3 Check-in
  add column if not exists checkin_lat       double precision,
  add column if not exists checkin_lng       double precision,
  add column if not exists checkin_distance  double precision,
  add column if not exists checkin_valid     boolean,
  add column if not exists nearest_sites     jsonb,
  add column if not exists checkin_at        timestamptz,
  -- status umum
  add column if not exists status           text default 'draft'; -- draft|planned|checked_in|done|cancelled

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.mh_profiles    enable row level security;
alter table public.mh_assignments enable row level security;
alter table public.mh_sites       enable row level security;
alter table public.mh_activities  enable row level security;

-- Helper: role & scope user saat ini
create or replace function public.mh_role() returns text language sql stable security definer as $$
  select role from public.mh_profiles where id = auth.uid()
$$;
create or replace function public.mh_is_admin() returns boolean language sql stable security definer as $$
  select coalesce((select role from public.mh_profiles where id = auth.uid()) in ('admin','head','tmv'), false)
$$;

-- Profile: user lihat/kelola profilnya sendiri; admin/atasan lihat semua (read).
drop policy if exists mh_profile_self on public.mh_profiles;
create policy mh_profile_self on public.mh_profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists mh_profile_admin_read on public.mh_profiles;
create policy mh_profile_admin_read on public.mh_profiles for select using (public.mh_is_admin());

-- Assignments: hanya admin/head/tmv yang kelola; user boleh lihat entri utk emailnya.
drop policy if exists mh_assign_manage on public.mh_assignments;
create policy mh_assign_manage on public.mh_assignments for all using (public.mh_is_admin()) with check (public.mh_is_admin());
drop policy if exists mh_assign_self on public.mh_assignments;
create policy mh_assign_self on public.mh_assignments for select using (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

-- Sites: semua user MartaHub yang login boleh baca (dibatasi client per scope).
drop policy if exists mh_sites_read on public.mh_sites;
create policy mh_sites_read on public.mh_sites for select using (auth.uid() is not null);
drop policy if exists mh_sites_admin_write on public.mh_sites;
create policy mh_sites_admin_write on public.mh_sites for all using (public.mh_is_admin()) with check (public.mh_is_admin());

-- Activities: pembuat kelola miliknya; atasan lihat semua.
drop policy if exists mh_activities_own on public.mh_activities;
create policy mh_activities_own on public.mh_activities for all
  using (auth.uid() = created_by or public.mh_is_admin())
  with check (auth.uid() = created_by or public.mh_is_admin());

-- ── Auto-bind saat user SSO pertama kali (Google/Outlook) ───────────────────
-- Cocokkan email ke mh_assignments → isi profile + status. Kalau tak ada → pending.
create or replace function public.mh_handle_new_user()
returns trigger language plpgsql security definer as $$
declare a record;
begin
  select * into a from public.mh_assignments
   where lower(email) = lower(new.email) and status = 'active' limit 1;

  insert into public.mh_profiles (id, email, full_name, role, region, brand, branch_id, branch_name, coverage, status, assignment_id)
  values (
    new.id, lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    coalesce(a.role, 'pending'),
    a.region, a.brand, a.branch_id, a.branch_name, a.coverage,
    case when a.id is not null then 'active' else 'pending' end,
    a.id
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.mh_profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists mh_on_auth_user_created on auth.users;
create trigger mh_on_auth_user_created
  after insert on auth.users
  for each row execute function public.mh_handle_new_user();

-- Fungsi bind ulang (dipanggil app saat login / setelah admin assign):
-- upgrade profile pending → aktif kalau emailnya sudah ada di assignments.
create or replace function public.mh_rebind_me()
returns public.mh_profiles language plpgsql security definer as $$
declare a record; p public.mh_profiles;
begin
  select * into a from public.mh_assignments
   where lower(email) = lower(coalesce(auth.jwt()->>'email','')) and status='active' limit 1;
  if a.id is not null then
    update public.mh_profiles set
      role=a.role, region=a.region, brand=a.brand, branch_id=a.branch_id,
      branch_name=a.branch_name, coverage=a.coverage, status='active', assignment_id=a.id, updated_at=now()
    where id = auth.uid() returning * into p;
  else
    select * into p from public.mh_profiles where id = auth.uid();
  end if;
  return p;
end;
$$;

-- ── updated_at triggers ─────────────────────────────────────────────────────
create or replace function public.mh_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists mh_profiles_touch on public.mh_profiles;
create trigger mh_profiles_touch before update on public.mh_profiles for each row execute function public.mh_touch();
drop trigger if exists mh_activities_touch on public.mh_activities;
create trigger mh_activities_touch before update on public.mh_activities for each row execute function public.mh_touch();

-- ============================================================
-- Catatan:
-- • Provider SSO (Google + Azure/Outlook) diaktifkan di Auth dashboard.
-- • Deep link mobile (mis. martahub://login-callback) & URL web didaftarkan
--   sebagai Redirect URLs.
-- • Lat/long site hanya untuk hitung jarak check-in — idealnya via RPC/Edge
--   (server-side) agar tak di-expose mentah ke klien; policy read saat ini
--   masih authenticated-read (perketat bila perlu).
-- ============================================================
