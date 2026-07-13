"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { guardMarta, isMartaAdmin } from "../../lib/martaAccess";
import { HubLogo } from "../../components/HubLogo";
import { HubLogoLoader, HubLogoLoaderDark } from "../../components/HubLogoLoader";
import { MapCard } from "./components/SumatraMap";

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
  { section: "MANAGEMENT" },
  { label: "Approval Center", icon: "check", path: "approval", badge: 12 },
  { label: "User Management", icon: "users", path: "assignments", route: "/martahub/assignments" },
  { label: "Master Data", icon: "db", path: "master" },
  { label: "System Settings", icon: "settings", path: "settings" },
];

// Rute untuk item nav yang punya halaman tersendiri
const NAV_ROUTES = {
  activities: "/martahub/activities",
  submission: "/martahub/submission",
  map: "/martahub/map",
  leaderboard: "/martahub/leaderboard",
  approval: "/martahub/approval",
  master: "/martahub/master",
  assignments: "/martahub/assignments",
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

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK = {
  kpis: [
    { label: "Total Activity", value: "134", sub: "+18% vs Mar 2026", trend: "up", color: "#2563EB", icon: "activity", spark: [88,95,105,112,118,116,127,134] },
    { label: "Achievement %", value: "127%", sub: "+12% vs Mar 2026", trend: "up", color: "#16A34A", icon: "trophy", spark: [92,98,105,112,118,116,122,127] },
    { label: "Productivity %", value: "185%", sub: "+15% vs Mar 2026", trend: "up", color: "#7C3AED", icon: "trendUp", spark: [120,135,142,156,168,170,178,185] },
    { label: "Revenue (Actual)", value: "Rp 67,4 jt", sub: "+22% vs Mar 2026", trend: "up", color: "#EA580C", icon: "money", spark: [42,48,52,58,63,61,65,67] },
    { label: "Cost Ratio", value: "18,5%", sub: "-2,3% vs Mar 2026", trend: "down", color: "#DB2777", icon: "percent", spark: [24,22,21,20,19,21,19,18] },
    { label: "Geo Compliance", value: "98%", sub: "+5% vs Mar 2026", trend: "up", color: "#0D9488", icon: "pin", spark: [85,88,90,92,94,93,96,98] },
  ],
  achieveTrend: { data: [92,105,112,118,116,127], labels: ["Nov 25","Des 25","Jan 26","Feb 26","Mar 26","Apr 26"] },
  productivTrend: { data: [120,142,156,168,170,185], labels: ["Nov 25","Des 25","Jan 26","Feb 26","Mar 26","Apr 26"] },
  eventCategory: [
    { label: "Direct Selling", value: 52, pct: "38.8%", color: "#ED1C24" },
    { label: "Sponsorship", value: 32, pct: "23.9%", color: "#7B1FA2" },
    { label: "Joint Event", value: 24, pct: "17.9%", color: "#00695C" },
    { label: "Thematic", value: 18, pct: "13.4%", color: "#E65100" },
    { label: "Others", value: 8, pct: "6.0%", color: "#455A64" },
  ],
  networkCat: [
    { label: "Strong", value: 78, pct: "58.2%", color: "#2E7D32" },
    { label: "Medium", value: 36, pct: "26.9%", color: "#F57F17" },
    { label: "Weak", value: 20, pct: "14.9%", color: "#C62828" },
  ],
  activities: [
    { no: 1, name: "HALAL BI-HALAL SCOOTER RISE", branch: "Tebing Tinggi", cat: "Sponsorship", catColor: "#7B1FA2", planDate: "11-Apr-26", actualDate: "11-Apr-26", target: "10/1", actual: "133/1", revenue: "Rp 4.655.000", productivity: "931%", achievement: "1330%", status: "Approved", statusColor: "#2E7D32" },
    { no: 2, name: "OPEN BOOTH FWA", branch: "Del. Serdang Raya", cat: "Direct Selling", catColor: "#ED1C24", planDate: "15-Apr-26", actualDate: "15-Apr-26", target: "10/5", actual: "5/5", revenue: "Rp 925.000", productivity: "185%", achievement: "50%", status: "Approved", statusColor: "#2E7D32" },
    { no: 3, name: "PAKET IBADAH HAJI", branch: "Del. Serdang Raya", cat: "Thematic", catColor: "#E65100", planDate: "24-Apr-26", actualDate: "24-Apr-26", target: "10/1", actual: "25/0", revenue: "Rp 15.875.000", productivity: "3175%", achievement: "250%", status: "Approved", statusColor: "#2E7D32" },
    { no: 4, name: "FUN RUN HUT GUNUNGSITOLI", branch: "Nias", cat: "Joint Event", catColor: "#00695C", planDate: "19-Apr-26", actualDate: "19-Apr-26", target: "10/1", actual: "150/2", revenue: "Rp 7.050.000", productivity: "1410%", achievement: "1500%", status: "Validated", statusColor: "#ED1C24" },
    { no: 5, name: "OPEN BOOTH FWA", branch: "Pantai Labu", cat: "Thematic", catColor: "#E65100", planDate: "28-Apr-26", actualDate: "28-Apr-26", target: "10/1", actual: "3/5", revenue: "Rp 855.000", productivity: "171%", achievement: "30%", status: "Submitted", statusColor: "#F57F17" },
  ],
};

const QUICK_ACTIONS = [
  { label: "Plan Activity", sub: "Create new plan", icon: "calendar", color: "#ED1C24", colorBg: "#FCEAEE" },
  { label: "Submit Activity", sub: "Record actual activity", icon: "send", color: "#7B1FA2", colorBg: "#F3E8FF" },
  { label: "Check In (GPS)", sub: "Start geo tracking", icon: "pin", color: "#2E7D32", colorBg: "#E8F5E9" },
  { label: "Upload Document", sub: "Add documentation", icon: "img", color: "#E65100", colorBg: "#FFF3E0" },
  { label: "View Calendar", sub: "Activity schedule", icon: "cal", color: "#00695C", colorBg: "#E0F2F1" },
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
  const [dateRange] = useState("01 Apr 2026 – 30 Apr 2026");
  const [activeTab, setActiveTab] = useState("All");

  const t = mk(dark);

  // Filter Recent Activity berdasarkan tab status
  const filteredActivities = activeTab === "All"
    ? MOCK.activities
    : MOCK.activities.filter((a) => a.status === activeTab);
  const tabCount = (tab) => tab === "All" ? MOCK.activities.length : MOCK.activities.filter((a) => a.status === tab).length;

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
        .mh-card:hover{box-shadow:0 8px 32px rgba(237,28,36,0.12) !important;transform:translateY(-1px)}
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
        .mh-kpi{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:20px}
        .mh-charts{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:16px;margin-bottom:16px}
        .mh-donuts{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .mh-qa{display:flex;gap:8px;flex-wrap:wrap}
        .mh-qa > *{flex:1 1 160px}
        .leaflet-container{background:${t.hover}}

        /* Laptop / half-screen */
        @media (max-width:1200px){
          .mh-kpi{grid-template-columns:repeat(3,1fr)}
          .mh-charts{grid-template-columns:1fr 1fr}
        }
        @media (max-width:900px){
          .mh-content{padding:16px 16px 32px}
          .mh-charts{grid-template-columns:1fr}
          .mh-donuts{grid-template-columns:1fr}
        }
        /* Mobile */
        @media (max-width:767px){
          .mh-kpi{grid-template-columns:repeat(2,1fr);gap:10px}
          .mh-content{padding:14px 12px 28px}
          .mh-topbar{padding:0 14px !important;gap:10px !important}
          .mh-hide-sm{display:none !important}
          .mh-qa > *{flex:1 1 46%}
        }
        @media (max-width:400px){
          .mh-kpi{grid-template-columns:1fr}
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
                {!collapsed && item.badge && <span style={{ fontSize: 10, fontWeight: 700, color: "white", background: C.error, borderRadius: 100, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{item.badge}</span>}
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
          </div>
          <div style={{ flex: 1 }} />

          {/* Date range */}
          <div className="mh-hide-sm" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 9, border: `1.5px solid ${t.line}`, background: t.hover, cursor: "pointer" }}>
            <Icon name="cal" size={14} color={t.mid} />
            <span style={{ fontSize: 12, fontWeight: 600, color: t.mid }}>{dateRange}</span>
            <Icon name="chevD" size={12} color={t.lo} />
          </div>

          {/* Filter */}
          <button className="mh-btn mh-hide-sm" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 9, border: `1.5px solid ${t.line}`, background: t.hover, color: t.mid, fontSize: 12, fontWeight: 600 }}>
            <Icon name="filter" size={13} color={t.mid} /> Filter
          </button>

          {/* Bell */}
          <div style={{ position: "relative", cursor: "pointer" }}>
            <div style={{ padding: 8, borderRadius: 9, border: `1.5px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="bell" size={17} color={t.mid} />
            </div>
            <div style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: "50%", background: C.error, border: `1.5px solid ${t.surface}` }} />
          </div>

          {/* Dark toggle */}
          <button className="mh-btn" onClick={() => setDark(!dark)} style={{ padding: 8, borderRadius: 9, border: `1.5px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", color: t.mid }}>
            <Icon name={dark ? "sun" : "moon"} size={16} color={t.mid} />
          </button>

          {/* Avatar */}
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${C.primary},${C.primaryD})`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(237,28,36,0.35)" }} title={`${displayName} · ${roleLabel}`}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{initial}</span>
          </div>
        </div>

        {/* Content */}
        <div className="mh-content" style={{ flex: 1, overflow: "auto" }}>

          {/* ── KPI Cards ─────────────────────────────────────────────────── */}
          <div className="mh-kpi">
            {MOCK.kpis.map((kpi, i) => (
              <div key={i} className="mh-card" style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 16, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: kpi.color, borderRadius: "14px 14px 0 0" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: kpi.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={kpi.icon} size={17} color={kpi.color} />
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: t.lo, textTransform: "uppercase", lineHeight: 1.3 }}>{kpi.label}</div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", color: kpi.color, lineHeight: 1, marginBottom: 8 }}>{kpi.value}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 800 }}>{kpi.trend === "up" ? "▲" : "▼"}</span>
                  <span style={{ fontSize: 10.5, color: kpi.trend === "up" ? C.success : C.error, fontWeight: 600 }}>{kpi.sub}</span>
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
                <select style={{ fontSize: 11, fontWeight: 600, color: t.mid, background: t.hover, border: `1px solid ${t.line}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                  <option>By Month</option>
                </select>
              </div>
              <div style={{ color: t.lo }}>
                <LineChart data={MOCK.achieveTrend.data} labels={MOCK.achieveTrend.labels} color={C.primary} height={130} />
              </div>
            </div>

            {/* Productivity Trend */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>Productivity Trend</div>
                <select style={{ fontSize: 11, fontWeight: 600, color: t.mid, background: t.hover, border: `1px solid ${t.line}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                  <option>By Month</option>
                </select>
              </div>
              <div style={{ color: t.lo }}>
                <LineChart data={MOCK.productivTrend.data} labels={MOCK.productivTrend.labels} color="#7B1FA2" height={130} />
              </div>
            </div>

            {/* Activity Map */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>Activity Map</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["All Branch", "All Category", "All Network"].map(f => (
                    <select key={f} style={{ fontSize: 10, fontWeight: 600, color: t.mid, background: t.hover, border: `1px solid ${t.line}`, borderRadius: 5, padding: "2px 6px", cursor: "pointer" }}>
                      <option>{f}</option>
                    </select>
                  ))}
                </div>
              </div>
              <MapCard t={t} dark={dark} canManage={isMartaAdmin(profile?.role)} />
            </div>
          </div>

          {/* ── Donut Charts Row ──────────────────────────────────────────── */}
          <div className="mh-donuts">
            {/* Event Category */}
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 16 }}>Event Category Contribution</div>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <DonutChart data={MOCK.eventCategory} size={130} strokeW={20} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: t.hi }}>134</div>
                    <div style={{ fontSize: 9.5, color: t.lo, fontWeight: 600 }}>Total</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {MOCK.eventCategory.map((d, i) => (
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
                  <DonutChart data={MOCK.networkCat} size={130} strokeW={20} />
                </div>
                <div style={{ flex: 1 }}>
                  {MOCK.networkCat.map((d, i) => (
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
                <button key={i} className="mh-btn" style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: a.colorBg, border: "none", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: a.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={a.icon} size={17} color="white" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{a.label}</div>
                    <div style={{ fontSize: 10.5, color: a.color, opacity: 0.65 }}>{a.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Recent Activity Table ─────────────────────────────────────── */}
          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>Recent Activity</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {["All", "Draft", "Submitted", "Validated", "Approved"].map(tab => (
                  <button key={tab} className="mh-btn" onClick={() => setActiveTab(tab)}
                    style={{ padding: "4px 12px", borderRadius: 100, fontSize: 11, fontWeight: 700, border: `1.5px solid ${activeTab === tab ? "transparent" : t.line}`, background: activeTab === tab ? "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)" : "transparent", color: activeTab === tab ? "white" : t.mid, cursor: "pointer" }}>
                    {tab} <span style={{ opacity: 0.7, fontWeight: 600 }}>{tabCount(tab)}</span>
                  </button>
                ))}
                <button className="mh-btn" style={{ marginLeft: 8, padding: "4px 12px", borderRadius: 100, fontSize: 11, fontWeight: 700, border: `1.5px solid ${t.line}`, background: "transparent", color: C.primary, cursor: "pointer" }}>
                  View All
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: t.hover }}>
                    {["No.", "Event Name", "Branch", "Event Category", "Plan Date", "Actual Date", "Target (SP/FWA)", "Actual (SP/FWA)", "Revenue", "Productivity", "Achievement", "Status", "Location", "Action"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", fontSize: 10.5, fontWeight: 700, color: t.lo, textAlign: "left", whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}`, letterSpacing: "0.03em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.length === 0 && (
                    <tr><td colSpan={14} style={{ padding: "26px 14px", textAlign: "center", fontSize: 12, color: t.lo }}>Tidak ada aktivitas untuk filter “{activeTab}”.</td></tr>
                  )}
                  {filteredActivities.map((a, i) => (
                    <tr key={i} className="mh-row" style={{ borderBottom: `1px solid ${t.line}` }}>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: t.lo }}>{a.no}</td>
                      <td title={a.name} style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: t.hi, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: t.mid, whiteSpace: "nowrap" }}>{a.branch}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ display: "inline-block", whiteSpace: "nowrap", fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: a.catColor + "18", color: a.catColor, border: `1px solid ${a.catColor}30` }}>{a.cat}</span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 11.5, color: t.mid, whiteSpace: "nowrap" }}>{a.planDate}</td>
                      <td style={{ padding: "11px 14px", fontSize: 11.5, color: t.mid, whiteSpace: "nowrap" }}>{a.actualDate}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: t.hi }}>{a.target}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: t.hi }}>{a.actual}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: t.hi, whiteSpace: "nowrap" }}>{a.revenue}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: C.success }}>{a.productivity}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: parseFloat(a.achievement) >= 100 ? C.success : C.warning }}>{a.achievement}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: a.statusColor + "15", color: a.statusColor, border: `1px solid ${a.statusColor}35` }}>{a.status}</span>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <button className="mh-btn" style={{ color: t.lo }}><Icon name="pin" size={15} color={t.lo} /></button>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="mh-btn" style={{ width: 26, height: 26, borderRadius: 6, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid }}><Icon name="eye" size={13} color={t.mid} /></button>
                          <button className="mh-btn" style={{ width: 26, height: 26, borderRadius: 6, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid }}><Icon name="dots" size={13} color={t.mid} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
