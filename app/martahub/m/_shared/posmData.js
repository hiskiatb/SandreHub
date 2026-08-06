// Helper data-access utk fitur POSM (dulu disebut "POSMAT" di Flutter - nama
// tampilan disederhanakan jadi "POSM" di web atas permintaan user, tapi nama
// tabel/RPC/kolom di database TETAP `posmat`/`md_installations`, TIDAK diganti).
// Semua RPC di sini SAMA PERSIS dgn yg dipakai md_activity_provider.dart
// (Flutter) - lihat komentar per fungsi utk pemetaan.
import supabaseMarta from "../../../../lib/supabaseMarta";

export const INSTALL_MODES = [
  { key: "activity", label: "Terikat Activity" },
  { key: "outlet", label: "Terikat Outlet" },
  { key: "street", label: "Street Branding" },
];

export const STOCK_MODE_LABEL = { consumable: "Habis Pakai", reusable: "Bisa Dipakai Ulang" };

async function rpc(name, args) {
  const { data, error } = await supabaseMarta.rpc(name, args);
  if (error) throw error;
  return data;
}

// ── BME/RGE (recorder) ──────────────────────────────────────────────────
export const fetchMyBranchProgress = (month) => rpc("mh_posmat_my_branch_progress", { p_month: month || null });
export const fetchMyTypeSummary = () => rpc("mh_posmat_my_type_summary");
export const fetchMyAvailableTypes = () => rpc("mh_posmat_my_available_types");
export const fetchMyInstallations = () => rpc("mh_md_list_my_installations");
export const fetchMyClaimRequests = () => rpc("mh_posmat_my_claim_requests");

export function submitInstallation({ mode, activityId, siteId, streetDescription, lat, lng, companionAssignmentId, note, items }) {
  return rpc("mh_md_submit_installation", {
    p_mode: mode,
    p_activity_id: mode === "activity" ? activityId : null,
    p_site_id: mode === "outlet" ? siteId : null,
    p_street_description: mode === "street" ? streetDescription : null,
    p_latitude: lat,
    p_longitude: lng,
    p_companion_assignment_id: companionAssignmentId || null,
    p_note: note || null,
    p_items: items.map((i) => ({ posmat_type_id: i.posmat_type_id, qty: Number(i.qty) })),
  });
}

const PHOTO_BUCKET = "mh-photos"; // SAMA dgn `_photoBucket` md_activity_provider.dart Flutter
export async function addInstallationPhoto(installationId, blob, index) {
  const path = `${installationId}/${Date.now()}_${index}.jpg`;
  const { error: upErr } = await supabaseMarta.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (upErr) throw upErr;
  const result = await rpc("mh_md_add_photo", { p_installation_id: installationId, p_storage_path: path, p_caption: null });
  // Mirror ke Google Drive (storage utama jangka panjang) - best-effort,
  // TIDAK PERNAH boleh menggagalkan upload utama kalau relay ini gagal.
  // Sama polanya dgn Submit Actual Report (lihat activities/[id]/submit/page.jsx).
  const photoId = result?.id || result?.[0]?.id || null;
  supabaseMarta.functions.invoke("md-photo-drive-upload", { body: { photo_id: photoId, storage_path: path } }).catch(() => {});
  return result;
}

export function submitClaimRequest(items, note) {
  return rpc("mh_posmat_bme_submit_claim_request", {
    p_items: items.map((i) => ({ posmat_type_id: i.posmat_type_id || null, proposed_name: i.proposed_name || null, proposed_unit: i.unit || null, qty: Number(i.qty) })),
    p_note: note || null,
  });
}

// ── Approver (Head/Brand TMV/SPM Sumatera/Admin) ────────────────────────
export const fetchStockOverview = () => rpc("mh_posmat_stock_overview");
export const listTypes = () => rpc("mh_posmat_list_types");
export const listTargets = () => rpc("mh_posmat_list_targets");
export const fetchClaimRequests = (status) => rpc("mh_posmat_list_claim_requests", { p_status: status });

export function setMonthlyStock({ branchId, brand, posmatTypeId, month, amount, note }) {
  return rpc("mh_posmat_set_monthly_stock", { p_branch_id: branchId, p_brand: brand, p_posmat_type_id: posmatTypeId, p_month: month, p_amount: Number(amount), p_note: note || null });
}

export function setTarget({ branchId, branchName, brand, month, targetQty, note }) {
  return rpc("mh_posmat_set_target", { p_branch_id: branchId, p_branch_name: branchName, p_brand: brand, p_month: month, p_target_qty: Number(targetQty), p_note: note || null });
}

export function upsertType({ id, name, category, stockMode, unit, active }) {
  return rpc("mh_posmat_upsert_type", { p_id: id || null, p_name: name, p_category: category || null, p_stock_mode: stockMode, p_unit: unit, p_active: active });
}

export function decideClaimRequest(id, decision, notes) {
  return rpc("mh_posmat_decide_claim_request", { p_claim_request_id: id, p_decision: decision, p_notes: notes || null });
}

// ── Rekonsiliasi instalasi (khusus approver) ─────────────────────────────
// Padanan alur validasi lokasi Head TMV di Flutter: mode activity/outlet
// direkonsiliasi BATCH (klien menghitung jarak ke titik acuan lalu kirim
// hasilnya), mode street direview SATU-SATU (approve/reject manual, tidak
// ada perhitungan jarak - evaluasi dari foto+deskripsi).
export const fetchPendingReconcile = () => rpc("mh_md_list_pending_reconcile");
export const fetchStreetPending = () => rpc("mh_md_list_street_pending");

/** `p_caller_email` WAJIB dikirim manual (RPC ini cek role lewat email, BUKAN
 * auth.uid(), beda dgn RPC lain di app ini - sesuai definisi aslinya). */
export function reconcileBatch(results, callerEmail) {
  return rpc("mh_md_reconcile_batch", { p_results: results, p_caller_email: callerEmail });
}

export function decideStreetInstallation(id, decision, notes, callerEmail) {
  return rpc("mh_web_decide_md_installation", { p_id: id, p_decision: decision, p_notes: notes || null, p_caller_email: callerEmail });
}

/** Haversine (meter) - SAMA PERSIS dgn helper di checkin/page.jsx & server
 * mh_geo_distance_meters(), dipakai utk menghitung jarak instalasi ke site
 * (mode outlet) / titik activity (mode activity) sebelum rekonsiliasi. */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Daftar cabang (slug+label) dari mh_profiles - sumber sama dgn yg dipakai
 * scope BME/RGE lain, dipakai utk picker branch di layar approver. */
export async function fetchBranchOptions() {
  const { data, error } = await supabaseMarta.from("mh_profiles").select("branch_id, branch_name").not("branch_id", "is", null);
  if (error) throw error;
  const map = new Map();
  for (const r of data || []) if (r.branch_id && !map.has(r.branch_id)) map.set(r.branch_id, r.branch_name || r.branch_id);
  return Array.from(map, ([branch_id, branch_name]) => ({ branch_id, branch_name })).sort((a, b) => a.branch_name.localeCompare(b.branch_name));
}

export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}
