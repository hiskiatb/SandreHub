-- ============================================================================
-- SandraHub — Login email-first + mapping email → role/branch  [REVIEW dulu]
-- Project: kqxnoovrwaxsnpdynbgi
--
-- KONSEP: admin mengisi daftar EMAIL yang boleh login untuk fitur SDP (dan
--   fitur baru lain), dipetakan ke role + branch/brand/cluster/region.
--   • Login SandraHub jadi EMAIL-FIRST: masukkan email → sistem cek mapping →
--     tampilkan role terdeteksi → lanjut password (auth tetap sama).
--   • Setelah login sukses, RPC sdp_login_apply() menyinkronkan role & scope
--     user dari mapping ke profiles. Role LAMA (finance_mpx dsb) yang TIDAK ada
--     di mapping TIDAK berubah — login mereka tetap seperti biasa.
--
-- Non-destruktif: tidak mengubah auth, tidak menyentuh role yang tak dipetakan.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sdp_login_map (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  role        text NOT NULL,               -- cse_rse | bsm | pic_region | spm_sumatera
  brand       text,                         -- IM3 | 3ID (untuk bsm/cse)
  branch      text,
  cluster     text,
  region      text,
  circle      text DEFAULT 'Sumatera',
  full_name   text,
  active      boolean NOT NULL DEFAULT true,
  note        text,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sdp_login_map_email ON public.sdp_login_map(lower(email));

ALTER TABLE public.sdp_login_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sdp_login_map_admin ON public.sdp_login_map;
CREATE POLICY sdp_login_map_admin ON public.sdp_login_map
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('spm_sumatera','finance_mpx','internal_ioh')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('spm_sumatera','finance_mpx','internal_ioh')));

-- ── RPC: cek email saat login (email-first) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdp_login_lookup(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.sdp_login_map; has_profile boolean;
BEGIN
  SELECT * INTO r FROM public.sdp_login_map WHERE lower(email) = lower(trim(p_email)) AND active LIMIT 1;
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(trim(p_email))) INTO has_profile;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'registered', has_profile);
  END IF;
  RETURN jsonb_build_object('found', true, 'registered', has_profile,
    'role', r.role, 'brand', r.brand, 'branch', r.branch, 'cluster', r.cluster, 'region', r.region, 'full_name', r.full_name);
END $$;
REVOKE ALL ON FUNCTION public.sdp_login_lookup(text) FROM public;
GRANT EXECUTE ON FUNCTION public.sdp_login_lookup(text) TO anon, authenticated;

-- ── RPC: terapkan mapping ke profiles setelah login ─────────────────────────
CREATE OR REPLACE FUNCTION public.sdp_login_apply()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); em text := auth.email(); r public.sdp_login_map;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('error','no_auth'); END IF;
  SELECT * INTO r FROM public.sdp_login_map WHERE lower(email) = lower(em) AND active LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied', false); END IF;   -- role lain: tak diubah
  UPDATE public.profiles SET
     role       = r.role,
     bsm_branch = COALESCE(r.branch, bsm_branch),
     bsm_brand  = COALESCE(r.brand,  bsm_brand),
     region     = COALESCE(r.region, region),
     cluster    = COALESCE(r.cluster, cluster),
     updated_at = now()
   WHERE id = uid;
  RETURN jsonb_build_object('applied', true, 'role', r.role);
END $$;
REVOKE ALL ON FUNCTION public.sdp_login_apply() FROM public;
GRANT EXECUTE ON FUNCTION public.sdp_login_apply() TO authenticated;

COMMIT;

-- ROLLBACK: DROP TABLE public.sdp_login_map CASCADE;
--           DROP FUNCTION IF EXISTS public.sdp_login_lookup(text);
--           DROP FUNCTION IF EXISTS public.sdp_login_apply();
