"use client";
// BARU (permintaan user - "saya ingin upload file ini [DSE PROD xlsx, 2
// sheet IM3 & 3ID], dimana nanti akan dijumlahkan dan ditampilkan
// datanya misal ini as of 22... khusus utk tampilan spm_sumatera dulu...
// full month as of 22 juga nanti dibandingkan dengan data penjualan
// dse... yang dibandingkan itu sellin sp, voucher, dan saldo saja...
// fwa tidak perlu dibandingkan... dijumlahkan dari kolom username dan
// dse code, ditotalkan per masing-masing dse"):
//
// File sumber (export nasional, 2 sheet):
//  - IM3_DSE_PROD_<YYYYMM>: kolom kunci as_of_dt, username (= dse_code
//    IM3 di mf_dse_database), region, sellin_sp, sellin_vou, sellin_saldo.
//  - 3ID_DSE_PROD_<YYYYMM>: kolom kunci as_of_dt, dse_code (= dse_code_3id
//    di mf_dse_database), region, osa_sp, osa_vou, osa_saldo.
// (Tidak ada kolom FWA di kedua sheet - sejalan dgn permintaan user utk
// skip FWA dari perbandingan.)
//
// File SELALU data NASIONAL - difilter ke region Sumatera (NORTH/
// CENTRAL/SOUTH SUMATERA) saat parsing, sisanya diabaikan.
//
// 1 DSE py 2 ID (IM3 & 3ID, lihat dse_code/dse_code_3id di mf_dse_
// database - sama persis dgn "ID DSE (IM3)"/"ID DSE (3ID)" di form input
// DSE yg sudah ada) - utk perbandingan apple-to-apple dgn input DSE di
// app (yg SATU angka gabungan per hari, bukan per brand), sellin IM3 +
// osa 3ID DIJUMLAHKAN jadi SATU total per DSE (ditautkan via dse_code_
// 3id -> dse_code) sebelum dibandingkan ke SUM(nilai_sp/nilai_voucher/
// nilai_saldo) dari mf_dse_prod_ar (tanggal 1 s.d. as_of_dt bulan ybs).
//
// Baris yg kode-nya TIDAK ketemu di mf_dse_database (dse_code ATAU dse_
// code_3id) ~17% dari total - disimpan matched=false + raw_code apa
// adanya, ditampilkan terpisah sbg "DSE Tidak Dikenali" (bukan dibuang).
//
// 1 upload = REPLACE PENUH utk period (bulan) yg sama (hapus semua baris
// period itu dulu, baru insert ulang) - BUKAN riwayat/versioning.
//
// Akses: khusus spm_sumatera dulu (gate di page.jsx + RLS tabel mf_dse_
// admin_sellin_upload), sesuai permintaan user.
//
// UPDATE (permintaan user - "seharusnya bukannya gini dulu ya, ada 3
// kolom yang harus dicocokkan jadi muncul dulu datanya, lalu mau diambil
// dari total id mana jadi ada juga pasangkan dengan id dse sebagai
// primary key"): dulu kolom ID & SP/Voucher/Saldo per sheet dicari
// OTOMATIS dari nama kolom (username/dse_code/sellin_sp/osa_sp/dst) lalu
// LANGSUNG disimpan ke database tanpa dicek dulu. Sekarang ada tahap
// MAPPING+PREVIEW di antaranya: upload file cuma mem-parse sheet &
// kolomnya (TIDAK insert apa pun), lalu user pilih manual lewat dropdown
// kolom mana yg jadi ID (primary key dicocokkan ke mf_dse_database) dan
// kolom SP/Voucher/Saldo-nya per sheet (dropdown di-prefill tebakan
// otomatis kalau nama kolomnya cocok, tapi tetap bisa diganti) - baru
// setelah itu tombol "Lanjutkan ke Preview" menjalankan matching (SAMA
// PERSIS logic pencocokan dse_code/dse_code_3id & penjumlahan 2 brand yg
// sudah ada) dan menampilkan hasilnya sbg PREVIEW (belum tersimpan).
// User bisa "Ubah Mapping" (balik ganti kolom), "Batal" (buang preview),
// atau "Simpan ke Database" (baru di titik ini delete+insert ke
// mf_dse_admin_sellin_upload dijalankan). Kolom Region (filter Sumatera)
// & As Of Date TETAP otomatis dibaca dari nama kolom "region"/"as_of_dt"
// seperti sebelumnya (user confirm 2 kolom itu ga perlu manual).
import { useCallback, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet,
  Loader2, RefreshCw, Search, Upload, Wallet, X,
} from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT, mk, MONTHS_ID } from "./PNL_V2Shared";

const SUMATERA_REGIONS = new Set(["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"]);

const norm = (s) => String(s ?? "").trim().toUpperCase();
const numOrZero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
// BARU (permintaan user - "partner yang diawali SDP atau kiosk itu
// tidak dihitung, jadi tidak perlu dibilang DSE tidak ditemukan"):
// baris begini BUKAN DSE asli - exclude total dari proses pencocokan
// (bukan cuma disembunyikan dari tampilan "DSE Tidak Dikenali").
const isExcludedPartner = (partnerName) => {
  const p = norm(partnerName);
  return p.startsWith("SDP") || p.includes("KIOSK");
};
const fmtID = (n) => Math.round(numOrZero(n)).toLocaleString("id-ID");

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Cari period "YYYY-MM" dari nama sheet (mis. "IM3_DSE_PROD_202611" ->
// "2026-11") - lebih robust drpd hardcode bulan tertentu, supaya file
// bulan lain juga otomatis kebaca.
function periodFromSheetName(name) {
  const m = String(name || "").match(/(\d{4})(\d{2})\s*$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

function findSheet(wb, prefix) {
  return wb.SheetNames.find((n) => n.toUpperCase().startsWith(prefix));
}

// Label kolom mapping (dipakai di UI dropdown & pesan validasi).
const MAP_LABELS = { id: "Kolom ID (kode DSE)", sp: "Kolom SP", vou: "Kolom Voucher", saldo: "Kolom Saldo" };

// Agregasi SUM(nilai_sp/nilai_voucher/nilai_saldo) dari mf_dse_prod_ar
// (data inputan DSE di app) utk daftar dse_code & rentang tanggal
// tertentu - dipakai baik oleh tahap PREVIEW (sebelum disimpan) maupun
// tampilan hasil TERSIMPAN (loadComparison) supaya logicnya cuma 1
// tempat & selalu konsisten.
async function fetchAppTotals(dseCodes, startISO, endISO) {
  const appTotals = {};
  for (const part of chunk(dseCodes, 200)) {
    if (!part.length) continue;
    const { data: ar, error: eAr } = await supabase
      .from("mf_dse_prod_ar")
      .select("dse_code, nilai_sp, nilai_voucher, nilai_saldo")
      .in("dse_code", part)
      .gte("tanggal", startISO)
      .lte("tanggal", endISO);
    if (eAr) throw eAr;
    (ar || []).forEach((r) => {
      const a = appTotals[r.dse_code] || (appTotals[r.dse_code] = { sp: 0, vou: 0, saldo: 0 });
      a.sp += numOrZero(r.nilai_sp);
      a.vou += numOrZero(r.nilai_voucher);
      a.saldo += numOrZero(r.nilai_saldo);
    });
  }
  return appTotals;
}

// Matching murni (TIDAK insert ke DB) - dipanggil dari tahap "Lanjutkan
// ke Preview": ambil baris mentah per sheet (sudah di-parse saat upload
// file) + mapping kolom pilihan user, jumlahkan per DSE (per sheet),
// cocokkan ke mf_dse_database (dse_code utk sheet IM3, dse_code_3id utk
// sheet 3ID - SAMA PERSIS logic lama, cuma field access-nya sekarang
// lewat r[mapping.xxx.id] dst, bukan r.username/r.dse_code hardcode),
// lalu jumlahkan 2 brand jadi 1 total per DSE. Kolom Region & As Of Date
// TETAP dibaca otomatis dari nama kolom "region"/"as_of_dt" (bukan
// bagian mapping manual, sesuai konfirmasi user).
async function computeMatching(rawParsed, mapping) {
  const { period: p, im3, tid } = rawParsed;
  let asOf = null;

  const im3Agg = new Map(); // id pilihan user (sheet IM3) -> agg
  (im3?.rows || []).forEach((r) => {
    if (!SUMATERA_REGIONS.has(norm(r.region))) return;
    if (isExcludedPartner(r.partner_name)) return;
    if (asOf == null) asOf = numOrZero(r.as_of_dt);
    const key = norm(r[mapping.im3.id]);
    if (!key) return;
    const a = im3Agg.get(key) || { sp: 0, vou: 0, saldo: 0, partner_name: r.partner_name, region: r.region, branch: r.branch, mc: r.micro_cluster };
    a.sp += numOrZero(r[mapping.im3.sp]);
    a.vou += numOrZero(r[mapping.im3.vou]);
    a.saldo += numOrZero(r[mapping.im3.saldo]);
    im3Agg.set(key, a);
  });

  const tidAgg = new Map(); // id pilihan user (sheet 3ID) -> agg
  (tid?.rows || []).forEach((r) => {
    if (!SUMATERA_REGIONS.has(norm(r.region))) return;
    if (isExcludedPartner(r.partner_name)) return;
    if (asOf == null) asOf = numOrZero(r.as_of_dt);
    const key = norm(r[mapping.tid.id]);
    if (!key) return;
    const a = tidAgg.get(key) || { sp: 0, vou: 0, saldo: 0, partner_name: r.partner_name, region: r.region, branch: r.branch, mc: r.mc_ts };
    a.sp += numOrZero(r[mapping.tid.sp]);
    a.vou += numOrZero(r[mapping.tid.vou]);
    a.saldo += numOrZero(r[mapping.tid.saldo]);
    tidAgg.set(key, a);
  });

  if (!asOf) throw new Error('Kolom "as_of_dt" tidak ditemukan / kosong di sheet.');

  const MASTER_PAGE = 1000;
  const master = [];
  for (let from = 0; ; from += MASTER_PAGE) {
    const { data: page, error: eMaster } = await supabase
      .from("mf_dse_database")
      .select("dse_code, dse_code_3id, mdi, region, circle, branch, mc")
      .in("region", ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"])
      .range(from, from + MASTER_PAGE - 1);
    if (eMaster) throw eMaster;
    master.push(...(page || []));
    if (!page || page.length < MASTER_PAGE) break;
  }

  const byCode = new Map();      // dse_code -> master row
  const byCode3id = new Map();   // dse_code_3id -> master row
  (master || []).forEach((m) => {
    if (m.dse_code) byCode.set(norm(m.dse_code), m);
    if (m.dse_code_3id) byCode3id.set(norm(m.dse_code_3id), m);
  });

  const combined = new Map(); // dse_code -> row gabungan
  const unmatchedRows = [];

  im3Agg.forEach((a, username) => {
    const mrow = byCode.get(username);
    if (!mrow) {
      unmatchedRows.push({
        matched: false, dse_code: null, raw_code_im3: username, raw_code_3id: null,
        mdi: a.partner_name, region: a.region, circle: null, branch: a.branch, mc: a.mc,
        sellin_sp: a.sp, sellin_vou: a.vou, sellin_saldo: a.saldo,
      });
      return;
    }
    const c = combined.get(mrow.dse_code) || {
      dse_code: mrow.dse_code, raw_code_im3: null, raw_code_3id: null,
      mdi: mrow.mdi, region: mrow.region, circle: mrow.circle, branch: mrow.branch, mc: mrow.mc,
      sp: 0, vou: 0, saldo: 0,
    };
    c.raw_code_im3 = username;
    c.sp += a.sp; c.vou += a.vou; c.saldo += a.saldo;
    combined.set(mrow.dse_code, c);
  });

  tidAgg.forEach((a, code3id) => {
    const mrow = byCode3id.get(code3id);
    if (!mrow) {
      unmatchedRows.push({
        matched: false, dse_code: null, raw_code_im3: null, raw_code_3id: code3id,
        mdi: a.partner_name, region: a.region, circle: null, branch: a.branch, mc: a.mc,
        sellin_sp: a.sp, sellin_vou: a.vou, sellin_saldo: a.saldo,
      });
      return;
    }
    const c = combined.get(mrow.dse_code) || {
      dse_code: mrow.dse_code, raw_code_im3: null, raw_code_3id: null,
      mdi: mrow.mdi, region: mrow.region, circle: mrow.circle, branch: mrow.branch, mc: mrow.mc,
      sp: 0, vou: 0, saldo: 0,
    };
    c.raw_code_3id = code3id;
    c.sp += a.sp; c.vou += a.vou; c.saldo += a.saldo;
    combined.set(mrow.dse_code, c);
  });

  const matchedRows = Array.from(combined.values()).map((c) => ({
    matched: true, dse_code: c.dse_code, raw_code_im3: c.raw_code_im3, raw_code_3id: c.raw_code_3id,
    mdi: c.mdi, region: c.region, circle: c.circle, branch: c.branch, mc: c.mc,
    sellin_sp: c.sp, sellin_vou: c.vou, sellin_saldo: c.saldo,
  }));

  return { period: p, asOf, matchedRows, unmatchedRows };
}

export default function AdminDseSellinCompare({ theme, onUploaded, initialPeriod }) {
  const d = theme === "dark";
  const t = useMemo(() => mk(d), [d]);

  // BARU: periode yg WAJIB dipilih user dulu SEBELUM upload file -
  // default ikut periode yg lagi dibuka di layar (initialPeriod), tapi
  // tetap bisa diganti user kalau mau upload utk bulan lain.
  const todayPeriod = () => new Date().toISOString().slice(0, 7);
  const [selectedPeriod, setSelectedPeriod] = useState(() => initialPeriod || todayPeriod());

  // ── State periode/data TERSIMPAN (dari database - tampilan final) ──
  const [period, setPeriod] = useState("");
  const [asOfDt, setAsOfDt] = useState(null);
  const [rows, setRows] = useState([]);       // matched, dibandingkan dgn app
  const [unmatched, setUnmatched] = useState([]); // tidak ketemu di mf_dse_database
  const [loaded, setLoaded] = useState(false);

  // ── State alur upload: "idle" (blm ada file) -> "mapping" (pilih
  //    kolom) -> "preview" (hasil cocok, blm disimpan) -> "saved"
  //    (sudah disimpan, tampilan dari DB di atas yg dipakai). ──────────
  const [stage, setStage] = useState("idle");
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [buildingPreview, setBuildingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");

  // Hasil parse mentah file (sheet + baris + nama kolom) - dipakai tahap
  // mapping utk isi dropdown & contoh data, dipakai tahap preview utk
  // dihitung ulang kalau user "Ubah Mapping".
  const [rawParsed, setRawParsed] = useState(null);
  const [mapping, setMapping] = useState({ im3: { id: "", sp: "", vou: "", saldo: "" }, tid: { id: "", sp: "", vou: "", saldo: "" } });

  // Hasil preview (BELUM disimpan ke DB) - previewSaveRows nyimpen baris
  // mentah siap-insert (matchedRows+unmatchedRows), previewRows/
  // previewUnmatched versi utk DITAMPILKAN (sudah ada perbandingan app).
  const [previewPeriod, setPreviewPeriod] = useState("");
  const [previewAsOf, setPreviewAsOf] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewUnmatched, setPreviewUnmatched] = useState([]);
  const [previewSaveRows, setPreviewSaveRows] = useState(null);

  const [search, setSearch] = useState("");

  // ── Load perbandingan TERSIMPAN utk period tertentu (dari tabel
  //    upload + live query ke mf_dse_prod_ar, supaya selalu reflect
  //    data app terbaru walau DSE edit input-nya SETELAH upload). ────
  const loadComparison = useCallback(async (p, asOf) => {
    setErr(""); setProgress("Memuat data perbandingan...");
    try {
      const { data: up, error: eUp } = await supabase
        .from("mf_dse_admin_sellin_upload")
        .select("*")
        .eq("period", p);
      if (eUp) throw eUp;

      const matchedUp = (up || []).filter((r) => r.matched && r.dse_code);
      const unmatchedUp = (up || []).filter((r) => !r.matched);

      const startISO = `${p}-01`;
      const endISO = `${p}-${String(asOf).padStart(2, "0")}`;
      const appTotals = await fetchAppTotals(matchedUp.map((r) => r.dse_code), startISO, endISO);

      const built = matchedUp.map((r) => {
        const app = appTotals[r.dse_code] || { sp: 0, vou: 0, saldo: 0 };
        return {
          dse_code: r.dse_code,
          mdi: r.mdi, region: r.region, circle: r.circle, branch: r.branch, mc: r.mc,
          uploadSp: numOrZero(r.sellin_sp), uploadVou: numOrZero(r.sellin_vou), uploadSaldo: numOrZero(r.sellin_saldo),
          appSp: app.sp, appVou: app.vou, appSaldo: app.saldo,
          diffSp: app.sp - numOrZero(r.sellin_sp),
          diffVou: app.vou - numOrZero(r.sellin_vou),
          diffSaldo: app.saldo - numOrZero(r.sellin_saldo),
        };
      }).sort((a, b) => (Math.abs(b.diffSp) + Math.abs(b.diffVou) + Math.abs(b.diffSaldo)) - (Math.abs(a.diffSp) + Math.abs(a.diffVou) + Math.abs(a.diffSaldo)));

      setRows(built);
      setUnmatched(unmatchedUp);
      setLoaded(true);
      setProgress("");
    } catch (e) {
      setErr(e.message || "Gagal memuat data perbandingan.");
      setProgress("");
    }
  }, []);

  // ── Langkah 1: upload file -> CUMA parse sheet & kolomnya (TIDAK
  //    insert apa pun ke database) - lanjut ke tahap mapping. ─────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setFileName(file.name);
    setErr(""); setParsing(true); setProgress("Membaca file...");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });

      const im3SheetName = findSheet(wb, "IM3_DSE_PROD");
      const tidSheetName = findSheet(wb, "3ID_DSE_PROD");
      if (!im3SheetName && !tidSheetName) {
        throw new Error('Sheet "IM3_DSE_PROD_..." dan/atau "3ID_DSE_PROD_..." tidak ditemukan di file ini.');
      }
      const p = periodFromSheetName(im3SheetName || tidSheetName);
      if (!p) throw new Error("Tidak bisa membaca periode (YYYYMM) dari nama sheet.");
      // BARU: cocokkan periode yg kedetect dari file ke periode yg
      // sudah dipilih user di dropdown SEBELUM upload - kalau beda,
      // tolak (jangan diam2 pakai periode dari file).
      if (p !== selectedPeriod) {
        const pLabel = `${MONTHS_ID[parseInt(p.slice(5, 7), 10) - 1]} ${p.slice(0, 4)}`;
        const selLabel = `${MONTHS_ID[parseInt(selectedPeriod.slice(5, 7), 10) - 1]} ${selectedPeriod.slice(0, 4)}`;
        throw new Error(`File ini isinya data periode ${pLabel}, tapi periode yg dipilih di atas ${selLabel}. Samakan dulu periodenya, atau ganti pilihan periode ke ${pLabel}.`);
      }

      const im3Rows = im3SheetName ? XLSX.utils.sheet_to_json(wb.Sheets[im3SheetName], { defval: 0 }) : [];
      const tidRows = tidSheetName ? XLSX.utils.sheet_to_json(wb.Sheets[tidSheetName], { defval: 0 }) : [];
      const im3Headers = im3Rows.length ? Object.keys(im3Rows[0]) : [];
      const tidHeaders = tidRows.length ? Object.keys(tidRows[0]) : [];

      if (im3SheetName && !im3Headers.length) throw new Error(`Sheet "${im3SheetName}" kosong / tidak ada baris data.`);
      if (tidSheetName && !tidHeaders.length) throw new Error(`Sheet "${tidSheetName}" kosong / tidak ada baris data.`);

      // Tebakan awal (prefill dropdown) - tetap boleh diganti user.
      const guess = (headers, candidates) => headers.find((h) => candidates.includes(norm(h))) || "";

      setRawParsed({
        period: p,
        im3: im3SheetName ? { sheetName: im3SheetName, rows: im3Rows, headers: im3Headers } : null,
        tid: tidSheetName ? { sheetName: tidSheetName, rows: tidRows, headers: tidHeaders } : null,
      });
      setMapping({
        im3: {
          id: guess(im3Headers, ["USERNAME"]), sp: guess(im3Headers, ["SELLIN_SP"]),
          vou: guess(im3Headers, ["SELLIN_VOU"]), saldo: guess(im3Headers, ["SELLIN_SALDO"]),
        },
        tid: {
          id: guess(tidHeaders, ["DSE_CODE"]), sp: guess(tidHeaders, ["OSA_SP"]),
          vou: guess(tidHeaders, ["OSA_VOU"]), saldo: guess(tidHeaders, ["OSA_SALDO"]),
        },
      });
      setStage("mapping");
      setParsing(false);
      setProgress("");
    } catch (e) {
      setErr(e.message || "Gagal membaca file.");
      setParsing(false);
      setProgress("");
    }
  }, [selectedPeriod]);

  const updateMapping = useCallback((sheet, key, value) => {
    setMapping((m) => ({ ...m, [sheet]: { ...m[sheet], [key]: value } }));
  }, []);

  // ── Langkah 2: dari mapping yg dipilih user -> jalankan matching +
  //    ambil data app utk perbandingan -> tampilkan sbg PREVIEW (belum
  //    disimpan). ───────────────────────────────────────────────────
  const buildPreview = useCallback(async () => {
    if (!rawParsed) return;
    const missing = [];
    if (rawParsed.im3) {
      ["id", "sp", "vou", "saldo"].forEach((k) => { if (!mapping.im3[k]) missing.push(`IM3 - ${MAP_LABELS[k]}`); });
    }
    if (rawParsed.tid) {
      ["id", "sp", "vou", "saldo"].forEach((k) => { if (!mapping.tid[k]) missing.push(`3ID - ${MAP_LABELS[k]}`); });
    }
    if (missing.length) { setErr(`Pilih dulu: ${missing.join(", ")}.`); return; }

    setErr(""); setBuildingPreview(true); setProgress("Mencocokkan kode DSE ke database...");
    try {
      const { period: p, asOf, matchedRows, unmatchedRows } = await computeMatching(rawParsed, mapping);

      setProgress("Memuat data app untuk perbandingan...");
      const startISO = `${p}-01`;
      const endISO = `${p}-${String(asOf).padStart(2, "0")}`;
      const appTotals = await fetchAppTotals(matchedRows.map((r) => r.dse_code), startISO, endISO);

      const built = matchedRows.map((r) => {
        const app = appTotals[r.dse_code] || { sp: 0, vou: 0, saldo: 0 };
        return {
          dse_code: r.dse_code,
          mdi: r.mdi, region: r.region, circle: r.circle, branch: r.branch, mc: r.mc,
          uploadSp: numOrZero(r.sellin_sp), uploadVou: numOrZero(r.sellin_vou), uploadSaldo: numOrZero(r.sellin_saldo),
          appSp: app.sp, appVou: app.vou, appSaldo: app.saldo,
          diffSp: app.sp - numOrZero(r.sellin_sp),
          diffVou: app.vou - numOrZero(r.sellin_vou),
          diffSaldo: app.saldo - numOrZero(r.sellin_saldo),
        };
      }).sort((a, b) => (Math.abs(b.diffSp) + Math.abs(b.diffVou) + Math.abs(b.diffSaldo)) - (Math.abs(a.diffSp) + Math.abs(a.diffVou) + Math.abs(a.diffSaldo)));

      setPreviewPeriod(p);
      setPreviewAsOf(asOf);
      setPreviewRows(built);
      setPreviewUnmatched(unmatchedRows);
      setPreviewSaveRows({ matchedRows, unmatchedRows });
      setStage("preview");
      setBuildingPreview(false);
      setProgress("");
    } catch (e) {
      setErr(e.message || "Gagal mencocokkan data.");
      setBuildingPreview(false);
      setProgress("");
    }
  }, [rawParsed, mapping]);

  // ── Langkah 3: user klik "Simpan ke Database" dari preview -> baru
  //    di sini delete+insert ke mf_dse_admin_sellin_upload dijalankan
  //    (replace penuh utk period ybs, SAMA PERSIS logic lama). ────────
  const saveToDb = useCallback(async () => {
    if (!previewSaveRows || !previewPeriod || previewAsOf == null) return;
    setErr(""); setSaving(true);
    setProgress(`Menyimpan ${previewSaveRows.matchedRows.length + previewSaveRows.unmatchedRows.length} baris ke database...`);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uploadedBy = userData?.user?.id || null;
      const uploadedByName = userData?.user?.email || null;

      const { error: eDel } = await supabase.from("mf_dse_admin_sellin_upload").delete().eq("period", previewPeriod);
      if (eDel) throw eDel;

      const allRows = [...previewSaveRows.matchedRows, ...previewSaveRows.unmatchedRows].map((r) => ({
        ...r, period: previewPeriod, as_of_dt: previewAsOf, uploaded_by: uploadedBy, uploaded_by_name: uploadedByName,
      }));
      for (const part of chunk(allRows, 500)) {
        const { error: eIns } = await supabase.from("mf_dse_admin_sellin_upload").insert(part);
        if (eIns) throw eIns;
      }

      setPeriod(previewPeriod);
      setAsOfDt(previewAsOf);
      setSaving(false);
      setProgress("");

      // Beres - bersihkan state upload/mapping/preview, balik ke
      // tampilan TERSIMPAN (ditarik ulang dari DB, konsisten dgn alur
      // lama) & kasih tau parent (tabel Ringkasan di DSE_ProdAR.jsx)
      // utk refresh kolom Sellin Upload/Selisihnya.
      setRawParsed(null);
      setPreviewRows([]); setPreviewUnmatched([]); setPreviewSaveRows(null);
      setPreviewPeriod(""); setPreviewAsOf(null);
      setStage("saved");
      await loadComparison(previewPeriod, previewAsOf);
      if (typeof onUploaded === "function") onUploaded();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan ke database.");
      setSaving(false);
      setProgress("");
    }
  }, [previewSaveRows, previewPeriod, previewAsOf, loadComparison, onUploaded]);

  const backToMapping = useCallback(() => {
    setPreviewRows([]); setPreviewUnmatched([]); setPreviewSaveRows(null);
    setPreviewPeriod(""); setPreviewAsOf(null);
    setErr("");
    setStage("mapping");
  }, []);

  const cancelUpload = useCallback(() => {
    setRawParsed(null); setFileName(""); setErr("");
    setPreviewRows([]); setPreviewUnmatched([]); setPreviewSaveRows(null);
    setPreviewPeriod(""); setPreviewAsOf(null);
    setStage(loaded ? "saved" : "idle");
  }, [loaded]);

  // ── Data aktif yg ditampilkan di tabel perbandingan: preview (blm
  //    disimpan) kalau stage "preview", else data TERSIMPAN dari DB. ──
  const activeIsPreview = stage === "preview";
  const activeRows = activeIsPreview ? previewRows : rows;
  const activeUnmatched = activeIsPreview ? previewUnmatched : unmatched;
  const activePeriod = activeIsPreview ? previewPeriod : period;
  const activeAsOf = activeIsPreview ? previewAsOf : asOfDt;

  // UPDATE (permintaan user - "selisihnya memang wajar jadi tidak perlu
  // ditampilkan fokus ke dse yang tidak ditemukan"): yg difilter search
  // sekarang daftar "DSE Tidak Dikenali" (fokus utama tampilan), bukan
  // lagi tabel perbandingan Upload/App/Selisih (sudah dihapus).
  const filteredUnmatched = useMemo(() => {
    let out = activeUnmatched;
    if (search.trim()) {
      const q = norm(search);
      out = out.filter((r) => norm(r.raw_code_im3).includes(q) || norm(r.raw_code_3id).includes(q) || norm(r.mdi).includes(q) || norm(r.mc).includes(q) || norm(r.branch).includes(q));
    }
    return out;
  }, [activeUnmatched, search]);

  const periodLabel = activePeriod ? `${MONTHS_ID[parseInt(activePeriod.slice(5, 7), 10) - 1]} ${activePeriod.slice(0, 4)}` : "";

  const busy = parsing || buildingPreview || saving;
  const showComparison = activeIsPreview || (stage === "saved" && loaded);

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Upload &amp; Bandingkan Sellin DSE</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>
            Upload file DSE PROD (sheet IM3 &amp; 3ID) — SP, Voucher &amp; Saldo dijumlahkan per DSE lalu dibandingkan dengan input DSE di aplikasi. Khusus tampilan SPM Sumatera.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* BARU (permintaan user - "sebelum upload harusnya pilih
              periode dulu"): dropdown periode WAJIB dipilih dulu -
              periode file yg di-upload nanti dicocokkan ke sini. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3 }}>Periode Upload</span>
            <select value={selectedPeriod} disabled={busy} onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{ height: 40, padding: "0 10px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: busy ? "default" : "pointer" }}>
              {Array.from({ length: 18 }, (_, i) => {
                const dt = new Date(); dt.setMonth(dt.getMonth() - 12 + i);
                const v = dt.toISOString().slice(0, 7);
                const label = `${MONTHS_ID[dt.getMonth()]} ${dt.getFullYear()}`;
                return <option key={v} value={v}>{label}</option>;
              })}
            </select>
          </div>
          <label style={{
            display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderRadius: 10,
            background: busy ? t.sub : "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)", color: busy ? t.mid : "#fff",
            fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap",
          }}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {busy ? "Memproses..." : "Upload File Excel"}
            <input type="file" accept=".xlsx,.xls" disabled={busy} style={{ display: "none" }}
              onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }} />
          </label>
        </div>
      </div>

      {fileName && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: t.mid, marginBottom: 10 }}>
          <FileSpreadsheet size={14} /> {fileName}
          {progress && <span style={{ color: t.blue }}>— {progress}</span>}
        </div>
      )}

      {err && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 14px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, color: t.red, fontSize: 12.5, marginBottom: 14 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {err}
        </div>
      )}

      {stage === "idle" && !loaded && !busy && !err && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: t.mid, fontSize: 13, border: `1px dashed ${t.line}`, borderRadius: 12 }}>
          Belum ada data. Upload file DSE PROD (.xlsx) untuk mulai membandingkan.
        </div>
      )}

      {stage === "mapping" && rawParsed && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            Periode terdeteksi: {MONTHS_ID[parseInt(rawParsed.period.slice(5, 7), 10) - 1]} {rawParsed.period.slice(0, 4)}
          </div>
          <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
            Pilih kolom ID (dicocokkan sbg primary key ke database DSE) serta kolom SP/Voucher/Saldo untuk masing-masing sheet, sebelum data dicocokkan &amp; disimpan. Kolom Region (filter Sumatera) &amp; As Of Date tetap otomatis dibaca dari nama kolom &quot;region&quot;/&quot;as_of_dt&quot;.
          </div>

          {rawParsed.im3 && (
            <MappingSheetBlock t={t} title="Sheet IM3" sheetName={rawParsed.im3.sheetName} headers={rawParsed.im3.headers} rows={rawParsed.im3.rows}
              map={mapping.im3} onChange={(k, v) => updateMapping("im3", k, v)} />
          )}
          {rawParsed.tid && (
            <MappingSheetBlock t={t} title="Sheet 3ID" sheetName={rawParsed.tid.sheetName} headers={rawParsed.tid.headers} rows={rawParsed.tid.rows}
              map={mapping.tid} onChange={(k, v) => updateMapping("tid", k, v)} />
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={buildPreview} disabled={busy}
              style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 18px", borderRadius: 10, border: "none", background: busy ? t.sub : "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)", color: busy ? t.mid : "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
              {buildingPreview ? <Loader2 size={14} className="animate-spin" /> : null}
              {buildingPreview ? "Mencocokkan..." : "Lanjutkan ke Preview"}
            </button>
            <button onClick={cancelUpload} disabled={busy}
              style={{ height: 38, padding: "0 16px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {showComparison && (
        <>
          {activeIsPreview && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderRadius: 10, background: t.amberBg, border: `1px solid ${t.amberBd}`, marginBottom: 14 }}>
              <AlertTriangle size={15} color={t.amber} />
              <span style={{ fontSize: 12.5, color: t.hi, fontWeight: 700 }}>Preview — data di bawah ini BELUM disimpan ke database.</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={backToMapping} disabled={saving}
                  style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
                  Ubah Mapping
                </button>
                <button onClick={cancelUpload} disabled={saving}
                  style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
                  Batal
                </button>
                <button onClick={saveToDb} disabled={saving}
                  style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 8, border: "none", background: saving ? t.sub : "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)", color: saving ? t.mid : "#fff", fontSize: 12, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {saving ? "Menyimpan..." : "Simpan ke Database"}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              Periode: {periodLabel} — As of tanggal {activeAsOf}
            </div>
            {!activeIsPreview && (
              <button onClick={() => loadComparison(period, asOfDt)} title="Refresh data app terbaru"
                style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                <RefreshCw size={12} /> Refresh
              </button>
            )}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: t.lo }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode DSE / Partner / MC / Area..."
                  style={{ height: 32, padding: "0 10px 0 30px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12, fontFamily: FONT, width: 240 }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <StatPill t={t} icon={<Wallet size={13} />} label="DSE cocok" value={activeRows.length} />
            <StatPill t={t} icon={<X size={13} />} label="DSE tidak dikenali" value={activeUnmatched.length} accent={activeUnmatched.length > 0 ? t.amber : t.green} />
          </div>

          {/* UPDATE (permintaan user - "selisihnya memang wajar jadi
              tidak perlu ditampilkan, fokus ke dse yang tidak
              ditemukan"): tabel detail Upload/App/Selisih per-DSE
              DIHAPUS (selisih MTD vs app live memang wajar beda) -
              fokus tampilan ke daftar DSE Tidak Dikenali di bawah,
              langsung tampil (ga collapse lagi). */}
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
            DSE Tidak Dikenali ({activeUnmatched.length})
          </div>
          <div style={{ overflowX: "auto", border: `1px solid ${t.amberBd}`, borderRadius: 12, background: t.amberBg }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th t={t}>Brand</Th><Th t={t}>Kode Mentah</Th><Th t={t}>Partner (dari file)</Th><Th t={t}>MC</Th><Th t={t}>Area</Th>
                  <Th t={t} align="right">Sellin SP</Th><Th t={t} align="right">Sellin Vou</Th><Th t={t} align="right">Sellin Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {filteredUnmatched.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${t.amberBd}` }}>
                    <Td t={t}>{r.raw_code_im3 ? "IM3" : "3ID"}</Td>
                    <Td t={t} bold>{r.raw_code_im3 || r.raw_code_3id}</Td>
                    <Td t={t}>{r.mdi}</Td>
                    <Td t={t}>{r.mc}</Td>
                    <Td t={t}>{r.branch}</Td>
                    <Td t={t} align="right">{fmtID(r.sellin_sp)}</Td>
                    <Td t={t} align="right">{fmtID(r.sellin_vou)}</Td>
                    <Td t={t} align="right">{fmtID(r.sellin_saldo)}</Td>
                  </tr>
                ))}
                {!filteredUnmatched.length && (
                  <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: t.mid, fontSize: 12.5 }}>
                    {activeUnmatched.length ? "Tidak ada yang cocok dengan pencarian." : "Tidak ada - semua kode DSE cocok dengan database."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Blok mapping dropdown (ID/SP/Voucher/Saldo) + contoh 5 baris pertama
// per sheet - dipakai di tahap "mapping" sebelum data dicocokkan.
function MappingSheetBlock({ t, title, sheetName, headers, rows, map, onChange }) {
  const sample = rows.slice(0, 5);
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: t.mid, marginBottom: 10 }}>Sheet: {sheetName} — {rows.length} baris</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <SelectCol t={t} headers={headers} value={map.id} onChange={(v) => onChange("id", v)} label={MAP_LABELS.id} />
        <SelectCol t={t} headers={headers} value={map.sp} onChange={(v) => onChange("sp", v)} label={MAP_LABELS.sp} />
        <SelectCol t={t} headers={headers} value={map.vou} onChange={(v) => onChange("vou", v)} label={MAP_LABELS.vou} />
        <SelectCol t={t} headers={headers} value={map.saldo} onChange={(v) => onChange("saldo", v)} label={MAP_LABELS.saldo} />
      </div>
      {!!sample.length && (
        <div style={{ overflowX: "auto", border: `1px solid ${t.lineH}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {headers.map((h) => <Th key={h} t={t}>{h}</Th>)}
              </tr>
            </thead>
            <tbody>
              {sample.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${t.lineH}` }}>
                  {headers.map((h) => <Td key={h} t={t}>{String(r[h] ?? "")}</Td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SelectCol({ t, headers, value, onChange, label }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: t.mid, fontWeight: 700 }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ height: 32, padding: "0 8px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12, fontFamily: FONT, minWidth: 160 }}>
        <option value="">— pilih kolom —</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  );
}

function StatPill({ t, icon, label, value, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.card }}>
      <span style={{ color: accent || t.mid, display: "flex" }}>{icon}</span>
      <span style={{ fontSize: 11.5, color: t.mid }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: accent || t.hi }}>{value}</span>
    </div>
  );
}

function Th({ t, children, align }) {
  return <th style={{ padding: "9px 12px", textAlign: align || "left", fontSize: 10.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>{children}</th>;
}
function Td({ t, children, align, bold, color }) {
  return <td style={{ padding: "8px 12px", textAlign: align || "left", fontWeight: bold ? 700 : 400, color: color || t.hi, whiteSpace: "nowrap" }}>{children}</td>;
}
