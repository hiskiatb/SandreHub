// Helper data-access utk wizard Create Plan (web mobile) — SATU SUMBER
// dengan logika yang sama dipakai app Flutter (activity_provider.dart /
// sites_provider.dart), diverifikasi langsung terhadap skema live:
//   - mh_profiles.branch_id  = slug text ("bandar-lampung")
//   - mh_sites.branch_id     = slug text JUGA (match langsung, tanpa resolve)
//   - mh_activities.branch_id = uuid → mh_branches.id (WAJIB di-resolve)
import supabaseMarta from "../../../../lib/supabaseMarta";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolusi branch_id/slug profil → uuid mh_branches.id, SAMA PERSIS dgn
 * `_resolveBranchUuid()` di activity_provider.dart (Flutter). */
export async function resolveBranchUuid(branchIdOrSlug, branchName) {
  if (branchIdOrSlug && UUID_RE.test(branchIdOrSlug)) return branchIdOrSlug;
  const candidates = new Set();
  if (branchName && branchName.trim()) candidates.add(branchName.trim());
  if (branchIdOrSlug && branchIdOrSlug.trim()) candidates.add(branchIdOrSlug.trim().replaceAll("-", " "));
  for (const name of candidates) {
    const { data } = await supabaseMarta.from("mh_branches").select("id").ilike("name", name).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

/** Semua site dalam scope brand×branch user (branch_id slug langsung cocok
 * dgn mh_sites.branch_id, TIDAK perlu resolve uuid di sini). */
export async function fetchScopeSites(branchIdSlug, brand) {
  if (!branchIdSlug || !brand) return [];
  const { data, error } = await supabaseMarta
    .from("mh_sites")
    .select("site_id, site_name, mc, network_cat, area_potential, latitude, longitude")
    .eq("branch_id", branchIdSlug)
    .eq("brand", brand.toLowerCase())
    .eq("active", true);
  if (error) throw error;
  return data || [];
}

export function mcListFromSites(sites) {
  const set = new Set();
  for (const s of sites) if ((s.mc || "").trim()) set.add(s.mc.trim());
  return Array.from(set).sort();
}

export async function fetchPoiTypes() {
  const { data, error } = await supabaseMarta.from("mh_poi_types").select("name").order("name");
  if (error || !data || data.length === 0) {
    return ["Market", "Government", "Public Area", "Public Space", "Sport Stadium", "Villages"];
  }
  return data.map((r) => r.name);
}

export const CATEGORIES = ["Direct Selling", "Open Booth", "Sponsorship", "Thematic", "Joint Event", "Project"];
export const NETWORK_OPTIONS = ["Strong", "Medium", "Weak"];
export const AREA_OPTIONS = ["High", "Medium", "Low"];

export const snake = (s) => s.toLowerCase().replaceAll(" ", "_");

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** Satu sumber kebenaran utk field Plan Date (3 mode: tunggal/rentang/multi),
 * SAMA PERSIS dgn `_planDateFields()` di activity_provider.dart (Flutter) —
 * termasuk `month`/`year` yang WAJIB (NOT NULL) di skema tapi gampang
 * kelewat kalau ditulis manual. `dates` = array "yyyy-mm-dd" string. */
export function planDateFields(dates, mode) {
  const sorted = [...dates].filter(Boolean).sort();
  const primary = sorted[0];
  const [y, m] = primary.split("-").map(Number);
  const isRange = mode === "range";
  const isMultiple = mode === "multi" && sorted.length > 1;
  return {
    plan_date: primary,
    plan_date_start: isRange ? sorted[0] : null,
    plan_date_end: isRange ? sorted[sorted.length - 1] : null,
    plan_dates_multi: isMultiple ? sorted.join(",") : null,
    month: `${MONTH_NAMES[m - 1]} ${y}`,
    year: y,
  };
}

const EDIT_COLS = "id,event_category,event_categories,event_name,site_id,mc,latitude,longitude,address,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,poi_type,network_category,area_potential,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,cost_estimate,status,brand";

/** Muat satu activity utk mode edit, termasuk daftar site tambahan
 * (mh_activity_sites, is_primary=false) — dipakai wizard Create Plan saat
 * dibuka lewat ?edit=<id> (draft/revision_needed). */
export async function fetchActivityForEdit(activityId) {
  const [{ data: a, error: e1 }, { data: siteRows, error: e2 }] = await Promise.all([
    supabaseMarta.from("mh_activities").select(EDIT_COLS).eq("id", activityId).single(),
    supabaseMarta.from("mh_activity_sites").select("site_id, is_primary").eq("activity_id", activityId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { activity: a, extraSiteIds: (siteRows || []).filter((r) => !r.is_primary).map((r) => r.site_id) };
}

// ── "Buat Untuk" (delegate / acting-for) ────────────────────────────────
// Approver (Head/Brand TMV/SPM Sumatera/Admin) TIDAK punya branch sendiri,
// jadi Create Plan mereka HARUS dibuat atas nama BME/RGE/dsb yang mereka
// naungi — SAMA PERSIS dgn `_pickActingFor()`/`_effectiveOwnerId()` di
// create_plan_screen.dart (Flutter).
export const APPROVER_ROLES = ["head", "tmv", "spm_sumatera", "admin"];
const TARGETABLE_ROLES = ["bme", "rge", "tl_dsf", "dsf", "md", "dse", "gse", "ae", "promotor", "cse_rse", "bsm"];

/** Daftar orang yang bisa "dibuatkan" plan oleh approver yang sedang login,
 * di-scope sama seperti Flutter: Head → region-nya saja; Brand TMV →
 * region+brand-nya; SPM Sumatera/Admin → tanpa batas. */
export async function fetchAssignableTargets(scope) {
  const { data, error } = await supabaseMarta.rpc("mh_list_assignments");
  if (error) throw error;
  let list = (data || []).filter((r) => r.logged_in && r.branch_id && TARGETABLE_ROLES.includes(r.role));
  if (scope.role === "head") {
    list = list.filter((r) => r.region === scope.region);
  } else if (scope.role === "tmv") {
    list = list.filter((r) => r.region === scope.region && (r.brand || "").toLowerCase() === (scope.brand || "").toLowerCase());
  }
  return list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
}

/** Resolusi email → mh_profiles.id (uuid) — dipakai sesaat sebelum INSERT,
 * karena `mh_list_assignments` mengembalikan assignment id, BUKAN profile id. */
export async function resolveProfileIdByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabaseMarta.from("mh_profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

/** Cek dampak hapus sebelum benar-benar menghapus — SAMA PERSIS dgn
 * `deleteImpact()` di activity_provider.dart (Flutter): mengembalikan jumlah
 * data terkait (sales entries, dokumen, approval, posmat) + apakah delete
 * diblokir keras (instalasi POSMAT masih ada, FK NO ACTION) dan apakah perlu
 * konfirmasi ekstra (status di luar draft/revision_needed). */
export async function deletePlanImpact(activityId) {
  const { data, error } = await supabaseMarta.rpc("mh_activity_delete_impact", { p_activity_id: activityId });
  if (error) throw error;
  return data;
}

/** Hapus plan — direct table delete (BUKAN RPC), SAMA PERSIS dgn
 * `deletePlan()` di Flutter. `.select('id')` WAJIB supaya delete yang
 * diblokir RLS (0 baris terhapus) terdeteksi sbg gagal, bukan silently sukses. */
export async function deletePlan(activityId) {
  const { data, error } = await supabaseMarta.from("mh_activities").delete().eq("id", activityId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Plan ini tidak bisa dihapus — hanya pembuat plan yang boleh menghapusnya.");
  }
}

/** Sinkron daftar site (bisa >1) utk sebuah activity — RPC yang sama dgn
 * Flutter, jadi otorisasi delegate tetap ditegakkan server-side. */
export async function syncActivitySites(activityId, siteIds) {
  const cleaned = Array.from(new Set(siteIds.map((s) => s.trim()).filter(Boolean)));
  if (cleaned.length === 0) return;
  const { error } = await supabaseMarta.rpc("mh_set_activity_sites", {
    p_activity_id: activityId,
    p_site_ids: cleaned,
    p_primary_site_id: cleaned[0],
  });
  if (error) throw error;
}
