// Helper BERSAMA (dipakai AdminMcMapping.jsx & AdminAreaMapping.jsx) untuk
// menjamin: begitu sebuah email didaftarkan/di-upload sebagai Admin MC
// atau Admin Area (lewat CMS single-add, edit, toggle aktif, ATAU upload
// bulk Excel), akun login email itu (kalau sudah punya profil) LANGSUNG
// dapat akses yang sesuai - tanpa perlu tambahan manual lewat SQL seperti
// yang beberapa kali terjadi sebelumnya (kasus adminpadang, 10 akun
// admin_area, spmsumatera001@gmail.com, dst - root cause-nya SELALU sama:
// email terdaftar di roster/mapping, tapi profiles.role / profile_extra_
// roles tidak pernah disentuh sama sekali oleh form CMS-nya).
//
// Aturan akses (SELARAS dgn ROLE_TAB_ACCESS di RoleAccessMatrix.jsx):
//   - Kalau profiles.role akun itu SUDAH SAMA dgn role yg didaftarkan ->
//     tidak perlu apa-apa (role utama sudah mencakupnya).
//   - Kalau BEDA (misal role utama admin_mc tapi baru didaftarkan jadi
//     Admin Area juga, atau sebaliknya) -> tambahkan sbg EXTRA ROLE di
//     profile_extra_roles (bukan menimpa role utama!) - supaya "aman jika
//     dia mengisi untuk keduanya": akun tetap admin_mc DAN admin_area
//     sekaligus, akses HoA AR (dari admin_area) + DSE/DSO (dari admin_mc)
//     gabung lewat mergeAccess (highest-wins), role utama tidak pernah
//     diubah/ditimpa oleh helper ini.
//   - Kalau emailnya belum pernah login/daftar akun (profiles belum ada
//     barisnya) -> dilewati begitu saja, tidak ada yg bisa disinkronkan
//     dulu sampai dia benar2 punya akun (bukan error, ini normal).
import supabase from "../../../lib/supabase";

// Sinkronkan SATU email. Dipakai utk single add/edit/toggle-aktif di CMS.
export async function ensureRoleAccess(email, role) {
  const res = await ensureRoleAccessBulk([email], role);
  return res.details[0] || { email, status: "error" };
}

// Sinkronkan BANYAK email sekaligus (dipanggil SEKALI di akhir proses
// upload bulk, bukan per-baris, supaya tidak query berkali-kali).
// Return: { added, alreadyOk, noProfile, details:[{email,status}] }
export async function ensureRoleAccessBulk(emails, role) {
  const uniq = Array.from(new Set((emails || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)));
  const summary = { added: 0, alreadyOk: 0, noProfile: 0, details: [] };
  if (!uniq.length) return summary;

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, role")
    .in("email", uniq);
  if (pErr) {
    console.error("[roleAccessSync] gagal load profiles:", pErr.message);
    uniq.forEach((email) => summary.details.push({ email, status: "error" }));
    return summary;
  }

  // profiles.email bisa beda kapitalisasi dari input - cocokkan via lower().
  const profileByEmail = new Map();
  (profiles || []).forEach((p) => { if (p.email) profileByEmail.set(p.email.toLowerCase(), p); });

  const candidates = []; // profil yg role utamanya BEDA dari role target
  uniq.forEach((email) => {
    const prof = profileByEmail.get(email);
    if (!prof) { summary.noProfile++; summary.details.push({ email, status: "no_profile" }); return; }
    if (prof.role === role) { summary.alreadyOk++; summary.details.push({ email, status: "already_primary" }); return; }
    candidates.push({ email, profile: prof });
  });
  if (!candidates.length) return summary;

  const candidateIds = candidates.map((c) => c.profile.id);
  const { data: existingExtra, error: eErr } = await supabase
    .from("profile_extra_roles")
    .select("profile_id")
    .eq("role", role)
    .in("profile_id", candidateIds);
  if (eErr) {
    console.error("[roleAccessSync] gagal load profile_extra_roles:", eErr.message);
    candidates.forEach((c) => summary.details.push({ email: c.email, status: "error" }));
    return summary;
  }
  const alreadyExtraIds = new Set((existingExtra || []).map((r) => r.profile_id));

  const toInsert = candidates.filter((c) => !alreadyExtraIds.has(c.profile.id));
  candidates.filter((c) => alreadyExtraIds.has(c.profile.id)).forEach((c) => { summary.alreadyOk++; summary.details.push({ email: c.email, status: "already_extra" }); });

  if (toInsert.length) {
    const { data: { user } = {} } = await supabase.auth.getUser();
    const rows = toInsert.map((c) => ({ profile_id: c.profile.id, role, created_by: user?.id || null }));
    const { error: iErr } = await supabase.from("profile_extra_roles").upsert(rows, { onConflict: "profile_id,role", ignoreDuplicates: true });
    if (iErr) {
      console.error("[roleAccessSync] gagal insert profile_extra_roles:", iErr.message);
      toInsert.forEach((c) => summary.details.push({ email: c.email, status: "error" }));
    } else {
      summary.added += toInsert.length;
      toInsert.forEach((c) => summary.details.push({ email: c.email, status: "added" }));
    }
  }
  return summary;
}
