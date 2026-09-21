-- ============================================================================
-- SDP Form — Migrasi Fase 2  (SDP Evaluation & PnL — SOP §5)
-- Project target: kqxnoovrwaxsnpdynbgi (SandraHub)
--
-- KONTEKS:
--   pnl_reports TIDAK punya kolom sdp_id — hanya partner_name/branch/month/year,
--   jadi tidak ada join otomatis yang bisa diandalkan (nama partner di pnl_reports
--   belum tentu sama persis dengan company_name di sdp_registration). Solusi:
--   sdp_evaluation.pnl_report_id adalah link MANUAL (dipilih user saat evaluasi),
--   bukan foreign key yang di-generate otomatis — sesuai SOP: "PnL digunakan
--   sebagai support untuk melihat kelayakan bisnis", bukan sumber utama evaluasi.
--
-- PRINSIP KEAMANAN (sama seperti sdp_fase1_lifecycle_migration.sql):
--   • HANYA menyentuh objek SDP baru: sdp_evaluation (tabel baru).
--   • TIDAK mengubah pnl_reports / tabel menu lain sama sekali.
--   • RLS meniru pola sdp_registration (submitter/bsm/pic_region/spm_sumatera).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sdp_evaluation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sdp_id text NOT NULL,                  -- = sdp_registration.sdp_id_new
  period text NOT NULL,                  -- 'YYYY-MM' bulan evaluasi
  region text,
  branch text,

  -- Link manual ke PnL (opsional, dipilih user; tidak ada auto-join)
  pnl_report_id uuid REFERENCES public.pnl_reports(id),

  -- Checklist SOP §5
  performance_data_available boolean DEFAULT false,
  kpi_relevant_checked boolean DEFAULT false,
  business_feasibility_reviewed boolean DEFAULT false,

  evaluation_status text DEFAULT 'Not Started',
  evaluation_result text,                -- Healthy / Watchlist / Critical / Need Data Validation

  -- Jika hasil gagal (Critical) → wajib ada action plan / waiver
  action_plan text,
  action_owner text,
  action_deadline date,

  waiver_required boolean DEFAULT false,
  waiver_status text,                    -- Not Required / Pending / Approved / Rejected
  waiver_approved_by text,               -- level HOC sesuai SOP
  waiver_approved_at timestamptz,
  waiver_note text,

  notes text,

  evaluated_by uuid REFERENCES auth.users(id),
  evaluated_by_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT sdp_evaluation_status_chk CHECK (evaluation_status IS NULL OR evaluation_status IN
    ('Not Started','In Progress','Completed')),
  CONSTRAINT sdp_evaluation_result_chk CHECK (evaluation_result IS NULL OR evaluation_result IN
    ('Healthy','Watchlist','Critical','Need Data Validation')),
  CONSTRAINT sdp_evaluation_waiver_status_chk CHECK (waiver_status IS NULL OR waiver_status IN
    ('Not Required','Pending','Approved','Rejected')),
  CONSTRAINT sdp_evaluation_unique_period UNIQUE (sdp_id, period)
);

CREATE INDEX IF NOT EXISTS idx_sdp_evaluation_sdp_id ON public.sdp_evaluation (sdp_id);
CREATE INDEX IF NOT EXISTS idx_sdp_evaluation_period ON public.sdp_evaluation (period);

DROP TRIGGER IF EXISTS trg_sdp_evaluation_updated_at ON public.sdp_evaluation;
CREATE TRIGGER trg_sdp_evaluation_updated_at
  BEFORE UPDATE ON public.sdp_evaluation
  FOR EACH ROW EXECUTE FUNCTION public.sdp_set_updated_at();

ALTER TABLE public.sdp_evaluation ENABLE ROW LEVEL SECURITY;

-- SELECT: siapa pun yang login bisa lihat (dashboard nasional) — meniru pola baca
-- luas yang sudah ada di sdp_registration untuk role internal.
DROP POLICY IF EXISTS sdp_evaluation_select ON public.sdp_evaluation;
CREATE POLICY sdp_evaluation_select ON public.sdp_evaluation
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE: hanya pic_region & spm_sumatera (pemilik proses evaluasi di SOP §5)
DROP POLICY IF EXISTS sdp_evaluation_insert ON public.sdp_evaluation;
CREATE POLICY sdp_evaluation_insert ON public.sdp_evaluation
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('pic_region','spm_sumatera'))
  );

DROP POLICY IF EXISTS sdp_evaluation_update ON public.sdp_evaluation;
CREATE POLICY sdp_evaluation_update ON public.sdp_evaluation
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('pic_region','spm_sumatera'))
  );

COMMIT;

-- ============================================================================
-- ROLLBACK cepat bila perlu:
--   DROP TABLE IF EXISTS public.sdp_evaluation;
-- ============================================================================
