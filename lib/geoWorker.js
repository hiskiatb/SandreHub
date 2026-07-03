/* eslint-disable no-restricted-globals */
// Web Worker: parse shapefile (.zip) / GeoJSON di luar main-thread.
// Berkas asli TIDAK diubah. Untuk peta, hanya wilayah SUMATERA yang disimpan
// (berkas nasional bisa ~140 MB — terlalu berat untuk browser). Atribut tiap
// fitur dipertahankan UTUH (tidak ada kolom yang dibuang). Tanpa jaringan.
import shp from "shpjs";

const SUM = { minLng: 94.6, minLat: -6.3, maxLng: 106.7, maxLat: 6.4 };
function bboxOf(geom) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  const w = (x) => { if (typeof x[0] === "number") { if (x[0] < a) a = x[0]; if (x[1] < b) b = x[1]; if (x[0] > c) c = x[0]; if (x[1] > d) d = x[1]; } else for (const k of x) w(k); };
  if (geom && geom.coordinates) w(geom.coordinates);
  return [a, b, c, d];
}
function keepSumatra(bb) {
  if (!isFinite(bb[0])) return false;
  if (bb[2] < SUM.minLng || bb[0] > SUM.maxLng || bb[3] < SUM.minLat || bb[1] > SUM.maxLat) return false;
  const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
  if (cx > 105.4 && cy < -5.2) return false; // Jawa/Banten
  if (cx > 108) return false;                 // Kalimantan dst
  return true;
}
function normalize(gj) {
  const features = [];
  const push = (o) => {
    if (!o) return;
    if (Array.isArray(o)) return o.forEach(push);
    if (o.type === "FeatureCollection") features.push(...(o.features || []));
    else if (o.type === "Feature") features.push(o);
    else if (o.type && o.coordinates) features.push({ type: "Feature", properties: {}, geometry: o });
  };
  push(gj);
  return features;
}

self.onmessage = async (e) => {
  const { buffer, mode } = e.data || {};
  try {
    let gj;
    if (mode === "zip") gj = await shp(buffer);
    else gj = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer)));
    self.postMessage({ type: "progress", pct: 90 });
    const all = normalize(gj);
    const total = all.length;
    const feats = all.filter((f) => keepSumatra(bboxOf(f.geometry))); // atribut tiap fitur tetap utuh
    if (!feats.length) { self.postMessage({ type: "error", message: "Tidak ada wilayah Sumatera pada berkas ini." }); return; }
    self.postMessage({ type: "done", geojson: { type: "FeatureCollection", features: feats }, count: feats.length, total });
  } catch (err) {
    self.postMessage({ type: "error", message: String((err && err.message) || err) });
  }
};
