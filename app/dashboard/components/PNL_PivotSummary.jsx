"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import supabase from "../../../lib/supabase";
import {
  Search, Check, Filter, SortAsc, SortDesc, X,
  Eye, EyeOff, RotateCcw, Download, ChevronRight,
  ChevronDown, BarChart3, TrendingUp, TrendingDown,
  Minus, AlertCircle
} from "lucide-react";

// ─── formatters ───────────────────────────────────────────────────────────────
const fIDR = (v, compact = true) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const neg = v < 0;
  let str;
  if (compact) {
    if (abs >= 1_000_000_000) str = `${(abs / 1_000_000_000).toFixed(1)}M`;
    else if (abs >= 1_000_000) str = `${(abs / 1_000_000).toFixed(1)}Jt`;
    else if (abs >= 1_000) str = `${(abs / 1_000).toFixed(0)}rb`;
    else str = abs.toFixed(0);
  } else {
    str = new Intl.NumberFormat("id-ID").format(abs);
  }
  return neg ? `(${str})` : str;
};

const MONTHS = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI",
                "JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];
const MONTH_SHORT = ["JAN","FEB","MAR","APR","MEI","JUN","JUL","AGU","SEP","OKT","NOV","DES"];

// ─── Excel-style Filter Popover ───────────────────────────────────────────────
function ExcelFilter({ options = [], selected = [], onApply, onClear, sortDir, onSort, t, d }) {
  const [isOpen, setIsOpen]     = useState(false);
  const [searchTerm, setSearch] = useState("");
  const [tempSel, setTempSel]   = useState(selected);
  const [pos, setPos]           = useState({ x: 0, y: 0 });
  const [size, setSize]         = useState({ w: 220, h: 320 });
  const [drag, setDrag]         = useState(null);
  const startRef = useRef(null);
  const btnRef   = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const valid = selected.filter(v => options.some(o => o.value === v));
      setTempSel(valid);
    }
  }, [isOpen, options, selected]);

  const toggleOpen = () => {
    if (!isOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      let x = r.left, y = r.bottom + 5;
      if (x + size.w > window.innerWidth) x = window.innerWidth - size.w - 8;
      if (y + size.h > window.innerHeight) y = r.top - size.h - 5;
      setPos({ x, y });
    }
    setIsOpen(o => !o);
  };

  const startInteract = (e, type, dir = null) => {
    e.stopPropagation();
    setDrag({ type, dir });
    startRef.current = { mx: e.clientX, my: e.clientY, pos: { ...pos }, size: { ...size } };
  };

  useEffect(() => {
    if (!drag) return;
    const mm = (e) => {
      if (!startRef.current) return;
      const { mx, my, pos: sp, size: ss } = startRef.current;
      const dx = e.clientX - mx, dy = e.clientY - my;
      if (drag.type === "drag") { setPos({ x: sp.x + dx, y: sp.y + dy }); return; }
      let nW = ss.w, nH = ss.h, nX = sp.x, nY = sp.y;
      if (drag.dir?.includes("e")) nW = Math.max(180, ss.w + dx);
      if (drag.dir?.includes("s")) nH = Math.max(220, ss.h + dy);
      if (drag.dir?.includes("w")) { const d2 = Math.min(ss.w - 180, dx); nW = ss.w - d2; nX = sp.x + d2; }
      if (drag.dir?.includes("n")) { const d2 = Math.min(ss.h - 220, dy); nH = ss.h - d2; nY = sp.y + d2; }
      setPos({ x: nX, y: nY }); setSize({ w: nW, h: nH });
    };
    const mu = () => setDrag(null);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [drag]);

  const filtered = useMemo(() =>
    options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase())), [options, searchTerm]);
  const allSel = filtered.length > 0 && filtered.every(o => tempSel.includes(o.value));
  const toggleAll = () => {
    const vals = filtered.map(o => o.value);
    setTempSel(prev => allSel ? prev.filter(v => !vals.includes(v)) : [...new Set([...prev, ...vals])]);
  };

  const dp = isOpen ? (
    <div style={{
      position: "fixed", top: pos.y, left: pos.x, width: size.w, height: size.h,
      background: d ? "rgba(28,30,36,0.95)" : "rgba(255,255,255,0.96)",
      backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)",
      border: `1px solid ${d ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.11)"}`,
      borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
      zIndex: 2147483647, display: "flex", flexDirection: "column", overflow: "hidden",
      userSelect: drag ? "none" : "auto",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
    }}>
      {/* Title bar */}
      <div onMouseDown={e => startInteract(e, "drag")} style={{
        padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: drag?.type === "drag" ? "grabbing" : "grab",
        borderBottom: `1px solid ${d ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
        flexShrink: 0,
      }}>
        <button onClick={() => setIsOpen(false)} style={{
          width: 11, height: 11, borderRadius: "50%", background: "#FF5F57",
          border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}><X size={7} color="rgba(0,0,0,0.5)" /></button>
        <span style={{ fontSize: 10, fontWeight: 700, color: t.lo, letterSpacing: "0.06em" }}>FILTER</span>
        <div style={{ width: 11 }} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 10, overflow: "hidden" }}>
        {/* Sort */}
        <div style={{ display: "flex", gap: 5 }}>
          {[["asc", <SortAsc size={11}/>], ["desc", <SortDesc size={11}/>]].map(([dir, icon]) => (
            <button key={dir} onClick={() => onSort(dir)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              padding: "6px 0", borderRadius: 6, border: "none", fontSize: 10, fontWeight: 700,
              cursor: "pointer",
              background: sortDir === dir ? t.blue : d ? "rgba(255,255,255,0.08)" : "#E9E9EB",
              color: sortDir === dir ? "#fff" : t.hi,
            }}>
              {icon} {dir.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 5, padding: "0 7px",
          height: 26, borderRadius: 5, background: d ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
          border: `1px solid ${d ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          flexShrink: 0,
        }}>
          <Search size={11} style={{ color: t.lo }} />
          <input placeholder="Cari..." value={searchTerm} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 11, color: t.hi }} />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Select all */}
          <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 6px",
            borderRadius: 4, cursor: "pointer", borderBottom: `1px solid ${d ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`, marginBottom: 3 }}>
            <input type="checkbox" checked={allSel} onChange={toggleAll} style={{ display: "none" }} />
            <div style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0,
              border: `1.5px solid ${allSel ? t.blue : d ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}`,
              background: allSel ? t.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {allSel && <Check size={9} color="#fff" strokeWidth={3} />}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.hi }}>Semua</span>
          </label>
          {filtered.map(opt => {
            const sel = tempSel.includes(opt.value);
            return (
              <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 6px",
                borderRadius: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={sel}
                  onChange={() => setTempSel(p => sel ? p.filter(v => v !== opt.value) : [...p, opt.value])}
                  style={{ display: "none" }} />
                <div style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                  border: `1.5px solid ${sel ? t.blue : d ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}`,
                  background: sel ? t.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {sel && <Check size={9} color="#fff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: 11, color: t.hi }}>{opt.label}</span>
              </label>
            );
          })}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => { onClear(); setIsOpen(false); }} style={{
            flex: 1, padding: "6px 0", borderRadius: 6, border: "none",
            background: d ? "rgba(255,255,255,0.09)" : "#E5E5EA", color: t.hi, fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>Reset</button>
          <button onClick={() => { onApply(tempSel); setIsOpen(false); }} style={{
            flex: 2, padding: "6px 0", borderRadius: 6, border: "none",
            background: t.blue, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>Apply</button>
        </div>
      </div>

      {/* Resize handles */}
      {[
        { s: { bottom: 0, left: 0, right: 0, height: 5 }, c: "s-resize", d: "s" },
        { s: { top: 0, bottom: 0, right: 0, width: 5 }, c: "e-resize", d: "e" },
        { s: { bottom: 0, right: 0, width: 10, height: 10 }, c: "se-resize", d: "se" },
      ].map(({ s, c, d: dir }) => (
        <div key={dir} onMouseDown={e => startInteract(e, "resize", dir)}
          style={{ position: "absolute", cursor: c, ...s }} />
      ))}
    </div>
  ) : null;

  return (
    <>
      <button ref={btnRef} onClick={toggleOpen} style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, borderRadius: 4, border: "none",
        background: selected.length > 0 ? t.blueBg : "transparent",
        color: selected.length > 0 ? t.blue : t.lo,
        cursor: "pointer", flexShrink: 0,
      }}>
        <Filter size={11} strokeWidth={2.5} />
        {selected.length > 0 && (
          <div style={{
            position: "absolute", top: -3, right: -3,
            width: 11, height: 11, borderRadius: 10,
            background: t.blue, color: "#fff",
            fontSize: 7, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
          }}>{selected.length}</div>
        )}
      </button>
      {typeof document !== "undefined" && createPortal(dp, document.body)}
    </>
  );
}

// ─── Column Header with filter ────────────────────────────────────────────────
function ColHeader({ label, colKey, filters, sorts, allOptions, onFilter, onSort, onToggleHide, t, d }) {
  const sel = filters[colKey] || [];
  const sortDir = sorts[colKey];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, userSelect: "none" }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
        color: t.mid, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ position: "relative" }}>
        <ExcelFilter
          options={allOptions[colKey] || []}
          selected={sel}
          onApply={v => onFilter(colKey, v)}
          onClear={() => onFilter(colKey, [])}
          sortDir={sortDir}
          onSort={dir => onSort(colKey, dir)}
          t={t} d={d}
        />
      </div>
      <button onClick={() => onToggleHide(colKey)} title="Sembunyikan kolom" style={{
        background: "none", border: "none", cursor: "pointer", color: t.lo, display: "flex",
        padding: 0, flexShrink: 0,
      }}>
        <EyeOff size={10} />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PNL_PivotSummary({ theme, activeYear }) {
  const d = theme === "dark";

  const t = {
    bg:      d ? "#07090D" : "#F2F2F7",
    card:    d ? "#0D1019" : "#FFFFFF",
    sub:     d ? "#131826" : "#F5F5F8",
    header:  d ? "#0A0D16" : "#EAEAF0",
    line:    d ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)",
    lineH:   d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)",
    hi:      d ? "#EEF0F5" : "#1A1A1E",
    mid:     d ? "#8892A4" : "#4B5563",
    lo:      d ? "#424D60" : "#9CA3AF",
    blue:    "#0A84FF",
    blueBg:  d ? "rgba(10,132,255,0.11)" : "rgba(10,132,255,0.07)",
    blueBd:  d ? "rgba(10,132,255,0.26)" : "rgba(10,132,255,0.18)",
    green:   d ? "#2ED158" : "#16A34A",
    greenBg: d ? "rgba(46,209,88,0.08)" : "rgba(22,163,74,0.06)",
    red:     d ? "#FF453A" : "#DC2626",
    redBg:   d ? "rgba(255,69,58,0.08)" : "rgba(220,38,38,0.06)",
    amber:   d ? "#FFD60A" : "#D97706",
    inputBg: d ? "rgba(255,255,255,0.05)" : "#FFFFFF",
    inputBd: d ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.13)",
  };

  const [raw, setRaw]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // Column filter state: { region: [], partner: [], mpc: [], branch: [] }
  const [filters, setFilters]   = useState({});
  const [sorts, setSorts]       = useState({});
  const [hiddenCols, setHidden] = useState(new Set());
  const [expandedRows, setExpanded] = useState(new Set()); // "partnerKey" → all branches shown
  const [collapsedGroups, setCollapsed] = useState(new Set()); // collapse partner group
  const [tooltipVal, setTooltip] = useState(null); // { x, y, value, label }

  // Which months to show (based on data + year)
  const [visibleMonths, setVisibleMonths] = useState(new Set(MONTHS));

  // ── Fetch all pnl_reports for the year ───────────────────────────────────
  useEffect(() => {
    if (!activeYear) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("pnl_reports")
          .select(`partner_name, branch, mpc_mp3, month, year,
                   grand_total_revenue, grand_total_pengeluaran,
                   is_finalized, validation_notes`)
          .eq("year", activeYear);
        if (err) throw err;
        setRaw(data || []);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [activeYear]);

  // ── Build pivot data ──────────────────────────────────────────────────────
  // Structure: rows keyed by (partner_name + branch + mpc_mp3)
  // Each row has REV / EXP / P/L per month + YTD
  const { rows, regionMap } = useMemo(() => {
    const map = {}; // key → { partner, branch, mpc, months: {MON: {rev, exp}} }
    const regionMap = {}; // partner → region (if available in masterData)

    raw.forEach(r => {
      const key = `${r.partner_name}|||${r.branch}|||${r.mpc_mp3}`;
      if (!map[key]) map[key] = { partner: r.partner_name, branch: r.branch, mpc: r.mpc_mp3, months: {} };
      map[key].months[r.month.toUpperCase()] = {
        rev: Number(r.grand_total_revenue) || 0,
        exp: Number(r.grand_total_pengeluaran) || 0,
        finalized: r.is_finalized,
      };
    });

    return { rows: Object.values(map), regionMap };
  }, [raw]);

  // ── Faceted filter options ────────────────────────────────────────────────
  // Options for each column based on the OTHER columns' current filters
  const filterOptions = useMemo(() => {
    const applyExcept = (skipCol) => rows.filter(r => {
      return Object.entries(filters).every(([col, sel]) => {
        if (col === skipCol || !sel.length) return true;
        if (col === "partner") return sel.includes(r.partner);
        if (col === "branch")  return sel.includes(r.branch);
        if (col === "mpc")     return sel.includes(r.mpc);
        return true;
      });
    });

    const uniq = (arr, fn) => [...new Set(arr.map(fn))].sort().map(v => ({ value: v, label: v }));
    return {
      partner: uniq(applyExcept("partner"), r => r.partner),
      branch:  uniq(applyExcept("branch"),  r => r.branch),
      mpc:     uniq(applyExcept("mpc"),     r => r.mpc),
    };
  }, [rows, filters]);

  // ── Apply filters + sort ──────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let list = rows.filter(r => {
      if (filters.partner?.length && !filters.partner.includes(r.partner)) return false;
      if (filters.branch?.length  && !filters.branch.includes(r.branch))   return false;
      if (filters.mpc?.length     && !filters.mpc.includes(r.mpc))         return false;
      return true;
    });

    // Sort
    const sortEntries = Object.entries(sorts).filter(([, d]) => d);
    if (sortEntries.length) {
      const [col, dir] = sortEntries[0];
      list = [...list].sort((a, b) => {
        let va = a[col === "partner" ? "partner" : col === "branch" ? "branch" : "mpc"] || "";
        let vb = b[col === "partner" ? "partner" : col === "branch" ? "branch" : "mpc"] || "";
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }, [rows, filters, sorts]);

  // ── Group by partner ──────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const g = {};
    filteredRows.forEach(r => {
      if (!g[r.partner]) g[r.partner] = { partner: r.partner, branches: [] };
      g[r.partner].branches.push(r);
    });
    return Object.values(g);
  }, [filteredRows]);

  // ── Month columns to render ───────────────────────────────────────────────
  const activeMths = useMemo(() =>
    MONTHS.filter(m => visibleMonths.has(m)), [visibleMonths]);

  // ── YTD calc ─────────────────────────────────────────────────────────────
  const ytd = (monthsData) => {
    let rev = 0, exp = 0;
    activeMths.forEach(m => {
      const md = monthsData[m];
      if (md) { rev += md.rev; exp += md.exp; }
    });
    return { rev, exp, pl: rev - exp };
  };

  // ── handlers ─────────────────────────────────────────────────────────────
  const onFilter = useCallback((col, vals) => {
    setFilters(f => ({ ...f, [col]: vals }));
  }, []);
  const onSort = useCallback((col, dir) => {
    setSorts(s => ({ ...s, [col]: s[col] === dir ? null : dir }));
  }, []);
  const onToggleHide = useCallback(col => {
    setHidden(h => { const n = new Set(h); n.has(col) ? n.delete(col) : n.add(col); return n; });
  }, []);
  const clearAll = () => {
    setFilters({}); setSorts({}); setHidden(new Set()); setCollapsed(new Set());
    setVisibleMonths(new Set(MONTHS));
  };
  const togglePartner = (partner) => {
    setCollapsed(s => { const n = new Set(s); n.has(partner) ? n.delete(partner) : n.add(partner); return n; });
  };

  // ── Column visibility ─────────────────────────────────────────────────────
  const FIXED_COLS = ["partner", "mpc", "branch"]; // always visible metadata cols
  const colVisible = (col) => !hiddenCols.has(col);
  const activeFilterCount = Object.values(filters).filter(v => v.length).length
    + Object.values(sorts).filter(Boolean).length;

  // ── Cell renderer ─────────────────────────────────────────────────────────
  const CellPL = ({ val, compact = true, showSign = false }) => {
    if (val === null || val === undefined) return <span style={{ color: t.lo }}>—</span>;
    const pos = val >= 0;
    const isZero = val === 0;
    return (
      <span style={{
        color: isZero ? t.lo : pos ? t.green : t.red,
        fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 12,
      }}>
        {showSign && !isZero && (pos ? "+" : "")}
        {fIDR(val, compact)}
      </span>
    );
  };

  const CellREV = ({ val }) => (
    <span style={{ color: t.hi, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
      {val ? fIDR(val) : "—"}
    </span>
  );
  const CellEXP = ({ val }) => (
    <span style={{ color: val > 0 ? t.amber : t.lo, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
      {val ? `(${fIDR(val)})` : "—"}
    </span>
  );

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const hdr = ["Partner", "MPC/MP3", "Branch", "Metric",
      ...activeMths.map(m => MONTH_SHORT[MONTHS.indexOf(m)]), "YTD"].join(",");
    const lines = [hdr];
    grouped.forEach(g => {
      g.branches.forEach(b => {
        const yt = ytd(b.months);
        ["REV","EXP","P/L"].forEach(metric => {
          const vals = activeMths.map(m => {
            const md = b.months[m];
            if (!md) return "";
            if (metric === "REV") return md.rev;
            if (metric === "EXP") return md.exp;
            return md.rev - md.exp;
          });
          const ytVal = metric === "REV" ? yt.rev : metric === "EXP" ? yt.exp : yt.pl;
          lines.push([b.partner, b.mpc, b.branch, metric, ...vals, ytVal].join(","));
        });
      });
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `PNL_Summary_${activeYear}.csv`; a.click();
  };

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const Tooltip = () => tooltipVal ? (
    <div style={{
      position: "fixed", top: tooltipVal.y + 14, left: tooltipVal.x,
      background: d ? "#1A1D26" : "#fff",
      border: `1px solid ${t.line}`, borderRadius: 8,
      padding: "8px 12px", zIndex: 9999, boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      pointerEvents: "none",
    }}>
      <div style={{ fontSize: 11, color: t.mid, marginBottom: 3 }}>{tooltipVal.label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>
        Rp {new Intl.NumberFormat("id-ID").format(Math.abs(tooltipVal.value))}
        {tooltipVal.value < 0 && <span style={{ color: t.red }}> (Rugi)</span>}
      </div>
    </div>
  ) : null;

  // ── Column header cell style ──────────────────────────────────────────────
  const TH = ({ children, width, align = "right", sticky = false, stickyLeft }) => (
    <th style={{
      padding: "10px 10px", textAlign: align,
      background: d ? "#0A0D16" : "#EAEAF0",
      position: sticky ? "sticky" : "static",
      left: stickyLeft,
      zIndex: sticky ? 10 : "auto",
      width, minWidth: width,
      whiteSpace: "nowrap",
      borderBottom: `1.5px solid ${t.blue}`,
      borderRight: `1px solid ${t.line}`,
    }}>
      {children}
    </th>
  );

  // ── Row cell ──────────────────────────────────────────────────────────────
  const TD = ({ children, bg, align = "right", width, sticky = false, stickyLeft, border = true }) => (
    <td style={{
      padding: "7px 10px", textAlign: align,
    background: bg || (d ? "#0D1019" : "#FFFFFF"),
      position: sticky ? "sticky" : "static",
      left: stickyLeft,
      zIndex: sticky ? 5 : "auto",
      width, minWidth: width,
      borderBottom: `1px solid ${t.lineH}`,
      borderRight: border ? `1px solid ${t.lineH}` : "none",
      verticalAlign: "middle",
    }}>
      {children}
    </td>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 360, gap: 14 }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: t.blue, display: "flex", alignItems: "center", justifyContent: "center", animation: "pivot-breathe 1.8s ease-in-out infinite" }}>
        <BarChart3 size={22} color="#fff" />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: t.mid }}>Memuat data pivot...</span>
      <style>{`@keyframes pivot-breathe { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.36;transform:scale(.9);} }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 24px", borderRadius: 12, background: t.redBg, border: `1px solid ${t.red}20` }}>
      <AlertCircle size={20} style={{ color: t.red }} />
      <span style={{ fontSize: 14, color: t.red }}>{error}</span>
    </div>
  );

  const stickyPartnerW = 200;
  const stickyMpcW     = 60;
  const stickyBranchW  = 160;

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
      WebkitFontSmoothing: "antialiased", color: t.hi,
    }}>
      <Tooltip />

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        {/* Title */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi }}>
            Pivot P&L Summary
          </div>
          <div style={{ fontSize: 12, color: t.mid, marginTop: 3 }}>
            {filteredRows.length} branch · {grouped.length} partner · {activeYear}
          </div>
        </div>

        {/* Active filters badge */}
        {activeFilterCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
            borderRadius: 99, background: t.blueBg, border: `1px solid ${t.blueBd}`,
            fontSize: 11, fontWeight: 700, color: t.blue }}>
            <Filter size={11} /> {activeFilterCount} filter aktif
          </div>
        )}

        {/* Month toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {MONTH_SHORT.map((ms, i) => {
            const mFull = MONTHS[i];
            const on = visibleMonths.has(mFull);
            const hasData = raw.some(r => r.month.toUpperCase() === mFull);
            return (
              <button key={ms} onClick={() => {
                setVisibleMonths(prev => { const n = new Set(prev); n.has(mFull) ? n.delete(mFull) : n.add(mFull); return n; });
              }} style={{
                padding: "4px 7px", borderRadius: 5, border: "none",
                fontSize: 10, fontWeight: 700, cursor: "pointer",
                background: on ? (hasData ? t.blue : t.blueBg) : (d ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"),
                color: on ? (hasData ? "#fff" : t.blue) : t.lo,
                opacity: hasData ? 1 : 0.45,
              }}>{ms}</button>
            );
          })}
        </div>

        {/* Hidden cols indicator */}
        {hiddenCols.size > 0 && (
          <button onClick={() => setHidden(new Set())} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 11px", borderRadius: 7, border: `1px solid ${t.line}`,
            background: t.sub, color: t.mid, cursor: "pointer",
            fontSize: 11, fontWeight: 600,
          }}>
            <Eye size={12} /> Tampilkan semua ({hiddenCols.size})
          </button>
        )}

        {/* Clear all */}
        <button onClick={clearAll} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 11px", borderRadius: 7, border: `1px solid ${t.line}`,
          background: t.sub, color: t.mid, cursor: "pointer",
          fontSize: 11, fontWeight: 600,
        }}>
          <RotateCcw size={12} /> Clear
        </button>

        {/* Export */}
        <button onClick={exportCSV} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 12px", borderRadius: 7, border: "none",
          background: t.blue, color: "#fff", cursor: "pointer",
          fontSize: 11, fontWeight: 700,
          boxShadow: `0 2px 8px rgba(10,132,255,${d ? 0.36 : 0.22})`,
        }}>
          <Download size={12} /> Export CSV
        </button>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
        {[
          { color: t.hi,    label: "REV — Pendapatan" },
          { color: t.amber, label: "EXP — Pengeluaran" },
          { color: t.green, label: "P/L Positif" },
          { color: t.red,   label: "P/L Negatif" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
            <span style={{ fontSize: 10, color: t.lo }}>{l.label}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 10, color: t.lo }}>
          Hover sel untuk nilai penuh · Klik ▶ untuk expand/collapse
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{
        borderRadius: 12, border: `1px solid ${t.line}`,
        background: t.card, boxShadow: `0 1px 3px rgba(0,0,0,${d ? 0.5 : 0.07})`,
        overflow: "auto", maxHeight: "calc(100vh - 340px)",
      }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: stickyPartnerW + stickyMpcW + stickyBranchW + activeMths.length * 3 * 80 + 240 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
            {/* Month row */}
            <tr>
              <TH width={stickyPartnerW} sticky stickyLeft={0} align="left">
                {!hiddenCols.has("partner") && (
                  <ColHeader label="Partner" colKey="partner" filters={filters} sorts={sorts}
                    allOptions={filterOptions} onFilter={onFilter} onSort={onSort}
                    onToggleHide={onToggleHide} t={t} d={d} />
                )}
                {hiddenCols.has("partner") && <span style={{ fontSize: 9, color: t.lo }}>—</span>}
              </TH>
              {!hiddenCols.has("mpc") && (
                <TH width={stickyMpcW} sticky stickyLeft={stickyPartnerW} align="left">
                  <ColHeader label="Tipe" colKey="mpc" filters={filters} sorts={sorts}
                    allOptions={filterOptions} onFilter={onFilter} onSort={onSort}
                    onToggleHide={onToggleHide} t={t} d={d} />
                </TH>
              )}
              {!hiddenCols.has("branch") && (
                <TH width={stickyBranchW} sticky stickyLeft={stickyPartnerW + (hiddenCols.has("mpc") ? 0 : stickyMpcW)} align="left">
                  <ColHeader label="Branch" colKey="branch" filters={filters} sorts={sorts}
                    allOptions={filterOptions} onFilter={onFilter} onSort={onSort}
                    onToggleHide={onToggleHide} t={t} d={d} />
                </TH>
              )}

              {/* Month group headers */}
              {activeMths.map(m => {
                const ms = MONTH_SHORT[MONTHS.indexOf(m)];
                const hasData = raw.some(r => r.month.toUpperCase() === m);
                return (
                  <th key={m} colSpan={3} style={{
                    padding: "10px 8px", textAlign: "center",
                    background: d ? "#0A0D16" : "#EAEAF0",
                    borderBottom: `1.5px solid ${t.blue}`,
                    borderLeft: `1px solid ${t.line}`,
                    borderRight: `1px solid ${t.line}`,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, letterSpacing: "0.10em",
                      color: hasData ? t.blue : t.lo,
                    }}>{ms}</span>
                  </th>
                );
              })}

              {/* YTD header */}
              <th colSpan={3} style={{
                padding: "10px 8px", textAlign: "center",
                background: d ? "#0D1226" : "#E0E4F0",
                borderBottom: `1.5px solid ${t.blue}`,
                borderLeft: `2px solid ${t.blue}`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.10em", color: t.blue }}>YTD</span>
              </th>
            </tr>

            {/* Sub-header: REV / EXP / P/L per month */}
            <tr>
              <th style={{ background: d ? "#0A0D16" : "#EAEAF0", position: "sticky", left: 0, zIndex: 11, borderBottom: `1px solid ${t.line}` }} />
              {!hiddenCols.has("mpc") && <th style={{ background: d ? "#0A0D16" : "#EAEAF0", position: "sticky", left: stickyPartnerW, zIndex: 11, borderBottom: `1px solid ${t.line}` }} />}
              {!hiddenCols.has("branch") && <th style={{ background: d ? "#0A0D16" : "#EAEAF0", position: "sticky", left: stickyPartnerW + (hiddenCols.has("mpc") ? 0 : stickyMpcW), zIndex: 11, borderBottom: `1px solid ${t.line}` }} />}

              {activeMths.map(m => (
                <React.Fragment key={m}>
                  {["REV","EXP","P/L"].map((sub, si) => (
                    <th key={sub} style={{
                      padding: "5px 8px", textAlign: "right",
                      background: d ? "#0A0D16" : "#EAEAF0",
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                      color: si === 0 ? t.mid : si === 1 ? t.amber : t.green,
                      borderBottom: `1px solid ${t.line}`,
                      borderLeft: si === 0 ? `1px solid ${t.line}` : "none",
                      borderRight: si === 2 ? `1px solid ${t.line}` : "none",
                      minWidth: 74, width: 74,
                    }}>{sub}</th>
                  ))}
                </React.Fragment>
              ))}
              {["REV","EXP","P/L"].map((sub, si) => (
                <th key={sub} style={{
                  padding: "5px 8px", textAlign: "right",
                  background: d ? "#0D1226" : "#E0E4F0",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                  color: si === 0 ? t.mid : si === 1 ? t.amber : t.green,
                  borderBottom: `1px solid ${t.line}`,
                  borderLeft: si === 0 ? `2px solid ${t.blue}` : "none",
                  minWidth: 82, width: 82,
                }}>{sub}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {grouped.length === 0 && (
              <tr><td colSpan={99} style={{ padding: "48px 0", textAlign: "center", color: t.lo, fontSize: 14 }}>
                Tidak ada data untuk filter yang dipilih.
              </td></tr>
            )}

            {grouped.map((g, gi) => {
              const collapsed = collapsedGroups.has(g.partner);
              // Partner YTD aggregated
              const partnerYTD = { rev: 0, exp: 0 };
              g.branches.forEach(b => {
                const yt = ytd(b.months);
                partnerYTD.rev += yt.rev; partnerYTD.exp += yt.exp;
              });
              const partnerPL = partnerYTD.rev - partnerYTD.exp;
              // Per-month partner totals
              const partnerMth = {};
              activeMths.forEach(m => {
                let rev = 0, exp = 0;
                g.branches.forEach(b => { const md = b.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
                partnerMth[m] = { rev, exp };
              });

           const rowBg = gi % 2 === 0
  ? (d ? "#0F1220" : "#F8F8FB")
  : (d ? "#0D1019" : "#FFFFFF");

              return (
                <React.Fragment key={g.partner}>
                  {/* Partner group header row */}
<tr style={{ background: d ? "#091428" : "#E8F0FF" }}>                    <TD sticky stickyLeft={0} align="left" bg={d ? "rgba(10,132,255,0.10)" : "rgba(10,132,255,0.07)"}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => togglePartner(g.partner)} style={{
                          background: "none", border: "none", cursor: "pointer", color: t.blue, padding: 0,
                          display: "flex", alignItems: "center",
                        }}>
                          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em", color: t.hi }}>
                          {g.partner}
                        </span>
                        <span style={{ fontSize: 10, color: t.lo }}>({g.branches.length} branch)</span>
                      </div>
                    </TD>
                    {!hiddenCols.has("mpc") && <TD sticky stickyLeft={stickyPartnerW} bg={d ? "rgba(10,132,255,0.10)" : "rgba(10,132,255,0.07)"}>
                      <span style={{ fontSize: 10, color: t.lo }}>—</span>
                    </TD>}
                    {!hiddenCols.has("branch") && <TD sticky stickyLeft={stickyPartnerW + (hiddenCols.has("mpc") ? 0 : stickyMpcW)} bg={d ? "rgba(10,132,255,0.10)" : "rgba(10,132,255,0.07)"}>
                      <span style={{ fontSize: 10, color: t.lo }}>Subtotal</span>
                    </TD>}

                    {activeMths.map(m => {
                      const md = partnerMth[m];
                      const pl = md.rev - md.exp;
                      return (
                        <React.Fragment key={m}>
                          <TD><CellREV val={md.rev} /></TD>
                          <TD><CellEXP val={md.exp} /></TD>
                          <TD border><CellPL val={pl} /></TD>
                        </React.Fragment>
                      );
                    })}
                    <TD bg={d ? "rgba(10,132,255,0.14)" : "rgba(10,132,255,0.09)"}
                      style={{ borderLeft: "2px solid " + t.blue }}>
                      <CellREV val={partnerYTD.rev} />
                    </TD>
                    <TD bg={d ? "rgba(10,132,255,0.14)" : "rgba(10,132,255,0.09)"}>
                      <CellEXP val={partnerYTD.exp} />
                    </TD>
                    <TD bg={d ? "#0C1B32" : "#D0E4FF"}border={false}>
                      <CellPL val={partnerPL} />
                    </TD>
                  </tr>

                  {/* Branch rows */}
                  {!collapsed && g.branches.map((b, bi) => {
                    const yt = ytd(b.months);
                    const rows3 = [
                      { label: "REV", key: "rev", color: t.hi },
                      { label: "EXP", key: "exp", color: t.amber },
                      { label: "P/L", key: "pl", color: null }, // dynamic
                    ];
                    return (
                      <React.Fragment key={b.branch + b.mpc}>
                        {rows3.map((row, ri) => {
                          const isFirst = ri === 0;
                          const isLast  = ri === 2;
                          const subBg = isLast
                            ? (d ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.02)")
                            : rowBg;
                          return (
                            <tr key={row.label} style={{ background: subBg }}>
                              {/* Partner cell — only on first sub-row of first branch */}
                              {isFirst ? (
                                <TD align="left" bg={rowBg} sticky stickyLeft={0}>
                                  {bi === 0 && <span style={{ fontSize: 10, color: t.lo, fontStyle: "italic" }}>{g.partner}</span>}
                                </TD>
                              ) : (
                                <TD align="left" bg={rowBg} sticky stickyLeft={0} />
                              )}

                              {/* MPC */}
                              {!hiddenCols.has("mpc") && (
                                isFirst ? (
                                  <TD align="left" bg={rowBg} sticky stickyLeft={stickyPartnerW}>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                                      color: b.mpc === "MPC" ? t.blue : t.green,
                                      padding: "2px 6px", borderRadius: 4,
                                      background: b.mpc === "MPC" ? t.blueBg : t.greenBg,
                                    }}>{b.mpc}</span>
                                  </TD>
                                ) : (
                                  <TD bg={rowBg} sticky stickyLeft={stickyPartnerW} />
                                )
                              )}

                              {/* Branch */}
                              {!hiddenCols.has("branch") && (
                                isFirst ? (
                                  <TD align="left" bg={rowBg} sticky stickyLeft={stickyPartnerW + (hiddenCols.has("mpc") ? 0 : stickyMpcW)}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: t.hi }}>{b.branch}</span>
                                  </TD>
                                ) : (
                                  <TD bg={rowBg} sticky stickyLeft={stickyPartnerW + (hiddenCols.has("mpc") ? 0 : stickyMpcW)}>
                                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: row.color || t.mid }}>{row.label}</span>
                                  </TD>
                                )
                              )}

                              {/* Month cells */}
                              {activeMths.map(m => {
                                const md = b.months[m];
                                let cellVal = null;
                                if (md) {
                                  if (row.key === "rev") cellVal = md.rev;
                                  else if (row.key === "exp") cellVal = md.exp;
                                  else cellVal = md.rev - md.exp;
                                }
                                return (
                                  <React.Fragment key={m}>
                                    {row.key === "rev" && bi === 0 && ri === 0 && (
                                      // only render for first branch's first row
                                      <></>
                                    )}
                                    <td
                                      colSpan={isFirst ? 1 : 1}
                                      onMouseEnter={e => cellVal !== null && setTooltip({
                                        x: e.clientX, y: e.clientY,
                                        value: cellVal,
                                        label: `${b.partner} · ${b.branch} · ${m} · ${row.label}`,
                                      })}
                                      onMouseLeave={() => setTooltip(null)}
                                      style={{
                                        padding: "6px 10px", textAlign: "right",
                                        borderBottom: isLast ? `1px solid ${t.line}` : `1px solid ${t.lineH}`,
                                        borderLeft: "none",
                                        borderRight: `1px solid ${t.lineH}`,
                                        width: 74, minWidth: 74,
                                        cursor: cellVal !== null ? "help" : "default",
                                        background: "transparent",
                                      }}
                                    >
                                      {cellVal === null ? <span style={{ color: t.lo, fontSize: 10 }}>—</span>
                                        : row.key === "rev" ? <CellREV val={cellVal} />
                                        : row.key === "exp" ? <CellEXP val={cellVal} />
                                        : <CellPL val={cellVal} />}
                                    </td>
                                  </React.Fragment>
                                );
                              })}

                              {/* YTD cells */}
                              {(() => {
                                let ytdVal;
                                if (row.key === "rev") ytdVal = yt.rev;
                                else if (row.key === "exp") ytdVal = yt.exp;
                                else ytdVal = yt.pl;
                                return (
                                  <td
                                    onMouseEnter={e => setTooltip({
                                      x: e.clientX, y: e.clientY,
                                      value: ytdVal,
                                      label: `${b.partner} · ${b.branch} · YTD · ${row.label}`,
                                    })}
                                    onMouseLeave={() => setTooltip(null)}
                                    style={{
                                      padding: "6px 10px", textAlign: "right",
                                      background: d ? "rgba(10,132,255,0.055)" : "rgba(10,132,255,0.035)",
                                      borderBottom: isLast ? `1px solid ${t.blue}20` : `1px solid ${t.lineH}`,
                                      borderLeft: `2px solid ${t.blue}`,
                                      width: 82, minWidth: 82,
                                      cursor: "help",
                                    }}
                                  >
                                    {row.key === "rev" ? <CellREV val={ytdVal} />
                                      : row.key === "exp" ? <CellEXP val={ytdVal} />
                                      : <CellPL val={ytdVal} />}
                                  </td>
                                );
                              })()}
                              {/* Pad remaining 2 YTD cols on non-first sub-rows via empty tds */}
                              {ri === 0 && <td style={{ background: d ? "rgba(10,132,255,0.055)" : "rgba(10,132,255,0.035)", width: 82 }} />}
                              {ri === 0 && <td style={{ background: d ? "rgba(10,132,255,0.055)" : "rgba(10,132,255,0.035)", width: 82 }} />}
                              {ri === 1 && <td style={{ background: d ? "rgba(10,132,255,0.055)" : "rgba(10,132,255,0.035)", width: 82 }} />}
                              {ri === 1 && <td style={{ background: d ? "rgba(10,132,255,0.055)" : "rgba(10,132,255,0.035)", width: 82 }} />}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>

          {/* Footer totals */}
          {filteredRows.length > 0 && (
            <tfoot style={{ position: "sticky", bottom: 0, zIndex: 15 }}>
              {["REV","EXP","P/L"].map((metric, mi) => {
                return (
                  <tr key={metric} style={{background: d ? "#0A1628" : "#D6E8FF"
 }}>
                    {mi === 0 ? (
                      <td style={{ padding: "8px 12px", position: "sticky", left: 0, zIndex: 16, background: d ? "#0A1628" : "#D6E8FF"   // untuk 0.16
 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: t.blue, letterSpacing: "0.04em" }}>GRAND TOTAL</span>
                      </td>
                    ) : (
                      <td style={{ position: "sticky", left: 0, zIndex: 16, background: d ? "#0C1830" : "#DDE9FF"   // untuk 0.13
}}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: t.mid, paddingLeft: 12 }}>{metric}</span>
                      </td>
                    )}
                    {!hiddenCols.has("mpc") && <td style={{ background: d ? "rgba(10,132,255,0.13)" : "rgba(10,132,255,0.09)", position: "sticky", left: stickyPartnerW, zIndex: 16 }} />}
                    {!hiddenCols.has("branch") && <td style={{ background: d ? "rgba(10,132,255,0.13)" : "rgba(10,132,255,0.09)", position: "sticky", left: stickyPartnerW + (hiddenCols.has("mpc") ? 0 : stickyMpcW), zIndex: 16 }} />}

                    {activeMths.map(m => {
                      let total = 0;
                      filteredRows.forEach(r => {
                        const md = r.months[m];
                        if (md) {
                          if (metric === "REV") total += md.rev;
                          else if (metric === "EXP") total += md.exp;
                          else total += md.rev - md.exp;
                        }
                      });
                      return (
                        <React.Fragment key={m}>
                          {metric === "REV" ? <><td style={{ padding: "7px 10px", textAlign: "right", borderLeft: `1px solid ${t.blueBd}` }}><CellREV val={total} /></td><td /><td style={{ borderRight: `1px solid ${t.blueBd}` }} /></>
                          : metric === "EXP" ? <><td style={{ padding: "7px 10px", textAlign: "right", borderLeft: `1px solid ${t.blueBd}` }} /><td style={{ padding: "7px 10px", textAlign: "right" }}><CellEXP val={total} /></td><td style={{ borderRight: `1px solid ${t.blueBd}` }} /></>
                          : <><td style={{ borderLeft: `1px solid ${t.blueBd}` }} /><td /><td style={{ padding: "7px 10px", textAlign: "right", borderRight: `1px solid ${t.blueBd}` }}><CellPL val={total} /></td></>}
                        </React.Fragment>
                      );
                    })}
                    {/* YTD grand total */}
                    {(() => {
                      let totRev = 0, totExp = 0;
                      filteredRows.forEach(r => { activeMths.forEach(m => { const md = r.months[m]; if (md) { totRev += md.rev; totExp += md.exp; } }); });
                      const totPl = totRev - totExp;
                      return metric === "REV" ? (
                        <><td style={{ padding: "7px 10px", textAlign: "right", borderLeft: `2px solid ${t.blue}`, background: d ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.12)" }}><CellREV val={totRev} /></td><td style={{ background: d ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.12)" }} /><td style={{ background: d ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.12)" }} /></>
                      ) : metric === "EXP" ? (
                        <><td style={{ borderLeft: `2px solid ${t.blue}`,background: d ? "#0D1F3C" : "#C8DCFF"   // untuk 0.2
 }} /><td style={{ padding: "7px 10px", textAlign: "right", background: d ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.12)" }}><CellEXP val={totExp} /></td><td style={{ background: d ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.12)" }} /></>
                      ) : (
                        <><td style={{ borderLeft: `2px solid ${t.blue}`, background: d ? "#0A1628" : "#D6E8FF"   }} /><td style={{ background: d ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.12)" }} /><td style={{ padding: "7px 10px", textAlign: "right", background: d ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.12)" }}><CellPL val={totPl} /></td></>
                      );
                    })()}
                  </tr>
                );
              })}
            </tfoot>
          )}
        </table>
      </div>

      {/* Footnote */}
      <div style={{ marginTop: 12, fontSize: 11, color: t.lo, display: "flex", alignItems: "center", gap: 16 }}>
        <span>Data dari <strong style={{ color: t.mid }}>pnl_reports</strong> · Nilai dalam Rupiah, disingkat untuk keterbacaan</span>
        <span>YTD = Year-to-Date berdasarkan bulan yang ditampilkan</span>
      </div>
    </div>
  );
}