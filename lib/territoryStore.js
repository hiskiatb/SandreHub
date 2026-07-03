"use client";
// Penyimpanan aman berkas batas wilayah (KML/SHP) — Supabase Storage bucket
// PRIVAT `mh-territory` + metadata + audit. Semua akses ditegakkan RLS: hanya
// role spm_sumatera. Unduh lewat signed URL berumur pendek (bukan link publik).
import { supabase } from "./supabase";

const BUCKET = "mh-territory";

async function me() {
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}
async function logAudit(rec, action) {
  const user = await me();
  try {
    await supabase.from("mh_territory_audit").insert({
      file_id: rec?.id || null, object_path: rec?.object_path || null, action,
      actor: user?.id || null, actor_email: user?.email || null,
    });
  } catch { /* audit tak boleh menggagalkan aksi utama */ }
}

async function gzipBlob(str) {
  if (typeof CompressionStream === "undefined") return new Blob([str], { type: "application/json" });
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).blob();
}
async function gunzipText(blob) {
  // Deteksi gzip magic byte (1f 8b); kalau bukan, anggap JSON polos.
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (typeof DecompressionStream === "undefined" || head[0] !== 0x1f || head[1] !== 0x8b) return await blob.text();
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

// Unggah data (JSON) ke bucket privat, terkompresi gzip — kecil, aman, bisa dibagi.
async function uploadData({ kind, fileName, period, payload, count, total }) {
  const user = await me();
  const uid = crypto?.randomUUID?.() || String(Date.now());
  const safe = String(fileName || kind).replace(/\.[^.]+$/, "").replace(/[^\w.\-]+/g, "_");
  const object_path = `${kind}/${uid}/${safe}.json.gz`;
  const blob = await gzipBlob(JSON.stringify(payload));
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(object_path, blob, { contentType: "application/gzip", upsert: false });
  if (upErr) throw new Error("Gagal unggah ke penyimpanan aman: " + upErr.message);
  const rec = {
    kind, object_path, file_name: fileName, period: period || null,
    size_bytes: blob.size, feature_total: total ?? null, feature_sumatra: count ?? null,
    uploaded_by: user?.id || null, uploaded_by_email: user?.email || null,
  };
  const { data, error } = await supabase.from("mh_territory_files").insert(rec).select().single();
  if (error) { await supabase.storage.from(BUCKET).remove([object_path]).catch(() => {}); throw new Error("Gagal simpan metadata: " + error.message); }
  await logAudit(data, "upload");
  return data;
}

// Territory: GeoJSON wilayah Sumatera.
export const uploadTerritory = ({ fileName, period, geojson, count, total }) =>
  uploadData({ kind: "territory", fileName, period, payload: geojson, count, total });

// Sites: array titik site.
export const uploadSites = ({ fileName, period, sites, count, total }) =>
  uploadData({ kind: "sites", fileName, period, payload: { type: "sites", sites }, count, total });

export async function listTerritory(kind = "territory") {
  const { data, error } = await supabase.from("mh_territory_files").select("*").eq("kind", kind).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// URL bertanda-tangan berumur pendek (default 5 menit) untuk unduh.
export async function signedUrl(rec, expires = 300) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(rec.object_path, expires);
  if (error) throw new Error(error.message);
  await logAudit(rec, "download");
  return data.signedUrl;
}

// Ambil GeoJSON territory (untuk dimuat ulang ke peta).
export async function fetchTerritoryGeojson(rec) {
  const url = await signedUrl(rec, 300);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Gagal mengunduh berkas.");
  const text = await gunzipText(await res.blob());
  return JSON.parse(text);
}

export async function removeTerritory(rec) {
  await supabase.storage.from(BUCKET).remove([rec.object_path]).catch(() => {});
  const { error } = await supabase.from("mh_territory_files").delete().eq("id", rec.id);
  if (error) throw new Error(error.message);
  await logAudit(rec, "delete");
}
