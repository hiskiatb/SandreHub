/**
 * lib/ao.js — Audit Outlet (companion FlashPrint: /marta/audit-outlet).
 *
 * Semua panggilan lewat RPC `ao_*` di project Supabase MARTAHUB (lihat
 * marta_hub/ao_schema.sql) - tabel mentahnya sengaja tidak dibuka langsung
 * ke anon/authenticated, supaya pengisi Mobile (tanpa login) & CMS tidak
 * bisa query bebas, cuma lewat fungsi yang sudah divalidasi di server.
 * Pola sama persis dgn lib/rpv.js (fitur Photobooth).
 */
import { supabaseMarta } from "./supabaseMarta";

const BUCKET = "ao-photos";

/**
 * Kompres 1 foto di browser (resize longest-side + re-encode JPEG) SEBELUM
 * diupload - dipakai cuma utk Foto Referensi (Panduan Foto) supaya modal
 * "Lihat Panduan" di Mobile cepat kebuka (bukan nunggu foto kamera HP
 * admin yang bisa puluhan MB), tapi ukuran akhirnya (maxDim 1280px,
 * quality 0.85) masih tajam/"HD" dilihat di layar HP. Kalau browser-nya
 * tidak dukung canvas/createImageBitmap (SSR dsb), fallback ke file asli
 * apa adanya - jangan sampai upload gagal gara2 kompresi gagal.
 */
async function _compressForGuide(file, maxDim = 1280, quality = 0.85) {
  if (typeof document === "undefined" || !file?.type?.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    const baseName = (file.name || "photo").replace(/\.\w+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Kompres 1 foto submission SEBELUM diupload - beda tujuan dgn
 * _compressForGuide (itu utk foto referensi admin, dioptimalkan utk cepat
 * dibuka di modal "Lihat Panduan"). Ini dipakai utk foto bukti
 * lapangan (Etalase/Tampak Depan) yg diambil langsung dari kamera HP
 * (bisa 4-8MB+ per foto di HP modern) - targetnya TURUNKAN ke maksimal
 * ~1.5MB per foto (hemat kuota data DSE & storage), TAPI jangan sampai
 * kualitasnya anjlok: mulai dari resolusi tinggi (longest-side 2200px,
 * masih lebih dari cukup tajam utk bukti foto) & quality tinggi (0.92),
 * baru turunkan quality bertahap kalau masih di atas target - resolusi
 * cuma dikecilkan lagi sbg upaya terakhir kalau quality rendah pun masih
 * kebesaran (file sangat besar/beresolusi sangat tinggi). Kalau foto
 * aslinya sudah di bawah target, tetap di-reencode (skip langkah ini
 * nambah kompleksitas tanpa manfaat berarti - hasilnya tetap <=1.5MB).
 */
async function _compressForUpload(file, maxBytes = 1.5 * 1024 * 1024, maxDim = 2200) {
  if (typeof document === "undefined" || !file?.type?.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let w = bitmap.width, h = bitmap.height;
    const scale0 = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale0));
    h = Math.max(1, Math.round(h * scale0));

    const encode = (cw, ch, quality) => new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(bitmap, 0, 0, cw, ch);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });

    let blob = null;
    let cw = w, ch = h;
    // Tahap 1: resolusi tetap (longest-side 2200px), turunkan quality
    // bertahap - cukup utk hampir semua kasus tanpa mengorbankan ketajaman.
    for (const q of [0.92, 0.85, 0.78, 0.7, 0.6]) {
      blob = await encode(cw, ch, q);
      if (blob && blob.size <= maxBytes) break;
    }
    // Tahap 2 (jarang kepakai - foto sumber sangat besar/detail): kalau
    // quality 0.6 pun masih kebesaran, baru kecilkan resolusi bertahap.
    while (blob && blob.size > maxBytes && Math.max(cw, ch) > 960) {
      cw = Math.round(cw * 0.85); ch = Math.round(ch * 0.85);
      blob = await encode(cw, ch, 0.7);
    }
    if (!blob) return file;
    const baseName = (file.name || "photo").replace(/\.\w+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** URL publik dari sebuah storage_path di bucket ao-photos. */
export function aoPublicUrl(storagePath) {
  if (!storagePath) return "";
  const { data } = supabaseMarta.storage.from(BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || "";
}

// ── Mobile (publik, tanpa login) ────────────────────────────────────────────

/** Cek ID Outlet ke whitelist. @returns {Promise<{id_outlet,nama_outlet,valid}|null>} */
export async function aoCheckOutlet(idOutlet) {
  const { data, error } = await supabaseMarta.rpc("ao_check_outlet", { p_id_outlet: idOutlet });
  if (error) throw error;
  return data?.[0] || null;
}

/** Buat submission baru (header form). Nama Outlet FREE TEXT (diketik sender
 * sendiri), ID Outlet divalidasi server ke whitelist. @returns {Promise<string>} submissionId */
export async function aoCreateSubmission({
  namaSender, namaOutlet, idOutlet, socialMedia,
  latitude, longitude, spIm3, sp3id, voucherIm3, voucher3id,
}) {
  const { data, error } = await supabaseMarta.rpc("ao_create_submission", {
    p_nama_sender: namaSender,
    p_nama_outlet: namaOutlet,
    p_id_outlet: idOutlet,
    p_social_media: socialMedia || null,
    p_latitude: latitude ?? null,
    p_longitude: longitude ?? null,
    p_sp_im3: spIm3 ?? null,
    p_sp_3id: sp3id ?? null,
    p_voucher_im3: voucherIm3 ?? null,
    p_voucher_3id: voucher3id ?? null,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("Gagal membuat submission");
  return row.submission_id;
}

/**
 * Unggah 1 foto ke sebuah submission. Alurnya SENGAJA tiga langkah (sama
 * pola dgn uploadRpvPhoto di lib/rpv.js): (1) reserve path lewat RPC
 * (digenerate SERVER, bukan client), (2) upload byte-nya ke Storage, (3)
 * BARU daftarkan baris ao_photos-nya lewat RPC confirm - supaya baris foto
 * tidak pernah "terdaftar" padahal byte-nya belum selesai/gagal diupload.
 * @param {"etalase"|"tapak_depan"} jenis
 * @param {number} urutan 1-3 untuk etalase, selalu 1 untuk tapak_depan
 */
export async function aoUploadPhoto(submissionId, jenis, urutan, file) {
  const compressed = await _compressForUpload(file);
  const ext = (compressed.name?.split(".").pop() || "jpg").toLowerCase();
  const { data: path, error: rErr } = await supabaseMarta.rpc("ao_reserve_photo_path", {
    p_submission_id: submissionId, p_jenis: jenis, p_urutan: urutan, p_ext: ext,
  });
  if (rErr) throw rErr;
  const { error: uErr } = await supabaseMarta.storage.from(BUCKET).upload(path, compressed, {
    upsert: true, contentType: compressed.type || "image/jpeg",
  });
  if (uErr) throw uErr;
  const { error: cErr } = await supabaseMarta.rpc("ao_confirm_photo", {
    p_submission_id: submissionId, p_jenis: jenis, p_urutan: urutan, p_storage_path: path,
  });
  if (cErr) throw cErr;
  return aoPublicUrl(path);
}

// ── CMS (perlu login MartaHub - lihat lib/martaAccess.js guardMarta) ───────

const AO_IMPORT_CHUNK = 1000;

/**
 * Import ULANG penuh master data outlet dari file "Outlet_Hybrid" (format
 * resmi dari Indosat - lihat kolom di bawah), dikirim per-CHUNK krn bisa
 * belasan ribu baris (payload RPC tunggal terlalu besar kalau sekaligus).
 * Chunk PERTAMA mengosongkan tabel lama (p_reset=true di server), sisanya
 * numpuk - jadi hasil akhirnya REPLACE total, bukan upsert per-baris (data
 * sumbernya memang snapshot penuh, bukan delta).
 * @param {object[]} rows - tiap row field CAMELCASE: circle, region, area,
 *   branch, mc, province, city, district, village, outletIdIm3, outletId3id,
 *   latitude, longitude, pairingStatus, microCluster, dseIdIm3, dseId3id,
 *   dseName, dseContact, dsNik, dsName, dsContact, hoaNik, hoaName, hoaContact.
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<number>} total baris ter-import
 */
export async function aoImportOutletMaster(rows, onProgress) {
  let total = 0;
  for (let i = 0; i < rows.length; i += AO_IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + AO_IMPORT_CHUNK);
    const { data, error } = await supabaseMarta.rpc("ao_outlets_bulk_insert", {
      p_rows: chunk, p_reset: i === 0,
    });
    if (error) throw error;
    total += data || 0;
    onProgress?.(Math.min(i + AO_IMPORT_CHUNK, rows.length), rows.length);
  }
  return total;
}

// ── Foto Referensi "Panduan Foto" (dikelola admin CMS, dibaca Mobile) ──────
// Tiap jenis (etalase/tapak_depan) punya 1 slot "benar" (urutan=1) dan 3
// slot "salah" (urutan 1-3, masing2 dgn label alasan) - persis template
// "Panduan Foto Etalase/Tapak Depan Outlet" dari mockup (4 foto per jenis).

/** Semua foto referensi saat ini (dipakai Mobile utk render PhotoGuide & CMS utk form upload). */
export async function aoListReferencePhotos() {
  const { data, error } = await supabaseMarta.rpc("ao_list_reference_photos");
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, url: aoPublicUrl(r.storage_path) }));
}

/**
 * Upload/replace 1 slot foto referensi (admin CMS). Pola 2-langkah sama
 * dgn aoUploadPhoto: (1) reserve path BARU dari server (supaya upload
 * selalu INSERT ke Storage, tidak butuh izin UPDATE object), (2) upload
 * byte-nya, (3) baru daftarkan/replace baris ao_reference_photos lewat RPC.
 * @param {"etalase"|"tapak_depan"} jenis
 * @param {"benar"|"salah"} kind
 * @param {number} urutan 1 utk "benar", 1-3 utk "salah"
 * @param {string} [label] alasan (cuma relevan utk kind="salah")
 */
export async function aoUploadReferencePhoto(jenis, kind, urutan, file, label) {
  const compressed = await _compressForGuide(file);
  const ext = (compressed.name?.split(".").pop() || "jpg").toLowerCase();
  const { data: path, error: rErr } = await supabaseMarta.rpc("ao_reserve_reference_photo_path", {
    p_jenis: jenis, p_kind: kind, p_urutan: urutan, p_ext: ext,
  });
  if (rErr) throw rErr;
  const { error: uErr } = await supabaseMarta.storage.from(BUCKET).upload(path, compressed, {
    upsert: true, contentType: compressed.type || "image/jpeg",
  });
  if (uErr) throw uErr;
  const { error: cErr } = await supabaseMarta.rpc("ao_upsert_reference_photo", {
    p_jenis: jenis, p_kind: kind, p_urutan: urutan, p_storage_path: path, p_label: label || null,
  });
  if (cErr) throw cErr;
  return aoPublicUrl(path);
}

/** Ganti label alasan "salah" tanpa upload ulang foto. */
export async function aoUpdateReferencePhotoLabel(jenis, kind, urutan, label) {
  const { error } = await supabaseMarta.rpc("ao_update_reference_photo_label", {
    p_jenis: jenis, p_kind: kind, p_urutan: urutan, p_label: label || null,
  });
  if (error) throw error;
}

/** Daftar outlet master data (search + pagination - tabelnya bisa puluhan ribu baris). */
export async function aoListOutlets({ search, limit = 100, offset = 0 } = {}) {
  const { data, error } = await supabaseMarta.rpc("ao_list_outlets", {
    p_search: search || null, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return data || [];
}

/** Total baris outlet master data yang cocok filter search (buat pagination). */
export async function aoCountOutlets(search) {
  const { data, error } = await supabaseMarta.rpc("ao_count_outlets", { p_search: search || null });
  if (error) throw error;
  return data || 0;
}

/** Ambil setting radius toleransi (meter) utk "Radius Score" yg lagi aktif. */
export async function aoGetRadiusSetting() {
  const { data, error } = await supabaseMarta.rpc("ao_get_radius_setting");
  if (error) throw error;
  return data;
}

/** Ganti setting radius toleransi (meter) - dipakai admin CMS. */
export async function aoSetRadiusSetting(radiusM) {
  const { data, error } = await supabaseMarta.rpc("ao_set_radius_setting", { p_radius_m: radiusM });
  if (error) throw error;
  return data;
}

/** Daftar submission (tabel CMS), dgn hitungan foto per submission. */
export async function aoListSubmissions({ dateFrom, dateTo, search } = {}) {
  const { data, error } = await supabaseMarta.rpc("ao_list_submissions", {
    p_date_from: dateFrom || null, p_date_to: dateTo || null, p_search: search || null,
  });
  if (error) throw error;
  return data || [];
}

/** Foto milik 1 submission (preview CMS). */
export async function aoListPhotos(submissionId) {
  const { data, error } = await supabaseMarta.rpc("ao_list_photos", { p_submission_id: submissionId });
  if (error) throw error;
  return (data || []).map((p) => ({ ...p, url: aoPublicUrl(p.storage_path) }));
}

/**
 * Data lengkap buat build ZIP di browser (pola sama dgn halaman Download
 * Photobooth - lihat app/marta/photobooth/download/[code]/page.jsx).
 * Nama file final per foto: `${ID_OUTLET}_${JENIS}{N|TAMPAKDEPAN}_${YYYYMMDD}`
 * (semua uppercase, tanggal submission SELALU disertakan agar konsisten -
 * sekaligus natural disambiguator kalau outlet yg sama disubmit >1x).
 */
export async function aoExportList({ dateFrom, dateTo } = {}) {
  const { data, error } = await supabaseMarta.rpc("ao_export_photos", {
    p_date_from: dateFrom || null, p_date_to: dateTo || null,
  });
  if (error) throw error;
  return (data || []).map((r) => {
    const ext = (r.storage_path.split(".").pop() || "jpg").toLowerCase();
    const jenisLabel = r.jenis === "etalase" ? `ETALASE${r.urutan}` : "TAMPAKDEPAN";
    const dateTag = String(r.submission_created_at).slice(0, 10).replace(/-/g, "");
    return {
      url: aoPublicUrl(r.storage_path),
      filename: `${String(r.id_outlet).toUpperCase()}_${jenisLabel}_${dateTag}.${ext}`,
    };
  });
}
