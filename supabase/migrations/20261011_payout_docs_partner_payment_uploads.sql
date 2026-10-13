-- ============================================================================
-- Payout Tracker — partners upload documents per Payment ID (PAY-…)
-- Run AFTER 20261010_payout_partner_docs_lock_partner_delete.sql.
--
-- Uploading (INSERT) already works: policies from migration b let a partner insert rows and storage
-- objects under its own owner path (partner/<own key>/PAY-…/<doc_type>/…). Nothing to change there.
--
-- What changes: 20261010 made ALL deletes under PAY-* / GEN-* SPM-only. Partners now need to
-- delete / replace their OWN uploads under a Payment ID (Invoice, Faktur Pajak, owner-signed BAST copy),
-- while the BAST / Notification Letter originals created by SPM stay SPM-only.
--
--  Table rows   : a non-SPM user may delete a PAY-*/GEN-* row only if they uploaded it
--                 (uploaded_by = auth.uid()) or it is an Invoice / Faktur Pajak slot.
--  Storage objs : the path's doc_type folder (<segment>/<owner>/<ref>/<doc_type>/<file>, foldername[4])
--                 is invoicing / faktur_pajak, or the file is an owner-signed BAST copy ("…_signed-owner…").
--                 (Path-based instead of storage.objects.owner_id, which older Supabase versions lack.)
--  The permissive policies from migration b still limit everything to the user's own partner path,
--  and the approval lock from 20261008 (approved files cannot be deleted) still applies.
--
-- Idempotent: each old policy is dropped with its own statement, each new policy is created only if missing.
-- ============================================================================

drop policy if exists ppd_delete_generated_spm_only on public.payout_partner_docs;

drop policy if exists ppd_obj_delete_generated_spm_only on storage.objects;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'payout_partner_docs' and policyname = 'ppd_delete_generated_own_uploads') then
    create policy ppd_delete_generated_own_uploads on public.payout_partner_docs
      as restrictive for delete to authenticated
      using (
        public.payout_docs_my_role() = 'spm_sumatera'
        or (coalesce(ref_id, '') not like 'PAY-%' and coalesce(ref_id, '') not like 'GEN-%')
        or uploaded_by = auth.uid()
        or doc_type in ('invoicing', 'faktur_pajak')
      );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects' and policyname = 'ppd_obj_delete_generated_own_uploads') then
    create policy ppd_obj_delete_generated_own_uploads on storage.objects
      as restrictive for delete to authenticated
      using (
        bucket_id <> 'payout-partner-docs'
        or public.payout_docs_my_role() = 'spm_sumatera'
        or (coalesce((storage.foldername(name))[3], '') not like 'PAY-%'
            and coalesce((storage.foldername(name))[3], '') not like 'GEN-%')
        or (storage.foldername(name))[4] in ('invoicing', 'faktur_pajak')
        or storage.filename(name) like '%\_signed-owner%'
      );
  end if;
end $$;

notify pgrst, 'reload schema';
