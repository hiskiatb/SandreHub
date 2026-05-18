"use client";

/* ──────────────────────────────────────────────────────────────────────────────
   PNL_PivotSummary — redesigned
   - No freeze panes (no sticky left columns)
   - Each month = 1 column (P/L primary; REV · EXP small below)
   - Partner = full-width band row, expand/collapse
   - Chip-style filters, single accent, restrained palette
   - Light / dark via `theme` prop

   Recommended (optional): add Geist + Geist Mono via next/font in your layout
   for the typography to match the design. Falls back to system fonts.
────────────────────────────────────────────────────────────────────────────── */

import React, { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import supabase from "../../../lib/supabase";
import {
  Search, Check, ChevronDown, ChevronRight, X,
  RotateCcw, Download, Calendar, BarChart3, AlertCircle,
  Sun, Moon, Rows3,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_FULL  = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI",
                      "JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

const FONT_SANS = `"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", system-ui, sans-serif`;
const FONT_MONO = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`;

// ─── Formatters ───────────────────────────────────────────────────────────────
const fNum = (v) => {
  if (v === null || v === undefined || isNaN(v) || v === 0) return "—";
  const abs = Math.abs(v);
  let s;
  if (abs >= 1_000_000_000)      s = (abs / 1_000_000_000).toFixed(2) + "M";
  else if (abs >= 1_000_000)     s = (abs / 1_000_000).toFixed(0) + "Jt";
  else if (abs >= 1_000)         s = (abs / 1_000).toFixed(0) + "rb";
  else                           s = abs.toFixed(0);
  return v < 0 ? "−" + s : s;
};
const fFull = (v) =>
  v === null || v === undefined ? "—"
    : `Rp ${new Intl.NumberFormat("id-ID").format(Math.abs(v))}${v < 0 ? "  (rugi)" : ""}`;

// ─── Design tokens — Indosat Ooredoo Hutchison ───────────────────────────────
// Red #ED1C24 · Yellow #FFCB05 · Teal #32BCAD · Magenta #C6168D · Gray #4D4D4F
const tokens = (d) => ({
  bg:        d ? "#0D0D0E" : "#F5F5F6",
  surface:   d ? "#1A1A1D" : "#FFFFFF",
  surface2:  d ? "#202024" : "#F2F2F4",
  line:      d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)",
  line2:     d ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
  ink:       d ? "#F2F2F3" : "#18181B",
  ink2:      d ? "#D4D4D8" : "#3F3F46",
  mute:      d ? "#8A8A96" : "#71717A",
  mute2:     d ? "#5A5A68" : "#A1A1AA",
  faint:     d ? "#3A3A42" : "#D4D4D8",

  // Primary — Indosat Red
  blue:      "#ED1C24",
  blueBg:    d ? "rgba(237,28,36,0.12)"  : "rgba(237,28,36,0.07)",
  blueBd:    d ? "rgba(237,28,36,0.28)"  : "rgba(237,28,36,0.20)",
  blueSoft:  d ? "rgba(237,28,36,0.06)"  : "rgba(237,28,36,0.04)",

  // Profit/loss
  pos:       d ? "#32BCAD" : "#1A9E90",   // Indosat Teal — profit
  neg:       d ? "#FF6B6B" : "#DC2626",   // Red — loss

  hover:     d ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",

  // Partner band rows
  partner:   d ? "rgba(237,28,36,0.04)"  : "rgba(237,28,36,0.025)",
  partner2:  d ? "rgba(237,28,36,0.08)"  : "rgba(237,28,36,0.05)",

  // YTD column accent — Indosat Teal wash
  ytd:       d ? "rgba(50,188,173,0.07)" : "rgba(50,188,173,0.06)",

  // Magenta accent
  magenta:   "#C6168D",
  magentaBg: d ? "rgba(198,22,141,0.12)" : "rgba(198,22,141,0.07)",
  magentaBd: d ? "rgba(198,22,141,0.28)" : "rgba(198,22,141,0.18)",

  // Yellow accent
  yellow:    "#FFCB05",
  yellowBg:  d ? "rgba(255,203,5,0.12)"  : "rgba(255,203,5,0.08)",
});

// ─── Popover (click-outside + portal) ────────────────────────────────────────
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
      if (ref.current?.contains(e.target)) return;
      if (anchor?.current?.contains(e.target)) return;
      onClose();
    };
    const k = (e) => e.key === "Escape" && onClose();
    const id = setTimeout(() => document.addEventListener("mousedown", h), 0);
    document.addEventListener("keydown", k);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, onClose, anchor]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div ref={ref} style={{
      position: "fixed", top: pos.top, left: pos.left, width: w,
      background: t.surface, border: `1px solid ${t.line}`,
      borderRadius: 10,
      boxShadow: d
        ? "0 12px 32px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)"
        : "0 12px 32px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)",
      zIndex: 2147483646, overflow: "hidden",
      fontFamily: FONT_SANS, color: t.ink,
    }}>{children}</div>,
    document.body
  );
}

// ─── Filter chip dropdown ────────────────────────────────────────────────────
function FilterChip({ label, options, selected, onChange, sortDir, onSort, t, d }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btn = useRef(null);
  const active = selected.length > 0 || !!sortDir;

  const filtered = useMemo(
    () => options.filter(o => o.toLowerCase().includes(q.toLowerCase())),
    [options, q]
  );
  const allSel = filtered.length > 0 && filtered.every(o => selected.includes(o));
  const toggleAll = () => onChange(
    allSel ? selected.filter(s => !filtered.includes(s)) : [...new Set([...selected, ...filtered])]
  );
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);

  return (
    <>
      <button ref={btn} onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        height: 30, padding: "0 11px", borderRadius: 7,
        border: `1px solid ${active ? "#ED1C24" : t.line}`,
        background: active
          ? "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)"
          : t.surface,
        color: active ? "#FFFFFF" : t.ink2,
        fontSize: 12.5, fontWeight: 500, cursor: "pointer",
        fontFamily: FONT_SANS,
        transition: "background .14s, color .14s, border-color .14s",
        boxShadow: active ? "0 2px 8px rgba(237,28,36,0.25)" : "none",
      }}>
        <span style={{ color: active ? "rgba(255,255,255,0.7)" : t.mute, fontSize: 11.5 }}>{label}</span>
        {selected.length > 0
          ? <span style={{ fontWeight: 600 }}>{selected.length === 1 ? selected[0] : `${selected.length} dipilih`}</span>
          : <span style={{ color: t.mute2 }}>Semua</span>}
        <ChevronDown size={12} strokeWidth={1.8} />
      </button>

      <Pop anchor={btn} open={open} onClose={() => setOpen(false)} w={280} t={t} d={d}>
        {/* Sort header */}
        <div style={{ display: "flex", borderBottom: `1px solid ${t.line2}` }}>
          {[["asc", "A → Z"], ["desc", "Z → A"]].map(([dir, lbl]) => {
            const on = sortDir === dir;
            return (
              <button key={dir} onClick={() => onSort(on ? null : dir)} style={{
                flex: 1, height: 34, border: "none",
                background: on ? t.surface2 : "transparent",
                color: on ? t.ink : t.mute,
                fontSize: 12, fontWeight: 500, cursor: "pointer",
                fontFamily: FONT_SANS,
                borderRight: dir === "asc" ? `1px solid ${t.line2}` : "none",
              }}>{lbl}</button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ padding: "8px 10px", borderBottom: `1px solid ${t.line2}` }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7, height: 30, padding: "0 10px",
            background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 7,
          }}>
            <Search size={13} color={t.mute2} />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder={`Cari ${label.toLowerCase()}…`}
              style={{
                flex: 1, border: "none", background: "none", outline: "none",
                color: t.ink, fontSize: 12.5, fontFamily: FONT_SANS,
              }} />
          </div>
        </div>

        {/* List */}
        <div style={{ maxHeight: 260, overflowY: "auto", padding: "4px 0" }}>
          <ChipRow label="Semua" sel={allSel} onClick={toggleAll} emphasize count={filtered.length} t={t} />
          {filtered.map(o => (
            <ChipRow key={o} label={o} sel={selected.includes(o)} onClick={() => toggle(o)} t={t} />
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "22px 14px", textAlign: "center", color: t.mute2, fontSize: 12 }}>Tidak ada hasil</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 10px", borderTop: `1px solid ${t.line2}`, background: t.surface2,
        }}>
          <button onClick={() => { onChange([]); onSort(null); }} style={{
            border: "none", background: "none", color: t.mute, fontSize: 12,
            cursor: "pointer", padding: "4px 6px", fontFamily: FONT_SANS,
          }}>Reset</button>
          <button onClick={() => setOpen(false)} style={{
            height: 28, padding: "0 12px", border: `1px solid ${t.line}`,
            background: t.surface, borderRadius: 6, color: t.ink2,
            fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONT_SANS,
          }}>Tutup</button>
        </div>
      </Pop>
    </>
  );
}

function ChipRow({ label, sel, onClick, emphasize, count, t }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 9, width: "100%",
      padding: "7px 12px", border: "none", background: "transparent", cursor: "pointer",
      color: emphasize ? t.ink : t.ink2,
      fontWeight: emphasize ? 600 : 400,
      textAlign: "left", fontSize: 12.5, fontFamily: FONT_SANS,
    }}
    onMouseEnter={e => e.currentTarget.style.background = t.hover}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <div style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        background: sel
          ? "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)"
          : "transparent",
        border: `1px solid ${sel ? "#ED1C24" : t.faint}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#FFFFFF",
        boxShadow: sel ? "0 1px 4px rgba(237,28,36,0.3)" : "none",
      }}>{sel && <Check size={11} strokeWidth={2.5} />}</div>
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && <span style={{ color: t.mute2, fontSize: 11 }}>{count}</span>}
    </button>
  );
}

// ─── Month range picker ──────────────────────────────────────────────────────
function MonthRange({ available, selected, onChange, t, d }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const all = selected.length === available.length;

  const toggle = (m) => onChange(
    selected.includes(m) ? selected.filter(v => v !== m) : [...selected, m]
  );
  const setRange = (from, to) => onChange(available.slice(from, to + 1));

  return (
    <>
      <button ref={btn} onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        height: 30, padding: "0 11px", borderRadius: 7,
        border: `1px solid ${!all ? "#ED1C24" : t.line}`,
        background: !all
          ? "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)"
          : t.surface,
        color: !all ? "#FFFFFF" : t.ink2,
        fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: FONT_SANS,
        boxShadow: !all ? "0 2px 8px rgba(237,28,36,0.25)" : "none",
        transition: "all .14s",
      }}>
        <Calendar size={13} strokeWidth={1.8} />
        {all
          ? <span>{available.length} bulan</span>
          : <span style={{ fontWeight: 600 }}>{selected.length} dari {available.length} bulan</span>}
        <ChevronDown size={12} strokeWidth={1.8} />
      </button>

      <Pop anchor={btn} open={open} onClose={() => setOpen(false)} w={310} t={t} d={d}>
        <div style={{
          padding: "10px 12px 6px", borderBottom: `1px solid ${t.line2}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: t.ink }}>Pilih bulan</span>
          <div style={{ display: "flex", gap: 4 }}>
            <Quick label="YTD" onClick={() => setRange(0, available.length - 1)} t={t} />
            <Quick label="Q1"  onClick={() => setRange(0, Math.min(2, available.length - 1))} t={t} />
            <Quick label="Q2"  onClick={() => available.length >= 4 && setRange(3, Math.min(5, available.length - 1))} t={t} />
            <Quick label="H1"  onClick={() => setRange(0, Math.min(5, available.length - 1))} t={t} />
          </div>
        </div>
        <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
          {available.map(m => {
            const sel = selected.includes(m);
            const short = MONTHS_SHORT[MONTHS_FULL.indexOf(m)];
            return (
              <button key={m} onClick={() => toggle(m)} style={{
                height: 32,
                border: `1px solid ${sel ? "#ED1C24" : t.line}`,
                background: sel
                  ? "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)"
                  : t.surface,
                color: sel ? "#FFFFFF" : t.ink2,
                borderRadius: 6, fontSize: 12, fontWeight: sel ? 600 : 500,
                cursor: "pointer", fontFamily: FONT_SANS,
                boxShadow: sel ? "0 2px 6px rgba(237,28,36,0.25)" : "none",
                transition: "all .12s",
              }}>{short}</button>
            );
          })}
        </div>
        <div style={{ padding: "6px 10px 10px", display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => onChange(available)} style={{
            border: "none", background: "none", color: t.mute, fontSize: 12,
            cursor: "pointer", padding: "4px 6px", fontFamily: FONT_SANS,
          }}>Semua</button>
          <button onClick={() => setOpen(false)} style={{
            height: 28, padding: "0 14px", border: "none",
            background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)",
            color: "#FFFFFF", borderRadius: 6,
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT_SANS,
            boxShadow: "0 2px 8px rgba(237,28,36,0.28)",
          }}>Selesai</button>
        </div>
      </Pop>
    </>
  );
}

function Quick({ label, onClick, t }) {
  return (
    <button onClick={onClick} style={{
      height: 22, padding: "0 8px", border: `1px solid ${t.line}`,
      background: t.surface, borderRadius: 5,
      fontSize: 11, fontWeight: 500, color: t.mute,
      cursor: "pointer", fontFamily: FONT_SANS,
    }}>{label}</button>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────
function Crumb({ children, active, t }) {
  return (
    <span style={{
      fontSize: 12, color: active ? t.ink : t.mute,
      fontWeight: active ? 500 : 400, letterSpacing: "-0.005em",
    }}>{children}</span>
  );
}

function Seg({ children, active, onClick, t }) {
  return (
    <button onClick={onClick} style={{
      height: 28, padding: "0 12px", border: "none",
      background: active
        ? "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)"
        : t.surface,
      color: active ? "#FFFFFF" : t.mute,
      fontSize: 12, fontWeight: active ? 600 : 500, cursor: "pointer", fontFamily: FONT_SANS,
      transition: "all .12s",
    }}>{children}</button>
  );
}

function LegItem({ dot, label, t }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: dot }} />{label}
    </span>
  );
}

function Kpi({ label, value, tone, primary, t }) {
  const color = tone === "pos" ? t.pos : tone === "neg" ? t.neg : t.ink;
  return (
    <div style={{ padding: "18px 20px", background: t.surface }}>
      <div style={{ fontSize: 11.5, color: t.mute, letterSpacing: "0.01em", marginBottom: 8 }}>{label}</div>
      <div style={{
        fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
        fontSize: primary ? 26 : 22, fontWeight: 500, color,
        letterSpacing: "-0.02em", lineHeight: 1.1,
      }}>{value}</div>
    </div>
  );
}

function TypePill({ mpc, t }) {
  const isMpc = mpc === "MPC";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px",
      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em",
      color: isMpc ? "#C6168D" : "#32BCAD",
      background: isMpc
        ? "rgba(198,22,141,0.10)"
        : "rgba(50,188,173,0.10)",
      border: `1px solid ${isMpc ? "rgba(198,22,141,0.25)" : "rgba(50,188,173,0.25)"}`,
      borderRadius: 4,
    }}>{mpc}</span>
  );
}

function Kv({ label, value, tone, t }) {
  const color = tone === "pos" ? t.pos : tone === "neg" ? t.neg : t.ink;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "2px 0" }}>
      <span style={{ fontSize: 12, color: t.mute }}>{label}</span>
      <span style={{
        fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
        fontSize: 12.5, color, fontWeight: tone ? 600 : 500,
      }}>{value}</span>
    </div>
  );
}

// Cell renderers — month and YTD share a stacked layout: P/L primary, REV·EXP secondary
function MonthCell({ md, label, setTooltip, t, partner, grand }) {
  const empty = !md || (md.rev === 0 && md.exp === 0);
  if (empty && !partner && !grand) {
    return (
      <td style={{ padding: "10px 12px", textAlign: "right" }}>
        <span style={{ fontFamily: FONT_MONO, color: t.mute2, fontSize: 13 }}>—</span>
      </td>
    );
  }
  const rev = md?.rev ?? 0;
  const exp = md?.exp ?? 0;
  const pl  = rev - exp;
  const bg  = grand ? "transparent" : partner ? t.partner : undefined;
  return (
    <td style={{
      padding: "10px 12px", textAlign: "right", background: bg,
      borderTop: grand ? `1px solid ${t.line}` : undefined,
      borderBottom: partner ? `1px solid ${t.line}` : undefined,
      cursor: "help",
    }}
      onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, rev, exp, label })}
      onMouseMove={e => setTooltip(tt => tt ? { ...tt, x: e.clientX, y: e.clientY } : null)}
      onMouseLeave={() => setTooltip(null)}>
      <div style={{
        fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
        fontSize: grand ? 14 : 13.5, fontWeight: partner || grand ? 600 : 500, lineHeight: 1.15,
        color: pl > 0 ? "#32BCAD" : pl < 0 ? t.neg : t.mute2,
      }}>{fNum(pl)}</div>
      <div style={{
        fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
        fontSize: 10.5, color: partner ? t.mute : t.mute2,
        marginTop: 2, lineHeight: 1.1, letterSpacing: "0.01em",
        fontWeight: partner || grand ? 500 : 400,
      }}>{fNum(rev)} · {fNum(exp)}</div>
    </td>
  );
}

function YTDCell({ rev, exp, label, setTooltip, t, partner, grand }) {
  const pl = rev - exp;
  return (
    <td style={{
      padding: "10px 18px", textAlign: "right",
      background: t.ytd,
      borderLeft: `1px solid rgba(50,188,173,0.20)`,
      borderTop: grand ? `1px solid ${t.line}` : undefined,
      borderBottom: partner ? `1px solid ${t.line}` : undefined,
      cursor: "help",
    }}
      onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, rev, exp, label })}
      onMouseMove={e => setTooltip(tt => tt ? { ...tt, x: e.clientX, y: e.clientY } : null)}
      onMouseLeave={() => setTooltip(null)}>
      <div style={{
        fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
        fontSize: grand ? 15 : 14, fontWeight: 600, lineHeight: 1.15,
        color: pl > 0 ? "#32BCAD" : pl < 0 ? t.neg : t.mute2,
      }}>{fNum(pl)}</div>
      <div style={{
        fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
        fontSize: 10.5, color: t.mute, marginTop: 2,
        lineHeight: 1.1, letterSpacing: "0.01em", fontWeight: 500,
      }}>{fNum(rev)} · {fNum(exp)}</div>
    </td>
  );
}

function Th({ children, align = "left", style, t }) {
  return (
    <th style={{
      padding: "11px 12px", textAlign: align,
      fontSize: 10.5, fontWeight: 500, letterSpacing: "0.08em",
      color: t.mute, textTransform: "uppercase",
      borderBottom: `1px solid ${t.line}`, background: t.surface,
      position: "sticky", top: 0, zIndex: 1,
      ...style,
    }}>{children}</th>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function PNL_PivotSummary({ theme, activeYear }) {
  const d = theme === "dark";
  const t = tokens(d);

  const now      = new Date();
  const curYear  = now.getFullYear().toString();
  const curMIdx  = now.getMonth();

  // Months available (capped at current month for current year)
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

  // ── Fetch (unchanged from original) ──
  useEffect(() => {
    if (!activeYear) return;
    setLoading(true); setError(null);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("pnl_reports")
          .select("partner_name, branch, mpc_mp3, month, year, grand_total_revenue, grand_total_pengeluaran, is_finalized")
          .eq("year", activeYear);
        if (err) throw err;
        setRaw(data || []);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [activeYear]);

  // Build rows: one per (partner, branch, mpc) with months keyed
  const rows = useMemo(() => {
    const map = {};
    raw.forEach(r => {
      const key = `${r.partner_name}|||${r.branch}|||${r.mpc_mp3}`;
      if (!map[key]) map[key] = { partner: r.partner_name, branch: r.branch, mpc: r.mpc_mp3, months: {} };
      map[key].months[r.month.toUpperCase()] = {
        rev: Number(r.grand_total_revenue)     || 0,
        exp: Number(r.grand_total_pengeluaran) || 0,
      };
    });
    return Object.values(map);
  }, [raw]);

  // Faceted options
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

  // Filtered + sorted rows
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

  // Group by partner
  const grouped = useMemo(() => {
    const g = {};
    filteredRows.forEach(r => {
      if (!g[r.partner]) g[r.partner] = { partner: r.partner, branches: [] };
      g[r.partner].branches.push(r);
    });
    return Object.values(g);
  }, [filteredRows]);

  // Active months
  const activeMths = useMemo(
    () => availMonths.filter(m => selMonths.includes(m)),
    [availMonths, selMonths]
  );

  const ytdOf = useCallback((mData) => {
    let rev = 0, exp = 0;
    activeMths.forEach(m => { const md = mData[m]; if (md) { rev += md.rev; exp += md.exp; } });
    return { rev, exp, pl: rev - exp };
  }, [activeMths]);

  // Grand totals
  const { gtMth, gtRev, gtExp } = useMemo(() => {
    const gtMth = {};
    let gtRev = 0, gtExp = 0;
    activeMths.forEach(m => {
      let rev = 0, exp = 0;
      filteredRows.forEach(r => { const md = r.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
      gtMth[m] = { rev, exp };
      gtRev += rev; gtExp += exp;
    });
    return { gtMth, gtRev, gtExp };
  }, [filteredRows, activeMths]);
  const gtPL = gtRev - gtExp;

  // Handlers
  const togglePartner = (p) => setCollapsed(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const expandAll   = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(grouped.map(g => g.partner)));
  const clearAll    = () => {
    setFilters({ partner: [], branch: [], mpc: [] });
    setSorts({ partner: null, branch: null, mpc: null });
    setSelMonths(availMonths);
    setSearch("");
  };

  const activeFilterCount =
    filters.partner.length + filters.branch.length + filters.mpc.length
    + (selMonths.length < availMonths.length ? 1 : 0)
    + (search ? 1 : 0);

  // CSV export
  const exportCSV = () => {
    const hdr = ["Partner", "Tipe", "Branch",
      ...activeMths.flatMap(m => {
        const s = MONTHS_SHORT[MONTHS_FULL.indexOf(m)];
        return [`${s}_REV`, `${s}_EXP`, `${s}_PL`];
      }),
      "YTD_REV", "YTD_EXP", "YTD_PL",
    ].join(",");
    const lines = [hdr];
    grouped.forEach(g => g.branches.forEach(b => {
      const yt = ytdOf(b.months);
      const cells = activeMths.flatMap(m => {
        const md = b.months[m];
        return md ? [md.rev, md.exp, md.rev - md.exp] : ["", "", ""];
      });
      lines.push([b.partner, b.mpc, b.branch, ...cells, yt.rev, yt.exp, yt.pl].join(","));
    }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `PNL_${activeYear}.csv`;
    a.click();
  };

  // Loading
  if (loading) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 380, gap: 16, background: t.surface,
        borderRadius: 12, border: `1px solid ${t.line}`,
        fontFamily: FONT_SANS, color: t.ink,
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
          @keyframes pivotSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
          @keyframes pivotBeat{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.9)}}
        `}</style>
        <div style={{ position: "relative", width: 52, height: 52 }}>
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "2.5px solid transparent",
            borderTopColor: "#ED1C24",
            borderRightColor: "#C6168D",
            animation: "pivotSpin 0.9s linear infinite",
          }} />
          <div style={{
            position: "absolute", inset: 8, borderRadius: 10,
            background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "pivotBeat 1.8s ease-in-out infinite",
            boxShadow: "0 4px 16px rgba(237,28,36,0.4)",
          }}>
            <BarChart3 size={18} color="#FFFFFF" />
          </div>
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: t.mute, letterSpacing: "0.01em" }}>
          Memuat data pivot…
        </span>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
        borderRadius: 10, background: t.surface,
        border: `1px solid ${t.neg}`, fontFamily: FONT_SANS,
      }}>
        <AlertCircle size={20} color={t.neg} style={{ flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.neg }}>Gagal memuat data</div>
          <div style={{ fontSize: 12, color: t.mute, marginTop: 3 }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: FONT_SANS, WebkitFontSmoothing: "antialiased", color: t.ink,
    }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Crumb t={t}>Overview</Crumb>
            <span style={{ color: t.mute2 }}>/</span>
            <Crumb active t={t}>Pivot P&L</Crumb>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 5 }}>
            <div style={{
              width: 4, height: 32, borderRadius: 2, flexShrink: 0,
              background: "linear-gradient(180deg, #ED1C24 0%, #C6168D 100%)",
            }} />
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 700,
              letterSpacing: "-0.03em", lineHeight: 1.1, color: t.ink,
            }}>
              Pivot P&L <span style={{ color: t.mute, fontWeight: 400 }}>· {activeYear}</span>
            </h1>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: t.mute, paddingLeft: 16 }}>
            {filteredRows.length} branch · {grouped.length} partner · diperbarui {MONTHS_SHORT[curMIdx]} {curYear}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={exportCSV} style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            height: 34, padding: "0 16px",
            border: "none",
            background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)",
            color: "#FFFFFF",
            borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: FONT_SANS,
            boxShadow: "0 2px 10px rgba(237,28,36,0.30)",
            transition: "opacity .12s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            <Download size={13} strokeWidth={2} /> Export CSV
          </button>
        </div>
      </header>

      {/* Font import + KPI strip */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1,
        marginBottom: 22, background: t.line,
        border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden",
        position: "relative",
      }}>
        {/* Top accent stripe */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2, zIndex: 1,
          background: "linear-gradient(90deg, #ED1C24 0%, #FFCB05 33%, #32BCAD 66%, #C6168D 100%)",
        }} />
        <Kpi label="Total Pendapatan" value={fFull(gtRev)} tone="neutral" t={t} />
        <Kpi label="Total Pengeluaran" value={fFull(gtExp)} tone="neutral" t={t} />
        <Kpi label="Laba Bersih" value={fFull(gtPL)} tone={gtPL >= 0 ? "pos" : "neg"} primary t={t} />
        <Kpi label="Margin"
             value={gtRev ? ((gtPL / gtRev) * 100).toFixed(1) + "%" : "—"}
             tone={gtPL >= 0 ? "pos" : "neg"} t={t} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7, height: 30, padding: "0 11px",
          border: `1px solid ${t.line}`, background: t.surface,
          borderRadius: 7, minWidth: 230,
        }}>
          <Search size={13} color={t.mute2} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari partner atau branch…"
            style={{
              flex: 1, border: "none", background: "none", outline: "none",
              color: t.ink, fontSize: 12.5, fontFamily: FONT_SANS,
            }} />
          {search && (
            <button onClick={() => setSearch("")} style={{
              border: "none", background: "none", cursor: "pointer",
              color: t.mute, padding: 0, display: "flex",
            }}><X size={13} /></button>
          )}
        </div>

        <FilterChip label="Partner" options={opts.partner} selected={filters.partner}
          onChange={v => setFilters(f => ({ ...f, partner: v }))}
          sortDir={sorts.partner} onSort={v => setSorts(s => ({ ...s, partner: v }))}
          t={t} d={d} />
        <FilterChip label="Branch" options={opts.branch} selected={filters.branch}
          onChange={v => setFilters(f => ({ ...f, branch: v }))}
          sortDir={sorts.branch} onSort={v => setSorts(s => ({ ...s, branch: v }))}
          t={t} d={d} />
        <FilterChip label="Tipe" options={opts.mpc} selected={filters.mpc}
          onChange={v => setFilters(f => ({ ...f, mpc: v }))}
          sortDir={sorts.mpc} onSort={v => setSorts(s => ({ ...s, mpc: v }))}
          t={t} d={d} />
        <MonthRange available={availMonths} selected={selMonths} onChange={setSelMonths} t={t} d={d} />

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {grouped.length > 0 && (
            <div style={{ display: "flex", border: `1px solid ${t.line}`, borderRadius: 7, overflow: "hidden", height: 30 }}>
              <Seg active={collapsed.size === 0} onClick={expandAll} t={t}>Buka semua</Seg>
              <Seg active={collapsed.size === grouped.length && grouped.length > 0} onClick={collapseAll} t={t}>Tutup semua</Seg>
            </div>
          )}
          {activeFilterCount > 0 && (
            <button onClick={clearAll} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 30, padding: "0 11px",
              border: `1px solid ${t.line}`, background: t.surface, color: t.mute,
              borderRadius: 7, fontSize: 12.5, cursor: "pointer", fontFamily: FONT_SANS,
            }}>
              <RotateCcw size={13} strokeWidth={1.8} /> Reset <span style={{ color: t.mute2 }}>({activeFilterCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 18, marginBottom: 12, fontSize: 11.5, color: t.mute, flexWrap: "wrap", alignItems: "center" }}>
        <LegItem dot="#32BCAD" label="Laba positif" t={t} />
        <LegItem dot={t.neg}   label="Rugi"         t={t} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: 2,
            background: "linear-gradient(90deg, rgba(50,188,173,0.5), rgba(50,188,173,0.2))",
            border: "1px solid rgba(50,188,173,0.3)",
          }} />
          <span>Kolom YTD</span>
        </div>
        <span style={{ marginLeft: "auto", color: t.mute2 }}>
          Klik baris partner untuk lipat · arahkan kursor untuk nilai penuh
        </span>
      </div>

      {/* Table */}
      <div style={{
        border: `1px solid ${t.line}`, borderRadius: 10,
        background: t.surface, overflow: "hidden",
      }}>
        <div style={{ overflowX: "auto", overflowY: "visible" }}>
          <table style={{
            borderCollapse: "collapse", width: "100%",
            minWidth: 280 + 70 + activeMths.length * 96 + 120,
          }}>
            <colgroup>
              <col style={{ width: 280 }} />
              <col style={{ width: 70 }} />
              {activeMths.map(m => <col key={m} style={{ width: 96 }} />)}
              <col style={{ width: 120, background: t.ytd }} />
            </colgroup>

            <thead>
              <tr>
                <Th align="left"  style={{ paddingLeft: 18 }} t={t}>Branch</Th>
                <Th align="left" t={t}>Tipe</Th>
                {activeMths.map(m => {
                  const s = MONTHS_SHORT[MONTHS_FULL.indexOf(m)];
                  return <Th key={m} align="right" t={t}>{s.toUpperCase()}</Th>;
                })}
                <Th align="right" style={{ paddingRight: 18, color: "#32BCAD", fontWeight: 700 }} t={t}>YTD</Th>
              </tr>
            </thead>

            <tbody>
              {grouped.length === 0 && (
                <tr>
                  <td colSpan={2 + activeMths.length + 1} style={{
                    padding: "72px 0", textAlign: "center", color: t.mute2, fontSize: 13.5,
                  }}>Tidak ada data untuk filter yang dipilih.</td>
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

                return (
                  <Fragment key={g.partner}>
                    {/* Partner band row */}
                    <tr style={{ background: t.partner }}>
                      <td colSpan={2} style={{
                        padding: "14px 18px",
                        borderTop: gi === 0 ? "none" : `1px solid ${t.line}`,
                        borderBottom: `1px solid ${t.line}`,
                      }}>
                        <button onClick={() => togglePartner(g.partner)} style={{
                          display: "inline-flex", alignItems: "center", gap: 10,
                          border: "none", background: "none", cursor: "pointer",
                          color: t.ink, padding: 0, fontFamily: FONT_SANS, textAlign: "left",
                        }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 18, height: 18, color: t.mute,
                          }}>
                            {isC ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em" }}>
                            {g.partner}
                          </span>
                          <span style={{
                            display: "inline-block", padding: "1px 7px", borderRadius: 99,
                            background: "rgba(237,28,36,0.08)",
                            fontSize: 11, fontWeight: 600,
                            color: "#ED1C24",
                            border: "1px solid rgba(237,28,36,0.18)",
                          }}>{g.branches.length} branch</span>
                        </button>
                      </td>
                      {activeMths.map(m => (
                        <MonthCell key={m} md={pMth[m]} label={`${g.partner} · ${m}`}
                          setTooltip={setTooltip} t={t} partner />
                      ))}
                      <YTDCell rev={pYTD.rev} exp={pYTD.exp} label={`${g.partner} · YTD`}
                        setTooltip={setTooltip} t={t} partner />
                    </tr>

                    {/* Branch rows */}
                    {!isC && g.branches.map((b, bi) => {
                      const yt = ytdOf(b.months);
                      return (
                        <tr key={b.branch + b.mpc} style={{
                          borderBottom: bi === g.branches.length - 1 ? "none" : `1px solid ${t.line2}`,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = t.hover}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td style={{ padding: "10px 18px", fontSize: 13.5, color: t.ink, fontWeight: 500 }}>
                            {b.branch}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <TypePill mpc={b.mpc} t={t} />
                          </td>
                          {activeMths.map(m => (
                            <MonthCell key={m} md={b.months[m]} label={`${b.branch} · ${m}`}
                              setTooltip={setTooltip} t={t} />
                          ))}
                          <YTDCell rev={yt.rev} exp={yt.exp} label={`${b.branch} · YTD`}
                            setTooltip={setTooltip} t={t} />
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>

            {/* Grand total */}
            {filteredRows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: `2px solid #ED1C24`, background: t.surface2 }}>
                  <td colSpan={2} style={{ padding: "14px 18px" }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: t.ink,
                      letterSpacing: "0.02em", textTransform: "uppercase",
                    }}>Grand Total</div>
                    <div style={{ fontSize: 11.5, color: t.mute, marginTop: 2 }}>
                      {filteredRows.length} branch · {grouped.length} partner
                    </div>
                  </td>
                  {activeMths.map(m => (
                    <MonthCell key={m} md={gtMth[m]} label={`Grand Total · ${m}`}
                      setTooltip={setTooltip} t={t} grand />
                  ))}
                  <YTDCell rev={gtRev} exp={gtExp} label="Grand Total · YTD"
                    setTooltip={setTooltip} t={t} grand />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Footnote */}
      <div style={{
        marginTop: 14, fontSize: 11.5, color: t.mute2,
        display: "flex", flexWrap: "wrap", gap: 14,
      }}>
        <span>Sumber: <span style={{ color: t.mute }}>pnl_reports</span></span>
        <span>Tahun {activeYear}</span>
        <span>YTD dari bulan terpilih{activeYear === curYear ? ` · sampai ${MONTHS_SHORT[curMIdx]} ${curYear}` : ""}</span>
        <span>Nilai disingkat (rb, Jt, M) · arahkan kursor untuk nilai penuh</span>
      </div>

      {/* Tooltip */}
      {tooltip && typeof document !== "undefined" && createPortal(
        <div style={{
          position: "fixed",
          top: tooltip.y + 18,
          left: Math.min(tooltip.x + 14, window.innerWidth - 260),
          background: t.surface, border: `1px solid ${t.line}`, borderRadius: 8,
          padding: "10px 14px", zIndex: 2147483647, pointerEvents: "none",
          boxShadow: d
            ? "0 8px 24px rgba(0,0,0,0.45)"
            : "0 8px 24px rgba(0,0,0,0.10)",
          minWidth: 220, fontFamily: FONT_SANS,
        }}>
          <div style={{ fontSize: 11, color: t.mute, marginBottom: 8, fontWeight: 500 }}>
            {tooltip.label}
          </div>
          <Kv label="Pendapatan" value={fFull(tooltip.rev)} t={t} />
          <Kv label="Pengeluaran" value={fFull(tooltip.exp)} t={t} />
          <div style={{ height: 1, background: t.line2, margin: "6px 0" }} />
          <Kv label="Laba bersih" value={fFull(tooltip.rev - tooltip.exp)}
              tone={tooltip.rev - tooltip.exp >= 0 ? "pos" : "neg"} t={t} />
        </div>,
        document.body
      )}
    </div>
  );
}