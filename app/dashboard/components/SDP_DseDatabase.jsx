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

import { useState, useEffect, useCallback } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import {
  Upload, X, Check, AlertTriangle, Loader2, FileDown,
  Search, RefreshCw, Trash2, ChevronDown, Database,
} from "lucide-react";
import PNL_ImportWizard from "./PNL_ImportWizard";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
const REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const PAGE_SIZE = 50;

function buildRemarks(r) {
  const missing = [];
  if (!r.region) missing.push("Region");
  if (!r.branch) missing.push("Branch");
  if (!r.mc) missing.push("Micro Cluster");
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
        q = q.or(`dse_code.ilike.%${s}%,branch.ilike.%${s}%,mc.ilike.%${s}%,pt_name.ilike.%${s}%,dse_category.ilike.%${s}%`);
      }
      const from = (pg - 1) * PAGE_SIZE;
      const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      setRows(data || []);
      setTotal(count || 0);
      setPage(pg);

      let iq = supabase.from("mf_dse_database").select("id", { count: "exact", head: true })
        .or("region.is.null,branch.is.null,mc.is.null,flag_duplicate_code.eq.true");
      if (reg) iq = iq.eq("region", reg);
      if (srch) {
        const s = srch.replace(/[%_]/g, "");
        iq = iq.or(`dse_code.ilike.%${s}%,branch.ilike.%${s}%,mc.ilike.%${s}%,pt_name.ilike.%${s}%,dse_category.ilike.%${s}%`);
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
        .order("branch", { ascending: true }).order("dse_code", { ascending: true });
      if (filterRegion) q = q.eq("region", filterRegion);
      if (!showRevoked) q = q.eq("is_revoked", false);
      const { data, error } = await q.limit(50000);
      if (error) throw error;
      const head = ["DSE Category", "DSE Code IM3", "DSE Code 3ID", "MDI", "PT", "Micro Cluster", "Branch", "Region", "Circle"];
      const body = (data || []).map((r) => [
        r.dse_category || "", r.dse_code || "", r.dse_code_3id || "", r.mdi || "",
        r.pt_name || "", r.mc || "", r.branch || "", r.region || "", r.circle || "",
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

  // ── Upload Data — sekarang lewat PNL_ImportWizard (pilih file -> preview
  // data & pilih sheet -> set baris header -> cocokkan kolom lewat dropdown
  // -> upsert langsung ke mf_dse_database per DSE Code IM3), bukan parse
  // manual lagi. Lihat <PNL_ImportWizard formTypeProp="dse_database" lockTarget>
  // di bawah; target "Database DSE" sudah didefinisikan di FORM_DEFS wizard
  // dengan 9 kolom: DSE Category, DSE Code IM3, DSE Code 3ID, MDI, PT, Micro
  // Cluster, Branch, Region, Circle.
  const [showWizard, setShowWizard] = useState(false);

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

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Database size={20} color={t.teal} />
            <div style={{ fontSize: 19, fontWeight: 800 }}>Database DSE</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={handleDownload} disabled={exportLoading}
              style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: exportLoading ? 0.6 : 1 }}>
              {exportLoading ? <Loader2 size={14} className="spin" /> : <FileDown size={14} />} Download Data
            </button>
            <button onClick={() => setShowWizard(true)} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <Upload size={14} /> Upload Data
            </button>
          </div>
        </div>
      </div>

      {showWizard && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflowY: "auto" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowWizard(false); fetchRows(1, search, filterRegion); } }}>
          <div style={{ width: "100%", maxWidth: 1040, background: d ? "#0E0E10" : "#F5F5F7", borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", position: "relative", padding: 18 }}>
            <button onClick={() => { setShowWizard(false); fetchRows(1, search, filterRegion); }}
              style={{ position: "absolute", top: 14, right: 14, zIndex: 10, width: 32, height: 32, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={16} />
            </button>
            <PNL_ImportWizard theme={theme} supabase={supabase} formTypeProp="dse_database" lockTarget />
          </div>
        </div>
      )}

      {/* ── Tabel gabungan ── */}
      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${t.line}`, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari ID DSE / Branch / MC / Partner…"
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
                {["", "STATUS", "KATEGORI DSE", "DSE CODE IM3", "DSE CODE 3ID", "MDI", "PT", "MICRO CLUSTER", "BRANCH", "REGION", "CIRCLE", "REMARKS"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "9px 12px", color: t.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                <tr><td colSpan={12} style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={16} className="spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 28, textAlign: "center", color: t.mid }}>Belum ada data. Download template lalu Upload Data untuk mulai.</td></tr>
              ) : rows.map((r) => {
                const incomplete = !r.region || !r.branch || !r.mc || r.flag_duplicate_code;
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
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.dse_category || "-"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontWeight: 700 }}>{r.dse_code}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontWeight: 700 }}>{r.dse_code_3id || "-"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.mdi || "-"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.pt_name || "-"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.mc ? t.hi : t.amber, fontStyle: r.mc ? "normal" : "italic" }}>{r.mc || "kosong"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.branch}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.region}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.circle || "-"}</td>
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
