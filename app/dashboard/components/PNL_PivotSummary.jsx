"use client";

/* ──────────────────────────────────────────────────────────────────────────────
   PNL_PivotSummary — professional, restrained palette
   Brand color used sparingly: one teal accent (YTD column + primary CTA),
   one red accent (Pendapatan KPI top-line only).
   Everything else: clean neutral typography, no rainbow decoration.
────────────────────────────────────────────────────────────────────────────── */

import React, { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import supabase from "../../../lib/supabase";
import {
  Search, Check, ChevronDown, ChevronRight, X,
  RotateCcw, Download, Calendar, BarChart3, AlertCircle,
  TrendingUp, TrendingDown, Wallet,
} from "lucide-react";

// ─── Brand palette — used sparingly ──────────────────────────────────────────
const B = {
  teal:    "#32BCAD",
  red:     "#ED1C24",
  yellow:  "#FFCB05",
  magenta: "#C6168D",
};

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_FULL  = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI",
                      "JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,system-ui,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace`;

// ─── Formatters ───────────────────────────────────────────────────────────────
const fNum = (v) => {
  if (v === null || v === undefined || isNaN(v) || v === 0) return "—";
  const abs = Math.abs(v);
  let s;
  if (abs >= 1_000_000_000)  s = (abs / 1_000_000_000).toFixed(2) + "M";
  else if (abs >= 1_000_000) s = (abs / 1_000_000).toFixed(0) + "Jt";
  else if (abs >= 1_000)     s = (abs / 1_000).toFixed(0) + "rb";
  else                       s = abs.toFixed(0);
  return v < 0 ? "−" + s : s;
};
const fFull = (v) =>
  v == null ? "—" : `Rp ${new Intl.NumberFormat("id-ID").format(Math.abs(v))}${v < 0 ? "  (Loss)" : ""}`;

// Abbreviate partner name
const STOPWORDS = new Set(["PT","CV","TBK","PERSERO","DAN","AND","THE","OF","INDONESIA","INTERNATIONAL","GROUP"]);
const abbreviatePartner = (name) => {
  if (!name) return "—";
  const cleaned = name.replace(/[().,]/g," ").replace(/\s+/g," ").trim().toUpperCase();
  const words = cleaned.split(" ").filter(w => w && !STOPWORDS.has(w));
  if (!words.length) return cleaned.slice(0, 4);
  const letters = words.map(w => w[0]).join("");
  return letters.length > 5 ? letters.slice(0, 5) : letters;
};

// ─── Design tokens — neutral-first ───────────────────────────────────────────
const tk = (d) => ({
  bg:      d ? "#0C0D0F" : "#F3F4F6",
  panel:   d ? "#141618" : "#FFFFFF",
  panel2:  d ? "#1C1E22" : "#F5F5F7",
  hover:   d ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
  line:    d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)",
  line2:   d ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",

  ink:     d ? "#F0F1F3" : "#16181C",
  ink2:    d ? "#C8CDD8" : "#3A3C42",
  mute:    d ? "#98A0B0" : "#6A6E7A",
  mute2:   d ? "#6A7080" : "#959AA6",
  faint:   d ? "#363C48" : "#D4D6DC",

  // Teal: primary accent — YTD, export, active sort
  teal:    B.teal,
  tealBg:  d ? "rgba(50,188,173,0.10)" : "rgba(50,188,173,0.07)",
  tealBd:  d ? "rgba(50,188,173,0.22)" : "rgba(50,188,173,0.16)",
  tealTx:  d ? "#32BCAD" : "#1A9E90",

  // Red: minimal usage — Pendapatan KPI top accent only
  red:     B.red,
  redBg:   d ? "rgba(237,28,36,0.08)" : "rgba(237,28,36,0.05)",
  redBd:   d ? "rgba(237,28,36,0.20)" : "rgba(237,28,36,0.12)",

  // Neutral chip bg for filter pills
  chipBg:  d ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
  chipBd:  d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
  chipAct: d ? "rgba(50,188,173,0.12)"  : "rgba(50,188,173,0.08)",
  chipActBd:d? "rgba(50,188,173,0.26)"  : "rgba(50,188,173,0.20)",

  // P&L result tones
  pos:     d ? "#2ED158" : "#16A34A",
  posBg:   d ? "rgba(46,209,88,0.10)"   : "rgba(22,163,74,0.06)",
  neg:     d ? "#FF6961" : "#C92A2A",
  negBg:   d ? "rgba(255,105,97,0.10)"  : "rgba(201,42,42,0.06)",
});

// ─── Popover portal ───────────────────────────────────────────────────────────
function Pop({ anchor, open, onClose, children, w = 280, t, d }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor?.current) return;
    const r = anchor.current.getBoundingClientRect();
    let left = r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top: r.bottom + 6, left });
  }, [open, anchor, w]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current?.contains(e.target) || anchor?.current?.contains(e.target)) return;
      onClose();
    };
    const k = (e) => e.key === "Escape" && onClose();
    const id = setTimeout(() => document.addEventListener("mousedown", h), 0);
    document.addEventListener("keydown", k);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open, onClose, anchor]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} style={{
      position: "fixed", top: pos.top, left: pos.left, width: w,
      background: t.panel, border: `1px solid ${t.line}`, borderRadius: 10,
      boxShadow: d ? "0 12px 36px rgba(0,0,0,0.60)" : "0 12px 36px rgba(0,0,0,0.12)",
      zIndex: 2147483646, overflow: "hidden", fontFamily: FONT, color: t.ink,
    }}>{children}</div>,
    document.body
  );
}

// ─── FilterChip — neutral with teal active ────────────────────────────────────
function FilterChip({ label, options, selected, onChange, sortDir, onSort, t, d }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btn = useRef(null);
  const active = selected.length > 0 || !!sortDir;

  const filtered = useMemo(() => options.filter(o => o.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const allSel = filtered.length > 0 && filtered.every(o => selected.includes(o));
  const toggleAll = () => onChange(allSel ? selected.filter(s => !filtered.includes(s)) : [...new Set([...selected, ...filtered])]);
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);

  return (
    <>
      <button ref={btn} onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 32, padding: "0 11px", borderRadius: 8,
        border: `1px solid ${active ? t.chipActBd : t.chipBd}`,
        background: active ? t.chipAct : t.chipBg,
        color: active ? t.tealTx : t.ink2,
        fontSize: 12.5, fontWeight: 500, cursor: "pointer",
        fontFamily: FONT, letterSpacing: "-0.005em", transition: "all .14s",
      }}>
        <span style={{ color: active ? t.tealTx : t.mute, fontSize: 12 }}>{label}</span>
        {selected.length > 0
          ? <span style={{ fontWeight: 700, color: active ? t.tealTx : t.ink }}>{selected.length === 1 ? selected[0] : `${selected.length}`}</span>
          : <span style={{ color: t.mute2, fontWeight: 400 }}>Semua</span>}
        <ChevronDown size={11} strokeWidth={2} />
      </button>

      <Pop anchor={btn} open={open} onClose={() => setOpen(false)} w={272} t={t} d={d}>
        {/* Sort row */}
        <div style={{ display: "flex", borderBottom: `1px solid ${t.line2}` }}>
          {[["asc","A→Z"],["desc","Z→A"]].map(([dir, lbl]) => {
            const on = sortDir === dir;
            return (
              <button key={dir} onClick={() => onSort(on ? null : dir)} style={{
                flex: 1, height: 32, border: "none",
                background: on ? t.chipAct : "transparent",
                color: on ? t.tealTx : t.mute,
                fontSize: 12, fontWeight: on ? 600 : 500, cursor: "pointer", fontFamily: FONT,
                borderRight: dir === "asc" ? `1px solid ${t.line2}` : "none",
              }}>{lbl}</button>
            );
          })}
        </div>
        {/* Search */}
        <div style={{ padding: "7px 9px", borderBottom: `1px solid ${t.line2}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 9px", background: t.panel2, border: `1px solid ${t.line}`, borderRadius: 7 }}>
            <Search size={12} color={t.mute2} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Cari ${label.toLowerCase()}…`}
              style={{ flex: 1, border: "none", background: "none", outline: "none", color: t.ink, fontSize: 12, fontFamily: FONT }} />
          </div>
        </div>
        {/* Options */}
        <div style={{ maxHeight: 240, overflowY: "auto", padding: "3px 0" }}>
          <ChipRow label="Semua" sel={allSel} onClick={toggleAll} emphasize count={filtered.length} t={t} />
          {filtered.map(o => <ChipRow key={o} label={o} sel={selected.includes(o)} onClick={() => toggle(o)} t={t} />)}
          {filtered.length === 0 && <div style={{ padding: "20px 14px", textAlign: "center", color: t.mute2, fontSize: 12 }}>Tidak ada hasil</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 9px", borderTop: `1px solid ${t.line2}`, background: t.panel2 }}>
          <button onClick={() => { onChange([]); onSort(null); }} style={{ border: "none", background: "none", color: t.mute, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Reset</button>
          <button onClick={() => setOpen(false)} style={{ height: 26, padding: "0 12px", border: `1px solid ${t.line}`, background: t.panel, borderRadius: 6, color: t.ink2, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONT }}>Tutup</button>
        </div>
      </Pop>
    </>
  );
}

function ChipRow({ label, sel, onClick, emphasize, count, t }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%",
      padding: "6px 11px", border: "none", background: "transparent", cursor: "pointer",
      color: emphasize ? t.ink : t.ink2, fontWeight: emphasize ? 600 : 400,
      textAlign: "left", fontSize: 12.5, fontFamily: FONT,
    }}
    onMouseEnter={e => e.currentTarget.style.background = t.hover}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <div style={{
        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
        background: sel ? t.teal : "transparent",
        border: `1px solid ${sel ? t.teal : t.faint}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {sel && <Check size={10} strokeWidth={3} color="#fff" />}
      </div>
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && <span style={{ color: t.mute2, fontSize: 11 }}>{count}</span>}
    </button>
  );
}

// ─── Month range picker — neutral with teal selected cells ────────────────────
function MonthRange({ available, selected, onChange, t, d }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const all = selected.length === available.length;

  const toggle = (m) => onChange(selected.includes(m) ? selected.filter(v => v !== m) : [...selected, m]);
  const setRange = (from, to) => onChange(available.slice(from, to + 1));

  return (
    <>
      <button ref={btn} onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 32, padding: "0 11px", borderRadius: 8,
        border: `1px solid ${!all ? t.chipActBd : t.chipBd}`,
        background: !all ? t.chipAct : t.chipBg,
        color: !all ? t.tealTx : t.ink2,
        fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: FONT, transition: "all .14s",
      }}>
        <Calendar size={12} strokeWidth={2} style={{ color: !all ? t.tealTx : t.mute }} />
        {all
          ? <span style={{ color: t.mute }}>{available.length} bulan</span>
          : <span style={{ fontWeight: 700 }}>{selected.length}/{available.length} bulan</span>}
        <ChevronDown size={11} strokeWidth={2} />
      </button>

      <Pop anchor={btn} open={open} onClose={() => setOpen(false)} w={296} t={t} d={d}>
        <div style={{ padding: "9px 11px 6px", borderBottom: `1px solid ${t.line2}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: t.ink }}>Pilih bulan</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              ["YTD", () => setRange(0, available.length - 1)],
              ["Q1",  () => setRange(0, Math.min(2, available.length - 1))],
              ["H1",  () => setRange(0, Math.min(5, available.length - 1))],
            ].map(([l, fn]) => (
              <button key={l} onClick={fn} style={{
                height: 22, padding: "0 8px",
                border: `1px solid ${t.chipActBd}`, background: t.chipAct,
                borderRadius: 5, fontSize: 11, fontWeight: 600,
                color: t.tealTx, cursor: "pointer", fontFamily: FONT,
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: "10px 11px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
          {available.map(m => {
            const sel = selected.includes(m);
            const short = MONTHS_SHORT[MONTHS_FULL.indexOf(m)];
            return (
              <button key={m} onClick={() => toggle(m)} style={{
                height: 30, border: `1px solid ${sel ? t.tealBd : t.line}`,
                background: sel ? t.tealBg : "transparent",
                color: sel ? t.tealTx : t.ink2,
                borderRadius: 6, fontSize: 12, fontWeight: sel ? 700 : 500,
                cursor: "pointer", fontFamily: FONT, transition: "all .12s",
              }}>{short}</button>
            );
          })}
        </div>
        <div style={{ padding: "6px 10px 10px", display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => onChange(available)} style={{ border: "none", background: "none", color: t.mute, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Semua</button>
          <button onClick={() => setOpen(false)} style={{
            height: 26, padding: "0 14px", border: "none",
            background: t.teal, color: "#fff",
            borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}>Selesai</button>
        </div>
      </Pop>
    </>
  );
}

// ─── KPI Card — clean, minimal color ─────────────────────────────────────────
// Only Pendapatan gets a red top accent; others use a neutral/teal stripe.
function KpiCard({ label, value, tone, icon: Icon, primary, t }) {
  const valColor = tone === "pos" ? t.pos : tone === "neg" ? t.neg : t.ink;
  const accentColor = primary === "red" ? B.red : primary === "teal" ? B.teal : t.faint;
  return (
    <div style={{
      padding: "16px 18px", background: t.panel,
      display: "flex", flexDirection: "column", gap: 10,
      position: "relative", overflow: "hidden",
    }}>
      {/* Single 3px top accent — only 2 cards get brand color */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accentColor }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mute }}>
          {label}
        </span>
        <Icon size={13} style={{ color: t.mute2 }} />
      </div>
      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 20, fontWeight: 600, color: valColor, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Type pill — minimal ──────────────────────────────────────────────────────
function TypePill({ mpc, t }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", height: 19, padding: "0 7px",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
      color: t.mute, background: t.panel2,
      border: `1px solid ${t.line}`,
      borderRadius: 4, fontFamily: FONT,
    }}>{mpc}</span>
  );
}

function Kv({ label, value, tone, t }) {
  const color = tone === "pos" ? t.pos : tone === "neg" ? t.neg : t.ink;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "2px 0" }}>
      <span style={{ fontSize: 12, color: t.mute }}>{label}</span>
      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 12.5, color, fontWeight: tone ? 600 : 500 }}>{value}</span>
    </div>
  );
}

// ─── Table header cell ────────────────────────────────────────────────────────
function Th({ children, align = "left", style, t }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: align,
      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em",
      color: t.mute, textTransform: "uppercase",
      borderBottom: `1px solid ${t.line}`,
      background: t.panel2,
      position: "sticky", top: 0, zIndex: 1,
      ...style,
    }}>{children}</th>
  );
}

// ─── Month cell ───────────────────────────────────────────────────────────────
function MonthCell({ md, label, setTooltip, t, partner, grand }) {
  const empty = !md || (md.rev === 0 && md.exp === 0);
  if (empty && !partner && !grand) {
    return (
      <td style={{ padding: "9px 12px", textAlign: "right" }}>
        <span style={{ fontFamily: MONO, color: t.mute2, fontSize: 13 }}>—</span>
      </td>
    );
  }
  const rev = md?.rev ?? 0, exp = md?.exp ?? 0, pl = rev - exp;
  return (
    <td style={{
      padding: "9px 12px", textAlign: "right",
      background: partner ? (t.hover) : undefined,
      borderTop:    grand   ? `1px solid ${t.line}` : undefined,
      borderBottom: partner ? `1px solid ${t.line}` : undefined,
      cursor: "help",
    }}
      onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, rev, exp, label })}
      onMouseMove={e => setTooltip(tt => tt ? { ...tt, x: e.clientX, y: e.clientY } : null)}
      onMouseLeave={() => setTooltip(null)}>
      <div style={{
        fontFamily: MONO, fontVariantNumeric: "tabular-nums",
        fontSize: 13, fontWeight: partner || grand ? 700 : 500, lineHeight: 1.2,
        color: pl > 0 ? t.pos : pl < 0 ? t.neg : t.mute2,
      }}>{fNum(pl)}</div>
      <div style={{
        fontFamily: MONO, fontVariantNumeric: "tabular-nums",
        fontSize: 11, color: t.mute2, marginTop: 2, lineHeight: 1.1, fontWeight: 400,
      }}>{fNum(rev)} · {fNum(exp)}</div>
    </td>
  );
}

// ─── YTD cell — teal background (one intentional brand accent) ───────────────
function YTDCell({ rev, exp, label, setTooltip, t, partner, grand }) {
  const pl = rev - exp;
  return (
    <td style={{
      padding: "9px 16px", textAlign: "right",
      background: t.tealBg,
      borderLeft: `1px solid ${t.tealBd}`,
      borderTop:    grand   ? `1px solid ${t.line}` : undefined,
      borderBottom: partner ? `1px solid ${t.line}` : undefined,
      cursor: "help",
    }}
      onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, rev, exp, label })}
      onMouseMove={e => setTooltip(tt => tt ? { ...tt, x: e.clientX, y: e.clientY } : null)}
      onMouseLeave={() => setTooltip(null)}>
      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: pl > 0 ? t.pos : pl < 0 ? t.neg : t.mute2 }}>
        {fNum(pl)}
      </div>
      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 11, color: t.tealTx, marginTop: 2, lineHeight: 1.1, fontWeight: 500, opacity: 0.85 }}>
        {fNum(rev)} · {fNum(exp)}
      </div>
    </td>
  );
}

// ─── Segment button ───────────────────────────────────────────────────────────
function Seg({ children, active, onClick, t }) {
  return (
    <button onClick={onClick} style={{
      height: 30, padding: "0 12px", border: "none",
      background: active ? t.chipAct : "transparent",
      color: active ? t.tealTx : t.mute,
      fontSize: 12, fontWeight: active ? 600 : 500, cursor: "pointer", fontFamily: FONT, transition: "all .12s",
    }}>{children}</button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PNL_PivotSummary({ theme, activeYear }) {
  const d = theme === "dark";
  const t = tk(d);

  const now      = new Date();
  const curYear  = now.getFullYear().toString();
  const curMIdx  = now.getMonth();

  const availMonths = useMemo(
    () => activeYear === curYear ? MONTHS_FULL.slice(0, curMIdx + 1) : MONTHS_FULL,
    [activeYear, curYear, curMIdx]
  );

  const [raw,       setRaw]       = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [filters,   setFilters]   = useState({ partner: [], branch: [], mpc: [] });
  const [sorts,     setSorts]     = useState({ partner: null, branch: null, mpc: null });
  const [selMonths, setSelMonths] = useState(availMonths);
  const [collapsed, setCollapsed] = useState(new Set());
  const [search,    setSearch]    = useState("");
  const [tooltip,   setTooltip]   = useState(null);

  useEffect(() => { setSelMonths(availMonths); }, [availMonths]);

  useEffect(() => {
    if (!activeYear) return;
    setLoading(true); setError(null);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("pnl_reports")
          .select("partner_name,branch,mpc_mp3,month,year,grand_total_revenue,grand_total_pengeluaran,is_finalized")
          .eq("year", activeYear);
        if (err) throw err;
        setRaw(data || []);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [activeYear]);

  const rows = useMemo(() => {
    const map = {};
    raw.forEach(r => {
      const key = `${r.partner_name}|||${r.branch}|||${r.mpc_mp3}`;
      if (!map[key]) map[key] = { partner: r.partner_name, branch: r.branch, mpc: r.mpc_mp3, months: {} };
      map[key].months[r.month.toUpperCase()] = {
        rev: Number(r.grand_total_revenue) || 0,
        exp: Number(r.grand_total_pengeluaran) || 0,
      };
    });
    return Object.values(map);
  }, [raw]);

  const opts = useMemo(() => {
    const ex = (skip) => rows.filter(r => Object.entries(filters).every(([col, sel]) => {
      if (col === skip || !sel.length) return true;
      const v = col === "partner" ? r.partner : col === "branch" ? r.branch : r.mpc;
      return sel.includes(v);
    }));
    const uniq = (arr, fn) => [...new Set(arr.map(fn))].sort();
    return {
      partner: uniq(ex("partner"), r => r.partner),
      branch:  uniq(ex("branch"),  r => r.branch),
      mpc:     uniq(ex("mpc"),     r => r.mpc),
    };
  }, [rows, filters]);

  const filteredRows = useMemo(() => {
    let list = rows.filter(r => {
      if (filters.partner.length && !filters.partner.includes(r.partner)) return false;
      if (filters.branch.length  && !filters.branch.includes(r.branch))   return false;
      if (filters.mpc.length     && !filters.mpc.includes(r.mpc))         return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(r.partner.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q))) return false;
      }
      return true;
    });
    const se = Object.entries(sorts).find(([, dir]) => dir);
    if (se) {
      const [col, dir] = se;
      list = [...list].sort((a, b) => {
        const va = col === "partner" ? a.partner : col === "branch" ? a.branch : a.mpc;
        const vb = col === "partner" ? b.partner : col === "branch" ? b.branch : b.mpc;
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }, [rows, filters, sorts, search]);

  const grouped = useMemo(() => {
    const g = {};
    const order = [];
    filteredRows.forEach(r => {
      if (!g[r.partner]) { g[r.partner] = { partner: r.partner, abbr: abbreviatePartner(r.partner), branches: [] }; order.push(r.partner); }
      g[r.partner].branches.push(r);
    });
    return Object.values(g);
  }, [filteredRows]);

  const activeMths = useMemo(() => availMonths.filter(m => selMonths.includes(m)), [availMonths, selMonths]);

  const ytdOf = useCallback((mData) => {
    let rev = 0, exp = 0;
    activeMths.forEach(m => { const md = mData[m]; if (md) { rev += md.rev; exp += md.exp; } });
    return { rev, exp, pl: rev - exp };
  }, [activeMths]);

  const { gtMth, gtRev, gtExp } = useMemo(() => {
    const gtMth = {};
    let gtRev = 0, gtExp = 0;
    activeMths.forEach(m => {
      let rev = 0, exp = 0;
      filteredRows.forEach(r => { const md = r.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
      gtMth[m] = { rev, exp }; gtRev += rev; gtExp += exp;
    });
    return { gtMth, gtRev, gtExp };
  }, [filteredRows, activeMths]);

  const gtPL   = gtRev - gtExp;
  const margin = gtRev > 0 ? ((gtPL / gtRev) * 100).toFixed(1) + "%" : "—";

  const togglePartner = (p) => setCollapsed(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const expandAll     = () => setCollapsed(new Set());
  const collapseAll   = () => setCollapsed(new Set(grouped.map(g => g.partner)));
  const clearAll      = () => { setFilters({ partner: [], branch: [], mpc: [] }); setSorts({ partner: null, branch: null, mpc: null }); setSelMonths(availMonths); setSearch(""); };

  const activeFilterCount = filters.partner.length + filters.branch.length + filters.mpc.length
    + (selMonths.length < availMonths.length ? 1 : 0)
    + (search ? 1 : 0);

  const exportCSV = () => {
    const hdr = ["Partner","Tipe","Branch",
      ...activeMths.flatMap(m => { const s = MONTHS_SHORT[MONTHS_FULL.indexOf(m)]; return [`${s}_REV`,`${s}_EXP`,`${s}_PL`]; }),
      "YTD_REV","YTD_EXP","YTD_PL"].join(",");
    const lines = [hdr];
    grouped.forEach(g => g.branches.forEach(b => {
      const yt = ytdOf(b.months);
      const cells = activeMths.flatMap(m => { const md = b.months[m]; return md ? [md.rev,md.exp,md.rev-md.exp] : ["",""  ,""]; });
      lines.push([b.partner,b.mpc,b.branch,...cells,yt.rev,yt.exp,yt.pl].join(","));
    }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `PNL_${activeYear}.csv`;
    a.click();
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 360, gap: 14, background: t.panel, borderRadius: 12, border: `1px solid ${t.line}`, fontFamily: FONT }}>
      <style>{`@keyframes pvSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes pvBeat{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.88)}}`}</style>
      <div style={{ position: "relative", width: 50, height: 50 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent", borderTopColor: B.teal, animation: "pvSpin 1s linear infinite" }} />
        <div style={{ position: "absolute", inset: 5, borderRadius: "50%", border: "1.5px solid transparent", borderTopColor: t.faint, animation: "pvSpin 1.7s linear infinite reverse" }} />
        <div style={{ position: "absolute", inset: 12, borderRadius: 8, background: t.tealBg, display: "flex", alignItems: "center", justifyContent: "center", animation: "pvBeat 1.8s ease-in-out infinite" }}>
          <BarChart3 size={15} color={B.teal} strokeWidth={2.2} />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: t.mute }}>Memuat data pivot…</span>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 18px", borderRadius: 10, background: t.panel, border: `1px solid ${t.neg}`, fontFamily: FONT }}>
      <AlertCircle size={19} color={t.neg} style={{ flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: t.neg }}>Gagal memuat data</div>
        <div style={{ fontSize: 12, color: t.mute, marginTop: 2 }}>{error}</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* ── Header ── clean, no rainbow bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ height: 18, width: 3, borderRadius: 2, background: B.teal }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: t.tealTx }}>
              Pivot Report
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(18px,3vw,22px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.15, color: t.ink }}>
            P&amp;L Pivot Summary
            <span style={{ color: t.mute, fontWeight: 400, fontSize: "0.72em", marginLeft: 9 }}>· {activeYear}</span>
          </h1>
          <div style={{ marginTop: 5, fontSize: 12.5, color: t.mute }}>
            {filteredRows.length} branch · {grouped.length} partner
          </div>
        </div>
        <button onClick={exportCSV} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          height: 34, padding: "0 14px",
          border: `1px solid ${t.tealBd}`,
          background: t.teal, color: "#fff",
          borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          transition: "opacity .14s",
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
        onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
          <Download size={13} strokeWidth={2} />
          Export CSV
        </button>
      </div>

      {/* ── KPI strip — 4 cards, minimal color ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 1,
        marginBottom: 18,
        background: t.line,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        overflow: "hidden",
      }}>
        {/* Pendapatan gets red accent — it's the top-line metric */}
        <KpiCard label="Pendapatan" value={fNum(gtRev)} tone="neutral" icon={TrendingUp}  primary="red"  t={t} />
        {/* Others: neutral (faint) accent */}
        <KpiCard label="Pengeluaran" value={fNum(gtExp)} tone="neutral" icon={TrendingDown} primary="neutral" t={t} />
        <KpiCard label="Net P&L"    value={fNum(gtPL)} tone={gtPL >= 0 ? "pos" : "neg"} icon={Wallet}   primary={gtPL >= 0 ? "teal" : "neutral"} t={t} />
        <KpiCard label="Margin"     value={margin}     tone={gtPL >= 0 ? "pos" : "neg"} icon={BarChart3} primary="neutral" t={t} />
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, marginBottom: 12 }}>
        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 11px", border: `1px solid ${t.chipBd}`, background: t.chipBg, borderRadius: 8, flex: "1 1 200px", minWidth: 180, maxWidth: 264 }}>
          <Search size={12} color={t.mute2} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari partner atau branch…"
            style={{ flex: 1, border: "none", background: "none", outline: "none", color: t.ink, fontSize: 12.5, fontFamily: FONT, minWidth: 0 }} />
          {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: t.mute, padding: 0, display: "flex" }}><X size={12} /></button>}
        </div>

        {/* Filter chips */}
        <FilterChip label="Partner" options={opts.partner} selected={filters.partner} onChange={v => setFilters(f => ({ ...f, partner: v }))} sortDir={sorts.partner} onSort={v => setSorts(s => ({ ...s, partner: v }))} t={t} d={d} />
        <FilterChip label="Branch"  options={opts.branch}  selected={filters.branch}  onChange={v => setFilters(f => ({ ...f, branch: v }))}  sortDir={sorts.branch}  onSort={v => setSorts(s => ({ ...s, branch: v }))}  t={t} d={d} />
        <FilterChip label="Tipe"    options={opts.mpc}     selected={filters.mpc}     onChange={v => setFilters(f => ({ ...f, mpc: v }))}     sortDir={sorts.mpc}     onSort={v => setSorts(s => ({ ...s, mpc: v }))}     t={t} d={d} />
        <MonthRange available={availMonths} selected={selMonths} onChange={setSelMonths} t={t} d={d} />

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {grouped.length > 0 && (
            <div style={{ display: "flex", border: `1px solid ${t.line}`, borderRadius: 8, overflow: "hidden", height: 32 }}>
              <Seg active={collapsed.size === 0} onClick={expandAll} t={t}>Buka semua</Seg>
              <Seg active={collapsed.size === grouped.length && grouped.length > 0} onClick={collapseAll} t={t}>Tutup semua</Seg>
            </div>
          )}
          {activeFilterCount > 0 && (
            <button onClick={clearAll} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              height: 32, padding: "0 11px",
              border: `1px solid ${t.line}`,
              background: t.chipBg, color: t.mute,
              borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontFamily: FONT,
              transition: "all .14s",
            }}>
              <RotateCcw size={12} strokeWidth={2} />
              Reset
              <span style={{ color: t.mute2 }}>({activeFilterCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Legend — compact, single line ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 10, fontSize: 11.5, color: t.mute2, alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.pos }} />Profit
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.neg }} />Loss
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: B.teal, opacity: 0.55 }} />
          Kolom YTD
        </span>
        <span style={{ marginLeft: "auto", color: t.mute2, fontSize: 11 }}>
          Klik partner untuk lipat/buka · hover untuk nilai lengkap
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, background: t.panel, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 280 + 64 + activeMths.length * 90 + 110 }}>
            <colgroup>
              <col style={{ width: 272 }} />
              <col style={{ width: 60 }} />
              {activeMths.map(m => <col key={m} style={{ width: 90 }} />)}
              <col style={{ width: 112 }} />
            </colgroup>
            <thead>
              <tr>
                <Th align="left" style={{ paddingLeft: 17 }} t={t}>Branch</Th>
                <Th align="left" t={t}>Tipe</Th>
                {activeMths.map(m => (
                  <Th key={m} align="right" t={t}>
                    {MONTHS_SHORT[MONTHS_FULL.indexOf(m)].toUpperCase()}
                  </Th>
                ))}
                {/* YTD — teal background, the one intentional brand accent */}
                <Th align="right" style={{
                  paddingRight: 16,
                  color: t.tealTx,
                  background: t.tealBg,
                  borderLeft: `1px solid ${t.tealBd}`,
                }} t={t}>YTD</Th>
              </tr>
            </thead>

            <tbody>
              {grouped.length === 0 && (
                <tr>
                  <td colSpan={2 + activeMths.length + 1} style={{ padding: "72px 0", textAlign: "center", color: t.mute2, fontSize: 13.5 }}>
                    Tidak ada data untuk filter yang dipilih.
                  </td>
                </tr>
              )}

              {grouped.map((g, gi) => {
                const isC = collapsed.has(g.partner);
                const pMth = {};
                activeMths.forEach(m => {
                  let rev = 0, exp = 0;
                  g.branches.forEach(b => { const md = b.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
                  pMth[m] = { rev, exp };
                });
                const pYTD = ytdOf(Object.fromEntries(activeMths.map(m => [m, pMth[m]])));
                const partnerRowBg = d ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.018)";

                return (
                  <Fragment key={g.partner}>
                    {/* Partner row — no brand color, just subtle tint */}
                    <tr style={{ background: partnerRowBg }}>
                      <td colSpan={2} style={{
                        padding: "11px 17px",
                        borderTop: gi === 0 ? "none" : `1px solid ${t.line}`,
                        borderBottom: `1px solid ${t.line}`,
                      }}>
                        <button onClick={() => togglePartner(g.partner)} style={{
                          display: "inline-flex", alignItems: "center", gap: 9,
                          border: "none", background: "none", cursor: "pointer",
                          color: t.ink, padding: 0, fontFamily: FONT, textAlign: "left",
                        }}>
                          <span style={{ color: t.mute, display: "flex" }}>
                            {isC ? <ChevronRight size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
                          </span>
                          {/* Abbrev badge — monochrome, no rainbow */}
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            minWidth: 36, height: 20, padding: "0 7px",
                            fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
                            color: t.mute, background: t.panel2,
                            border: `1px solid ${t.line}`,
                            borderRadius: 4,
                          }}>{g.abbr}</span>
                          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", color: t.ink }}>{g.partner}</span>
                          <span style={{
                            display: "inline-block", padding: "1px 6px", borderRadius: 99,
                            background: t.panel2, fontSize: 10.5, fontWeight: 500,
                            color: t.mute, border: `1px solid ${t.line}`,
                          }}>
                            {g.branches.length} branch
                          </span>
                        </button>
                      </td>
                      {activeMths.map(m => (
                        <MonthCell key={m} md={pMth[m]} label={`${g.partner} · ${m}`} setTooltip={setTooltip} t={t} partner />
                      ))}
                      <YTDCell rev={pYTD.rev} exp={pYTD.exp} label={`${g.partner} · YTD`} setTooltip={setTooltip} t={t} partner />
                    </tr>

                    {/* Branch rows */}
                    {!isC && g.branches.map((b, bi) => {
                      const yt = ytdOf(b.months);
                      return (
                        <tr
                          key={b.branch + b.mpc}
                          style={{ borderBottom: bi === g.branches.length - 1 ? "none" : `1px solid ${t.line2}`, transition: "background .1s" }}
                          onMouseEnter={e => e.currentTarget.style.background = t.hover}
                          onMouseLeave={e => e.currentTarget.style.background = ""}
                        >
                          <td style={{ padding: "9px 17px 9px 26px", fontSize: 13, color: t.ink2, fontWeight: 500 }}>
                            <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.mute, fontWeight: 600, letterSpacing: "0.04em", marginRight: 5 }}>{g.abbr}</span>
                            <span style={{ color: t.mute2, marginRight: 5 }}>–</span>
                            <span>{b.branch}</span>
                          </td>
                          <td style={{ padding: "9px 12px" }}><TypePill mpc={b.mpc} t={t} /></td>
                          {activeMths.map(m => <MonthCell key={m} md={b.months[m]} label={`${b.branch} · ${m}`} setTooltip={setTooltip} t={t} />)}
                          <YTDCell rev={yt.rev} exp={yt.exp} label={`${b.branch} · YTD`} setTooltip={setTooltip} t={t} />
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>

            {/* Grand total row */}
            {filteredRows.length > 0 && (
              <tfoot>
                <tr style={{ background: t.panel2 }}>
                  <td colSpan={2} style={{
                    padding: "12px 17px",
                    borderTop: `2px solid ${t.line}`,
                    position: "relative",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.ink, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      Grand Total
                    </div>
                    <div style={{ fontSize: 11, color: t.mute, marginTop: 2 }}>
                      {filteredRows.length} branch · {grouped.length} partner
                    </div>
                  </td>
                  {activeMths.map(m => (
                    <MonthCell key={m} md={gtMth[m]} label={`Grand Total · ${m}`} setTooltip={setTooltip} t={t} grand />
                  ))}
                  <YTDCell rev={gtRev} exp={gtExp} label="Grand Total · YTD" setTooltip={setTooltip} t={t} grand />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Footnote */}
      <div style={{ marginTop: 12, fontSize: 11.5, color: t.mute2, display: "flex", flexWrap: "wrap", gap: 12 }}>
        <span>Sumber: <span style={{ color: t.mute }}>pnl_reports</span></span>
        <span>Tahun {activeYear}</span>
        <span>Nilai disingkat (rb · Jt · M) — hover untuk nilai lengkap</span>
      </div>

      {/* Tooltip — portal, always on top */}
      {tooltip && typeof document !== "undefined" && createPortal(
        <div style={{
          position: "fixed",
          top: tooltip.y + 16,
          left: Math.min(tooltip.x + 12, window.innerWidth - 240),
          background: t.panel,
          border: `1px solid ${t.line}`,
          borderRadius: 9,
          padding: "11px 14px",
          zIndex: 2147483647, pointerEvents: "none",
          boxShadow: d ? "0 8px 28px rgba(0,0,0,0.60)" : "0 8px 28px rgba(0,0,0,0.12)",
          minWidth: 210, fontFamily: FONT, overflow: "hidden",
        }}>
          {/* Single teal top stripe on tooltip */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: B.teal }} />
          <div style={{ fontSize: 11, color: t.mute, marginBottom: 8, fontWeight: 500, marginTop: 4 }}>{tooltip.label}</div>
          <Kv label="Pendapatan"  value={fFull(tooltip.rev)} t={t} />
          <Kv label="Pengeluaran" value={fFull(tooltip.exp)} t={t} />
          <div style={{ height: 1, background: t.line2, margin: "6px 0" }} />
          <Kv label="Net P&L" value={fFull(tooltip.rev - tooltip.exp)} tone={tooltip.rev - tooltip.exp >= 0 ? "pos" : "neg"} t={t} />
        </div>,
        document.body
      )}
    </div>
  );
}