-- 20261126_payout_reminder_template.sql
-- Payout Tracker: template teks email pengingat "Invoice Not Submitted" yang bisa diedit admin.
--   1 baris (id = 'default') berisi teks: subject, opening, terms, closing, colTitle, colPeriod, colInv, colAmount.
--   Bila baris tidak ada → email memakai teks awal di lib/payoutInvoiceReminderEmail.js.
-- Hanya admin SPM (spm_sumatera) & admin internal Indosat (internal_ioh) yang boleh baca/tulis
-- (sama dengan payout_partner_contacts). Aman dijalankan ulang.

create table if not exists public.payout_reminder_template (
  id            text primary key default 'default',
  template      jsonb not null default '{}'::jsonb,
  updated_by    uuid,
  updated_email text,
  updated_at    timestamptz not null default now()
);

alter table public.payout_reminder_template enable row level security;

drop policy if exists payout_reminder_template_admin on public.payout_reminder_template;
create policy payout_reminder_template_admin on public.payout_reminder_template
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('spm_sumatera','internal_ioh')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('spm_sumatera','internal_ioh')));
