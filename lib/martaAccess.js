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
// punya role sendiri (DMO/Territory Manager, dst.).

// ADMIN - boleh mengunggah/menghapus data peta (batas wilayah + titik site).
export const MARTA_ADMIN_ROLES = ["spm_sumatera"];

// VIEW - boleh MASUK MartaHub & melihat peta (read-only bila bukan admin).
// Tahap dev: hanya jembatan spm_sumatera. Saat MartaHub punya user sendiri
// (DMO/Territory Manager, dst.), TAMBAHKAN role-nya DI SINI - dan samakan
// dengan fungsi database public.mh_can_view() agar RLS mengizinkan baca.
export const MARTA_VIEW_ROLES = ["spm_sumatera", "marketing_sumatera_program"];

// Kompatibilitas mundur (dipakai halaman lama).
export const MARTA_ALLOWED_ROLES = MARTA_VIEW_ROLES;

export const isMartaAdmin = (role) => MARTA_ADMIN_ROLES.includes(role);
export const canViewMarta = (role) => MARTA_VIEW_ROLES.includes(role);

// ── Akses terbatas (restricted) ───────────────────────────────────────────
// Sebagian role VIEW di atas sengaja dibatasi HANYA boleh membuka satu
// halaman tertentu di CMS (bukan admin, bukan full-view) - dipakai utk akun
// yg dibuatkan khusus lewat User Management (lihat app/martahub/assignments/
// page.jsx, fitur "Akun Pendataan Outlet"). Role yg TIDAK ada di map ini
// berarti bebas akses ke semua halaman seperti biasa (spm_sumatera).
// MartaShell.jsx pakai ini utk: (1) filter menu sidebar jadi cuma 1 item,
// (2) redirect paksa kalau role ini coba buka path lain.
export const MARTA_RESTRICTED_PATH = {
  marketing_sumatera_program: "pendataan-outlet",
};

// Label tampilan role ini - SATU sumber dipakai MartaShell.jsx (header user)
// & /marta/login (preview "Masuk sebagai ...").
export const MARTA_ROLE_LABEL = {
  spm_sumatera: "SPM Sumatera",
  marketing_sumatera_program: "Marketing Sumatera (Program)",
};
export function martaRoleLabel(role) {
  return MARTA_ROLE_LABEL[role] || role || "";
}

// Role yg login-nya pakai KODE OTP email (passwordless), bukan kata sandi -
// dipakai /marta/login utk memutuskan stage mana yg ditampilkan setelah
// email diisi (lihat RPC marta_login_mode). spm_sumatera TETAP pakai
// password seperti biasa (tidak disentuh sama sekali).
export const MARTA_OTP_LOGIN_ROLES = ["marketing_sumatera_program"];
export const usesOtpLogin = (role) => MARTA_OTP_LOGIN_ROLES.includes(role);

/** Path (tanpa leading slash) yg jadi satu-satunya akses role ini, atau null kalau role bebas akses semua halaman. */
export function restrictedPathFor(role) {
  return MARTA_RESTRICTED_PATH[role] || null;
}

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
