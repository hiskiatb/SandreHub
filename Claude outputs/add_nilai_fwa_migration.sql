-- Jalankan di SQL Editor Supabase project TraceHub (kqxnoovrwaxsnpdynbgi)
-- Menambahkan kolom "nilai_fwa" (Penjualan FWA) ke tabel mf_dse_prod_ar
-- & mf_dse_prod_ar_history, plus update trigger histori supaya ikut
-- mencatat perubahan nilai_fwa.

alter table public.mf_dse_prod_ar add column if not exists nilai_fwa numeric default 0;
alter table public.mf_dse_prod_ar_history add column if not exists nilai_fwa numeric;

create or replace function public.mf_dse_prod_ar_log_history()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (tg_op = 'UPDATE') then
    if (
      old.qty_sp is distinct from new.qty_sp or
      old.nilai_sp is distinct from new.nilai_sp or
      old.nilai_fwa is distinct from new.nilai_fwa or
      old.qty_saldo is distinct from new.qty_saldo or
      old.nilai_saldo is distinct from new.nilai_saldo or
      old.qty_voucher is distinct from new.qty_voucher or
      old.nilai_voucher is distinct from new.nilai_voucher or
      old.ar_piutang is distinct from new.ar_piutang or
      old.ar_bayar is distinct from new.ar_bayar or
      old.catatan is distinct from new.catatan
    ) then
      insert into mf_dse_prod_ar_history (
        prod_ar_id, tanggal, dse_code,
        qty_sp, nilai_sp, nilai_fwa, qty_saldo, nilai_saldo, qty_voucher, nilai_voucher,
        ar_piutang, ar_bayar, catatan, changed_by, change_type
      ) values (
        old.id, old.tanggal, old.dse_code,
        old.qty_sp, old.nilai_sp, old.nilai_fwa, old.qty_saldo, old.nilai_saldo, old.qty_voucher, old.nilai_voucher,
        old.ar_piutang, old.ar_bayar, old.catatan, auth.uid(), 'update'
      );
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    insert into mf_dse_prod_ar_history (
      prod_ar_id, tanggal, dse_code,
      qty_sp, nilai_sp, nilai_fwa, qty_saldo, nilai_saldo, qty_voucher, nilai_voucher,
      ar_piutang, ar_bayar, catatan, changed_by, change_type
    ) values (
      old.id, old.tanggal, old.dse_code,
      old.qty_sp, old.nilai_sp, old.nilai_fwa, old.qty_saldo, old.nilai_saldo, old.qty_voucher, old.nilai_voucher,
      old.ar_piutang, old.ar_bayar, old.catatan, auth.uid(), 'delete'
    );
    return old;
  end if;
  return null;
end;
$function$;
