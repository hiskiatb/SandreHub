-- Report Merge (Buat Surat): kolom email penerima per batch.
-- Dipakai fitur blast per-ID (Surat ke mitra / Pemberitahuan / BAST) supaya
-- halaman Arsip tahu kolom Excel mana yang berisi alamat email tiap baris.
-- Aman dijalankan berulang kali.
alter table rm_letter_batches add column if not exists email_column text;
