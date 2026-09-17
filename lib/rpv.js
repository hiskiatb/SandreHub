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
export async function uploadRpvPhoto(sessionCode, file, onProgress) {
  const { data: reserved, error: reserveErr } = await supabaseMarta.rpc("rpv_reserve_photo", {
    p_session_code: sessionCode,
    p_file_name: file.name || "foto.jpg",
  });
  if (reserveErr) throw reserveErr;
  const slot = reserved?.[0];
  if (!slot) throw new Error("Gagal menyiapkan slot foto.");

  const { error: upErr } = await supabaseMarta.storage
    .from(BUCKET)
    .upload(slot.storage_path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (upErr) throw upErr;
  onProgress?.(0.9);

  const { data: confirmed, error: confirmErr } = await supabaseMarta.rpc("rpv_confirm_photo", {
    p_session_code: sessionCode,
    p_photo_code: slot.photo_code,
    p_storage_path: slot.storage_path,
    p_file_name: file.name || "foto.jpg",
  });
  if (confirmErr) throw confirmErr;
  const row = confirmed?.[0] || slot;

  onProgress?.(1);
  return { photoCode: row.photo_code, url: rpvPublicUrl(row.storage_path) };
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
 */
export function subscribeRpvPhotos(sessionId, onInsert) {
  const channel = supabaseMarta
    .channel(`rpv-photos-${sessionId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "rpv_photos", filter: `session_id=eq.${sessionId}` },
      (payload) => onInsert?.(payload.new)
    )
    .subscribe();
  return () => supabaseMarta.removeChannel(channel);
}
