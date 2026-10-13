-- ============================================================================
-- Payout Tracker — login-based email approval for BAST and Notification Letter
-- (doc_type 'bast' and 'surat_pemberitahuan').
-- Run AFTER 20261007_payout_partner_docs.sql, 20261007b_payout_docs_per_po.sql
-- and 20261007c_payout_docs_uploader_role.sql.
-- Idempotent and additive: no DROP statements, existing policies are not changed.
--
--  • One row per approval request; the latest row per slot is the current status.
--  • The approver must sign in to SandraHub with approver_email to decide
--    (no tokens in emails).
--  • files = audit snapshot at request time: [{doc_id, file_name, size, sha256, storage_path}].
--    The server re-hashes on decision and refuses if anything changed.
--  • Browsers may only SELECT; all writes go through app/api/payout-docs/approvals/*
--    (service role, caller verified by bearer token).
--  • Approved documents are locked: RESTRICTIVE delete policies on
--    payout_partner_docs and storage.objects (bucket payout-partner-docs).
-- ============================================================================

create table if not exists public.payout_doc_approvals (
  id               bigint generated always as identity primary key,
  segment          text not null default 'partner' check (segment in ('partner','agency')),
  owner_key        text not null,
  owner_name       text,
  ref_id           text not null,
  doc_type         text not null check (doc_type in ('bast','surat_pemberitahuan')),
  files            jsonb not null default '[]'::jsonb,
  ref_title        text,
  amount_text      text,
  approver_email   text not null,
  note             text,
  requested_by     uuid,
  requested_email  text,
  requested_at     timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  status           text not null default 'pending'
                   check (status in ('pending','approved','rejected','cancelled','revoked','expired')),
  decided_by       uuid,
  decided_email    text,
  decided_at       timestamptz,
  decision_note    text,
  closed_by        uuid,          -- who cancelled / revoked
  closed_email     text,
  closed_at        timestamptz,
  close_reason     text,
  reminder_count   integer not null default 0,
  last_reminded_at timestamptz
);

create index if not exists payout_doc_approvals_slot_idx
  on public.payout_doc_approvals (segment, owner_key, ref_id, doc_type);
create index if not exists payout_doc_approvals_approver_idx
  on public.payout_doc_approvals (lower(approver_email));
create index if not exists payout_doc_approvals_files_idx
  on public.payout_doc_approvals using gin (files jsonb_path_ops);

alter table public.payout_doc_approvals enable row level security;

-- Read: anyone who may view that partner/agency (rule from migration b) + the assigned approver
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'payout_doc_approvals' and policyname = 'pda_select') then
    create policy pda_select on public.payout_doc_approvals
      for select to authenticated
      using (
        public.payout_docs_can_view2(segment, owner_key)
        or lower(approver_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
  end if;
end $$;

-- ── Lock approved documents ────────────────────────────────────────────────
-- security definer: the check must see all approvals regardless of the caller's RLS.
create or replace function public.payout_docs_is_locked(p_doc_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.payout_doc_approvals a
    where a.status = 'approved'
      and a.files @> jsonb_build_array(jsonb_build_object('doc_id', p_doc_id::text))
  );
$$;

create or replace function public.payout_docs_path_locked(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.payout_doc_approvals a
    where a.status = 'approved'
      and a.files @> jsonb_build_array(jsonb_build_object('storage_path', p_path))
  );
$$;

grant execute on function public.payout_docs_is_locked(uuid)   to authenticated;
grant execute on function public.payout_docs_path_locked(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'payout_partner_docs' and policyname = 'ppd_delete_unlocked') then
    create policy ppd_delete_unlocked on public.payout_partner_docs
      as restrictive for delete to authenticated
      using (not public.payout_docs_is_locked(id));
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects' and policyname = 'ppd_obj_delete_unlocked') then
    create policy ppd_obj_delete_unlocked on storage.objects
      as restrictive for delete to authenticated
      using (bucket_id <> 'payout-partner-docs' or not public.payout_docs_path_locked(name));
  end if;
end $$;

notify pgrst, 'reload schema';
