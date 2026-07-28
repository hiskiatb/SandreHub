import { supabaseMarta } from "./supabaseMarta";

// ── Scope MartaHub (Web) — TMV / Head / Admin ───────────────────────────────
// Web belum punya sesi Supabase asli terhadap project MartaHub (akses masih
// digerbangi lewat project SandraHub — lihat martaAccess.js). Untuk tetap bisa
// men-scope data per TMV TANPA mengubah gerbang login yang sudah ada, helper
// ini mencocokkan EMAIL pengguna yang sedang login (dari sesi SandraHub) ke
// baris mh_profiles di project MartaHub — email adalah kunci mapping bersama
// antara kedua sistem (docs/MARTAHUB_SPEC.md §1 & §3.1).
//
//   role admin|head → lihat semua data (unscoped)
//   role tmv         → dibatasi ke 1 region × 1 brand
//   role lain / tidak ketemu → tidak punya scope MartaHub (dianggap read-only kosong)
//
// Catatan: mh_activities.branch_id (uuid) mengacu ke mh_branches.id (tabel
// legacy v1) — BUKAN mh_sites.branch_id (text slug, v2). Dua tabel wilayah ini
// belum direkonsiliasi (lihat MARTAHUB_SPEC.md §11 open item #3), jadi resolusi
// region di sini SENGAJA lewat mh_branches, mengikuti apa yang benar-benar
// dipakai mh_activities saat ini.

let _branchMapPromise = null;

/** Peta id→{name,region} dari mh_branches, di-cache untuk sisa umur tab ini. */
function loadBranchMap() {
  if (!_branchMapPromise) {
    _branchMapPromise = supabaseMarta
      .from("mh_branches")
      .select("id, name, region")
      .then(({ data, error }) => {
        const map = new Map();
        if (!error && data) for (const b of data) map.set(b.id, { name: b.name, region: b.region });
        return map;
      });
  }
  return _branchMapPromise;
}

/**
 * Ambil scope MartaHub (role/region/brand) untuk email yang sedang login.
 * @param {string|null|undefined} email
 * @returns {Promise<{role:string|null, region:string|null, brand:string|null, branchId:string|null, branchName:string|null, fullName:string|null, unscoped:boolean, found:boolean}>}
 */
export async function getMartaScope(email) {
  const empty = { role: null, region: null, brand: null, branchId: null, branchName: null, fullName: null, unscoped: false, found: false };
  if (!email) return empty;
  const { data, error } = await supabaseMarta
    .from("mh_profiles")
    .select("role, region, brand, branch_id, branch_name, full_name, status")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error || !data) return empty;
  // ✅ head = "Head TMV" (per region, scope tetap region — TIDAK unscoped
  // secara data, cuma relabel tampilan §4.5). spm_sumatera = superadmin
  // nasional beneran (§4.5), unscoped seperti admin.
  const unscoped = data.role === "admin" || data.role === "spm_sumatera";
  return {
    role: data.role || null,
    region: data.region || null,
    brand: data.brand || null,
    branchId: data.branch_id || null,
    branchName: data.branch_name || null,
    fullName: data.full_name || null,
    unscoped,
    found: true,
  };
}

/** Daftar branch_id (uuid, mh_branches) yang termasuk region tertentu. */
export async function branchIdsInRegion(region) {
  if (!region) return [];
  const map = await loadBranchMap();
  const ids = [];
  for (const [id, b] of map) if (b.region === region) ids.push(id);
  return ids;
}

/** Label region → nama branch (dari mh_branches), untuk tampilan. */
export async function branchName(branchId) {
  if (!branchId) return null;
  const map = await loadBranchMap();
  return map.get(branchId)?.name || null;
}

const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Terapkan scope TMV ke query builder Supabase (tabel dengan kolom
 * branch_id [uuid → mh_branches] & brand, mis. mh_activities). Admin/Head/
 * tanpa scope dikembalikan apa adanya (unscoped = lihat semua).
 */
export async function applyMartaScope(query, scope) {
  if (!scope || scope.unscoped || !scope.found) return query;
  if (scope.region) {
    const ids = await branchIdsInRegion(scope.region);
    query = ids.length ? query.in("branch_id", ids) : query.eq("branch_id", NO_MATCH_ID);
  }
  if (scope.brand) query = query.ilike("brand", scope.brand); // mh_activities.brand='IM3'/'TRI' vs mh_profiles.brand='im3'/'tri'
  return query;
}

/** Label region kanonik → label tampilan (sudah full label di data live, identity map — disediakan untuk satu titik ubah bila perlu nanti). */
export function regionLabel(region) {
  return region || "—";
}
