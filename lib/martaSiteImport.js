"use client";
// Import "List Site" bulanan → tabel mh_sites (MartaHub) untuk penentuan BRANCH
// bagi assignment BME (urban) / RGE (rural). Parsing 100% di browser (SheetJS),
// upsert via RPC SECURITY DEFINER. Mapping kolom bisa diubah; bulan manual.

import supabaseMarta from "./supabaseMarta";

const ALLOWED = /\.(xlsb|xlsx|xls|csv)$/i;
const CHUNK = 400;

// Field yang dibutuhkan + kata kunci untuk auto-match "like" ke header.
export const TARGET_FIELDS = [
  { key: "site_id",   label: "Site ID",       required: true, guesses: ["site id", "new site id", "unique id"] },
  { key: "site_name", label: "Site Name",                     guesses: ["site name", "new site name"] },
  { key: "mc",        label: "MC",                            guesses: ["mc"] },
  { key: "longitude", label: "Long",                          guesses: ["long new", "longitude", "long"] },
  { key: "latitude",  label: "Lat",                           guesses: ["lat new", "latitude", "lat"] },
  { key: "circle",    label: "Circle",                        guesses: ["circle new", "circle"] },
  { key: "region",    label: "Region",                        guesses: ["region new", "region"] },
  { key: "area",      label: "Area",                          guesses: ["area"] },
  { key: "branch",    label: "Branch",        required: true, guesses: ["branch"] },
  { key: "kecamatan", label: "Kecamatan Unik",                guesses: ["kecamatan unik", "kecamatan"] },
];

const str = (v) => (v == null ? null : String(v).trim() || null);
const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const isY = (v) => String(v ?? "").trim().toUpperCase().startsWith("Y");
const slug = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const _norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Auto-match "like": cocokkan tiap field ke kolom header (exact → contains). */
export function guessMapping(columns) {
  const m = {};
  const used = new Set();
  for (const f of TARGET_FIELDS) {
    let best = "";
    // 1) exact match
    for (const g of f.guesses) {
      const ng = _norm(g);
      const hit = columns.find((c) => !used.has(c) && _norm(c) === ng);
      if (hit) { best = hit; break; }
    }
    // 2) contains (kolom memuat kata kunci, atau sebaliknya)
    if (!best) {
      for (const g of f.guesses) {
        const ng = _norm(g);
        if (ng.length < 3) continue;
        const hit = columns.find((c) => {
          if (used.has(c)) return false;
          const nc = _norm(c);
          return nc.includes(ng) || ng.includes(nc);
        });
        if (hit) { best = hit; break; }
      }
    }
    m[f.key] = best;
    if (best) used.add(best);
  }
  return m;
}

/** Baca workbook sebagai MATRIKS mentah (baris × sel) untuk preview + pilih header. */
export async function readWorkbook(file) {
  const name = file?.name || "";
  if (!ALLOWED.test(name)) throw new Error("Format tidak didukung. Pakai .xlsb, .xlsx, .xls, atau .csv.");
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.SheetNames.find((s) => /site/i.test(s)) || wb.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false });
  if (!matrix.length) throw new Error("Berkas tidak berisi data.");
  const month = (name.match(/(\d{6})/) || [])[1] || currentYYYYMM();
  return { sheetName: sheet, matrix, totalRows: matrix.length, month };
}

/** Dari matriks + indeks baris header → { columns, displayColumns, rows }. */
export function deriveTable(matrix, headerIdx = 0) {
  const rawHeader = matrix[headerIdx] || [];
  const seen = {};
  const columns = rawHeader.map((c, i) => {
    let name = (c == null || String(c).trim() === "") ? `Kolom ${i + 1}` : String(c).trim();
    if (seen[name] != null) { seen[name] += 1; name = `${name} (${seen[name]})`; } else seen[name] = 0;
    return name;
  });
  const rows = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const arr = matrix[r] || [];
    const obj = {};
    let empty = true;
    for (let i = 0; i < columns.length; i++) {
      const v = arr[i] ?? null;
      obj[columns[i]] = v;
      if (v !== null && String(v).trim() !== "") empty = false;
    }
    if (!empty) rows.push(obj);
  }
  const displayColumns = columns.filter((c) => c && !/^kolom \d+$/i.test(c) && !/^unnamed/i.test(c) && !/^\d+$/.test(c) && c !== "-");
  return { columns, displayColumns, rows };
}

/** Bangun baris siap-upsert (satu baris per brand) dari mapping. */
export function buildRows(rows, mapping) {
  const cols = Object.keys(rows[0] || {});
  const listIm3Col = cols.find((c) => /^list\s*im3/i.test(c));
  const list3idCol = cols.find((c) => /^list\s*3id/i.test(c));
  const cluster3idCol = cols.find((c) => /cluster\s*3id/i.test(c));
  // Auto (tak tampil di UI): MC untuk dropdown aplikasi, coverage untuk info.
  const mcCol = cols.find((c) => _norm(c) === "mc");
  const covCol = cols.find((c) => /rural\s*\/?\s*urban/i.test(c));
  const g = (r, key) => (mapping[key] ? r[mapping[key]] : null);

  const out = [];
  for (const r of rows) {
    const site_id = str(g(r, "site_id"));
    const branch = str(g(r, "branch"));
    if (!site_id || !branch) continue;
    const base = {
      site_id,
      site_name: str(g(r, "site_name")),
      region: str(g(r, "region")),
      area: str(g(r, "area")),
      branch_id: slug(branch),
      branch,
      circle: str(g(r, "circle")),
      kecamatan: str(g(r, "kecamatan")),
      coverage: covCol ? str(r[covCol]) : null,
      latitude: num(g(r, "latitude")),
      longitude: num(g(r, "longitude")),
    };
    const mc = str(g(r, "mc")) || (mcCol ? str(r[mcCol]) : null);
    // Brand: pakai kolom LIST IM3 / LIST 3ID bila ada; jika tak ada, isi keduanya.
    const hasFlags = Boolean(listIm3Col || list3idCol);
    const im3 = listIm3Col ? isY(r[listIm3Col]) : !hasFlags;
    const tri = list3idCol ? isY(r[list3idCol]) : !hasFlags;
    if (im3) out.push({ ...base, brand: "im3", mc });
    if (tri) out.push({ ...base, brand: "tri", mc: cluster3idCol ? str(r[cluster3idCol]) : mc });
  }
  return out;
}

/** Upsert chunk → finalize → catat riwayat. */
export async function runImport(dbRows, month, onProgress, fileName) {
  if (!dbRows.length) throw new Error("Tidak ada baris valid. Cek mapping kolom (minimal Site ID & Branch).");
  let done = 0;
  for (let i = 0; i < dbRows.length; i += CHUNK) {
    const chunk = dbRows.slice(i, i + CHUNK);
    const { error } = await supabaseMarta.rpc("mh_import_sites", { p_month: month, p_rows: chunk });
    if (error) throw new Error(error.message || "Gagal menulis site ke database.");
    done += chunk.length;
    onProgress?.(Math.round((done / dbRows.length) * 90), `Menyimpan ${done}/${dbRows.length} baris…`);
  }
  const { data: deactivated, error: fe } = await supabaseMarta.rpc("mh_finalize_sites_import", { p_month: month });
  if (fe) throw new Error(fe.message || "Gagal menyelesaikan import.");
  const branches = new Set(dbRows.map((d) => `${d.brand}:${d.branch_id}`)).size;
  try {
    await supabaseMarta.rpc("mh_log_site_import", { p_period: month, p_file: fileName || null, p_rows: dbRows.length, p_branches: branches });
  } catch { /* log opsional */ }
  onProgress?.(100, "Selesai");
  return { month, rows: dbRows.length, branches, deactivated: deactivated ?? 0 };
}

/** Riwayat upload List Site (untuk status per bulan). */
export async function fetchImportHistory() {
  const { data } = await supabaseMarta.rpc("mh_site_import_history");
  return data || [];
}

export const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
export function monthLabel(yyyymm) {
  if (!/^\d{6}$/.test(String(yyyymm || ""))) return String(yyyymm || "");
  const y = yyyymm.slice(0, 4), m = parseInt(yyyymm.slice(4, 6), 10);
  return `${MONTH_NAMES[m - 1] || m} ${y}`;
}
