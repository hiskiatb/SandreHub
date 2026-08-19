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

/** Sama seperti `mcListFromSites`, tapi dikelompokkan per branch asalnya -
 * berguna begitu "Buat Untuk" mencakup lebih dari satu branch sekaligus
 * (site-nya digabung dari semua branch, jadi daftar MC-nya ikut campur
 * tanpa pengelompokan ini). `sites` di sini WAJIB sudah ditandai `branch_id`
 * (slug) per baris oleh pemanggil - lihat merge site multi-branch di
 * activities/new/page.jsx. `branchNameBySlug` memetakan slug → nama branch
 * utk label section, fallback ke slug itu sendiri kalau tidak ketemu. */
export function mcGroupsFromSites(sites, branchNameBySlug = {}) {
  const byBranch = new Map();
  for (const s of sites || []) {
    const mc = (s.mc || "").trim();
    if (!mc) continue;
    const key = s.branch_id || "";
    if (!byBranch.has(key)) byBranch.set(key, new Set());
    byBranch.get(key).add(mc);
  }
  return Array.from(byBranch.entries())
    .map(([branchId, set]) => ({ branchId, branchName: branchNameBySlug[branchId] || branchId, mcList: Array.from(set).sort() }))
    .sort((a, b) => (a.branchName || "").localeCompare(b.branchName || ""));
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

// PENTING: harus murni UTC (Date.UTC + getUTC*/setUTCDate), BUKAN
// `new Date(key+"T00:00:00")` lokal lalu `.toISOString()` - kombinasi itu
// bolak-balik lewat timezone browser (mis. WIB/UTC+7) dan bisa mundur satu
// hari saat dikonversi balik ke UTC, bikin tanggal berurutan (12,13,14,15)
// dianggap TIDAK berdekatan sehingga tiap tanggal jadi grup/rentang sendiri
// ("4 rentang" padahal harusnya 1 rentang 12-15).
function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
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

// PENTING: `branch_id` WAJIB ada di sini - dipakai wizard edit (new/page.jsx)
// utk resolve branch/brand ASLI activity ini (bukan scope akun yang login),
// supaya daftar site & seluruh prefill field lain bisa jalan. Sempat
// tertinggal dari daftar kolom ini, jadi resolusi branch itu selalu gagal
// diam-diam (branch_id selalu undefined) dan prefill gagal total lagi
// walau fix scope-nya sendiri sudah benar - lihat catatan di new/page.jsx.
const EDIT_COLS = "id,branch_id,event_category,event_categories,event_name,site_id,mc,latitude,longitude,address,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,plan_date_times,poi_type,network_category,area_potential,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,cost_estimate,status,brand";

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

// ── Catat Penjualan (dulu "Tagging Nomor") - nomor MSISDN yang sudah  ────
// benar-benar ter-claim/tersimpan di DB (mh_dsf_sales_entries). SATU sumber
// kebenaran dipakai baik dari Buat Plan (booking sebelum event) maupun Isi
// Laporan (lanjutan pencatatan saat hari-H), supaya nomor yang sudah
// diclaim di salah satu layar SELALU kelihatan lagi & bisa dihapus dari
// layar manapun - bukan cuma tersimpan diam-diam tanpa bisa dikelola lagi.
/** Baca semua nomor yang sudah tercatat utk satu activity - policy SELECT
 * tabel ini memang publik (mh_dsf_sales_entries_select), jadi bisa dibaca
 * langsung tanpa RPC. */
export async function fetchSalesEntries(activityId) {
  const { data, error } = await supabaseMarta
    .from("mh_dsf_sales_entries")
    .select("id,msisdn,category,product_type_id,org_id,tagged_at,submitted_at")
    .eq("activity_id", activityId)
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Hapus satu nomor yang sudah tercatat (mh_dsf_delete_sales_entry, RPC baru -
 * WAJIB krn msisdn UNIQUE global di tabel, satu-satunya cara membebaskan
 * nomor yg salah catat adalah menghapus barisnya). Server-side men-cek hak
 * hapus (pencatat sendiri ATAU pemilik/pembuat activity plan-nya). */
export async function deleteSalesEntry(entryId) {
  const { error } = await supabaseMarta.rpc("mh_dsf_delete_sales_entry", { p_entry_id: entryId });
  if (error) throw error;
}

// ── "Buat Untuk" (delegate / acting-for) ────────────────────────────────
// Approver (Head/Brand TMV/SPM Sumatera/Admin) TIDAK punya branch sendiri,
// jadi Create Plan mereka HARUS dibuat atas nama BME/RGE/dsb yang mereka
// naungi - SAMA PERSIS dgn `_pickActingFor()`/`_effectiveOwnerId()` di
// create_plan_screen.dart (Flutter).
export const APPROVER_ROLES = ["head", "tmv", "spm_sumatera", "admin"];
const TARGETABLE_ROLES = ["bme", "rge", "tl_dsf", "dsf", "md", "dse", "gse", "ae", "promotor", "cse_rse", "bsm"];

// Dua brand yang berjalan di MartaHub (sama dgn BRAND_TAG_COLORS di
// app/martahub/m/page.jsx) - dipakai utk membentuk grid branch×brand penuh
// di bawah, TERLEPAS dari brand mana yang kebetulan sudah punya orang.
export const BRANDS = ["im3", "tri"];

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

/** Sama seperti `fetchAssignableTargets`, tapi mengembalikan grid PENUH
 * branch × brand (di-scope sama persis: Head → region-nya, Brand TMV →
 * region+brand-nya, SPM Sumatera/Admin → semua) - bukan cuma baris yang
 * kebetulan sudah punya orang. Kombinasi branch×brand yang belum ada
 * BME/RGE-nya tetap muncul dgn `people: []`, supaya approver sadar ada
 * cabang yang "kosong" (belum ada yang di-assign) alih-alih cabang itu diam-
 * diam hilang dari daftar. */
// `mh_list_assignments` (dipakai fetchAssignableTargets) mengembalikan
// branch_id sbg SLUG text (mis. "bandar-lampung"), BUKAN uuid mh_branches.id
// - jadi mencocokkan orang ke satu baris mh_branches WAJIB lewat slug ini,
// bukan uuid langsung. Rumus sama dgn slug asli di DB (spasi/simbol → "-",
// termasuk kasus "METRO - KOTA BUMI" → "metro-kota-bumi").
const toSlug = (name) => (name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");

// Siapa boleh menambah role apa - PERSIS mengikuti pembatasan yang SUDAH
// ditegakkan di RPC (mh_assign_user utk head/tmv/spm_sumatera/admin,
// mh_bme_assign_member utk bme/rge, mh_tl_dsf_assign_dsf utk tl_dsf) - bukan
// aturan baru, cuma dicerminkan di UI supaya pilihan yg ditampilkan sudah
// sesuai sebelum submit (RPC tetap jadi penjaga akhir di server).
export const ADDABLE_ROLES_FOR = {
  spm_sumatera: ["head", "tmv", "bme", "rge", "tl_dsf", "md", "dsf", "dse", "gse", "ae", "promotor", "cse_rse", "bsm"],
  admin: ["head", "tmv", "bme", "rge", "tl_dsf", "md", "dsf", "dse", "gse", "ae", "promotor", "cse_rse", "bsm"],
  head: ["bme", "rge"],
  tmv: ["bme", "rge"],
  bme: ["tl_dsf", "md", "dse", "gse", "ae", "promotor", "cse_rse", "bsm", "dsf"],
  rge: ["tl_dsf", "md", "dse", "gse", "ae", "promotor", "cse_rse", "bsm", "dsf"],
  tl_dsf: ["dsf"],
};

/** Grid PENUH branch × brand utk halaman User Management (SEMUA role yg
 * kebetulan ada di kombo itu, bukan cuma TARGETABLE_ROLES spt
 * `fetchAssignableGroups`) - dikelompokkan lagi per role supaya kartu bisa
 * menampilkan "BME: Budi, RGE: (kosong)" dst. `period` (Date/"yyyy-mm-dd",
 * opsional) diteruskan sbg p_period ke mh_list_assignments supaya daftar
 * mencerminkan siapa yg menjabat pada bulan itu, bukan cuma status aktif
 * saat ini. */
export async function fetchUserManagementGrid(scope, period) {
  const { data, error } = await supabaseMarta.rpc("mh_list_assignments", { p_period: period || null });
  if (error) throw error;
  let people = data || [];

  const { data: branchRows, error: bErr } = await supabaseMarta.from("mh_branches").select("id,name,region").eq("active", true);
  if (bErr) throw bErr;

  let branches = (branchRows || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  let brands = BRANDS;
  if (scope.role === "head") {
    branches = branches.filter((b) => b.region === scope.region);
  } else if (scope.role === "tmv") {
    branches = branches.filter((b) => b.region === scope.region);
    brands = [(scope.brand || "").toLowerCase()].filter(Boolean);
  }

  const groups = [];
  for (const b of branches) {
    const slug = toSlug(b.name);
    for (const brand of brands) {
      const combo = people.filter((p) => (p.branch_id === slug || p.branch_id === b.id) && (p.brand || "").toLowerCase() === brand);
      const byRole = new Map();
      for (const p of combo) {
        if (!byRole.has(p.role)) byRole.set(p.role, []);
        byRole.get(p.role).push(p);
      }
      groups.push({
        key: `${b.id}:${brand}`, branchId: b.id, branchSlug: slug, branchName: b.name, region: b.region, brand,
        people: combo, byRole,
      });
    }
  }
  return { people, groups };
}

// Struktur organisasi Trade Marketing & Visibility Sumatera: Circle (se-
// Sumatera) → 3 Region → cabang di dalamnya. Nilai `key` HARUS sama persis
// dgn mh_branches.region/mh_assignments.region di DB (huruf besar semua,
// diverifikasi langsung lewat query - lihat migrasi region di project ini).
export const REGIONS = [
  { key: "NORTH SUMATERA", label: "North Sumatera" },
  { key: "CENTRAL SUMATERA", label: "Central Sumatera" },
  { key: "SOUTH SUMATERA", label: "South Sumatera" },
];

// "tri" SELALU ditampilkan sbg "3ID" di seluruh MartaHub (bukan "TRI") -
// konsisten dgn app/martahub/assignments/page.jsx, activities, dst.
export const BRAND_DISPLAY = { im3: "IM3", tri: "3ID" };

/** Bentuk org-chart 4 level utk halaman User Management (mobile):
 *   Circle Sumatera (region kosong) → Region (North/Central/South Sumatera)
 *   → cabang di region itu → kombo cabang×brand (BME/RGE).
 * Circle & tiap Region SENDIRI juga punya 3 "slot" posisi tetap: Head TMV,
 * TMV IM3, TMV 3ID (role='head'/'tmv', branch_id KOSONG, brand sesuai slot
 * utk tmv / kosong utk head) - beda dari slot BME/RGE yang terikat cabang.
 * Satu RPC (`mh_list_assignments`, SUDAH di-filter periode) dipakai utk
 * SEMUA level sekaligus - cukup dikelompokkan ulang di sini, tidak perlu
 * request terpisah per level.
 *
 * Role head/tmv/branch SELALU di-scope sesuai caller (spm_sumatera/admin
 * lihat semua; head/tmv cuma lihat region sendiri - SAMA PERSIS batasan yg
 * sudah ditegakkan di RPC mh_assign_user/mh_update_assignment, cuma
 * dicerminkan di sini supaya yang ditampilkan sudah sesuai sblm submit). */
export async function fetchOrgHierarchy(scope, period) {
  const { data, error } = await supabaseMarta.rpc("mh_list_assignments", { p_period: period || null });
  if (error) throw error;
  // spm_sumatera TIDAK PERNAH boleh tampil di peta organisasi ini - identitas
  // superadmin itu berasal dari pendaftaran SandraHub (lihat migrasi
  // mh_super_admins_from_sandrahub di project MartaHub), bukan dikelola lewat
  // mh_assignments/User Management. Baris ini pun secara struktural tidak
  // pernah cocok dgn slot manapun (branch_id kosong, role bukan head/tmv),
  // tapi filter eksplisit di sini dipasang sbg lapis pertahanan kedua supaya
  // ia tidak PERNAH muncul di People, search index, atau grup manapun -
  // walau logika pengelompokan di bawah berubah di masa depan.
  const people = (data || []).filter((p) => p.role !== "spm_sumatera");

  const { data: branchRows, error: bErr } = await supabaseMarta.from("mh_branches").select("id,name,region").eq("active", true);
  if (bErr) throw bErr;
  const allBranches = (branchRows || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Slot Head/TMV - branch_id HARUS kosong (bukan orang cabang), region &
  // brand harus cocok persis (region null utk Circle).
  function roleSlot(role, region, brand) {
    return people.filter((p) => p.role === role && !p.branch_id
      && (region === null ? !p.region : p.region === region)
      && (brand === null ? !p.brand : (p.brand || "").toLowerCase() === brand));
  }
  function roleTriplet(region) {
    return {
      head: roleSlot("head", region, null),
      tmvIm3: roleSlot("tmv", region, "im3"),
      tmvTri: roleSlot("tmv", region, "tri"),
    };
  }
  function branchGroups(branchesInRegion, brandsAllowed) {
    const groups = [];
    for (const b of branchesInRegion) {
      const slug = toSlug(b.name);
      for (const brand of brandsAllowed) {
        const combo = people.filter((p) => (p.branch_id === slug || p.branch_id === b.id) && (p.brand || "").toLowerCase() === brand);
        const byRole = new Map();
        for (const p of combo) { if (!byRole.has(p.role)) byRole.set(p.role, []); byRole.get(p.role).push(p); }
        groups.push({ key: `${b.id}:${brand}`, branchId: b.id, branchSlug: slug, branchName: b.name, region: b.region, brand, people: combo, byRole });
      }
    }
    return groups;
  }

  // head/tmv HANYA mengelola region (dan utk tmv, brand) miliknya sendiri -
  // Circle & region lain tidak relevan buat mereka sama sekali (RPC juga
  // menolak kalau dipaksa), jadi hasilnya cuma SATU region, bukan pohon penuh.
  if (scope.role === "head" || scope.role === "tmv") {
    const brandsAllowed = scope.role === "tmv" ? [(scope.brand || "").toLowerCase()].filter(Boolean) : BRANDS;
    const branchesInRegion = allBranches.filter((b) => b.region === scope.region);
    const regionMeta = REGIONS.find((r) => r.key === scope.region);
    return {
      people, scoped: true,
      region: {
        key: scope.region, label: regionMeta?.label || scope.region || "-",
        ...roleTriplet(scope.region),
        branches: branchGroups(branchesInRegion, brandsAllowed),
      },
    };
  }

  // spm_sumatera/admin - pohon penuh: Circle + 3 Region, semuanya bisa dilihat & dikelola.
  const circle = roleTriplet(null);
  const regions = REGIONS.map((r) => ({
    key: r.key, label: r.label,
    ...roleTriplet(r.key),
    branches: branchGroups(allBranches.filter((b) => b.region === r.key), BRANDS),
  }));
  return { people, scoped: false, circle, regions };
}

export async function fetchAssignableGroups(scope) {
  const people = await fetchAssignableTargets(scope);

  const { data: branchRows, error: bErr } = await supabaseMarta.from("mh_branches").select("id,name,region").eq("active", true);
  if (bErr) throw bErr;

  let branches = (branchRows || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  let brands = BRANDS;
  if (scope.role === "head") {
    branches = branches.filter((b) => b.region === scope.region);
  } else if (scope.role === "tmv") {
    branches = branches.filter((b) => b.region === scope.region);
    brands = [(scope.brand || "").toLowerCase()].filter(Boolean);
  }

  const groups = [];
  for (const b of branches) {
    const slug = toSlug(b.name);
    for (const brand of brands) {
      groups.push({
        key: `${b.id}:${brand}`, branchId: b.id, branchSlug: slug, branchName: b.name, region: b.region, brand,
        // Cocokkan lewat slug (bentuk asli branch_id di mh_assignments/
        // mh_profiles) - fallback ke uuid kalau suatu saat datanya berubah
        // format, supaya tidak diam-diam kembali kosong semua.
        people: people.filter((p) => (p.branch_id === slug || p.branch_id === b.id) && (p.brand || "").toLowerCase() === brand),
      });
    }
  }
  return { people, groups };
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
