"use client";
// Status "Batas Wilayah (Peta)" & "Titik Site" — HANYA metadata (nama file,
// periode, jumlah fitur, siapa/kapan terakhir diproses), TIDAK PERNAH payload
// GeoJSON/koordinat itu sendiri. Payload asli 100% diproses & disimpan di
// browser (IndexedDB, lihat lib/geoImport.js & lib/siteImport.js) dan TIDAK
// PERNAH meninggalkan device — sesuai prinsip §0.2 (reference/master
// coordinate data wajib lokal).
//
// Sebelumnya modul ini mengunggah payload penuh (gzip) ke Supabase Storage
// project SandraHub (bukan MartaHub) — pelanggaran ganda: §0.1 (satu dataset,
// satu project) dan §0.2 (koordinat reference tidak boleh ke cloud). Diganti
// total jadi status singleton di project MartaHub, lewat RPC
// mh_set_map_layer_status (server-side, project pemltwhyidrajbyzynks).
import supabaseMarta from "./supabaseMarta";

/** Ambil status terkini kedua kind ('territory','sites') — public read (RLS select true). */
export async function getMapLayerStatus() {
  const { data, error } = await supabaseMarta.from("mh_map_layer_status").select("*");
  if (error) throw new Error(error.message);
  return data || [];
}

/** Catat status setelah file lokal berhasil diparse (bukan upload payload — metadata saja). */
export async function setMapLayerStatus({ kind, fileName, period, count, total, email }) {
  const { error } = await supabaseMarta.rpc("mh_set_map_layer_status", {
    p_kind: kind, p_file_name: fileName || null, p_period: period || null,
    p_feature_count: count ?? null, p_feature_total: total ?? null, p_caller_email: email || null,
  });
  if (error) throw new Error(error.message);
}
