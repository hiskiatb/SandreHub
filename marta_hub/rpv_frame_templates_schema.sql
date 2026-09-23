-- ============================================================================
-- RPV — Custom Frame Templates ("Custom" pada pilihan Bingkai di panel
-- operator): operator bisa susun elemen bebas (kotak teks: bold/tidak,
-- ukuran, font; & gambar apa saja, posisi bebas) di atas bingkai cetak,
-- lalu SIMPAN sbg template utk dipakai lagi di sesi lain kapan saja.
-- SENGAJA disimpan di DATABASE (bukan localStorage) - "pastikan ini tidak
-- tersimpan lokal namun disimpan di database" - supaya template bisa dipakai
-- dari device/browser manapun, bukan cuma HP/laptop yg dipakai bikin.
-- Pola sama dgn tabel rpv_* lain: akses HANYA lewat RPC security definer,
-- tabel asli tidak dibuka ke anon.
--
-- Jalankan di project Supabase MARTAHUB (sama seperti rpv_schema.sql).
-- ============================================================================

create table if not exists rpv_frame_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Array elemen bebas, tiap elemen: { id, type:"text"|"image", xPct, yPct,
  -- wPct, hPct (posisi/ukuran dlm persen thd bingkai, jadi resolution-
  -- independent - sama persis dipakai preview layar MAUPUN cetak fisik),
  -- lalu utk type "text": text, fontFamily, fontSize (persen tinggi
  -- bingkai), bold, color, align; utk type "image": url, opacity.
  elements    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table rpv_frame_templates enable row level security;
-- Tidak ada policy anon langsung (spt rpv_sessions/rpv_photos) - semua lewat
-- RPC security definer di bawah.

-- ── Daftar semua template tersimpan (dipakai dropdown "Muat Template") ──────
create or replace function rpv_list_frame_templates()
returns table (id uuid, name text, elements jsonb, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.elements, t.updated_at
  from rpv_frame_templates t
  order by t.updated_at desc
$$;
grant execute on function rpv_list_frame_templates() to anon, authenticated;

-- ── Simpan (insert kalau p_id NULL/tidak ada, update kalau sudah ada) ───────
create or replace function rpv_save_frame_template(p_id uuid, p_name text, p_elements jsonb)
returns table (id uuid, name text, elements jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  v_name := coalesce(nullif(trim(p_name), ''), 'Template');
  if p_id is not null and exists (select 1 from rpv_frame_templates where id = p_id) then
    update rpv_frame_templates
      set name = v_name, elements = coalesce(p_elements, '[]'::jsonb), updated_at = now()
      where id = p_id
      returning rpv_frame_templates.id into v_id;
  else
    insert into rpv_frame_templates (name, elements)
      values (v_name, coalesce(p_elements, '[]'::jsonb))
      returning rpv_frame_templates.id into v_id;
  end if;
  return query select t.id, t.name, t.elements, t.updated_at from rpv_frame_templates t where t.id = v_id;
end $$;
grant execute on function rpv_save_frame_template(uuid, text, jsonb) to anon, authenticated;

-- ── Hapus template ───────────────────────────────────────────────────────
create or replace function rpv_delete_frame_template(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_deleted int;
begin
  delete from rpv_frame_templates where id = p_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end $$;
grant execute on function rpv_delete_frame_template(uuid) to anon, authenticated;

-- ============================================================================
-- STORAGE — bucket PUBLIC baru "rpv-template-assets" khusus gambar yg
-- ditempel operator ke template custom (logo, ornamen, dst) - terpisah dari
-- "rpv-photos" (foto tamu per sesi) supaya lifecycle-nya independen (aset
-- template dipakai lintas sesi, tidak boleh ikut kehapus bareng sesi/foto).
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('rpv-template-assets', 'rpv-template-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "rpv tmpl anon upload" on storage.objects;
create policy "rpv tmpl anon upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'rpv-template-assets');

drop policy if exists "rpv tmpl anon read" on storage.objects;
create policy "rpv tmpl anon read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'rpv-template-assets');

drop policy if exists "rpv tmpl anon delete" on storage.objects;
create policy "rpv tmpl anon delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'rpv-template-assets');

-- ============================================================================
-- UPDATE — "Bentuk Dasar" template ("Penuh" vs "Polaroid Putih", biar bisa
-- taruh elemen di area putih polaroid juga) - kolom base_style baru,
-- RPC list/save disesuaikan. Jalankan SETELAH file di atas.
-- ============================================================================
alter table rpv_frame_templates add column if not exists base_style text not null default 'none';

drop function if exists rpv_list_frame_templates();
create function rpv_list_frame_templates()
returns table (id uuid, name text, elements jsonb, base_style text, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.elements, t.base_style, t.updated_at
  from rpv_frame_templates t
  order by t.updated_at desc
$$;
grant execute on function rpv_list_frame_templates() to anon, authenticated;

drop function if exists rpv_save_frame_template(uuid, text, jsonb);
-- CATATAN FIX (23 Sep 2026): RETURNS TABLE(id, ...) membuat plpgsql otomatis
-- mendeklarasikan "id" dst sbg variabel OUT dlm scope function - jadi bare
-- "id" pada WHERE di body jadi AMBIGU dgn kolom tabel & bikin error
-- "column reference id is ambiguous" saat function dipanggil (baru ketahuan
-- saat runtime, bukan saat create). Wajib qualify semua referensi kolom tabel
-- pakai alias (t.id / rpv_frame_templates.id), jangan pernah pakai bare "id".
create function rpv_save_frame_template(p_id uuid, p_name text, p_elements jsonb, p_base_style text)
returns table (id uuid, name text, elements jsonb, base_style text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text; v_base text;
begin
  v_name := coalesce(nullif(trim(p_name), ''), 'Template');
  v_base := coalesce(nullif(trim(p_base_style), ''), 'none');
  if p_id is not null and exists (select 1 from rpv_frame_templates t where t.id = p_id) then
    update rpv_frame_templates t
      set name = v_name, elements = coalesce(p_elements, '[]'::jsonb), base_style = v_base, updated_at = now()
      where t.id = p_id
      returning t.id into v_id;
  else
    insert into rpv_frame_templates (name, elements, base_style)
      values (v_name, coalesce(p_elements, '[]'::jsonb), v_base)
      returning rpv_frame_templates.id into v_id;
  end if;
  return query select t.id, t.name, t.elements, t.base_style, t.updated_at from rpv_frame_templates t where t.id = v_id;
end $$;
grant execute on function rpv_save_frame_template(uuid, text, jsonb, text) to anon, authenticated;

-- ============================================================================
-- UPDATE (23 Sep 2026) — Template DEFAULT: operator bisa tandai 1 template
-- sbg "default" (kolom is_default, jaminan hanya 1 aktif via unique partial
-- index) - dipakai OTOMATIS di frontend utk foto/sesi/device baru yg belum
-- pernah pilih template sendiri secara manual (localStorage "terakhir
-- dipakai" tetap diprioritaskan dulu utk continuity kerja yg sedang
-- berjalan di browser yg sama; default cuma fallback kalau localStorage itu
-- kosong). Sengaja di DATABASE (bukan localStorage) krn "default" harus
-- berlaku lintas device/operator, bukan cuma 1 browser.
-- ============================================================================
alter table rpv_frame_templates add column if not exists is_default boolean not null default false;

create unique index if not exists rpv_frame_templates_one_default
  on rpv_frame_templates ((true)) where is_default;

drop function if exists rpv_list_frame_templates();
create function rpv_list_frame_templates()
returns table (id uuid, name text, elements jsonb, base_style text, is_default boolean, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.elements, t.base_style, t.is_default, t.updated_at
  from rpv_frame_templates t
  order by t.is_default desc, t.updated_at desc
$$;
grant execute on function rpv_list_frame_templates() to anon, authenticated;

create or replace function rpv_set_default_frame_template(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_updated int;
begin
  update rpv_frame_templates t set is_default = false where t.is_default and t.id <> p_id;
  update rpv_frame_templates t set is_default = true where t.id = p_id;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end $$;
grant execute on function rpv_set_default_frame_template(uuid) to anon, authenticated;

create or replace function rpv_clear_default_frame_template()
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_updated int;
begin
  update rpv_frame_templates t set is_default = false where t.is_default;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end $$;
grant execute on function rpv_clear_default_frame_template() to anon, authenticated;
