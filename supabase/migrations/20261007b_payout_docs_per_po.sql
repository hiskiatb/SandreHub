-- ============================================================================
-- Payout Tracker — Dokumen per PO (nanti: per Invoice ID), Partner & Agency
-- Jalankan SETELAH 20261007_payout_partner_docs.sql. Aman dijalankan ulang.
--
--  • segment     : 'partner' (Partner Prepaid) | 'agency' (Agency Prepaid)
--  • partner_key : key pemilik (nama partner ATAU nama agency, dinormalisasi)
--  • ref_id      : nomor referensi (sekarang PO Number, nanti Invoice ID)
--  • doc_type    : invoicing | bast | surat_pemberitahuan | faktur_pajak
--  • Storage     : <segment>/<owner_key>/<ref_id>/<doc_type>/<timestamp>_<file>
--
--  Hak akses:
--    finance_mpx  → upload/hapus PO partner sendiri (profiles.partner_name)
--    agency       → upload/hapus PO agency sendiri (profiles.mf_agency_id → mf_agencies.name)
--    spm_sumatera → lihat/upload/hapus semua (merge & download diatur di UI: hanya SPM)
--    IOH          → lihat saja
--  Baris lama (upload per-partner, ref_id NULL) DIBIARKAN; UI per-PO mengabaikannya.
-- ============================================================================

do $$
begin
  if to_regclass('public.payout_partner_docs') is null then
    raise exception 'Tabel payout_partner_docs belum ada. Jalankan dulu 20261007_payout_partner_docs.sql, lalu file ini.';
  end if;
end $$;

-- 1) Kolom baru
alter table public.payout_partner_docs add column if not exists segment  text not null default 'partner';
alter table public.payout_partner_docs add column if not exists ref_id   text;
alter table public.payout_partner_docs add column if not exists doc_type text;
alter table public.payout_partner_docs alter column batch_id drop not null;
alter table public.payout_partner_docs alter column rel_path drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payout_partner_docs_segment_chk') then
    alter table public.payout_partner_docs
      add constraint payout_partner_docs_segment_chk check (segment in ('partner','agency'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payout_partner_docs_doc_type_chk') then
    alter table public.payout_partner_docs
      add constraint payout_partner_docs_doc_type_chk
      check (doc_type is null or doc_type in ('invoicing','bast','surat_pemberitahuan','faktur_pajak'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payout_partner_docs_ref_pair_chk') then
    alter table public.payout_partner_docs
      add constraint payout_partner_docs_ref_pair_chk check ((ref_id is null) = (doc_type is null));
  end if;
end $$;

create index if not exists payout_partner_docs_ref_idx     on public.payout_partner_docs (segment, ref_id, doc_type);
create index if not exists payout_partner_docs_key_ref_idx on public.payout_partner_docs (segment, partner_key, ref_id);

-- 2) Key pemilik milik user aktif, per segment
create or replace function public.payout_docs_my_owner_key(p_segment text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_role text; v_partner text; v_name text;
begin
  select role, partner_name into v_role, v_partner from public.profiles where id = auth.uid();
  if p_segment = 'partner' then
    return case when v_role = 'finance_mpx' then public.payout_partner_key(v_partner) end;
  end if;
  if p_segment = 'agency' and v_role = 'agency' then
    begin
      execute 'select a.name from public.profiles p join public.mf_agencies a on a.id = p.mf_agency_id where p.id = $1'
        into v_name using auth.uid();
    exception when undefined_column or undefined_table then
      v_name := null;  -- skema agency belum ada → agency tidak punya akses sendiri
    end;
    return public.payout_partner_key(v_name);
  end if;
  return null;
end $$;

create or replace function public.payout_docs_can_write2(p_segment text, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.payout_docs_my_role() = 'spm_sumatera'
    or (p_key is not null and p_key = public.payout_docs_my_owner_key(p_segment)),
    false);
$$;

create or replace function public.payout_docs_can_view2(p_segment text, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.payout_docs_can_view_all() or public.payout_docs_can_write2(p_segment, p_key);
$$;

grant execute on function public.payout_docs_my_owner_key(text)     to authenticated;
grant execute on function public.payout_docs_can_write2(text, text)  to authenticated;
grant execute on function public.payout_docs_can_view2(text, text)   to authenticated;

-- 3) RLS tabel (ganti policy dari migration pertama)
drop policy if exists "ppd_select" on public.payout_partner_docs;
create policy "ppd_select" on public.payout_partner_docs for select to authenticated
  using (public.payout_docs_can_view2(segment, partner_key));

drop policy if exists "ppd_insert" on public.payout_partner_docs;
create policy "ppd_insert" on public.payout_partner_docs for insert to authenticated
  with check (public.payout_docs_can_write2(segment, partner_key));

drop policy if exists "ppd_delete" on public.payout_partner_docs;
create policy "ppd_delete" on public.payout_partner_docs for delete to authenticated
  using (public.payout_docs_can_write2(segment, partner_key));

-- 4) RLS storage. Path baru: <segment>/<owner_key>/...  (folder[1]=segment, folder[2]=owner)
--    Path lama (upload per-partner): <partner_key>/...  → dianggap segment 'partner'.
create or replace function public.payout_docs_obj_segment(p_name text)
returns text language sql immutable as $$
  select case when (storage.foldername(p_name))[1] in ('partner','agency')
              then (storage.foldername(p_name))[1] else 'partner' end;
$$;
create or replace function public.payout_docs_obj_owner(p_name text)
returns text language sql immutable as $$
  select case when (storage.foldername(p_name))[1] in ('partner','agency')
              then (storage.foldername(p_name))[2] else (storage.foldername(p_name))[1] end;
$$;
grant execute on function public.payout_docs_obj_segment(text) to authenticated;
grant execute on function public.payout_docs_obj_owner(text)   to authenticated;

drop policy if exists "ppd_obj_select" on storage.objects;
create policy "ppd_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'payout-partner-docs'
         and public.payout_docs_can_view2(public.payout_docs_obj_segment(name), public.payout_docs_obj_owner(name)));

drop policy if exists "ppd_obj_insert" on storage.objects;
create policy "ppd_obj_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payout-partner-docs'
              and public.payout_docs_can_write2(public.payout_docs_obj_segment(name), public.payout_docs_obj_owner(name)));

drop policy if exists "ppd_obj_delete" on storage.objects;
create policy "ppd_obj_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'payout-partner-docs'
         and public.payout_docs_can_write2(public.payout_docs_obj_segment(name), public.payout_docs_obj_owner(name)));
