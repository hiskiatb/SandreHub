-- ============================================================================
-- RPV — Font Custom: operator bisa upload font sendiri (.ttf/.otf/.woff/
-- .woff2) supaya bisa dipilih di kotak teks template Custom, SELAIN daftar
-- Google Fonts bawaan. Disimpan di DATABASE + Storage (bukan per-device),
-- jadi begitu diupload sekali, langsung tersedia dipakai siapa saja yg buka
-- editor template. Pola sama dgn rpv_frame_templates: akses cuma lewat RPC.
--
-- Jalankan di project Supabase MARTAHUB (sama seperti rpv_schema.sql).
-- ============================================================================

create table if not exists rpv_custom_fonts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  storage_path  text not null,
  created_at    timestamptz not null default now()
);

alter table rpv_custom_fonts enable row level security;

create or replace function rpv_list_custom_fonts()
returns table (id uuid, name text, storage_path text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select f.id, f.name, f.storage_path, f.created_at
  from rpv_custom_fonts f
  order by f.created_at desc
$$;
grant execute on function rpv_list_custom_fonts() to anon, authenticated;

create or replace function rpv_save_custom_font(p_name text, p_storage_path text)
returns table (id uuid, name text, storage_path text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into rpv_custom_fonts (name, storage_path)
    values (coalesce(nullif(trim(p_name), ''), 'Font Custom'), p_storage_path)
    returning rpv_custom_fonts.id into v_id;
  return query select f.id, f.name, f.storage_path, f.created_at from rpv_custom_fonts f where f.id = v_id;
end $$;
grant execute on function rpv_save_custom_font(text, text) to anon, authenticated;

create or replace function rpv_delete_custom_font(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_deleted int;
begin
  delete from rpv_custom_fonts where id = p_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end $$;
grant execute on function rpv_delete_custom_font(uuid) to anon, authenticated;

-- Storage — bucket publik baru khusus file font.
insert into storage.buckets (id, name, public)
values ('rpv-fonts', 'rpv-fonts', true)
on conflict (id) do update set public = true;

drop policy if exists "rpv fonts anon upload" on storage.objects;
create policy "rpv fonts anon upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'rpv-fonts');

drop policy if exists "rpv fonts anon read" on storage.objects;
create policy "rpv fonts anon read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'rpv-fonts');

drop policy if exists "rpv fonts anon delete" on storage.objects;
create policy "rpv fonts anon delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'rpv-fonts');
