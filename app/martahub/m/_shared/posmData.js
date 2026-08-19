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

export function submitInstallation({ mode, activityId, siteId, streetDescription, lat, lng, companionAssignmentId, note, items, branchId, brand }) {
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
    // Override branch/brand tujuan - dipakai approver (Head/Brand TMV dkk)
    // yang TIDAK punya branch tetap sendiri, supaya bisa pilih mau pasang
    // di branch mana & stok yang dikonsumsi mengurangi alokasi branch itu.
    // NULL (default) = BME/RGE biasa, perilaku lama (branch ikut perekam).
    p_branch_id: branchId || null,
    p_brand: brand || null,
  });
}

/** Saldo stok utk branch+brand APAPUN (bukan cuma milik pemanggil) - dipakai
 * approver saat memilih branch tujuan pemasangan supaya langsung lihat
 * jenis material apa saja yang tersedia di branch tsb. */
export const fetchAvailableTypesForBranch = (branchId, brand) =>
  rpc("mh_posmat_available_types_for_branch", { p_branch_id: branchId, p_brand: brand });

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

/** `p_caller_email` WAJIB dikirim manual - RPC ini cek role/scope lewat
 * email (bukan auth.uid()), sama seperti reconcileBatch/decideStreetInstallation
 * di bawah. Tanpa ini, lookup role di server selalu gagal (email kosong)
 * dan RPC selalu menolak SIAPAPUN dgn "Tidak diizinkan mengatur stok POSM" -
 * ini akar masalah "belum bisa create stok" sebelumnya, bukan cuma soal role.
 * `unitCost`/`photoPath` opsional - biaya per satuan & bukti foto materi
 * yang baru dicetak/diterima, disimpan per baris ledger top-up. */
export function setMonthlyStock({ branchId, brand, posmatTypeId, month, amount, note, callerEmail, unitCost, photoPath }) {
  return rpc("mh_posmat_set_monthly_stock", {
    p_branch_id: branchId, p_brand: brand, p_posmat_type_id: posmatTypeId, p_month: month, p_amount: Number(amount),
    p_note: note || null, p_caller_email: callerEmail,
    p_unit_cost: unitCost === "" || unitCost == null ? null : Number(unitCost),
    p_photo_path: photoPath || null,
  });
}

/** Riwayat transaksi top-up stok (per jenis material) - dipakai utk lihat
 * biaya & foto dokumentasi tiap entri, bukan cuma saldo agregat. */
export function fetchStockEntries({ branchId, brand, posmatTypeId, callerEmail }) {
  return rpc("mh_posmat_list_stock_entries", { p_branch_id: branchId, p_brand: brand, p_posmat_type_id: posmatTypeId, p_caller_email: callerEmail });
}

const POSMAT_STOCK_PHOTO_BUCKET = "mh-photos"; // bucket sama dgn foto instalasi
/** Unggah foto dokumentasi stok (mis. bukti cetak materi POSM) - path
 * dibuat unik di client SEBELUM baris ledger dibuat (beda dgn foto
 * instalasi yg butuh installation_id dulu), krn mh_posmat_set_monthly_stock
 * menyimpan path-nya langsung sbg bagian dari satu baris insert. */
export async function uploadPosmatStockPhoto(blob) {
  const path = `posmat-stock/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabaseMarta.storage.from(POSMAT_STOCK_PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export function posmatStockPhotoUrl(path) {
  if (!path) return null;
  return supabaseMarta.storage.from(POSMAT_STOCK_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function setTarget({ branchId, branchName, brand, month, targetQty, note, callerEmail }) {
  return rpc("mh_posmat_set_target", { p_branch_id: branchId, p_branch_name: branchName, p_brand: brand, p_month: month, p_target_qty: Number(targetQty), p_note: note || null, p_caller_email: callerEmail });
}

export function upsertType({ id, name, category, stockMode, unit, active, callerEmail }) {
  return rpc("mh_posmat_upsert_type", { p_id: id || null, p_name: name, p_category: category || null, p_stock_mode: stockMode, p_unit: unit, p_active: active, p_caller_email: callerEmail });
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

/** Daftar cabang (slug+label) dipakai utk picker branch di layar approver
 * (Top Up Stok, Set Target). Sumbernya `mh_sites` (BUKAN `mh_profiles` -
 * `mh_profiles` RLS-nya deny-all utk query langsung dari client sehingga
 * SELALU balik kosong, ini akar masalah dropdown Cabang kosong sebelumnya).
 * `mh_sites.branch_id` sudah slug text yang SAMA PERSIS dgn yg dipakai
 * `mh_profiles.branch_id`/`mh_posmat_stock.branch_id` - tanpa perlu resolve.
 * @param {string} [region] - kalau diisi, cuma cabang di region itu (dipakai
 *   utk TMV/Head yang scope-nya dibatasi 1 region - tanpa ini, admin/
 *   SPM Sumatera yang unscoped tetap dapat semua cabang nasional). */
export async function fetchBranchOptions(region) {
  let q = supabaseMarta.from("mh_sites").select("branch_id, branch, region").eq("active", true).not("branch_id", "is", null);
  if (region) q = q.eq("region", region);
  const { data, error } = await q;
  if (error) throw error;
  const map = new Map();
  for (const r of data || []) if (r.branch_id && !map.has(r.branch_id)) map.set(r.branch_id, r.branch || r.branch_id);
  return Array.from(map, ([branch_id, branch_name]) => ({ branch_id, branch_name })).sort((a, b) => a.branch_name.localeCompare(b.branch_name));
}

export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}
