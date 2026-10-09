-- Lupa kata sandi MartaHub CMS (khusus role spm_sumatera).
-- Kode reset 6 digit disimpan sbg HASH (HMAC) - bukan plaintext - di tabel
-- khusus ini (BUKAN email_otps) supaya kode reset tidak bisa dipakai utk
-- registrasi / login OTP, dan sebaliknya. Hanya diakses server (service role):
-- RLS aktif tanpa policy + semua grant anon/authenticated dicabut.
create table if not exists public.marta_password_resets (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null,
  code_hash   text        not null,
  expires_at  timestamptz not null,
  attempts    int         not null default 0,
  used        boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists marta_password_resets_email_idx
  on public.marta_password_resets (email, created_at desc);

alter table public.marta_password_resets enable row level security;
revoke all on public.marta_password_resets from anon, authenticated;
