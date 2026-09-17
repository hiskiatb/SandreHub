-- ============================================================================
-- Realtime Photo Viewer (RPV) — MartaHub
-- Jalankan di project Supabase MARTAHUB (NEXT_PUBLIC_MARTA_SUPABASE_URL),
-- BUKAN di project SandraHub utama.
--
-- Konsep:
--   • rpv_sessions  = satu "event"/sesi photobooth, punya `code` unik (dipakai
--                     di URL upload/viewer/download, juga dasar QR).
--   • rpv_photos    = satu foto yang diunggah tamu ke sebuah sesi, punya
--                     `code` 6 digit sendiri (tiket klaim untuk cetak).
--   • Semua akses baca/tulis publik (tamu tanpa login) lewat RPC
--     SECURITY DEFINER di bawah — tabel aslinya TIDAK diberi akses langsung
--     ke anon, supaya orang tidak bisa query/scan seluruh tabel.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists rpv_sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  title       text not null default 'Photobooth',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists rpv_photos (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references rpv_sessions(id) on delete cascade,
  code          text unique not null,
  storage_path  text not null,
  file_name     text,
  uploaded_at   timestamptz not null default now()
);

create index if not exists rpv_photos_session_idx on rpv_photos(session_id, uploaded_at desc);

alter table rpv_sessions enable row level security;
alter table rpv_photos   enable row level security;
-- Tidak ada policy anon/authenticated di tabel ini secara sengaja — semua
-- lewat RPC (security definer) di bawah. `service_role` (dipakai server bila
-- perlu) tetap bisa akses langsung karena bypass RLS.

-- ── Helper: generator code ──────────────────────────────────────────────────
create or replace function rpv_gen_code(p_len int)
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random()*33)+1)::int, 1), '')
  from generate_series(1, p_len)
$$;

-- ── Buat sesi baru (dipanggil dari halaman internal MartaHub, sudah tergerbang login) ──
create or replace function rpv_create_session(p_title text)
returns table (code text, id uuid, title text)
language plpgsql security definer set search_path = public as $$
declare v_code text; v_id uuid;
begin
  loop
    v_code := rpv_gen_code(6);
    exit when not exists (select 1 from rpv_sessions s where s.code = v_code);
  end loop;
  insert into rpv_sessions (code, title) values (v_code, coalesce(nullif(trim(p_title), ''), 'Photobooth'))
  returning rpv_sessions.id into v_id;
  return query select v_code, v_id, coalesce(nullif(trim(p_title), ''), 'Photobooth');
end $$;
grant execute on function rpv_create_session(text) to anon, authenticated;

-- ── Info sesi dari code (validasi sebelum tampilkan halaman upload/viewer/download) ──
create or replace function rpv_session_by_code(p_code text)
returns table (id uuid, title text, is_active boolean, photo_count bigint)
language sql security definer set search_path = public as $$
  select s.id, s.title, s.is_active, count(p.id)
  from rpv_sessions s left join rpv_photos p on p.session_id = s.id
  where s.code = upper(trim(p_code))
  group by s.id, s.title, s.is_active
$$;
grant execute on function rpv_session_by_code(text) to anon, authenticated;

-- ── (LEGACY, tidak dipanggil client lagi - lihat rpv_reserve_photo/
--    rpv_confirm_photo di bawah) Daftarkan 1 foto SEKALIGUS generate
--    code+path - dibiarkan ada spy tidak breaking kalau ada pemanggil lain.
create or replace function rpv_add_photo(p_session_code text, p_file_name text)
returns table (photo_code text, storage_path text)
language plpgsql security definer set search_path = public as $$
declare v_session_id uuid; v_code text; v_path text; v_ext text;
begin
  select id into v_session_id from rpv_sessions where code = upper(trim(p_session_code)) and is_active;
  if v_session_id is null then
    raise exception 'session_not_found_or_inactive';
  end if;

  v_ext := coalesce(nullif(lower(regexp_replace(p_file_name, '^.*\.', '')), lower(p_file_name)), 'jpg');
  if length(v_ext) > 5 then v_ext := 'jpg'; end if;

  loop
    v_code := lpad((floor(random()*900000)+100000)::text, 6, '0'); -- 6 digit angka, gampang diketik
    exit when not exists (select 1 from rpv_photos where code = v_code);
  end loop;

  v_path := upper(trim(p_session_code)) || '/' || v_code || '.' || v_ext;

  insert into rpv_photos (session_id, code, storage_path, file_name)
  values (v_session_id, v_code, v_path, p_file_name);

  return query select v_code, v_path;
end $$;
grant execute on function rpv_add_photo(text, text) to anon, authenticated;

-- ── Upload sekarang dipecah 2 langkah supaya baris rpv_photos (yg memicu
--    Realtime ke layar Viewer) baru dibuat SETELAH file byte-nya benar2
--    sudah ada di Storage - sebelumnya rpv_add_photo() insert row DULUAN
--    (sebelum client selesai upload byte), jadi Viewer bisa menerima
--    event & coba render <img> sebelum filenya benar2 ada, gambar gagal
--    tampil sampai reload manual.
-- 1) Reserve code+path SAJA (tanpa insert, tanpa memicu Realtime).
create or replace function rpv_reserve_photo(p_session_code text, p_file_name text)
returns table (photo_code text, storage_path text)
language plpgsql security definer set search_path = public as $$
declare v_session_id uuid; v_code text; v_path text; v_ext text;
begin
  select id into v_session_id from rpv_sessions where code = upper(trim(p_session_code)) and is_active;
  if v_session_id is null then
    raise exception 'session_not_found_or_inactive';
  end if;

  v_ext := coalesce(nullif(lower(regexp_replace(p_file_name, '^.*\.', '')), lower(p_file_name)), 'jpg');
  if length(v_ext) > 5 then v_ext := 'jpg'; end if;

  loop
    v_code := lpad((floor(random()*900000)+100000)::text, 6, '0');
    exit when not exists (select 1 from rpv_photos where code = v_code);
  end loop;

  v_path := upper(trim(p_session_code)) || '/' || v_code || '.' || v_ext;

  return query select v_code, v_path;
end $$;
grant execute on function rpv_reserve_photo(text, text) to anon, authenticated;

-- 2) Confirm SETELAH client selesai upload byte ke storage_path yg
--    di-reserve di atas - INI yang insert baris (& memicu Realtime).
--    p_storage_path & p_photo_code divalidasi harus persis hasil reserve
--    sesi ini (prefix kode sesi) - client tidak bisa sisipkan path lain.
create or replace function rpv_confirm_photo(p_session_code text, p_photo_code text, p_storage_path text, p_file_name text)
returns table (photo_code text, storage_path text)
language plpgsql security definer set search_path = public as $$
declare v_session_id uuid; v_expected_prefix text;
begin
  select id into v_session_id from rpv_sessions where code = upper(trim(p_session_code)) and is_active;
  if v_session_id is null then
    raise exception 'session_not_found_or_inactive';
  end if;

  v_expected_prefix := upper(trim(p_session_code)) || '/';
  if left(p_storage_path, length(v_expected_prefix)) <> v_expected_prefix
     or position('/' || trim(p_photo_code) || '.' in ('/' || p_storage_path)) = 0 then
    raise exception 'storage_path_mismatch';
  end if;
  if exists (select 1 from rpv_photos where code = trim(p_photo_code)) then
    raise exception 'photo_code_already_confirmed';
  end if;

  insert into rpv_photos (session_id, code, storage_path, file_name)
  values (v_session_id, trim(p_photo_code), p_storage_path, p_file_name);

  return query select trim(p_photo_code), p_storage_path;
end $$;
grant execute on function rpv_confirm_photo(text, text, text, text) to anon, authenticated;

-- ── List semua foto dalam 1 sesi (dipakai viewer realtime & halaman download) ──
create or replace function rpv_list_photos(p_session_code text)
returns table (photo_code text, storage_path text, uploaded_at timestamptz)
language sql security definer set search_path = public as $$
  select p.code, p.storage_path, p.uploaded_at
  from rpv_photos p
  join rpv_sessions s on s.id = p.session_id
  where s.code = upper(trim(p_session_code))
  order by p.uploaded_at desc
$$;
grant execute on function rpv_list_photos(text) to anon, authenticated;

-- ── Ambil 1 foto by tiket klaim (dipakai kotak "masukkan ID utk print") ─────
create or replace function rpv_get_photo(p_photo_code text)
returns table (photo_code text, storage_path text, session_code text, uploaded_at timestamptz)
language sql security definer set search_path = public as $$
  select p.code, p.storage_path, s.code, p.uploaded_at
  from rpv_photos p join rpv_sessions s on s.id = p.session_id
  where p.code = trim(p_photo_code)
$$;
grant execute on function rpv_get_photo(text) to anon, authenticated;

-- ── Hapus 1 foto (dipakai tombol hapus di layar Viewer). Validasi photo_code
--    memang milik session_code yg dikirim, supaya sesi lain tidak bisa hapus
--    foto sesi ini walau tahu code-nya. Fungsi ini HANYA hapus baris metadata
--    di rpv_photos - byte file di Storage dihapus terpisah oleh client lewat
--    storage.remove() (lihat policy "rpv anon delete" di bawah), sebelum RPC
--    ini dipanggil - mirror pola reserve/confirm di atas.
create or replace function rpv_delete_photo(p_session_code text, p_photo_code text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_deleted int;
begin
  delete from rpv_photos p
  using rpv_sessions s
  where p.session_id = s.id
    and s.code = upper(trim(p_session_code))
    and p.code = trim(p_photo_code);
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end $$;
grant execute on function rpv_delete_photo(text, text) to anon, authenticated;

-- ============================================================================
-- STORAGE — buat bucket PUBLIC bernama "rpv-photos" (Dashboard → Storage →
-- New bucket → Public bucket = ON), lalu jalankan policy di bawah supaya
-- tamu (anon, tanpa login) boleh UPLOAD ke bucket ini. Path upload sudah
-- dikontrol lewat rpv_add_photo() di atas (tidak bisa ditebak sembarangan
-- karena mengandung code sesi + tiket klaim acak), jadi aman utk publik.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('rpv-photos', 'rpv-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "rpv anon upload" on storage.objects;
create policy "rpv anon upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'rpv-photos');

drop policy if exists "rpv anon read" on storage.objects;
create policy "rpv anon read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'rpv-photos');

drop policy if exists "rpv anon delete" on storage.objects;
create policy "rpv anon delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'rpv-photos');

-- Realtime — supaya viewer bisa subscribe INSERT baru di rpv_photos.
alter publication supabase_realtime add table rpv_photos;
