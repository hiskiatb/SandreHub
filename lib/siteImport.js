"use client";
// Parse daftar SITE (Excel .xlsb/.xlsx/.csv) → titik untuk peta. 100% di browser.
// Ambil Lat/Long + SEMUA atribut baris (untuk popup detail). Filter tampilan ke Sumatera.

const MAX_BYTES = 60 * 1024 * 1024; // 60 MB
const ALLOWED = /\.(xlsb|xlsx|xls|csv)$/i;
const LAT_KEYS = ["Lat New", "LAT", "Latitude", "lat", "Y_Centroid", "Y", "latitude"];
const LNG_KEYS = ["Long New", "LONG", "Longitude", "lng", "lon", "long", "X_Centroid", "X", "longitude"];
const ID_KEYS = ["New Site ID", "Site ID", "SITE ID", "Unique ID", "id"];
const NAME_KEYS = ["New Site Name", "Site Name", "SITE NAME", "name"];
const SUM = { minLng: 94.6, minLat: -6.3, maxLng: 106.7, maxLat: 6.4 };

function pick(keys, cols) { for (const k of keys) if (cols.includes(k)) return k; const low = cols.map((c) => c.toLowerCase()); for (const k of keys) { const i = low.indexOf(k.toLowerCase()); if (i >= 0) return cols[i]; } return null; }
function num(v) { if (v == null || v === "") return NaN; const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".").replace(/[^\d.\-]/g, "")); return isNaN(n) ? NaN : n; }
function inSumatra(lat, lng) {
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lng < SUM.minLng || lng > SUM.maxLng || lat < SUM.minLat || lat > SUM.maxLat) return false;
  if (lng > 105.4 && lat < -5.2) return false; if (lng > 108) return false;
  return true;
}

function readWithProgress(file, onProgress) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.min(60, Math.round((e.loaded / e.total) * 60))); };
    fr.onload = () => { onProgress?.(65); res(fr.result); };
    fr.onerror = () => rej(fr.error || new Error("Gagal membaca berkas."));
    fr.readAsArrayBuffer(file);
  });
}

export async function parseSiteFile(file, onProgress) {
  const name = file?.name || "sites";
  if (!ALLOWED.test(name)) throw new Error("Format tidak didukung. Pakai .xlsb, .xlsx, .xls, atau .csv.");
  if (file.size > MAX_BYTES) throw new Error(`File terlalu besar (${(file.size / 1048576).toFixed(0)} MB). Maksimal 60 MB.`);
  const buf = await readWithProgress(file, onProgress);
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.find((s) => /site/i.test(s)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, blankrows: false });
  onProgress?.(85);
  if (!rows.length) throw new Error("Tidak ada baris data pada berkas.");
  const cols = Object.keys(rows[0]);
  const latK = pick(LAT_KEYS, cols), lngK = pick(LNG_KEYS, cols);
  if (!latK || !lngK) throw new Error("Kolom koordinat (Lat/Long) tidak ditemukan.");
  const idK = pick(ID_KEYS, cols), nameK = pick(NAME_KEYS, cols);
  const sites = [];
  for (const r of rows) {
    const lat = num(r[latK]), lng = num(r[lngK]);
    if (!inSumatra(lat, lng)) continue;
    sites.push({ lat, lng, id: idK ? String(r[idK] ?? "") : "", name: nameK ? String(r[nameK] ?? "") : "", props: r });
  }
  if (!sites.length) throw new Error("Tidak ada site dengan koordinat Sumatera yang valid.");
  onProgress?.(100);
  return { name: name.replace(/\.[^.]+$/, ""), sites, count: sites.length, total: rows.length };
}

// ── IndexedDB lokal untuk site (terpisah dari layer batas wilayah) ─────────────
const DB = "martahub-geo", STORE = "sites", VER = 2;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains("layers")) db.createObjectStore("layers", { keyPath: "id" }); if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn) {
  return openDB().then((db) => new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  }));
}
export const idbAllSites = () => tx("readonly", (s) => s.getAll());
export const idbPutSite = (rec) => tx("readwrite", (s) => s.put(rec));
export const idbClearSites = () => tx("readwrite", (s) => s.clear());
