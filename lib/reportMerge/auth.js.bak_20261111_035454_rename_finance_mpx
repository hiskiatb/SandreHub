// lib/reportMerge/auth.js
// Gate akses Report Merge: HANYA spm_sumatera + role IOH (internal_ioh,
// ioh_north_sumatera, ioh_central_sumatera, ioh_south_sumatera).
// finance_mpx (dan role lain) DITOLAK DI SINI, di server — bukan cuma
// disembunyikan di menu. Dipanggil di setiap route app/api/report-merge/*.
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set([
  "spm_sumatera",
  "internal_ioh",
  "ioh_north_sumatera",
  "ioh_central_sumatera",
  "ioh_south_sumatera",
]);

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Verifikasi header Authorization: Bearer <token> + cek role di tabel
 * profiles. Return { ok: true, user, role, supabaseAdmin } kalau lolos,
 * atau { ok: false, status, message } kalau tidak (401/403/500).
 */
export async function requireReportMergeAccess(req) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return { ok: false, status: 500, message: "Konfigurasi server belum lengkap." };
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, status: 401, message: "Sesi tidak ditemukan, silakan login ulang." };
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, message: "Sesi tidak valid, silakan login ulang." };
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("role, full_name, username")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profErr || !profile) {
    return { ok: false, status: 403, message: "Profil tidak ditemukan." };
  }

  if (!ALLOWED_ROLES.has(profile.role)) {
    return { ok: false, status: 403, message: "Akses ditolak — fitur ini khusus SPM Sumatera & IOH internal." };
  }

  return { ok: true, user: userData.user, role: profile.role, profile, supabaseAdmin };
}
