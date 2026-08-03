"use client";
/**
 * MC_ClusterMapping.jsx
 * Fitur mapping MC (IM3) dan Cluster (3ID) per branch.
 * Upload CSV bulk atau tambah/hapus manual.
 * Hanya bisa diakses oleh role spm_sumatera.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  Upload, Plus, Trash2, Search, RefreshCw,
  ChevronLeft, ChevronRight, X, Check, AlertTriangle,
  Loader2, FileSpreadsheet, CalendarDays, ChevronDown, History,
  FileDown,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
const PAGE_SIZE = 50;

// ── Export helpers (sama pola dgn PTS_Module.jsx) ─────────────────────────────
function downloadXlsx(head, body, sheetName, filename) {
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
function downloadCsv(head, body, filename) {
  const csv = Papa.unparse([head, ...body]);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const pad2 = (n) => String(n).padStart(2, "0");
const currentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
const ymLabel = (p) => {
  const [y, m] = String(p || "").split("-").map(Number);
  if (!y || !m) return p || "";
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
};
// 6 bulan ke belakang s.d. bulan berjalan — sama seperti selector periode di PTS.
const periodOptions = () => {
  const out = []; const d = new Date();
  for (let i = 0; i < 7; i++) {
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === "error" ? "#DC2626" : type === "warn" ? "#D97706" : "#16A34A";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px", borderRadius: 10,
      background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600,
      fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      maxWidth: 380,
    }}>
      {type === "error" ? <AlertTriangle size={15}/> : <Check size={15}/>}
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:"none", border:"none", color:"#fff", cursor:"pointer", padding:0, display:"flex" }}>
        <X size={14}/>
      </button>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteModal({ row, onConfirm, onCancel, t }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:t.card, borderRadius:14, padding:28, maxWidth:380, width:"100%", border:`1px solid ${t.line}` }}>
        <div style={{ fontSize:15, fontWeight:700, color:t.hi, marginBottom:8 }}>Hapus Mapping?</div>
        <div style={{ fontSize:13.5, color:t.mid, marginBottom:20, lineHeight:1.6 }}>
          <b style={{ color:t.hi }}>{row.mc}</b> / <b style={{ color:t.hi }}>{row.cluster}</b>
          <br/>Branch: {row.branch} · {row.region}
          <br/>Periode: <b style={{ color:t.hi }}>{ymLabel(row.period)}</b> — hanya baris periode ini yang akan dihapus, bulan lain tidak terpengaruh.
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:"10px 0", borderRadius:9, border:`1px solid ${t.line}`, background:"transparent", color:t.mid, fontSize:13.5, fontWeight:600, cursor:"pointer", fontFamily:FONT }}>Batal</button>
          <button onClick={onConfirm} style={{ flex:1, padding:"10px 0", borderRadius:9, border:"none", background:"#DC2626", color:"#fff", fontSize:13.5, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>Hapus</button>
        </div>
      </div>
    </div>
  );
}

export default function MC_ClusterMapping({ theme, profile }) {
  const d = theme === "dark";

  // Design tokens — ikuti pola dashboard
  const t = {
    bg:       d ? "#0F0F11" : "#F2F2F7",
    card:     d ? "#1A1A1D" : "#FFFFFF",
    sub:      d ? "#202024" : "#F5F5F7",
    line:     d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)",
    hi:       d ? "#F2F2F3" : "#1A1A1D",
    mid:      d ? "#8A8A96" : "#5A5A68",
    lo:       d ? "#5A5A68" : "#8A8A96",
    inputBg:  d ? "#1E1E22" : "#F8F8FA",
    inputBd:  d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
    teal:     d ? "#32BCAD" : "#1A9E90",
    tealBg:   d ? "rgba(50,188,173,0.10)" : "rgba(26,158,144,0.07)",
    tealBd:   d ? "rgba(50,188,173,0.28)" : "rgba(26,158,144,0.20)",
    magenta:  "#C6168D",
    magentaBg: d ? "#270016" : "#FEECF8",
    magentaBd: d ? "#520030" : "#F0A8DC",
    red:      d ? "#F87171" : "#DC2626",
    redBg:    d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
    hover:    d ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
  };

  const [rows, setRows]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [fetching, setFetching]   = useState(false);
  const [search, setSearch]       = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [regions, setRegions]     = useState([]);
  const [branches, setBranches]   = useState([]);
  const [token, setToken]         = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  // Periode (bulan) — data mapping ini per-bulan dgn carry-forward: kalau
  // bulan yg dipilih belum pernah di-upload, otomatis pakai upload terakhir
  // yang tersedia (lihat RPC mc_cluster_effective & badge di bawah).
  const [period, setPeriod] = useState(currentPeriod());
  const [sourcePeriod, setSourcePeriod] = useState(currentPeriod());
  const [isCarriedForward, setIsCarriedForward] = useState(false);

  // Add form
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState({ circle:"SUMATERA", region:"", area:"", branch:"", mc:"", cluster:"" });
  const [addLoading, setAddLoading] = useState(false);

  // CSV upload
  const [showUpload, setShowUpload]   = useState(false);
  const [csvText, setCsvText]         = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvMode, setCsvMode]         = useState("upsert");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult]   = useState(null);
  const fileRef = useRef(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "ok") => setToast({ msg, type });

  // ── Init token ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setToken(session.access_token);
    });
  }, []);

  // ── Fetch rows ─────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async (pg = 1, srch = search, reg = filterRegion, br = filterBranch, prd = period) => {
    setFetching(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: PAGE_SIZE, period: prd });
      if (srch) params.set("search", srch);
      if (reg)  params.set("region", reg);
      if (br)   params.set("branch", br);
      const res  = await fetch(`/api/mc-cluster?${params}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setTotal(json.count ?? 0);
      setPage(pg);
      setSourcePeriod(json.source_period ?? prd);
      setIsCarriedForward(!!json.is_carried_forward);
    } finally {
      setFetching(false);
    }
  }, [search, filterRegion, filterBranch, period]);

  // ── Fetch filter options — dari data periode efektif yg sedang tampil,
  // supaya daftar Region/Branch di dropdown filter selalu relevan dgn bulan
  // yang sedang dilihat (bukan lintas semua histori bulan). ───────────────────
  const refreshFilters = useCallback(async (prd = period) => {
    const res = await fetch(`/api/mc-cluster?period=${prd}&limit=5000`);
    const json = await res.json();
    const data = json.data || [];
    setRegions([...new Set(data.map(r => r.region))].sort());
    setBranches([...new Set(data.map(r => r.branch))].sort());
  }, [period]);

  useEffect(() => { fetchRows(1, search, filterRegion, filterBranch, period); refreshFilters(period); }, [period]); // eslint-disable-line

  // Auto-fill area = region
  useEffect(() => {
    if (addForm.region) setAddForm(f => ({ ...f, area: f.region }));
  }, [addForm.region]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    fetchRows(1, searchInput, filterRegion, filterBranch, period);
  };

  // Ganti periode di selector atas — sekaligus jadi konteks "berlaku utk
  // bulan mana" utk Tambah/Upload di bawah (ikut periode yang sedang dipilih).
  const handlePeriodChange = (p) => {
    setPeriod(p);
    fetchRows(1, search, filterRegion, filterBranch, p);
    refreshFilters(p);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!token) { showToast("Sesi berakhir, silakan refresh.", "error"); return; }
    setAddLoading(true);
    try {
      const res = await fetch("/api/mc-cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...addForm, period }),
      });
      const json = await res.json();
      if (!json.success) { showToast(json.message, "error"); return; }
      showToast(`Berhasil ditambahkan untuk ${ymLabel(period)}!`);
      setShowAdd(false);
      setAddForm({ circle:"SUMATERA", region:"", area:"", branch:"", mc:"", cluster:"" });
      fetchRows(1); refreshFilters();
    } finally { setAddLoading(false); }
  };

  // Terima .csv/.txt (dibaca sebagai teks langsung) ATAU .xlsx/.xls (di-parse
  // via SheetJS lalu dikonversi ke format CSV semicolon-delimited yang sama
  // supaya endpoint upload tidak perlu dibedakan sama sekali).
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          const csv = aoa
            .filter((row) => row.some((c) => String(c).trim() !== ""))
            .map((row) => row.map((c) => String(c).trim()).join(";"))
            .join("\n");
          setCsvText(csv);
        } catch {
          showToast("Gagal membaca file Excel. Pastikan formatnya benar.", "error");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => setCsvText(ev.target.result);
      reader.readAsText(file, "utf-8");
    }
  };

  const handleUpload = async () => {
    if (!csvText.trim()) { showToast("Pilih file CSV terlebih dahulu.", "error"); return; }
    if (!token) { showToast("Sesi berakhir, silakan refresh.", "error"); return; }
    setUploadLoading(true); setUploadResult(null);
    try {
      const res = await fetch("/api/mc-cluster/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv: csvText, mode: csvMode, period }),
      });
      const json = await res.json();
      setUploadResult(json);
      if (json.success) { showToast(`${json.message} (${ymLabel(period)})`); fetchRows(1); refreshFilters(); }
      else showToast(json.message, "error");
    } finally { setUploadLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !token) return;
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/mc-cluster", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const json = await res.json();
      if (!json.success) { showToast(json.message, "error"); return; }
      showToast("Data berhasil dihapus.");
      setDeleteTarget(null);
      fetchRows(page);
    } finally { setDeleteLoading(false); }
  };

  // ── Export (CSV / Excel) ──────────────────────────────────────────────────
  // Ambil SEMUA baris yang cocok dgn filter+periode aktif saat ini (bukan
  // cuma 1 halaman) langsung dari /api/mc-cluster dgn limit besar, lalu
  // convert ke format tabel export.
  const exportHead = ["MC (IM3)", "Cluster (3ID)", "Micro Cluster", "Branch", "Region", "Area", "Circle", "Periode"];
  const fetchAllForExport = async () => {
    const params = new URLSearchParams({ page: 1, limit: 20000, period });
    if (search)      params.set("search", search);
    if (filterRegion) params.set("region", filterRegion);
    if (filterBranch) params.set("branch", filterBranch);
    const res = await fetch(`/api/mc-cluster?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal mengambil data.");
    return json.data || [];
  };
  const exportExcel = async () => {
    setExportLoading(true);
    try {
      const data = await fetchAllForExport();
      const body = data.map(r => [r.mc, r.cluster, r.micro_cluster || "", r.branch, r.region, r.area, r.circle, ymLabel(r.period)]);
      downloadXlsx(exportHead, body, "MC Cluster Mapping", `mc_cluster_mapping_${period}.xlsx`);
    } catch (err) { showToast(err.message, "error"); } finally { setExportLoading(false); }
  };
  const exportCsvFile = async () => {
    setExportLoading(true);
    try {
      const data = await fetchAllForExport();
      const body = data.map(r => [r.mc, r.cluster, r.micro_cluster || "", r.branch, r.region, r.area, r.circle, ymLabel(r.period)]);
      downloadCsv(exportHead, body, `mc_cluster_mapping_${period}.csv`);
    } catch (err) { showToast(err.message, "error"); } finally { setExportLoading(false); }
  };

  // ── Shared input style ──────────────────────────────────────────────────────
  const inp = {
    width:"100%", padding:"8px 12px", borderRadius:8,
    border:`1px solid ${t.inputBd}`, background:t.inputBg,
    color:t.hi, fontSize:13.5, fontFamily:FONT,
    outline:"none", boxSizing:"border-box",
  };
  const lbl = { fontSize:11.5, fontWeight:600, color:t.mid, marginBottom:4, display:"block", letterSpacing:"0.04em", textTransform:"uppercase" };

  return (
    <div style={{ fontFamily:FONT }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16, flexWrap:"wrap", marginBottom:24 }}>
        <div>
          <div style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"3px 10px", borderRadius:6, background:t.magentaBg, border:`1px solid ${t.magentaBd}`, marginBottom:10 }}>
            <span style={{ fontSize:10.5, fontWeight:700, color:t.magenta, letterSpacing:"0.06em", textTransform:"uppercase" }}>Admin</span>
          </div>
          <h2 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", color:t.hi, margin:0, lineHeight:1.2 }}>MC / Cluster Mapping</h2>
          <p style={{ fontSize:13.5, color:t.mid, marginTop:5 }}>
            {total.toLocaleString()} entri · Mapping IM3 (MC) dan 3ID (Cluster) per branch
          </p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button
            onClick={() => { setShowUpload(v => !v); setShowAdd(false); }}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:9, border:`1px solid ${showUpload ? t.tealBd : t.inputBd}`, background: showUpload ? t.tealBg : t.inputBg, color: showUpload ? t.teal : t.mid, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:FONT, transition:"all .14s" }}
          >
            <Upload size={14}/> Upload CSV
          </button>
          <button
            onClick={() => { setShowAdd(v => !v); setShowUpload(false); }}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:9, border:"none", background:`linear-gradient(135deg,#ED1C24,#C6168D)`, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT }}
          >
            <Plus size={14}/> Tambah
          </button>
        </div>
      </div>

      {/* ── Selector periode — data mapping ini per-bulan dengan carry-forward:
          upload/tambah baru berlaku utk bulan yg sedang dipilih di sini; kalau
          suatu bulan belum pernah di-upload, otomatis tampil data upload
          TERAKHIR yang tersedia (badge kuning di bawah). ────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:14 }}>
        <div style={{ position:"relative" }}>
          <select value={period} onChange={(e) => handlePeriodChange(e.target.value)}
            style={{ appearance:"none", height:34, borderRadius:9, border:`1px solid ${t.inputBd}`, background:t.inputBg, color:t.hi, fontFamily:FONT, fontSize:13, fontWeight:700, padding:"0 30px 0 32px", cursor:"pointer" }}>
            {periodOptions().map((p) => <option key={p} value={p}>{ymLabel(p)}</option>)}
          </select>
          <CalendarDays size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:t.magenta, pointerEvents:"none" }}/>
          <ChevronDown size={13} style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", color:t.lo, pointerEvents:"none" }}/>
        </div>
        {isCarriedForward && (
          <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:8, background:"rgba(217,119,6,0.10)", border:"1px solid rgba(217,119,6,0.25)" }}>
            <History size={13} color="#D97706"/>
            <span style={{ fontSize:12, fontWeight:600, color:"#D97706" }}>
              {ymLabel(period)} belum di-upload — menampilkan data terakhir dari {ymLabel(sourcePeriod)}.
            </span>
          </div>
        )}
      </div>

      {/* ── CSV Upload panel ────────────────────────────────────────────────── */}
      {showUpload && (
        <div style={{ marginBottom:18, padding:20, borderRadius:12, border:`1px solid ${t.line}`, background:t.card, boxShadow:t.shadowSm }}>
          <div style={{ fontSize:14, fontWeight:700, color:t.hi, marginBottom:16 }}>Upload CSV</div>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:16 }}>
            <div style={{ flex:1, minWidth:200 }}>
              <label style={lbl}>File CSV / Excel</label>
              <div
                onClick={() => fileRef.current?.click()}
                style={{ padding:"18px 16px", borderRadius:9, border:`2px dashed ${t.inputBd}`, background:t.inputBg, textAlign:"center", cursor:"pointer" }}
              >
                <FileSpreadsheet size={20} color={t.lo} style={{ margin:"0 auto 8px" }}/>
                <div style={{ fontSize:13, color:t.mid }}>
                  {csvText
                    ? <span style={{ color:t.teal, fontWeight:600 }}>✓ {csvFileName || "File"} dimuat ({csvText.split("\n").length - 1} baris)</span>
                    : "Klik untuk pilih file .csv, .xlsx, atau .xls"}
                </div>
                <div style={{ fontSize:11.5, color:t.lo, marginTop:4 }}>Kolom: CIRCLE, REGION, AREA, BRANCH, MC, CLUSTER (Micro Cluster otomatis mengikuti kolom MC)</div>
                <div style={{ fontSize:11, color:t.lo, marginTop:2 }}>Berlaku utk periode: <b style={{ color:t.mid }}>{ymLabel(period)}</b> (ganti di selector bulan di atas)</div>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFileChange} style={{ display:"none" }}/>
              </div>
            </div>
            <div style={{ minWidth:200 }}>
              <label style={lbl}>Mode Upload</label>
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:4 }}>
                {[
                  { val:"upsert",  label:"Upsert",      desc:"Tambah baru + update yang sudah ada" },
                  { val:"replace", label:"Replace All",  desc:"Hapus semua data lama, ganti dengan CSV baru" },
                ].map(opt => (
                  <label key={opt.val} style={{ display:"flex", alignItems:"flex-start", gap:9, cursor:"pointer" }}>
                    <input type="radio" value={opt.val} checked={csvMode === opt.val} onChange={() => setCsvMode(opt.val)} style={{ marginTop:3, accentColor:"#ED1C24" }}/>
                    <div>
                      <div style={{ fontSize:13.5, fontWeight:600, color:t.hi }}>{opt.label}</div>
                      <div style={{ fontSize:12, color:t.mid }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
                {csvMode === "replace" && (
                  <div style={{ padding:"7px 11px", borderRadius:7, background:t.redBg, border:`1px solid rgba(220,38,38,0.2)`, display:"flex", alignItems:"center", gap:6 }}>
                    <AlertTriangle size={13} color={t.red}/><span style={{ fontSize:12, color:t.red, fontWeight:600 }}>Semua data lama akan dihapus!</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {uploadResult && (
            <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:9, background: uploadResult.success ? "rgba(22,163,74,0.08)" : t.redBg, border:`1px solid ${uploadResult.success ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)"}` }}>
              <div style={{ fontSize:13.5, fontWeight:700, color: uploadResult.success ? "#16A34A" : t.red }}>{uploadResult.message}</div>
              {uploadResult.errors?.slice(0,5).map((e,i) => <div key={i} style={{ fontSize:12, color:t.mid, marginTop:3 }}>{e}</div>)}
              {(uploadResult.errors?.length ?? 0) > 5 && <div style={{ fontSize:12, color:t.mid }}>...dan {uploadResult.errors.length - 5} lainnya</div>}
            </div>
          )}

          <div style={{ display:"flex", gap:8 }}>
            <button onClick={handleUpload} disabled={uploadLoading || !csvText}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 18px", borderRadius:9, border:"none", background:`linear-gradient(135deg,#ED1C24,#C6168D)`, color:"#fff", fontSize:13, fontWeight:700, cursor: uploadLoading || !csvText ? "not-allowed" : "pointer", opacity: uploadLoading || !csvText ? 0.6 : 1, fontFamily:FONT }}>
              {uploadLoading ? <Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> : <Upload size={13}/>}
              {uploadLoading ? "Mengupload..." : "Upload"}
            </button>
            <button onClick={() => { setShowUpload(false); setCsvText(""); setCsvFileName(""); setUploadResult(null); }}
              style={{ padding:"8px 14px", borderRadius:9, border:`1px solid ${t.inputBd}`, background:"transparent", color:t.mid, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:FONT }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {/* ── Add form panel ──────────────────────────────────────────────────── */}
      {showAdd && (
        <div style={{ marginBottom:18, padding:20, borderRadius:12, border:`1px solid ${t.line}`, background:t.card, boxShadow:t.shadowSm }}>
          <div style={{ fontSize:14, fontWeight:700, color:t.hi, marginBottom:16 }}>Tambah MC / Cluster Baru</div>
          <form onSubmit={handleAddSubmit}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12, marginBottom:16 }}>
              {[
                { key:"circle",  label:"Circle",       ph:"SUMATERA" },
                { key:"region",  label:"Region",        ph:"CENTRAL SUMATERA" },
                { key:"area",    label:"Area",           ph:"Auto-filled" },
                { key:"branch",  label:"Branch",         ph:"PEKANBARU" },
                { key:"mc",      label:"MC (IM3)",        ph:"MC-PEKANBARU" },
                { key:"cluster", label:"Cluster (3ID)",  ph:"CS PEKANBARU" },
              ].map(({ key, label, ph, optional }) => (
                <div key={key}>
                  <label style={lbl}>{label}{optional ? <span style={{ color:t.lo, fontWeight:400 }}> (opsional)</span> : null}</label>
                  <input value={addForm[key]} onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value.toUpperCase() }))}
                    placeholder={ph} required={!optional} style={inp}/>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button type="submit" disabled={addLoading}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 18px", borderRadius:9, border:"none", background:`linear-gradient(135deg,#ED1C24,#C6168D)`, color:"#fff", fontSize:13, fontWeight:700, cursor: addLoading ? "not-allowed" : "pointer", opacity: addLoading ? 0.6 : 1, fontFamily:FONT }}>
                {addLoading ? <Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> : <Plus size={13}/>}
                {addLoading ? "Menyimpan..." : "Simpan"}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                style={{ padding:"8px 14px", borderRadius:9, border:`1px solid ${t.inputBd}`, background:"transparent", color:t.mid, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:FONT }}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:14 }}>
        <form onSubmit={handleSearch} style={{ display:"flex", gap:6, flex:1, minWidth:200 }}>
          <div style={{ position:"relative", flex:1 }}>
            <Search size={13} color={t.lo} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}/>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Cari MC, Cluster, Branch, Region..."
              style={{ ...inp, paddingLeft:32 }}/>
          </div>
          <button type="submit"
            style={{ padding:"8px 14px", borderRadius:8, border:"none", background:`linear-gradient(135deg,#ED1C24,#C6168D)`, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
            Cari
          </button>
          {(search || filterRegion || filterBranch) && (
            <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setFilterRegion(""); setFilterBranch(""); fetchRows(1,"","",""); }}
              style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${t.inputBd}`, background:"transparent", color:t.mid, cursor:"pointer", display:"flex", alignItems:"center" }}>
              <X size={14}/>
            </button>
          )}
        </form>

        <select value={filterRegion} onChange={e => { setFilterRegion(e.target.value); setFilterBranch(""); fetchRows(1, search, e.target.value, ""); }}
          style={{ ...inp, width:"auto", minWidth:160, cursor:"pointer" }}>
          <option value="">Semua Region</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); fetchRows(1, search, filterRegion, e.target.value); }}
          style={{ ...inp, width:"auto", minWidth:150, cursor:"pointer" }}>
          <option value="">Semua Branch</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <button onClick={() => fetchRows(page)}
          style={{ width:36, height:36, borderRadius:8, border:`1px solid ${t.inputBd}`, background:t.inputBg, display:"flex", alignItems:"center", justifyContent:"center", color:t.mid, cursor:"pointer", flexShrink:0 }}>
          <RefreshCw size={13} style={fetching ? { animation:"spin 1s linear infinite" } : {}}/>
        </button>

        <button onClick={exportExcel} disabled={exportLoading || total === 0}
          title="Export as Excel"
          style={{ display:"flex", alignItems:"center", gap:6, height:36, padding:"0 12px", borderRadius:8, border:`1px solid ${t.inputBd}`, background:t.inputBg, color:t.mid, fontSize:12.5, fontWeight:600, cursor: exportLoading || total === 0 ? "not-allowed" : "pointer", opacity: exportLoading || total === 0 ? 0.55 : 1, flexShrink:0, fontFamily:FONT }}>
          {exportLoading ? <Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> : <FileSpreadsheet size={13}/>}
          Excel
        </button>
        <button onClick={exportCsvFile} disabled={exportLoading || total === 0}
          title="Export as CSV"
          style={{ display:"flex", alignItems:"center", gap:6, height:36, padding:"0 12px", borderRadius:8, border:`1px solid ${t.inputBd}`, background:t.inputBg, color:t.mid, fontSize:12.5, fontWeight:600, cursor: exportLoading || total === 0 ? "not-allowed" : "pointer", opacity: exportLoading || total === 0 ? 0.55 : 1, flexShrink:0, fontFamily:FONT }}>
          {exportLoading ? <Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> : <FileDown size={13}/>}
          CSV
        </button>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div style={{ borderRadius:12, border:`1px solid ${t.line}`, overflow:"hidden", background:t.card, boxShadow:t.shadowSm }}>
        {/* Header row */}
        <div style={{ display:"grid", gridTemplateColumns:"1.8fr 1.6fr 1.4fr 1.3fr 1.3fr 1.4fr 44px", padding:"10px 16px", borderBottom:`1px solid ${t.line}`, background:t.sub }}>
          {["MC (IM3)", "Cluster (3ID)", "Micro Cluster", "Branch", "Region", "Area", ""].map((h, i) => (
            <div key={i} style={{ fontSize:11, fontWeight:700, color:t.lo, letterSpacing:"0.07em", textTransform:"uppercase", textAlign: i===6 ? "right" : "left" }}>{h}</div>
          ))}
        </div>

        {fetching ? (
          <div style={{ padding:48, textAlign:"center" }}>
            <Loader2 size={22} color="#32BCAD" style={{ animation:"spin 1s linear infinite", margin:"0 auto" }}/>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding:48, textAlign:"center", color:t.mid, fontSize:13.5 }}>
            {search || filterRegion || filterBranch ? "Tidak ada data yang cocok." : "Belum ada data mapping. Upload CSV atau tambah manual."}
          </div>
        ) : rows.map((row, idx) => (
          <div key={row.id}
            style={{ display:"grid", gridTemplateColumns:"1.8fr 1.6fr 1.4fr 1.3fr 1.3fr 1.4fr 44px", padding:"11px 16px", borderBottom: idx < rows.length - 1 ? `1px solid ${t.line}` : "none", transition:"background .1s" }}
            onMouseEnter={e => e.currentTarget.style.background = t.hover}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <span style={{ display:"inline-flex", padding:"2px 7px", borderRadius:4, background:"rgba(37,99,235,0.10)", border:"1px solid rgba(37,99,235,0.18)", fontSize:10, fontWeight:700, color:"#2563EB", letterSpacing:"0.05em", flexShrink:0 }}>IM3</span>
              <span style={{ fontSize:13.5, color:t.hi, fontWeight:500 }}>{row.mc}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <span style={{ display:"inline-flex", padding:"2px 7px", borderRadius:4, background:"rgba(13,148,136,0.10)", border:"1px solid rgba(13,148,136,0.20)", fontSize:10, fontWeight:700, color:"#0D9488", letterSpacing:"0.05em", flexShrink:0 }}>3ID</span>
              <span style={{ fontSize:13.5, color:t.hi, fontWeight:500 }}>{row.cluster}</span>
            </div>
            <div style={{ fontSize:12.5, color: row.micro_cluster ? t.mid : t.lo, display:"flex", alignItems:"center" }}>{row.micro_cluster || "—"}</div>
            <div style={{ fontSize:13.5, color:t.mid, display:"flex", alignItems:"center" }}>{row.branch}</div>
            <div style={{ fontSize:12.5, color:t.lo, display:"flex", alignItems:"center" }}>{row.region}</div>
            <div style={{ fontSize:12.5, color:t.lo, display:"flex", alignItems:"center" }}>{row.area}</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end" }}>
              <button onClick={() => setDeleteTarget(row)}
                style={{ width:28, height:28, borderRadius:6, border:`1px solid ${t.inputBd}`, background:"transparent", display:"flex", alignItems:"center", justifyContent:"center", color:t.lo, cursor:"pointer", transition:"all .14s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#DC2626"; e.currentTarget.style.color="#DC2626"; e.currentTarget.style.background=t.redBg; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=t.inputBd; e.currentTarget.style.color=t.lo; e.currentTarget.style.background="transparent"; }}>
                <Trash2 size={12}/>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ marginTop:14, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:12.5, color:t.mid }}>
            {((page-1)*PAGE_SIZE)+1}–{Math.min(page*PAGE_SIZE,total)} dari {total.toLocaleString()}
          </div>
          <div style={{ display:"flex", gap:5 }}>
            <button onClick={() => fetchRows(page-1)} disabled={page===1}
              style={{ width:32, height:32, borderRadius:7, border:`1px solid ${t.inputBd}`, background:"transparent", display:"flex", alignItems:"center", justifyContent:"center", color: page===1 ? t.lo : t.mid, cursor: page===1 ? "not-allowed" : "pointer" }}>
              <ChevronLeft size={14}/>
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(1, Math.min(page-2, totalPages-4)) + i;
              return (
                <button key={pg} onClick={() => fetchRows(pg)}
                  style={{ width:32, height:32, borderRadius:7, border:`1px solid ${pg===page ? "#32BCAD" : t.inputBd}`, background: pg===page ? "rgba(50,188,173,0.12)" : "transparent", color: pg===page ? "#32BCAD" : t.mid, fontSize:13, fontWeight: pg===page ? 700 : 500, cursor:"pointer" }}>
                  {pg}
                </button>
              );
            })}
            <button onClick={() => fetchRows(page+1)} disabled={page===totalPages}
              style={{ width:32, height:32, borderRadius:7, border:`1px solid ${t.inputBd}`, background:"transparent", display:"flex", alignItems:"center", justifyContent:"center", color: page===totalPages ? t.lo : t.mid, cursor: page===totalPages ? "not-allowed" : "pointer" }}>
              <ChevronRight size={14}/>
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {deleteTarget && (
        <DeleteModal row={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} t={t}/>
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)}/>}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
