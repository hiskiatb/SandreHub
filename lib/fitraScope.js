import supabase from "./supabase";

// ── Scope FitraHub (Finance Sumatera Hub) ───────────────────────────────────
// Sama persis pola getMartaScope() (lib/martaScope.js), diadaptasi utk
// fh_profiles - TAPI FitraHub TIDAK punya project Supabase sendiri: ia
// memakai project SandraHub yang sama (lib/supabase.js), jadi di sini kita
// query lewat client `supabase` biasa (bukan client terpisah spt
// supabaseMarta). Email adalah kunci pencocokan ke baris fh_profiles.
//
//   role superadmin → lihat semua data (unscoped, admin-equivalent)
//   role staff/finance_admin → scope normal (belum ada pembatasan region/
//     branch aktif di fase ini - kolomnya sudah disiapkan utk nanti)
//   role 'pending' / tidak ketemu → authState 'pending' (menunggu approval)
//   status 'revoked' → authState 'revoked'

/**
 * Ambil scope FitraHub (role/region/branch) utk email yang sedang login.
 * @param {string|null|undefined} email
 * @returns {Promise<{role:string|null, region:string|null, branch:string|null, fullName:string|null, unscoped:boolean, found:boolean, status:string|null, authState:string}>}
 */
export async function getFitraScope(email) {
  const empty = { role: null, region: null, branch: null, fullName: null, unscoped: false, found: false, status: null, authState: "pending" };
  if (!email) return empty;
  const { data, error } = await supabase
    .from("fh_profiles")
    .select("role, region, branch, full_name, status")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error || !data) return empty;
  // superadmin = unscoped (lihat semua data) - satu-satunya role "admin-
  // equivalent" di fase ini (lihat komentar role set di migrasi fh_profiles).
  const unscoped = data.role === "superadmin";
  // authState - sama persis logika di getMartaScope(): active hanya kalau
  // status='active' DAN role bukan 'pending'; revoked eksplisit; selain itu
  // (termasuk baris tidak ketemu) dianggap 'pending' - default aman.
  const active = data.status === "active" && (data.role || "pending") !== "pending";
  const authState = active ? "active" : data.status === "revoked" ? "revoked" : "pending";
  return {
    role: data.role || null,
    region: data.region || null,
    branch: data.branch || null,
    fullName: data.full_name || null,
    unscoped,
    found: true,
    status: data.status || null,
    authState,
  };
}

/**
 * Pastikan baris fh_profiles ada utk email yang sedang login (dipanggil
 * sekali sesudah login berhasil, lihat useFitraSession() di MobileShell).
 * SECURITY DEFINER di sisi DB (fh_ensure_profile) - membuat baris 'pending'
 * kalau belum ada, atau tidak melakukan apa-apa kalau sudah ada. Best-
 * effort: kegagalan di sini tidak boleh menghalangi alur login.
 */
export async function ensureFitraProfile() {
  try {
    const { error } = await supabase.rpc("fh_ensure_profile");
    if (error) console.warn("[FitraHub] fh_ensure_profile gagal:", error.message);
  } catch { /* best-effort */ }
}

/** Daftar seluruh user FitraHub (lewat RPC fh_list_users - digerbangi role
 * superadmin di sisi DB, caller non-admin otomatis dapat array kosong). */
export async function listFitraUsers() {
  const { data, error } = await supabase.rpc("fh_list_users");
  if (error) throw new Error(error.message || "Gagal memuat daftar user");
  return data || [];
}

/** Ubah role/status satu user (approve/ubah akses) - lewat RPC
 * fh_update_user_role, sama-sama digerbangi role superadmin di sisi DB. */
export async function updateFitraUserRole(email, role, status) {
  const { data, error } = await supabase.rpc("fh_update_user_role", {
    p_email: email,
    p_role: role,
    p_status: status,
  });
  if (error) throw new Error(error.message || "Gagal memperbarui user");
  return data;
}

export function regionLabel(region) {
  return region || "-";
}
