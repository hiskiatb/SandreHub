"use client";
/**
 * SDP_Summary.jsx — Ringkasan Siklus SDP (gaya sheet "Summary" HQ).
 * Rollup per Region × Brand dengan rumus siklus bulanan:
 *   LIVE bulan lalu  −  TERMINATE  +  NEW  ±  REBORDERING  =  LIVE bulan ini
 *
 * Sumber data (project kqxnoovrwaxsnpdynbgi):
 *   • LIVE  = jumlah baris sdp_master pada period terkait (brand dari cluster).
 *   • NEW   = sdp_registration (request New/Hybrid) pada bulan siklus.
 *   • TERM  = sdp_termination pada bulan siklus.
 *   • REB   = sdp_rebordering pada bulan siklus.
 *
 * Read-only. Scope: pic_region → region-nya; spm/ioh → seluruh Sumatera.
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Loader2, Info, TableProperties } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const mk = (d) => ({
  bg  : d ? "#0D0D0F" : "#F2F4F7", card: d ? "#161618" : "#FFFFFF",
  sub : d ? "#1C1C20" : "#F6F7F9", line: d ? "#2A2A2F" : "#E4E7EC",
  hi  : d ? "#F1F1F4" : "#17181C", mid: d ? "#8A8A96" : "#5B5B66", lo: d ? "#5A5A68" : "#98A2B3",
  rowAlt: d ? "#1A1A1E" : "#FBFCFD", totalBg: d ? "#232329" : "#E9ECF1",
  green: "#1F9D57", red: "#E5484D", amber: "#E0A32E",
  sm  : d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06)",
  md  : d ? "0 10px 26px rgba(0,0,0,.5)" : "0 10px 26px rgba(23,24,28,.08)",
});

// Warna header kolom (konsisten terang/gelap — mengikuti sheet HQ).
const COL = {
  region: { bg: "#111318", fg: "#FFFFFF" },
  live0 : { bg: "#C67C4E", fg: "#FFFFFF" },   // LIVE bulan lalu (oranye)
  new   : { bg: "#3FA34D", fg: "#FFFFFF" },   // NEW (hijau)
  term  : { bg: "#E5484D", fg: "#FFFFFF" },   // TERMINATE (merah)
  reb   : { bg: "#E0A32E", fg: "#1B1B1B" },   // REBORDERING (kuning)
  live1 : { bg: "#2E6E8E", fg: "#FFFFFF" },   // LIVE bulan ini (biru tua)
  delta : { bg: "#5AA9E6", fg: "#0B2233" },   // +/- (biru muda)
};
const BRAND_BANNER = { IM3: { bg: "#E9C6DD", fg: "#5A2148", label: "MITRA IM3" }, "3ID": { bg: "#CFE3F5", fg: "#123A5A", label: "MITRA 3ID / 3KIOSK" } };

const MONTHS_SHORT = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGT", "SEP", "OKT", "NOV", "DES"];
const MONTHS_FULL  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const pad2 = (n) => String(n).padStart(2, "0");
const shortLabel = (p) => { if (!p) return "—"; const [y, m] = p.split("-"); return `${MONTHS_SHORT[(+m || 1) - 1]}'${String(y).slice(2)}`; };
const fullLabel  = (p) => { if (!p) return "—"; const [y, m] = p.split("-"); return `${MONTHS_FULL[(+m || 1) - 1]} ${y}`; };
const prevPeriod = (p) => { const [y, m] = p.split("-").map(Number); let ny = y, nm = m - 1; if (nm < 1) { nm = 12; ny--; } return `${ny}-${pad2(nm)}`; };
function buildPeriods() { const now = new Date(); const out = []; let y = 2026, m = 6; while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) { out.push(`${y}-${pad2(m)}`); m++; if (m > 12) { m = 1; y++; } } return out.reverse(); }

const brandOfCluster = (c) => String(c || "").toUpperCase().startsWith("CS") ? "3ID" : "IM3";
const normBrand = (b) => { const s = String(b || "").toUpperCase(); return s.includes("3ID") || s.includes("KIOSK") || s === "3" ? "3ID" : "IM3"; };
const REGION_ORDER = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const normRegion = (r) => String(r || "").trim().toUpperCase();

// Peta 'Jul-2026' | '2026-07' | ISO date → 'YYYY-MM'
const MONMAP = { jan:"01",feb:"02",mar:"03",apr:"04",mei:"05",may:"05",jun:"06",jul:"07",agu:"08",agt:"08",aug:"08",sep:"09",okt:"10",oct:"10",nov:"11",des:"12",dec:"12" };
function toYM(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const m = s.match(/^([A-Za-z]{3})[a-z]*[-\s]?(\d{4})/);
  if (m) { const k = m[1].toLowerCase(); return `${m[2]}-${MONMAP[k] || "01"}`; }
  return null;
}

export default function SDP_Summary({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark"; const t = mk(d);
  const role = profile?.role || "";
  const periods = useMemo(() => buildPeriods(), []);
  const [period, setPeriod] = useState(periods[0]);
  const [brand, setBrand] = useState("IM3");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const prev = prevPeriod(period);
  // Scope region: pic_region hanya region-nya; role lain seluruh Sumatera.
  const lockRegion = role === "pic_region" ? normRegion(profile?.region) : null;

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const masterSel = (per) => {
        let q = supabase.from("sdp_master").select("region, cluster, sdp_id").eq("period", per);
        if (lockRegion) q = q.ilike("region", lockRegion);
        return q.limit(20000);
      };
      // LIVE bulan lalu = jumlah master(prev); LIVE bulan ini = jumlah master(period)
      // — angka nyata per bulan agar mudah dibandingkan saat berpindah periode.
      // NEW/TERM/REB = event pada bulan siklus (informatif; melengkapi rumus HQ).
      const [mp, mc, regs, terms, rebs] = await Promise.all([
        masterSel(prev),
        masterSel(period),
        supabase.from("sdp_registration").select("region, brand, request_type, cycle_month, submission_month, created_at").limit(20000),
        supabase.from("sdp_termination").select("region, submitter_brand, submission_month, effective_termination_date, created_at").limit(20000),
        supabase.from("sdp_rebordering").select("existing_region, submitter_brand, effective_date, created_at").limit(20000),
      ]);
      if (mp.error || mc.error) throw (mp.error || mc.error);

      // Struktur akumulator: region → brand → {live0, live1, new, term, reb}
      const acc = {};
      const cell = (reg, br) => {
        const R = normRegion(reg), B = normBrand(br);
        if (lockRegion && R !== lockRegion) return null;
        acc[R] = acc[R] || {}; acc[R][B] = acc[R][B] || { live0: 0, live1: 0, new: 0, term: 0, reb: 0 };
        return acc[R][B];
      };
      (mp.data || []).forEach((r) => { const c = cell(r.region, brandOfCluster(r.cluster)); if (c) c.live0++; });
      (mc.data || []).forEach((r) => { const c = cell(r.region, brandOfCluster(r.cluster)); if (c) c.live1++; });

      const inCycle = (row, ...vals) => vals.map(toYM).find(Boolean) === period;
      (regs.data || []).forEach((r) => {
        if (!inCycle(r, r.cycle_month, r.submission_month, r.created_at)) return;
        if (/update/i.test(r.request_type || "")) return; // hanya kreasi baru (New/Hybrid)
        const c = cell(r.region, r.brand); if (c) c.new++;
      });
      (terms.data || []).forEach((r) => {
        if (!inCycle(r, r.submission_month, r.effective_termination_date, r.created_at)) return;
        const c = cell(r.region, r.submitter_brand); if (c) c.term++;
      });
      (rebs.data || []).forEach((r) => {
        if (!inCycle(r, r.effective_date, r.created_at)) return;
        const c = cell(r.existing_region, r.submitter_brand); if (c) c.reb++;
      });

      setData(acc);
    } catch (e) { setErr(e?.message || String(e)); setData(null); }
    finally { setLoading(false); }
  }, [supabase, period, prev, lockRegion]);
  useEffect(() => { load(); }, [load]);

  // Susun baris untuk brand terpilih.
  const view = useMemo(() => {
    if (!data) return { rows: [], total: null };
    const regions = Object.keys(data);
    const ordered = [
      ...REGION_ORDER.filter((r) => regions.includes(r)),
      ...regions.filter((r) => !REGION_ORDER.includes(r)).sort(),
    ];
    const blank = { live0: 0, live1: 0, new: 0, term: 0, reb: 0 };
    const rows = ordered.map((R) => ({ region: R, ...(data[R]?.[brand] || blank) }));
    const total = rows.reduce((a, r) => ({ live0: a.live0 + r.live0, live1: a.live1 + r.live1, new: a.new + r.new, term: a.term + r.term, reb: a.reb + r.reb }), { ...blank });
    return { rows, total };
  }, [data, brand]);

  const hasAny = view.rows.length > 0;

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4, display: "flex", alignItems: "center", gap: 8 }}>
            <TableProperties size={19} color={t.mid} /> Ringkasan Siklus SDP
          </div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 3 }}>
            Rollup per region — siklus <b>{fullLabel(period)}</b>{lockRegion ? ` · region ${lockRegion}` : " · seluruh Sumatera"}.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Brand toggle */}
          <div style={{ display: "inline-flex", background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: 3 }}>
            {["IM3", "3ID"].map((b) => (
              <button key={b} onClick={() => setBrand(b)} style={{
                border: "none", cursor: "pointer", fontFamily: FF, fontSize: 12.5, fontWeight: 800, padding: "7px 14px", borderRadius: 8,
                background: brand === b ? t.card : "transparent", color: brand === b ? t.hi : t.mid, boxShadow: brand === b ? t.sm : "none",
              }}>{b === "IM3" ? "Mitra IM3" : "Mitra 3ID"}</button>
            ))}
          </div>
          {/* Navigasi periode: ‹ bulan lebih lama · dropdown · bulan lebih baru › */}
          <div style={{ display: "inline-flex", alignItems: "center", background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, boxShadow: t.sm }}>
            <button onClick={() => { const i = periods.indexOf(period); if (i < periods.length - 1) setPeriod(periods[i + 1]); }}
              disabled={periods.indexOf(period) >= periods.length - 1} title="Bulan sebelumnya"
              style={{ width: 34, height: 40, border: "none", background: "none", cursor: periods.indexOf(period) >= periods.length - 1 ? "default" : "pointer", color: periods.indexOf(period) >= periods.length - 1 ? t.lo : t.mid, display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={16} /></button>
            <div style={{ position: "relative" }}>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ appearance: "none", fontFamily: FF, fontSize: 13.5, fontWeight: 800, color: t.hi, background: "transparent", border: "none", borderLeft: `1px solid ${t.line}`, borderRight: `1px solid ${t.line}`, padding: "9px 30px 9px 12px", cursor: "pointer", minWidth: 130 }}>
                {periods.map((p) => <option key={p} value={p}>{fullLabel(p)}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
            </div>
            <button onClick={() => { const i = periods.indexOf(period); if (i > 0) setPeriod(periods[i - 1]); }}
              disabled={periods.indexOf(period) <= 0} title="Bulan berikutnya"
              style={{ width: 34, height: 40, border: "none", background: "none", cursor: periods.indexOf(period) <= 0 ? "default" : "pointer", color: periods.indexOf(period) <= 0 ? t.lo : t.mid, display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={16} /></button>
          </div>
          <button onClick={load} title="Muat ulang" style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RefreshCw size={15} /></button>
        </div>
      </div>

      {/* Rumus */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "9px 12px", borderRadius: 10, background: t.sub, border: `1px solid ${t.line}`, marginBottom: 16, fontSize: 12, color: t.mid }}>
        <Info size={14} color={COL.live1.bg} style={{ flexShrink: 0 }} />
        <span><b>Live {shortLabel(prev)}</b></span><Op>−</Op><span style={{ color: COL.term.bg, fontWeight: 700 }}>Terminate</span>
        <Op>+</Op><span style={{ color: COL.new.bg, fontWeight: 700 }}>New</span>
        <Op>±</Op><span style={{ color: COL.reb.bg, fontWeight: 700 }}>Rebordering</span>
        <Op>=</Op><span style={{ color: COL.live1.bg, fontWeight: 800 }}>Live {shortLabel(period)}</span>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: t.mid }}><Loader2 size={22} className="sdpspin" /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat ringkasan…</div><style>{`.sdpspin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style></div>
      ) : err ? (
        <div style={{ padding: "28px 20px", textAlign: "center", background: t.card, borderRadius: 14, border: `1px solid ${t.line}`, color: t.mid, fontSize: 13 }}>Gagal memuat: {err}</div>
      ) : !hasAny ? (
        <div style={{ padding: "44px 20px", textAlign: "center", color: t.mid, background: t.card, borderRadius: 16, border: `1px solid ${t.line}` }}>
          <TableProperties size={26} style={{ opacity: .5, marginBottom: 8 }} /><div style={{ fontSize: 13.5 }}>Belum ada data untuk {fullLabel(period)}.</div>
        </div>
      ) : (
        <div style={{ background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, boxShadow: t.md, overflow: "hidden" }}>
          {/* Brand banner */}
          <div style={{ background: BRAND_BANNER[brand].bg, color: BRAND_BANNER[brand].fg, fontWeight: 800, fontSize: 13.5, letterSpacing: 0.5, padding: "9px 16px", textAlign: "center", textTransform: "uppercase" }}>
            {BRAND_BANNER[brand].label}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr>
                  <Th c={COL.region} align="left">CIRCLE / REGION</Th>
                  <Th c={COL.live0}>LIVE {shortLabel(prev)}</Th>
                  <Th c={COL.new}>NEW</Th>
                  <Th c={COL.term}>TERMINATE</Th>
                  <Th c={COL.reb}>REBORDERING</Th>
                  <Th c={COL.live1}>LIVE {shortLabel(period)}</Th>
                  <Th c={COL.delta}>+ / −</Th>
                </tr>
              </thead>
              <tbody>
                {/* Total Circle */}
                <Row t={t} region="SUMATERA" r={view.total} total />
                {view.rows.map((r, i) => <Row key={r.region} t={t} region={r.region} r={r} indent alt={i % 2 === 1} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Op({ children }) { return <span style={{ fontWeight: 800, opacity: 0.7, margin: "0 1px" }}>{children}</span>; }

function Th({ c, align = "center", children }) {
  return (
    <th style={{ background: c.bg, color: c.fg, fontWeight: 800, fontSize: 11, letterSpacing: 0.3, textTransform: "uppercase", padding: "10px 12px", textAlign: align, whiteSpace: "nowrap", borderRight: "1px solid rgba(255,255,255,.14)" }}>
      {children}
    </th>
  );
}

function Row({ t, region, r, total = false, indent = false, alt = false }) {
  const delta = (r.live1 || 0) - (r.live0 || 0);
  const dCol = delta > 0 ? t.green : delta < 0 ? t.red : t.mid;
  const bg = total ? t.totalBg : alt ? t.rowAlt : t.card;
  const wTot = total ? 800 : 600;
  const num = (v, col) => (
    <td style={{ padding: total ? "12px" : "10px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: total ? 800 : 700, color: col || t.hi, borderRight: `1px solid ${t.line}`, whiteSpace: "nowrap" }}>{v ?? 0}</td>
  );
  return (
    <tr style={{ background: bg, borderTop: `1px solid ${t.line}` }}>
      <td style={{ padding: total ? "12px 14px" : "10px 14px", paddingLeft: indent ? 26 : 14, fontWeight: wTot, color: t.hi, whiteSpace: "nowrap", borderRight: `1px solid ${t.line}`, textTransform: total ? "uppercase" : "none", letterSpacing: total ? 0.4 : 0 }}>
        {total ? region : region.replace(/ SUMATERA$/i, "")}
        {total ? "" : <span style={{ color: t.lo, fontWeight: 600 }}> Sumatera</span>}
      </td>
      {num(r.live0)}
      {num(r.new, r.new ? t.green : t.mid)}
      {num(r.term, r.term ? t.red : t.mid)}
      {num(r.reb, r.reb ? t.amber : t.mid)}
      {num(r.live1)}
      <td style={{ padding: total ? "12px" : "10px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 800, color: dCol, whiteSpace: "nowrap" }}>
        {delta > 0 ? "+" : ""}{delta}
      </td>
    </tr>
  );
}
