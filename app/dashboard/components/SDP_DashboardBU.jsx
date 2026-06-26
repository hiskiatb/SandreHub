"use client";
/**
 * SDP_DashboardBU.jsx
 * Dashboard Status BU untuk SPM Sumatera.
 *
 * Layout:
 *   Period selector
 *   → KPI row: Total | Sudah Diisi | BSM Approved | Belum
 *   → Progress per Area (bar per type)
 *   → Tabel detail per Branch (collapsible)
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw, ChevronDown, ChevronRight, Loader2,
  CheckCircle2, Clock, AlertCircle, BarChart3, Users,
  TrendingUp, Calendar,
} from "lucide-react";

// ─── Theme ─────────────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg   : d ? "#0D0D0F" : "#F2F4F7",
  card : d ? "#17171B" : "#FFFFFF",
  sub  : d ? "#1D1D22" : "#F8F9FA",
  line : d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi   : d ? "#F1F1F4" : "#0F1117",
  mid  : d ? "#8A8A9C" : "#6B7280",
  lo   : d ? "#4A4A5E" : "#A0A8B4",
  teal : "#32BCAD",
  tealD: "#1A9E90",
  tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)",
  tealBd: d ? "rgba(50,188,173,.3)"  : "rgba(26,158,144,.2)",
  blue : d ? "#0A84FF" : "#2563EB",
  blueBg: d ? "rgba(10,132,255,.1)"  : "rgba(37,99,235,.07)",
  blueBd: d ? "rgba(10,132,255,.25)" : "rgba(37,99,235,.18)",
  G    : d ? "#30D158" : "#16A34A",
  GL   : d ? "rgba(48,209,88,.1)"    : "rgba(22,163,74,.07)",
  GB   : d ? "rgba(48,209,88,.25)"   : "rgba(22,163,74,.2)",
  A    : d ? "#FFD60A" : "#D97706",
  AL   : d ? "rgba(255,214,10,.1)"   : "rgba(217,119,6,.07)",
  AB   : d ? "rgba(255,214,10,.25)"  : "rgba(217,119,6,.2)",
  R    : d ? "#FF453A" : "#DC2626",
  RL   : d ? "rgba(255,69,58,.1)"    : "rgba(220,38,38,.07)",
  RB   : d ? "rgba(255,69,58,.25)"   : "rgba(220,38,38,.2)",
  sm   : d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md   : d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const currentPeriod = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
};

const periodLabel = (p) => {
  if (!p) return "";
  const [y, m] = p.split("-");
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${months[parseInt(m) - 1]} ${y}`;
};

// Generate last 6 periods
const recentPeriods = () => {
  const out = [];
  const n = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
};

// Status config
const STATUS_CFG = {
  BELUM    : { label: "Belum",    short: "Belum",    key: "belum"    },
  DRAFT    : { label: "Draft",    short: "Draft",    key: "draft"    },
  SUBMIT   : { label: "Submit",   short: "Submit",   key: "submit"   },
  SELESAI  : { label: "Selesai",  short: "Selesai",  key: "selesai"  },
  APPROVE  : { label: "Selesai",  short: "Selesai",  key: "selesai"  },
  TERMINATE: { label: "Terminate",short: "Term.",    key: "terminate"},
};
const normalize = (s) => {
  if (!s || s === "BELUM") return "BELUM";
  return STATUS_CFG[s]?.key === "selesai" ? "SELESAI" : (s || "BELUM");
};

const AREA_ORDER = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const AREA_SHORT = { "NORTH SUMATERA": "North", "CENTRAL SUMATERA": "Central", "SOUTH SUMATERA": "South" };

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color, bg, bd, t }) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 14,
      background: t.card, border: `1px solid ${t.line}`,
      boxShadow: t.sm,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: bg, border: `1px solid ${bd}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={16} color={color} />
        </div>
        {sub != null && (
          <span style={{
            fontSize: 11, fontWeight: 700, color,
            background: bg, border: `1px solid ${bd}`,
            padding: "2px 7px", borderRadius: 5,
          }}>
            {sub}
          </span>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: t.hi, letterSpacing: -1, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: t.mid, marginTop: 4, fontWeight: 600 }}>
        {label}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color, height = 7 }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        height, borderRadius: 99,
        background: "rgba(128,128,128,.12)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 99,
          width: `${pct}%`,
          background: color,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

function TypePill({ label, count, total, colorBg, colorText, colorBd }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 10px", borderRadius: 8,
      background: colorBg, border: `1px solid ${colorBd}`,
      fontSize: 12, fontWeight: 700,
    }}>
      <span style={{ color: colorText }}>{label}</span>
      <span style={{ color: colorText, opacity: .85 }}>{count}</span>
      <span style={{ color: colorText, opacity: .5, fontWeight: 500 }}>({pct}%)</span>
    </div>
  );
}

function AreaCard({ area, rows, t }) {
  const total      = rows.length;
  const selesai    = rows.filter(r => normalize(r.form_status) === "SELESAI").length;
  const submit     = rows.filter(r => r.form_status === "SUBMIT").length;
  const draft      = rows.filter(r => r.form_status === "DRAFT").length;
  const belum      = rows.filter(r => normalize(r.form_status) === "BELUM").length;
  const terminated = rows.filter(r => r.terminate_status === "TERMINATED").length;
  const akanTerm   = rows.filter(r => r.terminate_status === "ACTIVE (S/D TGL 1 BULAN DEPAN)").length;
  const im3      = rows.filter(r => r.type === "MITRA IM3").length;
  const kiosk    = rows.filter(r => r.type === "3KIOSK").length;
  const im3done  = rows.filter(r => r.type === "MITRA IM3" && normalize(r.form_status) === "SELESAI").length;
  const kioskdone= rows.filter(r => r.type === "3KIOSK"    && normalize(r.form_status) === "SELESAI").length;
  const pct      = total > 0 ? Math.round((selesai / total) * 100) : 0;

  const barColor = pct >= 80 ? t.G : pct >= 40 ? t.teal : t.A;

  return (
    <div style={{
      padding: "18px 20px", borderRadius: 14,
      background: t.card, border: `1px solid ${t.line}`,
      boxShadow: t.sm,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.hi, letterSpacing: -0.2 }}>
            {AREA_SHORT[area] ?? area}
          </div>
          <div style={{ fontSize: 11, color: t.mid, marginTop: 1 }}>
            {area}
          </div>
        </div>
        <div style={{
          fontSize: 20, fontWeight: 800, color: barColor, letterSpacing: -0.5,
        }}>
          {pct}%
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <ProgressBar value={selesai} max={total} color={barColor} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 10.5, color: t.mid }}>{selesai} selesai dari {total}</span>
          <span style={{ fontSize: 10.5, color: t.A }}>{belum} belum</span>
        </div>
      </div>

      {/* Type breakdown */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <TypePill label="IM3"    count={im3done}   total={im3}    colorBg={t.tealBg} colorText={t.tealD} colorBd={t.tealBd} />
        <TypePill label="3KIOSK" count={kioskdone} total={kiosk}  colorBg={t.blueBg} colorText={t.blue}  colorBd={t.blueBd} />
      </div>

      {/* Mini status row */}
      {(submit > 0 || draft > 0 || terminated > 0 || akanTerm > 0) && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {draft > 0 && (
            <span style={{ fontSize: 10.5, color: t.blue, fontWeight: 600 }}>
              {draft} draft
            </span>
          )}
          {submit > 0 && (
            <span style={{ fontSize: 10.5, color: t.tealD, fontWeight: 600 }}>
              {submit} menunggu BSM
            </span>
          )}
          {akanTerm > 0 && (
            <span style={{ fontSize: 10.5, color: t.A, fontWeight: 600 }}>
              {akanTerm} akan terminate
            </span>
          )}
          {terminated > 0 && (
            <span style={{ fontSize: 10.5, color: t.R, fontWeight: 600 }}>
              {terminated} terminated
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Shared grid columns: chevron | label | total | selesai | draft | submit | belum | %
const GRID = "28px 1fr 70px 70px 60px 70px 60px 64px";

function statOf(rows) {
  const total   = rows.length;
  const selesai = rows.filter(r => normalize(r.form_status) === "SELESAI").length;
  const submit  = rows.filter(r => r.form_status === "SUBMIT").length;
  const draft   = rows.filter(r => r.form_status === "DRAFT").length;
  const belum   = rows.filter(r => normalize(r.form_status) === "BELUM").length;
  const pct     = total > 0 ? Math.round((selesai / total) * 100) : 0;
  return { total, selesai, submit, draft, belum, pct };
}

function TypeSection({ typeLabel, rows, t, isIM3 }) {
  const { total, selesai, submit, draft, belum, pct } = statOf(rows);
  const color   = isIM3 ? t.tealD : t.blue;
  const colorBg = isIM3 ? t.tealBg : t.blueBg;
  const colorBd = isIM3 ? t.tealBd : t.blueBd;
  const barColor= pct >= 80 ? t.G : pct >= 40 ? t.teal : t.A;

  // Group by cluster
  const clusters = {};
  for (const r of rows) {
    if (!clusters[r.cluster]) clusters[r.cluster] = [];
    clusters[r.cluster].push(r);
  }

  return (
    <>
      {/* Type sub-header */}
      <div style={{
        display: "grid", gridTemplateColumns: GRID, gap: 4,
        alignItems: "center",
        padding: "8px 16px 8px 36px",
        background: colorBg,
        borderBottom: `1px solid ${t.line}`,
      }}>
        <div />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 10.5, fontWeight: 800, color,
            border: `1px solid ${colorBd}`,
            padding: "1px 7px", borderRadius: 5,
            letterSpacing: 0.3,
          }}>
            {typeLabel}
          </span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.hi, textAlign: "right" }}>{total}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.G, textAlign: "right" }}>{selesai || "-"}</div>
        <div style={{ fontSize: 12, color: t.blue, textAlign: "right" }}>{draft || "-"}</div>
        <div style={{ fontSize: 12, color: t.tealD, textAlign: "right" }}>{submit || "-"}</div>
        <div style={{ fontSize: 12, color: t.A, textAlign: "right" }}>{belum}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: barColor, textAlign: "right" }}>{pct}%</div>
      </div>

      {/* Cluster rows under this type */}
      {Object.entries(clusters).sort(([a],[b]) => a.localeCompare(b)).map(([cluster, cRows]) => {
        const s = statOf(cRows);
        return (
          <div key={cluster} style={{
            display: "grid", gridTemplateColumns: GRID, gap: 4,
            alignItems: "center",
            padding: "6px 16px 6px 52px",
            background: t.sub,
            borderBottom: `1px solid ${t.line}`,
          }}>
            <div />
            <div style={{ fontSize: 11.5, color: t.mid }}>{cluster}</div>
            <div style={{ fontSize: 11.5, color: t.lo, textAlign: "right" }}>{s.total}</div>
            <div style={{ fontSize: 11.5, color: t.G,     textAlign: "right" }}>{s.selesai || "-"}</div>
            <div style={{ fontSize: 11.5, color: t.blue,  textAlign: "right" }}>{s.draft   || "-"}</div>
            <div style={{ fontSize: 11.5, color: t.tealD, textAlign: "right" }}>{s.submit  || "-"}</div>
            <div style={{ fontSize: 11.5, color: t.A,     textAlign: "right" }}>{s.belum}</div>
            <div style={{ fontSize: 11, color: t.lo, textAlign: "right" }}>{s.pct}%</div>
          </div>
        );
      })}
    </>
  );
}

function BranchRow({ branch, rows, t, isOpen, onToggle }) {
  const { total, selesai, submit, draft, belum, pct } = statOf(rows);
  const barColor = pct >= 80 ? t.G : pct >= 40 ? t.teal : t.A;

  const im3Rows   = rows.filter(r => r.type === "MITRA IM3");
  const kioskRows = rows.filter(r => r.type === "3KIOSK");

  // Inline mini badges for collapsed state
  const im3Pct   = im3Rows.length   > 0 ? Math.round((im3Rows.filter(r => normalize(r.form_status) === "SELESAI").length / im3Rows.length) * 100) : 0;
  const kioskPct = kioskRows.length > 0 ? Math.round((kioskRows.filter(r => normalize(r.form_status) === "SELESAI").length / kioskRows.length) * 100) : 0;

  return (
    <div>
      {/* Branch header */}
      <div
        onClick={onToggle}
        style={{
          display: "grid", gridTemplateColumns: GRID, gap: 4,
          alignItems: "center",
          padding: "11px 16px",
          cursor: "pointer",
          borderBottom: `1px solid ${t.line}`,
          background: isOpen ? (t.tealBg) : "transparent",
          transition: "background 0.12s",
        }}
      >
        <div style={{ color: t.lo }}>
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: t.hi }}>{branch}</span>
          {/* Collapsed type badges */}
          {!isOpen && (
            <div style={{ display: "flex", gap: 5 }}>
              {im3Rows.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: t.tealD, background: t.tealBg,
                  border: `1px solid ${t.tealBd}`,
                  padding: "1px 6px", borderRadius: 4,
                }}>
                  IM3 {im3Pct}%
                </span>
              )}
              {kioskRows.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: t.blue, background: t.blueBg,
                  border: `1px solid ${t.blueBd}`,
                  padding: "1px 6px", borderRadius: 4,
                }}>
                  3K {kioskPct}%
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, textAlign: "right" }}>{total}</div>
        <div style={{ fontSize: 12, color: t.G, fontWeight: 600, textAlign: "right" }}>{selesai}</div>
        <div style={{ fontSize: 12, color: t.blue, textAlign: "right" }}>{draft || "-"}</div>
        <div style={{ fontSize: 12, color: t.tealD, textAlign: "right" }}>{submit || "-"}</div>
        <div style={{ fontSize: 12, color: t.A, textAlign: "right" }}>{belum}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: barColor, textAlign: "right" }}>{pct}%</div>
      </div>

      {/* Expanded: type sections */}
      {isOpen && (
        <>
          {im3Rows.length > 0 && (
            <TypeSection typeLabel="MITRA IM3" rows={im3Rows}   t={t} isIM3={true}  />
          )}
          {kioskRows.length > 0 && (
            <TypeSection typeLabel="3KIOSK"    rows={kioskRows} t={t} isIM3={false} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SDP_DashboardBU({ supabase, theme = "dark" }) {
  const d = theme === "dark";
  const t = mk(d);

  const [period,    setPeriod]    = useState(currentPeriod());
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [openBranch,setOpenBranch]= useState({});
  const [areaFilter,setAreaFilter]= useState("ALL");
  const [typeFilter,setTypeFilter]= useState("ALL");
  const [availPeriods, setAvailPeriods] = useState([]);
  const [fetchErr,    setFetchErr]    = useState("");

  const periods = useMemo(() => recentPeriods(), []);

  // Auto-select most recent period that has data
  useEffect(() => {
    if (!supabase) return;
    supabase.from("sdp_master").select("period")
      .order("period", { ascending: false }).limit(1)
      .then(({ data }) => {
        const latest = data?.[0]?.period;
        if (latest) setPeriod(latest);
      });
    supabase.from("sdp_master").select("period")
      .then(({ data }) => {
        const ps = [...new Set((data||[]).map(r=>r.period))].sort().reverse();
        setAvailPeriods(ps);
      });
  }, [supabase]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (p) => {
    if (!p) return;
    setLoading(true);
    try {
      const [masterRes, monthlyRes] = await Promise.all([
        supabase.from("sdp_master")
          .select("sdp_id,sdp_type,sdp_name,area,branch,cluster,region")
          .eq("period", p),
        supabase.from("sdp_monthly_data")
          .select("sdp_id,form_status,bsm_status,terminate_status")
          .eq("period", p),
      ]);

      if (masterRes.error) throw masterRes.error;
      if (monthlyRes.error) throw monthlyRes.error;

      const mMap = new Map((monthlyRes.data || []).map(r => [r.sdp_id, r]));
      const flat = (masterRes.data || []).map(r => ({
        sdp_id          : r.sdp_id,
        type            : r.sdp_type,
        name            : r.sdp_name,
        area            : r.area,
        branch          : r.branch,
        cluster         : r.cluster,
        form_status     : mMap.get(r.sdp_id)?.form_status     ?? "BELUM",
        bsm_status      : mMap.get(r.sdp_id)?.bsm_status      ?? "PENDING",
        terminate_status: mMap.get(r.sdp_id)?.terminate_status ?? null,
      }));

      setData(flat);
      setLastFetch(new Date());
    } catch (err) {
      console.error("DashboardBU fetch error:", err);
      setFetchErr(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { if (period) fetchData(period); }, [period, fetchData]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => data.filter(r => {
    if (areaFilter !== "ALL" && r.area !== areaFilter) return false;
    if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
    return true;
  }), [data, areaFilter, typeFilter]);

  const total       = filtered.length;
  const selesai     = filtered.filter(r => normalize(r.form_status) === "SELESAI").length;
  const submit      = filtered.filter(r => r.form_status === "SUBMIT").length;
  const draft       = filtered.filter(r => r.form_status === "DRAFT").length;
  const belum       = filtered.filter(r => normalize(r.form_status) === "BELUM").length;
  const bsmApprv    = filtered.filter(r => r.bsm_status === "APPROVED").length;
  const terminated  = filtered.filter(r => r.terminate_status === "TERMINATED").length;
  const akanTerm    = filtered.filter(r => r.terminate_status === "ACTIVE (S/D TGL 1 BULAN DEPAN)").length;
  const overallPct  = total > 0 ? Math.round((selesai / total) * 100) : 0;

  // Group by area
  const byArea = useMemo(() => {
    const m = {};
    for (const r of filtered) {
      if (!m[r.area]) m[r.area] = [];
      m[r.area].push(r);
    }
    return m;
  }, [filtered]);

  // Group by branch (for table)
  const byBranch = useMemo(() => {
    const m = {};
    for (const r of filtered) {
      if (!m[r.branch]) m[r.branch] = [];
      m[r.branch].push(r);
    }
    return m;
  }, [filtered]);

  const toggleBranch = (br) =>
    setOpenBranch(prev => ({ ...prev, [br]: !prev[br] }));

  const areas = Object.keys(byArea).sort((a, b) =>
    AREA_ORDER.indexOf(a) - AREA_ORDER.indexOf(b));

  const branches = Object.keys(byBranch).sort();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FF, color: t.hi }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20, flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3, color: t.hi }}>
            Dashboard Status BU
          </div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>
            {total} SDP aktif · periode {periodLabel(period)}
            {lastFetch && (
              <span style={{ marginLeft: 8, color: t.lo }}>
                · diperbarui {lastFetch.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Period selector */}
          <div style={{ position: "relative" }}>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              style={{
                height: 36, padding: "0 32px 0 12px",
                borderRadius: 9, fontFamily: FF, fontSize: 13,
                fontWeight: 600, color: t.hi,
                background: t.card, border: `1px solid ${t.line}`,
                outline: "none", cursor: "pointer",
                appearance: "none", WebkitAppearance: "none",
              }}
            >
              {(availPeriods.length > 0 ? availPeriods : periods).map(p => (
                <option key={p} value={p}>{periodLabel(p)}</option>
              ))}
            </select>
            <Calendar size={13} color={t.lo} style={{
              position: "absolute", right: 10, top: "50%",
              transform: "translateY(-50%)", pointerEvents: "none",
            }} />
          </div>
          {/* Refresh */}
          <button
            onClick={() => fetchData(period)}
            disabled={loading}
            style={{
              width: 36, height: 36, borderRadius: 9, cursor: "pointer",
              background: t.tealBg, border: `1px solid ${t.tealBd}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: t.tealD,
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {fetchErr && (
        <div style={{ padding: "10px 14px", marginBottom: 12, borderRadius: 8,
          background: t.RL, border: `1px solid ${t.RB}`, color: t.R, fontSize: 12 }}>
          ⚠ Error: {fetchErr}
        </div>
      )}

      {loading && data.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: t.mid }}>
          <Loader2 size={28} color={t.teal} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          <div style={{ fontSize: 13 }}>Memuat data…</div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard icon={Users}       label="Total SDP Aktif"    value={total}      sub={null}             color={t.teal} bg={t.tealBg} bd={t.tealBd} t={t} />
            <KpiCard icon={CheckCircle2}label="Sudah Selesai"      value={selesai}    sub={`${overallPct}%`} color={t.G}    bg={t.GL}    bd={t.GB}    t={t} />
            <KpiCard icon={Clock}       label="Menunggu BSM"       value={submit}     sub={null}             color={t.blue} bg={t.blueBg} bd={t.blueBd} t={t} />
            <KpiCard icon={AlertCircle} label="Belum Diisi"        value={belum}      sub={null}             color={t.A}    bg={t.AL}    bd={t.AB}    t={t} />
            <KpiCard icon={AlertCircle} label="Akan Terminate"     value={akanTerm}   sub={null}             color={t.A}    bg={t.AL}    bd={t.AB}    t={t} />
            <KpiCard icon={AlertCircle} label="Terminated"         value={terminated} sub={null}             color={t.R}    bg={t.RL}    bd={t.RB}    t={t} />
          </div>

          {/* Type + Area filter pills */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {["ALL", "MITRA IM3", "3KIOSK"].map(f => (
              <button key={f} onClick={() => setTypeFilter(f)} style={{
                height: 30, padding: "0 13px", borderRadius: 7, cursor: "pointer",
                fontFamily: FF, fontSize: 12, fontWeight: 600,
                background: typeFilter === f ? t.blueBg : t.sub,
                color:      typeFilter === f ? t.blue   : t.mid,
                border: `1px solid ${typeFilter === f ? t.blueBd : t.line}`,
                transition: "all 0.12s",
              }}>
                {f === "ALL" ? "Semua Tipe" : f}
              </button>
            ))}
            <div style={{ width: 1, background: t.line, margin: "0 4px" }} />
            {["ALL", ...AREA_ORDER].map(f => (
              <button key={f} onClick={() => setAreaFilter(f)} style={{
                height: 30, padding: "0 13px", borderRadius: 7, cursor: "pointer",
                fontFamily: FF, fontSize: 12, fontWeight: 600,
                background: areaFilter === f ? t.tealBg : t.sub,
                color:      areaFilter === f ? t.tealD  : t.mid,
                border: `1px solid ${areaFilter === f ? t.tealBd : t.line}`,
                transition: "all 0.12s",
              }}>
                {f === "ALL" ? "Semua Area" : (AREA_SHORT[f] ?? f)}
              </button>
            ))}
          </div>

          {/* Area progress cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
            {(areaFilter === "ALL" ? areas : [areaFilter]).map(area => (
              <AreaCard key={area} area={area} rows={byArea[area] ?? []} t={t} />
            ))}
          </div>

          {/* Branch detail table */}
          <div style={{
            borderRadius: 13, overflow: "hidden",
            border: `1px solid ${t.line}`,
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: GRID,
              padding: "10px 16px",
              background: d ? "rgba(255,255,255,.04)" : "#F4F6F8",
              borderBottom: `1px solid ${t.line}`,
              gap: 4,
            }}>
              <div />
              <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, letterSpacing: .4 }}>BRANCH / TYPE / CLUSTER</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textAlign: "right" }}>TOTAL</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.G,   textAlign: "right" }}>SELESAI</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.blue,textAlign: "right" }}>DRAFT</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.tealD,textAlign:"right" }}>SUBMIT</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.A,   textAlign: "right" }}>BELUM</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textAlign: "right" }}>%</div>
            </div>

            {branches.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: t.lo, fontSize: 13 }}>
                Tidak ada data untuk periode ini
              </div>
            ) : (
              branches.map(branch => (
                <BranchRow
                  key={branch}
                  branch={branch}
                  rows={byBranch[branch]}
                  t={t}
                  isOpen={!!openBranch[branch]}
                  onToggle={() => toggleBranch(branch)}
                />
              ))
            )}
          </div>

          {/* Overall progress bar */}
          <div style={{
            marginTop: 16, padding: "14px 18px", borderRadius: 12,
            background: t.card, border: `1px solid ${t.line}`,
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: t.mid, fontWeight: 600 }}>
                  Progress keseluruhan — {periodLabel(period)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: overallPct >= 80 ? t.G : t.A }}>
                  {selesai} / {total} ({overallPct}%)
                </span>
              </div>
              <ProgressBar
                value={selesai} max={total}
                color={overallPct >= 80 ? t.G : overallPct >= 40 ? t.teal : t.A}
                height={9}
              />
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
