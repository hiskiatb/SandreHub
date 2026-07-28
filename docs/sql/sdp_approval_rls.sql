-- ============================================================================
-- SDP Form — Approval BSM untuk SEMUA aksi CSE  (REVIEW dulu, jangan auto-apply)
-- Project: kqxnoovrwaxsnpdynbgi
--
-- TUJUAN: mengizinkan BSM (scoped branch × brand) dan PIC Region (scoped region)
--   meng-UPDATE status submission CSE (approve/reject) pada:
--     • sdp_registration   • sdp_termination   • sdp_rebordering
--   Tanpa ini, policy UPDATE existing hanya mengizinkan pemilik baris (CSE) atau
--   SPM Sumatera → tombol "Setujui/Tolak" BSM akan gagal (row-level security).
--
--   Catatan: "Edit Data" (sdp_edit_requests) TIDAK butuh policy baru — approve/
--   reject-nya lewat RPC sdp_approve_edit / sdp_reject_edit (izin di fungsi).
--
-- ALUR: submitted (CSE) → approved (BSM) → validated (SPM) | rejected(+alasan)
-- SCOPE: BSM = submitter_branch & submitter_brand-nya; PIC = submitter_region-nya.
--
-- PRINSIP: hanya objek SDP. Idempoten (DROP ... IF EXISTS + CREATE). Non-destruktif
--   (owner + SPM tetap seperti semula, hanya MENAMBAH akses BSM & PIC).
-- ============================================================================

BEGIN;

-- Ekspresi scope yang sama dipakai USING & WITH CHECK di tiap tabel.
-- (Ditulis eksplisit per tabel agar mudah di-review.)

-- 1) sdp_registration ---------------------------------------------------------
DROP POLICY IF EXISTS sdp_registration_upd ON public.sdp_registration;
CREATE POLICY sdp_registration_upd ON public.sdp_registration
  FOR UPDATE TO authenticated
  USING (
        submitted_by = auth.uid()
     OR public.sdp_form_role() = 'spm_sumatera'
     OR (public.sdp_form_role() = 'bsm'
         AND submitter_branch = (SELECT bsm_branch FROM public.profiles WHERE id = auth.uid())
         AND submitter_brand  = (SELECT bsm_brand  FROM public.profiles WHERE id = auth.uid()))
     OR (public.sdp_form_role() = 'pic_region'
         AND submitter_region = (SELECT region FROM public.profiles WHERE id = auth.uid()))
  )
  WITH CHECK (
        submitted_by = auth.uid()
     OR public.sdp_form_role() = 'spm_sumatera'
     OR (public.sdp_form_role() = 'bsm'
         AND submitter_branch = (SELECT bsm_branch FROM public.profiles WHERE id = auth.uid())
         AND submitter_brand  = (SELECT bsm_brand  FROM public.profiles WHERE id = auth.uid()))
     OR (public.sdp_form_role() = 'pic_region'
         AND submitter_region = (SELECT region FROM public.profiles WHERE id = auth.uid()))
  );

-- 2) sdp_termination ----------------------------------------------------------
DROP POLICY IF EXISTS sdp_termination_upd ON public.sdp_termination;
CREATE POLICY sdp_termination_upd ON public.sdp_termination
  FOR UPDATE TO authenticated
  USING (
        submitted_by = auth.uid()
     OR public.sdp_form_role() = 'spm_sumatera'
     OR (public.sdp_form_role() = 'bsm'
         AND submitter_branch = (SELECT bsm_branch FROM public.profiles WHERE id = auth.uid())
         AND submitter_brand  = (SELECT bsm_brand  FROM public.profiles WHERE id = auth.uid()))
     OR (public.sdp_form_role() = 'pic_region'
         AND submitter_region = (SELECT region FROM public.profiles WHERE id = auth.uid()))
  )
  WITH CHECK (
        submitted_by = auth.uid()
     OR public.sdp_form_role() = 'spm_sumatera'
     OR (public.sdp_form_role() = 'bsm'
         AND submitter_branch = (SELECT bsm_branch FROM public.profiles WHERE id = auth.uid())
         AND submitter_brand  = (SELECT bsm_brand  FROM public.profiles WHERE id = auth.uid()))
     OR (public.sdp_form_role() = 'pic_region'
         AND submitter_region = (SELECT region FROM public.profiles WHERE id = auth.uid()))
  );

-- 3) sdp_rebordering ----------------------------------------------------------
DROP POLICY IF EXISTS sdp_rebordering_upd ON public.sdp_rebordering;
CREATE POLICY sdp_rebordering_upd ON public.sdp_rebordering
  FOR UPDATE TO authenticated
  USING (
        submitted_by = auth.uid()
     OR public.sdp_form_role() = 'spm_sumatera'
     OR (public.sdp_form_role() = 'bsm'
         AND submitter_branch = (SELECT bsm_branch FROM public.profiles WHERE id = auth.uid())
         AND submitter_brand  = (SELECT bsm_brand  FROM public.profiles WHERE id = auth.uid()))
     OR (public.sdp_form_role() = 'pic_region'
         AND submitter_region = (SELECT region FROM public.profiles WHERE id = auth.uid()))
  )
  WITH CHECK (
        submitted_by = auth.uid()
     OR public.sdp_form_role() = 'spm_sumatera'
     OR (public.sdp_form_role() = 'bsm'
         AND submitter_branch = (SELECT bsm_branch FROM public.profiles WHERE id = auth.uid())
         AND submitter_brand  = (SELECT bsm_brand  FROM public.profiles WHERE id = auth.uid()))
     OR (public.sdp_form_role() = 'pic_region'
         AND submitter_region = (SELECT region FROM public.profiles WHERE id = auth.uid()))
  );

COMMIT;

-- ROLLBACK cepat (kembalikan ke: hanya pemilik + SPM) untuk tiap tabel:
--   BEGIN;
--   DROP POLICY IF EXISTS sdp_registration_upd ON public.sdp_registration;
--   CREATE POLICY sdp_registration_upd ON public.sdp_registration FOR UPDATE TO authenticated
--     USING ((submitted_by = auth.uid()) OR (public.sdp_form_role() = 'spm_sumatera'));
--   DROP POLICY IF EXISTS sdp_termination_upd ON public.sdp_termination;
--   CREATE POLICY sdp_termination_upd ON public.sdp_termination FOR UPDATE TO authenticated
--     USING ((submitted_by = auth.uid()) OR (public.sdp_form_role() = 'spm_sumatera'));
--   DROP POLICY IF EXISTS sdp_rebordering_upd ON public.sdp_rebordering;
--   CREATE POLICY sdp_rebordering_upd ON public.sdp_rebordering FOR UPDATE TO authenticated
--     USING ((submitted_by = auth.uid()) OR (public.sdp_form_role() = 'spm_sumatera'));
--   COMMIT;
-- ============================================================================
