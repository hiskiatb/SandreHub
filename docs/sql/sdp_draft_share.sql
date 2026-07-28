-- ============================================================================
-- SDP Form — Draft server-side + Bagikan Link (expiring)   [REVIEW dulu]
-- Project: kqxnoovrwaxsnpdynbgi
--
-- TUJUAN:
--   • Menyimpan draft registrasi di server (bukan cuma localStorage).
--   • "Bagikan Link" → token acak + expires_at. Penerima membuka /isi/<token>
--     (publik, tanpa login) via RPC yang mengecek expiry; hasil isian tersimpan
--     sebagai draft (status 'submitted') — TIDAK langsung masuk sdp_registration.
--   • CSE meninjau/mengedit lalu "Finalkan" → baru insert ke sdp_registration
--     (status 'submitted') → lanjut approval BSM seperti biasa.
--
-- KEAMANAN: akses publik HANYA lewat RPC token (SECURITY DEFINER) yang membaca/
--   menulis 1 baris sesuai token & belum kedaluwarsa. Tabel-nya RLS: hanya
--   pemilik (created_by) yang bisa baca/tulis langsung.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sdp_draft (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token             uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by        uuid NOT NULL DEFAULT auth.uid(),
  created_by_name   text,
  submitter_role    text,
  submitter_cluster text,
  submitter_branch  text,
  submitter_brand   text,
  submitter_region  text,
  label             text,                    -- ringkasan (SDP name / partner)
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'draft',   -- draft | assigned | submitted | finalized
  shared            boolean NOT NULL DEFAULT false,
  expires_at        timestamptz,
  submitted_at      timestamptz,
  finalized_at      timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sdp_draft_token ON public.sdp_draft(token);
CREATE INDEX IF NOT EXISTS ix_sdp_draft_owner ON public.sdp_draft(created_by, status);

ALTER TABLE public.sdp_draft ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sdp_draft_owner ON public.sdp_draft;
CREATE POLICY sdp_draft_owner ON public.sdp_draft
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ── RPC publik: buka draft via token (cek expiry) ───────────────────────────
CREATE OR REPLACE FUNCTION public.sdp_draft_open(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.sdp_draft;
BEGIN
  SELECT * INTO r FROM public.sdp_draft WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF r.expires_at IS NOT NULL AND r.expires_at < now() THEN
    RETURN jsonb_build_object('error','expired','expires_at',r.expires_at);
  END IF;
  IF r.status NOT IN ('draft','assigned','submitted') THEN
    RETURN jsonb_build_object('error','closed','status',r.status);
  END IF;
  RETURN jsonb_build_object(
    'ok', true, 'payload', r.payload, 'label', r.label,
    'status', r.status, 'expires_at', r.expires_at,
    'scope', jsonb_build_object('cluster',r.submitter_cluster,'branch',r.submitter_branch,'brand',r.submitter_brand,'region',r.submitter_region)
  );
END $$;

-- ── RPC publik: submit isian via token ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdp_draft_submit(p_token uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.sdp_draft;
BEGIN
  SELECT * INTO r FROM public.sdp_draft WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF r.expires_at IS NOT NULL AND r.expires_at < now() THEN RETURN jsonb_build_object('error','expired'); END IF;
  IF r.status = 'finalized' THEN RETURN jsonb_build_object('error','closed'); END IF;
  UPDATE public.sdp_draft
     SET payload = p_payload, status = 'submitted', submitted_at = now(), updated_at = now()
   WHERE token = p_token;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.sdp_draft_open(uuid) FROM public;
REVOKE ALL ON FUNCTION public.sdp_draft_submit(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.sdp_draft_open(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sdp_draft_submit(uuid, jsonb) TO anon, authenticated;

COMMIT;

-- ROLLBACK: DROP TABLE public.sdp_draft CASCADE;
--           DROP FUNCTION IF EXISTS public.sdp_draft_open(uuid);
--           DROP FUNCTION IF EXISTS public.sdp_draft_submit(uuid, jsonb);
