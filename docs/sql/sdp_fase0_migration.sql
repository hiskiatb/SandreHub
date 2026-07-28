-- ============================================================================
-- SDP Form — Migrasi Fase 0  (Tahap 1: Circle Sumatera)
-- Project target: kqxnoovrwaxsnpdynbgi (SandraHub)
--
-- PRINSIP KEAMANAN:
--   • HANYA menyentuh objek SDP: sdp_registration + tabel/fungsi BARU ber-prefix sdp_*.
--   • TIDAK mengubah tabel menu lain: mf_*, mc_cluster_mapping, profiles, mh_*,
--     territory_uploads, app_*, dsb.
--   • Non-destruktif & idempoten (IF NOT EXISTS / CREATE OR REPLACE) — aman diulang.
--   • Perubahan RLS hanya MENAMBAH proteksi (menutup celah anon), tidak mencabut
--     akses user yang sudah login.
--
-- Cakupan: task #5 (kolom+indeks), #6 (generator ID), #7 (export profile),
--          #8 (RLS sdp_master).
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) KOLOM HILANG DI sdp_registration  (task #5)
--    partner_territory dikirim form (REG_FIELDS) tapi belum ada kolomnya.
--    cycle_month = penanda bulan siklus/live (sumber YYMM untuk SDP ID).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sdp_registration
  ADD COLUMN IF NOT EXISTS partner_territory text;

ALTER TABLE public.sdp_registration
  ADD COLUMN IF NOT EXISTS cycle_month text;   -- mis. 'Jul-2026'

-- Indeks UNIK untuk SDP ID (tabel saat ini kosong → aman).
-- Partial index: hanya berlaku saat sdp_id_new terisi.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sdp_registration_sdp_id_new
  ON public.sdp_registration (sdp_id_new)
  WHERE sdp_id_new IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) COUNTER RUNNING-SEQUENCE per (periode, circle)  — tabel BARU  (task #6)
--    Diakses hanya lewat RPC generate_sdp_id (SECURITY DEFINER). Tanpa policy
--    publik → tidak bisa dibaca/ditulis langsung oleh client.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sdp_id_counter (
  yymm        text NOT NULL,
  circle_code text NOT NULL,
  last_seq    int  NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (yymm, circle_code)
);
ALTER TABLE public.sdp_id_counter ENABLE ROW LEVEL SECURITY;
-- sengaja TANPA policy: hanya RPC SECURITY DEFINER yang boleh menyentuhnya.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RPC generate_sdp_id  — fungsi BARU  (task #6) — mengikuti §10A spec
--    Format: [Identifier][PartnerCode][YYMM][CircleCode][Seq2]
--    Menaikkan counter secara transaksional (anti balapan saat banyak CSE submit).
--    p_seq: opsional — untuk pasangan Hybrid agar memakai seq yang sama.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_sdp_id(
  p_brand       text,            -- 'IM3' | '3ID'
  p_scope       text,            -- registration_scope (mis. 'Hybrid IM3+3ID')
  p_circle      text,            -- nama circle (mis. 'Sumatera')
  p_cycle_month text,            -- 'Jul-2026' atau '2026-07'
  p_seq         int DEFAULT NULL -- opsional: pakai seq spesifik (pasangan hybrid)
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ident       text;
  v_partner     text;
  v_circle_code text;
  v_yymm        text;
  v_is_hybrid   boolean;
  v_seq         int;
BEGIN
  -- Identifier dari brand
  v_ident := CASE upper(coalesce(p_brand,'')) WHEN 'IM3' THEN 'SDP' ELSE 'KSK' END;

  -- Partner code per BARIS (brand + status hybrid)  [§10A: 2/3/4/5]
  v_is_hybrid := (coalesce(p_scope,'') ILIKE 'Hybrid%');
  v_partner := CASE
      WHEN v_is_hybrid AND upper(coalesce(p_brand,''))='IM3' THEN '4'  -- Single Hybrid IM3
      WHEN v_is_hybrid                                       THEN '5'  -- Single Hybrid 3ID
      WHEN upper(coalesce(p_brand,''))='IM3'                 THEN '2'  -- Single IM3
      ELSE                                                       '3'   -- Single 3ID
  END;

  -- Circle code
  v_circle_code := CASE lower(trim(coalesce(p_circle,'')))
      WHEN 'sumatera'     THEN '1'
      WHEN 'jakarta raya' THEN '2'
      WHEN 'kalisumapa'   THEN '3'
      WHEN 'java'         THEN '4'
      ELSE NULL
  END;
  IF v_circle_code IS NULL THEN
    RAISE EXCEPTION 'Circle tidak dikenal untuk kode SDP ID: %', p_circle;
  END IF;

  -- YYMM dari bulan siklus ('Mon-YYYY' atau 'YYYY-MM')
  v_yymm := to_char(
    to_date(p_cycle_month,
            CASE WHEN p_cycle_month ~ '^[0-9]{4}-[0-9]{2}' THEN 'YYYY-MM' ELSE 'Mon-YYYY' END),
    'YYMM');

  -- Running sequence per (periode, circle)
  IF p_seq IS NOT NULL THEN
    v_seq := p_seq;
  ELSE
    INSERT INTO public.sdp_id_counter (yymm, circle_code, last_seq)
      VALUES (v_yymm, v_circle_code, 1)
    ON CONFLICT (yymm, circle_code)
      DO UPDATE SET last_seq = public.sdp_id_counter.last_seq + 1, updated_at = now()
    RETURNING last_seq INTO v_seq;
  END IF;

  RETURN v_ident || v_partner || v_yymm || v_circle_code || lpad(v_seq::text, 2, '0');
END;
$$;

REVOKE ALL     ON FUNCTION public.generate_sdp_id(text,text,text,text,int) FROM public;
GRANT  EXECUTE ON FUNCTION public.generate_sdp_id(text,text,text,text,int) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) TABEL PROFIL EXPORT  — tabel BARU  (task #7)
--    Menyimpan pemetaan field_kanonik → header HQ (jsonb) agar export tahan
--    perubahan template. Seed default diisi oleh aplikasi (bukan di migrasi ini).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sdp_export_profile (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet         text NOT NULL,                 -- '01_SDP_Registration' | '02_..' | '03_..'
  version_label text,                          -- mis. 'HQ Jul-2026'
  mapping       jsonb NOT NULL,                -- { field: {header, col_index, human_input} }
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sdp_export_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sdp_export_profile_sel ON public.sdp_export_profile;
CREATE POLICY sdp_export_profile_sel ON public.sdp_export_profile
  FOR SELECT TO authenticated
  USING (public.sdp_form_role() = ANY (ARRAY['pic_region','spm_sumatera']));

DROP POLICY IF EXISTS sdp_export_profile_wr ON public.sdp_export_profile;
CREATE POLICY sdp_export_profile_wr ON public.sdp_export_profile
  FOR ALL TO authenticated
  USING      (public.sdp_form_role() = 'spm_sumatera')
  WITH CHECK (public.sdp_form_role() = 'spm_sumatera');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RLS sdp_master  — MENUTUP CELAH ANON  (task #8)
--    Saat ini RLS OFF → siapa pun (termasuk anon) bisa membaca 328 SDP + partner.
--    Kita aktifkan RLS + izinkan SELECT untuk SEMUA user LOGIN. Ini TIDAK
--    memutus menu existing (semua menu SDP mengakses sebagai user terautentikasi),
--    hanya menutup akses anonim. Penulisan sdp_master (upload territory) memakai
--    service role → tidak terpengaruh policy ini.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sdp_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sdp_master_sel_authenticated ON public.sdp_master;
CREATE POLICY sdp_master_sel_authenticated ON public.sdp_master
  FOR SELECT TO authenticated
  USING (true);

COMMIT;

-- ============================================================================
-- CATATAN (TIDAK dijalankan otomatis — perlu keputusan terpisah):
--
--   • Pengetatan scope sdp_registration (CSE hanya baca/tulis cluster-nya) BELUM
--     disertakan agar tidak mengubah policy yang sudah ada. Dilakukan terpisah &
--     hati-hati setelah form/grid siap. Policy existing tetap: role-gated.
--
--   • Form/grid BARU WAJIB mengisi kolom submitted_by = auth.uid() saat insert,
--     karena policy INSERT sdp_registration mensyaratkan submitted_by = auth.uid().
--     (Kode form lama tidak mengisinya → itulah sebab tabel masih kosong.)
--
--   • ROLLBACK cepat bila perlu:
--       ALTER TABLE public.sdp_master DISABLE ROW LEVEL SECURITY;
--       DROP POLICY IF EXISTS sdp_master_sel_authenticated ON public.sdp_master;
--       ALTER TABLE public.sdp_registration DROP COLUMN IF EXISTS partner_territory;
--       ALTER TABLE public.sdp_registration DROP COLUMN IF EXISTS cycle_month;
--       DROP INDEX IF EXISTS public.uq_sdp_registration_sdp_id_new;
--       DROP FUNCTION IF EXISTS public.generate_sdp_id(text,text,text,text,int);
--       DROP TABLE IF EXISTS public.sdp_id_counter;
--       DROP TABLE IF EXISTS public.sdp_export_profile;
-- ============================================================================
