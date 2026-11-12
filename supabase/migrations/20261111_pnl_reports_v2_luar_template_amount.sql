-- MPX P&L Report V2: "Di Luar Template" sekarang punya NOMINAL (amount)
-- selain keterangan teks (luar_template_note). Sudah diterapkan ke project
-- TraceHub pada 2026-11-11.
alter table public.pnl_reports_v2 add column if not exists luar_template_amount numeric default 0;
