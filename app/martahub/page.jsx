"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { guardMarta, isMartaAdmin } from "../../lib/martaAccess";
import { supabaseMarta } from "../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../lib/martaScope";
import { HubLogo } from "../../components/HubLogo";
import { HubLogoLoader, HubLogoLoaderDark } from "../../components/HubLogoLoader";
import { MapCard } from "./components/SumatraMap";
import { slug, monthKeyYYYYMM, nearestPriorTarget } from "../../lib/activityTarget";

// ─── Constants ────────────────────────────────────────────────────────────────
const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const C = {
  primary:   "#ED1C24",
  primaryL:  "#E23B86",
  primaryD:  "#C6168D",
  accent:    "#FF6F00",
  success:   "#2E7D32",
  successL:  "#E8F5E9",
  warning:   "#F57F17",
  warningL:  "#FFFDE7",
  error:     "#C62828",
  errorL:    "#FFEBEE",
  im3:       "#E53935",
  tri:       "#E23B86",
};

const mk = (d) => ({
  appBg:    d ? "#0A0C10" : "#F0F4FA",
  sidebar:  d ? "#0D1117" : "#FFFFFF",
  surface:  d ? "#111520" : "#FFFFFF",
  card:     d ? "#141824" : "#FFFFFF",
  hover:    d ? "#1A2030" : "#F0F4FA",
  line:     d ? "#1E2435" : "#E3E8F0",
  hi:       d ? "#E8EDF8" : "#0D1117",
  mid:      d ? "#7B8BAD" : "#4A5568",
  lo:       d ? "#4A5A7D" : "#7B8BAD",
  primary:  "#ED1C24",
  primaryBg: d ? "#2A0A14" : "#FCEAEE",
  primaryBd: d ? "#5A1030" : "#F3C6D6",
  success:  "#2E7D32",
  successBg: d ? "#0A2010" : "#E8F5E9",
  warning:  "#F57F17",
  warningBg: d ? "#2A1A00" : "#FFFDE7",
  error:    "#C62828",
  errorBg:  d ? "#2A0808" : "#FFEBEE",
  accent:   "#FF6F00",
  accentBg: d ? "#2A1500" : "#FFF3E0",
});

// ─── Nav Config ───────────────────────────────────────────────────────────────
const NAV = [
  { label: "Dashboard", icon: "grid", path: "dashboard" },
  { section: "ACTIVITY" },
  { label: "Activity Plan", icon: "calendar", path: "activities" },
  { label: "Activity Submission", icon: "send", path: "submission" },
  { label: "Activity Monitoring", icon: "monitor", path: "monitoring" },
  { label: "Calendar", icon: "cal", path: "calendar" },
  { section: "INTELLIGENCE" },
  { label: "Map Intelligence", icon: "map", path: "map" },
  { label: "Productivity Analytics", icon: "chart", path: "analytics" },
  { label: "Performance Insight", icon: "insight", path: "insight" },
  { label: "Leaderboard", icon: "trophy", path: "leaderboard" },
  { label: "Geo Compliance", icon: "pin", path: "geo-compliance" },
  { section: "MANAGEMENT" },
  { label: "Approval Center", icon: "check", path: "approval" },
  { label: "User Management", icon: "users", path: "assignments", route: "/martahub/assignments" },
  { label: "Master Data", icon: "db", path: "master" },
  { label: "System Settings", icon: "settings", path: "settings" },
];

// Rute untuk item nav yang punya halaman tersendiri
const NAV_ROUTES = {
  activities: "/martahub/activities",
  submission: "/martahub/submission",
  monitoring: "/martahub/monitoring",
  calendar: "/martahub/calendar",
  map: "/martahub/map",
  analytics: "/martahub/analytics",
  insight: "/martahub/insight",
  leaderboard: "/martahub/leaderboard",
  "geo-compliance": "/martahub/geo-compliance",
  approval: "/martahub/approval",
  master: "/martahub/master",
  assignments: "/martahub/assignments",
  settings: "/martahub/settings",
};

// ─── Icons ────────────────────────────────────────────────────────────────────
function Icon({ name, size = 16, color = "currentColor" }) {
  const s = { width: size, height: size, flexShrink: 0 };
  const p = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    grid:     <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    calendar: <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    send:     <svg style={s} viewBox="0 0 24 24" {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    monitor:  <svg style={s} viewBox="0 0 24 24" {...p}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
    cal:      <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>,
    map:      <svg style={s} viewBox="0 0 24 24" {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
    chart:    <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    insight:  <svg style={s} viewBox="0 0 24 24" {...p}><path d="M2 20h20M6 20V10M10 20V4M14 20V12M18 20V8"/></svg>,
    trophy:   <svg style={s} viewBox="0 0 24 24" {...p}><path d="M6 9H3.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h2.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16M8 22v-3M16 22v-3M6 2h12v10a6 6 0 0 1-12 0V2z"/></svg>,
    check:    <svg style={s} viewBox="0 0 24 24" {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    db:       <svg style={s} viewBox="0 0 24 24" {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>,
    users:    <svg style={s} viewBox="0 0 24 24" {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    settings: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    bell:     <svg style={s} viewBox="0 0 24 24" {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    sun:      <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon:     <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
    logout:   <svg style={s} viewBox="0 0 24 24" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    arrow:    <svg style={s} viewBox="0 0 24 24" {...p}><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
    filter:   <svg style={s} viewBox="0 0 24 24" {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    pin:      <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    eye:      <svg style={s} viewBox="0 0 24 24" {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    dots:     <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
    chevD:    <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="6 9 12 15 18 9"/></svg>,
    menu:     <svg style={s} viewBox="0 0 24 24" {...p}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    close:      <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    panelClose: <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><path d="M16 15l-3-3 3-3"/></svg>,
    panelOpen:  <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><path d="M14 9l3 3-3 3"/></svg>,
    close:    <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    expand:   <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
    hub:      <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>,
    img:      <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    activity: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    trendUp:  <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    money:    <svg style={s} viewBox="0 0 24 24" {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>,
    percent:  <svg style={s} viewBox="0 0 24 24" {...p}><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  };
  return icons[name] || null;
}

// ─── Mini Sparkline SVG ────────────────────────────────────────────────────────
function Sparkline({ data, color, height = 40 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const w = 120, h = height, pad = 4;
  const xStep = (w - pad * 2) / (data.length - 1);
  const yScale = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const pts = data.map((v, i) => `${pad + i * xStep},${yScale(v)}`).join(" ");
  const areaD = `M${pad},${h} L${pts.split(" ").map((p, i) => i === 0 ? `${p}` : p).join(" L")} L${pad + (data.length - 1) * xStep},${h} Z`;
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${color.replace("#","")})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pad + (data.length - 1) * xStep} cy={yScale(data[data.length - 1])} r="3" fill={color}/>
    </svg>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ data, size = 140, strokeW = 22 }) {
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  let offset = 0;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      {data.map((d, i) => {
        const dash = (d.value / total) * circ;
        const gap = circ - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={d.color} strokeWidth={strokeW}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ─── Line Chart ───────────────────────────────────────────────────────────────
function LineChart({ data, labels, color, height = 140 }) {
  if (!data || data.length < 2) return null;
  const w = 340, h = height, padX = 0, padY = 8;
  const max = Math.max(...data) * 1.1, min = 0;
  const xStep = (w - padX * 2) / (data.length - 1);
  const yScale = (v) => h - padY - ((v - min) / (max - min || 1)) * (h - padY * 2);
  const pts = data.map((v, i) => `${padX + i * xStep},${yScale(v)}`).join(" ");
  const areaD = `M${padX},${h} L${data.map((v, i) => `${padX + i * xStep},${yScale(v)}`).join(" L")} L${padX + (data.length - 1) * xStep},${h} Z`;
  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={`lg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.20"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[25, 50, 75, 100].map(pct => {
          const y = yScale(max * pct / 110);
          return <line key={pct} x1={padX} y1={y} x2={w - padX} y2={y} stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" strokeDasharray="4 4"/>;
        })}
        <path d={areaD} fill={`url(#lg-${color.replace("#","")})`}/>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        {data.map((v, i) => (
          <circle key={i} cx={padX + i * xStep} cy={yScale(v)} r="3.5" fill={color} stroke="white" strokeWidth="1.5"/>
        ))}
        {/* Value labels */}
        {data.map((v, i) => (
          <text key={i} x={padX + i * xStep} y={yScale(v) - 10} textAnchor="middle" fontSize="9" fill={color} fontWeight="700">{v}%</text>
        ))}
      </svg>
      {/* X labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {labels.map((l, i) => (
          <span key={i} style={{ fontSize: 9.5, color: "currentColor", opacity: 0.45 }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Real data: mh_activities → bentuk KPI/Chart/Table Dashboard ─────────────
// (Menggantikan MOCK statis — dihitung dari baris mh_activities asli yang
// sudah discope per TMV via lib/martaScope.js. Formula ikut §9 MARTAHUB_SPEC.md:
//   Achievement % = Σactual_sp / Σtarget_sp × 100
//   Productivity % = Σrevenue / Σcost × 100  (revenue=actual_rev_3m, cost=cost_actual ?? cost_estimate)
//   Geo-compliance % = proporsi baris dengan checkin_valid/geo_compliant = true

const CAT_LABELS = { directSelling: "Direct Selling", sponsorship: "Sponsorship", thematic: "Thematic", jointEvent: "Joint Event", openBooth: "Open Booth", project: "Project" };
const CAT_COLORS = { directSelling: "#ED1C24", sponsorship: "#7B1FA2", thematic: "#E65100", jointEvent: "#00695C", openBooth: "#0277BD", project: "#455A64" };
const NET_LABELS = { strong: "Strong", medium: "Medium", weak: "Weak" };
const NET_COLORS = { strong: "#2E7D32", medium: "#F57F17", weak: "#C62828" };
const STATUS_LABELS = { draft: "Draft", planned: "Planned", checked_in: "Checked In", submitted: "Submitted", approved: "Approved", rejected: "Rejected", revisionRequired: "Revision Required", inProgress: "In Progress", done: "Done", completed: "Completed", cancelled: "Cancelled" };
const STATUS_COLORS = { draft: "#7B8BAD", planned: "#0277BD", checked_in: "#0277BD", submitted: "#F57F17", approved: "#2E7D32", rejected: "#C62828", revisionRequired: "#C62828", inProgress: "#F57F17", done: "#2E7D32", completed: "#2E7D32", cancelled: "#7B8BAD" };
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function titleCase(s) {
  if (!s) return "-";
  return String(s).replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()).trim();
}
function rowCategory(a) {
  const arr = Array.isArray(a.event_categories) ? a.event_categories : null;
  const key = (arr && arr[0]) || a.event_category || null;
  if (!key) return { key: "others", label: "Others", color: "#455A64" };
  return { key, label: CAT_LABELS[key] || titleCase(key), color: CAT_COLORS[key] || "#455A64" };
}
function fmtRupiah(n) {
  const v = n || 0;
  const jt = v / 1_000_000;
  if (Math.abs(jt) >= 1) return `Rp ${jt.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}
function pctStr(n) { return `${Math.round(n || 0)}%`; }
function sumBy(rows, fn) { return rows.reduce((s, r) => s + (fn(r) || 0), 0); }
// Achievement % resmi = Σactual_sp ÷ Σtarget RESMI (mh_activity_target, di-set
// TMV/Brand TMV per Branch×Brand×Bulan) — BUKAN lagi Σtarget yang BME
// declare sendiri per-plan (r.target_sp). Target per-plan BME TETAP dipakai
// utk kolom "Achievement" per-baris di tabel Recent Activity (metrik BEDA:
// progress event itu sendiri vs rencana BME sendiri) — jangan disatukan.
// `ctx` wajib: { branchSlugMap, activityTargets } — lihat lib/activityTarget.js
// utk jembatan branch_id v1(uuid)->v2(slug) & carry-forward bulan terdekat.
function achievementPct(rows, ctx) {
  const a = sumBy(rows, (r) => r.actual_sp);
  if (!ctx) return 0;
  const { branchSlugMap, activityTargets } = ctx;
  const seen = new Set();
  let t = 0;
  for (const r of rows) {
    const bs = branchSlugMap.get(r.branch_id);
    if (!bs || !r.brand || !r.plan_date) continue;
    const mk = monthKeyYYYYMM(r.plan_date);
    const key = `${bs}|${r.brand}|${mk}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const eff = nearestPriorTarget(activityTargets, bs, r.brand, mk);
    if (eff?.target_sp) t += eff.target_sp;
  }
  return t > 0 ? (a / t) * 100 : 0;
}
function productivityPct(rows) {
  const cost = sumBy(rows, (r) => r.cost_actual ?? r.cost_estimate);
  const rev = sumBy(rows, (r) => r.actual_rev_3m);
  return cost > 0 ? (rev / cost) * 100 : 0;
}
function costRatioPct(rows) {
  const rev = sumBy(rows, (r) => r.actual_rev_3m);
  const cost = sumBy(rows, (r) => r.cost_actual ?? r.cost_estimate);
  return rev > 0 ? (cost / rev) * 100 : 0;
}
function geoCompliancePct(rows) {
  const tracked = rows.filter((r) => r.checkin_valid !== null && r.checkin_valid !== undefined ? true : (r.geo_compliant !== null && r.geo_compliant !== undefined));
  if (!tracked.length) return 0;
  const ok = tracked.filter((r) => (r.checkin_valid ?? r.geo_compliant) === true).length;
  return (ok / tracked.length) * 100;
}
function monthKeyOf(dateStr) { return dateStr ? String(dateStr).slice(0, 7) : null; }
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_ABBR[(m || 1) - 1]} ${String(y).slice(2)}`;
}
function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });
}
function breakdown(list, labelOf, colorOf) {
  const counts = new Map();
  for (const r of list) {
    const key = labelOf(r).key;
    const prev = counts.get(key) || { label: labelOf(r).label, color: colorOf(r), value: 0 };
    prev.value += 1;
    counts.set(key, prev);
  }
  const total = list.length;
  return [...counts.values()].sort((a, b) => b.value - a.value).map((c) => ({
    ...c,
    pct: total > 0 ? `${((c.value / total) * 100).toFixed(1)}%` : "0%",
  }));
}

const EMPTY_DASHBOARD = { kpis: [], achieveTrend: { data: [], labels: [] }, productivTrend: { data: [], labels: [] }, eventCategory: [], networkCat: [], activities: [], currentMonthLabel: "", currentCount: 0 };

function computeDashboardData(rows, branchMap, branchSlugMap, activityTargets) {
  if (!rows) return EMPTY_DASHBOARD;
  const targetCtx = { branchSlugMap: branchSlugMap || new Map(), activityTargets: activityTargets || [] };
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
  const prevLabel = monthLabel(prevKey);

  const curRows = rows.filter((r) => monthKeyOf(r.plan_date) === curKey);
  const prevRows = rows.filter((r) => monthKeyOf(r.plan_date) === prevKey);

  const curRevenue = sumBy(curRows, (r) => r.actual_rev_3m);
  const prevRevenue = sumBy(prevRows, (r) => r.actual_rev_3m);
  const curAch = achievementPct(curRows, targetCtx), prevAch = achievementPct(prevRows, targetCtx);
  const curProd = productivityPct(curRows), prevProd = productivityPct(prevRows);
  const curCost = costRatioPct(curRows), prevCost = costRatioPct(prevRows);
  const curGeo = geoCompliancePct(curRows), prevGeo = geoCompliancePct(prevRows);

  const pctDelta = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0));
  const dCount = pctDelta(curRows.length, prevRows.length);
  const dAch = curAch - prevAch, dProd = curProd - prevProd, dCost = curCost - prevCost, dGeo = curGeo - prevGeo;
  const dRev = pctDelta(curRevenue, prevRevenue);
  const sub = (d, unit) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}${unit} vs ${prevLabel}`;

  const monthKeys = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  // Satu lintasan per bulan menghasilkan seluruh 6 seri (dipakai trend chart
  // besar DAN sparkline mini per-KPI) — hindari re-filter rows 6× terpisah.
  const monthlyRowsByKey = monthKeys.map((k) => rows.filter((r) => monthKeyOf(r.plan_date) === k));
  const series = {
    count: monthlyRowsByKey.map((rs) => rs.length),
    achievement: monthlyRowsByKey.map((rs) => Math.round(achievementPct(rs, targetCtx))),
    productivity: monthlyRowsByKey.map((rs) => Math.round(productivityPct(rs))),
    revenue: monthlyRowsByKey.map((rs) => sumBy(rs, (r) => r.actual_rev_3m)),
    costRatio: monthlyRowsByKey.map((rs) => Math.round(costRatioPct(rs))),
    geo: monthlyRowsByKey.map((rs) => Math.round(geoCompliancePct(rs))),
  };
  const achieveTrend = { data: series.achievement, labels: monthKeys.map(monthLabel) };
  const productivTrend = { data: series.productivity, labels: monthKeys.map(monthLabel) };

  const kpis = [
    { label: "Total Activity", value: String(curRows.length), sub: sub(dCount, "%"), trend: dCount >= 0 ? "up" : "down", color: "#2563EB", icon: "activity", spark: series.count },
    { label: "Achievement", value: pctStr(curAch), sub: sub(dAch, "pp"), trend: dAch >= 0 ? "up" : "down", color: C.primary, icon: "trophy", spark: series.achievement, hero: true },
    { label: "Productivity", value: pctStr(curProd), sub: sub(dProd, "pp"), trend: dProd >= 0 ? "up" : "down", color: C.primaryD, icon: "trendUp", spark: series.productivity, hero: true },
    { label: "Revenue (Actual)", value: fmtRupiah(curRevenue), sub: sub(dRev, "%"), trend: dRev >= 0 ? "up" : "down", color: C.accent, icon: "money", spark: series.revenue },
    { label: "Cost Ratio", value: pctStr(curCost), sub: sub(dCost, "pp"), trend: dCost <= 0 ? "up" : "down", color: C.warning, icon: "percent", spark: series.costRatio },
    { label: "Geo Compliance", value: pctStr(curGeo), sub: sub(dGeo, "pp"), trend: dGeo >= 0 ? "up" : "down", color: C.success, icon: "pin", spark: series.geo },
  ];

  const eventCategory = breakdown(curRows, (r) => rowCategory(r), (r) => rowCategory(r).color);
  const networkCat = breakdown(
    curRows,
    (r) => ({ key: r.network_category || "unknown", label: NET_LABELS[r.network_category] || titleCase(r.network_category) || "Belum diketahui" }),
    (r) => NET_COLORS[r.network_category] || "#7B8BAD"
  );

  const activities = curRows.map((r, i) => {
    const cat = rowCategory(r);
    const rev = r.actual_rev_3m ?? 0;
    const cost = r.cost_actual ?? r.cost_estimate ?? 0;
    // Sengaja pakai r.target_sp (target internal per-event, BME isi sendiri
    // saat Create Plan) — BEDA dari KPI "Achievement %" di atas yang sekarang
    // pakai target RESMI dari mh_activity_target. Ini progress event itu
    // sendiri vs rencana BME sendiri, bukan vs target Branch×Brand resmi.
    const ach = r.target_sp ? ((r.actual_sp ?? 0) / r.target_sp) * 100 : null;
    const prod = cost ? (rev / cost) * 100 : null;
    const statusKey = r.status || "draft";
    return {
      no: i + 1,
      name: r.event_name || "-",
      branch: branchMap.get(r.branch_id) || "-",
      cat: cat.label,
      catColor: cat.color,
      planDate: fmtDate(r.plan_date),
      actualDate: fmtDate(r.actual_date),
      target: `${r.target_sp ?? 0}/${r.target_fwa ?? 0}`,
      actual: r.actual_sp == null ? "-" : `${r.actual_sp}/${r.actual_fwa ?? 0}`,
      revenue: fmtRupiah(rev),
      productivity: prod == null ? "-" : pctStr(prod),
      achievement: ach == null ? "-" : pctStr(ach),
      status: STATUS_LABELS[statusKey] || titleCase(statusKey),
      statusColor: STATUS_COLORS[statusKey] || "#7B8BAD",
    };
  });

  return { kpis, achieveTrend, productivTrend, eventCategory, networkCat, activities, currentMonthLabel: monthLabel(curKey), currentCount: curRows.length };
}

// Rute nyata (dari NAV_ROUTES) — sebelumnya tombol-tombol ini tidak punya
// onClick sama sekali (murni dekoratif, klaim aksi yang tidak terjadi apa-apa).
// "Check In (GPS)"/"Upload Document" dihapus dari sini: itu alur mobile-only
// (Check-in & upload foto activity report), web tidak punya halaman utk itu —
// menampilkannya di sini akan menjanjikan sesuatu yang tidak bisa dilakukan.
const QUICK_ACTIONS = [
  { label: "Plan Activity", sub: "Buat plan baru", icon: "calendar", color: "#ED1C24", route: "activities" },
  { label: "Submit Activity", sub: "Catat hasil activity", icon: "send", color: "#7B1FA2", route: "submission" },
  { label: "Activity Monitoring", sub: "Pantau semua activity", icon: "monitor", color: "#0277BD", route: "monitoring" },
  { label: "Activity Calendar", sub: "Jadwal & ketersediaan", icon: "cal", color: "#00695C", route: "calendar" },
  { label: "Approval Center", sub: "Tinjau persetujuan", icon: "check", color: "#E65100", route: "approval" },
];

// ─── Main Component ────────────────────────────────────────────────────────────
export default function MartaHubDashboard() {
  const router = useRouter();
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("hub-theme") !== "light"
      : false
  );
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [scope, setScope] = useState(null);
  const [pendingCount, setPendingCount] = useState(null);
  const [rawActivities, setRawActivities] = useState([]);
  const [branchMap, setBranchMap] = useState(() => new Map());
  // branch_id v1 (uuid, mh_branches) -> slug(nama) v2 (text, sama seperti
  // mh_sites/mh_activity_target) — jembatan utk hitung Achievement % dari
  // target resmi TMV (lib/activityTarget.js, diverifikasi 100% match).
  const [branchSlugMap, setBranchSlugMap] = useState(() => new Map());
  const [activityTargets, setActivityTargets] = useState([]);
  const [dataErr, setDataErr] = useState(null);

  const t = mk(dark);

  // Bentuk KPI/chart/table dari baris mh_activities asli (sudah discope TMV)
  const data = useMemo(
    () => computeDashboardData(rawActivities, branchMap, branchSlugMap, activityTargets),
    [rawActivities, branchMap, branchSlugMap, activityTargets]
  );

  // Titik Activity Map — data ASLI dari mh_activities (evidence, boleh tampil
  // apa adanya sesuai §0.2), MENGGANTIKAN 10 pin kota contoh yang sebelumnya
  // di-hardcode di SumatraMap.jsx (bukan dari database sama sekali).
  const mapActivities = useMemo(() => rawActivities
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map((r) => {
      const statusKey = r.status || "draft";
      return {
        lat: r.latitude, lng: r.longitude,
        name: r.event_name || "-",
        branch: branchMap.get(r.branch_id) || null,
        status: STATUS_LABELS[statusKey] || titleCase(statusKey),
        color: STATUS_COLORS[statusKey] || "#7B8BAD",
      };
    }), [rawActivities, branchMap]);

  // Filter Recent Activity berdasarkan tab status
  const filteredActivities = activeTab === "All"
    ? data.activities
    : data.activities.filter((a) => a.status === activeTab);
  const tabCount = (tab) => tab === "All" ? data.activities.length : data.activities.filter((a) => a.status === tab).length;

  useEffect(() => {
    // Sync theme from hub-theme (set by auth pages), fallback to system preference
    const saved = localStorage.getItem("hub-theme");
    if (saved) setDark(saved !== "light");
    else setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    guardMarta(router, "/martahub").then((res) => {
      if (!res.ok) return; // guard sudah redirect
      setUser(res.session.user);
      setProfile(res.profile);
      setLoading(false);
    });
  }, [router]);

  // Ambil scope TMV + data mh_activities asli (6 bulan terakhir) begitu user login diketahui
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const sc = await getMartaScope(user.email);
        if (cancelled) return;
        setScope(sc);

        let pendingQ = supabaseMarta.from("mh_activities").select("id", { count: "exact", head: true }).eq("status", "submitted");
        pendingQ = await applyMartaScope(pendingQ, sc);
        const { count: pending } = await pendingQ;
        if (!cancelled) setPendingCount(pending ?? 0);

        const { data: branches, error: branchErr } = await supabaseMarta.from("mh_branches").select("id, name");
        if (!cancelled && !branchErr && branches) {
          setBranchMap(new Map(branches.map((b) => [b.id, b.name])));
          setBranchSlugMap(new Map(branches.map((b) => [b.id, slug(b.name)])));
        }

        // Target resmi Achievement % (mh_activity_target, di-set TMV/Brand TMV
        // via Master Data > Target Aktivitas) — tabel kecil, org-wide, RLS
        // select-all, dibaca langsung tanpa RPC (pola sama mh_posmat_target).
        const { data: targets, error: targetErr } = await supabaseMarta
          .from("mh_activity_target")
          .select("branch_id,brand,month,target_sp,target_fwa,target_revenue");
        if (!cancelled && !targetErr && targets) setActivityTargets(targets);

        const since = new Date();
        since.setMonth(since.getMonth() - 5);
        since.setDate(1);
        const sinceISO = since.toISOString().slice(0, 10);

        let q = supabaseMarta
          .from("mh_activities")
          .select("id,status,brand,branch_id,plan_date,actual_date,event_category,event_categories,network_category,target_sp,target_fwa,actual_sp,actual_fwa,cost_estimate,cost_actual,actual_rev_3m,checkin_valid,geo_compliant,event_name,mc,created_at,latitude,longitude")
          .gte("plan_date", sinceISO)
          .order("plan_date", { ascending: false });
        q = await applyMartaScope(q, sc);
        const { data: rows, error } = await q;
        if (cancelled) return;
        if (error) throw new Error(error.message);
        setRawActivities(rows || []);
      } catch (e) {
        if (!cancelled) setDataErr(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  // Responsif: <768 = mobile (sidebar jadi drawer), 768–1200 = auto-collapse
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const m = w < 768;
      setMobile(m);
      if (m) setCollapsed(false);           // drawer selalu tampil penuh
      else { setDrawerOpen(false); setCollapsed(w < 1200); }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/marta/login");
  };

  const toggleNav = () => (mobile ? setDrawerOpen((o) => !o) : setCollapsed((c) => !c));

  // Nama & inisial tampilan dari profil SandraHub
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Pengguna";
  const initial = (profile?.full_name || user?.email || "M").trim()[0]?.toUpperCase() || "M";
  const roleLabel = profile?.role === "spm_sumatera" ? "SPM Sumatera" : (profile?.role || "");

  const SIDEBAR_W = collapsed ? 64 : 240;

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--background,#F4F4F7)" }}>
      <HubLogoLoader variant="marta" logoSize={88} />
    </div>
  );

  return (
    <div className="mh-root" style={{ display: "flex", minHeight: "100vh", background: t.appBg, fontFamily: FONT, color: t.hi }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${dark ? "#1E2435" : "#D1DBF0"};border-radius:99px}
        .mh-nav{transition:background .15s,color .15s}
        .mh-nav:hover{background:${t.hover} !important}
        .mh-card{transition:box-shadow .2s,transform .2s}
        .mh-card:hover{box-shadow:0 8px 24px rgba(0,0,0,0.08) !important;transform:translateY(-1px)}
        .mh-btn{transition:opacity .14s,transform .1s;cursor:pointer;border:none;background:none;font-family:${FONT}}
        .mh-btn:hover{opacity:.8}
        .mh-btn:active{transform:scale(.97)}
        .mh-row:hover td{background:${t.hover} !important}
        @keyframes mh-pulse{0%,100%{opacity:1}50%{opacity:0.5}}

        /* ── Standarisasi dropdown & tombol ────────────────────────────────── */
        .mh-root select{
          -webkit-appearance:none !important; -moz-appearance:none !important; appearance:none !important;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>") !important;
          background-repeat:no-repeat !important; background-position:right 11px center !important;
          background-size:13px !important; padding-right:30px !important; cursor:pointer;
        }
        .mh-root select::-ms-expand{display:none !important;}
        .mh-root button{ white-space:nowrap; }

        /* ── Responsive grids ── */
        .mh-content{padding:20px 24px 40px}
        .mh-brief{display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap}
        .mh-kpi-hero{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
        .mh-kpi-secondary{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
        .mh-charts{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:16px;margin-bottom:16px}
        .mh-donuts{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .mh-qa{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
        .mh-qa-btn{transition:transform .15s,box-shadow .15s}
        .mh-qa-btn:hover{transform:translateY(-2px)}
        .leaflet-container{background:${t.hover}}

        /* Laptop / half-screen */
        @media (max-width:1200px){
          .mh-kpi-secondary{grid-template-columns:repeat(2,1fr)}
          .mh-charts{grid-template-columns:1fr 1fr}
          .mh-qa{grid-template-columns:repeat(3,1fr)}
        }
        @media (max-width:900px){
          .mh-content{padding:16px 16px 32px}
          .mh-charts{grid-template-columns:1fr}
          .mh-donuts{grid-template-columns:1fr}
        }
        /* Mobile */
        @media (max-width:767px){
          .mh-kpi-hero{grid-template-columns:1fr;gap:10px}
          .mh-kpi-secondary{grid-template-columns:repeat(2,1fr);gap:10px}
          .mh-content{padding:14px 12px 28px}
          .mh-topbar{padding:0 14px !important;gap:10px !important}
          .mh-hide-sm{display:none !important}
          .mh-qa{grid-template-columns:repeat(2,1fr)}
        }
        @media (max-width:400px){
          .mh-kpi-secondary{grid-template-columns:1fr}
        }
        @media (prefers-reduced-motion: reduce){
          .mh-qa-btn, .mh-card{transition:none !important}
        }
      `}</style>

      {/* Backdrop untuk drawer mobile */}
      {mobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 290 }} />
      )}

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <div style={ mobile
        ? { width: 240, background: t.sidebar, borderRight: `1px solid ${t.line}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, height: "100vh", overflow: "hidden", zIndex: 300, transform: drawerOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform .25s cubic-bezier(.4,0,.2,1)", boxShadow: drawerOpen ? "0 0 40px rgba(0,0,0,0.3)" : "none" }
        : { width: SIDEBAR_W, minHeight: "100vh", background: t.sidebar, borderRight: `1px solid ${t.line}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflow: "hidden", transition: "width .22s cubic-bezier(.4,0,.2,1)", flexShrink: 0 } }>
        {/* Logo */}
        <div style={{ height: 60, flexShrink: 0, padding: collapsed ? 0 : "0 16px", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10, borderBottom: `1px solid ${t.line}`, cursor: "pointer", position: "relative" }} onClick={() => router.push("/")}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #ED1C24 0%, #C6168D 100%)" }} />
          <div style={{ width: 38, height: 38, flexShrink: 0, margin: collapsed ? "0 auto" : 0 }}>
            <HubLogo variant="marta" size={38} shadow={false} />
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, lineHeight: 1 }}>
                Marta<span style={{ background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
          {NAV.map((item, i) => {
            if (item.section) return (
              !collapsed ? <div key={i} style={{ padding: "14px 8px 6px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", color: t.lo, textTransform: "uppercase" }}>{item.section}</div>
              : <div key={i} style={{ height: 1, background: t.line, margin: "10px 8px" }} />
            );
            const active = activeNav === item.path;
            return (
              <div key={i} className="mh-nav" onClick={() => { const r = NAV_ROUTES[item.path]; if (r) { router.push(r); } else { setActiveNav(item.path); if (mobile) setDrawerOpen(false); } }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "10px 0" : "9px 10px", borderRadius: 9, cursor: "pointer", marginBottom: 1, justifyContent: collapsed ? "center" : "flex-start", background: active ? (dark ? "rgba(237,28,36,0.18)" : "rgba(237,28,36,0.08)") : "transparent", position: "relative" }}
                title={collapsed ? item.label : undefined}
              >
                <span style={{ color: active ? C.primary : t.lo, flexShrink: 0 }}><Icon name={item.icon} size={17} color={active ? C.primary : t.lo} /></span>
                {!collapsed && <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? C.primary : t.mid, flex: 1 }}>{item.label}</span>}
                {!collapsed && item.path === "approval" && !!pendingCount && <span style={{ fontSize: 10, fontWeight: 700, color: "white", background: C.error, borderRadius: 100, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{pendingCount}</span>}
                {active && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 3, background: C.primary, borderRadius: "0 3px 3px 0" }} />}
              </div>
            );
          })}
        </div>

        {/* User */}
        <div style={{ borderTop: `1px solid ${t.line}`, padding: collapsed ? "12px 0" : "12px 12px" }}>
          {!collapsed && user && (
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${C.primary},${C.primaryD})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{initial}</span>
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                <div style={{ fontSize: 10, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{roleLabel}</div>
              </div>
            </div>
          )}
          <button className="mh-btn" onClick={handleLogout}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 8, padding: collapsed ? "8px 0" : "8px 10px", borderRadius: 8, color: t.lo, fontSize: 12, fontWeight: 600 }}>
            <Icon name="logout" size={15} color={t.lo} />
            {!collapsed && "Sign Out"}
          </button>
        </div>
      </div>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Topbar */}
        <div className="mh-topbar" style={{ height: 60, flexShrink: 0, background: t.surface, borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 16, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #ED1C24 0%, #C6168D 100%)" }} />
          <button className="mh-btn" onClick={toggleNav} title={collapsed ? "Buka sidebar" : "Tutup sidebar"} style={{ padding: 6, borderRadius: 7, color: t.mid }}>
            <Icon name={mobile ? (drawerOpen ? "close" : "menu") : (collapsed ? "panelOpen" : "panelClose")} size={18} color={t.mid} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi }}>Dashboard</div>
            <div className="mh-hide-sm" style={{ fontSize: 11, color: t.lo, marginTop: 1 }}>{data.currentMonthLabel}</div>
          </div>
          <div style={{ flex: 1 }} />

          {/* Bell — jumlah nyata dari antrean Approval (pendingCount), bukan dot dekoratif */}
          <button className="mh-btn" onClick={() => router.push("/martahub/approval")} title={pendingCount ? `${pendingCount} menunggu persetujuan` : "Tidak ada yang menunggu persetujuan"} style={{ position: "relative" }}>
            <div style={{ padding: 8, borderRadius: 9, border: `1.5px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="bell" size={17} color={t.mid} />
            </div>
            {!!pendingCount && (
              <div style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 99, background: C.error, border: `1.5px solid ${t.surface}`, color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {pendingCount > 99 ? "99+" : pendingCount}
              </div>
            )}
          </button>

          {/* Dark toggle */}
          <button className="mh-btn" onClick={() => setDark(!dark)} style={{ padding: 8, borderRadius: 9, border: `1.5px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", color: t.mid }}>
            <Icon name={dark ? "sun" : "moon"} size={16} color={t.mid} />
          </button>

          {/* Avatar */}
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${C.primary},${C.primaryD})`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title={`${displayName} · ${roleLabel}`}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{initial}</span>
          </div>
        </div>

        {/* Content */}
        <div className="mh-content" style={{ flex: 1, overflow: "auto" }}>

          {dataErr && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: t.errorBg, border: `1px solid ${C.error}30`, color: C.error, fontSize: 12, fontWeight: 600 }}>
              Gagal memuat data mh_activities: {dataErr}
            </div>
          )}
          {scope && !scope.unscoped && !scope.found && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: t.warningBg, border: `1px solid ${C.warning}30`, color: C.warning, fontSize: 12, fontWeight: 600 }}>
              Email Anda belum terdaftar sebagai profil MartaHub (mh_profiles) — dashboard menampilkan data kosong.
            </div>
          )}

          {/* ── Briefing — periode nyata + status approval nyata (data pendingCount
               sebelumnya sudah di-fetch tapi tidak pernah ditampilkan di konten). ── */}
          <div className="mh-brief">
            <div style={{ fontSize: 13, color: t.mid }}>
              Ringkasan <b style={{ color: t.hi }}>{data.currentMonthLabel}</b> · <b style={{ color: t.hi }}>{data.currentCount}</b> activity tercatat
            </div>
            <div style={{ flex: 1 }} />
            {pendingCount != null && (
              pendingCount > 0 ? (
                <button className="mh-btn" onClick={() => router.push("/martahub/approval")}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 100, background: t.warningBg, border: `1px solid ${C.warning}40` }}>
                  <Icon name="bell" size={13} color={C.warning} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#8a5b00" }}>{pendingCount} menunggu persetujuan</span>
                  <Icon name="arrow" size={12} color="#8a5b00" />
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 100, background: t.successBg }}>
                  <Icon name="check" size={13} color={C.success} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.success }}>Semua approval sudah diproses</span>
                </div>
              )
            )}
          </div>

          {/* ── KPI — 2 metrik utama (hero, dgn sparkline besar) + 4 pendukung ── */}
          <div className="mh-kpi-hero">
            {data.kpis.filter((k) => k.hero).map((kpi, i) => (
              <div key={i} className="mh-card" style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: kpi.color + "16", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon name={kpi.icon} size={16} color={kpi.color} />
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.03em", color: t.mid }}>{kpi.label}</div>
                    </div>
                    <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi, lineHeight: 1, marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>{kpi.value}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 10, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 800 }}>{kpi.trend === "up" ? "▲" : "▼"}</span>
                      <span style={{ fontSize: 11, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 600 }}>{kpi.sub}</span>
                    </div>
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <Sparkline data={kpi.spark} color={kpi.color} height={46} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mh-kpi-secondary">
            {data.kpis.filter((k) => !k.hero).map((kpi, i) => (
              <div key={i} className="mh-card" style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: kpi.color + "16", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={kpi.icon} size={15} color={kpi.color} />
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em", color: t.mid, lineHeight: 1.3 }}>{kpi.label}</div>
                </div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: t.hi, lineHeight: 1, marginBottom: 7, fontVariantNumeric: "tabular-nums" }}>{kpi.value}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 9.5, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 800 }}>{kpi.trend === "up" ? "▲" : "▼"}</span>
                  <span style={{ fontSize: 10, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 600 }}>{kpi.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Charts Row ────────────────────────────────────────────────── */}
          <div className="mh-charts">
            {/* Achievement Trend */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>Achievement Trend</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.lo, background: t.hover, borderRadius: 6, padding: "3px 8px" }}>6 Bulan Terakhir</span>
              </div>
              <div style={{ color: t.lo }}>
                <LineChart data={data.achieveTrend.data} labels={data.achieveTrend.labels} color={C.primary} height={130} />
              </div>
            </div>

            {/* Productivity Trend */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>Productivity Trend</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.lo, background: t.hover, borderRadius: 6, padding: "3px 8px" }}>6 Bulan Terakhir</span>
              </div>
              <div style={{ color: t.lo }}>
                <LineChart data={data.productivTrend.data} labels={data.productivTrend.labels} color={C.primaryD} height={130} />
              </div>
            </div>

            {/* Activity Map — filter layer sesungguhnya (status/site/wilayah) ada
                di dalam MapCard sendiri (tombol tune), tidak diduplikasi di sini. */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 12 }}>Activity Map</div>
              <MapCard t={t} dark={dark} canManage={isMartaAdmin(profile?.role)} activityPoints={mapActivities} />
            </div>
          </div>

          {/* ── Donut Charts Row ──────────────────────────────────────────── */}
          <div className="mh-donuts">
            {/* Activity Category */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 16 }}>Activity Category Contribution</div>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <DonutChart data={data.eventCategory} size={130} strokeW={20} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: t.hi }}>{data.eventCategory.reduce((s, d) => s + d.value, 0)}</div>
                    <div style={{ fontSize: 9.5, color: t.lo, fontWeight: 600 }}>Total</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {data.eventCategory.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: t.mid }}>{d.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>{d.value}</span>
                        <span style={{ fontSize: 10.5, color: t.lo }}>({d.pct})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Network Category */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 16 }}>Network Category Performance</div>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ flexShrink: 0 }}>
                  <DonutChart data={data.networkCat} size={130} strokeW={20} />
                </div>
                <div style={{ flex: 1 }}>
                  {data.networkCat.map((d, i) => (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: t.mid }}>{d.label}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>{d.value} <span style={{ fontWeight: 400, color: t.lo, fontSize: 10.5 }}>({d.pct})</span></span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: t.hover, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: d.pct, background: d.color, borderRadius: 99 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Quick Actions ─────────────────────────────────────────────── */}
          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
            <div className="mh-qa">
              {QUICK_ACTIONS.map((a, i) => (
                <button key={i} className="mh-btn mh-qa-btn" onClick={() => router.push(NAV_ROUTES[a.route])}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: a.color + "14", border: `1px solid ${a.color}30`, textAlign: "left", cursor: "pointer" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: a.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={a.icon} size={17} color="white" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: a.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div>
                    <div style={{ fontSize: 10.5, color: a.color, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Recent Activity ──────────────────────────────────────────────
               Ringkasan saja (bukan tabel detail 14-kolom seperti sebelumnya) —
               detail penuh & filter lanjutan sudah ada di menu Activity
               Monitoring tersendiri; dashboard cukup menampilkan yang perlu
               diketahui sekilas + jalan pintas ke sana. Tab status diperbaiki:
               "Validated" sebelumnya tidak pernah cocok dgn status manapun
               (bug lama — tab itu selalu kosong), diganti "Rejected" yg nyata. */}
          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>Recent Activity</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {["All", "Draft", "Submitted", "Approved", "Rejected"].map(tab => (
                  <button key={tab} className="mh-btn" onClick={() => setActiveTab(tab)}
                    style={{ padding: "4px 12px", borderRadius: 100, fontSize: 11, fontWeight: 700, border: `1.5px solid ${activeTab === tab ? "transparent" : t.line}`, background: activeTab === tab ? "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)" : "transparent", color: activeTab === tab ? "white" : t.mid, cursor: "pointer" }}>
                    {tab} <span style={{ opacity: 0.7, fontWeight: 600 }}>{tabCount(tab)}</span>
                  </button>
                ))}
                <button className="mh-btn" onClick={() => router.push("/martahub/monitoring")}
                  style={{ marginLeft: 8, padding: "4px 12px", borderRadius: 100, fontSize: 11, fontWeight: 700, border: `1.5px solid ${t.line}`, background: "transparent", color: C.primary, cursor: "pointer" }}>
                  View All
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: t.hover }}>
                    {["Event Name", "Branch", "Category", "Plan Date", "Achievement", "Status"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", fontSize: 10.5, fontWeight: 700, color: t.lo, textAlign: "left", whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}`, letterSpacing: "0.03em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: "26px 14px", textAlign: "center", fontSize: 12, color: t.lo }}>Tidak ada aktivitas untuk filter “{activeTab}”.</td></tr>
                  )}
                  {filteredActivities.slice(0, 8).map((a, i) => (
                    <tr key={i} className="mh-row" style={{ borderBottom: `1px solid ${t.line}` }}>
                      <td title={a.name} style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: t.hi, whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: t.mid, whiteSpace: "nowrap" }}>{a.branch}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ display: "inline-block", whiteSpace: "nowrap", fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: a.catColor + "18", color: a.catColor, border: `1px solid ${a.catColor}30` }}>{a.cat}</span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 11.5, color: t.mid, whiteSpace: "nowrap" }}>{a.planDate}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: parseFloat(a.achievement) >= 100 ? C.success : C.warning, fontVariantNumeric: "tabular-nums" }}>{a.achievement}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: a.statusColor + "15", color: a.statusColor, border: `1px solid ${a.statusColor}35` }}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredActivities.length > 8 && (
              <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.line}`, textAlign: "center" }}>
                <button className="mh-btn" onClick={() => router.push("/martahub/monitoring")} style={{ fontSize: 11.5, fontWeight: 700, color: C.primary }}>
                  Lihat {filteredActivities.length - 8} lainnya di Activity Monitoring →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
