-- Report Merge: sinkron skema TraceHub dengan versi standalone terbaru
-- (report-merge-outlook-mac-js 2/supabase_schema.sql, 8 Okt 2026), dengan
-- prefix rm_. Semua perintah "if not exists", aman dijalankan berulang kali
-- dan tidak menghapus data. Jalankan di SQL Editor project TraceHub.

create table if not exists rm_narrative_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mapping jsonb not null default '{}',
  sender jsonb not null default '{}',
  narrative jsonb not null default '{}',
  table_cols jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rm_sent_batches (
  id uuid primary key default gen_random_uuid(),
  judul text,
  periode text,
  subject_template text,
  total_recipients int not null default 0,
  success_count int not null default 0,
  fail_count int not null default 0,
  status text not null default 'completed',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists rm_sent_batch_recipients (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references rm_sent_batches(id) on delete cascade,
  recipient_name text,
  recipient_emails text,
  recipient_ccs text,
  subject text,
  intro_text text,
  closing_text text,
  table_cols jsonb,
  table_rows jsonb,
  status text not null,
  error_message text,
  sent_at timestamptz not null default now()
);
create index if not exists idx_rm_sent_batch_recipients_batch_id on rm_sent_batch_recipients(batch_id);
create index if not exists idx_rm_sent_batches_created_at on rm_sent_batches(created_at desc);

create table if not exists rm_letter_batches (
  id uuid primary key default gen_random_uuid(),
  template_code text not null,
  letter_name text,
  periode text,
  source_sheet text,
  total_items int not null default 0,
  status text not null default 'pending_approval',
  approval_token text not null,
  approver_email text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz
);

create table if not exists rm_letter_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references rm_letter_batches(id) on delete cascade,
  seq int not null,
  row_id text,
  row_data jsonb,
  filename text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_rm_letter_batch_items_batch_id on rm_letter_batch_items(batch_id);
create index if not exists idx_rm_letter_batches_created_at on rm_letter_batches(created_at desc);
create index if not exists idx_rm_letter_batches_approval_token on rm_letter_batches(approval_token);

create table if not exists rm_app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table rm_letter_batch_items add column if not exists signature_anchor jsonb;
alter table rm_letter_batches add column if not exists signature_applied boolean not null default false;
alter table rm_letter_batches add column if not exists total_nominal numeric;
alter table rm_letter_batches add column if not exists blast_status text not null default 'not_sent';
alter table rm_letter_batches add column if not exists blast_started_at timestamptz;
alter table rm_letter_batches add column if not exists blast_finished_at timestamptz;
alter table rm_letter_batches add column if not exists blast_success_count int not null default 0;
alter table rm_letter_batches add column if not exists blast_fail_count int not null default 0;
alter table rm_letter_batches add column if not exists blast_narrative jsonb;
alter table rm_letter_batch_items add column if not exists blast_status text not null default 'pending';
alter table rm_letter_batch_items add column if not exists blast_error text;
alter table rm_letter_batch_items add column if not exists blast_sent_at timestamptz;
alter table rm_letter_batch_items add column if not exists blast_to text;
alter table rm_letter_batch_items add column if not exists blast_cc text;
create index if not exists idx_rm_letter_batches_blast_status on rm_letter_batches(blast_status);
alter table rm_letter_batches add column if not exists alur text not null default 'approval_saja';
alter table rm_letter_batches add column if not exists email_column text;

-- Semua akses lewat server (service role), jadi tabel ditutup dari kunci publik.
alter table rm_narrative_templates enable row level security;
alter table rm_sent_batches enable row level security;
alter table rm_sent_batch_recipients enable row level security;
alter table rm_letter_batches enable row level security;
alter table rm_letter_batch_items enable row level security;
alter table rm_app_settings enable row level security;

-- Bucket penyimpanan PDF surat dan tanda tangan (privat).
insert into storage.buckets (id, name, public) values
  ('rm-letter-pdfs', 'rm-letter-pdfs', false),
  ('rm-signatures', 'rm-signatures', false)
on conflict (id) do nothing;

-- Cek: daftar kolom rm_letter_batches setelah sinkron.
select column_name from information_schema.columns
where table_name = 'rm_letter_batches' order by ordinal_position;
