-- ============================================================================
-- Payout Tracker — Dokumen invoicing per partner
--  • Bucket privat  : payout-partner-docs   (path: <partner_key>/<batch>/<relpath>)
--  • Tabel metadata : public.payout_partner_docs
--  • finance_mpx    : lihat/upload/hapus dokumen partner sendiri
--  • spm_sumatera   : lihat/upload/hapus semua partner
--  • IOH (internal_ioh, ioh_*_sumatera) : lihat semua partner (read-only)
-- Jalankan sekali di Supabase Dashboard → SQL Editor. Aman dijalankan ulang.
-- ============================================================================

-- 1) Normalisasi nama partner → key (HARUS sama dengan partnerKey() di lib/payoutPartnerDocs.js)
--    "PT. Maju Jaya" / "Maju Jaya, PT" → "MAJU_JAYA"
create or replace function public.payout_partner_key(p_name text)
returns text language sql immutable as $$
  select nullif(
    trim(both '_' from regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(upper(trim(coalesce(p_name, ''))), '\s+', ' ', 'g'),
          '\s*,\s*(PT|CV|TBK)\.?$', ''),
        '^(PT|CV|TBK)\.?\s+', ''),
      '[^A-Z0-9]+', '_', 'g')),
    '');
$$;

-- 2) Helper profil user aktif (security definer → tidak kena RLS profiles)
create or replace function public.payout_docs_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.payout_docs_my_partner_key()
returns text language sql stable security definer set search_path = public as $$
  select public.payout_partner_key(partner_name) from public.profiles where id = auth.uid();
$$;

create or replace function public.payout_docs_can_view_all()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.payout_docs_my_role() in
    ('spm_sumatera','internal_ioh','ioh_north_sumatera','ioh_central_sumatera','ioh_south_sumatera'), false);
$$;

create or replace function public.payout_docs_can_write(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.payout_docs_my_role() = 'spm_sumatera'
    or (public.payout_docs_my_role() = 'finance_mpx' and p_key = public.payout_docs_my_partner_key()),
    false);
$$;

grant execute on function public.payout_partner_key(text)       to authenticated;
grant execute on function public.payout_docs_my_role()          to authenticated;
grant execute on function public.payout_docs_my_partner_key()   to authenticated;
grant execute on function public.payout_docs_can_view_all()     to authenticated;
grant execute on function public.payout_docs_can_write(text)    to authenticated;

-- 3) Tabel metadata
create table if not exists public.payout_partner_docs (
  id            uuid primary key default gen_random_uuid(),
  partner_key   text not null,
  partner_name  text not null,
  batch_id      text not null,              -- 1 upload folder = 1 batch
  folder_name   text,                       -- nama folder root yang diupload
  rel_path      text not null,              -- path relatif di dalam folder
  file_name     text not null,
  storage_path  text not null unique,
  mime_type     text,
  size_bytes    bigint not null default 0,
  uploaded_by   uuid default auth.uid() references auth.users(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);
create index if not exists payout_partner_docs_key_idx on public.payout_partner_docs (partner_key, uploaded_at desc);

alter table public.payout_partner_docs enable row level security;

drop policy if exists "ppd_select" on public.payout_partner_docs;
create policy "ppd_select" on public.payout_partner_docs for select to authenticated
  using (public.payout_docs_can_view_all() or partner_key = public.payout_docs_my_partner_key());

drop policy if exists "ppd_insert" on public.payout_partner_docs;
create policy "ppd_insert" on public.payout_partner_docs for insert to authenticated
  with check (public.payout_docs_can_write(partner_key));

drop policy if exists "ppd_delete" on public.payout_partner_docs;
create policy "ppd_delete" on public.payout_partner_docs for delete to authenticated
  using (public.payout_docs_can_write(partner_key));

-- 4) Bucket privat (maks 50 MB per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('payout-partner-docs', 'payout-partner-docs', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "ppd_obj_select" on storage.objects;
create policy "ppd_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'payout-partner-docs'
         and (public.payout_docs_can_view_all()
              or (storage.foldername(name))[1] = public.payout_docs_my_partner_key()));

drop policy if exists "ppd_obj_insert" on storage.objects;
create policy "ppd_obj_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payout-partner-docs'
              and public.payout_docs_can_write((storage.foldername(name))[1]));

drop policy if exists "ppd_obj_delete" on storage.objects;
create policy "ppd_obj_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'payout-partner-docs'
         and public.payout_docs_can_write((storage.foldername(name))[1]));
