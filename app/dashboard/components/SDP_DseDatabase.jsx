"use client";
/**
 * SDP_DseDatabase.jsx — tab "Database DSE" (di dalam DSE Prod. & AR)
 *
 * UPDATE (permintaan user - "berarti kembalikan saja itu ke sdp, kita
 * duplicate namun fitur yang disini lebih sederhana, cukup download data dan
 * upload data dan tampilkan table" -> dikonfirmasi "Sederhanakan tab Database
 * DSE jadi hanya Download/Upload/Tabel"): dulu tab ini punya 2 mekanisme
 * upload terpisah — upload file .txt per-HOA (format "NAMA HOA - N DS - M
 * DSE - BRANCH" dst) dan "Update Mapping (Hybrid)" (Excel kode DSE lama →
 * baru) — KEDUANYA DIHAPUS. Diganti 1 alur sederhana yang sama persis dgn
 * pola "Mapping & User Management" (AdminMcMapping.jsx): Download Data
 * (export semua baris ke Excel, dipakai juga sbg template) -> edit di Excel
 * -> Upload Data (import massal, UPSERT per ID DSE — kode yang sudah ada
 * diperbarui, yang belum ada ditambahkan). Tabel tetap bisa di-cari/filter.
 *
 * Hanya untuk role spm_sumatera (digate di DSE_ProdAR.jsx & page.jsx).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import {
  Upload, X, Check, AlertTriangle, Loader2, FileDown,
  Search, RefreshCw, Trash2, ChevronDown, Database,
  FileSpreadsheet, Info,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
const REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const PAGE_SIZE = 50;

// ── Kolom di file Excel (download/upload) — header baris 1, longgar (boleh
// beda urutan/huruf besar-kecil). ID DSE wajib (kunci pencocokan utk update);
// Region/Branch/HOA wajib khusus utk baris BARU (DSE yang belum ada).
const COLMAP = {
  region: ["region"],
  branch: ["branch"],
  hoa_name: ["hoa", "nama hoa", "hoa name"],
  ds_name: ["nama ds", "ds name"],
  ds_phone: ["nomor ds", "no hp ds", "no. hp ds", "ds phone"],
  mc: ["mc"],
  dse_code: ["id dse", "dse code", "kode dse"],
  dse_phone: ["nomor dse", "no hp dse", "no. hp dse", "dse phone"],
  jumlah_desa: ["jumlah desa", "desa"],
  jumlah_outlet: ["jumlah outlet", "outlet"],
  pt_name: ["partner name", "pt name", "partner", "nama partner"],
  dse_category: ["dse category", "kategori dse"],
  circle: ["circle"],
  mpc_short_code: ["mpc short code", "mpc short"],
  mpc_name: ["mpc name"],
};

function normHeader(h) { return String(h || "").trim().toLowerCase(); }
function findCol(headers, aliases) { return headers.findIndex((h) => aliases.includes(normHeader(h))); }
function cellStr(v) { const s = String(v ?? "").trim(); return s || null; }
function cellInt(v) { const n = parseInt(String(v ?? "").trim(), 10); return Number.isFinite(n) ? n : null; }

function parseDseWorkbook(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!aoa.length) { resolve({ error: "File kosong." }); return; }
        const headers = aoa[0];
        const col = {};
        for (const key of Object.keys(COLMAP)) col[key] = findCol(headers, COLMAP[key]);
        if (col.dse_code < 0) {
          resolve({ error: `Kolom wajib tidak ditemukan. Pastikan ada kolom "ID DSE" di baris pertama.` });
          return;
        }
        const rows = [];
        const errors = [];
        const seenInFile = new Set();
        for (let i = 1; i < aoa.length; i++) {
          const line = aoa[i];
          if (!line || line.every((c) => c === "" || c == null)) continue;
          const dse_code = cellStr(line[col.dse_code]);
          if (!dse_code) { errors.push(`Baris ${i + 1}: ID DSE kosong.`); continue; }
          const key = dse_code.toUpperCase();
          if (seenInFile.has(key)) { errors.push(`Baris ${i + 1}: ID DSE ${dse_code} dobel di file ini (baris sebelumnya dipakai).`); continue; }
          seenInFile.add(key);
          rows.push({
            dse_code,
            region: col.region >= 0 ? cellStr(line[col.region]) : null,
            branch: col.branch >= 0 ? cellStr(line[col.branch]) : null,
            hoa_name: col.hoa_name >= 0 ? cellStr(line[col.hoa_name]) : null,
            ds_name: col.ds_name >= 0 ? cellStr(line[col.ds_name]) : null,
            ds_phone: col.ds_phone >= 0 ? cellStr(line[col.ds_phone]) : null,
            mc: col.mc >= 0 ? cellStr(line[col.mc]) : null,
            dse_phone: col.dse_phone >= 0 ? cellStr(line[col.dse_phone]) : null,
            jumlah_desa: col.jumlah_desa >= 0 ? cellInt(line[col.jumlah_desa]) : null,
            jumlah_outlet: col.jumlah_outlet >= 0 ? cellInt(line[col.jumlah_outlet]) : null,
            pt_name: col.pt_name >= 0 ? cellStr(line[col.pt_name]) : null,
            dse_category: col.dse_category >= 0 ? cellStr(line[col.dse_category]) : null,
            circle: col.circle >= 0 ? cellStr(line[col.circle]) : null,
            mpc_short_code: col.mpc_short_code >= 0 ? cellStr(line[col.mpc_short_code]) : null,
            mpc_name: col.mpc_name >= 0 ? cellStr(line[col.mpc_name]) : null,
          });
        }
        resolve({ rows, errors, totalRows: rows.length });
      } catch (err) {
        resolve({ error: err.message || "Gagal membaca file." });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function buildRemarks(r) {
  const missing = [];
  if (!r.ds_name) missing.push("Nama DS");
  if (!r.ds_phone) missing.push("Nomor DS");
  if (!r.mc) missing.push("MC");
  if (!r.dse_phone) missing.push("Nomor DSE");
  if (missing.length) return `${missing.join(", ")} kosong`;
  if (r.flag_duplicate_code) return "ID DSE duplikat";
  return "Lengkap";
}

function downloadXlsx(head, body, sheetName, filename) {
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === "error" ? "#DC2626" : type === "warn" ? "#D97706" : "#16A34A";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, left: 24, zIndex: 9999,
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px", borderRadius: 10,
      background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600,
      fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      maxWidth: 480, marginLeft: "auto",
    }}>
      {type === "error" ? <AlertTriangle size={15} /> : <Check size={15} />}
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, display: "flex" }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ── Modal konfirmasi "Hapus Semua" ──────────────────────────────────────────
function DeleteAllModal({ t, scopeLabel, confirmWord, onConfirm, onCancel, loading, rowCount }) {
  const [text, setText] = useState("");
  const match = text.trim().toUpperCase() === confirmWord;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: t.card, borderRadius: 14, padding: 26, maxWidth: 420, width: "100%", border: `1px solid ${t.line}`, fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <AlertTriangle size={18} color={t.red} />
          <div style={{ fontSize: 15.5, fontWeight: 800, color: t.hi }}>Hapus Semua Data?</div>
        </div>
        <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.6, marginBottom: 14 }}>
          Ini akan menghapus <b style={{ color: t.hi }}>{rowCount.toLocaleString("id-ID")} baris</b> dari{" "}
          <b style={{ color: t.hi }}>{scopeLabel}</b> secara permanen. Tindakan ini tidak bisa dibatalkan — upload ulang
          data-nya kalau nanti ingin mengisi ulang dari awal.
        </div>
        <div style={{ fontSize: 12, color: t.mid, marginBottom: 6 }}>
          Ketik <b style={{ color: t.red }}>{confirmWord}</b> untuk konfirmasi:
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder={confirmWord}
          style={{ width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", marginBottom: 18, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={loading}
            style={{ height: 38, padding: "0 16px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={!match || loading}
            style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: t.red, color: "#fff", fontSize: 13, fontWeight: 700, cursor: match ? "pointer" : "not-allowed", opacity: match && !loading ? 1 : 0.5 }}>
            {loading ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
            Hapus Permanen
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SDP_DseDatabase({ theme, profile }) {
  const d = theme === "dark";
  const t = {
    card: d ? "#1A1A1D" : "#FFFFFF", sub: d ? "#202024" : "#F5F5F7",
    line: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)", hi: d ? "#F2F2F3" : "#1A1A1D",
    mid: d ? "#8A8A96" : "#5A5A68", lo: d ? "#5A5A68" : "#8A8A96",
    inputBg: d ? "#1E1E22" : "#F8F8FA", inputBd: d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
    teal: d ? "#32BCAD" : "#1A9E90", tealBg: d ? "rgba(50,188,173,0.10)" : "rgba(26,158,144,0.07)", tealBd: d ? "rgba(50,188,173,0.28)" : "rgba(26,158,144,0.20)",
    red: d ? "#F87171" : "#DC2626", redBg: d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
    amber: d ? "#FBBF24" : "#B45309", amberBg: d ? "rgba(251,191,36,0.10)" : "rgba(180,83,9,0.08)",
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
  };

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "ok") => setToast({ msg, type });
  const [showRevoked, setShowRevoked] = useState(false);

  // ── Fetch tabel gabungan ───────────────────────────────────────────────────
  const [incompleteTotal, setIncompleteTotal] = useState(0);
  const fetchRows = useCallback(async (pg = 1, srch = search, reg = filterRegion) => {
    setFetching(true);
    try {
      let q = supabase.from("mf_dse_database")
        .select("*", { count: "exact" })
        .order("branch", { ascending: true })
        .order("hoa_name", { ascending: true })
        .order("ds_name", { ascending: true })
        .order("dse_code", { ascending: true });
      if (reg) q = q.eq("region", reg);
      if (!showRevoked) q = q.eq("is_revoked", false);
      if (srch) {
        const s = srch.replace(/[%_]/g, "");
        q = q.or(`hoa_name.ilike.%${s}%,ds_name.ilike.%${s}%,dse_code.ilike.%${s}%,branch.ilike.%${s}%,mc.ilike.%${s}%`);
      }
      const from = (pg - 1) * PAGE_SIZE;
      const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      setRows(data || []);
      setTotal(count || 0);
      setPage(pg);

      let iq = supabase.from("mf_dse_database").select("id", { count: "exact", head: true })
        .or("ds_name.is.null,ds_phone.is.null,mc.is.null,dse_phone.is.null,flag_duplicate_code.eq.true");
      if (reg) iq = iq.eq("region", reg);
      if (srch) {
        const s = srch.replace(/[%_]/g, "");
        iq = iq.or(`hoa_name.ilike.%${s}%,ds_name.ilike.%${s}%,dse_code.ilike.%${s}%,branch.ilike.%${s}%,mc.ilike.%${s}%`);
      }
      const { count: incCount } = await iq;
      setIncompleteTotal(incCount || 0);
    } catch (e) {
      showToast(e.message || "Gagal memuat data.", "error");
    } finally {
      setFetching(false);
    }
  }, [search, filterRegion, showRevoked]);

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchRows(1, search, filterRegion); }, [filterRegion, showRevoked]);
  useEffect(() => {
    const h = setTimeout(() => { setSearch(searchInput); fetchRows(1, searchInput, filterRegion); }, 350);
    return () => clearTimeout(h);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Download Data (export semua baris, scope filterRegion aktif — dipakai
  // juga sbg template upload) ────────────────────────────────────────────────
  const handleDownload = async () => {
    setExportLoading(true);
    try {
      let q = supabase.from("mf_dse_database").select("*")
        .order("branch", { ascending: true }).order("hoa_name", { ascending: true })
        .order("ds_name", { ascending: true }).order("dse_code", { ascending: true });
      if (filterRegion) q = q.eq("region", filterRegion);
      if (!showRevoked) q = q.eq("is_revoked", false);
      const { data, error } = await q.limit(50000);
      if (error) throw error;
      const head = ["Region", "Branch", "HOA", "Nama DS", "Nomor DS", "MC", "ID DSE", "Nomor DSE", "Jumlah Desa", "Jumlah Outlet", "Partner Name", "DSE Category", "Circle", "MPC Short Code", "MPC Name"];
      const body = (data || []).map((r) => [
        r.region || "", r.branch || "", r.hoa_name || "", r.ds_name || "", r.ds_phone || "", r.mc || "",
        r.dse_code || "", r.dse_phone || "", r.jumlah_desa ?? "", r.jumlah_outlet ?? "",
        r.pt_name || "", r.dse_category || "", r.circle || "", r.mpc_short_code || "", r.mpc_name || "",
      ]);
      const fname = `Database_DSE_${filterRegion ? filterRegion.replace(/\s+/g, "_") : "Semua_Region"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      downloadXlsx(head, body, "Database DSE", fname);
      showToast(`Data diunduh — ${body.length} baris. File ini juga bisa dipakai sbg template upload.`, "ok");
    } catch (e) {
      showToast(e.message || "Gagal mengunduh data.", "error");
    } finally {
      setExportLoading(false);
    }
  };

  // ── Upload Data (import massal, upsert per ID DSE) ─────────────────────────
  const [showUpload, setShowUpload] = useState(false);
  const [staged, setStaged] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileRef = useRef(null);

  const onPickFile = async (fileList) => {
    const f = (fileList || [])[0];
    if (!f) return;
    const p = await parseDseWorkbook(f);
    setStaged(p ? { fileName: f.name, ...p } : null);
    setUploadResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!staged || staged.error || !staged.rows?.length) return;
    setUploading(true);
    try {
      // Cocokkan semua baris file lewat ID DSE — map { kode -> id } dari
      // SELURUH data (bukan cuma 1 halaman tabel yang lagi tampil).
      const { data: existing, error: selErr } = await supabase.from("mf_dse_database").select("id, dse_code").limit(100000);
      if (selErr) throw selErr;
      const existingByCode = new Map();
      for (const r of existing || []) {
        const key = String(r.dse_code || "").trim().toUpperCase();
        if (key && !existingByCode.has(key)) existingByCode.set(key, r.id);
      }

      const toInsert = [];
      const toUpdate = [];
      const missingForInsert = [];
      for (const r of staged.rows) {
        const key = r.dse_code.toUpperCase();
        const payload = {
          region: r.region, branch: r.branch, hoa_name: r.hoa_name,
          ds_name: r.ds_name, ds_phone: r.ds_phone, mc: r.mc,
          dse_code: r.dse_code, dse_phone: r.dse_phone,
          jumlah_desa: r.jumlah_desa ?? 0, jumlah_outlet: r.jumlah_outlet ?? 0,
          pt_name: r.pt_name, dse_category: r.dse_category, circle: r.circle,
          mpc_short_code: r.mpc_short_code, mpc_name: r.mpc_name,
        };
        const existingId = existingByCode.get(key);
        if (existingId) {
          toUpdate.push({ id: existingId, payload });
        } else if (!r.region || !r.branch || !r.hoa_name) {
          missingForInsert.push(`ID DSE ${r.dse_code}: Region/Branch/HOA wajib diisi utk ID DSE baru.`);
        } else {
          toInsert.push({
            ...payload,
            source_file: staged.fileName,
            uploaded_by: profile?.email || null,
            uploaded_at: new Date().toISOString(),
          });
        }
      }

      if (toInsert.length) {
        const { error } = await supabase.from("mf_dse_database").insert(toInsert);
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase.from("mf_dse_database").update(u.payload).eq("id", u.id); // eslint-disable-line no-await-in-loop
        if (error) throw error;
      }

      setUploadResult({ ok: true, inserted: toInsert.length, updated: toUpdate.length, skipped: missingForInsert });
      showToast(`Upload selesai — ${toInsert.length} baru, ${toUpdate.length} diperbarui${missingForInsert.length ? `, ${missingForInsert.length} dilewati` : ""}.`, missingForInsert.length ? "warn" : "ok");
      setStaged(null);
      fetchRows(1, search, filterRegion);
    } catch (e) {
      showToast(e.message || "Gagal upload.", "error");
    } finally {
      setUploading(false);
    }
  };

  // ── Hapus semua baris (scope = filterRegion aktif) ──────────────────────────
  const deleteScopeLabel = filterRegion ? `Region ${filterRegion}` : "SEMUA REGION";
  const deleteConfirmWord = filterRegion ? "HAPUS" : "HAPUS SEMUA";
  const [deleteScopeCount, setDeleteScopeCount] = useState(0);
  const openDeleteAll = async () => {
    let cq = supabase.from("mf_dse_database").select("id", { count: "exact", head: true });
    if (filterRegion) cq = cq.eq("region", filterRegion);
    const { count } = await cq;
    setDeleteScopeCount(count || 0);
    setShowDeleteAll(true);
  };
  const handleDeleteAll = async () => {
    setDeleteAllLoading(true);
    try {
      let q = supabase.from("mf_dse_database").delete();
      q = filterRegion ? q.eq("region", filterRegion) : q.not("id", "is", null);
      const { error } = await q;
      if (error) throw error;
      showToast(`Berhasil dihapus — ${deleteScopeLabel}.`, "ok");
      setShowDeleteAll(false);
      fetchRows(1, search, filterRegion);
    } catch (e) {
      showToast(e.message || "Gagal menghapus data.", "error");
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const inputStyle = {
    width: "100%", height: 38, padding: "0 12px", borderRadius: 9,
    border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi,
    fontSize: 13.5, fontFamily: FONT, outline: "none",
  };

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {showDeleteAll && (
        <DeleteAllModal t={t} scopeLabel={deleteScopeLabel} confirmWord={deleteConfirmWord} rowCount={deleteScopeCount}
          loading={deleteAllLoading} onConfirm={handleDeleteAll} onCancel={() => setShowDeleteAll(false)} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Database size={20} color={t.teal} />
        <div style={{ fontSize: 19, fontWeight: 800 }}>Database DSE</div>
      </div>
      <div style={{ fontSize: 13, color: t.mid, marginBottom: 20 }}>
        Kelola data DSE (sales person) lewat Excel: <b style={{ color: t.hi }}>Download Data</b> dulu (dipakai juga sbg
        template), edit/tambah baris, lalu <b style={{ color: t.hi }}>Upload Data</b> lagi. Upload otomatis UPSERT per{" "}
        <b style={{ color: t.hi }}>ID DSE</b>: yang sudah ada diperbarui, yang belum ada ditambahkan (wajib isi Region/
        Branch/HOA utk ID DSE baru).
      </div>

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, flexWrap: "wrap" }}>
          <button onClick={handleDownload} disabled={exportLoading}
            style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: exportLoading ? 0.6 : 1 }}>
            {exportLoading ? <Loader2 size={14} className="spin" /> : <FileDown size={14} />} Download Data
          </button>
          <button onClick={() => setShowUpload((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <Upload size={14} /> Upload Data
            {showUpload ? <ChevronDown size={14} style={{ transform: "rotate(180deg)" }} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showUpload && (
          <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${t.line}` }}>
            <div style={{ fontSize: 12, color: t.mid, margin: "14px 0 12px", display: "flex", alignItems: "flex-start", gap: 6 }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1, minWidth: 0, lineHeight: 1.55 }}>
                Kolom wajib: <b style={{ color: t.hi }}>ID DSE</b>. ID DSE yang sudah ada akan <b style={{ color: t.hi }}>diperbarui</b>
                {" "}(semua kolom yang ada di file), ID DSE yang belum ada akan <b style={{ color: t.hi }}>ditambahkan</b> — tapi
                wajib isi Region/Branch/HOA. Pakai file hasil Download Data sebagai template.
              </span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 9, border: `1px dashed ${t.tealBd}`, background: t.tealBg, color: t.teal, fontSize: 13, fontWeight: 700, cursor: "pointer", width: "fit-content" }}>
              <FileSpreadsheet size={14} /> Pilih File…
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => onPickFile(e.target.files)} />
            </label>

            {staged && (
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, border: `1px solid ${staged.error ? t.redBg : t.line}`, background: staged.error ? t.redBg : t.sub }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <FileSpreadsheet size={15} color={staged.error ? t.red : t.teal} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staged.fileName}</div>
                    {staged.error ? (
                      <div style={{ fontSize: 12, color: t.red, marginTop: 2 }}>{staged.error}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: t.mid, marginTop: 2 }}>
                        {staged.totalRows} baris siap diupload
                        {staged.errors?.length ? `, ${staged.errors.length} baris dilewati` : ""}.
                      </div>
                    )}
                  </div>
                  {!staged.error && (
                    <button onClick={handleUpload} disabled={uploading || !staged.totalRows}
                      style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: uploading ? "default" : "pointer", opacity: uploading || !staged.totalRows ? 0.6 : 1, flexShrink: 0 }}>
                      {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
                      {uploading ? "Mengunggah…" : "Upload"}
                    </button>
                  )}
                  <button onClick={() => setStaged(null)} style={{ background: "none", border: "none", color: t.mid, cursor: "pointer", display: "flex", flexShrink: 0 }}><X size={15} /></button>
                </div>
                {staged.errors?.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11.5, color: t.mid, maxHeight: 120, overflowY: "auto" }}>
                    {staged.errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
                    {staged.errors.length > 20 && <div>…dan {staged.errors.length - 20} lainnya.</div>}
                  </div>
                )}
              </div>
            )}

            {uploadResult?.ok && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: t.mid }}>
                ✓ {uploadResult.inserted} baris baru, {uploadResult.updated} diperbarui.
                {uploadResult.skipped?.length > 0 && (
                  <div style={{ marginTop: 6, color: t.amber, maxHeight: 100, overflowY: "auto" }}>
                    {uploadResult.skipped.slice(0, 20).map((s, i) => <div key={i}>⚠ {s}</div>)}
                    {uploadResult.skipped.length > 20 && <div>…dan {uploadResult.skipped.length - 20} lainnya.</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabel gabungan ── */}
      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${t.line}`, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari HOA / DS / ID DSE / Branch / MC…"
              style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <div style={{ position: "relative", minWidth: 190 }}>
            <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}
              style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
              <option value="">Semua Region</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", right: 12, top: 12, color: t.lo, pointerEvents: "none" }} />
          </div>
          <button onClick={() => fetchRows(page, search, filterRegion)} title="Refresh"
            style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RefreshCw size={14} className={fetching ? "spin" : ""} />
          </button>
          <button onClick={openDeleteAll} disabled={total === 0}
            title={filterRegion ? `Hapus semua data di Region ${filterRegion}` : "Hapus semua data di semua Region"}
            style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.redBg}`, background: t.redBg, color: t.red, fontSize: 13, fontWeight: 700, cursor: total === 0 ? "default" : "pointer", opacity: total === 0 ? 0.5 : 1 }}>
            <Trash2 size={14} />
            Hapus Semua
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 16px", fontSize: 12, color: t.mid, borderBottom: `1px solid ${t.line}`, flexWrap: "wrap" }}>
          <div>
            {total.toLocaleString("id-ID")} baris DSE{filterRegion ? ` · Region ${filterRegion}` : " · seluruh Region"}
            {incompleteTotal > 0 && (
              <span style={{ color: t.amber, fontWeight: 700 }}> · {incompleteTotal.toLocaleString("id-ID")} baris belum lengkap</span>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", fontSize: 12 }}>
            <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
            Tampilkan yang sudah Revoked
          </label>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {["", "STATUS", "REGION", "BRANCH", "HOA", "NAMA DS", "NOMOR DS", "MC", "ID DSE", "NOMOR DSE", "DESA", "OUTLET", "REMARKS"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "9px 12px", color: t.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                <tr><td colSpan={13} style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={16} className="spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={13} style={{ padding: 28, textAlign: "center", color: t.mid }}>Belum ada data. Download template lalu Upload Data untuk mulai.</td></tr>
              ) : rows.map((r) => {
                const incomplete = !r.ds_name || !r.ds_phone || !r.mc || !r.dse_phone || r.flag_duplicate_code;
                const remarks = buildRemarks(r);
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${t.line}`, background: r.is_revoked ? t.redBg : incomplete ? t.amberBg : "transparent", opacity: r.is_revoked ? 0.75 : 1 }}>
                    <td style={{ padding: "8px 10px", textAlign: "center" }} title={incomplete ? "Ada kolom yang masih kosong" : "Lengkap"}>
                      {incomplete && <AlertTriangle size={13} color={t.amber} />}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {r.is_revoked ? (
                        <span title={r.superseded_by_code ? `Digantikan kode: ${r.superseded_by_code}` : undefined}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: t.redBg, color: t.red, fontWeight: 700, fontSize: 11 }}>
                          Revoked{r.superseded_by_code ? ` → ${r.superseded_by_code}` : ""}
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: t.tealBg, color: t.teal, fontWeight: 700, fontSize: 11 }}>
                          Aktif
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.region}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.branch}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.hoa_name}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.ds_name ? t.hi : t.amber, fontStyle: r.ds_name ? "normal" : "italic" }}>{r.ds_name || "belum ada nama"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.ds_phone ? t.mid : t.amber, fontStyle: r.ds_phone ? "normal" : "italic" }}>{r.ds_phone || "kosong"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.mc ? t.hi : t.amber, fontStyle: r.mc ? "normal" : "italic" }}>{r.mc || "kosong"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontWeight: 700 }}>{r.dse_code}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.dse_phone ? t.mid : t.amber, fontStyle: r.dse_phone ? "normal" : "italic" }}>{r.dse_phone || "kosong"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{r.jumlah_desa}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{r.jumlah_outlet}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: incomplete ? t.amber : t.teal, fontWeight: 600 }}>{remarks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 14, borderTop: `1px solid ${t.line}` }}>
          <button onClick={() => fetchRows(page - 1, search, filterRegion)} disabled={page <= 1}
            style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}>
            Sebelumnya
          </button>
          <span style={{ fontSize: 12.5, color: t.mid }}>Halaman {page} / {totalPages}</span>
          <button onClick={() => fetchRows(page + 1, search, filterRegion)} disabled={page >= totalPages}
            style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}>
            Berikutnya
          </button>
        </div>
      </div>

      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
