-- ============================================================================
-- SDP Form — Migrasi Fase 1  (Status Lifecycle sesuai SDP Operation SOP)
-- Project target: kqxnoovrwaxsnpdynbgi (SandraHub)
--
-- KONTEKS:
--   sdp_registration MASIH 0 BARIS di production (dicek langsung sebelum
--   menulis migrasi ini) → aman menambah CHECK constraint tanpa migrasi data.
--
-- PRINSIP KEAMANAN (mengikuti docs/SDP_HANDOFF.md §4):
--   • HANYA menyentuh objek SDP: sdp_registration + sdp_status_log (sudah ada).
--   • TIDAK mengubah tabel menu lain (mf_*, mc_cluster_mapping, profiles, mh_*).
--   • Non-destruktif & idempoten (IF NOT EXISTS / DROP+CREATE policy pola sama
--     dengan sdp_fase0_migration.sql) — aman diulang.
--   • Tidak mengubah RLS — kebijakan UPDATE sdp_registration yang ada sudah
--     mengizinkan submitter/bsm/pic_region/spm_sumatera menulis status sesuai
--     scope masing-masing (dicek: tidak ada policy yang menyinggung kolom status).
--
-- APA YANG DIUBAH:
--   1) 3 kolom status yang SUDAH ADA (masih free-text tanpa aturan) dikunci
--      dengan CHECK constraint mengikuti enum resmi di lib/sdp/lists.js —
--      yang sudah dicocokkan dengan sheet HQ (kolom "Circle Submit Status",
--      "HQ Validation Status", "Final Registration Status" di 01_SDP_Registration):
--        • circle_submit_status   (submission_status)   — punya Circle
--        • hq_validation_status   (hq_validation_status) — punya HQ
--        • final_registration_status (final_registration_status) — formula HQ
--   2) 2 kolom BARU untuk 2 tahap SOP yang belum ada tempatnya:
--        • system_account_status  — request akun SAP(IM3)/Oracle(3ID) (SOP stage 2)
--        • id_validation_status   — compile & validasi ID final (SOP stage 3)
--   3) Trigger updated_at otomatis (belum ada).
--   4) Trigger audit: setiap kali salah satu dari 5 kolom status berubah,
--      dicatat ke sdp_status_log (tabel sudah ada, dipakai bersama modul lain)
--      — memenuhi syarat SOP "Definition of Done: ... update master tracker".
--
-- CATATAN: kolom `status` (lowercase, dipakai SDP_BatchMonitor.jsx saat ini)
-- SENGAJA TIDAK disentuh/dihapus di migrasi ini — akan dipensiunkan di kode
-- aplikasi (diganti circle_submit_status) pada langkah berikutnya, bukan di DB,
-- supaya tidak ada breaking change di satu commit.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) KUNCI 3 KOLOM STATUS YANG SUDAH ADA DENGAN CHECK CONSTRAINT
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sdp_registration
  ALTER COLUMN circle_submit_status SET DEFAULT 'Draft';

ALTER TABLE public.sdp_registration
  DROP CONSTRAINT IF EXISTS sdp_registration_circle_submit_status_chk;
ALTER TABLE public.sdp_registration
  ADD CONSTRAINT sdp_registration_circle_submit_status_chk
  CHECK (circle_submit_status IS NULL OR circle_submit_status IN
    ('Draft','Submitted','Need Revision','Validated','Registered','Hold','Rejected'));

ALTER TABLE public.sdp_registration
  ALTER COLUMN hq_validation_status SET DEFAULT 'Not Reviewed';

ALTER TABLE public.sdp_registration
  DROP CONSTRAINT IF EXISTS sdp_registration_hq_validation_status_chk;
ALTER TABLE public.sdp_registration
  ADD CONSTRAINT sdp_registration_hq_validation_status_chk
  CHECK (hq_validation_status IS NULL OR hq_validation_status IN
    ('Not Reviewed','Validated','Need Revision','Hold','Rejected'));

ALTER TABLE public.sdp_registration
  ALTER COLUMN final_registration_status SET DEFAULT 'Draft';

ALTER TABLE public.sdp_registration
  DROP CONSTRAINT IF EXISTS sdp_registration_final_registration_status_chk;
ALTER TABLE public.sdp_registration
  ADD CONSTRAINT sdp_registration_final_registration_status_chk
  CHECK (final_registration_status IS NULL OR final_registration_status IN
    ('Draft','On Progress','Need Revision','Hold','Registered','Rejected'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) KOLOM BARU — 2 tahap SOP yang belum punya tempat di skema
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sdp_registration
  ADD COLUMN IF NOT EXISTS system_account_status text DEFAULT 'Not Started';
ALTER TABLE public.sdp_registration
  DROP CONSTRAINT IF EXISTS sdp_registration_system_account_status_chk;
ALTER TABLE public.sdp_registration
  ADD CONSTRAINT sdp_registration_system_account_status_chk
  CHECK (system_account_status IS NULL OR system_account_status IN
    ('Not Started','Requested','Created','Need Revision','Hold','N/A'));

ALTER TABLE public.sdp_registration
  ADD COLUMN IF NOT EXISTS id_validation_status text DEFAULT 'Not Yet';
ALTER TABLE public.sdp_registration
  DROP CONSTRAINT IF EXISTS sdp_registration_id_validation_status_chk;
ALTER TABLE public.sdp_registration
  ADD CONSTRAINT sdp_registration_id_validation_status_chk
  CHECK (id_validation_status IS NULL OR id_validation_status IN
    ('Not Yet','Validated','Mismatch','Need Revision'));

-- Catatan tanggal HQ menekan tiap tahap — dipakai reporting nanti (siapa/kapan).
ALTER TABLE public.sdp_registration
  ADD COLUMN IF NOT EXISTS hq_validated_at timestamptz;
ALTER TABLE public.sdp_registration
  ADD COLUMN IF NOT EXISTS hq_validated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.sdp_registration
  ADD COLUMN IF NOT EXISTS hq_revision_note text;  -- alasan Need Revision/Hold, tampil ke Circle

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) updated_at OTOMATIS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdp_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sdp_registration_updated_at ON public.sdp_registration;
CREATE TRIGGER trg_sdp_registration_updated_at
  BEFORE UPDATE ON public.sdp_registration
  FOR EACH ROW EXECUTE FUNCTION public.sdp_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) AUDIT TRAIL — tiap perubahan status dicatat ke sdp_status_log
--    (tabel sudah ada & dipakai modul lain; kita hanya menambah baris,
--    format field_changes = {"field": {"from": ..., "to": ...}, ...})
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdp_registration_log_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF NEW.circle_submit_status IS DISTINCT FROM OLD.circle_submit_status THEN
    v_changes := v_changes || jsonb_build_object('circle_submit_status',
      jsonb_build_object('from', OLD.circle_submit_status, 'to', NEW.circle_submit_status));
  END IF;
  IF NEW.hq_validation_status IS DISTINCT FROM OLD.hq_validation_status THEN
    v_changes := v_changes || jsonb_build_object('hq_validation_status',
      jsonb_build_object('from', OLD.hq_validation_status, 'to', NEW.hq_validation_status));
  END IF;
  IF NEW.final_registration_status IS DISTINCT FROM OLD.final_registration_status THEN
    v_changes := v_changes || jsonb_build_object('final_registration_status',
      jsonb_build_object('from', OLD.final_registration_status, 'to', NEW.final_registration_status));
  END IF;
  IF NEW.system_account_status IS DISTINCT FROM OLD.system_account_status THEN
    v_changes := v_changes || jsonb_build_object('system_account_status',
      jsonb_build_object('from', OLD.system_account_status, 'to', NEW.system_account_status));
  END IF;
  IF NEW.id_validation_status IS DISTINCT FROM OLD.id_validation_status THEN
    v_changes := v_changes || jsonb_build_object('id_validation_status',
      jsonb_build_object('from', OLD.id_validation_status, 'to', NEW.id_validation_status));
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.sdp_status_log
      (sdp_id, period, action, changed_by, changed_by_name, field_changes, note, changed_at)
    VALUES
      (COALESCE(NEW.sdp_id_new, NEW.id::text), NEW.submission_month, 'registration_status_update',
       auth.uid(), NEW.submitted_by_name, v_changes, NEW.hq_revision_note, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sdp_registration_status_log ON public.sdp_registration;
CREATE TRIGGER trg_sdp_registration_status_log
  AFTER UPDATE ON public.sdp_registration
  FOR EACH ROW EXECUTE FUNCTION public.sdp_registration_log_status_change();

COMMIT;

-- ============================================================================
-- ROLLBACK cepat bila perlu:
--   DROP TRIGGER IF EXISTS trg_sdp_registration_status_log ON public.sdp_registration;
--   DROP TRIGGER IF EXISTS trg_sdp_registration_updated_at ON public.sdp_registration;
--   DROP FUNCTION IF EXISTS public.sdp_registration_log_status_change();
--   DROP FUNCTION IF EXISTS public.sdp_set_updated_at();
--   ALTER TABLE public.sdp_registration DROP CONSTRAINT IF EXISTS sdp_registration_circle_submit_status_chk;
--   ALTER TABLE public.sdp_registration DROP CONSTRAINT IF EXISTS sdp_registration_hq_validation_status_chk;
--   ALTER TABLE public.sdp_registration DROP CONSTRAINT IF EXISTS sdp_registration_final_registration_status_chk;
--   ALTER TABLE public.sdp_registration DROP CONSTRAINT IF EXISTS sdp_registration_system_account_status_chk;
--   ALTER TABLE public.sdp_registration DROP CONSTRAINT IF EXISTS sdp_registration_id_validation_status_chk;
--   ALTER TABLE public.sdp_registration DROP COLUMN IF EXISTS system_account_status;
--   ALTER TABLE public.sdp_registration DROP COLUMN IF EXISTS id_validation_status;
--   ALTER TABLE public.sdp_registration DROP COLUMN IF EXISTS hq_validated_at;
--   ALTER TABLE public.sdp_registration DROP COLUMN IF EXISTS hq_validated_by;
--   ALTER TABLE public.sdp_registration DROP COLUMN IF EXISTS hq_revision_note;
-- ============================================================================

-- ============================================================================
-- HARDENING (diterapkan langsung setelah migrasi di atas, via get_advisors):
--   1) sdp_set_updated_at punya mutable search_path → dikunci SET search_path.
--   2) sdp_registration_log_status_change() bisa dipanggil langsung lewat
--      PostgREST RPC oleh anon/authenticated → REVOKE EXECUTE (harusnya hanya
--      jalan lewat trigger, bukan dipanggil manual).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.sdp_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sdp_set_updated_at() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdp_registration_log_status_change() FROM public, anon, authenticated;

COMMIT;
