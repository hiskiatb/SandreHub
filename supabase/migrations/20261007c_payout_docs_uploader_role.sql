-- ============================================================================
-- Payout Tracker — catat role pengunggah dokumen (badge "SPM" / "Partner" / "Agency")
-- Jalankan SETELAH 20261007_payout_partner_docs.sql dan 20261007b_payout_docs_per_po.sql.
-- Aman dijalankan ulang. Tidak mengubah RLS (download oleh pemilik sudah diizinkan
-- oleh policy ppd_obj_select di migration b).
-- ============================================================================

alter table public.payout_partner_docs add column if not exists uploaded_by_role text;

-- Diisi server, bukan browser: tidak bisa dipalsukan dari client.
create or replace function public.payout_docs_set_uploader()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.uploaded_by      := auth.uid();
  new.uploaded_by_role := public.payout_docs_my_role();
  return new;
end $$;

drop trigger if exists payout_docs_set_uploader on public.payout_partner_docs;
create trigger payout_docs_set_uploader
  before insert on public.payout_partner_docs
  for each row execute function public.payout_docs_set_uploader();

-- Muat ulang cache skema PostgREST supaya kolom baru langsung terbaca
notify pgrst, 'reload schema';
