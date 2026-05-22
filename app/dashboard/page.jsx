"use client";
/**
 * page.jsx — perbaikan:
 * 1. Header month/year picker disembunyikan saat view = control-center | pivot-summary | payout-tracker
 * 2. disabledMonthsMap (partner+branch -> Set<month>) di-load di sini dan dipass ke Form*
 *    agar FormPendapatan & FormPengeluaran bisa grey-out / blokir bulan yang disabled
 * 3. activeMonth di-clamp supaya tidak masuk ke bulan disabled saat user navigasi
 */
import { useEffect, useState, useMemo } from "react";
import supabase from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, ArrowUpRight, ArrowDownLeft, LayoutGrid, PieChart, Sun, Moon,
  Menu, X, ChevronLeft, AlertTriangle, MapPin, ChevronDown,
  LogOut, ChevronRight, Calendar, Box, Layers,
  Shield, Globe, Building2, Store, SlidersHorizontal,
  Table2, CreditCard, TrendingUp, Wallet, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";

import FormPendapatan   from "./components/PNL_FormPendapatan";
import FormPengeluaran  from "./components/PNL_FormPengeluaran";
import FormSummary      from "./components/PNL_MPX_Summary";
import PNLControlCenter from "./components/PNL_ControlCenter.jsx";
import PNLPivotSummary  from "./components/PNL_PivotSummary";
import PayoutTracker    from "./components/PayoutTracker";
import NotificationBell from "./components/NotificationBell";

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
  yellow:    "#FFCB05",
  yellowBg:  d ? "#2A2200" : "#FFFBEA",
  yellowBd:  d ? "#5C4B00" : "#FFE680",
  magenta:   "#C6168D",
  magentaBg: d ? "#270016" : "#FEECF8",
  magentaBd: d ? "#520030" : "#F0A8DC",
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
  @keyframes brand-beat { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.92); } }
  @keyframes spin-ring { to { transform: rotate(360deg); } }
  @keyframes load-sweep { 0% { left: -45%; width: 42%; } 50% { left: 28%; width: 58%; } 100% { left: 110%; width: 42%; } }
  @keyframes fade-up { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes dot-bounce { 0%, 80%, 100% { transform: scale(0); opacity: 0.3; } 40% { transform: scale(1); opacity: 1; } }
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
  .sidebar-toggle {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 6px; border: none;
    cursor: pointer; transition: all .15s; outline: none;
    color: ${t.lo}; background: transparent;
  }
  .sidebar-toggle:hover { background: ${t.hover}; color: ${t.mid}; }
`;

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
    <div onClick={active ? onClick : undefined} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: 24, borderRadius: 12, border: `1px solid ${hov && active ? ac.bd : t.line}`, background: t.card, cursor: active ? "pointer" : "not-allowed", opacity: active ? 1 : 0.5, transition: "border-color .15s, box-shadow .15s, transform .15s", boxShadow: hov && active ? `0 8px 24px ${ac.shadow}, ${t.shadowSm}` : t.shadowSm, transform: hov && active ? "translateY(-2px)" : "translateY(0)", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: hov && active ? ac.color : ac.bg, color: hov && active ? "#FFFFFF" : ac.color, border: `1px solid ${hov && active ? ac.color : ac.bd}`, transition: "background .15s, color .15s, border-color .15s" }}>{icon}</div>
        {tag && (
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 4, background: tag === "Admin" ? t.magentaBg : t.greenBg, color: tag === "Admin" ? t.magenta : t.green, border: `1px solid ${tag === "Admin" ? t.magentaBd : t.greenBd}` }}>{tag}</span>
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

const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const CURRENT_DATE        = new Date();
const CURRENT_MONTH_INDEX = CURRENT_DATE.getMonth();
const CURRENT_YEAR        = CURRENT_DATE.getFullYear();
const getCurrentMonth     = () => MONTHS[CURRENT_MONTH_INDEX];
const getCurrentYear      = () => CURRENT_YEAR.toString();

// Views where month/year picker in header should be hidden
const HIDE_DATE_PICKER_VIEWS = new Set(["control-center", "pivot-summary", "payout-tracker"]);

function LoadingScreen() {
  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, background: "#0D0D0E", fontFamily: FONT_STACK, position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin-ring { to { transform: rotate(360deg); } }
        @keyframes spin-ring-r { to { transform: rotate(-360deg); } }
        @keyframes brand-beat { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.55;transform:scale(.9);} }
        @keyframes load-sweep { 0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%} }
        @keyframes fade-in-up { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        @keyframes dot-b { 0%,80%,100%{transform:scale(0.4);opacity:.3}40%{transform:scale(1);opacity:1} }
        @keyframes mesh-1 { 0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(40px,-30px) scale(1.06)}68%{transform:translate(-20px,35px) scale(0.94)} }
        @keyframes mesh-2 { 0%,100%{transform:translate(0,0) scale(1)}42%{transform:translate(-50px,20px) scale(1.05)}72%{transform:translate(30px,-40px) scale(0.93)} }
        @keyframes mesh-3 { 0%,100%{transform:translate(0,0) scale(1)}52%{transform:translate(35px,30px) scale(1.08)} }
      `}</style>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(237,28,36,0.18) 0%,transparent 70%)", animation: "mesh-1 18s ease-in-out infinite", filter: "blur(1px)" }}/>
        <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: "55vw", height: "55vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(198,22,141,0.16) 0%,transparent 70%)", animation: "mesh-2 24s ease-in-out infinite", filter: "blur(1px)" }}/>
        <div style={{ position: "absolute", top: "35%", right: "15%", width: "35vw", height: "35vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(50,188,173,0.14) 0%,transparent 70%)", animation: "mesh-3 28s ease-in-out infinite", filter: "blur(1px)" }}/>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%,transparent 20%,rgba(13,13,14,0.80) 100%)" }}/>
      </div>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2.5, overflow: "hidden", background: "rgba(237,28,36,0.10)" }}>
        <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,transparent,#ED1C24 35%,#FFCB05 55%,#32BCAD 75%,#C6168D,transparent)", animation: "load-sweep 1.6s cubic-bezier(0.4,0,0.2,1) infinite" }}/>
      </div>
      <div style={{ position: "relative", width: 80, height: 80, marginBottom: 28, animation: "fade-in-up 0.4s ease both", animationDelay: "0.1s" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(237,28,36,0.14)" }}/>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#ED1C24", borderRightColor: "transparent", animation: "spin-ring 1.1s linear infinite" }}/>
        <div style={{ position: "absolute", inset: 6, borderRadius: "50%", border: "1.5px solid transparent", borderTopColor: "#C6168D", borderLeftColor: "transparent", animation: "spin-ring-r 1.7s linear infinite" }}/>
        <div style={{ position: "absolute", inset: 14, borderRadius: 12, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", display: "flex", alignItems: "center", justifyContent: "center", animation: "brand-beat 2s ease-in-out infinite" }}>
          <Box size={22} color="#FFFFFF" strokeWidth={2.2} />
        </div>
      </div>
      <div style={{ textAlign: "center", animation: "fade-in-up 0.4s ease both", animationDelay: "0.2s" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8, color: "#F2F2F3" }}>
          Sandra<span style={{ background: "linear-gradient(90deg,#ED1C24,#C6168D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#4D4D4F" }}>SPM Sumatera</div>
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 32, animation: "fade-in-up 0.4s ease both", animationDelay: "0.35s" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === 0 ? "#ED1C24" : i === 1 ? "#FFCB05" : "#32BCAD", animation: `dot-b 1.4s ease-in-out ${i * 0.16}s infinite` }}/>
        ))}
      </div>
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

export default function DashboardPage() {
  const router = useRouter();
  const [loading,          setLoading]          = useState(true);
  const [profile,          setProfile]          = useState(null);
  const [view,             setView]             = useState("overview");
  const [theme,            setTheme]            = useState("dark");
  const [profileOpen,      setProfileOpen]      = useState(false);
  const [navOpen,          setNavOpen]          = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [masterData,       setMasterData]       = useState([]);
  const [regions,          setRegions]          = useState([]);
  const [activeRegion,     setActiveRegion]     = useState("SUMATERA");
  const [activePartner,    setActivePartner]    = useState("");
  const [activeType,       setActiveType]       = useState("ALL");
  const [activeBranch,     setActiveBranch]     = useState("");
  const [activeMonth,      setActiveMonth]      = useState(getCurrentMonth);
  const [activeYear,       setActiveYear]       = useState(getCurrentYear);
  const [formDirty,        setFormDirty]        = useState(false);
  const [exitConfirm,      setExitConfirm]      = useState(false);
  const [pendingView,      setPendingView]      = useState(null);
  const [mobileOpen,       setMobileOpen]       = useState(false);

  // ── Disabled months map: loaded from DB + realtime ─────────────────────────
  // Structure: Map< "partner_name|branch_name|mpc_mp3|year" , Set<monthName> >
  // Used by: PNL_ControlCenter (display) + Form* (block month selection)
  const [disabledMonthsMap, setDisabledMonthsMap] = useState(new Map());

  const availableYears = useMemo(() => {
    return Array.from({ length: CURRENT_YEAR - 2026 + 1 }, (_, i) => (2026 + i).toString()).reverse();
  }, []);

  const availableMonths = useMemo(() => {
    if (Number(activeYear) === CURRENT_YEAR) return MONTHS.slice(0, CURRENT_MONTH_INDEX + 1);
    return MONTHS;
  }, [activeYear]);

  // Months disabled specifically for current partner+branch+type context
  // Passed to Form* so they can block/grey those months in their own month picker
  const activeContextDisabledMonths = useMemo(() => {
    if (!activePartner || !activeBranch) return new Set();
    // Resolve mpc_mp3: if activeType is "ALL", look up from masterData
    const resolvedType = (activeType && activeType !== "ALL")
      ? activeType
      : masterData.find(i => i.partner_name === activePartner && i.branch_name === activeBranch)?.mpc_mp3;
    if (!resolvedType) return new Set();
    const key = `${activePartner}|${activeBranch}|${resolvedType}|${activeYear}`;
    return disabledMonthsMap.get(key) || new Set();
  }, [disabledMonthsMap, activePartner, activeBranch, activeType, activeYear, masterData]);

  // If current activeMonth is disabled, auto-advance to a non-disabled month
  useEffect(() => {
    if (activeContextDisabledMonths.has(activeMonth)) {
      const fallback = availableMonths.find(m => !activeContextDisabledMonths.has(m));
      if (fallback) setActiveMonth(fallback);
    }
  }, [activeContextDisabledMonths, activeMonth, availableMonths]);

  const d = theme === "dark";
  const t = tk(d);

  const toggleTheme = () => {
    const next = d ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("sh-theme", next);
  };

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    setTheme(localStorage.getItem("sh-theme") || "dark");
    const sc = localStorage.getItem("sh-sidebar-collapsed");
    if (sc) setSidebarCollapsed(sc === "true");
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      let query = supabase.from("partner_branches").select("*").order("partner_name", { ascending: true });
      if (prof?.role === "finance_mpx") query = query.eq("partner_name", prof?.partner_name);
      const { data: mapData } = await query;
      setProfile(prof);
      setMasterData(mapData || []);
      setRegions([...new Set(mapData?.map(i => i.region))].sort());
      if (prof?.role === "finance_mpx") setActivePartner(prof?.partner_name || "");
      setLoading(false);
    })();
  }, [router]);

  // ── Load disabled months from DB (scoped to activeYear) ──────────────────
  // NOTE: Requires table `pnl_disabled_months` — see SQL schema in PNL_ControlCenter.jsx
  useEffect(() => {
    if (!activeYear) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("pnl_disabled_months")
          .select("partner_name,branch_name,mpc_mp3,month,year");
        // Load ALL years — activeContextDisabledMonths key includes year for filtering
        if (error) {
          // 42P01 = table does not exist yet → silently skip, feature inactive
          if (error.code === "42P01" || error.message?.includes("does not exist")) {
            console.warn("[pnl_disabled_months] Tabel belum dibuat — jalankan SQL schema di Supabase. Fitur disable bulan dinonaktifkan sementara.");
          } else {
            console.error("[pnl_disabled_months] Gagal memuat:", error.message ?? error);
          }
          setDisabledMonthsMap(new Map());
          return;
        }
        const map = new Map();
        (data || []).forEach(r => {
          // Stringify year for consistent key comparison with activeYear (string)
          const key = `${r.partner_name}|${r.branch_name}|${r.mpc_mp3}|${String(r.year)}`;
          if (!map.has(key)) map.set(key, new Set());
          map.get(key).add(r.month);
        });
        setDisabledMonthsMap(map);
      } catch (e) {
        console.error("[pnl_disabled_months] Exception:", e?.message ?? e);
        setDisabledMonthsMap(new Map());
      }
    })();
  }, [activeYear]);

  // ── Realtime subscription for disabled months ──────────────────────────────
  // Keeps all sessions (including other devices / other accounts with same role) in sync
  useEffect(() => {
    if (!activeYear) return;
    const channel = supabase
      .channel(`page_disabled_months_${activeYear}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pnl_disabled_months", filter: `year=eq.${activeYear}` },
        (payload) => {
          const { eventType, new: n, old: o } = payload;
          setDisabledMonthsMap(prev => {
            const next = new Map(prev);
            if (eventType === "INSERT" && n) {
              const key = `${n.partner_name}|${n.branch_name}|${n.mpc_mp3}|${String(n.year)}`;
              if (!next.has(key)) next.set(key, new Set());
              next.get(key).add(n.month);
            } else if (eventType === "DELETE" && o) {
              const key = `${o.partner_name}|${o.branch_name}|${o.mpc_mp3}|${String(o.year)}`;
              if (next.has(key)) {
                const s = new Set(next.get(key));
                s.delete(o.month);
                if (s.size === 0) next.delete(key);
                else next.set(key, s);
              }
            }
            return next;
          });
        }
      )
      .subscribe((status, err) => {
        if (err) {
          // Silently ignore if table not yet created
          console.warn("[pnl_disabled_months] Realtime subscription:", err?.message ?? err);
        }
      });
    return () => supabase.removeChannel(channel);
  }, [activeYear]);

  const handleToggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("sh-sidebar-collapsed", String(next));
  };

  useEffect(() => {
    if (!activePartner) return;
    const partnerData = masterData.find(i => i.partner_name === activePartner);
    if (partnerData?.region) setActiveRegion(partnerData.region);
  }, [activePartner, masterData]);

  const filteredPartners = useMemo(() => {
    let list = masterData;
    if (activeRegion !== "SUMATERA") list = list.filter(i => i.region === activeRegion);
    return [...new Set(list.map(i => i.partner_name))];
  }, [masterData, activeRegion]);

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
    if (!availableMonths.includes(activeMonth)) setActiveMonth(availableMonths[availableMonths.length - 1]);
  }, [activeYear, availableMonths, activeMonth]);

  const isSPM    = profile?.role === "spm_sumatera";
  const isIOH    = profile?.role === "internal_ioh";
  const isMPX    = profile?.role === "finance_mpx";
  const canPnl   = (isSPM || isIOH)
    ? (!!activePartner && !!activeBranch)
    : (activePartner === profile?.partner_name && !!activeBranch);
  const isReadOnly = isIOH;
  const mpxType = activeType !== "ALL" ? activeType : masterData.find(i => i.partner_name === activePartner && i.branch_name === activeBranch)?.mpc_mp3;

  const clearFilters = () => {
    setActiveRegion("SUMATERA");
    if (isSPM || isIOH) { setActivePartner(""); setActiveBranch(""); setActiveType("ALL"); }
  };

  const navigate = (viewId) => {
    if (formDirty) { setPendingView(viewId); setExitConfirm(true); }
    else { setView(viewId); setMobileOpen(false); }
  };

  const navigateTab = (tabId) => {
    if (tabId === view) return;
    if (formDirty) { setPendingView(tabId); setExitConfirm(true); }
    else { setView(tabId); }
  };

  // Months available in the header picker — exclude disabled months for current context
  const availableMonthsForPicker = useMemo(() => {
    return availableMonths.filter(m => !activeContextDisabledMonths.has(m));
  }, [availableMonths, activeContextDisabledMonths]);

  const HEADER_H  = 60;
  const SIDEBAR_W = 252;
  const hideDatePicker = HIDE_DATE_PICKER_VIEWS.has(view);

  if (loading) return <LoadingScreen />;

  const SidebarInner = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", userSelect: "none" }}>
      <div style={{ height: HEADER_H, display: "flex", alignItems: "center", padding: "0 20px", flexShrink: 0, borderBottom: `1px solid ${t.line}`, background: d ? "linear-gradient(135deg, #1A0506 0%, #111113 100%)" : "linear-gradient(135deg, #FFF5F5 0%, #FFFFFF 100%)" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF" }}>
          <Box size={15} strokeWidth={2.4} />
        </div>
        <div style={{ marginLeft: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em", color: t.hi, lineHeight: 1 }}>
            Sandra<span style={{ background: "linear-gradient(90deg, #ED1C24, #C6168D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
          </span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 14px 24px", display: "flex", flexDirection: "column", gap: 26 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <SlidersHorizontal size={12} style={{ color: t.lo }} />
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: t.mid }}>Filter</span>
            </div>
            <button onClick={clearFilters}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${t.line}`, cursor: "pointer", fontSize: 10.5, fontWeight: 500, color: t.mid, padding: "3px 8px", borderRadius: 5, transition: "all .12s", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.blueBd; e.currentTarget.style.color = t.blue; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = t.line; e.currentTarget.style.color = t.mid; }}
            ><X size={10} />Reset</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(isSPM || isIOH) && (
              <FilterSelect label="Region" icon={<Globe size={12} />} value={activeRegion}
                onChange={v => { setActiveRegion(v); setActivePartner(""); setActiveBranch(""); }} t={t} d={d}>
                <option value="SUMATERA">Seluruh Sumatera</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </FilterSelect>
            )}
            <FilterSelect label="Nama Partner" icon={<Building2 size={12} />} value={activePartner}
              onChange={v => { setActivePartner(v); setActiveBranch(""); setActiveType("ALL"); }} t={t} d={d} disabled={isMPX}>
              <option value="" disabled>Pilih Partner</option>
              {filteredPartners.map(p => <option key={p} value={p}>{p}</option>)}
            </FilterSelect>
            {activePartner && (
              <FilterSelect label="Tipe (MPC / MP3)" icon={<SlidersHorizontal size={12} />} value={activeType}
                onChange={v => { setActiveType(v); setActiveBranch(""); }} t={t} d={d}>
                <option value="ALL">Semua Tipe</option>
                {availableTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
              </FilterSelect>
            )}
            <FilterSelect label="Branch" icon={<Store size={12} />} value={activeBranch}
              onChange={v => setActiveBranch(v)} t={t} d={d} disabled={!activePartner}>
              <option value="" disabled>Pilih Cabang</option>
              {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
            </FilterSelect>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: t.mid, paddingLeft: 2, marginBottom: 8 }}>Navigasi</div>
          <button onClick={() => setNavOpen(!navOpen)} className="snav" style={{ marginBottom: 2 }}>
            <span style={{ display: "flex", opacity: 0.7 }}><LayoutGrid size={15} /></span>
            <span style={{ flex: 1 }}>Overview</span>
            <span style={{ display: "flex", opacity: 0.5, transform: navOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .18s" }}><ChevronDown size={13} /></span>
          </button>
          <AnimatePresence>
            {navOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.17 }} style={{ overflow: "hidden" }}>
                <div style={{ marginLeft: 14, paddingLeft: 10, borderLeft: `1px solid ${t.line}`, paddingTop: 4, paddingBottom: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                  {(isSPM || isIOH) && <SNavItem icon={<Layers size={14} />} label="PNL Control Center" active={view === "control-center"} onClick={() => navigate("control-center")} />}
                  {(isSPM || isIOH) && <SNavItem icon={<Table2 size={14} />} label="Pivot P&L Summary" active={view === "pivot-summary"} onClick={() => navigate("pivot-summary")} />}
                  <SNavItem icon={<Wallet size={14} />} label="Payout Tracker" active={view === "payout-tracker"} onClick={() => navigate("payout-tracker")} />
                  <SNavItem icon={<PieChart size={14} />} label="Laporan P&L" active={["summary","pendapatan","pengeluaran"].includes(view)} onClick={() => { if (canPnl) navigate("summary"); }} disabled={!canPnl} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: t.appBg, color: t.hi, fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale", overflow: "hidden", transition: "background .25s, color .25s" }}>
      <style>{buildGlobalCSS(d, t)}</style>
      {/* Desktop sidebar */}
      <aside className="lg-sidebar" style={{ width: sidebarCollapsed ? 0 : SIDEBAR_W, flexShrink: 0, background: t.sidebar, borderRight: sidebarCollapsed ? "none" : `1px solid ${t.line}`, flexDirection: "column", height: "100vh", position: "sticky", top: 0, zIndex: 50, overflow: "hidden", transition: "width .22s cubic-bezier(0.4,0,0.2,1), border-right .22s", display: "none" }}>
        <div style={{ width: SIDEBAR_W, height: "100%", flexShrink: 0 }}><SidebarInner /></div>
      </aside>
      {/* Main column */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", minWidth: 0 }}>
        {/* Header */}
        <header className="header-pad" style={{ height: HEADER_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", gap: 12, background: d ? "rgba(17,17,19,0.92)" : "rgba(255,255,255,0.92)", borderBottom: `1px solid ${t.line}`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", zIndex: 40, position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #ED1C24 0%, #FFCB05 33%, #32BCAD 66%, #C6168D 100%)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div className="lg-sidebar-toggle" style={{ display: "none" }}>
              <SidebarToggleBtn collapsed={sidebarCollapsed} onToggle={handleToggleSidebar} t={t} />
            </div>
            <button className="mob-hamburger" onClick={() => setMobileOpen(true)} style={{ display: "none", width: 36, height: 36, alignItems: "center", justifyContent: "center", border: `1px solid ${t.line}`, background: t.inputBg, borderRadius: 8, cursor: "pointer", color: t.mid, outline: "none" }}>
              <Menu size={17} />
            </button>
            <div className="lg-sidebar-toggle" style={{ display: "none", width: 1, height: 22, background: t.line }} />

            {/* ── Date picker: hidden for control-center / pivot-summary / payout-tracker ── */}
            {!hideDatePicker && (
              <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.inputBd}`, borderRadius: 8, background: t.inputBg, height: 36, overflow: "hidden", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", borderRight: `1px solid ${t.inputBd}`, height: "100%", position: "relative" }}>
                  <Calendar size={13} style={{ color: t.blue, marginLeft: 11 }} />
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <select
                      value={activeMonth}
                      onChange={e => setActiveMonth(e.target.value)}
                      style={{ appearance: "none", WebkitAppearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, cursor: "pointer", outline: "none", paddingLeft: 7, paddingRight: 24, height: 36, fontFamily: "inherit" }}
                    >
                      {availableMonths.map(m => (
                        <option
                          key={m}
                          value={m}
                          disabled={activeContextDisabledMonths.has(m)}
                          style={{
                            color: activeContextDisabledMonths.has(m) ? (d ? "#4A4A58" : "#B0B0C0") : undefined,
                            fontStyle: activeContextDisabledMonths.has(m) ? "italic" : undefined,
                          }}
                        >
                          {m}{activeContextDisabledMonths.has(m) ? " (nonaktif)" : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} style={{ position: "absolute", right: 6, pointerEvents: "none", color: t.lo }} />
                  </div>
                </div>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <select value={activeYear} onChange={e => setActiveYear(e.target.value)} style={{ appearance: "none", WebkitAppearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, cursor: "pointer", outline: "none", paddingLeft: 12, paddingRight: 28, height: 36, fontFamily: "inherit" }}>
                    {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                  </select>
                  <ChevronDown size={12} style={{ position: "absolute", right: 9, pointerEvents: "none", color: t.lo }} />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button className="icon-btn" onClick={toggleTheme} style={{ width: 36, height: 36 }} aria-label="Ganti tema">
              {d ? <Sun size={15} /> : <Moon size={15} />}
            </button>
<NotificationBell 
  t={t} d={d} 
  isSPM={isSPM || isIOH} 
  activeYear={activeYear} 
  masterData={masterData}             // <--- Tambahkan ini
  disabledMonthsMap={disabledMonthsMap} // <--- Tambahkan ini
/>            <div style={{ position: "relative" }}>
              <button onClick={() => setProfileOpen(!profileOpen)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 10px 0 4px", height: 36, borderRadius: 8, border: `1px solid ${profileOpen ? t.blueBd : t.line}`, background: profileOpen ? t.blueSoft : t.inputBg, cursor: "pointer", transition: "all .12s", outline: "none", fontFamily: "inherit" }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", fontSize: 12, fontWeight: 700, letterSpacing: "-0.02em" }}>
                  {profile?.full_name?.charAt(0) || "U"}
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: t.hi, letterSpacing: "-0.005em", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="lg-hide-text">
                  {profile?.full_name?.split(" ")[0]}
                </span>
                <ChevronDown size={12} style={{ color: t.lo, transform: profileOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }} />
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={{ duration: 0.13 }}
                    style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 232, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, boxShadow: t.shadowLg, zIndex: 200, overflow: "hidden" }}>
                    <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${t.lineSoft}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>
                          {profile?.full_name?.charAt(0) || "U"}
                        </div>
                        <div style={{ overflow: "hidden", minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em", color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.full_name || "Member"}</div>
                          <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.email}</div>
                        </div>
                      </div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, background: profile?.role === "spm_sumatera" ? t.magentaBg : profile?.role === "internal_ioh" ? t.yellowBg : t.greenBg, color: profile?.role === "spm_sumatera" ? t.magenta : profile?.role === "internal_ioh" ? t.yellow : t.green, border: `1px solid ${profile?.role === "spm_sumatera" ? t.magentaBd : profile?.role === "internal_ioh" ? t.yellowBd : t.greenBd}` }}>
                        <Shield size={9} />{profile?.role?.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div style={{ padding: 6 }}>
                      <button className="danger-btn" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>
                        <LogOut size={14} /> Keluar dari Akun
                      </button>
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
            {view === "overview" && (
              <motion.div key="ov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ maxWidth: 980, margin: "0 auto" }}>
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.025em", color: t.hi, marginBottom: 6, lineHeight: 1.15 }}>Daftar Laporan</h1>
                  <p style={{ fontSize: 14, color: t.mid, fontWeight: 400, lineHeight: 1.5 }}>Pilih modul laporan yang ingin Anda kelola.</p>
                  <div style={{ width: 40, height: 3, borderRadius: 2, marginTop: 12, background: "linear-gradient(90deg, #ED1C24, #C6168D)" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", marginBottom: 24, borderRadius: 9, border: `1px solid ${activePartner ? t.blueBd : t.line}`, background: activePartner ? t.blueSoft : t.card }}>
                  <MapPin size={14} style={{ color: activePartner ? t.blue : t.lo, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: activePartner ? t.hi : t.mid, fontWeight: 400, lineHeight: 1.5, minWidth: 0 }}>
                    {activePartner
                      ? <><strong style={{ fontWeight: 600 }}>{activePartner}</strong>{activeBranch && <> &middot; <strong style={{ fontWeight: 600 }}>{activeBranch}</strong></>}</>
                      : "Tentukan filter di sidebar untuk mengaktifkan modul laporan."}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                  <DashCard icon={<PieChart size={20} />} title="Laporan P&L" desc="Analisis pendapatan harian, margin produk, dan pengeluaran operasional partner." tag="Profit & Loss" active={canPnl} onClick={() => navigate("summary")} t={t} d={d}
                    accent={{ color: d ? "#32BCAD" : "#1A9E90", bg: d ? "rgba(50,188,173,0.12)" : "rgba(50,188,173,0.08)", bd: d ? "rgba(50,188,173,0.30)" : "rgba(50,188,173,0.20)", shadow: "rgba(50,188,173,0.20)" }} />
                  {(isSPM || isIOH) && (
                    <DashCard icon={<Layers size={20} />} title="PNL Control Center" desc="Monitoring progres pengisian laporan seluruh branch di wilayah Sumatera." tag="Admin" active={true} onClick={() => navigate("control-center")} t={t} d={d}
                      accent={{ color: "#ED1C24", bg: d ? "rgba(237,28,36,0.10)" : "rgba(237,28,36,0.06)", bd: d ? "rgba(237,28,36,0.26)" : "rgba(237,28,36,0.16)", shadow: "rgba(237,28,36,0.16)" }} />
                  )}
                  {(isSPM || isIOH) && (
                    <DashCard icon={<Table2 size={20} />} title="Pivot P&L Summary" desc="Ringkasan REV, EXP, dan P/L seluruh MPX per bulan dalam format pivot table." tag="Admin" active={true} onClick={() => navigate("pivot-summary")} t={t} d={d}
                      accent={{ color: d ? "#C49A00" : "#9A7400", bg: d ? "rgba(255,203,5,0.11)" : "rgba(255,203,5,0.09)", bd: d ? "rgba(255,203,5,0.28)" : "rgba(255,203,5,0.20)", shadow: "rgba(255,203,5,0.18)" }} />
                  )}
                  <DashCard icon={<Wallet size={20} />} title="Payout Tracker" desc="Monitoring pembayaran Partner & Agency Prepaid — SLA, funnel, heatmap, dan raw data terintegrasi." tag="Admin" active={true} onClick={() => navigate("payout-tracker")} t={t} d={d}
                    accent={{ color: "#C6168D", bg: d ? "rgba(198,22,141,0.11)" : "rgba(198,22,141,0.07)", bd: d ? "rgba(198,22,141,0.28)" : "rgba(198,22,141,0.16)", shadow: "rgba(198,22,141,0.16)" }} />
                </div>
              </motion.div>
            )}

            {view === "control-center" && (
              <motion.div key="cc" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <PNLControlCenter
                  theme={theme}
                  masterData={masterData}
                  activeYear={activeYear}
                  activeMonth={activeMonth}
                  disabledMonthsMap={disabledMonthsMap}
                  userRole={profile?.role} // <--- TAMBAHKAN BARIS INI
                  onOpenBranch={p => {
                    setActivePartner(p.partner_name);
                    setActiveBranch(p.branch_name);
                    setActiveType(p.mpc_mp3);
                    setActiveMonth(p.month);
                    setView("summary");
                  }}
                />
              </motion.div>
            )}

            {view === "pivot-summary" && (
              <motion.div key="ps" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <PNLPivotSummary theme={theme} activeYear={activeYear} />
              </motion.div>
            )}

            {view === "payout-tracker" && (
              <motion.div key="pt" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
                <PayoutTracker theme={theme} profile={profile} partnerName={isMPX ? (profile?.partner_name || null) : (activePartner || null)} filterType={activeType !== "ALL" ? activeType : null} readOnly={isReadOnly} />
              </motion.div>
            )}

            {["summary","pendapatan","pengeluaran"].includes(view) && (
              <motion.div key="fv" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={{ maxWidth: 920, margin: "0 auto" }}>
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 20 }}><ChevronLeft size={15} /> Kembali ke Overview</button>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} />
            <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
              style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 268, maxWidth: "85vw", background: t.sidebar, borderRight: `1px solid ${t.line}`, display: "flex", flexDirection: "column", zIndex: 50 }}>
              <button onClick={() => setMobileOpen(false)} style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 7, border: `1px solid ${t.line}`, background: t.inputBg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.mid, zIndex: 10, outline: "none" }}>
                <X size={14} />
              </button>
              <SidebarInner />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Exit confirm modal */}
      <AnimatePresence>
        {exitConfirm && (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(10,12,18,0.62)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ duration: 0.14 }}
              style={{ maxWidth: 340, width: "100%", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: t.shadowLg, overflow: "hidden" }}>
              <div style={{ padding: 26, textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 11, background: t.redBg, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", color: t.red, border: `1px solid ${t.red}33` }}>
                  <AlertTriangle size={22} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: t.hi, marginBottom: 7 }}>Batalkan Progress?</h3>
                <p style={{ fontSize: 13.5, color: t.mid, lineHeight: 1.55, marginBottom: 22 }}>Data yang belum disimpan akan terhapus dan tidak dapat dipulihkan.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <button onClick={() => { setFormDirty(false); setView(pendingView); setExitConfirm(false); setPendingView(null); }}
                    style={{ width: "100%", padding: 11, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", color: "#FFFFFF", border: "none", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Hapus & Lanjutkan
                  </button>
                  <button onClick={() => { setExitConfirm(false); setPendingView(null); }}
                    style={{ width: "100%", padding: 11, background: "transparent", color: t.mid, border: `1px solid ${t.line}`, borderRadius: 8, fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.hover; e.currentTarget.style.color = t.hi; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.mid; }}>
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