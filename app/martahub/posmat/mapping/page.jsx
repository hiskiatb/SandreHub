"use client";
// /martahub/posmat/mapping - Upload mapping Outlet-to-DSE bulanan yang
// dipakai fitur Retailer Installment (mobile) utk pencarian outlet per
// Branch. SATU file bisa berisi campuran BRAND (IM3/3ID sekaligus) - brand
// dipetakan dari kolom di file itu sendiri (bukan dipilih manual di awal
// lagi). Data diupdate tiap bulan; kalau mapping bulan berjalan belum
// diupload, mobile otomatis fallback ke bulan sebelumnya (lihat
// mh_outlet_mapping_search).
//
// Alur upload TIGA tahap krn format file bisa beda tiap bulan (urutan/nama
// kolom berubah): (1) pilih file (.xlsx/.xls/.csv, maks 150MB) → tampilkan
// RAW grid dulu, user pilih baris mana yang jadi header; (2) petakan kolom
// target (cuma yang benar2 dipakai - Brand/Outlet Code/Name/Branch/Region/
// Area/MC/Category/Kecamatan/Long/Lat, Long-Lat opsional) ke kolom asli
// file - auto-tebak dari nama header tapi BISA diubah manual; (3) preview
// data hasil mapping (ringkasan + contoh baris) baru user tekan "Import
// Sekarang". Tidak ada satu pun tahap yang menyentuh database sebelum tahap
// (3) dikonfirmasi. Import MENGGANTI seluruh data periode itu (semua brand).
//
// FILE BESAR (CSV): dibaca STREAMING (per baris, lewat File.stream()), tidak
// pernah dimuat penuh ke memori - jadi file ratusan ribu/jutaan baris (s.d.
// 150MB) tetap aman utk browser. XLSX tetap dibaca penuh (keterbatasan
// library SheetJS) - untuk file xlsx yang sangat besar, sarankan convert ke
// CSV dulu.
//
// SETELAH data tersimpan: klik salah satu "Periode Tersedia" utk membuka
// preview PENUH (semua baris, tidak diringkas) dgn filter per kolom (persis
// pola Activity Plan - ExcelFilter Excel-style per kolom) + tombol Export
// .xlsx dari hasil filter yang sedang aktif.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, Trash2, ArrowLeft, Eye, X, Check, FileText, Download } from "lucide-react";
import MartaShell, { T } from "../../components/MartaShell";
import ExcelFilter from "../../components/ExcelFilter";
import { getMartaScope } from "../../../../lib/martaScope";
import { fetchOutletMappingPeriods, clearOutletMapping, insertOutletMappingBatch, fetchOutletMappingFull } from "../../m/_shared/posmData";

const CAN_MANAGE_ROLES = ["head", "tmv", "spm_sumatera", "admin"];
const BRAND_DISPLAY = { im3: "IM3", tri: "3ID" };
const BATCH_SIZE = 1500;
const PREVIEW_ROWS = 30;
const RAW_PREVIEW_ROWS = 12;
const MAX_FILE_MB = 150;
const CSV_PREFIX_BYTES = 400 * 1024; // cukup utk ambil header + puluhan baris contoh tanpa baca seluruh file

// Hanya field ini yang dipetakan & disimpan - user sengaja tidak mau semua
// kolom file (Partner/DSE/dst) ikut diupload ke database, cukup yang benar2
// dipakai fitur pencarian outlet mobile. Long/Lat opsional (tdk semua file
// mapping punya koordinat). Brand WAJIB dipetakan krn satu file bisa berisi
// campuran brand - tidak ada lagi selector brand manual di awal.
const TARGET_FIELDS = [
  { key: "brand", label: "Brand", required: true, aliases: ["brand", "brand name", "brand_name", "operator"] },
  { key: "outlet_code", label: "Outlet Code", required: true, aliases: ["outlet code", "outlet_code"] },
  { key: "outlet_name", label: "Outlet Name", required: true, aliases: ["outlet name", "outlet_name"] },
  { key: "branch_name", label: "Branch", required: false, aliases: ["branch name", "branch", "sales_area_name"] },
  { key: "region", label: "Region", required: false, aliases: ["region name", "region", "region_name"] },
  { key: "area", label: "Area", required: false, aliases: ["area name", "area", "sub_area_name"] },
  { key: "mc", label: "Micro Cluster (MC)", required: false, aliases: ["micro_cluster_name", "micro cluster name (mc)", "micro cluster", "mc", "cluster_name"] },
  { key: "outlet_category", label: "Outlet Category", required: false, aliases: ["outlet category", "outlet_category"] },
  { key: "kecamatan", label: "Kecamatan", required: false, aliases: ["kecamatan name", "kecamatan", "kecamatan_name"] },
  { key: "lng", label: "Longitude (opsional)", required: false, aliases: ["long", "longitude", "lng"] },
  { key: "lat", label: "Latitude (opsional)", required: false, aliases: ["lat", "latitude"] },
];

const PREVIEW_COLS = ["brand", "branch_name", "mc", "outlet_code", "outlet_name", "outlet_category", "kecamatan"];

// Kolom tabel preview PENUH (data yang sudah tersimpan di database, dibuka
// dgn klik salah satu Periode Tersedia) - filter:true dapat dropdown
// ExcelFilter Excel-style, persis pola di Activity Plan.
const VIEW_COLUMNS = [
  { key: "brand", label: "Brand", width: 74, filter: true, get: (r) => brandLabel(r.brand) },
  { key: "region", label: "Region", width: 140, filter: true, get: (r) => r.region || "-" },
  { key: "area", label: "Area", width: 140, filter: true, get: (r) => r.area || "-" },
  { key: "branch_name", label: "Branch", width: 150, filter: true, get: (r) => r.branch_name || "-" },
  { key: "mc", label: "Micro Cluster (MC)", width: 170, filter: true, get: (r) => r.mc || "-" },
  { key: "outlet_code", label: "Outlet Code", width: 120, filter: true, get: (r) => r.outlet_code || "-" },
  { key: "outlet_name", label: "Outlet Name", width: 240, filter: true, get: (r) => r.outlet_name || "-" },
  { key: "outlet_category", label: "Outlet Category", width: 150, filter: true, get: (r) => r.outlet_category || "-" },
  { key: "kecamatan", label: "Kecamatan", width: 150, filter: true, get: (r) => r.kecamatan || "-" },
  { key: "lng", label: "Longitude", width: 110, filter: false, get: (r) => (r.lng != null ? String(r.lng) : "-") },
  { key: "lat", label: "Latitude", width: 110, filter: false, get: (r) => (r.lat != null ? String(r.lat) : "-") },
];

function brandLabel(v) { return v ? (BRAND_DISPLAY[v] || String(v).toUpperCase()) : "-"; }

function norm(s) { return String(s ?? "").trim().toLowerCase(); }
function colLetter(i) { let s = ""; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
function fileKindOf(file) {
  const name = (file?.name || "").toLowerCase();
  if (name.endsWith(".csv")) return "csv";
  return "xlsx";
}

// Nilai Brand mentah dari file (bisa "IM3", "Indosat", "3ID", "TRI", dst) -
// dinormalisasi ke kunci brand baku yang dipakai di seluruh MartaHub.
function normalizeBrand(raw) {
  const v = norm(raw).replace(/[^a-z0-9]/g, "");
  if (!v) return null;
  if (v.includes("im3")) return "im3";
  if (v.includes("3id") || v.includes("tri")) return "tri";
  return norm(raw);
}

// ── Parser CSV ringan (RFC4180-ish: koma sbg pemisah, kutip ganda utk
//    field berisi koma/petik/baris baru) - cukup utk file export Excel. ──
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Baca STREAMING (async generator) baris demi baris dari sebuah File CSV -
 * tidak pernah memuat seluruh isi file ke memori sekaligus. */
async function* iterCsvLines(file) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        yield line;
      }
    }
    buffer += decoder.decode();
    if (buffer) yield buffer;
  } finally {
    reader.releaseLock?.();
  }
}

/** Baca grid mentah utk XLSX (penuh, lewat SheetJS - format ini memang
 * butuh dibaca seluruhnya). */
async function readXlsxGrid(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  return raw.filter((r) => Array.isArray(r));
}

/** Ambil beberapa baris pertama CSV (cukup dari potongan awal file, TIDAK
 * baca seluruh file) - dipakai utk preview mentah & pilih baris header. */
async function readCsvPrefixGrid(file) {
  const prefix = file.slice(0, CSV_PREFIX_BYTES);
  const text = await prefix.text();
  const lines = text.split(/\r\n|\n/);
  if (prefix.size < file.size && lines.length > 0) lines.pop(); // baris terakhir mungkin terpotong
  return lines.filter((l) => l.length > 0).map(parseCsvLine);
}

function guessHeaderRow(rawRows) {
  for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
    const row = (rawRows[i] || []).map(norm);
    if (row.includes("outlet code") && row.includes("outlet name")) return i;
  }
  return null;
}

function guessColAssign(headerRow) {
  const headerNorm = (headerRow || []).map(norm);
  const assign = {};
  for (const f of TARGET_FIELDS) {
    let idx = -1;
    for (const a of f.aliases) { idx = headerNorm.indexOf(a); if (idx !== -1) break; }
    assign[f.key] = idx;
  }
  return assign;
}

function mapRow(r, colAssign) {
  const codeIdx = colAssign.outlet_code;
  const outletCode = codeIdx == null || codeIdx === -1 ? "" : r[codeIdx];
  if (outletCode === "" || outletCode == null) return null;
  const obj = {};
  for (const f of TARGET_FIELDS) {
    const idx = colAssign[f.key];
    obj[f.key] = idx == null || idx === -1 ? null : (String(r[idx] ?? "").trim() || null);
  }
  // Outlet Code SEHARUSNYA selalu 8 digit (mis. "00514748") - tapi kalau
  // kolom sumbernya berupa angka murni (Excel cell bertipe Number, atau
  // export BigQuery/CSV yg sudah dlm bentuk integer), nol di depan otomatis
  // hilang jadi "514748". Kembalikan ke 8 digit dgn padStart SELAMA nilainya
  // memang cuma berisi digit (bukan kode alfanumerik) - kalau sudah >=8
  // digit atau bukan angka murni, dibiarkan apa adanya.
  let outletCodeStr = String(outletCode).trim();
  if (/^\d+$/.test(outletCodeStr) && outletCodeStr.length < 8) outletCodeStr = outletCodeStr.padStart(8, "0");
  obj.outlet_code = outletCodeStr;
  if (obj.outlet_name) obj.outlet_name = obj.outlet_name.toUpperCase();
  if (obj.brand) obj.brand = normalizeBrand(obj.brand);
  return obj;
}

function tallyBy(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = r[key] || "(kosong)"; m.set(k, (m.get(k) || 0) + 1); }
  return Array.from(m, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

// Kunci dedup: SELURUH kolom yg dipetakan (brand, outlet_code, outlet_name,
// branch_name, dst) digabung jadi satu - JANGAN cuma outlet_code, krn
// outlet_code yg sama BISA valid muncul di brand berbeda (mis. IM3 & 3ID
// sekaligus) - itu bukan duplikat, dua baris berbeda. Baris baru dianggap
// duplikat & DILEWATI HANYA kalau SEMUA kolomnya sama persis dgn baris yg
// sudah pernah muncul sebelumnya di file yg sama (case/whitespace-insensitive
// utk teks) - kalau ada satu saja kolom yg beda (mis. branch beda), baris
// tetap disimpan, tidak dianggap duplikat.
function dupKeyOf(mapped) {
  return TARGET_FIELDS.map((f) => String(mapped[f.key] ?? "").trim().toUpperCase()).join("\u0001");
}

/** XLSX: rawRows sudah penuh di memori, bangun langsung (sync). Baris dgn
 * Outlet Code yg sudah pernah muncul dibuang, dihitung sbg dupSkipped. */
function buildMappedRowsXlsx(rawRows, headerRowIdx, colAssign) {
  const rows = [];
  const seen = new Set();
  let dupSkipped = 0;
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || r.length === 0) continue;
    const mapped = mapRow(r, colAssign);
    if (!mapped) continue;
    const key = dupKeyOf(mapped);
    if (seen.has(key)) { dupSkipped++; continue; }
    seen.add(key);
    rows.push(mapped);
  }
  return { rows, dupSkipped };
}

/** CSV: satu kali lewat file (streaming) - kumpulkan ringkasan per Branch +
 * per Brand + contoh baris + total, TANPA menyimpan semua baris di memori.
 * Outlet Code duplikat (sudah pernah muncul di baris sebelumnya) dilewati -
 * SET `seen` menampung SELURUH outlet_code yg sudah lolos (bukan cuma yg
 * masuk sampleRows), jadi hasilnya konsisten dgn pass kedua (streamImportCsv)
 * yang memakai logika pembuangan duplikat yang sama persis. */
async function summarizeCsvStreaming(file, headerRowIdx, colAssign, onProgress) {
  let lineIdx = -1;
  let totalCount = 0;
  let dupSkipped = 0;
  const branchCounts = new Map();
  const brandCounts = new Map();
  const sampleRows = [];
  const seen = new Set();
  let bytesRead = 0;
  for await (const line of iterCsvLines(file)) {
    lineIdx++;
    bytesRead += line.length + 1;
    if (lineIdx <= headerRowIdx) continue;
    if (!line) continue;
    const mapped = mapRow(parseCsvLine(line), colAssign);
    if (!mapped) continue;
    const key = dupKeyOf(mapped);
    if (seen.has(key)) { dupSkipped++; continue; }
    seen.add(key);
    totalCount++;
    const bk = mapped.branch_name || "(kosong)";
    branchCounts.set(bk, (branchCounts.get(bk) || 0) + 1);
    const brk = mapped.brand || "(kosong)";
    brandCounts.set(brk, (brandCounts.get(brk) || 0) + 1);
    if (sampleRows.length < PREVIEW_ROWS) sampleRows.push(mapped);
    if (totalCount % 20000 === 0) onProgress?.(bytesRead);
  }
  return {
    totalCount, sampleRows, dupSkipped,
    branchSummary: Array.from(branchCounts, ([branch_name, count]) => ({ branch_name, count })).sort((a, b) => b.count - a.count),
    brandSummary: Array.from(brandCounts, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
  };
}

/** CSV: lewat file KEDUA KALINYA saat konfirmasi import - langsung kirim
 * tiap batch ke Supabase begitu terkumpul, tidak pernah menahan lebih dari
 * BATCH_SIZE baris di memori. Pakai SET `seen` baru (independen dari pass
 * summarize) tapi dgn logika dedup yg SAMA PERSIS - deterministik krn urutan
 * baris di file tidak berubah, jadi hasil akhir konsisten dgn preview. */
async function streamImportCsv(file, headerRowIdx, colAssign, { periodMonth, callerEmail, onProgress }) {
  let lineIdx = -1;
  let batch = [];
  let done = 0;
  const seen = new Set();
  for await (const line of iterCsvLines(file)) {
    lineIdx++;
    if (lineIdx <= headerRowIdx) continue;
    if (!line) continue;
    const mapped = mapRow(parseCsvLine(line), colAssign);
    if (!mapped) continue;
    const key = dupKeyOf(mapped);
    if (seen.has(key)) continue;
    seen.add(key);
    batch.push(mapped);
    if (batch.length >= BATCH_SIZE) {
      await insertOutletMappingBatch({ periodMonth, rows: batch, callerEmail });
      done += batch.length;
      onProgress?.(done);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await insertOutletMappingBatch({ periodMonth, rows: batch, callerEmail });
    done += batch.length;
    onProgress?.(done);
  }
  return done;
}

export default function OutletMappingPage() {
  return (
    <MartaShell active="master" title="Mapping Outlet POSM" subtitle="Upload mapping Outlet-to-DSE bulanan (Retailer Installment) - brand dipetakan dari kolom di file.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const router = useRouter();
  const [scope, setScope] = useState(null);
  const [periodMonth, setPeriodMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [periods, setPeriods] = useState(null);

  const [file, setFile] = useState(null);
  const [kind, setKind] = useState(null); // "xlsx" | "csv"
  const [parsing, setParsing] = useState(false);
  const [rawRows, setRawRows] = useState(null); // grid preview: penuh (xlsx) atau prefix saja (csv)
  const [headerRowIdx, setHeaderRowIdx] = useState(null);
  const [colAssign, setColAssign] = useState(null); // { field: rawColIndex }
  const [applying, setApplying] = useState(false);
  const [mapped, setMapped] = useState(null); // { totalCount, sampleRows, branchSummary, brandSummary, xlsxRows? }

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // ── Preview PENUH data yang SUDAH tersimpan (dibuka dgn klik salah satu
  //    Periode Tersedia) - filter per kolom + export .xlsx dari hasil filter.
  //    Dimuat PROGRESIF: 1000 baris pertama langsung tampil & bisa dipakai,
  //    sisanya lanjut dimuat di background dgn progress bar %. ──
  const [viewPeriod, setViewPeriod] = useState(null); // period_month yang lagi dibuka
  const [viewLoading, setViewLoading] = useState(false); // true HANYA sampai halaman pertama datang
  const [viewLoadingMore, setViewLoadingMore] = useState(false); // true selama halaman lanjutan masih dimuat
  const [viewProgress, setViewProgress] = useState({ loaded: 0, total: null });
  const [viewRows, setViewRows] = useState(null);
  const [viewErr, setViewErr] = useState("");
  const [colFilters, setColFilters] = useState({});
  const [sortState, setSortState] = useState({ key: null, dir: "asc" });
  const [viewExporting, setViewExporting] = useState(false);
  const viewReqRef = useRef(0);
  // ── Virtualisasi tabel: dgn 140rb+ baris, render SEMUA <tr> ke DOM
  //    sekaligus akan bikin browser sangat lambat/hang (bukan soal
  //    kecepatan fetch lagi). Jadi cuma baris yg kelihatan di viewport (+
  //    overscan) yg benar2 dirender - sisanya diwakili 1 baris spacer
  //    kosong di atas & bawah supaya scrollbar tetap proporsional. ──
  const [viewScrollTop, setViewScrollTop] = useState(0);
  const viewScrollRef = useRef(null);
  const viewScrollLatest = useRef(0);
  const viewScrollRafPending = useRef(false);
  function handleViewScroll(e) {
    viewScrollLatest.current = e.currentTarget.scrollTop;
    if (viewScrollRafPending.current) return;
    viewScrollRafPending.current = true;
    requestAnimationFrame(() => {
      setViewScrollTop(viewScrollLatest.current);
      viewScrollRafPending.current = false;
    });
  } // guard: abaikan halaman yg nyasar dari request lama kalau user ganti periode di tengah loading

  useEffect(() => { if (email) getMartaScope(email).then(setScope); }, [email]);
  const canManage = CAN_MANAGE_ROLES.includes(scope?.role);

  async function loadPeriods() {
    try { setPeriods(await fetchOutletMappingPeriods()); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { loadPeriods(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const headerRow = headerRowIdx != null && rawRows ? rawRows[headerRowIdx] : null;
  const colCount = rawRows ? rawRows.reduce((m, r) => Math.max(m, (r || []).length), 0) : 0;

  async function pickFile(f) {
    resetAll();
    setFile(f || null);
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setErr(`Ukuran file ${(f.size / 1024 / 1024).toFixed(1)}MB melebihi batas maksimal ${MAX_FILE_MB}MB.`);
      setFile(null);
      return;
    }
    const k = fileKindOf(f);
    setKind(k);
    setParsing(true);
    try {
      const grid = k === "csv" ? await readCsvPrefixGrid(f) : await readXlsxGrid(f);
      if (grid.length === 0) throw new Error("File kosong atau tidak bisa dibaca.");
      setRawRows(grid);
      const guessed = guessHeaderRow(grid);
      if (guessed != null) {
        setHeaderRowIdx(guessed);
        setColAssign(guessColAssign(grid[guessed]));
      }
    } catch (e) {
      setErr(e.message || "Gagal membaca file ini");
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  function resetAll() {
    setRawRows(null); setHeaderRowIdx(null); setColAssign(null); setMapped(null); setKind(null); setErr(""); setOk("");
  }

  function chooseHeaderRow(idx) {
    setHeaderRowIdx(idx);
    setColAssign(guessColAssign(rawRows[idx]));
    setMapped(null);
  }

  function setFieldColumn(field, idxStr) {
    setColAssign((prev) => ({ ...prev, [field]: idxStr === "" ? -1 : Number(idxStr) }));
  }

  const missingRequired = colAssign ? TARGET_FIELDS.filter((f) => f.required && (colAssign[f.key] == null || colAssign[f.key] === -1)) : [];

  async function applyMapping() {
    setErr("");
    if (missingRequired.length > 0) { setErr(`Petakan dulu kolom wajib: ${missingRequired.map((f) => f.label).join(", ")}.`); return; }
    setApplying(true);
    try {
      if (kind === "xlsx") {
        const { rows, dupSkipped } = buildMappedRowsXlsx(rawRows, headerRowIdx, colAssign);
        if (rows.length === 0) throw new Error("Tidak ada baris data valid dgn mapping ini - cek lagi pilihan kolom Outlet Code.");
        setMapped({
          totalCount: rows.length, sampleRows: rows.slice(0, PREVIEW_ROWS), dupSkipped,
          branchSummary: tallyBy(rows, "branch_name"),
          brandSummary: tallyBy(rows, "brand"),
          xlsxRows: rows,
        });
      } else {
        const summary = await summarizeCsvStreaming(file, headerRowIdx, colAssign);
        if (summary.totalCount === 0) throw new Error("Tidak ada baris data valid dgn mapping ini - cek lagi pilihan kolom Outlet Code.");
        setMapped({ ...summary, xlsxRows: null });
      }
    } catch (e) {
      setErr(e.message || "Gagal memproses mapping");
    } finally {
      setApplying(false);
    }
  }

  async function confirmImport() {
    if (!mapped || mapped.totalCount === 0) { setErr("Belum ada data hasil mapping."); return; }
    if (!periodMonth) { setErr("Pilih Period (bulan) dulu."); return; }
    setBusy(true); setErr(""); setOk(""); setProgress({ done: 0, total: mapped.totalCount });
    try {
      await clearOutletMapping({ periodMonth, callerEmail: email });
      if (kind === "xlsx") {
        const rows = mapped.xlsxRows;
        let done = 0;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          await insertOutletMappingBatch({ periodMonth, rows: batch, callerEmail: email });
          done += batch.length;
          setProgress({ done, total: rows.length });
        }
      } else {
        await streamImportCsv(file, headerRowIdx, colAssign, {
          periodMonth, callerEmail: email,
          onProgress: (done) => setProgress({ done, total: mapped.totalCount }),
        });
      }
      const brandNote = mapped.brandSummary.map((b) => `${brandLabel(b.value)} (${b.count.toLocaleString("id-ID")})`).join(", ");
      const dupNote = mapped.dupSkipped > 0 ? ` ${mapped.dupSkipped.toLocaleString("id-ID")} baris identik (semua kolom sama persis) dilewati.` : "";
      setOk(`Berhasil mengunggah ${mapped.totalCount.toLocaleString("id-ID")} baris mapping outlet periode ${periodMonth}. ${brandNote}.${dupNote}`);
      setFile(null); resetAll();
      await loadPeriods();
    } catch (e) {
      setErr(e.message || "Gagal mengunggah mapping outlet");
    } finally {
      setBusy(false);
    }
  }

  async function clearPeriod(pm) {
    if (!window.confirm(`Hapus SELURUH mapping outlet periode ${pm} (semua brand)? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await clearOutletMapping({ periodMonth: pm, callerEmail: email });
      if (viewPeriod === pm) closeViewPeriod();
      await loadPeriods();
    } catch (e) { setErr(e.message); }
  }

  async function openViewPeriod(pm) {
    const reqId = ++viewReqRef.current;
    const totalHint = periods?.find((p) => p.period_month === pm)?.outlet_count || null;
    setViewPeriod(pm); setViewErr(""); setViewRows([]); setColFilters({}); setSortState({ key: null, dir: "asc" });
    setViewLoading(true); setViewLoadingMore(false);
    setViewProgress({ loaded: 0, total: totalHint });
    // Halaman datang PARALEL & cepat (lihat fetchOutletMappingFull) - kalau
    // tiap halaman langsung memicu setViewRows + re-render tabel penuh, React
    // jadi harus rebuild filter/table berkali-kali dlm hitungan detik (justru
    // BIKIN LAMBAT lagi di sisi browser). Jadi baris ditampung dulu (buffer)
    // & di-flush ke state paling cepat tiap 200ms - halaman PERTAMA tetap
    // langsung tampil instan drpd nunggu buffer.
    let buffer = [];
    let lastFlush = 0;
    let gotFirstPage = false;
    const FLUSH_MS = 200;
    function flush(force) {
      if (reqId !== viewReqRef.current) return;
      const now = Date.now();
      if (!force && now - lastFlush < FLUSH_MS) return;
      if (buffer.length === 0) return;
      const toAdd = buffer; buffer = [];
      setViewRows((prev) => [...(prev || []), ...toAdd]);
      lastFlush = now;
    }
    try {
      await fetchOutletMappingFull(pm, {
        totalHint,
        onPage: (chunk, loadedSoFar) => {
          if (reqId !== viewReqRef.current) return; // periode sudah diganti/ditutup - abaikan halaman nyasar
          buffer.push(...chunk);
          setViewProgress((p) => ({ ...p, loaded: loadedSoFar }));
          if (!gotFirstPage) {
            gotFirstPage = true;
            flush(true); // halaman pertama (1000 baris) langsung tampil, tidak nunggu throttle
            setViewLoading(false);
            setViewLoadingMore(true);
          } else {
            flush(false);
          }
        },
      });
      flush(true); // pastikan sisa buffer di halaman terakhir ikut ke-flush
    } catch (e) {
      if (reqId === viewReqRef.current) setViewErr(e.message || "Gagal memuat data periode ini");
    } finally {
      if (reqId === viewReqRef.current) { setViewLoading(false); setViewLoadingMore(false); }
    }
  }

  function closeViewPeriod() {
    viewReqRef.current++; // batalkan halaman lanjutan yg masih dalam perjalanan
    setViewPeriod(null); setViewRows(null); setViewErr(""); setColFilters({}); setSortState({ key: null, dir: "asc" });
    setViewLoading(false); setViewLoadingMore(false); setViewProgress({ loaded: 0, total: null });
  }

  const FILTER_COLS = useMemo(() => VIEW_COLUMNS.filter((c) => c.filter), []);

  // ── Chained faceted filter options - utk tiap kolom filter, opsi dihitung
  //    dari data yg SUDAH terfilter oleh kolom filter LAIN (bukan dirinya
  //    sendiri), persis pola ExcelFilter di Activity Plan. ──
  const filterOptionsMap = useMemo(() => {
    const rows = viewRows || [];
    const out = {};
    for (const col of FILTER_COLS) {
      let list = rows;
      for (const oc of FILTER_COLS) {
        if (oc.key === col.key) continue;
        const sel = colFilters[oc.key];
        if (sel && sel.length) list = list.filter((r) => sel.includes(oc.get(r)));
      }
      const uniq = [...new Set(list.map(col.get).filter((v) => v && v !== "-"))].sort((a, b) => String(a).localeCompare(String(b), "id"));
      out[col.key] = uniq.map((v) => ({ value: v, label: String(v) }));
    }
    return out;
  }, [FILTER_COLS, viewRows, colFilters]);

  const filteredViewRows = useMemo(() => {
    let list = viewRows || [];
    for (const col of FILTER_COLS) {
      const sel = colFilters[col.key];
      if (sel && sel.length) list = list.filter((r) => sel.includes(col.get(r)));
    }
    if (sortState.key) {
      const col = VIEW_COLUMNS.find((c) => c.key === sortState.key);
      if (col) {
        list = [...list].sort((a, b) => {
          const av = col.get(a), bv = col.get(b);
          const cmp = String(av).localeCompare(String(bv), "id", { numeric: true });
          return sortState.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [viewRows, colFilters, sortState, FILTER_COLS]);

  const hasAnyViewFilter = Object.values(colFilters).some((v) => v && v.length);

  // Reset posisi scroll (& jendela virtualisasi) tiap filter/sort/periode
  // berubah - drpd nyangkut di scrollTop lama yg sekarang nunjuk ke baris
  // yg sudah tidak ada di hasil filter baru.
  useEffect(() => {
    setViewScrollTop(0);
    if (viewScrollRef.current) viewScrollRef.current.scrollTop = 0;
  }, [colFilters, sortState, viewPeriod]);

  // Jendela baris yg BENAR2 dirender ke DOM (lihat komentar di deklarasi
  // viewScrollTop) - dihitung tiap render dari posisi scroll saat ini,
  // bukan di-useMemo, krn cuma slice() murah atas array yg sudah jadi.
  const VIEW_ROW_H = 34;
  const VIEW_OVERSCAN = 20;
  const VIEW_VIEWPORT_ROWS = 24; // perkiraan baris yg muat di tinggi 70vh
  const viewStartIdx = Math.max(0, Math.floor(viewScrollTop / VIEW_ROW_H) - VIEW_OVERSCAN);
  const viewEndIdx = Math.min(filteredViewRows.length, viewStartIdx + VIEW_VIEWPORT_ROWS + VIEW_OVERSCAN * 2);
  const viewTopPad = viewStartIdx * VIEW_ROW_H;
  const viewBottomPad = (filteredViewRows.length - viewEndIdx) * VIEW_ROW_H;
  const visibleViewRows = filteredViewRows.slice(viewStartIdx, viewEndIdx);

  async function exportViewXlsx() {
    setViewExporting(true);
    try {
      const data = filteredViewRows.map((r, i) => ({
        No: i + 1,
        Brand: brandLabel(r.brand),
        Region: r.region || "",
        Area: r.area || "",
        Branch: r.branch_name || "",
        "Micro Cluster (MC)": r.mc || "",
        "Outlet Code": r.outlet_code || "",
        "Outlet Name": r.outlet_name || "",
        "Outlet Category": r.outlet_category || "",
        Kecamatan: r.kecamatan || "",
        Longitude: r.lng ?? "",
        Latitude: r.lat ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Mapping Outlet");
      XLSX.writeFile(wb, `MartaHub_Mapping_Outlet_${viewPeriod}.xlsx`);
    } catch (e) {
      setViewErr(e.message || "Gagal export .xlsx");
    } finally {
      setViewExporting(false);
    }
  }

  return (
    <div>
      <style>{"@keyframes mh-spin { to { transform: rotate(360deg); } }"}</style>
      <button onClick={() => router.push("/martahub/master")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.mid, fontSize: 12.5, fontWeight: 700, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Master Data
      </button>

      {!canManage && scope && (
        <div style={note}>Mode lihat saja - hanya Head TMV, Brand TMV, atau SPM Sumatera yang dapat mengunggah mapping outlet.</div>
      )}

      {err && <div style={{ ...note, background: "#FDECEC", border: "1px solid #F3B4B4", color: "#C62828", marginTop: 12 }}>{err}</div>}
      {ok && <div style={{ ...note, background: "rgba(21,128,61,0.08)", border: "1px solid rgba(21,128,61,0.25)", color: "#15803D", marginTop: 12 }}>{ok}</div>}

      <div style={{ marginTop: 14, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.hi, marginBottom: 12 }}>Upload Mapping Outlet Bulanan</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 160 }}>
            <div style={label}>Period (Bulan)</div>
            <input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} disabled={busy} style={inp} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={label}>File .xlsx / .csv (maks {MAX_FILE_MB}MB)</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 9, border: `1.5px dashed ${T.line}`, background: "#F7F8FA", cursor: busy ? "default" : "pointer", fontSize: 12, color: T.mid, fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
              {parsing ? <Loader2 size={14} style={{ animation: "mh-spin .85s linear infinite" }} /> : kind === "csv" ? <FileText size={14} /> : <Upload size={14} />}
              {file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)` : "Pilih file COMPILE MAPPING OUTLET TO DSE…"}
              <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={busy || parsing} onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
          </div>
        </div>
        {parsing && <div style={{ marginTop: 10, fontSize: 11.5, color: T.lo }}>Membaca file…</div>}
        <div style={{ marginTop: 8, fontSize: 11, color: T.lo }}>
          Satu file boleh berisi campuran brand (IM3 &amp; 3ID sekaligus) - Brand dipetakan dari kolom di file pada tahap 2, tidak perlu dipilih manual.
          {" "}Untuk file berukuran besar (puluhan-ratusan ribu baris), pakai format <b>.csv</b> - dibaca secara streaming jadi tidak membebani browser. File .xlsx dibaca penuh ke memori, jadi lebih cocok utk file yang tidak terlalu besar.
        </div>
      </div>

      {/* ── Tahap 1: RAW preview + pilih baris header ── */}
      {rawRows && !busy && (
        <div style={{ marginTop: 16, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.hi, marginBottom: 4 }}>1. Data Mentah &amp; Pilih Baris Header</div>
          <div style={{ fontSize: 12, color: T.mid, marginBottom: 12 }}>
            Format file bisa beda tiap bulan, jadi cek dulu baris mana yang berisi nama-nama kolom (Outlet Code, Branch Name, dst), lalu klik "Jadikan Header" di baris itu.
            {kind === "csv" && <> (Ditampilkan dari awal file saja - cukup utk lihat posisi header.)</>}
            {headerRowIdx != null && <> Baris terpilih saat ini: <b>baris ke-{headerRowIdx + 1}</b>.</>}
          </div>
          <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
              <thead>
                <tr style={{ background: "#F7F8FA" }}>
                  <th style={{ padding: "6px 8px", borderBottom: `1px solid ${T.line}` }}></th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 800, color: T.mid, borderBottom: `1px solid ${T.line}` }}>#</th>
                  {Array.from({ length: Math.min(colCount, 14) }).map((_, i) => (
                    <th key={i} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 800, color: T.mid, borderBottom: `1px solid ${T.line}` }}>{colLetter(i)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawRows.slice(0, RAW_PREVIEW_ROWS).map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.line}`, background: headerRowIdx === i ? "rgba(237,28,36,0.05)" : "transparent" }}>
                    <td style={{ padding: "5px 8px" }}>
                      <button onClick={() => chooseHeaderRow(i)}
                        style={{ display: "flex", alignItems: "center", gap: 4, height: 24, padding: "0 8px", borderRadius: 999, border: headerRowIdx === i ? "none" : `1.5px solid ${T.line}`, background: headerRowIdx === i ? T.primary : "#fff", color: headerRowIdx === i ? "#fff" : T.mid, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {headerRowIdx === i ? <Check size={11} /> : null} {headerRowIdx === i ? "Header" : "Jadikan Header"}
                      </button>
                    </td>
                    <td style={{ padding: "5px 8px", color: T.lo, fontWeight: 700 }}>{i + 1}</td>
                    {Array.from({ length: Math.min(colCount, 14) }).map((_, ci) => (
                      <td key={ci} style={{ padding: "5px 8px", color: T.hi, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{String(r?.[ci] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {colCount > 14 && <div style={{ marginTop: 6, fontSize: 10.5, color: T.lo }}>Menampilkan 14 kolom pertama dari {colCount} kolom.</div>}
        </div>
      )}

      {/* ── Tahap 2: petakan tiap field target ke kolom asli ── */}
      {rawRows && headerRow && colAssign && !busy && (
        <div style={{ marginTop: 16, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.hi, marginBottom: 4 }}>2. Petakan Kolom</div>
          <div style={{ fontSize: 12, color: T.mid, marginBottom: 12 }}>Sudah ditebak otomatis dari nama header, cek &amp; ubah kalau ada yang meleset. Brand, Outlet Code &amp; Outlet Name wajib dipetakan.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {TARGET_FIELDS.map((f) => (
              <div key={f.key}>
                <div style={{ fontSize: 11, fontWeight: 700, color: f.required ? T.primary : T.lo, marginBottom: 4 }}>{f.label}{f.required && " *"}</div>
                <select value={colAssign[f.key] ?? -1} onChange={(e) => setFieldColumn(f.key, e.target.value)} style={inp}>
                  <option value={-1}>(tidak dipetakan)</option>
                  {headerRow.map((h, i) => (
                    <option key={i} value={i}>{colLetter(i)} - {String(h ?? "").trim() || "(kosong)"}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button onClick={applyMapping} disabled={missingRequired.length > 0 || applying}
            style={{ marginTop: 16, height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: missingRequired.length > 0 || applying ? "#F0A8A8" : T.primary, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: missingRequired.length > 0 || applying ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            {applying ? <Loader2 size={14} style={{ animation: "mh-spin .85s linear infinite" }} /> : <Eye size={14} />}
            {applying ? "Memproses seluruh file…" : "Terapkan Mapping & Preview Data"}
          </button>
        </div>
      )}

      {/* ── Tahap 3: preview data hasil mapping + konfirmasi import ── */}
      {mapped && !busy && (
        <div style={{ marginTop: 16, background: "#fff", border: `1.5px solid ${T.primary}30`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Eye size={15} color={T.primary} />
            <div style={{ fontSize: 13, fontWeight: 800, color: T.hi }}>3. Preview Data Sebelum Import</div>
          </div>
          <div style={{ fontSize: 12, color: T.mid, marginBottom: 12 }}>
            {mapped.totalCount.toLocaleString("id-ID")} baris outlet siap diimpor utk periode <b>{periodMonth}</b>. Belum ada yang disimpan.
          </div>

          {mapped.dupSkipped > 0 && (
            <div style={{ marginBottom: 14, fontSize: 11.5, color: "#B7791F", background: "#FFF6E5", border: "1px solid #F0D9A0", borderRadius: 9, padding: "7px 11px" }}>
              <b>{mapped.dupSkipped.toLocaleString("id-ID")} baris</b> identik (SEMUA kolomnya sama persis dgn baris lain di file ini, termasuk brand) otomatis DILEWATI - outlet code yg sama tapi brand-nya beda (mis. IM3 &amp; 3ID) TETAP disimpan sbg baris terpisah.
            </div>
          )}

          {mapped.brandSummary?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.lo, marginBottom: 6 }}>RINGKASAN PER BRAND ({mapped.brandSummary.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {mapped.brandSummary.map((b) => (
                  <span key={b.value} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#F7F8FA", border: `1px solid ${T.line}`, color: T.mid }}>
                    {brandLabel(b.value)} <span style={{ color: T.hi }}>({b.count.toLocaleString("id-ID")})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {mapped.branchSummary.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.lo, marginBottom: 6 }}>RINGKASAN PER BRANCH ({mapped.branchSummary.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {mapped.branchSummary.slice(0, 24).map((b) => (
                  <span key={b.branch_name} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#F7F8FA", border: `1px solid ${T.line}`, color: T.mid }}>
                    {b.branch_name} <span style={{ color: T.hi }}>({b.count.toLocaleString("id-ID")})</span>
                  </span>
                ))}
                {mapped.branchSummary.length > 24 && <span style={{ fontSize: 11, color: T.lo, alignSelf: "center" }}>+{mapped.branchSummary.length - 24} branch lain</span>}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: T.lo, marginBottom: 6 }}>CONTOH {Math.min(PREVIEW_ROWS, mapped.sampleRows.length)} BARIS PERTAMA (SUDAH DIPETAKAN)</div>
          <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, whiteSpace: "nowrap" }}>
              <thead>
                <tr style={{ background: "#F7F8FA" }}>
                  {PREVIEW_COLS.map((key) => (
                    <th key={key} style={{ textAlign: "left", padding: "7px 10px", fontWeight: 800, color: T.mid, borderBottom: `1px solid ${T.line}` }}>
                      {TARGET_FIELDS.find((f) => f.key === key)?.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mapped.sampleRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
                    {PREVIEW_COLS.map((key) => (
                      <td key={key} style={{ padding: "7px 10px", color: T.hi }}>{key === "brand" ? brandLabel(r.brand) : (r[key] || <span style={{ color: T.lo }}>-</span>)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mapped.totalCount > mapped.sampleRows.length && (
            <div style={{ marginTop: 6, fontSize: 11, color: T.lo }}>…dan {(mapped.totalCount - mapped.sampleRows.length).toLocaleString("id-ID")} baris lainnya.</div>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button onClick={confirmImport} disabled={!canManage}
              style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: !canManage ? "#F0A8A8" : T.primary, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: !canManage ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={15} /> Import Sekarang ({mapped.totalCount.toLocaleString("id-ID")} baris)
            </button>
            <button onClick={() => setMapped(null)}
              style={{ height: 40, padding: "0 16px", borderRadius: 10, border: `1.5px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <X size={14} /> Ubah Mapping Lagi
            </button>
            <button onClick={resetAll}
              style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: "none", color: T.lo, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Batalkan &amp; pilih file lain
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: T.lo }}>
            Import akan MENGGANTI seluruh data mapping periode {periodMonth} yang sudah ada (semua brand, bukan menambah).
          </div>
        </div>
      )}

      {busy && (
        <div style={{ marginTop: 16, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.hi, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={14} style={{ animation: "mh-spin .85s linear infinite" }} /> Mengimpor mapping outlet…
          </div>
          {progress && (
            <>
              <div style={{ height: 8, borderRadius: 999, background: "#F0F0F3", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.round((progress.done / progress.total) * 100)}%`, background: T.primary, borderRadius: 999, transition: "width .2s" }} />
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: T.lo, fontWeight: 600 }}>{progress.done.toLocaleString("id-ID")} / {progress.total.toLocaleString("id-ID")} baris</div>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.hi, marginBottom: 4 }}>Periode Tersedia</div>
        <div style={{ fontSize: 11.5, color: T.lo, marginBottom: 10 }}>Klik salah satu periode utk membuka preview data yang sudah tersimpan (semua baris, bisa difilter per kolom &amp; diexport).</div>
        {periods === null ? (
          <div style={{ fontSize: 12, color: T.lo }}>Memuat…</div>
        ) : periods.length === 0 ? (
          <div style={{ fontSize: 12, color: T.lo }}>Belum ada mapping outlet diunggah.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {periods.map((p) => (
              <div key={p.period_month} onClick={() => openViewPeriod(p.period_month)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: viewPeriod === p.period_month ? `${T.primary}12` : "#F7F8FA", border: viewPeriod === p.period_month ? `1.5px solid ${T.primary}` : "1.5px solid transparent", cursor: "pointer" }}>
                <FileSpreadsheet size={14} color={T.mid} />
                <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: T.hi }}>{p.period_month}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {(p.brands || []).map((b) => (
                    <span key={b.brand} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#fff", border: `1px solid ${T.line}`, color: T.mid }}>
                      {brandLabel(b.brand)} {Number(b.count).toLocaleString("id-ID")}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: T.lo, fontWeight: 600, minWidth: 76, textAlign: "right" }}>{Number(p.outlet_count).toLocaleString("id-ID")} outlet</div>
                {canManage && (
                  <button onClick={(e) => { e.stopPropagation(); clearPeriod(p.period_month); }} title="Hapus periode ini" disabled={busy}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#C62828", display: "flex", alignItems: "center" }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Preview PENUH data yang sudah tersimpan (klik salah satu periode di atas) ── */}
      {viewPeriod && (
        <div style={{ marginTop: 16, background: "#fff", border: `1.5px solid ${T.primary}30`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
            <Eye size={15} color={T.primary} />
            <div style={{ fontSize: 13, fontWeight: 800, color: T.hi, flex: 1 }}>Data Mapping Outlet · Periode {viewPeriod}</div>

            <button onClick={exportViewXlsx} disabled={viewLoading || viewExporting || !filteredViewRows.length}
              style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "none", background: (viewLoading || viewExporting || !filteredViewRows.length) ? "#9FCDAF" : "linear-gradient(135deg,#1E8E3E,#0F6B2C)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: (viewLoading || viewExporting || !filteredViewRows.length) ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Download size={13} /> {viewExporting ? "Menyiapkan…" : "Export .xlsx"}
            </button>
            {hasAnyViewFilter && (
              <button onClick={() => setColFilters({})}
                style={{ height: 34, padding: "0 12px", borderRadius: 9, border: `1.5px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Clear Filter
              </button>
            )}
            <button onClick={closeViewPeriod}
              style={{ height: 34, width: 34, borderRadius: 9, border: `1.5px solid ${T.line}`, background: "#fff", color: T.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={15} />
            </button>
          </div>

          {viewErr && <div style={{ ...note, background: "#FDECEC", border: "1px solid #F3B4B4", color: "#C62828", marginTop: 10 }}>{viewErr}</div>}

          {viewLoading ? (
            <div style={{ marginTop: 14, padding: "20px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12.5, color: T.lo, marginBottom: 10 }}>
                <Loader2 size={15} style={{ animation: "mh-spin .85s linear infinite" }} /> Memuat data periode ini…
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "#F0F0F3", overflow: "hidden", maxWidth: 420, margin: "0 auto" }}>
                <div style={{ height: "100%", width: viewProgress.total ? `${Math.min(100, Math.round((viewProgress.loaded / viewProgress.total) * 100))}%` : "35%", background: T.primary, borderRadius: 999, transition: "width .2s" }} />
              </div>
              <div style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: T.lo, fontWeight: 600 }}>
                {viewProgress.total
                  ? `${Math.min(100, Math.round((viewProgress.loaded / viewProgress.total) * 100))}% · ${viewProgress.loaded.toLocaleString("id-ID")} / ${viewProgress.total.toLocaleString("id-ID")} baris`
                  : `${viewProgress.loaded.toLocaleString("id-ID")} baris dimuat…`}
              </div>
            </div>
          ) : viewRows ? (
            <>
              <div style={{ margin: "10px 0", fontSize: 11.5, color: T.mid, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span>Menampilkan {filteredViewRows.length.toLocaleString("id-ID")} dari {viewRows.length.toLocaleString("id-ID")} baris {viewLoadingMore ? "yang sudah dimuat" : "tersimpan"}.</span>
                {viewLoadingMore && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.primary, fontWeight: 700 }}>
                    <Loader2 size={12} style={{ animation: "mh-spin .85s linear infinite" }} />
                    Memuat sisanya… {viewProgress.total ? `${Math.min(99, Math.round((viewProgress.loaded / viewProgress.total) * 100))}%` : `${viewProgress.loaded.toLocaleString("id-ID")} baris`}
                  </span>
                )}
              </div>
              {viewLoadingMore && (
                <div style={{ height: 5, borderRadius: 999, background: "#F0F0F3", overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ height: "100%", width: viewProgress.total ? `${Math.min(100, Math.round((viewProgress.loaded / viewProgress.total) * 100))}%` : "35%", background: T.primary, borderRadius: 999, transition: "width .2s" }} />
                </div>
              )}
              <div ref={viewScrollRef} onScroll={handleViewScroll} style={{ overflow: "auto", maxHeight: "70vh", border: `1px solid ${T.line}`, borderRadius: 10 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
                  <thead>
                    <tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
                      <th style={{ position: "sticky", top: 0, zIndex: 5, width: 50, padding: "8px 10px", fontSize: 10, fontWeight: 800, color: T.mid, background: "#F7F9FC", borderBottom: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}` }}>No</th>
                      {VIEW_COLUMNS.map((col) => {
                        const isSorted = sortState.key === col.key;
                        const filterConfig = col.filter ? {
                          options: filterOptionsMap[col.key] || [],
                          selected: colFilters[col.key] || [],
                          onApply: (vals) => setColFilters((p) => ({ ...p, [col.key]: vals })),
                          onClear: () => setColFilters((p) => { const n = { ...p }; delete n[col.key]; return n; }),
                          sortDir: isSorted ? sortState.dir : null,
                          onSort: (dir) => setSortState({ key: col.key, dir }),
                        } : null;
                        return (
                          <th key={col.key} style={{ position: "sticky", top: 0, zIndex: 5, width: col.width, minWidth: col.width, padding: "8px 10px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", color: isSorted ? T.primary : T.mid, background: "#F7F9FC", borderBottom: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}` }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                              <span onClick={() => !col.filter && setSortState((s) => ({ key: col.key, dir: s.key === col.key && s.dir === "asc" ? "desc" : "asc" }))}
                                style={{ overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }} title={col.label}>
                                {col.label}{isSorted && !col.filter ? (sortState.dir === "asc" ? " ▲" : " ▼") : ""}
                              </span>
                              {filterConfig && <ExcelFilter {...filterConfig} t={{ hi: T.hi, mid: T.mid, lo: T.lo, blue: T.primary, blueBg: T.primaryBg }} d={false} />}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredViewRows.length === 0 && (
                      <tr><td colSpan={VIEW_COLUMNS.length + 1} style={{ padding: 26, textAlign: "center", color: T.lo }}>Tidak ada baris utk filter saat ini.</td></tr>
                    )}
                    {viewTopPad > 0 && (
                      <tr aria-hidden style={{ height: viewTopPad }}><td colSpan={VIEW_COLUMNS.length + 1} style={{ padding: 0, border: "none" }} /></tr>
                    )}
                    {visibleViewRows.map((r, i) => {
                      const realIdx = viewStartIdx + i;
                      return (
                        <tr key={realIdx} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td style={{ padding: "7px 10px", color: T.lo, borderRight: `1px solid ${T.line}` }}>{realIdx + 1}</td>
                          {VIEW_COLUMNS.map((col) => (
                            <td key={col.key} style={{ padding: "7px 10px", color: T.hi, borderRight: `1px solid ${T.line}` }}>{col.get(r)}</td>
                          ))}
                        </tr>
                      );
                    })}
                    {viewBottomPad > 0 && (
                      <tr aria-hidden style={{ height: viewBottomPad }}><td colSpan={VIEW_COLUMNS.length + 1} style={{ padding: 0, border: "none" }} /></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

const label = { fontSize: 11, fontWeight: 700, color: T.lo, marginBottom: 5 };
const inp = { width: "100%", height: 38, padding: "0 11px", borderRadius: 9, border: `1.5px solid ${T.line}`, fontSize: 12.5, color: T.hi, outline: "none", boxSizing: "border-box" };
const note = { background: "#FFFDE7", border: "1px solid #F0E3B0", color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5 };
