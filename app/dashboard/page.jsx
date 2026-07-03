"use client";
/**
 * page.jsx
 *
 * CHANGES:
 * - Tambah SDP Status Form
 * - Role lapangan: cse_rse (akses per cluster, aplikasi mobile)
 * - Tambah userRole prop ke FormPendapatan
 * - Tambah Import Data Otomatis (PNL_ImportWizard) untuk role spm_sumatera
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import supabase from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { HubLogo } from "../../components/HubLogo";
import { HubLogoLoader, HubLogoLoaderDark } from "../../components/HubLogoLoader";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight, ArrowDownLeft, LayoutGrid, PieChart, Sun, Moon,
  Menu, X, ChevronLeft, AlertTriangle, MapPin, ChevronDown,
  LogOut, ChevronRight, Calendar, Box, Layers,
  Shield, Globe, Building2, Store, SlidersHorizontal,
  Table2, Wallet, PanelLeftClose, PanelLeftOpen,
  FileSpreadsheet, Users, Key, Briefcase,
} from "lucide-react";

import FormPendapatan   from "./components/PNL_FormPendapatan";
import FormPengeluaran  from "./components/PNL_FormPengeluaran";
import FormSummary      from "./components/PNL_MPX_Summary";
import PNLControlCenter from "./components/PNL_ControlCenter.jsx";
import PNLPivotSummary  from "./components/PNL_PivotSummary";
import PayoutTracker    from "./components/PayoutTracker";
import NotificationBell from "./components/NotificationBell";
import AdminPanel       from "./components/PNL_AdminPanel";
import PNL_ImportWizard from "./components/PNL_ImportWizard";
import SDP_StatusForm   from "./components/SDP_StatusForm";
import MC_ClusterMapping from "./components/MC_ClusterMapping";
import KodeOtoritas     from "./components/KodeOtoritas";
import MFTS_Module      from "./components/MFTS_Module";

// ─── Role Maps ────────────────────────────────────────────────────────────────
const IOH_ROLE_REGION_MAP = {
  "internal_ioh":         null,
  "ioh_north_sumatera":   "NORTH SUMATERA",
  "ioh_central_sumatera": "CENTRAL SUMATERA",
  "ioh_south_sumatera":   "SOUTH SUMATERA",
  "cse_rse":              null,   // akses per cluster (mobile)
  // Salesforce Management (MFTS)
  "salesforce_mgmt_sumatera": null,             // L2 — seluruh Sumatera (Circle)
  "region_sfm_north":         "NORTH SUMATERA", // L3
  "region_sfm_central":       "CENTRAL SUMATERA",
  "region_sfm_south":         "SOUTH SUMATERA",
};
const IOH_ROLES = new Set(["internal_ioh","ioh_north_sumatera","ioh_central_sumatera","ioh_south_sumatera"]);
const SFM_ROLES = new Set(["salesforce_mgmt_sumatera","region_sfm_north","region_sfm_central","region_sfm_south"]);

const ROLE_BADGE = {
  "spm_sumatera":         { bg: "magentaBg", bd: "magentaBd", color: "magenta" },
  "finance_mpx":          { bg: "greenBg",   bd: "greenBd",   color: "green"   },
  "internal_ioh":         { bg: "yellowBg",  bd: "yellowBd",  color: "yellow"  },
  "ioh_north_sumatera":   { bg: "yellowBg",  bd: "yellowBd",  color: "yellow"  },
  "ioh_central_sumatera": { bg: "yellowBg",  bd: "yellowBd",  color: "yellow"  },
  "ioh_south_sumatera":   { bg: "yellowBg",  bd: "yellowBd",  color: "yellow"  },
  "cse_rse":              { bg: "blueBg",    bd: "blueBd",    color: "blue"    },
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const tk = (d) => ({
  appBg:     d ? "#0D0D0E" : "#F5F5F6",
  sidebar:   d ? "#111113" : "#FFFFFF",
  surface:   d ? "#161618" : "#FFFFFF",
  card:      d ? "#1A1A1D" : "#FFFFFF",
  hover:     d ? "#202024" : "#F0F0F2",
  line:      d ? "#2A2A2F" : "#E2E2E6",
  lineSoft:  d ? "#222226" : "#EBEBEF",
  hi:        d ? "#F2F2F3" : "#1A1A1D",
  mid:       d ? "#8A8A96" : "#5A5A68",
  lo:        d ? "#5A5A68" : "#8A8A96",
  blue:      "#ED1C24",
  blueBg:    d ? "#2A0708" : "#FEECEC",
  blueBd:    d ? "#5C1012" : "#F8B4B6",
  blueSoft:  d ? "#200506" : "#FFF5F5",
  green:     d ? "#32BCAD" : "#1A9E90",
  greenBg:   d ? "#0A2421" : "#E6F8F6",
  greenBd:   d ? "#1A4E49" : "#A8E6E0",
  red:       d ? "#F87171" : "#DC2626",
  redBg:     d ? "#2A1414" : "#FEEDEC",
  yellow:    d ? "#FFCB05" : "#946400",
  yellowBg:  d ? "#2A2200" : "#FFFBEA",
  yellowBd:  d ? "#5C4B00" : "#FFE680",
  magenta:   "#C6168D",
  magentaBg: d ? "#270016" : "#FEECF8",
  magentaBd: d ? "#520030" : "#F0A8DC",
  // blue token repurposed for CSE/SDP badge (distinct from t.blue=red brand)
  blueBadge: d ? "#0A84FF" : "#0066CC",
  blueBadgeBg: d ? "rgba(10,132,255,0.13)" : "rgba(0,102,204,0.08)",
  blueBadgeBd: d ? "rgba(10,132,255,0.30)" : "rgba(0,102,204,0.20)",
  pink:      "#EC008C",
  inputBg:   d ? "#161618" : "#FFFFFF",
  inputBd:   d ? "#2A2A2F" : "#D4D4DA",
  shadowSm:  d ? "0 1px 2px rgba(0,0,0,0.55)"   : "0 1px 2px rgba(26,26,29,0.06)",
  shadowMd:  d ? "0 6px 18px rgba(0,0,0,0.50)"  : "0 6px 18px rgba(26,26,29,0.09)",
  shadowLg:  d ? "0 20px 48px rgba(0,0,0,0.65)" : "0 20px 48px rgba(26,26,29,0.16)",
});

const FONT_STACK = `"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", Roboto, system-ui, sans-serif`;

const buildGlobalCSS = (d, t) => `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${d ? "#3A3A40" : "#C8C8D0"}; border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: ${d ? "#4D4D4F" : "#A8A8B0"}; }
  select option { background: ${t.card}; color: ${t.hi}; }
  @media (max-width: 640px) {
    .tab-label { display: none !important; }
    .hide-mobile { display: none !important; }
    .header-pad { padding-left: 16px !important; padding-right: 16px !important; }
    .content-pad { padding: 20px 16px !important; }
  }
  .snav {
    width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 9px 11px; border-radius: 8px; border: none;
    background: transparent; cursor: pointer;
    font-size: 13.5px; font-weight: 500; letter-spacing: -0.005em;
    color: ${t.mid}; transition: background .14s, color .14s;
    text-align: left; outline: none; font-family: inherit;
  }
  .snav:hover  { background: ${t.hover}; color: ${t.hi}; }
  .snav.active { background: ${t.blueBg}; color: ${t.blue}; font-weight: 600; }
  .snav:disabled { opacity: 0.36; cursor: not-allowed; pointer-events: none; }
  .back-btn {
    display: inline-flex; align-items: center; gap: 5px;
    background: none; border: none; cursor: pointer;
    font-size: 13px; font-weight: 500;
    color: ${t.mid}; transition: color .14s; outline: none; padding: 6px 0; font-family: inherit;
  }
  .back-btn:hover { color: ${t.blue}; }
  .tab-pill {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 16px; border-radius: 7px; border: none;
    font-size: 13.5px; font-weight: 500; cursor: pointer;
    transition: all .14s; white-space: nowrap; outline: none;
    letter-spacing: -0.005em; font-family: inherit;
  }
  .tab-pill.off { background: transparent; color: ${t.mid}; }
  .tab-pill.off:hover { background: ${t.hover}; color: ${t.hi}; }
  .tab-pill.on { background: ${t.blue}; color: #fff; font-weight: 600; }
  .danger-btn {
    width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 8px; border: none;
    background: transparent; cursor: pointer;
    font-size: 13.5px; font-weight: 500; color: ${t.red};
    transition: background .14s; outline: none; font-family: inherit;
  }
  .danger-btn:hover { background: ${t.redBg}; }
  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid ${t.line}; background: ${t.inputBg};
    border-radius: 8px; cursor: pointer; color: ${t.mid};
    transition: border-color .14s, color .14s, background .14s; outline: none;
  }
  .icon-btn:hover { border-color: ${t.blueBd}; color: ${t.blue}; background: ${t.blueSoft}; }
`;

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS              = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const CURRENT_DATE        = new Date();
const CURRENT_MONTH_INDEX = CURRENT_DATE.getMonth();
const CURRENT_YEAR        = CURRENT_DATE.getFullYear();
const getCurrentMonth     = () => MONTHS[CURRENT_MONTH_INDEX];
const getCurrentYear      = () => CURRENT_YEAR.toString();

const HIDE_DATE_PICKER_VIEWS    = new Set(["control-center","pivot-summary","payout-tracker","admin-panel","import-wizard","sdp-status","mc-cluster","kode-otoritas","mfts"]);
const HIDE_SIDEBAR_FILTER_VIEWS = new Set(["control-center","pivot-summary","payout-tracker","admin-panel","import-wizard","sdp-status","mc-cluster","kode-otoritas"]);
const PNL_VIEWS = new Set(["summary","pendapatan","pengeluaran"]);

// ─── Sub-components ───────────────────────────────────────────────────────────
function FilterSelect({ label, value, onChange, children, t, d, disabled, icon }) {
  return (
    <div style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, paddingLeft: 2 }}>
        <span style={{ color: t.lo, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.mid }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.inputBd}`, borderRadius: 8, background: t.inputBg, height: 36, position: "relative", transition: "border-color .12s" }}>
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", appearance: "none", WebkitAppearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, outline: "none", cursor: "pointer", paddingLeft: 12, paddingRight: 32, fontFamily: "inherit" }}>
          {children}
        </select>
        <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none", display: "flex" }}>
          <ChevronDown size={14} />
        </div>
      </div>
    </div>
  );
}

function SNavItem({ icon, label, active, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`snav${active ? " active" : ""}`}>
      <span style={{ flexShrink: 0, display: "flex", opacity: active ? 1 : 0.7 }}>{icon}</span>
      <span style={{ flex: 1, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}

function DashCard({ icon, title, desc, tag, active, onClick, t, d, accent = {} }) {
  const [hov, setHov] = useState(false);
  const ac = {
    color:  accent.color  || t.blue,
    bg:     accent.bg     || t.blueBg,
    bd:     accent.bd     || t.blueBd,
    shadow: accent.shadow || "rgba(237,28,36,0.18)",
  };
  return (
    <div
      onClick={active ? onClick : undefined}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: 24, borderRadius: 12,
        border: `1px solid ${hov && active ? ac.bd : t.line}`,
        background: t.card, cursor: active ? "pointer" : "not-allowed",
        opacity: active ? 1 : 0.5,
        transition: "border-color .15s, box-shadow .15s, transform .15s",
        boxShadow: hov && active ? `0 8px 24px ${ac.shadow}, ${t.shadowSm}` : t.shadowSm,
        transform: hov && active ? "translateY(-2px)" : "translateY(0)",
        display: "flex", flexDirection: "column", gap: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: hov && active ? ac.color : ac.bg,
          color: hov && active ? "#FFFFFF" : ac.color,
          border: `1px solid ${hov && active ? ac.color : ac.bd}`,
          transition: "background .15s, color .15s, border-color .15s",
        }}>{icon}</div>
        {tag && (
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "3px 8px", borderRadius: 4,
            background: tag === "Admin" ? t.magentaBg : tag === "SDP" ? t.blueBadgeBg : t.greenBg,
            color:      tag === "Admin" ? t.magenta    : tag === "SDP" ? t.blueBadge  : t.green,
            border:     `1px solid ${tag === "Admin" ? t.magentaBd : tag === "SDP" ? t.blueBadgeBd : t.greenBd}`,
          }}>{tag}</span>
        )}
      </div>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em", color: t.hi, marginBottom: 6, lineHeight: 1.3 }}>{title}</h3>
        <p style={{ fontSize: 13, color: t.mid, lineHeight: 1.55, fontWeight: 400 }}>{desc}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.02em", color: active ? ac.color : t.lo }}>
        {active ? "Buka modul" : "Terkunci"}<ChevronRight size={13} strokeWidth={2} />
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ width:"100%", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--background,#F4F4F7)" }}>
      <HubLogoLoader variant="sandra" logoSize={88} />
    </div>
  );
}

function SidebarToggleBtn({ collapsed, onToggle, t }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onToggle} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title={collapsed ? "Tampilkan sidebar" : "Sembunyikan sidebar"}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: `1px solid ${hov ? t.blueBd : t.line}`, background: hov ? t.blueSoft : t.inputBg, cursor: "pointer", outline: "none", flexShrink: 0, color: hov ? t.blue : t.mid, transition: "all .15s" }}>
      {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.8} /> : <PanelLeftClose size={15} strokeWidth={1.8} />}
    </button>
  );
}

function RoleBadge({ role, t }) {
  const cfg = ROLE_BADGE[role] || ROLE_BADGE["finance_mpx"];
  // CSE/SDP use blue badge colors (not t.blue which is the brand red)
  const isSdpRole = role === "cse_rse";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
      padding: "2px 7px", borderRadius: 4,
      background: isSdpRole ? t.blueBadgeBg : t[cfg.bg],
      color:      isSdpRole ? t.blueBadge   : t[cfg.color],
      border:     `1px solid ${isSdpRole ? t.blueBadgeBd : t[cfg.bd]}`,
    }}>
      <Shield size={9} />{role?.replace(/_/g, " ")}
    </span>
  );
}

function PnlPickerPrompt({
  t, d, isSPM, isMPX, isIOHAny, iohLockedRegion,
  regions, filteredPartners, availableTypes, availableBranches,
  activeRegion, setActiveRegion, activePartner, setActivePartner,
  activeType, setActiveType, activeBranch, setActiveBranch, onBack,
}) {
  const hasPartner    = !!activePartner;
  const hasBranch     = !!activeBranch;
  const typeAmbiguous = hasPartner && availableTypes.length > 1 && activeType === "ALL";
  const headline = !hasPartner
    ? (isMPX ? "Partner kamu sedang dimuat" : iohLockedRegion ? `Pilih partner dari region ${iohLockedRegion}` : "Pilih partner untuk membuka laporan")
    : typeAmbiguous ? "Partner ini punya beberapa tipe (MPC/MP3)"
    : !hasBranch ? "Partner ini punya beberapa cabang" : "Konteks laporan siap";
  const sub = !hasPartner ? "Filter di bawah ini sinkron dengan sidebar — atur dari mana saja."
    : typeAmbiguous ? "Pilih salah satu tipe agar daftar cabang tepat."
    : !hasBranch ? "Pilih salah satu cabang untuk melanjutkan." : "Memuat tab laporan…";

  return (
    <div style={{ maxWidth: 560, margin: "40px auto 0", padding: "36px 32px 32px", borderRadius: 14, border: `1px dashed ${t.blueBd}`, background: t.blueSoft }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 6px 18px rgba(237,28,36,0.30)" }}>
          <SlidersHorizontal size={24} color="#FFFFFF" strokeWidth={2.2} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.025em", color: t.hi, marginBottom: 6 }}>{headline}</h3>
        <p style={{ fontSize: 13, color: t.mid, lineHeight: 1.55, maxWidth: 380, margin: "0 auto" }}>{sub}</p>
      </div>
      <div style={{ padding: 18, borderRadius: 10, background: t.card, border: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 14 }}>
        {isSPM && (
          <FilterSelect label="Region" icon={<Globe size={12} />} value={activeRegion}
            onChange={v => { setActiveRegion(v); setActivePartner(""); setActiveBranch(""); setActiveType("ALL"); }} t={t} d={d}>
            <option value="SUMATERA">Seluruh Sumatera</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </FilterSelect>
        )}
        {iohLockedRegion && (
          <div style={{ padding: "8px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 600, background: t.yellowBg, border: `1px solid ${t.yellowBd}`, color: t.yellow, display: "flex", alignItems: "center", gap: 7 }}>
            <Globe size={12} style={{ flexShrink: 0 }} />Region terkunci: {iohLockedRegion}
          </div>
        )}
        <FilterSelect label="Nama Partner" icon={<Building2 size={12} />} value={activePartner}
          onChange={v => { setActivePartner(v); setActiveBranch(""); setActiveType("ALL"); }} t={t} d={d} disabled={isMPX}>
          <option value="" disabled>Pilih Partner</option>
          {filteredPartners.map(p => <option key={p} value={p}>{p}</option>)}
        </FilterSelect>
        {hasPartner && availableTypes.length > 1 && (
          <FilterSelect label="Tipe (MPC / MP3)" icon={<SlidersHorizontal size={12} />} value={activeType}
            onChange={v => { setActiveType(v); setActiveBranch(""); }} t={t} d={d}>
            <option value="ALL">Semua Tipe</option>
            {availableTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
          </FilterSelect>
        )}
        <FilterSelect
          label={typeAmbiguous ? "Cabang (pilih Tipe dulu)" : availableBranches.length > 1 ? "Cabang (pilih salah satu)" : "Branch"}
          icon={<Store size={12} />} value={activeBranch} onChange={v => setActiveBranch(v)}
          t={t} d={d} disabled={!hasPartner || typeAmbiguous}>
          <option value="" disabled>Pilih Cabang</option>
          {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
        </FilterSelect>
      </div>
      <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
        <button onClick={onBack} className="back-btn"><ChevronLeft size={15} /> Kembali ke Overview</button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [loading,           setLoading]          = useState(true);
  const [profile,           setProfile]          = useState(null);
  const [view,              setView]             = useState("overview");
  const [theme,             setTheme]            = useState(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("hub-theme") || localStorage.getItem("sh-theme") || "dark")
      : "dark"
  );
  const [profileOpen,       setProfileOpen]      = useState(false);
  const [navOpen,           setNavOpen]          = useState(true);
  const [sidebarCollapsed,  setSidebarCollapsed] = useState(false);
  const [masterData,        setMasterData]       = useState([]);
  const [regions,           setRegions]          = useState([]);
  const [activeRegion,      setActiveRegion]     = useState("SUMATERA");
  const [activePartner,     setActivePartner]    = useState("");
  const [activeType,        setActiveType]       = useState("ALL");
  const [activeBranch,      setActiveBranch]     = useState("");
  const [activeMonth,       setActiveMonth]      = useState(getCurrentMonth);
  const [activeYear,        setActiveYear]       = useState(getCurrentYear);
  const [formDirty,         setFormDirty]        = useState(false);
  const [exitConfirm,       setExitConfirm]      = useState(false);
  const [pendingView,       setPendingView]      = useState(null);
  const [mobileOpen,        setMobileOpen]       = useState(false);
  const [disabledMonthsMap, setDisabledMonthsMap] = useState(new Map());

  // ── Role flags ────────────────────────────────────────────────────────────
  const isSPM       = profile?.role === "spm_sumatera";
  const isMPX       = profile?.role === "finance_mpx";
  const isIOHAny    = IOH_ROLES.has(profile?.role);
  const isSFM       = SFM_ROLES.has(profile?.role);
  const canMfts     = isSPM || isIOHAny || isSFM;
  const isCSE       = profile?.role === "cse_rse";
  const isBSM       = profile?.role === "bsm";
  const isPICRegion = profile?.role === "pic_region";
  const isSDPMember = isCSE || isBSM || isPICRegion;   // bisa akses SDP Status Form

  const iohLockedRegion = IOH_ROLE_REGION_MAP[profile?.role] ?? null;
  // Region efektif untuk memfilter tampilan (payout/MFTS):
  //  • IOH regional  → region terkunci (mis. NORTH SUMATERA)
  //  • IOH Sumatera (internal_ioh) → mengikuti pilihan "Region View" di sidebar
  //    ("SUMATERA" = seluruh region → null = tidak difilter)
  const iohRegionView   = iohLockedRegion || (isIOHAny && activeRegion !== "SUMATERA" ? activeRegion : null);
  const isReadOnly      = isIOHAny;
  const canMonitor      = isSPM || isIOHAny || isMPX;
  const canSdp          = isSPM || isSDPMember;

  // ── PNL form access ───────────────────────────────────────────────────────
  const canPnl = useMemo(() => {
    if (!activePartner || !activeBranch) return false;
    if (isMPX && activePartner !== profile?.partner_name) return false;
    const partnerTypes = [...new Set(masterData.filter(i => i.partner_name === activePartner).map(i => i.mpc_mp3))];
    if (partnerTypes.length > 1 && (!activeType || activeType === "ALL")) return false;
    return true;
  }, [activePartner, activeBranch, activeType, isMPX, profile?.partner_name, masterData]);

  const availableYears  = useMemo(() => Array.from({ length: CURRENT_YEAR - 2026 + 1 }, (_, i) => (2026 + i).toString()).reverse(), []);
  const availableMonths = useMemo(() => Number(activeYear) === CURRENT_YEAR ? MONTHS.slice(0, CURRENT_MONTH_INDEX + 1) : MONTHS, [activeYear]);

  const activeContextDisabledMonths = useMemo(() => {
    if (!activePartner || !activeBranch) return new Set();
    const resolvedType = (activeType && activeType !== "ALL") ? activeType
      : masterData.find(i => i.partner_name === activePartner && i.branch_name === activeBranch)?.mpc_mp3;
    if (!resolvedType) return new Set();
    const key = `${activePartner}|${activeBranch}|${resolvedType}|${activeYear}`;
    return disabledMonthsMap.get(key) || new Set();
  }, [disabledMonthsMap, activePartner, activeBranch, activeType, activeYear, masterData]);

  useEffect(() => {
    if (activeContextDisabledMonths.has(activeMonth)) {
      const fallback = availableMonths.find(m => !activeContextDisabledMonths.has(m));
      if (fallback) setActiveMonth(fallback);
    }
  }, [activeContextDisabledMonths, activeMonth, availableMonths]);

  const d = theme === "dark";
  const t = tk(d);
  const toggleTheme = () => { const next = d ? "light" : "dark"; setTheme(next); localStorage.setItem("hub-theme", next); localStorage.setItem("sh-theme", next); };

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setTheme(localStorage.getItem("hub-theme") || localStorage.getItem("sh-theme") || "dark");
    const sc = localStorage.getItem("sh-sidebar-collapsed");
    if (sc) setSidebarCollapsed(sc === "true");

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push("/sandra/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();

      // Agency: bukan user dashboard internal → arahkan ke portal agency
      if (prof?.role === "agency") return router.replace("/agency");

      // CSE/SDP/BSM/PIC: tidak perlu load partner_branches
      const isCseOrSdp = prof?.role === "cse_rse" || prof?.role === "bsm" || prof?.role === "pic_region";
      let mapData = [];
      if (!isCseOrSdp) {
        let query = supabase.from("partner_branches").select("*").order("partner_name", { ascending: true });
        if (prof?.role === "finance_mpx") query = query.eq("partner_name", prof?.partner_name);
        const lockedRegion = IOH_ROLE_REGION_MAP[prof?.role];
        if (lockedRegion) query = query.eq("region", lockedRegion);
        const { data } = await query;
        mapData = data || [];
      }

      setProfile(prof);
      setMasterData(mapData);
      setRegions([...new Set(mapData.map(i => i.region))].sort());
      if (prof?.role === "finance_mpx") setActivePartner(prof?.partner_name || "");
      const lockedRegion = IOH_ROLE_REGION_MAP[prof?.role];
      if (lockedRegion) setActiveRegion(lockedRegion);

      // CSE/SDP: default view ke sdp-status
      if (isCseOrSdp) setView("sdp-status");

      setLoading(false);
    })();
  }, [router]);

  // ── Disabled months ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeYear) return;
    (async () => {
      try {
        const { data, error } = await supabase.from("pnl_disabled_months").select("partner_name,branch_name,mpc_mp3,month,year");
        if (error) { setDisabledMonthsMap(new Map()); return; }
        const map = new Map();
        (data || []).forEach(r => {
          const key = `${r.partner_name}|${r.branch_name}|${r.mpc_mp3}|${String(r.year)}`;
          if (!map.has(key)) map.set(key, new Set());
          map.get(key).add(r.month);
        });
        setDisabledMonthsMap(map);
      } catch (e) { setDisabledMonthsMap(new Map()); }
    })();
  }, [activeYear]);

  useEffect(() => {
    if (!activeYear) return;
    const channel = supabase.channel(`page_dm_${activeYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pnl_disabled_months", filter: `year=eq.${activeYear}` }, (payload) => {
        const { eventType, new: n, old: o } = payload;
        setDisabledMonthsMap(prev => {
          const next = new Map(prev);
          if (eventType === "INSERT" && n) {
            const key = `${n.partner_name}|${n.branch_name}|${n.mpc_mp3}|${String(n.year)}`;
            if (!next.has(key)) next.set(key, new Set());
            next.get(key).add(n.month);
          } else if (eventType === "DELETE" && o) {
            const key = `${o.partner_name}|${o.branch_name}|${o.mpc_mp3}|${String(o.year)}`;
            if (next.has(key)) { const s = new Set(next.get(key)); s.delete(o.month); if (s.size === 0) next.delete(key); else next.set(key, s); }
          }
          return next;
        });
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeYear]);

  const handleToggleSidebar = () => { const next = !sidebarCollapsed; setSidebarCollapsed(next); localStorage.setItem("sh-sidebar-collapsed", String(next)); };

  useEffect(() => {
    if (!activePartner || iohLockedRegion) return;
    const partnerData = masterData.find(i => i.partner_name === activePartner);
    if (partnerData?.region) setActiveRegion(partnerData.region);
  }, [activePartner, masterData, iohLockedRegion]);

  const filteredPartners = useMemo(() => {
    let list = masterData;
    if (iohLockedRegion) list = list.filter(i => i.region === iohLockedRegion);
    else if (activeRegion !== "SUMATERA") list = list.filter(i => i.region === activeRegion);
    return [...new Set(list.map(i => i.partner_name))];
  }, [masterData, activeRegion, iohLockedRegion]);

  const availableTypes = useMemo(() => {
    if (!activePartner) return [];
    return [...new Set(masterData.filter(i => i.partner_name === activePartner).map(i => i.mpc_mp3))];
  }, [masterData, activePartner]);

  const availableBranches = useMemo(() => {
    if (!activePartner) return [];
    return [...new Set(masterData.filter(i => i.partner_name === activePartner && (activeType === "ALL" || i.mpc_mp3 === activeType)).map(i => i.branch_name))];
  }, [masterData, activePartner, activeType]);

  useEffect(() => {
    if (availableTypes.length === 1) setActiveType(availableTypes[0]);
    else if (activeType !== "ALL" && !availableTypes.includes(activeType)) setActiveType("ALL");
  }, [availableTypes, activePartner]);

  useEffect(() => {
    if (availableBranches.length === 1) setActiveBranch(availableBranches[0]);
    else if (!availableBranches.includes(activeBranch)) setActiveBranch("");
  }, [availableBranches]);

  useEffect(() => {
    if (!activePartner || !activeBranch) return;
    if (activeType && activeType !== "ALL") return;
    const branchTypes = [...new Set(masterData.filter(i => i.partner_name === activePartner && i.branch_name === activeBranch).map(i => i.mpc_mp3))];
    if (branchTypes.length === 1) setActiveType(branchTypes[0]);
  }, [activeBranch, activeType, activePartner, masterData]);

  useEffect(() => {
    if (!availableMonths.includes(activeMonth)) setActiveMonth(availableMonths[availableMonths.length - 1]);
  }, [activeYear, availableMonths, activeMonth]);

  const mpxType = activeType !== "ALL" ? activeType
    : masterData.find(i => i.partner_name === activePartner && i.branch_name === activeBranch)?.mpc_mp3;

  const clearFilters = () => {
    if (!iohLockedRegion) setActiveRegion("SUMATERA");
    if (!isMPX) setActivePartner("");
    setActiveBranch("");
    setActiveType("ALL");
  };

  // Muat ulang daftar partner/branch (dipakai setelah Admin Panel menambah/
  // mengubah/menghapus branch) supaya selektor & Control Center langsung sinkron.
  const refreshBranches = useCallback(async () => {
    if (!profile) return;
    const isCseOrSdp = profile.role === "cse_rse" || profile.role === "bsm" || profile.role === "pic_region";
    if (isCseOrSdp) return;
    let query = supabase.from("partner_branches").select("*").order("partner_name", { ascending: true });
    if (profile.role === "finance_mpx") query = query.eq("partner_name", profile.partner_name);
    const lockedRegion = IOH_ROLE_REGION_MAP[profile.role];
    if (lockedRegion) query = query.eq("region", lockedRegion);
    const { data } = await query;
    const mapData = data || [];
    setMasterData(mapData);
    setRegions([...new Set(mapData.map(i => i.region))].sort());
  }, [profile]);

  const navigate = (viewId) => {
    if (formDirty) { setPendingView(viewId); setExitConfirm(true); }
    else { setView(viewId); setMobileOpen(false); }
  };

  const navigateTab = (tabId) => {
    if (tabId === view) return;
    if (formDirty) { setPendingView(tabId); setExitConfirm(true); }
    else setView(tabId);
  };

  const HEADER_H  = 60;
  const SIDEBAR_W = 252;
  const hideDatePicker    = HIDE_DATE_PICKER_VIEWS.has(view);
  const hideSidebarFilter = HIDE_SIDEBAR_FILTER_VIEWS.has(view);

  if (loading) return <LoadingScreen />;

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const SidebarInner = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", userSelect: "none" }}>
      <div style={{ height: HEADER_H, display: "flex", alignItems: "center", padding: "0 20px", flexShrink: 0, borderBottom: `1px solid ${t.line}`, background: d ? "linear-gradient(135deg, #1A0506 0%, #111113 100%)" : "linear-gradient(135deg, #FFF5F5 0%, #FFFFFF 100%)" }}>
        <div style={{ width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <HubLogo variant="sandra" size={32} dark={d} shadow={false} />
        </div>
        <div style={{ marginLeft: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em", color: t.hi, lineHeight: 1 }}>
            Sandra<span style={{ background: "linear-gradient(90deg, #ED1C24, #C6168D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Hub</span>
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 14px 24px", display: "flex", flexDirection: "column", gap: 26 }}>
        {/* Filter laporan (hanya tampil untuk role yang akses PNL) */}
        {!hideSidebarFilter && !isSDPMember && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <SlidersHorizontal size={12} style={{ color: t.lo }} />
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: t.mid }}>Filter Laporan</span>
              </div>
              <button onClick={clearFilters} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${t.line}`, cursor: "pointer", fontSize: 10.5, fontWeight: 500, color: t.mid, padding: "3px 8px", borderRadius: 5, fontFamily: "inherit" }}>
                <X size={10} />Reset
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {(isSPM || isIOHAny) && (
                <FilterSelect label={iohLockedRegion ? "Region (terkunci)" : (isIOHAny ? "Region View" : "Region")} icon={<Globe size={12} />} value={activeRegion}
                  onChange={v => { if (iohLockedRegion) return; setActiveRegion(v); setActivePartner(""); setActiveBranch(""); }}
                  t={t} d={d} disabled={!!iohLockedRegion}>
                  <option value="SUMATERA">Seluruh Sumatera</option>
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </FilterSelect>
              )}
              {iohLockedRegion && (
                <div style={{ padding: "8px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 600, background: t.yellowBg, border: `1px solid ${t.yellowBd}`, color: t.yellow, display: "flex", alignItems: "center", gap: 7 }}>
                  <Globe size={12} style={{ flexShrink: 0 }} />Akses dibatasi: {iohLockedRegion}
                </div>
              )}
              <FilterSelect label="Nama Partner" icon={<Building2 size={12} />} value={activePartner}
                onChange={v => { setActivePartner(v); setActiveBranch(""); setActiveType("ALL"); }} t={t} d={d} disabled={isMPX}>
                <option value="" disabled>Pilih Partner</option>
                {filteredPartners.map(p => <option key={p} value={p}>{p}</option>)}
              </FilterSelect>
              {activePartner && availableTypes.length > 1 && (
                <FilterSelect label="Tipe (MPC / MP3)" icon={<SlidersHorizontal size={12} />} value={activeType}
                  onChange={v => { setActiveType(v); setActiveBranch(""); }} t={t} d={d}>
                  <option value="ALL">Semua Tipe</option>
                  {availableTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                </FilterSelect>
              )}
              <FilterSelect label={availableBranches.length > 1 ? "Cabang (pilih salah satu)" : "Branch"}
                icon={<Store size={12} />} value={activeBranch} onChange={v => setActiveBranch(v)}
                t={t} d={d} disabled={!activePartner}>
                <option value="" disabled>Pilih Cabang</option>
                {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
              </FilterSelect>
              {activePartner && (!activeBranch || (availableTypes.length > 1 && activeType === "ALL")) && (
                <div style={{ padding: "8px 11px", borderRadius: 7, fontSize: 11, fontWeight: 500, background: t.yellowBg, border: `1px solid ${t.yellowBd}`, color: t.yellow, display: "flex", alignItems: "flex-start", gap: 7, lineHeight: 1.45 }}>
                  <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{availableTypes.length > 1 && activeType === "ALL" ? "Pilih tipe MPC/MP3 untuk melanjutkan." : "Pilih cabang untuk membuka laporan."}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigasi */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: t.mid, paddingLeft: 2, marginBottom: 8 }}>Navigasi</div>
          <button onClick={() => setNavOpen(!navOpen)} className="snav" style={{ marginBottom: 2 }}>
            <span style={{ display: "flex", opacity: 0.7 }}><LayoutGrid size={15} /></span>
            <span style={{ flex: 1 }}>Overview</span>
            <span style={{ display: "flex", opacity: 0.5, transform: navOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform .18s" }}><ChevronDown size={13} /></span>
          </button>
          <AnimatePresence>
            {navOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.17 }} style={{ overflow: "hidden" }}>
                <div style={{ marginLeft: 14, paddingLeft: 10, borderLeft: `1px solid ${t.line}`, paddingTop: 4, paddingBottom: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                  {canMonitor && <SNavItem icon={<Layers size={14} />}        label="PNL Control Center"   active={view === "control-center"} onClick={() => navigate("control-center")} />}
                  {canMonitor && <SNavItem icon={<Table2 size={14} />}        label="Pivot P&L Summary"    active={view === "pivot-summary"}  onClick={() => navigate("pivot-summary")} />}
                  {!isSDPMember && <SNavItem icon={<Wallet size={14} />}      label="Payout Tracker"       active={view === "payout-tracker"} onClick={() => navigate("payout-tracker")} />}
                  {!isSDPMember && <SNavItem icon={<PieChart size={14} />}    label="Laporan P&L"          active={PNL_VIEWS.has(view)}       onClick={() => navigate("summary")} />}
                  {canSdp       && <SNavItem icon={<Users size={14} />}       label="SDP Status"           active={view === "sdp-status"}     onClick={() => navigate("sdp-status")} />}
                  {canMfts && <SNavItem icon={<Briefcase size={14} />} label="Pemenuhan Manpower" active={view === "mfts"}          onClick={() => navigate("mfts")} />}
                  {isSPM        && <SNavItem icon={<Shield size={14} />}      label="Admin Panel"          active={view === "admin-panel"}    onClick={() => navigate("admin-panel")} />}
                  {isSPM        && <SNavItem icon={<FileSpreadsheet size={14} />} label="Import Data"      active={view === "import-wizard"}  onClick={() => navigate("import-wizard")} />}
                  {isSPM        && <SNavItem icon={<MapPin size={14} />}           label="MC/Cluster Mapping" active={view === "mc-cluster"}       onClick={() => navigate("mc-cluster")} />}
                  {isSPM        && <SNavItem icon={<Key size={14} />}              label="Kode Otoritas"      active={view === "kode-otoritas"}    onClick={() => navigate("kode-otoritas")} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", background: t.appBg, color: t.hi, fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased", overflow: "hidden" }}>
      <style>{buildGlobalCSS(d, t)}</style>

      <aside className="lg-sidebar" style={{ width: sidebarCollapsed ? 0 : SIDEBAR_W, flexShrink: 0, background: t.sidebar, borderRight: sidebarCollapsed ? "none" : `1px solid ${t.line}`, height: "100vh", position: "sticky", top: 0, zIndex: 50, overflow: "hidden", transition: "width .22s cubic-bezier(0.4,0,0.2,1)", display: "none" }}>
        <div style={{ width: SIDEBAR_W, height: "100%", flexShrink: 0 }}><SidebarInner /></div>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", minWidth: 0 }}>
        {/* Header */}
        <header className="header-pad" style={{ height: HEADER_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", gap: 12, background: d ? "rgba(17,17,19,0.92)" : "rgba(255,255,255,0.92)", borderBottom: `1px solid ${t.line}`, backdropFilter: "blur(24px)", zIndex: 40, position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #ED1C24 0%, #FFCB05 33%, #32BCAD 66%, #C6168D 100%)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div className="lg-sidebar-toggle" style={{ display: "none" }}>
              <SidebarToggleBtn collapsed={sidebarCollapsed} onToggle={handleToggleSidebar} t={t} />
            </div>
            <button className="mob-hamburger" onClick={() => setMobileOpen(true)} style={{ display: "none", width: 36, height: 36, alignItems: "center", justifyContent: "center", border: `1px solid ${t.line}`, background: t.inputBg, borderRadius: 8, cursor: "pointer", color: t.mid }}>
              <Menu size={17} />
            </button>
            {!hideDatePicker && (
              <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.inputBd}`, borderRadius: 8, background: t.inputBg, height: 36, overflow: "hidden", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", borderRight: `1px solid ${t.inputBd}`, height: "100%", position: "relative" }}>
                  <Calendar size={13} style={{ color: t.blue, marginLeft: 11 }} />
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <select value={activeMonth} onChange={e => setActiveMonth(e.target.value)}
                      style={{ appearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, cursor: "pointer", paddingLeft: 7, paddingRight: 24, height: 36, fontFamily: "inherit" }}>
                      {availableMonths.map(m => (
                        <option key={m} value={m} disabled={activeContextDisabledMonths.has(m)}>{m}{activeContextDisabledMonths.has(m) ? " (nonaktif)" : ""}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} style={{ position: "absolute", right: 6, pointerEvents: "none", color: t.lo }} />
                  </div>
                </div>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <select value={activeYear} onChange={e => setActiveYear(e.target.value)} style={{ appearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, cursor: "pointer", paddingLeft: 12, paddingRight: 28, height: 36, fontFamily: "inherit" }}>
                    {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                  </select>
                  <ChevronDown size={12} style={{ position: "absolute", right: 9, pointerEvents: "none", color: t.lo }} />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button className="icon-btn" onClick={toggleTheme} style={{ width: 36, height: 36 }}>{d ? <Sun size={15} /> : <Moon size={15} />}</button>
            <NotificationBell t={t} d={d} isSPM={canMonitor} activeYear={activeYear} masterData={masterData} disabledMonthsMap={disabledMonthsMap} />
            <div style={{ position: "relative" }}>
              <button onClick={() => setProfileOpen(!profileOpen)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 10px 0 4px", height: 36, borderRadius: 8, border: `1px solid ${profileOpen ? t.blueBd : t.line}`, background: profileOpen ? t.blueSoft : t.inputBg, cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", fontSize: 12, fontWeight: 700 }}>
                  {profile?.full_name?.charAt(0) || "U"}
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: t.hi, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="lg-hide-text">
                  {profile?.full_name?.split(" ")[0]}
                </span>
                <ChevronDown size={12} style={{ color: t.lo, transform: profileOpen ? "rotate(180deg)" : "rotate(0)" }} />
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.13 }}
                    style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 232, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, boxShadow: t.shadowLg, zIndex: 200, overflow: "hidden" }}>
                    <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${t.lineSoft}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>{profile?.full_name?.charAt(0) || "U"}</div>
                        <div style={{ overflow: "hidden", minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.full_name || "Member"}</div>
                          <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.email}</div>
                        </div>
                      </div>
                      <RoleBadge role={profile?.role} t={t} />
                    </div>
                    <div style={{ padding: 6 }}>
                      <button className="danger-btn" onClick={async () => { await supabase.auth.signOut(); router.replace("/sandra/login"); }}><LogOut size={14} /> Keluar dari Akun</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="content-pad" style={{ flex: 1, overflowY: "auto", padding: "28px 28px 48px" }}>
          <AnimatePresence mode="wait">

            {/* ── Overview ── */}
            {view === "overview" && (
              <motion.div key="ov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ maxWidth: 980, margin: "0 auto" }}>
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.025em", color: t.hi, marginBottom: 6 }}>Daftar Laporan</h1>
                  <p style={{ fontSize: 14, color: t.mid }}>Pilih modul laporan yang ingin Anda kelola.</p>
                  <div style={{ width: 40, height: 3, borderRadius: 2, marginTop: 12, background: "linear-gradient(90deg, #ED1C24, #C6168D)" }} />
                </div>

                {!isSDPMember && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", marginBottom: 24, borderRadius: 9, border: `1px solid ${activePartner ? t.blueBd : t.line}`, background: activePartner ? t.blueSoft : t.card }}>
                    <MapPin size={14} style={{ color: activePartner ? t.blue : t.lo, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: activePartner ? t.hi : t.mid, lineHeight: 1.5, minWidth: 0 }}>
                      {activePartner
                        ? <><strong style={{ fontWeight: 600 }}>{activePartner}</strong>{activeBranch && <> &middot; <strong style={{ fontWeight: 600 }}>{activeBranch}</strong></>}{iohLockedRegion && <span style={{ color: t.yellow, fontSize: 12, marginLeft: 8 }}>({iohLockedRegion})</span>}</>
                        : iohLockedRegion ? `Pilih partner di region ${iohLockedRegion} dari sidebar.`
                        : "Tentukan filter di sidebar untuk mengaktifkan modul laporan."}
                    </span>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>

                  {/* Laporan P&L — hanya untuk non-CSE/SDP */}
                  {!isSDPMember && (
                    <DashCard icon={<PieChart size={20} />} title="Laporan P&L"
                      desc="Analisis pendapatan harian, margin produk, dan pengeluaran operasional partner."
                      tag="Profit & Loss" active={true} onClick={() => navigate("summary")} t={t} d={d}
                      accent={{ color: d ? "#32BCAD" : "#1A9E90", bg: d ? "rgba(50,188,173,0.12)" : "rgba(50,188,173,0.08)", bd: d ? "rgba(50,188,173,0.30)" : "rgba(50,188,173,0.20)", shadow: "rgba(50,188,173,0.20)" }} />
                  )}

                  {canMonitor && (
                    <DashCard icon={<Layers size={20} />} title="PNL Control Center"
                      desc={isMPX ? "Monitoring progres pengisian laporan branch-branch di partner Anda." : "Monitoring progres pengisian laporan seluruh branch di wilayah Sumatera."}
                      tag="Admin" active={true} onClick={() => navigate("control-center")} t={t} d={d}
                      accent={{ color: "#ED1C24", bg: d ? "rgba(237,28,36,0.10)" : "rgba(237,28,36,0.06)", bd: d ? "rgba(237,28,36,0.26)" : "rgba(237,28,36,0.16)", shadow: "rgba(237,28,36,0.16)" }} />
                  )}

                  {canMonitor && (
                    <DashCard icon={<Table2 size={20} />} title="Pivot P&L Summary"
                      desc={isMPX ? "Ringkasan REV, EXP, dan P/L branch-branch partner Anda dalam pivot table." : "Ringkasan REV, EXP, dan P/L seluruh MPX per bulan dalam format pivot table."}
                      tag="Admin" active={true} onClick={() => navigate("pivot-summary")} t={t} d={d}
                      accent={{ color: d ? "#C49A00" : "#9A7400", bg: d ? "rgba(255,203,5,0.11)" : "rgba(255,203,5,0.09)", bd: d ? "rgba(255,203,5,0.28)" : "rgba(255,203,5,0.20)", shadow: "rgba(255,203,5,0.18)" }} />
                  )}

                  {!isSDPMember && (
                    <DashCard icon={<Wallet size={20} />} title="Payout Tracker"
                      desc="Monitoring pembayaran Partner & Agency Prepaid — SLA, funnel, heatmap, dan raw data."
                      tag="Admin" active={true} onClick={() => navigate("payout-tracker")} t={t} d={d}
                      accent={{ color: "#C6168D", bg: d ? "rgba(198,22,141,0.11)" : "rgba(198,22,141,0.07)", bd: d ? "rgba(198,22,141,0.28)" : "rgba(198,22,141,0.16)", shadow: "rgba(198,22,141,0.16)" }} />
                  )}

                  {/* SDP Status — SPM, BSM, CSE, SDP user */}
                  {canSdp && (
                    <DashCard icon={<Users size={20} />} title="SDP Status"
                      desc={
                        isSPM       ? "Upload territory, mapping kode otoritas, rekap data, dan pantau status seluruh SDP Sumatera." :
                        isCSE       ? `Isi formulir data SDP di cluster ${profile?.cluster || "Anda"}.` :
                        isBSM       ? "Kelola kode otoritas CSE/RGE, rekap data SDP, dan konfirmasi di branch Anda." :
                        isPICRegion ? "Monitor progres pengisian dan konfirmasi BSM seluruh SDP." :
                                      `Isi dan submit data SDP Anda.`
                      }
                      tag={isSPM ? "Admin" : isBSM ? "BSM" : isPICRegion ? "PIC" : "SDP"} active={true} onClick={() => navigate("sdp-status")} t={t} d={d}
                      accent={{ color: d ? "#30D158" : "#1A9E5A", bg: d ? "rgba(48,209,88,0.11)" : "rgba(26,158,90,0.07)", bd: d ? "rgba(48,209,88,0.28)" : "rgba(26,158,90,0.20)", shadow: "rgba(48,209,88,0.16)" }} />
                  )}

                  {canMfts && (
                    <DashCard icon={<Briefcase size={20} />} title="Pemenuhan Manpower"
                      desc="Lacak pemenuhan DSF: alokasi per cluster, vacancy yang sedang digarap, roster manpower, dan progres agency."
                      tag="Manpower" active={true} onClick={() => navigate("mfts")} t={t} d={d}
                      accent={{ color: d ? "#0A84FF" : "#2563EB", bg: d ? "rgba(10,132,255,0.12)" : "rgba(37,99,235,0.07)", bd: d ? "rgba(10,132,255,0.28)" : "rgba(37,99,235,0.18)", shadow: "rgba(37,99,235,0.16)" }} />
                  )}

                  {isSPM && (
                    <DashCard icon={<Shield size={20} />} title="Admin Panel"
                      desc="Kelola role, permission, kode otoritas, dan daftar partner branches seluruh Sumatera."
                      tag="Admin" active={true} onClick={() => navigate("admin-panel")} t={t} d={d}
                      accent={{ color: d ? "#A78BFA" : "#7C3AED", bg: d ? "rgba(167,139,250,0.11)" : "rgba(124,58,237,0.07)", bd: d ? "rgba(167,139,250,0.28)" : "rgba(124,58,237,0.18)", shadow: "rgba(124,58,237,0.18)" }} />
                  )}

                  {isSPM && (
                    <DashCard icon={<MapPin size={20} />} title="MC / Cluster Mapping"
                      desc="Kelola mapping MC (IM3) dan Cluster (3ID) per branch. Upload CSV atau tambah data manual."
                      tag="Admin" active={true} onClick={() => navigate("mc-cluster")} t={t} d={d}
                      accent={{ color: d ? "#32BCAD" : "#1A9E90", bg: d ? "rgba(50,188,173,0.12)" : "rgba(50,188,173,0.08)", bd: d ? "rgba(50,188,173,0.30)" : "rgba(50,188,173,0.20)", shadow: "rgba(50,188,173,0.20)" }} />
                  )}

                  {isSPM && (
                    <DashCard icon={<FileSpreadsheet size={20} />} title="Import Data Otomatis"
                      desc="Upload Excel/CSV, mapping kolom drag-and-drop, lalu import massal ke database laporan."
                      tag="Admin" active={true} onClick={() => navigate("import-wizard")} t={t} d={d}
                      accent={{ color: d ? "#60C8F0" : "#0284C7", bg: d ? "rgba(96,200,240,0.11)" : "rgba(2,132,199,0.07)", bd: d ? "rgba(96,200,240,0.28)" : "rgba(2,132,199,0.18)", shadow: "rgba(2,132,199,0.16)" }} />
                  )}

                  {isSPM && (
                    <DashCard icon={<Key size={20} />} title="Kode Otoritas"
                      desc="Kelola semua kode otoritas BSM, Sales Team (MC/Cluster), dan Partner dalam satu tempat."
                      tag="Admin" active={true} onClick={() => navigate("kode-otoritas")} t={t} d={d}
                      accent={{ color: "#C6168D", bg: d ? "rgba(198,22,141,0.11)" : "rgba(198,22,141,0.07)", bd: d ? "rgba(198,22,141,0.28)" : "rgba(198,22,141,0.16)", shadow: "rgba(198,22,141,0.16)" }} />
                  )}
                </div>
              </motion.div>
            )}

            {/* ── PNL Control Center ── */}
            {view === "control-center" && canMonitor && (
              <motion.div key="cc" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <PNLControlCenter
                  theme={theme} masterData={masterData} activeYear={activeYear} activeMonth={activeMonth}
                  disabledMonthsMap={disabledMonthsMap} userRole={profile?.role}
                  partnerName={isMPX ? profile?.partner_name : null}
                  onOpenBranch={p => { setActivePartner(p.partner_name); setActiveBranch(p.branch_name); setActiveType(p.mpc_mp3); setActiveMonth(p.month); setView("summary"); }}
                />
              </motion.div>
            )}

            {/* ── Pivot P&L Summary ── */}
            {view === "pivot-summary" && canMonitor && (
              <motion.div key="ps" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <PNLPivotSummary theme={theme} activeYear={activeYear} userRole={profile?.role} partnerName={isMPX ? profile?.partner_name : null} />
              </motion.div>
            )}

            {/* ── Payout Tracker ── */}
            {view === "payout-tracker" && !isSDPMember && (
              <motion.div key="pt" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <PayoutTracker theme={theme} profile={profile} regionFilter={iohRegionView} partnerName={isMPX ? (profile?.partner_name || null) : (activePartner || null)} filterType={activeType !== "ALL" ? activeType : null} readOnly={isReadOnly} masterData={masterData} />
              </motion.div>
            )}

            {/* ── MFTS — Pemenuhan Manpower ── */}
            {view === "mfts" && canMfts && (
              <motion.div key="mfts" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <MFTS_Module supabase={supabase} theme={theme} profile={profile} scopeRegion={iohRegionView} />
              </motion.div>
            )}

            {/* ── Admin Panel ── */}
            {view === "admin-panel" && isSPM && (
              <motion.div key="ap" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <AdminPanel theme={theme} profile={profile} onBranchesChanged={refreshBranches} />
              </motion.div>
            )}

            {/* ── Import Data Otomatis ── */}
            {view === "import-wizard" && isSPM && (
              <motion.div key="iw" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.surface, boxShadow: t.shadowSm, overflow: "hidden" }}>
                  <div style={{ padding: "28px 32px" }}>
                    <PNL_ImportWizard theme={theme} supabase={supabase} />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── MC / Cluster Mapping ── */}
            {view === "mc-cluster" && isSPM && (
              <motion.div key="mc" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <MC_ClusterMapping theme={theme} profile={profile} />
              </motion.div>
            )}

            {/* ── Kode Otoritas ── */}
            {view === "kode-otoritas" && isSPM && (
              <motion.div key="ko" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <KodeOtoritas theme={theme} profile={profile} />
              </motion.div>
            )}

            {/* ── SDP Status ── */}
            {view === "sdp-status" && canSdp && (
              <motion.div key="sdp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                {!isSDPMember && (
                  <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}>
                    <ChevronLeft size={15} /> Kembali ke Overview
                  </button>
                )}
                <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.surface, boxShadow: t.shadowSm, overflow: "hidden" }}>
                  <div style={{ padding: "24px 28px" }}>
                    <SDP_StatusForm
                      supabase={supabase}
                      theme={theme}
                      profile={profile}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Laporan P&L (Summary / Pendapatan / Pengeluaran) ── */}
            {PNL_VIEWS.has(view) && (
              <motion.div key="fv" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ maxWidth: 920, margin: "0 auto" }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 20 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                {!canPnl ? (
                  <PnlPickerPrompt t={t} d={d} isSPM={isSPM} isMPX={isMPX} isIOHAny={isIOHAny} iohLockedRegion={iohLockedRegion}
                    regions={regions} filteredPartners={filteredPartners} availableTypes={availableTypes} availableBranches={availableBranches}
                    activeRegion={activeRegion} setActiveRegion={setActiveRegion}
                    activePartner={activePartner} setActivePartner={setActivePartner}
                    activeType={activeType} setActiveType={setActiveType}
                    activeBranch={activeBranch} setActiveBranch={setActiveBranch}
                    onBack={() => navigate("overview")} />
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
                      <div style={{ display: "inline-flex", gap: 2, padding: 4, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card }}>
                        {[
                          { id: "summary",     label: "Summary",     icon: <LayoutGrid size={14} /> },
                          { id: "pendapatan",  label: "Pendapatan",  icon: <ArrowUpRight size={14} /> },
                          { id: "pengeluaran", label: "Pengeluaran", icon: <ArrowDownLeft size={14} /> },
                        ].map(tab => (
                          <button key={tab.id} onClick={() => navigateTab(tab.id)} className={`tab-pill ${view === tab.id ? "on" : "off"}`}>
                            {tab.icon}<span className="tab-label">{tab.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.surface, boxShadow: t.shadowSm, overflow: "hidden" }}>
                      <div style={{ padding: "28px 32px" }}>
                        <AnimatePresence mode="wait">
                          {view === "summary" && (
                            <motion.div key="sv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}>
                              <FormSummary theme={theme} activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }} />
                            </motion.div>
                          )}
                          {view === "pendapatan" && (
                            <motion.div key="pv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}>
                              <FormPendapatan
                                theme={theme}
                                setIsFormDirty={isReadOnly ? undefined : setFormDirty}
                                readOnly={isReadOnly}
                                userRole={profile?.role}
                                activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }}
                                disabledMonths={activeContextDisabledMonths}
                                onMonthChange={setActiveMonth}
                              />
                            </motion.div>
                          )}
                          {view === "pengeluaran" && (
                            <motion.div key="ev" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}>
                              <FormPengeluaran
                                theme={theme}
                                setIsFormDirty={isReadOnly ? undefined : setFormDirty}
                                readOnly={isReadOnly}
                                activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }}
                                disabledMonths={activeContextDisabledMonths}
                                onMonthChange={setActiveMonth}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Sidebar Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }} />
            <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
              style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 268, maxWidth: "85vw", background: t.sidebar, borderRight: `1px solid ${t.line}`, display: "flex", flexDirection: "column", zIndex: 50 }}>
              <button onClick={() => setMobileOpen(false)} style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 7, border: `1px solid ${t.line}`, background: t.inputBg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.mid, zIndex: 10 }}>
                <X size={14} />
              </button>
              <SidebarInner />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Exit Confirm Modal */}
      <AnimatePresence>
        {exitConfirm && (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(10,12,18,0.62)", backdropFilter: "blur(14px)" }}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ duration: 0.14 }}
              style={{ maxWidth: 340, width: "100%", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: t.shadowLg, overflow: "hidden" }}>
              <div style={{ padding: 26, textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 11, background: t.redBg, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", color: t.red }}>
                  <AlertTriangle size={22} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: t.hi, marginBottom: 7 }}>Batalkan Progress?</h3>
                <p style={{ fontSize: 13.5, color: t.mid, lineHeight: 1.55, marginBottom: 22 }}>Data yang belum disimpan akan terhapus.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <button onClick={() => { setFormDirty(false); setView(pendingView); setExitConfirm(false); setPendingView(null); }}
                    style={{ width: "100%", padding: 11, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", color: "#FFFFFF", border: "none", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Hapus & Lanjutkan
                  </button>
                  <button onClick={() => { setExitConfirm(false); setPendingView(null); }}
                    style={{ width: "100%", padding: 11, background: "transparent", color: t.mid, border: `1px solid ${t.line}`, borderRadius: 8, fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                    Kembali ke Form
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @media (min-width: 1024px) {
          aside.lg-sidebar { display: flex !important; }
          .lg-sidebar-toggle { display: flex !important; }
          .mob-hamburger { display: none !important; }
          .lg-hide-text { display: inline !important; }
        }
        @media (max-width: 1023px) {
          aside.lg-sidebar { display: none !important; }
          .lg-sidebar-toggle { display: none !important; }
          .mob-hamburger { display: flex !important; }
        }
      `}</style>
    </div>
  );
} 