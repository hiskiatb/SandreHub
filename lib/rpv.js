/**
 * lib/rpv.js — Realtime Photo Viewer (fitur MartaHub: "Photobooth").
 *
 * Semua panggilan lewat RPC di project Supabase MARTAHUB (lihat
 * marta_hub/rpv_schema.sql) — tabel mentahnya sengaja tidak dibuka ke anon,
 * supaya tamu (tanpa login) tidak bisa query bebas, hanya lewat fungsi yang
 * sudah divalidasi di server.
 */
import { supabaseMarta } from "./supabaseMarta";

const BUCKET = "rpv-photos";

/** Bikin sesi baru (dipanggil dari halaman internal, sudah tergerbang login SandraHub/Marta). */
export async function createRpvSession(title) {
  const { data, error } = await supabaseMarta.rpc("rpv_create_session", { p_title: title || "Photobooth" });
  if (error) throw error;
  return data?.[0] || null; // { code, id, title }
}

/** Validasi sesi dari code sebelum menampilkan halaman upload/viewer/download. */
export async function getRpvSession(code) {
  const { data, error } = await supabaseMarta.rpc("rpv_session_by_code", { p_code: code });
  if (error) throw error;
  return data?.[0] || null; // { id, title, is_active, photo_count }
}

/** URL publik dari sebuah storage_path di bucket rpv-photos. */
export function rpvPublicUrl(storagePath) {
  if (!storagePath) return "";
  const { data } = supabaseMarta.storage.from(BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || "";
}

/**
 * Unggah 1 file foto ke sebuah sesi.
 * Alurnya SENGAJA TIGA langkah: (1) reserve code+path lewat RPC (di-generate
 * SERVER, bukan client, supaya nama/lokasi file tidak bisa diarahkan
 * sembarangan), (2) upload byte-nya ke Storage, (3) BARU daftarkan baris
 * rpv_photos-nya lewat RPC confirm.
 * FIX: SEBELUMNYA baris rpv_photos didaftarkan DULUAN (sebelum upload byte
 * selesai) - itu langsung memicu event Realtime INSERT ke layar Viewer
 * SEBELUM file-nya benar2 ada di Storage, jadi foto sempat gagal tampil/
 * gambar rusak di Viewer sampai reload manual. Urutan baru ini memastikan
 * Realtime baru terpicu (lewat rpv_confirm_photo) SETELAH file dipastikan
 * sudah tersimpan di bucket, jadi begitu Viewer menerima event, gambarnya
 * sudah pasti bisa langsung dimuat.
 * @returns {Promise<{ photoCode:string, url:string }>}
 */
export async function uploadRpvPhoto(sessionCode, file, onProgress, opts = {}) {
  const { parentCode } = opts;
  const { data: reserved, error: reserveErr } = await supabaseMarta.rpc("rpv_reserve_photo", {
    p_session_code: sessionCode,
    p_file_name: file.name || "foto.jpg",
    p_parent_code: parentCode || null,
  });
  if (reserveErr) throw reserveErr;
  const slot = reserved?.[0];
  if (!slot) throw new Error("Gagal menyiapkan slot foto.");

  // Ukur RAW upload time (byte foto HP -> Storage saja, TIDAK termasuk RPC
  // reserve/confirm) - dipakai showcase kecepatan jaringan 5G Indosat di
  // layar Viewer. performance.now() dipilih (bukan Date.now()) karena
  // presisinya sub-ms dan tidak ikut geser kalau jam device berubah.
  const t0 = performance.now();
  const { error: upErr } = await supabaseMarta.storage
    .from(BUCKET)
    .upload(slot.storage_path, file, { contentType: file.type || "image/jpeg", upsert: false });
  const uploadMs = Math.round(performance.now() - t0);
  if (upErr) throw upErr;
  onProgress?.(0.9);

  const { data: confirmed, error: confirmErr } = await supabaseMarta.rpc("rpv_confirm_photo", {
    p_session_code: sessionCode,
    p_photo_code: slot.photo_code,
    p_storage_path: slot.storage_path,
    p_file_name: file.name || "foto.jpg",
    p_upload_ms: uploadMs,
    p_parent_code: parentCode || null,
    p_file_size_bytes: file.size ?? null,
  });
  if (confirmErr) throw confirmErr;
  const row = confirmed?.[0] || slot;

  onProgress?.(1);
  return {
    photoCode: row.photo_code,
    url: rpvPublicUrl(row.storage_path),
    uploadMs: row.upload_ms ?? uploadMs,
    fileSizeBytes: row.file_size_bytes ?? file.size ?? null,
    parentCode: row.parent_code ?? parentCode ?? null,
  };
}

/**
 * Throughput riil dari ms + ukuran file - dipakai showcase kecepatan 5G.
 * ms MENTAH menyesatkan sendirian (foto 8MB wajar lebih lama drpd 2MB
 * walau jaringannya sama) - Mbps yg apple-to-apple.
 */
export function rpvThroughputMbps(fileSizeBytes, uploadMs) {
  if (!fileSizeBytes || !uploadMs || uploadMs <= 0) return null;
  return (fileSizeBytes * 8) / 1e6 / (uploadMs / 1000);
}

/**
 * Upload hasil edit Gemini (operator, dari komputer/CMS - bukan tamu),
 * di-LINK ke foto asli lewat `parentCode` (tetap jadi tile terpisah di
 * grid, bukan menimpa - lihat rpv_ai_result_linking migration).
 */
export async function uploadRpvAiResult(sessionCode, parentCode, file, onProgress) {
  return uploadRpvPhoto(sessionCode, file, onProgress, { parentCode });
}

/**
 * Upload hasil GEMINI langsung dari TAMU sendiri (fitur baru "Menu Prompt +
 * Upload" di halaman kamera mobile) - tamu edit foto di app Gemini di HP-nya
 * SENDIRI (bukan lewat kamera kita sama sekali), download hasilnya, lalu
 * balik ke app ini & upload. BEDA dari uploadRpvAiResult (operator, sudah
 * ada parent foto kamera) - di sini TIDAK ADA parent, dan SEKALIGUS dapat
 * nomor antrian ("Photo ID" 5 digit, unik per sesi, aman dari race
 * condition walau banyak device upload bersamaan - lihat rpv_confirm_gemini_photo).
 * @returns {Promise<{ photoCode:string, queueNo:number, queueLabel:string, url:string }>}
 */
export async function uploadRpvGeminiResult(sessionCode, file, onProgress) {
  const { data: reserved, error: reserveErr } = await supabaseMarta.rpc("rpv_reserve_photo", {
    p_session_code: sessionCode,
    p_file_name: file.name || "gemini.jpg",
    p_parent_code: null,
  });
  if (reserveErr) throw reserveErr;
  const slot = reserved?.[0];
  if (!slot) throw new Error("Gagal menyiapkan slot foto.");

  const t0 = performance.now();
  const { error: upErr } = await supabaseMarta.storage
    .from(BUCKET)
    .upload(slot.storage_path, file, { contentType: file.type || "image/jpeg", upsert: false });
  const uploadMs = Math.round(performance.now() - t0);
  if (upErr) throw upErr;
  onProgress?.(0.9);

  const { data: confirmed, error: confirmErr } = await supabaseMarta.rpc("rpv_confirm_gemini_photo", {
    p_session_code: sessionCode,
    p_photo_code: slot.photo_code,
    p_storage_path: slot.storage_path,
    p_file_name: file.name || "gemini.jpg",
    p_upload_ms: uploadMs,
    p_file_size_bytes: file.size ?? null,
  });
  if (confirmErr) throw confirmErr;
  const row = confirmed?.[0];
  if (!row) throw new Error("Gagal mengonfirmasi upload.");

  onProgress?.(1);
  return {
    photoCode: row.photo_code,
    queueNo: row.queue_no,
    queueLabel: row.queue_label,
    url: rpvPublicUrl(row.storage_path),
  };
}

/** Cari 1 foto lewat Photo ID (nomor antrian 5 digit) DALAM 1 sesi tertentu
 * - dipakai kolom pencarian & mode scanner QR di panel operator (Fase 2). */
export async function findRpvPhotoByQueue(sessionCode, queueNo) {
  const n = Number(queueNo);
  if (!Number.isInteger(n) || n < 1 || n > 99999) return null;
  const { data, error } = await supabaseMarta.rpc("rpv_find_photo_by_queue", {
    p_session_code: sessionCode,
    p_queue_no: n,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return { ...row, url: rpvPublicUrl(row.storage_path) };
}

/** Semua foto dalam 1 sesi, terbaru dulu. */
export async function listRpvPhotos(sessionCode) {
  const { data, error } = await supabaseMarta.rpc("rpv_list_photos", { p_session_code: sessionCode });
  if (error) throw error;
  return (data || []).map((p) => ({ ...p, url: rpvPublicUrl(p.storage_path) }));
}

/** Cari 1 foto lewat tiket klaim 6 digit (dipakai kotak "masukkan ID utk print"). */
export async function getRpvPhotoByCode(photoCode) {
  const { data, error } = await supabaseMarta.rpc("rpv_get_photo", { p_photo_code: photoCode });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return { ...row, url: rpvPublicUrl(row.storage_path) };
}

/**
 * Hapus 1 foto dari sesi (dipakai tombol hapus di layar Viewer).
 * Urutan: hapus dulu file byte-nya di Storage, BARU hapus baris rpv_photos-
 * nya lewat RPC (RPC ini juga validasi photo_code memang milik session_code
 * yang dikirim, supaya sesi lain tidak bisa hapus foto sesi ini walau tahu
 * code-nya).
 */
export async function deleteRpvPhoto(sessionCode, photoCode, storagePath) {
  if (storagePath) {
    const { error: rmErr } = await supabaseMarta.storage.from(BUCKET).remove([storagePath]);
    if (rmErr) throw rmErr;
  }
  const { data, error } = await supabaseMarta.rpc("rpv_delete_photo", {
    p_session_code: sessionCode,
    p_photo_code: photoCode,
  });
  if (error) throw error;
  return !!data;
}

/**
 * Subscribe realtime ke foto baru pada sebuah sesi (dipakai layar Viewer).
 * `filter` pakai session_id (uuid) — caller wajib sudah tau id-nya (dari
 * getRpvSession), bukan code, karena filter realtime cuma bisa exact-match
 * kolom di tabel itu sendiri.
 *
 * DIPERKUAT (event live/photobooth tidak boleh miss foto):
 * 1) Auto-reconnect: kalau koneksi websocket-nya putus/timeout/error
 *    (jaringan venue sering flaky), channel-nya otomatis dibuat ulang
 *    dengan backoff, bukan diam2 mati selamanya.
 * 2) Polling fallback: selain listen event INSERT, setiap beberapa detik
 *    kita juga tetap re-fetch daftar foto sesi ini via RPC biasa
 *    (rpv_list_photos) dan bandingkan photo_code yang sudah pernah
 *    dilihat vs yang belum — jadi walau satu event realtime "hilang"
 *    (kena drop socket, tab sempat di background, dll), foto barunya
 *    tetap otomatis muncul dalam hitungan detik tanpa perlu reload manual.
 * 3) `onStatusChange` opsional untuk menampilkan indikator koneksi di UI.
 *
 * @param {string} sessionId
 * @param {(row:any)=>void} onInsert
 * @param {{ sessionCode?:string, pollMs?:number, onStatusChange?:(status:string)=>void }} [opts]
 */
export function subscribeRpvPhotos(sessionId, onInsert, opts = {}) {
  const { sessionCode, pollMs = 4000, onStatusChange } = opts;
  let channel = null;
  let reconnectTimer = null;
  let pollTimer = null;
  let stopped = false;
  let backoffMs = 1000;
  const seenCodes = new Set();

  const markSeen = (code) => {
    if (code == null) return false;
    if (seenCodes.has(code)) return false;
    seenCodes.add(code);
    return true;
  };

  const connect = () => {
    if (stopped) return;
    if (channel) {
      supabaseMarta.removeChannel(channel);
      channel = null;
    }
    channel = supabaseMarta
      .channel(`rpv-photos-${sessionId}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rpv_photos", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (markSeen(payload.new?.photo_code)) onInsert?.(payload.new);
        }
      )
      .subscribe((status) => {
        onStatusChange?.(status);
        if (status === "SUBSCRIBED") {
          backoffMs = 1000;
          return;
        }
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !stopped) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            backoffMs = Math.min(backoffMs * 2, 15000);
            connect();
          }, backoffMs);
        }
      });
  };

  const poll = async () => {
    if (stopped || !sessionCode) return;
    try {
      const rows = await listRpvPhotos(sessionCode);
      for (const row of rows) {
        if (markSeen(row.photo_code)) onInsert?.(row);
      }
    } catch {
      /* diamkan, coba lagi di tick berikutnya */
    } finally {
      if (!stopped) pollTimer = setTimeout(poll, pollMs);
    }
  };

  connect();
  if (sessionCode) pollTimer = setTimeout(poll, pollMs);

  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearTimeout(pollTimer);
    if (channel) supabaseMarta.removeChannel(channel);
  };
}

/**
 * Daftar sesi TERBARU (14 hari) lewat RPC rpv_list_sessions - sumber
 * kebenaran BARU utk panel operator, MENGGANTIKAN ketergantungan penuh ke
 * localStorage "rpv-sessions" (yg cuma per-device/browser, jadi operator
 * kehilangan daftar sesi kalau ganti HP/laptop). localStorage tetap dipakai
 * sbg cache offline-first di UI, tapi RPC inilah yg dianggap benar.
 */
export async function listRpvSessions(limit = 50) {
  const { data, error } = await supabaseMarta.rpc("rpv_list_sessions", { p_limit: limit });
  if (error) throw error;
  return (data || []).map((s) => ({
    ...s,
    promptImageUrl: s.prompt_image_path ? rpvPublicUrl(s.prompt_image_path) : "",
  }));
}

/**
 * Simpan/ubah prompt Gemini sebuah sesi (teks + opsional path gambar yg
 * sudah diupload lewat uploadRpvPromptImage). Dipanggil dari panel operator
 * saat bikin sesi baru ATAU mengedit sesi yg sudah ada.
 */
export async function updateRpvSessionPrompt(sessionCode, promptText, promptImagePath) {
  const { data, error } = await supabaseMarta.rpc("rpv_update_session_prompt", {
    p_session_code: sessionCode,
    p_prompt_text: promptText || null,
    p_prompt_image_path: promptImagePath || null,
  });
  if (error) throw error;
  return !!data;
}

/** Upload 1 gambar contoh/referensi prompt (disimpan terpisah dari foto tamu, prefix `_prompts/`). */
export async function uploadRpvPromptImage(sessionCode, file) {
  const ext = (file.name || "ref.jpg").split(".").pop() || "jpg";
  const path = `_prompts/${sessionCode}-${Date.now()}.${ext}`;
  const { error } = await supabaseMarta.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

/** Semua prompt Gemini milik 1 sesi, terurut. */
export async function listRpvPrompts(sessionCode) {
  const { data, error } = await supabaseMarta.rpc("rpv_list_prompts", { p_session_code: sessionCode });
  if (error) throw error;
  return (data || []).map((p) => ({ ...p, promptImageUrl: p.prompt_image_path ? rpvPublicUrl(p.prompt_image_path) : "" }));
}

/** Tambah 1 prompt baru ke sesi (dipanggil berkali-kali utk beberapa prompt sekaligus). */
export async function addRpvPrompt(sessionCode, label, promptText, promptImagePath) {
  const { data, error } = await supabaseMarta.rpc("rpv_add_prompt", {
    p_session_code: sessionCode, p_label: label, p_prompt_text: promptText || null, p_prompt_image_path: promptImagePath || null,
  });
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, promptImageUrl: row.prompt_image_path ? rpvPublicUrl(row.prompt_image_path) : "" } : null;
}

/** Edit label/isi/gambar 1 prompt yang sudah ada (dipakai fitur "Kelola
 * Prompt" mobile - operator/tamu bisa perbaiki template tanpa hapus+buat
 * ulang, urutan & ID prompt tetap sama). `promptImagePath` opsional -
 * kalau tidak diisi, gambar lama tetap dipakai (lihat rpv_update_prompt). */
export async function updateRpvPrompt(sessionCode, promptId, label, promptText, promptImagePath) {
  const { data, error } = await supabaseMarta.rpc("rpv_update_prompt", {
    p_session_code: sessionCode, p_prompt_id: promptId, p_label: label, p_prompt_text: promptText || null, p_prompt_image_path: promptImagePath || null,
  });
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, promptImageUrl: row.prompt_image_path ? rpvPublicUrl(row.prompt_image_path) : "" } : null;
}

/** Hapus 1 prompt dari sesi. */
export async function deleteRpvPrompt(sessionCode, promptId) {
  const { data, error } = await supabaseMarta.rpc("rpv_delete_prompt", { p_session_code: sessionCode, p_prompt_id: promptId });
  if (error) throw error;
  return !!data;
}

/** Hapus 1 sesi SEPENUHNYA (foto & prompt ikut terhapus via cascade DB) - tindakan destruktif, dikunci UI dgn konfirmasi ketik ulang "HAPUS". */
export async function deleteRpvSession(sessionCode) {
  const { data, error } = await supabaseMarta.rpc("rpv_delete_session", { p_session_code: sessionCode });
  if (error) throw error;
  return !!data;
}
