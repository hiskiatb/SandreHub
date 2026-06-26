"use client";
/**
 * KodeOtoritas.jsx — v3 (rebuild)
 * Manajemen Kode Otoritas Sales — sumber tunggal: tabel `sales_access_codes`.
 *
 * Fitur:
 *   • Tabel kode (BSM + CSE/RSE) dengan filter role / brand / region / area / branch + pencarian
 *   • Badge status "Tersedia" / "Terpakai" (+ nama pengguna)
 *   • Tombol "Sinkron dari Territory" → RPC sync_sales_access_codes() (non-destruktif)
 *   • Tombol "Download Excel" → .xlsx 3 sheet: Ringkasan, BSM, CSE-RSE
 *
 * Props: { theme = "dark", profile }
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import supabase from "../../../lib/supabase";
import {
  Key, Search, RefreshCw, Download, Copy, Check, Loader2,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, X,
} from "lucide-react";

const FF   = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace`;
const PAGE_SIZE = 25;

// ─── Theme tokens ───────────────────────────────────────────────────────────
const mk = (d) => ({
  bg    : d ? "#0D0D0F" : "#F2F4F7",
  card  : d ? "#17171B" : "#FFFFFF",
  sub   : d ? "#1D1D22" : "#F8F9FA",
  line  : d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi    : d ? "#F1F1F4" : "#0F1117",
  mid   : d ? "#8A8A9C" : "#6B7280",
  lo    : d ? "#4A4A5E" : "#A0A8B4",
  mag   : "#C6168D",
  magBg : d ? "rgba(198,22,141,.12)" : "rgba(198,22,141,.07)",
  magBd : d ? "rgba(198,22,141,.3)"  : "rgba(198,22,141,.18)",
  teal  : "#12998B",
  tealBg: d ? "rgba(18,153,139,.14)" : "rgba(18,153,139,.08)",
  tealBd: d ? "rgba(18,153,139,.32)" : "rgba(18,153,139,.22)",
  blue  : d ? "#2E6BE6" : "#2563EB",
  blueBg: d ? "rgba(46,107,230,.12)" : "rgba(37,99,235,.07)",
  blueBd: d ? "rgba(46,107,230,.28)" : "rgba(37,99,235,.18)",
  amber : "#CC8500",
  amberBg: d ? "rgba(204,133,0,.14)" : "rgba(204,133,0,.08)",
  amberBd: d ? "rgba(204,133,0,.34)" : "rgba(204,133,0,.24)",
  red   : d ? "#FF453A" : "#DC2626",
  redBg : d ? "rgba(255,69,58,.1)"   : "rgba(220,38,38,.06)",
  sm    : d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md    : d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});

// ─── Small UI helpers ───────────────────────────────────────────────────────
function Select({ value, onChange, options, t, minWidth = 130 }) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: "none", WebkitAppearance: "none",
          background: t.sub, border: `1px solid ${t.line}`,
          borderRadius: 9, padding: "9px 32px 9px 12px",
          color: t.hi, fontFamily: FF, fontSize: 13, fontWeight: 600,
          cursor: "pointer", minWidth,
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={13} color={t.mid} style={{
        position: "absolute", right: 10, top: "50%",
        transform: "translateY(-50%)", pointerEvents: "none",
      }} />
    </div>
  );
}

function Stat({ label, value, color, t }) {
  return (
    <div style={{
      padding: "13px 16px", borderRadius: 12,
      background: t.card, border: `1px solid ${t.line}`, boxShadow: t.sm,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 11, color: t.mid, marginTop: 2, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function CopyBtn({ text, t }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title="Salin kode"
      style={{
        border: "none", background: "none", cursor: "pointer",
        color: copied ? "#12998B" : t.lo, padding: 3, display: "inline-flex",
        verticalAlign: "middle", marginLeft: 4,
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function KodeOtoritas({ theme = "dark", profile }) {
  const d = theme === "dark";
  const t = mk(d);

  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [syncing, setSyncing] = useState(false);
  const [toast,   setToast]   = useState(null); // {kind, msg}

  // filters
  const [fRole,   setFRole]   = useState("ALL");
  const [fBrand,  setFBrand]  = useState("ALL");
  const [fRegion, setFRegion] = useState("ALL");
  const [fArea,   setFArea]   = useState("ALL");
  const [fBranch, setFBranch] = useState("ALL");
  const [fStatus, setFStatus] = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(1);

  const showToast = (kind, msg) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchCodes = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase
      .from("sales_access_codes")
      .select("id, role, brand, scope_type, scope_value, branch, area, region, authority_code, is_registered, user_name, user_email, is_active")
      .order("role").order("brand").order("region").order("branch").order("scope_value");
    if (error) { setError(error.message); setRows([]); }
    else setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  // ── Sync from Territory ─────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    const { error } = await supabase.rpc("sync_sales_access_codes");
    setSyncing(false);
    if (error) { showToast("error", `Sinkron gagal: ${error.message}`); return; }
    await fetchCodes();
    showToast("ok", "Kode otoritas disinkron dari Territory (non-destruktif).");
  };

  // ── Derived option lists (dependent) ────────────────────────────────────
  const regionOpts = useMemo(() => {
    const s = new Set(rows.map(r => r.region).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);

  const areaOpts = useMemo(() => {
    const s = new Set(rows
      .filter(r => fRegion === "ALL" || r.region === fRegion)
      .map(r => r.area).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows, fRegion]);

  const branchOpts = useMemo(() => {
    const s = new Set(rows
      .filter(r => (fRegion === "ALL" || r.region === fRegion) && (fArea === "ALL" || r.area === fArea))
      .map(r => r.branch).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows, fRegion, fArea]);

  // filter change handlers — reset dependents + page in the handler (no effect cascade)
  const onRole   = (v) => { setFRole(v);   setPage(1); };
  const onBrand  = (v) => { setFBrand(v);  setPage(1); };
  const onStatus = (v) => { setFStatus(v); setPage(1); };
  const onSearch = (v) => { setSearch(v);  setPage(1); };
  const onRegion = (v) => { setFRegion(v); setFArea("ALL"); setFBranch("ALL"); setPage(1); };
  const onArea   = (v) => { setFArea(v);   setFBranch("ALL"); setPage(1); };
  const onBranch = (v) => { setFBranch(v); setPage(1); };

  // ── Filtered rows ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (fRole   !== "ALL" && r.role   !== fRole)   return false;
      if (fBrand  !== "ALL" && r.brand  !== fBrand)  return false;
      if (fRegion !== "ALL" && r.region !== fRegion) return false;
      if (fArea   !== "ALL" && r.area   !== fArea)   return false;
      if (fBranch !== "ALL" && r.branch !== fBranch) return false;
      if (fStatus === "USED" && !r.is_registered) return false;
      if (fStatus === "FREE" &&  r.is_registered) return false;
      if (q) {
        const hay = `${r.authority_code} ${r.scope_value} ${r.branch ?? ""} ${r.user_name ?? ""} ${r.user_email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, fRole, fBrand, fRegion, fArea, fBranch, fStatus, search]);

  // ── Stats (over current filter scope, ignoring status filter) ───────────
  const stats = useMemo(() => {
    const base = rows.filter(r => {
      if (fRole   !== "ALL" && r.role   !== fRole)   return false;
      if (fBrand  !== "ALL" && r.brand  !== fBrand)  return false;
      if (fRegion !== "ALL" && r.region !== fRegion) return false;
      if (fArea   !== "ALL" && r.area   !== fArea)   return false;
      if (fBranch !== "ALL" && r.branch !== fBranch) return false;
      return true;
    });
    return {
      total: base.length,
      bsm  : base.filter(r => r.role === "bsm").length,
      cse  : base.filter(r => r.role === "cse_rse").length,
      used : base.filter(r => r.is_registered).length,
      free : base.filter(r => !r.is_registered).length,
    };
  }, [rows, fRole, fBrand, fRegion, fArea, fBranch]);

  // ── Pagination ──────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Excel export ────────────────────────────────────────────────────────
  const exportExcel = () => {
    const data = filtered; // export menghormati filter aktif
    const rowMap = (r) => ({
      "Region"        : r.region ?? "",
      "Area"          : r.area ?? "",
      "Branch"        : r.branch ?? "",
      "Brand"         : r.brand,
      "Cluster/Branch": r.scope_value,
      "Kode"          : r.authority_code,
      "Sudah Dipakai" : r.is_registered ? "Ya" : "Tidak",
      "Dipakai Oleh"  : r.user_name ?? "",
    });

    const bsm = data.filter(r => r.role === "bsm").map(rowMap);
    const cse = data.filter(r => r.role === "cse_rse").map(rowMap);

    const byRegion = {};
    data.forEach(r => {
      const k = r.region ?? "—";
      byRegion[k] = byRegion[k] || { region: k, total: 0, used: 0, free: 0 };
      byRegion[k].total++;
      if (r.is_registered) byRegion[k].used++; else byRegion[k].free++;
    });
    const ringkasan = [
      { Keterangan: "Total Kode",     Jumlah: data.length },
      { Keterangan: "BSM",            Jumlah: bsm.length },
      { Keterangan: "CSE/RSE",        Jumlah: cse.length },
      { Keterangan: "Sudah Dipakai",  Jumlah: data.filter(r => r.is_registered).length },
      { Keterangan: "Tersedia",       Jumlah: data.filter(r => !r.is_registered).length },
      {},
      { Keterangan: "— Per Region —", Jumlah: "" },
      ...Object.values(byRegion).map(x => ({
        Keterangan: `${x.region} (dipakai ${x.used}/${x.total})`, Jumlah: x.total,
      })),
    ];

    const emptyRow = { Region: "", Area: "", Branch: "", Brand: "", "Cluster/Branch": "", Kode: "", "Sudah Dipakai": "", "Dipakai Oleh": "" };
    const colW = [{ wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 7 }, { wch: 16 }, { wch: 18 }, { wch: 13 }, { wch: 22 }];

    const wb = XLSX.utils.book_new();
    const wsR = XLSX.utils.json_to_sheet(ringkasan);
    wsR["!cols"] = [{ wch: 40 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsR, "Ringkasan");
    const wsB = XLSX.utils.json_to_sheet(bsm.length ? bsm : [emptyRow]);
    wsB["!cols"] = colW;
    XLSX.utils.book_append_sheet(wb, wsB, "BSM");
    const wsC = XLSX.utils.json_to_sheet(cse.length ? cse : [emptyRow]);
    wsC["!cols"] = colW;
    XLSX.utils.book_append_sheet(wb, wsC, "CSE-RSE");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Kode_Otoritas_Sales_Sumatera_${stamp}.xlsx`);
    showToast("ok", `Excel diunduh — ${data.length} kode (Ringkasan, BSM, CSE-RSE).`);
  };

  // ── Badges ──────────────────────────────────────────────────────────────
  const roleBadge = (role) => {
    const isBsm = role === "bsm";
    return (
      <span style={{
        display: "inline-block", padding: "2px 9px", borderRadius: 6,
        fontSize: 10.5, fontWeight: 800, letterSpacing: .3, whiteSpace: "nowrap",
        background: isBsm ? t.magBg : t.blueBg,
        color:      isBsm ? t.mag   : t.blue,
        border: `1px solid ${isBsm ? t.magBd : t.blueBd}`,
      }}>{isBsm ? "BSM" : "CSE/RSE"}</span>
    );
  };

  const brandBadge = (brand) => (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 5,
      fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
      background: t.sub, color: t.mid, border: `1px solid ${t.line}`,
    }}>{brand}</span>
  );

  const statusBadge = (r) => {
    const used = r.is_registered;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
        background: used ? t.tealBg : t.amberBg,
        color:      used ? t.teal   : t.amber,
        border: `1px solid ${used ? t.tealBd : t.amberBd}`,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: used ? t.teal : t.amber }} />
        {used ? "Terpakai" : "Tersedia"}
      </span>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FF, color: t.hi }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: t.magBg, border: `1px solid ${t.magBd}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Key size={19} color={t.mag} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}>Kode Otoritas Sales</div>
            <div style={{ fontSize: 12.5, color: t.mid, marginTop: 1 }}>
              BSM &amp; CSE/RSE Sumatera · sumber tunggal <code style={{ fontFamily: MONO, fontSize: 11.5 }}>sales_access_codes</code>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              height: 38, padding: "0 16px", borderRadius: 9,
              background: t.sub, border: `1px solid ${t.line}`,
              color: t.hi, fontFamily: FF, fontSize: 13, fontWeight: 600,
              cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.7 : 1,
            }}
          >
            {syncing
              ? <Loader2 size={14} style={{ animation: "ko-spin 1s linear infinite" }} />
              : <RefreshCw size={14} color={t.mag} />}
            {syncing ? "Menyinkron…" : "Sinkron dari Territory"}
          </button>

          <button
            onClick={exportExcel}
            disabled={loading || filtered.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              height: 38, padding: "0 18px", borderRadius: 9,
              background: `linear-gradient(135deg, #C6168D, #ED1C24)`,
              border: "none", color: "#fff", fontFamily: FF,
              fontSize: 13, fontWeight: 700, letterSpacing: .1,
              cursor: filtered.length === 0 ? "default" : "pointer",
              opacity: filtered.length === 0 ? 0.55 : 1,
              boxShadow: "0 4px 14px rgba(198,22,141,.3)",
            }}
          >
            <Download size={14} /> Download Excel
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="ko-stats" style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <Stat label="Total Kode" value={stats.total} color={t.mag}   t={t} />
        <Stat label="BSM"        value={stats.bsm}   color={t.mag}   t={t} />
        <Stat label="CSE/RSE"    value={stats.cse}   color={t.blue}  t={t} />
        <Stat label="Terpakai"   value={stats.used}  color={t.teal}  t={t} />
        <Stat label="Tersedia"   value={stats.free}  color={t.amber} t={t} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{
          flex: "1 1 220px", display: "flex", alignItems: "center", gap: 8,
          background: t.sub, border: `1px solid ${t.line}`,
          borderRadius: 9, padding: "0 12px", height: 38, minWidth: 200,
        }}>
          <Search size={14} color={t.lo} />
          <input
            placeholder="Cari kode, cluster, branch, nama pengguna…"
            value={search} onChange={e => onSearch(e.target.value)}
            style={{ border: "none", background: "none", outline: "none", flex: 1, fontSize: 13, color: t.hi, fontFamily: FF }}
          />
          {search && <button onClick={() => onSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: t.lo }}><X size={12} /></button>}
        </div>
        <Select value={fRole}   onChange={onRole}   t={t} minWidth={120} options={[
          { value: "ALL", label: "Semua Role" }, { value: "bsm", label: "BSM" }, { value: "cse_rse", label: "CSE/RSE" }]} />
        <Select value={fBrand}  onChange={onBrand}  t={t} minWidth={110} options={[
          { value: "ALL", label: "Semua Brand" }, { value: "3ID", label: "3ID" }, { value: "IM3", label: "IM3" }]} />
        <Select value={fRegion} onChange={onRegion} t={t} minWidth={150} options={regionOpts.map(v => ({ value: v, label: v === "ALL" ? "Semua Region" : v }))} />
        <Select value={fArea}   onChange={onArea}   t={t} minWidth={150} options={areaOpts.map(v => ({ value: v, label: v === "ALL" ? "Semua Area" : v }))} />
        <Select value={fBranch} onChange={onBranch} t={t} minWidth={130} options={branchOpts.map(v => ({ value: v, label: v === "ALL" ? "Semua Branch" : v }))} />
        <Select value={fStatus} onChange={onStatus} t={t} minWidth={120} options={[
          { value: "ALL", label: "Semua Status" }, { value: "FREE", label: "Tersedia" }, { value: "USED", label: "Terpakai" }]} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 16, borderRadius: 12, background: t.redBg, border: `1px solid ${t.red}`, display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <AlertTriangle size={16} color={t.red} />
          <span style={{ fontSize: 13, color: t.red }}>{error}</span>
        </div>
      )}

      {/* Table */}
      <div style={{ borderRadius: 13, border: `1px solid ${t.line}`, overflow: "hidden", background: t.card, boxShadow: t.sm }}>
        <div className="ko-table-wrap" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 820 }}>
            <thead>
              <tr style={{ background: d ? "#1D1D22" : "#F4F6F8" }}>
                {["Kode", "Role", "Brand", "Cluster / Branch", "Branch", "Area", "Region", "Status", "Dipakai Oleh"].map(h => (
                  <th key={h} style={{
                    padding: "11px 14px", textAlign: "left", fontWeight: 700,
                    fontSize: 11, letterSpacing: .4, color: t.mid,
                    borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", color: t.mid }}>
                  <Loader2 size={22} style={{ animation: "ko-spin 1s linear infinite" }} />
                  <div style={{ marginTop: 8, fontSize: 13 }}>Memuat kode…</div>
                </td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", color: t.lo, fontSize: 13 }}>
                  Tidak ada kode yang cocok dengan filter.
                </td></tr>
              ) : pageRows.map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? t.card : (d ? "rgba(255,255,255,.02)" : "#FAFBFC"),
                  borderBottom: `1px solid ${t.line}`,
                }}>
                  <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: t.hi }}>{r.authority_code}</span>
                    <CopyBtn text={r.authority_code} t={t} />
                  </td>
                  <td style={{ padding: "9px 14px" }}>{roleBadge(r.role)}</td>
                  <td style={{ padding: "9px 14px" }}>{brandBadge(r.brand)}</td>
                  <td style={{ padding: "9px 14px", fontWeight: 600, color: t.hi, whiteSpace: "nowrap" }}>{r.scope_value}</td>
                  <td style={{ padding: "9px 14px", color: t.mid, whiteSpace: "nowrap" }}>{r.branch ?? "—"}</td>
                  <td style={{ padding: "9px 14px", color: t.mid, whiteSpace: "nowrap" }}>{r.area ?? "—"}</td>
                  <td style={{ padding: "9px 14px", color: t.mid, whiteSpace: "nowrap" }}>{r.region ?? "—"}</td>
                  <td style={{ padding: "9px 14px" }}>{statusBadge(r)}</td>
                  <td style={{ padding: "9px 14px", color: r.user_name ? t.hi : t.lo, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.user_name || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderTop: `1px solid ${t.line}`, flexWrap: "wrap", gap: 8,
          }}>
            <div style={{ fontSize: 12, color: t.mid }}>
              Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length} kode
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ display: "flex", alignItems: "center", height: 30, padding: "0 10px", borderRadius: 7, cursor: page === 1 ? "default" : "pointer", background: t.sub, border: `1px solid ${t.line}`, color: page === 1 ? t.lo : t.hi, opacity: page === 1 ? 0.5 : 1 }}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12.5, color: t.mid, fontWeight: 600, minWidth: 70, textAlign: "center" }}>Hal {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ display: "flex", alignItems: "center", height: 30, padding: "0 10px", borderRadius: 7, cursor: page === totalPages ? "default" : "pointer", background: t.sub, border: `1px solid ${t.line}`, color: page === totalPages ? t.lo : t.hi, opacity: page === totalPages ? 0.5 : 1 }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, display: "flex", alignItems: "center", gap: 10,
          padding: "12px 18px", borderRadius: 12, maxWidth: 440,
          background: toast.kind === "error" ? t.redBg : t.tealBg,
          border: `1px solid ${toast.kind === "error" ? t.red : t.tealBd}`,
          color: toast.kind === "error" ? t.red : t.teal,
          fontSize: 13, fontWeight: 600, boxShadow: t.md,
        }}>
          {toast.kind === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes ko-spin { to { transform: rotate(360deg); } }
        .ko-stats { grid-template-columns: repeat(5, 1fr); }
        @media (max-width: 720px) { .ko-stats { grid-template-columns: repeat(2, 1fr); } }
      `}</style>
    </div>
  );
}
