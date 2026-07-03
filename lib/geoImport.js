"use client";
// ────────────────────────────────────────────────────────────────────────────
// Import batas wilayah (SHP .zip / KML / KMZ / GeoJSON) — 100% DI BROWSER.
// Berkas asli TIDAK PERNAH diubah & TIDAK dikirim ke server. Data disimpan
// UTUH apa adanya (semua fitur, tanpa dibuang). Pemfilteran tampilan (Sumatera)
// dilakukan saat menggambar peta, bukan di sini. Penyimpanan lokal (IndexedDB).
// Karena territory di-update tiap bulan, upload baru MENGGANTI data lama.
// ────────────────────────────────────────────────────────────────────────────

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB
const ALLOWED = /\.(zip|kml|kmz|geojson|json)$/i;
const MB = (b) => (b / 1048576).toFixed(0);

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
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

// Filter ke wilayah Sumatera (berkas nasional terlalu berat untuk browser).
// Atribut tiap fitur tetap UTUH — hanya fitur di luar Sumatera yang tak disimpan.
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
  if (cx > 105.4 && cy < -5.2) return false;
  if (cx > 108) return false;
  return true;
}
function toSumatra(gj) {
  const all = normalize(gj);
  const feats = all.filter((f) => keepSumatra(bboxOf(f.geometry)));
  if (!feats.length) throw new Error("Tidak ada wilayah Sumatera pada berkas ini.");
  return { fc: { type: "FeatureCollection", features: feats }, total: all.length };
}

// Auto-heal: rapikan layer tersimpan agar hanya wilayah Sumatera (mis. record
// lama yang menyimpan seluruh Indonesia). Mengembalikan null bila sudah bersih.
export function sanitizeSumatra(geojson) {
  try {
    const { fc, total } = toSumatra(geojson);
    return { geojson: fc, count: fc.features.length, total };
  } catch { return null; }
}

// Ambil "YYYYMM" dari nama berkas (mis. Territory IOH 202606) → label periode.
export function periodFromName(name) {
  const m = String(name || "").match(/(20\d{2})[-_ ]?(0[1-9]|1[0-2])/);
  if (!m) return "";
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${bulan[+m[2] - 1]} ${m[1]}`;
}

function readWithProgress(file, mode, onProgress) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.min(60, Math.round((e.loaded / e.total) * 60))); };
    fr.onload = () => { onProgress?.(62); res(fr.result); };
    fr.onerror = () => rej(fr.error || new Error("Gagal membaca berkas."));
    if (mode === "text") fr.readAsText(file); else fr.readAsArrayBuffer(file);
  });
}

function parseInWorker(buffer, mode, onProgress) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./geoWorker.js", import.meta.url), { type: "module" });
    } catch { return reject(Object.assign(new Error("no-worker"), { noWorker: true })); }
    worker.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.type === "progress") onProgress?.(Math.min(96, 62 + Math.round((m.pct - 62) * 0.9)));
      else if (m.type === "done") { worker.terminate(); resolve({ geojson: m.geojson, count: m.count }); }
      else if (m.type === "error") { worker.terminate(); reject(new Error(m.message)); }
    };
    worker.onerror = (err) => { worker.terminate(); reject(Object.assign(new Error(err.message || "no-worker"), { noWorker: true })); };
    worker.postMessage({ buffer, mode }, [buffer]);
  });
}

async function parseHeavyMainThread(buffer, mode, onProgress) {
  onProgress?.(70);
  let gj;
  if (mode === "zip") { const shp = (await import("shpjs")).default; gj = await shp(buffer); }
  else gj = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer)));
  onProgress?.(90);
  const { fc, total } = toSumatra(gj);
  return { geojson: fc, count: fc.features.length, total };
}

export async function parseGeoFile(file, onProgress) {
  const name = file?.name || "layer";
  if (!ALLOWED.test(name)) throw new Error("Format tidak didukung. Pakai .zip (SHP), .kml, .kmz, atau .geojson.");
  if (file.size > MAX_BYTES) throw new Error(`File terlalu besar (${MB(file.size)} MB). Maksimal 200 MB.`);
  const lower = name.toLowerCase();
  const baseName = name.replace(/\.[^.]+$/, "");
  const period = periodFromName(name);

  // KML/KMZ butuh DOMParser (tak ada di worker) → main-thread. Data tetap utuh.
  if (lower.endsWith(".kml") || lower.endsWith(".kmz")) {
    let text;
    if (lower.endsWith(".kml")) text = await readWithProgress(file, "text", onProgress);
    else {
      const buf = await readWithProgress(file, "buffer", onProgress);
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buf);
      const entry = Object.keys(zip.files).find((f) => f.toLowerCase().endsWith(".kml"));
      if (!entry) throw new Error("KMZ tidak berisi berkas .kml.");
      text = await zip.files[entry].async("text");
    }
    onProgress?.(85);
    const { kml } = await import("@tmcw/togeojson");
    const dom = new DOMParser().parseFromString(text, "text/xml");
    const { fc, total } = toSumatra(kml(dom));
    onProgress?.(100);
    return { name: baseName, period, geojson: fc, count: fc.features.length, total };
  }

  // SHP zip / GeoJSON → Web Worker (fallback main-thread).
  const buffer = await readWithProgress(file, "buffer", onProgress);
  const mode = lower.endsWith(".zip") ? "zip" : "geojson";
  let result;
  try { result = await parseInWorker(buffer, mode, onProgress); }
  catch (e) { if (e && e.noWorker) result = await parseHeavyMainThread(buffer, mode, onProgress); else throw e; }
  onProgress?.(100);
  return { name: baseName, period, geojson: result.geojson, count: result.count };
}

// ── IndexedDB lokal (per-perangkat, tidak sinkron ke server) ──────────────────
const DB = "martahub-geo", STORE = "layers", VER = 2;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("layers")) db.createObjectStore("layers", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sites")) db.createObjectStore("sites", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn) {
  return openDB().then((db) => new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}
export const idbAll    = () => tx("readonly",  (s) => s.getAll());
export const idbPut    = (rec) => tx("readwrite", (s) => s.put(rec));
export const idbDelete = (id) => tx("readwrite", (s) => s.delete(id));
export const idbClear  = () => tx("readwrite", (s) => s.clear());
