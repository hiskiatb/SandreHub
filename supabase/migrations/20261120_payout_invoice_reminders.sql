-- 20261120_payout_invoice_reminders.sql
-- Payout Tracker: pengingat "Invoice Not Submitted" ke partner/agency.
--   payout_partner_contacts  = email partner/agency, diisi dari sheet "Master Mapping" saat admin Publish
--   payout_invoice_reminders = riwayat pengingat yang dikirim
-- Hanya admin SPM (spm_sumatera) & admin internal Indosat (internal_ioh) yang boleh baca/tulis.
-- Aman dijalankan ulang.

create table if not exists public.payout_partner_contacts (
  segment       text not null check (segment in ('partner','agency')),
  owner_key     text not null,
  owner_name    text,
  emails_to     text[] not null default '{}',
  emails_cc     text[] not null default '{}',
  pic           text,
  updated_by    uuid,
  updated_email text,
  updated_at    timestamptz not null default now(),
  primary key (segment, owner_key)
);

create table if not exists public.payout_invoice_reminders (
  id             bigint generated always as identity primary key,
  segment        text not null check (segment in ('partner','agency')),
  owner_key      text not null,
  owner_name     text,
  recipients     text[] not null default '{}',
  invoices       jsonb not null default '[]'::jsonb,
  invoice_count  int not null default 0,
  total_amount   numeric not null default 0,
  note           text,
  status         text not null default 'sent' check (status in ('sent','failed')),
  error          text,
  resend_id      text,
  sent_by        uuid,
  sent_email     text,
  sent_by_name   text,
  sent_at        timestamptz not null default now()
);

create index if not exists payout_invoice_reminders_owner_idx
  on public.payout_invoice_reminders (segment, owner_key, sent_at desc);

alter table public.payout_partner_contacts  enable row level security;
alter table public.payout_invoice_reminders enable row level security;

drop policy if exists payout_partner_contacts_admin on public.payout_partner_contacts;
create policy payout_partner_contacts_admin on public.payout_partner_contacts
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('spm_sumatera','internal_ioh')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('spm_sumatera','internal_ioh')));

drop policy if exists payout_invoice_reminders_admin_read on public.payout_invoice_reminders;
create policy payout_invoice_reminders_admin_read on public.payout_invoice_reminders
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('spm_sumatera','internal_ioh')));

drop policy if exists payout_invoice_reminders_admin_insert on public.payout_invoice_reminders;
create policy payout_invoice_reminders_admin_insert on public.payout_invoice_reminders
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('spm_sumatera','internal_ioh')));
