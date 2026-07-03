import { supabase } from "./supabase";

// ── Akses MartaHub ────────────────────────────────────────────────────────────
// MartaHub adalah aplikasi terpisah dari SandraHub. Untuk memudahkan development,
// role `spm_sumatera` (SandraHub) dipakai sebagai jembatan login + berperan ADMIN.
//
// Dua lapis hak:
//   • ADMIN  → boleh mengunggah & menghapus data peta (batas wilayah + titik site).
//   • VIEWER → boleh MELIHAT peta saja (read-only).
//
// Kebijakan yang sama ditegakkan di database (RLS: mh_is_territory_admin() untuk
// tulis, mh_can_view() untuk baca). Ubah daftar di bawah bila MartaHub sudah
// punya role sendiri (BME/RGE/Territory Manager, dst.).

// ADMIN — boleh mengunggah/menghapus data peta (batas wilayah + titik site).
export const MARTA_ADMIN_ROLES = ["spm_sumatera"];

// VIEW — boleh MASUK MartaHub & melihat peta (read-only bila bukan admin).
// Tahap dev: hanya jembatan spm_sumatera. Saat MartaHub punya user sendiri
// (BME/RGE/Territory Manager, dst.), TAMBAHKAN role-nya DI SINI — dan samakan
// dengan fungsi database public.mh_can_view() agar RLS mengizinkan baca.
export const MARTA_VIEW_ROLES = ["spm_sumatera"];

// Kompatibilitas mundur (dipakai halaman lama).
export const MARTA_ALLOWED_ROLES = MARTA_VIEW_ROLES;

export const isMartaAdmin = (role) => MARTA_ADMIN_ROLES.includes(role);
export const canViewMarta = (role) => MARTA_VIEW_ROLES.includes(role);

/**
 * Cek akses MartaHub memakai sesi & profil (shared auth dengan SandraHub).
 * @returns {Promise<{ ok:boolean, reason?:"no-session"|"forbidden", canManage?:boolean, session?:object, profile?:object }>}
 */
export async function checkMartaAccess() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, reason: "no-session" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", session.user.id)
    .single();
  if (!profile || !canViewMarta(profile.role)) {
    return { ok: false, reason: "forbidden", session, profile: profile || null };
  }
  return { ok: true, canManage: isMartaAdmin(profile.role), session, profile };
}

/** Guard untuk halaman MartaHub. Redirect bila perlu; kembalikan {session, profile, canManage} bila lolos. */
export async function guardMarta(router, redirectPath = "/martahub") {
  const res = await checkMartaAccess();
  if (res.ok) return res;
  if (res.reason === "forbidden") {
    await supabase.auth.signOut();
    router.replace("/marta/login?e=forbidden");
  } else {
    router.replace(`/marta/login?redirect=${encodeURIComponent(redirectPath)}`);
  }
  return res;
}
