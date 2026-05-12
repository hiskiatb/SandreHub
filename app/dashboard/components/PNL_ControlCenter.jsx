"use client";
import ExcelFilter from "./ExcelFilter"; // Sesuaikan path-nya
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import supabase from "../../../lib/supabase";
import {
  Search, CheckCircle2, Circle, Loader2,
  ChevronDown, ChevronUp, ChevronsUpDown,
  Filter, X, AlertCircle, GripVertical
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"
];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

// ─── Design Tokens ────────────────────────────────────────────────────────────
const tk = (d) => ({
  appBg:    d ? "#080A0F"                        : "#EEEEF3",
  surface:  d ? "#0C0E14"                        : "#F8F8FA",
  card:     d ? "#111520"                        : "#FFFFFF",
  thead:    d ? "#111520"                        : "#F2F2F5",
  row:      d ? "#0C0E14"                        : "#FFFFFF",
  rowAlt:   d ? "#0F1117"                        : "#F9F9FB",
  rowHov:   d ? "rgba(10,132,255,0.08)"          : "rgba(10,132,255,0.06)",

  line:     d ? "rgba(255,255,255,0.08)"         : "rgba(0,0,0,0.10)",
  lineH:    d ? "rgba(255,255,255,0.05)"         : "rgba(0,0,0,0.06)",

  hi:       d ? "#EDEDF2"                        : "#18181B",
  mid:      d ? "#7C7C84"                        : "#52525B",
  lo:       d ? "#3A3A42"                        : "#A1A1AA",

  blue:     "#0A84FF",
  blueBg:   d ? "rgba(10,132,255,0.13)"          : "rgba(10,132,255,0.09)",
  blueBd:   d ? "rgba(10,132,255,0.30)"          : "rgba(10,132,255,0.22)",

  green:    d ? "#30D158"                        : "#16A34A",
  greenBg:  d ? "rgba(48,209,88,0.12)"           : "rgba(22,163,74,0.10)",

  amber:    d ? "#FFD60A"                        : "#D97706",
  amberBg:  d ? "rgba(255,214,10,0.12)"          : "rgba(217,119,6,0.10)",

  red:      d ? "#FF453A"                        : "#DC2626",
  redBg:    d ? "rgba(255,69,58,0.11)"           : "rgba(220,38,38,0.08)",

  inputBg:  d ? "rgba(255,255,255,0.06)"         : "#FFFFFF",
  inputBd:  d ? "rgba(255,255,255,0.10)"         : "rgba(0,0,0,0.14)",

  shadow:   d ? "0 1px 3px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.05)"
              : "0 1px 3px rgba(0,0,0,0.08),0 0 0 1px rgba(0,0,0,0.06)",
  shadowLg: d ? "0 16px 48px rgba(0,0,0,0.7)"   : "0 16px 48px rgba(0,0,0,0.14)",
});

// ─── Resizable column hook ────────────────────────────────────────────────────
function useColWidths(initial) {
  const [widths, setWidths] = useState(initial);
  const dragging = useRef(null);

  const startResize = useCallback((colIdx, e) => {
    e.preventDefault();
    dragging.current = { colIdx, startX: e.clientX, startW: widths[colIdx] };
    const onMove = (ev) => {
      if (!dragging.current) return;
      const delta = ev.clientX - dragging.current.startX;
      const newW  = Math.max(50, dragging.current.startW + delta);
      setWidths(prev => { const n = [...prev]; n[dragging.current.colIdx] = newW; return n; });
    };
    const onUp = () => {
      dragging.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [widths]);

  return [widths, startResize];
}

// ─── Column Filter Dropdown (cascading-aware) ─────────────────────────────────
function ColFilterDropdown({ options, selected, onToggle, onClear, t, triggerEl }) {
  const [open, setOpen] = useState(false);
  const ref  = useRef(null);
  const isActive = selected.length > 0;

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        style={{
          display: "flex", alignItems: "center", gap: 3,
          padding: "2px 6px", borderRadius: 5,
          border: `1px solid ${isActive ? t.blueBd : "transparent"}`,
          background: isActive ? t.blueBg : "transparent",
          cursor: "pointer", outline: "none",
          color: isActive ? t.blue : t.lo,
          transition: "all 0.12s",
        }}
      >
        <Filter size={10} />
        {isActive && <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}>{selected.length}</span>}
      </button>

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: "50%",
            transform: "translateX(-50%)",
            background: t.card, border: `1px solid ${t.line}`,
            borderRadius: 10, boxShadow: t.shadowLg,
            zIndex: 300, minWidth: 170, padding: 4,
          }}
        >
          {isActive && (
            <>
              <button
                onClick={() => { onClear(); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, border: "none",
                  background: "transparent", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, color: t.mid, transition: "background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = t.rowHov}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <X size={11} /><span>Hapus Filter</span>
              </button>
              <div style={{ height: 1, background: t.line, margin: "3px 0" }} />
            </>
          )}
          {options.length === 0
            ? <div style={{ padding: "10px 12px", fontSize: 12, color: t.lo, textAlign: "center" }}>Tidak ada opsi</div>
            : options.map(opt => {
                const checked = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => onToggle(opt.value)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 9,
                      padding: "8px 10px", borderRadius: 7, border: "none",
                      background: checked ? t.blueBg : "transparent",
                      cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = t.rowHov; }}
                    onMouseLeave={e => { if (!checked) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      border: `1.5px solid ${checked ? t.blue : t.lo}`,
                      background: checked ? t.blue : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.12s",
                    }}>
                      {checked && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: checked ? t.blue : t.hi, whiteSpace: "nowrap" }}>
                      {opt.label}
                    </span>
                    {opt.dot && (
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: opt.dot, marginLeft: "auto", flexShrink: 0 }} />
                    )}
                  </button>
                );
              })
          }
        </div>
      )}
    </div>
  );
}

// ─── Sort Icon ────────────────────────────────────────────────────────────────
function SortIcon({ active, dir, t }) {
  if (!active) return <ChevronsUpDown size={11} style={{ color: t.lo, flexShrink: 0 }} />;
  return dir === "asc"
    ? <ChevronUp   size={11} style={{ color: t.blue, flexShrink: 0 }} />
    : <ChevronDown size={11} style={{ color: t.blue, flexShrink: 0 }} />;
}

// ─── Resize Handle ────────────────────────────────────────────────────────────
function ResizeHandle({ onMouseDown, t }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "absolute", right: 0, top: 0, bottom: 0,
        width: 4, cursor: "col-resize", zIndex: 5,
        background: hov ? t.blue : "transparent",
        transition: "background 0.12s",
      }}
    />
  );
}

// ─── Status Cell ─────────────────────────────────────────────────────────────
function StatusCell({ status, t, onClick }) {
  const cfg = {
    FINALIZED: { bg: t.greenBg, icon: <CheckCircle2 size={17} style={{ color: t.green }} />, tip: "Finalized" },
    DRAFT:     { bg: t.amberBg, icon: <div style={{ width: 9, height: 9, borderRadius: "50%", background: t.amber }} />, tip: "Draft" },
    EMPTY:     { bg: "transparent", icon: <Circle size={15} style={{ color: t.lo, opacity: 0.45 }} />, tip: "Kosong" },
  };
  const c = cfg[status] || cfg.EMPTY;
  return (
    <button
      onClick={onClick} title={c.tip}
      style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: c.bg, border: "none", cursor: "pointer",
        transition: "filter 0.12s",
      }}
      onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.18)"}
      onMouseLeave={e => e.currentTarget.style.filter = "brightness(1)"}
    >
      {c.icon}
    </button>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function PNLControlCenter({ theme, masterData, activeYear, activeMonth, onOpenBranch }) {
  const d = theme === "dark";
  const t = tk(d);

  // ── State ────────────────────────────────────────────────────────────────
  const [statusMap, setStatusMap] = useState({});
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [sortCol,   setSortCol]   = useState("partner");
  const [sortDir,   setSortDir]   = useState("asc");

  // Multi-select cascading filters
  const [fType,     setFType]     = useState([]);
  const [fPartner,  setFPartner]  = useState([]);
  const [fBranch,   setFBranch]   = useState([]);
  const [fRegion,   setFRegion]   = useState([]);
const [fDoneCount, setFDoneCount] = useState([]); 
// UBAH LEBARNYA (Tambahkan satu nilai di depan)
const COL_INIT = [72, 110, 190, 190, 72, ...Array(12).fill(46)];
const colWidths = COL_INIT;
  // ── Cutoff: activeMonth drives how many months are shown ─────────────────
  const cutoffIdx = MONTHS.indexOf(activeMonth ?? "Desember");
  const visibleMonthCount = cutoffIdx >= 0 ? cutoffIdx + 1 : 12;
  const visibleMonths     = MONTHS.slice(0, visibleMonthCount);
  const visibleShorts     = MONTH_SHORT.slice(0, visibleMonthCount);

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("pnl_reports")
        .select("partner_name,branch,mpc_mp3,month,year,is_finalized")
        .eq("year", activeYear);
      if (!error) {
        const map = {};
        (data || []).forEach(item => {
          const key = [item.partner_name, item.branch, item.mpc_mp3, item.month, item.year].join("|");
          map[key] = item;
        });
        setStatusMap(map);
      }
      setLoading(false);
    })();
  }, [activeYear]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getStatus = (row, month) => {
    const key  = [row.partner_name, row.branch_name, row.mpc_mp3, month, activeYear].join("|");
    const item = statusMap[key];
    if (!item) return "EMPTY";
    return item.is_finalized ? "FINALIZED" : "DRAFT";
  };

  const toggle = (setter) => (val) =>
    setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(p => p === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

const clearAll = () => { setSearch(""); setFType([]); setFRegion([]); setFPartner([]); setFBranch([]); setFDoneCount([]); };  
// UBAH MENJADI:
const hasFilter = Boolean(search || fType.length || fRegion.length || fPartner.length || fBranch.length || fDoneCount.length);  // ── Build rows with visible-month statuses ────────────────────────────────
  const allRows = useMemo(() =>
    masterData.map(row => ({
      ...row,
      statuses: visibleMonths.map(m => getStatus(row, m)),
    })),
  [masterData, statusMap, visibleMonths]);

  // ── Cascading filter options ──────────────────────────────────────────────
  // typeOptions: all unique types
  const typeOptions = useMemo(() => {
    const vals = [...new Set(masterData.map(r => r.mpc_mp3).filter(Boolean))].sort();
    return vals.map(v => ({ value: v, label: v }));
  }, [masterData]);

  // partnerOptions: filtered by fType selection
  const partnerOptions = useMemo(() => {
    let list = masterData;
    if (fType.length > 0) list = list.filter(r => fType.includes(r.mpc_mp3));
    const vals = [...new Set(list.map(r => r.partner_name).filter(Boolean))].sort();
    return vals.map(v => ({ value: v, label: v }));
  }, [masterData, fType]);

  // branchOptions: filtered by fType + fPartner
  const branchOptions = useMemo(() => {
    let list = masterData;
    if (fType.length > 0)    list = list.filter(r => fType.includes(r.mpc_mp3));
    if (fPartner.length > 0) list = list.filter(r => fPartner.includes(r.partner_name));
    const vals = [...new Set(list.map(r => r.branch_name).filter(Boolean))].sort();
    return vals.map(v => ({ value: v, label: v }));
  }, [masterData, fType, fPartner]);

  // TAMBAHKAN DI BAWAH typeOptions
const regionOptions = useMemo(() => {
  const vals = [...new Set(masterData.map(r => r.region).filter(Boolean))].sort();
  return vals.map(v => ({ value: v, label: v }));
}, [masterData]);

const doneCountOptions = useMemo(() => {
  const counts = [...new Set(allRows.map(r => r.statuses.filter(s => s === "FINALIZED").length))].sort((a, b) => a - b);
  return counts.map(c => ({ value: c, label: String(c) }));
}, [allRows]);

  // statusOptions with dots
  const statusOptions = [
    { value: "FINALIZED", label: "Finalized", dot: t.green },
    { value: "DRAFT",     label: "Draft",     dot: t.amber },
    { value: "EMPTY",     label: "Kosong",    dot: t.lo    },
  ];

  // ── Final filtered + sorted rows ─────────────────────────────────────────
  const rows = useMemo(() => {
    let list = allRows;

    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        r.partner_name?.toLowerCase().includes(s) ||
        r.branch_name?.toLowerCase().includes(s)  ||
        r.mpc_mp3?.toLowerCase().includes(s)
      );
    }
    if (fType.length > 0)    list = list.filter(r => fType.includes(r.mpc_mp3));
    if (fPartner.length > 0) list = list.filter(r => fPartner.includes(r.partner_name));
   if (fBranch.length > 0)  list = list.filter(r => fBranch.includes(r.branch_name));
if (fRegion.length > 0)  list = list.filter(r => fRegion.includes(r.region)); // Tambahkan ini
if (fDoneCount.length > 0) { // Logika numeric baru
  list = list.filter(r => {
    const finalizedCount = r.statuses.filter(s => s === "FINALIZED").length;
    return fDoneCount.includes(finalizedCount);
  });
}
    list = [...list].sort((a, b) => {
      if (sortCol === "type")    return sortDir === "asc" ? (a.mpc_mp3||"").localeCompare(b.mpc_mp3||"")         : (b.mpc_mp3||"").localeCompare(a.mpc_mp3||"");
      if (sortCol === "partner") return sortDir === "asc" ? (a.partner_name||"").localeCompare(b.partner_name||"") : (b.partner_name||"").localeCompare(a.partner_name||"");
      if (sortCol === "branch")  return sortDir === "asc" ? (a.branch_name||"").localeCompare(b.branch_name||"")  : (b.branch_name||"").localeCompare(a.branch_name||"");
      if (sortCol === "done") {
        const av = a.statuses.filter(s => s === "FINALIZED").length;
        const bv = b.statuses.filter(s => s === "FINALIZED").length;
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return 0;
    });
    return list;
// UBAH MENJADI:
}, [allRows, search, fType, fPartner, fBranch, fRegion, fDoneCount, sortCol, sortDir]);
  // ── Stats (based on visible months × filtered rows) ───────────────────────
  const totalCells = rows.length * visibleMonthCount;
  const finalCells = rows.reduce((a, r) => a + r.statuses.filter(s => s === "FINALIZED").length, 0);
  const draftCells = rows.reduce((a, r) => a + r.statuses.filter(s => s === "DRAFT").length, 0);
  const emptyCells = totalCells - finalCells - draftCells;
  const pct        = totalCells > 0 ? Math.round((finalCells / totalCells) * 100) : 0;

  // ── TH component ─────────────────────────────────────────────────────────
  // ─── Perbaikan Komponen TH (Baris ~260) ─────────────────────────────────────────
const TH = ({ colIdx, sortKey, children, align = "left", filterConfig }) => {
  const isActiveSort = sortCol === sortKey;
  return (
    <th
      style={{
        position: "sticky", 
        top: 0, 
        zIndex: 20, // Naikkan z-index agar lebih tinggi dari sel bulan (11)
        width: colWidths[colIdx], 
        minWidth: colWidths[colIdx],
        padding: "0 14px", 
        height: 42, 
        textAlign: align,
        fontSize: 11, 
        fontWeight: 700, 
        letterSpacing: "0.07em",
        textTransform: "uppercase", 
        color: isActiveSort ? t.blue : t.mid,
        background: t.thead, 
        borderBottom: `1px solid ${t.line}`,
        borderRight: `1px solid ${t.lineH}`, 
        whiteSpace: "nowrap",
        overflow: "visible", // KRITIKAL: Ubah dari 'hidden' ke 'visible'
      }}
    >
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        width: "100%",
        overflow: "visible" // Pastikan container dalam juga tidak memotong
      }}>
        <span style={{ 
          overflow: "hidden", 
          textOverflow: "ellipsis",
          marginRight: "8px" 
        }}>
          {children}
        </span>
        {filterConfig && (
          <ExcelFilter 
            {...filterConfig}
            t={t} d={d}
          />
        )}
      </div>
    </th>
  );
};
  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Title */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: t.blue, marginBottom: 6 }}>
          Laporan Tahun {activeYear}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, marginBottom: 5 }}>
          PNL Control Center
        </h1>
        <p style={{ fontSize: 14, color: t.mid }}>
          Data s.d. <strong style={{ color: t.hi, fontWeight: 600 }}>{activeMonth} {activeYear}</strong>
          {" · "}{rows.length} branch aktif
        </p>
      </div>

      {/* Summary cards — 2×2 grid */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">        {[
          {
            label: "Pencapaian",
            value: `${pct}%`,
            sub: `${finalCells} dari ${totalCells} laporan selesai`,
            color: t.green, bg: t.greenBg,
          },
          {
            label: "Finalized",
            value: finalCells,
            sub: "laporan telah difinalisasi",
            color: t.green, bg: t.greenBg,
          },
          {
            label: "Draft",
            value: draftCells,
            sub: "laporan belum difinalisasi",
            color: t.amber, bg: t.amberBg,
          },
          {
            label: "Belum Diisi",
            value: emptyCells,
            sub: "laporan kosong",
            color: t.mid, bg: "transparent",
          },
].map(c => (
    <div key={c.label} style={{
      padding: "18px 20px", borderRadius: 12,
      border: `1px solid ${t.line}`, background: t.card,
      boxShadow: t.shadow,
    }}>
      {/* Isi Card Tetap Sama */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, marginBottom: 10 }}>
        {c.label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", color: c.color, lineHeight: 1 }}>
        {c.value}
      </div>
      <div style={{
        fontSize: 12, marginTop: 7, fontWeight: 500,
        color: d ? "#9CA3AF" : "#4B5563",
      }}>
        {c.sub}
      </div>
    </div>
  ))}
</div>

      {/* Progress bar */}
      <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, padding: "16px 20px", boxShadow: t.shadow }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.mid }}>
            Progress s.d. {activeMonth}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: t.line, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 99, background: t.green, width: `${pct}%`, transition: "width 0.6s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 11, color: d ? "#9CA3AF" : "#6B7280" }}>
            {finalCells} finalized · {draftCells} draft · {emptyCells} kosong
          </span>
          <span style={{ fontSize: 11, color: d ? "#9CA3AF" : "#6B7280" }}>
            {visibleMonthCount} bulan ditampilkan
          </span>
        </div>
      </div>

{/* Toolbar */}
<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
  {/* Search Input tetap di sini */}
  <div style={{
    display: "flex", alignItems: "center", gap: 8,
    flex: "1 1 200px", minWidth: 160,
    border: `1px solid ${t.inputBd}`, borderRadius: 10,
    background: t.inputBg, height: 40, padding: "0 14px",
  }}>
    <Search size={15} style={{ color: t.mid, flexShrink: 0 }} />
    <input
      placeholder="Cari partner, branch..."
      value={search}
      onChange={e => setSearch(e.target.value)}
      style={{
        flex: 1, background: "transparent", border: "none",
        fontSize: 13, fontWeight: 500, color: t.hi,
        outline: "none", minWidth: 0,
      }}
    />
  </div>

  {/* Tombol Hapus Filter Baru - Hanya muncul jika ada filter aktif */}
  {hasFilter && (
    <button 
      onClick={clearAll} 
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "0 16px", height: 40, borderRadius: 10,
        background: d ? "rgba(255, 69, 58, 0.1)" : "#FEE2E2",
        border: `1px solid ${d ? "rgba(255, 69, 58, 0.2)" : "#FECACA"}`,
        cursor: "pointer", transition: "all 0.2s",
        color: t.red, fontSize: 13, fontWeight: 600,
      }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
      onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
    >
      <X size={16} strokeWidth={2.5} />
      <span>Reset Semua Filter</span>
    </button>
  )}

  <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: t.lo }}>
    {rows.length} Branch Terdeteksi
  </div>
</div>

      {/* Table */}
      <div style={{
        borderRadius: 12, border: `1px solid ${t.line}`,
        background: t.card, overflow: "hidden", boxShadow: t.shadow,
      }}>
        {/* Legend */}
        <div style={{
          display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
          padding: "10px 18px", borderBottom: `1px solid ${t.line}`,
          background: t.thead,
        }}>
          {[
            { label: "Finalized", color: t.green, dot: <CheckCircle2 size={12} /> },
            { label: "Draft",     color: t.amber, dot: <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.amber }} /> },
            { label: "Kosong",    color: t.lo,    dot: <Circle size={12} style={{ opacity: 0.5 }} /> },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: l.color, display: "flex" }}>{l.dot}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.mid }}>{l.label}</span>
            </div>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 11, color: d ? "#9CA3AF" : "#6B7280" }}>
            Klik sel bulan untuk membuka laporan
          </div>
        </div>

        {loading ? (
          <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={26} style={{ color: t.blue, animation: "cc-spin 1s linear infinite" }} />
            <style>{`@keyframes cc-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <AlertCircle size={26} style={{ color: t.lo }} />
            <span style={{ fontSize: 14, color: t.mid }}>Tidak ada data yang cocok</span>
            {hasFilter && (
              <button onClick={clearAll} style={{ fontSize: 13, color: t.blue, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Hapus semua filter
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "60vh" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
              <colgroup>
                {colWidths.slice(0, 4 + visibleMonthCount).map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>

              <thead>
  <tr>
    {/* Kolom Tipe */}
    <TH colIdx={0} sortKey="type" filterConfig={{
      label: "Tipe",
      options: typeOptions,
      selected: fType,
      onApply: (vals) => setFType(vals),
      onClear: () => setFType([]),
      sortDir: sortCol === "type" ? sortDir : null,
      onSort: (dir) => { setSortCol("type"); setSortDir(dir); }
    }}>Tipe</TH>

    {/* Kolom Partner */}
    <TH colIdx={1} sortKey="partner" filterConfig={{
      label: "Partner",
      options: partnerOptions,
      selected: fPartner,
      onApply: (vals) => { setFPartner(vals); setFBranch([]); },
      onClear: () => { setFPartner([]); setFBranch([]); },
      sortDir: sortCol === "partner" ? sortDir : null,
      onSort: (dir) => { setSortCol("partner"); setSortDir(dir); }
    }}>Partner</TH>

    {/* Kolom Kantor Cabang */}
    <TH colIdx={2} sortKey="branch" filterConfig={{
      label: "Kantor Cabang",
      options: branchOptions,
      selected: fBranch,
      onApply: (vals) => setFBranch(vals),
      onClear: () => setFBranch([]),
      sortDir: sortCol === "branch" ? sortDir : null,
      onSort: (dir) => { setSortCol("branch"); setSortDir(dir); }
    }}>Kantor Cabang</TH>

{/* TAMBAHKAN KOLOM REGION DI SINI */}
    <TH colIdx={3} sortKey="region" filterConfig={{
      label: "Region",
      options: regionOptions,
      selected: fRegion,
      onApply: (vals) => setFRegion(vals),
      onClear: () => setFRegion([]),
      sortDir: sortCol === "region" ? sortDir : null,
      onSort: (dir) => { setSortCol("region"); setSortDir(dir); }
    }}>Region</TH>

    {/* Kolom Selesai */}
    {/* UBAH FILTER SELESAI MENJADI NUMERIK */}
    <TH colIdx={4} sortKey="done" filterConfig={{
      label: "Jumlah Selesai",
      options: doneCountOptions,
      selected: fDoneCount,
      onApply: (vals) => setFDoneCount(vals),
      onClear: () => setFDoneCount([]),
      sortDir: sortCol === "done" ? sortDir : null,
      onSort: (dir) => { setSortCol("done"); setSortDir(dir); }
    }}>Selesai</TH>



    {/* Kolom Bulan-bulan (Tetap sama seperti kode Anda sebelumnya) */}
   {visibleMonths.map((month, i) => {
  const isActive = month === activeMonth;
  return (
    <th key={month} style={{
      position: "sticky", top: 0, zIndex: 11,
      width: colWidths[4 + i], minWidth: colWidths[4 + i],
      padding: "0 4px", height: 42, textAlign: "center",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
      textTransform: "uppercase", 
      
      // PERBAIKAN: Gunakan background solid (t.thead atau warna khusus)
      background: isActive 
        ? (d ? "#1E2533" : "#F3F4F6") // Warna solid pembeda bulan aktif
        : t.thead,                  // Warna solid standard header
        
      borderBottom: isActive ? `2px solid ${t.blue}` : `1px solid ${t.line}`,
      borderRight: `1px solid ${t.lineH}`,
      whiteSpace: "nowrap", userSelect: "none", overflow: "hidden",
    }}>
      <div style={{ position: "relative" }}>
        <span style={{ color: isActive ? t.blue : t.mid }}>
          {visibleShorts[i]}
        </span>
      </div>
    </th>
  );
})}
  </tr>
</thead>

              <tbody>
                {rows.map((row, idx) => {
                  const finCount = row.statuses.filter(s => s === "FINALIZED").length;
                  const isEven   = idx % 2 === 0;
                  const rowBg    = isEven ? t.row : t.rowAlt;

                  return (
                    <tr
                      key={`${row.partner_name}|${row.branch_name}|${row.mpc_mp3}`}
                      style={{ borderTop: `1px solid ${t.lineH}`, background: rowBg, transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = t.rowHov}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}
                    >
                      {/* Type */}
                      <td style={{ padding: "9px 14px", borderRight: `1px solid ${t.lineH}`, overflow: "hidden" }}>
                        <span style={{
                          display: "inline-block", padding: "3px 8px", borderRadius: 5,
                          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                          background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}`,
                          whiteSpace: "nowrap",
                        }}>
                          {row.mpc_mp3}
                        </span>
                      </td>

                      {/* Partner */}
                      <td style={{ padding: "9px 14px", borderRight: `1px solid ${t.lineH}`, overflow: "hidden" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em" }}>
                          {row.partner_name}
                        </div>
                      </td>

                      {/* Branch */}
                      <td style={{ padding: "9px 14px", borderRight: `1px solid ${t.lineH}`, overflow: "hidden" }}>
                        <div style={{ fontSize: 12, color: t.mid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row.branch_name}
                        </div>
                      </td>

                      <td style={{ padding: "9px 14px", borderRight: `1px solid ${t.lineH}`, overflow: "hidden" }}>
    <div style={{ fontSize: 12, color: t.mid, whiteSpace: "nowrap" }}>
      {row.region}
    </div>
  </td>

                      {/* Done count */}
                      <td style={{ padding: "9px 14px", textAlign: "center", borderRight: `1px solid ${t.lineH}` }}>
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          color: finCount === visibleMonthCount ? t.green : finCount > 0 ? t.amber : t.lo,
                        }}>
                          {finCount}
                          <span style={{ fontSize: 11, fontWeight: 500, color: d ? "#6B7280" : "#9CA3AF" }}>
                            /{visibleMonthCount}
                          </span>
                        </span>
                      </td>

                      {/* Month cells */}
                      {visibleMonths.map((month, mi) => (
                        <td key={month} style={{
                          padding: "5px 3px", textAlign: "center",
                          borderRight: `1px solid ${t.lineH}`,
                          background: month === activeMonth
                            ? (d ? "rgba(10,132,255,0.05)" : "rgba(10,132,255,0.04)")
                            : undefined,
                        }}>
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <StatusCell
                              status={row.statuses[mi]}
                              t={t}
                              onClick={e => {
                                e.stopPropagation();
                                onOpenBranch({
                                  partner_name: row.partner_name,
                                  branch_name:  row.branch_name,
                                  mpc_mp3:      row.mpc_mp3,
                                  month,
                                  year: activeYear,
                                });
                              }}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}