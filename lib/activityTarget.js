"use client";
// Util bersama untuk fitur "Target Aktivitas" (mh_activity_target) - dipakai
// halaman Target Aktivitas (app/martahub/master/page.jsx) DAN Dashboard
// (app/martahub/page.jsx) supaya logika "cari target bulan terdekat
// sebelumnya" tidak terduplikasi di 2 tempat.
//
// Jembatan v1<->v2 branch_id: mh_activities.branch_id itu UUID (mh_branches,
// sistem lama "v1"), sedangkan mh_activity_target.branch_id (sama seperti
// mh_sites/mh_posmat_target) pakai text slug (sistem "v2"). Diverifikasi
// langsung (bukan asumsi): slug(mh_branches.name) cocok 23/23 ke branch_id v2
// yang ada di mh_sites saat ini. slug() di sini SENGAJA sama persis dengan
// fungsi slug() di lib/martaSiteImport.js (satu sumber logika, disalin bukan
// diimpor supaya modul ini tetap ringan/independen).
export function slug(s) {
  return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** "yyyy-MM-dd" | Date -> "yyyyMM" (format month di mh_activity_target, sama seperti mh_posmat_target/mh_sites_monthly). */
export function monthKeyYYYYMM(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(`${String(dateLike).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Cari target EFEKTIF utk (branchId, brand, month) dari daftar target yang
 * sudah dimuat (hasil mh_activity_list_targets) - target bulan itu sendiri
 * kalau ada, atau bulan TERDEKAT SEBELUMNYA yang tersimpan (carry-forward).
 * `targets`: array baris mh_activity_target (boleh urutan apa saja).
 * Return: baris target yang cocok, atau null kalau tidak ada sama sekali
 * (bahkan tidak ada bulan sebelumnya) utk kombinasi branch+brand ini.
 */
export function nearestPriorTarget(targets, branchId, brand, month) {
  let best = null;
  for (const t of targets) {
    if (t.branch_id !== branchId || t.brand !== brand) continue;
    if (t.month > month) continue; // hanya bulan itu sendiri atau sebelumnya
    if (!best || t.month > best.month) best = t;
  }
  return best;
}

/** Index Map "branchId|brand" -> array target (dipakai bareng nearestPriorTarget
 * kalau sudah pra-kelompokkan; opsional, nearestPriorTarget di atas juga bisa
 * langsung dipakai atas array datar tanpa index ini. */
export function groupTargetsByBranchBrand(targets) {
  const idx = new Map();
  for (const t of targets) {
    const key = `${t.branch_id}|${t.brand}`;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(t);
  }
  return idx;
}
