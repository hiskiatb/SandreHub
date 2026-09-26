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

/** Sama persis dgn DEFAULT_CROP di app/marta/photobooth/page.jsx - dipakai
 * sbg fallback saat rpv_photos.crop_json masih NULL (foto blm pernah
 * disesuaikan/disimpan operator). Didefinisikan lagi di sini (bkn import
 * dari page.jsx) supaya lib/rpv.js tetap murni logic data, tidak bergantung
 * pd file UI. */
const DEFAULT_PHOTO_CROP = { zoom: 1, panX: 0, panY: 0, rotate: 0, flipX: false, flipY: false };

/** Parse `crop_json` (jsonb, bisa NULL) dari 1 baris RPC foto jadi objek
 * crop siap pakai `<PhotoFrame crop={...}>` - field yg hilang/rusak diisi
 * default, jadi selalu punya bentuk lengkap & aman dirender. */
function parsePhotoCrop(cropJson) {
  if (!cropJson || typeof cropJson !== "object") return { ...DEFAULT_PHOTO_CROP };
  return {
    zoom: Number.isFinite(cropJson.zoom) ? cropJson.zoom : DEFAULT_PHOTO_CROP.zoom,
    panX: Number.isFinite(cropJson.panX) ? cropJson.panX : DEFAULT_PHOTO_CROP.panX,
    panY: Number.isFinite(cropJson.panY) ? cropJson.panY : DEFAULT_PHOTO_CROP.panY,
    rotate: Number.isFinite(cropJson.rotate) ? cropJson.rotate : DEFAULT_PHOTO_CROP.rotate,
    flipX: !!cropJson.flipX,
    flipY: !!cropJson.flipY,
  };
}

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

/** Ganti nama (title) sesi - dipakai dari panel operator (CMS), spy nama
 * sesi/event bisa diperbaiki tanpa harus bikin sesi baru dari awal. */
export async function renameRpvSession(code, title) {
  const { data, error } = await supabaseMarta.rpc("rpv_rename_session", { p_code: code, p_title: title });
  if (error) throw error;
  return data?.[0] || null;
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
  return { ...row, url: rpvPublicUrl(row.storage_path), crop: parsePhotoCrop(row.crop_json) };
}

/** Semua foto dalam 1 sesi, terbaru dulu. */
export async function listRpvPhotos(sessionCode) {
  const { data, error } = await supabaseMarta.rpc("rpv_list_photos", { p_session_code: sessionCode });
  if (error) throw error;
  return (data || []).map((p) => ({ ...p, url: rpvPublicUrl(p.storage_path), crop: parsePhotoCrop(p.crop_json) }));
}

/** Cari 1 foto lewat tiket klaim 6 digit (dipakai kotak "masukkan ID utk print"). */
export async function getRpvPhotoByCode(photoCode) {
  const { data, error } = await supabaseMarta.rpc("rpv_get_photo", { p_photo_code: photoCode });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return { ...row, url: rpvPublicUrl(row.storage_path), crop: parsePhotoCrop(row.crop_json) };
}

/** Simpan penyesuaian zoom/pan/rotate/flip operator utk 1 foto - TERSIMPAN
 * DI DATABASE (kolom rpv_photos.crop_json), bukan cuma state React lokal,
 * jadi tidak hilang saat pindah foto/reload/dibuka di TV Viewer, dan hasil
 * cetak ulang nanti pun tetap pakai penyesuaian yg sama. */
export async function saveRpvPhotoCrop(photoCode, crop) {
  const { data, error } = await supabaseMarta.rpc("rpv_save_photo_crop", {
    p_photo_code: photoCode,
    p_crop: crop || null,
  });
  if (error) throw error;
  return !!data;
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
 * FIX (permintaan user - "Photo ID masih -" saat baru upload): row INSERT
 * pertama ke rpv_photos terjadi saat RESERVE slot (queue_no/queue_label
 * BELUM ada - baru diisi belakangan lewat UPDATE oleh rpv_confirm_gemini_
 * photo pas upload selesai dikonfirmasi). Sebelumnya kita cuma listen event
 * INSERT, jadi Photo ID yg nyusul via UPDATE itu tidak pernah nyampe ke UI
 * (tetap tampil "-" sampai reload manual). Sekarang ikut listen event
 * UPDATE row yg sama & teruskan lewat callback `onUpdate` terpisah supaya
 * caller bisa MERGE field yg berubah (queue_no/queue_label, dll) ke item
 * yg sudah ada di state - `onInsert` sendiri tetap khusus utk nambah item
 * BARU (dan tetap di-dedupe by photo_code spy tidak dobel).
 *
 * @param {string} sessionId
 * @param {(row:any)=>void} onInsert
 * @param {{ sessionCode?:string, pollMs?:number, onStatusChange?:(status:string)=>void, onUpdate?:(row:any)=>void }} [opts]
 */
export function subscribeRpvPhotos(sessionId, onInsert, opts = {}) {
  const { sessionCode, pollMs = 4000, onStatusChange, onUpdate } = opts;
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rpv_photos", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          // Foto belakangan diupdate (mis. queue_no/queue_label baru
          // diisi stlh konfirmasi upload) - teruskan apa adanya, biar
          // caller yg putuskan mau di-merge ke item mana.
          onUpdate?.(payload.new);
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
        // Foto BARU (blm pernah kelihatan) -> onInsert. Foto yg sudah
        // pernah kelihatan tapi datanya mungkin berubah (mis. Photo ID
        // baru terisi) -> onUpdate, supaya tetap ke-refresh walau event
        // realtime UPDATE-nya kebetulan miss.
        if (markSeen(row.photo_code)) onInsert?.(row);
        else onUpdate?.(row);
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
 * Pairing realtime operator (Panel Operator/desktop) <-> scanner (Mode
 * Kamera/HP) utk 1 sesi - MENGGANTIKAN scanner kamera bawaan panel operator
 * ("tidak perlu ada scanner seperti ini, untuk scanner akan dilakukan di
 * mobile"). Bisa ada BEBERAPA operator sekaligus dalam 1 sesi (laptop/
 * device berbeda) - masing2 "hadir" lewat Supabase Realtime Presence
 * (bukan tabel Postgres baru, murni state "siapa online sekarang"), dan HP
 * yg jadi scanner harus pilih dulu mau pairing ke operator yg mana sebelum
 * mulai scan, supaya hasil scan cuma dikirim (broadcast) ke operator itu
 * saja - operator lain yg sedang kerja tidak keganggu.
 *
 * `self`  : { id, role: "operator"|"scanner", label?, joinedAt? }
 * `handlers.onOperatorsChange(list)` : daftar operator yg sedang online,
 *   diurutkan dari yg paling awal join (dipakai kasih label "Operator 1",
 *   "Operator 2", dst - baik utk operator lihat ID-nya sendiri, maupun utk
 *   scanner pilih target pairing).
 * `handlers.onSelectPhoto({ digits, sentAt })` : dipanggil di sisi OPERATOR
 *   saja, saat scanner yg berpasangan berhasil scan sebuah Photo ID.
 */
export function subscribeRpvOperatorPairing(sessionCode, self, handlers = {}) {
  const { onOperatorsChange, onSelectPhoto } = handlers;
  const channel = supabaseMarta.channel(`rpv-ops-${sessionCode}`, {
    config: { presence: { key: self.id } },
  });

  if (onOperatorsChange) {
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const operators = Object.entries(state)
        .map(([id, metas]) => {
          const meta = metas?.[0] || {};
          if (meta.role !== "operator") return null;
          return { id, joinedAt: meta.joinedAt || 0 };
        })
        .filter(Boolean)
        .sort((a, b) => a.joinedAt - b.joinedAt);
      onOperatorsChange(operators);
    });
  }

  if (onSelectPhoto) {
    channel.on("broadcast", { event: "select-photo" }, ({ payload }) => {
      if (payload?.targetOperatorId === self.id) onSelectPhoto(payload);
    });
  }

  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED" && self.role) {
      await channel.track({ role: self.role, joinedAt: self.joinedAt || Date.now() });
    }
  });

  return {
    /** Dipanggil di sisi SCANNER, setelah pilih operator & berhasil scan. */
    broadcastSelectPhoto(targetOperatorId, digits) {
      channel.send({ type: "broadcast", event: "select-photo", payload: { targetOperatorId, digits, sentAt: Date.now() } });
    },
    unsubscribe() { supabaseMarta.removeChannel(channel); },
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
  return (data || []).map((p) => ({
    ...p,
    promptImageUrl: p.prompt_image_path ? rpvPublicUrl(p.prompt_image_path) : "",
    // Fokus thumbnail (permintaan user - "kita bisa juga atur posisi
    // thumbnail" -> "maksud saya bisa di zoom dan geser"): BUKAN lagi
    // anchor 0-100 (object-position statis), sekarang zoom+pan (sama pola
    // dgn crop foto tamu di _frame.jsx), dipakai lewat CSS `transform:
    // scale(zoom) translate(panX%, panY%)` di setiap tempat thumbnail
    // prompt ditampilkan.
    thumbPanX: Number(p.thumb_pan_x ?? 0),
    thumbPanY: Number(p.thumb_pan_y ?? 0),
    thumbZoom: Number(p.thumb_zoom ?? 1),
  }));
}

/** Tambah 1 prompt baru ke sesi (dipanggil berkali-kali utk beberapa prompt sekaligus). */
export async function addRpvPrompt(sessionCode, label, promptText, promptImagePath, thumbPanX, thumbPanY, thumbZoom) {
  const { data, error } = await supabaseMarta.rpc("rpv_add_prompt", {
    p_session_code: sessionCode, p_label: label, p_prompt_text: promptText || null, p_prompt_image_path: promptImagePath || null,
    p_thumb_pan_x: thumbPanX ?? 0, p_thumb_pan_y: thumbPanY ?? 0, p_thumb_zoom: thumbZoom ?? 1,
  });
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, promptImageUrl: row.prompt_image_path ? rpvPublicUrl(row.prompt_image_path) : "", thumbPanX: Number(row.thumb_pan_x ?? 0), thumbPanY: Number(row.thumb_pan_y ?? 0), thumbZoom: Number(row.thumb_zoom ?? 1) } : null;
}

/** Edit label/isi/gambar 1 prompt yang sudah ada (dipakai fitur "Kelola
 * Prompt" mobile - operator/tamu bisa perbaiki template tanpa hapus+buat
 * ulang, urutan & ID prompt tetap sama). `promptImagePath` opsional -
 * kalau tidak diisi, gambar lama tetap dipakai (lihat rpv_update_prompt). */
export async function updateRpvPrompt(sessionCode, promptId, label, promptText, promptImagePath, thumbPanX, thumbPanY, thumbZoom) {
  const { data, error } = await supabaseMarta.rpc("rpv_update_prompt", {
    p_session_code: sessionCode, p_prompt_id: promptId, p_label: label, p_prompt_text: promptText || null, p_prompt_image_path: promptImagePath || null,
    p_thumb_pan_x: thumbPanX ?? null, p_thumb_pan_y: thumbPanY ?? null, p_thumb_zoom: thumbZoom ?? null,
  });
  if (error) throw error;
  const row = data?.[0];
  return row ? { ...row, promptImageUrl: row.prompt_image_path ? rpvPublicUrl(row.prompt_image_path) : "", thumbPanX: Number(row.thumb_pan_x ?? 0), thumbPanY: Number(row.thumb_pan_y ?? 0), thumbZoom: Number(row.thumb_zoom ?? 1) } : null;
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

// ── Custom Frame Templates ("Custom" pada pilihan Bingkai panel operator) ──
// Elemen bebas (teks bold/tidak+font+ukuran, & gambar apa saja, posisi
// bebas) yg operator susun di atas bingkai cetak, lalu disimpan sbg
// template utk dipakai lagi di sesi lain kapan saja. SENGAJA disimpan di
// DATABASE (RPC rpv_*_frame_template, lihat marta_hub/
// rpv_frame_templates_schema.sql) - BUKAN localStorage - supaya template
// bisa dipakai dari device/browser manapun, konsisten dgn pola rpv_* lain
// (semua akses lewat RPC security definer, tabel asli tidak dibuka ke anon).
const TEMPLATE_BUCKET = "rpv-template-assets";

/** Daftar semua template tersimpan - yg DEFAULT selalu di urutan pertama,
 * sisanya terbaru dulu (lihat rpv_list_frame_templates: order by is_default
 * desc, updated_at desc). */
export async function listRpvFrameTemplates() {
  const { data, error } = await supabaseMarta.rpc("rpv_list_frame_templates");
  if (error) throw error;
  return (data || []).map((t) => ({ id: t.id, name: t.name, elements: t.elements || [], baseStyle: t.base_style || "none", isDefault: !!t.is_default, updatedAt: t.updated_at }));
}

/** Jadikan 1 template sbg DEFAULT (tersimpan di database, bukan per-device) -
 * dipakai otomatis utk sesi/operator/device manapun yg belum pernah pilih
 * template lain sendiri. Hanya boleh 1 default aktif; yg lama otomatis
 * dimatikan oleh RPC-nya. */
export async function setRpvDefaultFrameTemplate(id) {
  const { data, error } = await supabaseMarta.rpc("rpv_set_default_frame_template", { p_id: id });
  if (error) throw error;
  return !!data;
}

/** Hapus status DEFAULT (tidak ada template yg otomatis kepasang lagi). */
export async function clearRpvDefaultFrameTemplate() {
  const { data, error } = await supabaseMarta.rpc("rpv_clear_default_frame_template");
  if (error) throw error;
  return !!data;
}

/** Simpan template (insert baru kalau `id` kosong, update kalau sudah ada -
 * dipakai tombol "Simpan"/"Simpan Sebagai" di editor template). `baseStyle`:
 * "none" (foto penuh) atau "polaroid" (bingkai putih polaroid - operator
 * bisa taruh elemen di area putihnya juga). */
export async function saveRpvFrameTemplate(id, name, elements, baseStyle) {
  const { data, error } = await supabaseMarta.rpc("rpv_save_frame_template", {
    p_id: id || null, p_name: name, p_elements: elements || [], p_base_style: baseStyle || "none",
  });
  if (error) throw error;
  const row = data?.[0];
  return row ? { id: row.id, name: row.name, elements: row.elements || [], baseStyle: row.base_style || "none", updatedAt: row.updated_at } : null;
}

/** Hapus 1 template tersimpan. */
export async function deleteRpvFrameTemplate(id) {
  const { data, error } = await supabaseMarta.rpc("rpv_delete_frame_template", { p_id: id });
  if (error) throw error;
  return !!data;
}

/** Upload 1 gambar (logo/ornamen dll) utk ditempel ke elemen "image" pada
 * template custom - nama file di-random di client (bukan lewat RPC reserve
 * spt foto tamu) krn tidak session-scoped/tidak ada aspek sensitif per
 * path, konsisten dgn kebijakan bucket publik yg sudah ada. */
export async function uploadRpvTemplateImage(file) {
  const rawExt = (file?.name || "").split(".").pop()?.toLowerCase() || "";
  const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : "png";
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${id}.${ext}`;
  const { error } = await supabaseMarta.storage.from(TEMPLATE_BUCKET).upload(path, file, {
    upsert: false, contentType: file?.type || undefined,
  });
  if (error) throw error;
  const { data } = supabaseMarta.storage.from(TEMPLATE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

// ── Font Custom (upload sendiri dari device operator, dipilih di kotak
// teks template Custom) - disimpan di DATABASE+Storage (bukan lokal per
// device), jadi begitu diupload sekali langsung tersedia dipakai siapa
// saja. Pola sama dgn Custom Frame Templates di atas.
const FONT_BUCKET = "rpv-fonts";

/** Daftar semua font custom tersimpan, terbaru dulu. */
export async function listRpvCustomFonts() {
  const { data, error } = await supabaseMarta.rpc("rpv_list_custom_fonts");
  if (error) throw error;
  return (data || []).map((f) => ({
    id: f.id, name: f.name, storagePath: f.storage_path,
    url: supabaseMarta.storage.from(FONT_BUCKET).getPublicUrl(f.storage_path).data?.publicUrl || "",
    createdAt: f.created_at,
  }));
}

/** Upload 1 file font (.ttf/.otf/.woff/.woff2) + daftarkan namanya. */
export async function uploadRpvCustomFont(file, name) {
  const rawExt = (file?.name || "").split(".").pop()?.toLowerCase() || "";
  const ext = ["ttf", "otf", "woff", "woff2"].includes(rawExt) ? rawExt : "ttf";
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${id}.${ext}`;
  const { error: upErr } = await supabaseMarta.storage.from(FONT_BUCKET).upload(path, file, {
    upsert: false, contentType: file?.type || undefined,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabaseMarta.rpc("rpv_save_custom_font", { p_name: name, p_storage_path: path });
  if (error) throw error;
  const row = data?.[0];
  return row ? {
    id: row.id, name: row.name, storagePath: row.storage_path,
    url: supabaseMarta.storage.from(FONT_BUCKET).getPublicUrl(row.storage_path).data?.publicUrl || "",
    createdAt: row.created_at,
  } : null;
}

/** Hapus 1 font custom tersimpan. */
export async function deleteRpvCustomFont(id) {
  const { data, error } = await supabaseMarta.rpc("rpv_delete_custom_font", { p_id: id });
  if (error) throw error;
  return !!data;
}
