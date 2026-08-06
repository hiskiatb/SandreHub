// Helper data-access utk wizard Create Plan (web mobile) - SATU SUMBER
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

function addDays(key, n) {
  const d = new Date(key + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Kelompokkan tanggal terpilih (sudah diurutkan, unik) jadi run-run yang
 * berdekatan (H, H+1, H+2, ...) - inilah yang bikin kalender "otomatis jadi
 * rentang" saat tanggalnya berdekatan, tanpa pengguna perlu pilih mode
 * apa pun. Contoh: [1,2,3,5,7,8] → [[1,2,3],[5],[7,8]]. */
export function groupContiguousDates(dates) {
  const sorted = [...new Set((dates || []).filter(Boolean))].sort();
  const groups = [];
  for (const key of sorted) {
    const last = groups[groups.length - 1];
    if (last && addDays(last[last.length - 1], 1) === key) last.push(key);
    else groups.push([key]);
  }
  return groups;
}

/** Satu sumber kebenaran utk field Plan Date. Pengguna TINGGAL PILIH tanggal
 * (bisa banyak, tidak berurutan) - tidak ada lagi mode Tunggal/Rentang/
 * Beberapa yang harus dipilih manual. Logikanya otomatis:
 *   - 1 tanggal terpilih → plan_date biasa.
 *   - Semua tanggal terpilih berdekatan (1 grup kontigu) → tersimpan sebagai
 *     rentang (plan_date_start/end), SAMA seperti dulu mode "Rentang".
 *   - Ada tanggal yang terpisah (≥2 grup) → tersimpan sebagai daftar lengkap
 *     (plan_dates_multi), SAMA seperti dulu mode "Beberapa".
 * `dates` = array "yyyy-mm-dd" string, urutan bebas. */
export function planDateFields(dates) {
  const sorted = [...new Set((dates || []).filter(Boolean))].sort();
  const primary = sorted[0];
  const [y, m] = primary.split("-").map(Number);
  const groups = groupContiguousDates(sorted);
  const isSingleRun = groups.length === 1 && sorted.length > 1;
  const isScattered = groups.length > 1;
  return {
    plan_date: primary,
    plan_date_start: isSingleRun ? sorted[0] : null,
    plan_date_end: isSingleRun ? sorted[sorted.length - 1] : null,
    plan_dates_multi: isScattered ? sorted.join(",") : null,
    month: `${MONTH_NAMES[m - 1]} ${y}`,
    year: y,
  };
}

export const DEFAULT_DATE_TIME = { isAllDay: true, startTime: "09:00", endTime: "17:00" };

/** Sinkronkan peta waktu-per-tanggal `timesByDate` dgn daftar tanggal
 * terpilih terbaru - tanggal baru dapat waktu default (Seharian, supaya
 * tetap valid tanpa pengguna wajib buka roda jam), tanggal yg dibatalkan
 * dibuang dari peta. Dipakai tiap kali pengguna tap tanggal di kalender,
 * SUPAYA "wajib diisi waktunya utk tiap tanggal" selalu terpenuhi otomatis. */
export function syncTimesByDate(dates, prevTimesByDate) {
  const next = {};
  for (const d of dates || []) {
    next[d] = prevTimesByDate?.[d] || { ...DEFAULT_DATE_TIME };
  }
  return next;
}

/** Cek semua tanggal terpilih sudah punya waktu yang valid (Seharian OK,
 * atau start < end kalau pakai rentang jam) - MANDATORY utk tiap tanggal,
 * inilah yang menentukan urutan tampil kalau ada beberapa activity plan
 * (dari BME/RGE berbeda) di tanggal yang sama pada kalender sisi TMV. */
export function allDateTimesValid(dates, timesByDate) {
  return (dates || []).every((d) => {
    const t = timesByDate?.[d];
    if (!t) return false;
    if (t.isAllDay) return true;
    return !!t.startTime && !!t.endTime && t.startTime < t.endTime;
  });
}

/** Field DB utk waktu per-tanggal: `plan_date_times` (jsonb, sumber utama
 * dipakai TMV utk urutkan >1 activity di tanggal yg sama) + kolom lama
 * is_all_day/start_time/end_time (diisi dari tanggal PERTAMA supaya kode
 * lama yang belum baca plan_date_times tetap jalan). */
export function planTimeFields(dates, timesByDate) {
  const sorted = [...new Set((dates || []).filter(Boolean))].sort();
  const jsonMap = {};
  for (const d of sorted) {
    const t = timesByDate?.[d] || DEFAULT_DATE_TIME;
    jsonMap[d] = { is_all_day: !!t.isAllDay, start_time: t.isAllDay ? null : t.startTime, end_time: t.isAllDay ? null : t.endTime };
  }
  const first = timesByDate?.[sorted[0]] || DEFAULT_DATE_TIME;
  return {
    plan_date_times: sorted.length ? jsonMap : null,
    is_all_day: !!first.isAllDay,
    start_time: first.isAllDay ? null : `${first.startTime}:00`,
    end_time: first.isAllDay ? null : `${first.endTime}:00`,
  };
}

/** Kebalikan dari planTimeFields() - baca kolom `plan_date_times` (record
 * baru) ATAU fallback ke is_all_day/start_time/end_time lama diterapkan ke
 * SEMUA tanggal (record lama, dibuat sebelum fitur per-tanggal ada). */
export function timesByDateFromActivity(activity, dates) {
  if (activity?.plan_date_times && typeof activity.plan_date_times === "object") {
    const out = {};
    for (const d of dates) {
      const t = activity.plan_date_times[d];
      out[d] = t
        ? { isAllDay: !!t.is_all_day, startTime: (t.start_time || "09:00").slice(0, 5), endTime: (t.end_time || "17:00").slice(0, 5) }
        : { ...DEFAULT_DATE_TIME };
    }
    return out;
  }
  const legacy = {
    isAllDay: activity?.is_all_day !== false,
    startTime: activity?.start_time ? activity.start_time.slice(0, 5) : DEFAULT_DATE_TIME.startTime,
    endTime: activity?.end_time ? activity.end_time.slice(0, 5) : DEFAULT_DATE_TIME.endTime,
  };
  const out = {};
  for (const d of dates) out[d] = { ...legacy };
  return out;
}

const EDIT_COLS = "id,event_category,event_categories,event_name,site_id,mc,latitude,longitude,address,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,plan_date_times,poi_type,network_category,area_potential,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,cost_estimate,status,brand";

/** Muat satu activity utk mode edit, termasuk daftar site tambahan
 * (mh_activity_sites, is_primary=false) - dipakai wizard Create Plan saat
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
// naungi - SAMA PERSIS dgn `_pickActingFor()`/`_effectiveOwnerId()` di
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

/** Resolusi email → mh_profiles.id (uuid) - dipakai sesaat sebelum INSERT,
 * karena `mh_list_assignments` mengembalikan assignment id, BUKAN profile id. */
export async function resolveProfileIdByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabaseMarta.from("mh_profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

/** Cek dampak hapus sebelum benar-benar menghapus - SAMA PERSIS dgn
 * `deleteImpact()` di activity_provider.dart (Flutter): mengembalikan jumlah
 * data terkait (sales entries, dokumen, approval, posmat) + apakah delete
 * diblokir keras (instalasi POSMAT masih ada, FK NO ACTION) dan apakah perlu
 * konfirmasi ekstra (status di luar draft/revision_needed). */
export async function deletePlanImpact(activityId) {
  const { data, error } = await supabaseMarta.rpc("mh_activity_delete_impact", { p_activity_id: activityId });
  if (error) throw error;
  return data;
}

/** Hapus plan - direct table delete (BUKAN RPC), SAMA PERSIS dgn
 * `deletePlan()` di Flutter. `.select('id')` WAJIB supaya delete yang
 * diblokir RLS (0 baris terhapus) terdeteksi sbg gagal, bukan silently sukses. */
export async function deletePlan(activityId) {
  const { data, error } = await supabaseMarta.from("mh_activities").delete().eq("id", activityId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Plan ini tidak bisa dihapus - hanya pembuat plan yang boleh menghapusnya.");
  }
}

/** Sinkron daftar site (bisa >1) utk sebuah activity - RPC yang sama dgn
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
