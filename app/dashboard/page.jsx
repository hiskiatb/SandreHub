"use client";

import { useEffect, useState, useMemo } from "react";
import supabase from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight, ArrowDownLeft, LayoutGrid, PieChart, Sun, Moon,
  Menu, X, ChevronLeft, AlertTriangle, MapPin, ChevronDown,
  LogOut, ChevronRight, Calendar, Box, Layers,
  Shield, Globe, Building2, Store, SlidersHorizontal
} from "lucide-react";

import FormPendapatan   from "./components/PNL_FormPendapatan";
import FormPengeluaran  from "./components/PNL_FormPengeluaran";
import FormSummary      from "./components/PNL_MPX_Summary";
import PNLControlCenter from "./components/PNL_ControlCenter.jsx";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const tk = (d) => ({
  appBg:      d ? "#080A0F"                      : "#F0F0F5",
  sidebar:    d ? "#0C0E14"                      : "#FFFFFF",
  surface:    d ? "#0C0E14"                      : "#FFFFFF",
  card:       d ? "#111520"                      : "#FFFFFF",
  hover:      d ? "rgba(255,255,255,0.05)"       : "rgba(0,0,0,0.04)",

  line:       d ? "rgba(255,255,255,0.08)"       : "rgba(0,0,0,0.09)",

  hi:         d ? "#F0F0F5"                      : "#18181B",
  mid:        d ? "#8A8A90"                      : "#636368",
  lo:         d ? "#AAB0C0"                      : "#4B5563",

  blue:       "#0A84FF",
  blueBg:     d ? "rgba(10,132,255,0.13)"        : "rgba(10,132,255,0.09)",
  blueBd:     d ? "rgba(10,132,255,0.32)"        : "rgba(10,132,255,0.22)",

  green:      d ? "#30D158"                      : "#25A244",
  greenBg:    d ? "rgba(48,209,88,0.11)"         : "rgba(37,162,68,0.09)",
  greenBd:    d ? "rgba(48,209,88,0.24)"         : "rgba(37,162,68,0.20)",

  red:        d ? "#FF453A"                      : "#FF3B30",
  redBg:      d ? "rgba(255,69,58,0.11)"         : "rgba(255,59,48,0.08)",

  inputBg:    d ? "rgba(255,255,255,0.055)"      : "#FFFFFF",
  inputBd:    d ? "rgba(255,255,255,0.11)"       : "rgba(0,0,0,0.13)",

  shadowSm:   d ? "0 1px 3px rgba(0,0,0,0.55)"  : "0 1px 3px rgba(0,0,0,0.07)",
  shadowMd:   d ? "0 8px 24px rgba(0,0,0,0.55)" : "0 8px 24px rgba(0,0,0,0.10)",
  shadowLg:   d ? "0 24px 64px rgba(0,0,0,0.72)": "0 24px 64px rgba(0,0,0,0.16)",
});

// ─── Global Styles ────────────────────────────────────────────────────────────
const buildGlobalCSS = (d, t) => `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${d ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.13)"}; border-radius: 99px; }
  select option { background: ${d ? "#111520" : "#fff"}; color: ${d ? "#F0F0F5" : "#18181B"}; }

  @media (min-width: 1024px) { .lg-flex { display: flex !important; } }
  @media (max-width: 1023px) { .lg-only { display: none !important; } .mob-flex { display: flex !important; } }
  @media (max-width: 540px)  { .tab-label { display: none !important; } }

  @keyframes spin-breathe {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.4; transform: scale(0.92); }
  }

  /* ─ Sidebar nav item ─ */
  .snav {
    width: 100%; display: flex; align-items: center; gap: 11px;
    padding: 10px 12px; border-radius: 8px; border: none;
    background: transparent; cursor: pointer;
    font-size: 14px; font-weight: 600; letter-spacing: -0.015em;
    color: ${t.mid}; transition: background 0.13s, color 0.13s;
    text-align: left; outline: none;
  }
  .snav:hover  { background: ${t.hover}; color: ${t.hi}; }
  .snav.active { background: ${t.blueBg}; color: ${t.blue}; }
  .snav:disabled { opacity: 0.32; cursor: not-allowed; pointer-events: none; }

  /* ─ Back button ─ */
  .back-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: none; border: none; cursor: pointer;
    font-size: 14px; font-weight: 600; letter-spacing: -0.015em;
    color: ${t.mid}; transition: color 0.13s; outline: none; padding: 0;
  }
  .back-btn:hover { color: ${t.blue}; }

  /* ─ Tab pill ─ */
  .tab-pill {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 20px; border-radius: 8px; border: none;
    font-size: 14px; font-weight: 600; cursor: pointer;
    transition: all 0.15s; white-space: nowrap; outline: none;
    letter-spacing: -0.015em;
  }
  .tab-pill.off { background: transparent; color: ${t.mid}; }
  .tab-pill.off:hover { background: ${t.hover}; color: ${t.hi}; }
  .tab-pill.on  {
    background: ${t.blue}; color: #fff;
    box-shadow: 0 2px 10px rgba(10,132,255,${d ? 0.4 : 0.22});
  }

  /* ─ Danger btn ─ */
  .danger-btn {
    width: 100%; display: flex; align-items: center; gap: 11px;
    padding: 11px 14px; border-radius: 8px; border: none;
    background: transparent; cursor: pointer;
    font-size: 14px; font-weight: 600; color: ${t.red};
    transition: background 0.13s; outline: none;
  }
  .danger-btn:hover { background: ${t.redBg}; }

  /* ─ Icon btn ─ */
  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    border: 1px solid ${t.line}; background: ${t.inputBg};
    border-radius: 9px; cursor: pointer;
    transition: border-color 0.13s, color 0.13s; outline: none;
  }
  .icon-btn:hover { border-color: ${t.blueBd}; color: ${t.blue}; }
`;



// FilterSelect: label OUTSIDE the box (above), icon + select inside, chevron at far right
// The select fills the entire clickable area so it works natively
function FilterSelect({ label, value, onChange, children, t, d, disabled, icon }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ opacity: disabled ? 0.36 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      {/* Label above */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        marginBottom: 7, paddingLeft: 2,
      }}>
        <span style={{ color: t.mid, display: "flex", alignItems: "center" }}>{icon}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: t.mid,
        }}>{label}</span>
      </div>

      {/* Input row */}
<div style={{
  display: "flex",
  alignItems: "center",
  border: `1px solid ${t.line}`,
  borderRadius: 9,
  background: t.inputBg,
  height: 38,
  overflow: "hidden",
  maxWidth: "100%",   
  flexShrink: 1,
  position: "relative",
}}>
        {/* Native select fills entire box — clickable everywhere */}
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            appearance: "none", WebkitAppearance: "none",
            background: "transparent", border: "none",
            fontSize: 14, fontWeight: 600, color: t.hi,
            outline: "none", cursor: "pointer",
            paddingLeft: 14, paddingRight: 40,
            zIndex: 1,
          }}
        >
          {children}
        </select>

        {/* Chevron — decorative, pointer-events none so select still gets clicks */}
        <div style={{
          position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
          color: t.lo, pointerEvents: "none", display: "flex", zIndex: 2,
        }}>
          <ChevronDown size={15} />
        </div>
      </div>
    </div>
  );
}

function SNavItem({ icon, label, active, onClick, t, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`snav${active ? " active" : ""}`}
    >
      <span style={{ flexShrink: 0, display: "flex", opacity: active ? 1 : 0.65 }}>
        {icon}
      </span>
      <span style={{ flex: 1, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </button>
  );
}

function DashCard({ icon, title, desc, tag, active, onClick, t, d }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={active ? onClick : undefined}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "32px 28px 28px",
        borderRadius: 14,
        border: `1px solid ${hov && active ? t.blueBd : t.line}`,
        background: t.card,
        cursor: active ? "pointer" : "not-allowed",
        opacity: active ? 1 : 0.4,
        filter: active ? "none" : "grayscale(0.5)",
        transition: "border-color 0.18s, box-shadow 0.18s",
        boxShadow: hov && active ? t.shadowMd : t.shadowSm,
        display: "flex", flexDirection: "column", gap: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{
          width: 50, height: 50, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: hov && active ? t.blue : t.blueBg,
          color: hov && active ? "#fff" : t.blue,
          transition: "all 0.18s",
        }}>{icon}</div>
        {tag && (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase", padding: "4px 9px", borderRadius: 5,
            background: t.greenBg, color: t.green, border: `1px solid ${t.greenBd}`,
          }}>{tag}</span>
        )}
      </div>
      <div>
        <h3 style={{
          fontSize: 17, fontWeight: 700, letterSpacing: "-0.025em",
          color: t.hi, marginBottom: 8, lineHeight: 1.25,
        }}>{title}</h3>
        <p style={{ fontSize: 14, color: t.mid, lineHeight: 1.7, fontWeight: 400 }}>{desc}</p>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase", color: active ? t.blue : t.lo,
      }}>
        {active ? "Buka Modul" : "Terkunci"}<ChevronRight size={14} />
      </div>
    </div>
  );
}

 const MONTHS = [
    "Januari","Februari","Maret","April","Mei","Juni",
    "Juli","Agustus","September","Oktober","November","Desember",
  ];

const getCurrentMonth = () => MONTHS[new Date().getMonth()];
const getCurrentYear = () => new Date().getFullYear().toString();

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();

  const [loading,       setLoading]       = useState(true);
  const [profile,       setProfile]       = useState(null);
  const [view,          setView]          = useState("overview");
  const [theme,         setTheme]         = useState("dark");
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [navOpen,       setNavOpen]       = useState(true);
  const [masterData,    setMasterData]    = useState([]);
  const [regions,       setRegions]       = useState([]);
  const [activeRegion,  setActiveRegion]  = useState("SUMATERA");
  const [activePartner, setActivePartner] = useState("");
  const [activeType,    setActiveType]    = useState("ALL");
  const [activeBranch,  setActiveBranch]  = useState("");
const [activeMonth, setActiveMonth] = useState(getCurrentMonth);
const [activeYear, setActiveYear] = useState(getCurrentYear);
  const [formDirty,     setFormDirty]     = useState(false);
  const [exitConfirm,   setExitConfirm]   = useState(false);
  const [pendingView,   setPendingView]   = useState(null);
  const [mobileOpen,    setMobileOpen]    = useState(false);

  const d = theme === "dark";
  const t = tk(d);

 

  const toggleTheme = () => {
    const next = d ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("sh-theme", next);
  };

  useEffect(() => {
  setTheme(localStorage.getItem("sh-theme") || "dark");
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push("/login");

    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    
    // PERBAIKAN DI SINI: Filter data berdasarkan role
    let query = supabase.from("partner_branches").select("*").order("partner_name", { ascending: true });
    
    if (prof?.role !== "spm_sumatera") {
      // Jika bukan admin, hanya ambil data partner yang sesuai dengan profilnya
      query = query.eq("partner_name", prof?.partner_name);
    }

    const { data: mapData } = await query;
    
    setProfile(prof);
    setMasterData(mapData || []);
    setRegions([...new Set(mapData?.map(i => i.region))].sort());
    
    if (prof?.role !== "spm_sumatera") setActivePartner(prof?.partner_name || "");
    setLoading(false);
  })();
}, [router]);

  // ── Derived data ─────────────────────────────────────────────────────────
useEffect(() => {
  if (!activePartner) return;

  const partnerData = masterData.find(
    i => i.partner_name === activePartner
  );

  if (partnerData?.region) {
    setActiveRegion(partnerData.region);
  }
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

  return [
    ...new Set(
      masterData
        .filter(i =>
          i.partner_name === activePartner &&
          // Logika filter: Jika 'ALL' tampilkan semua, jika tidak tampilkan sesuai pilihan
          (activeType === "ALL" || i.mpc_mp3 === activeType)
        )
        .map(i => i.branch_name)
    )
  ];
}, [masterData, activePartner, activeType]);


useEffect(() => {
  if (availableTypes.length === 1) {
    setActiveType(availableTypes[0]);
  }
  // Jika tipe yang dipilih sebelumnya tiba-tiba tidak ada di partner baru
  else if (activeType !== "ALL" && !availableTypes.includes(activeType)) {
    setActiveType("ALL");
  }
}, [availableTypes, activePartner]);
// Auto-select branch jika hanya ada 1
useEffect(() => {
  if (availableBranches.length === 1) {
    setActiveBranch(availableBranches[0]);
  } else if (!availableBranches.includes(activeBranch)) {
    setActiveBranch("");
  }
}, [availableBranches]);

  const isSPM   = profile?.role === "spm_sumatera";
  
  const canPnl = isSPM 
  ? (!!activePartner && !!activeBranch) // Admin bebas pilih
  : (activePartner === profile?.partner_name && !!activeBranch); // Partner harus cocok dengan profil

const mpxType = activeType !== "ALL" 
  ? activeType 
  : masterData.find(i => i.partner_name === activePartner && i.branch_name === activeBranch)?.mpc_mp3;

  const clearFilters = () => {
    setActiveRegion("SUMATERA");
    if (isSPM) { setActivePartner(""); setActiveBranch(""); setActiveType("ALL"); }
  };

  const navigate = (viewId) => {
    if (formDirty) { setPendingView(viewId); setExitConfirm(true); }
    else { setView(viewId); setMobileOpen(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SIDEBAR
  // Height: 100vh. Header zone = exactly HEADER_H px.
  // We use paddingTop on the brand zone to align its bottom border with header.
  // ─────────────────────────────────────────────────────────────────────────
  const HEADER_H = 66; // px — single source of truth

  const SidebarInner = () => (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", userSelect: "none",
    }}>

      {/* ── Brand zone — same height as header ── */}
<div style={{
  height: HEADER_H,
  display: "flex",
  alignItems: "center",
  paddingLeft: 24,
  paddingRight: 24,
  flexShrink: 0,
  borderBottom: `1px solid ${t.line}`, // ⬅️ ini kunci alignment
}}>
        {/* Logo box */}
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: t.blue, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff",
          boxShadow: `0 0 0 4px ${t.blueBg}`,
        }}>
          <Box size={17} strokeWidth={2.2} />
        </div>

{/* Text */}
<div style={{
  marginLeft: 12,
  display: "flex",
  alignItems: "center",
}}>
  <span style={{
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: "-0.04em",
    color: t.hi,
    lineHeight: 1,
  }}>
    Sandra<span style={{ color: t.blue }}>Hub</span>
  </span>
</div>
      </div>

      {/* ── This hairline aligns with the header bottom border ── */}

      {/* ── Scrollable body ── */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "28px 16px",
        display: "flex", flexDirection: "column", gap: 36,
      }}>

        {/* FILTERS */}
        <div>
          {/* Section header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingLeft: 2, paddingRight: 2, marginBottom: 18,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <SlidersHorizontal size={13} style={{ color: t.mid }} />
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
                textTransform: "uppercase", color: t.mid,
              }}>Filter</span>
            </div>
            <button
              onClick={clearFilters}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "none",
                border: `1px solid ${t.line}`,
                cursor: "pointer", fontSize: 11, fontWeight: 600,
                color: t.mid, padding: "4px 10px", borderRadius: 6,
                letterSpacing: "0.02em", transition: "all .13s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.blueBd; e.currentTarget.style.color = t.blue; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = t.line; e.currentTarget.style.color = t.mid; }}
            >
              <X size={11} />Reset
            </button>
          </div>

          {/* Filter rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {isSPM && (
              <FilterSelect
                label="Region"
                icon={<Globe size={13} />}
                value={activeRegion}
                onChange={v => { setActiveRegion(v); setActivePartner(""); setActiveBranch(""); }}
                t={t} d={d}
              >
                <option value="SUMATERA">Seluruh Sumatera</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </FilterSelect>
            )}

            <FilterSelect
              label="Nama Partner"
              icon={<Building2 size={13} />}
              value={activePartner}
              onChange={v => { setActivePartner(v); setActiveBranch(""); setActiveType("ALL"); }}
              t={t} d={d}
              disabled={!isSPM}
            >
              <option value="" disabled>Pilih Partner</option>
              {filteredPartners.map(p => <option key={p} value={p}>{p}</option>)}
            </FilterSelect>

            {activePartner && ( // Hapus isSPM agar semua role bisa melihat filter ini
  <FilterSelect
    label="Tipe (MPC / MP3)"
    icon={<SlidersHorizontal size={13} />}
    value={activeType}
    onChange={v => { setActiveType(v); setActiveBranch(""); }} // Reset cabang jika tipe ganti
    t={t} d={d}
  >
    <option value="ALL">Semua Tipe</option>
    {availableTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
  </FilterSelect>
)}

            <FilterSelect
              label="Kantor Cabang"
              icon={<Store size={13} />}
              value={activeBranch}
              onChange={v => setActiveBranch(v)}
              t={t} d={d}
              disabled={!activePartner}
            >
              <option value="" disabled>Pilih Cabang</option>
              {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
            </FilterSelect>
          </div>
        </div>

        {/* NAVIGATION */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
            textTransform: "uppercase", color: t.mid,
            paddingLeft: 2, marginBottom: 10,
          }}>
            Navigasi
          </div>

          {/* Parent toggle */}
          <button
            onClick={() => setNavOpen(!navOpen)}
            className="snav"
            style={{ marginBottom: 3 }}
          >
            <span style={{ display: "flex", opacity: 0.6 }}><LayoutGrid size={16} /></span>
            <span style={{ flex: 1 }}>Daftar Laporan</span>
            <span style={{
              display: "flex", opacity: 0.4,
              transform: navOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.18s",
            }}>
              <ChevronDown size={14} />
            </span>
          </button>

          <AnimatePresence>
            {navOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.17 }}
                style={{ overflow: "hidden" }}
              >
                <div style={{
                  marginLeft: 16, paddingLeft: 12,
                  borderLeft: `1px solid ${t.line}`,
                  paddingTop: 4, paddingBottom: 4,
                  display: "flex", flexDirection: "column", gap: 3,
                }}>
                  {isSPM && (
                    <SNavItem
                      icon={<Layers size={15} />} label="PNL Control Center"
                      active={view === "control-center"}
                      onClick={() => navigate("control-center")} t={t}
                    />
                  )}
                  <SNavItem
                    icon={<PieChart size={15} />} label="Laporan P&L"
                    active={["summary", "pendapatan", "pengeluaran"].includes(view)}
                    onClick={() => { if (canPnl) navigate("summary"); }}
                    disabled={!canPnl} t={t}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{
      width: "100%", height: "100vh",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18,
      background: "#080A0F",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, background: "#0A84FF",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "spin-breathe 1.8s ease-in-out infinite",
      }}>
        <Box size={26} color="#fff" strokeWidth={2} />
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
        textTransform: "uppercase", color: "#38383E",
      }}>Memuat</span>
      <style>{`@keyframes spin-breathe { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.38;transform:scale(.9);} }`}</style>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ROOT RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", height: "100vh",
      background: t.appBg, color: t.hi,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
      WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale",
      overflow: "hidden",
      transition: "background 0.3s, color 0.3s",
    }}>
      <style>{buildGlobalCSS(d, t)}</style>

      {/* ════════════════════ DESKTOP SIDEBAR ════════════════════ */}
      <aside
        className="lg-flex"
        style={{
          display: "none",
          width: 272, flexShrink: 0,
          background: t.sidebar,
          borderRight: `1px solid ${t.line}`,
          flexDirection: "column",
          height: "100vh",
          position: "sticky", top: 0, zIndex: 50,
        }}
      >
        <SidebarInner />
      </aside>

      {/* ════════════════════ MAIN COLUMN ════════════════════ */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        height: "100vh", overflow: "hidden", minWidth: 0,
      }}>

        {/* ── HEADER ── exact height = HEADER_H ── */}
        <header style={{
          height: HEADER_H,
          flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingLeft: 28, paddingRight: 28, gap: 12, 
          background: d ? "rgba(12,14,20,0.9)" : "rgba(255,255,255,0.9)",
          borderBottom: `1px solid ${t.line}`,
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          zIndex: 40,
        }}>

          {/* Left: hamburger + period picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

            {/* Hamburger (mobile only) */}
            <button
              className="mob-flex icon-btn lg-only"
              onClick={() => setMobileOpen(true)}
              style={{ display: "none", width: 38, height: 38, color: t.mid }}
            >
              <Menu size={19} />
            </button>

            {/* Period picker — two selects in one pill */}
            <div style={{
              display: "flex", alignItems: "center",
              border: `1px solid ${t.line}`,
              borderRadius: 9, background: t.inputBg,
              height: 38, overflow: "hidden",
            }}>
              {/* Month */}
              <div style={{
                display: "flex", alignItems: "center", gap: 0,
                borderRight: `1px solid ${t.line}`,
                height: "100%", position: "relative",
              }}>
                <Calendar size={14} style={{ color: t.blue, flexShrink: 0, marginLeft: 13 }} />
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <select
                    value={activeMonth}
                    onChange={e => setActiveMonth(e.target.value)}
                    style={{
                      appearance: "none", WebkitAppearance: "none",
                      background: "transparent", border: "none",
                      fontSize: 14, fontWeight: 600, color: t.hi,
                      cursor: "pointer", outline: "none",
                      paddingLeft: 8, paddingRight: 28, height: 38,
                    }}
                  >
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={13} style={{
                    position: "absolute", right: 8, pointerEvents: "none", color: t.lo,
                  }} />
                </div>
              </div>

              {/* Year */}
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <select
                  value={activeYear}
                  onChange={e => setActiveYear(e.target.value)}
                  style={{
                    appearance: "none", WebkitAppearance: "none",
                    background: "transparent", border: "none",
                    fontSize: 14, fontWeight: 600, color: t.hi,
                    cursor: "pointer", outline: "none",
                    paddingLeft: 14, paddingRight: 32, height: 38,
                  }}
                >
                  <option value="2026">2026</option>
                </select>
                <ChevronDown size={13} style={{
                  position: "absolute", right: 10, pointerEvents: "none", color: t.lo,
                }} />
              </div>
            </div>
          </div>

          {/* Right: theme toggle + profile */}
<div style={{
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexShrink: 0,
  minWidth: 0,
}}>
            {/* Theme */}
            <button
              className="icon-btn"
              onClick={toggleTheme}
              style={{ width: 38, height: 38, color: t.mid }}
            >
              {d ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Profile button */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "0 12px 0 5px",
                  height: 38, borderRadius: 9,
                  border: `1px solid ${profileOpen ? t.blueBd : t.line}`,
                  background: profileOpen ? t.blueBg : t.inputBg,
                  cursor: "pointer", transition: "all 0.13s", outline: "none",
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 28, height: 28, borderRadius: 7, background: t.blue, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 12, fontWeight: 800, letterSpacing: "-0.02em",
                }}>
                  {profile?.full_name?.charAt(0) || "U"}
                </div>
                <span className="lg-flex" style={{
                  display: "none", fontSize: 14, fontWeight: 600,
                  color: t.hi, letterSpacing: "-0.015em",
                }}>
                  {profile?.full_name?.split(" ")[0]}
                </span>
                <ChevronDown size={13} style={{
                  color: t.lo,
                  transform: profileOpen ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 0.2s",
                }} />
              </button>

              {/* Profile dropdown */}
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 7, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 7, scale: 0.97 }}
                    transition={{ duration: 0.13 }}
                    style={{
                      position: "absolute", right: 0, top: "calc(100% + 9px)",
                      width: 240,
                      background: t.surface,
                      border: `1px solid ${t.line}`,
                      borderRadius: 14,
                      boxShadow: t.shadowLg,
                      zIndex: 200, overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: "18px 18px 14px", borderBottom: `1px solid ${t.line}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, background: t.blue, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: 16, fontWeight: 800,
                        }}>
                          {profile?.full_name?.charAt(0) || "U"}
                        </div>
                        <div style={{ overflow: "hidden" }}>
                          <div style={{
                            fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em",
                            color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>{profile?.full_name || "Member"}</div>
                          <div style={{
                            fontSize: 12, color: t.mid, marginTop: 2,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>{profile?.email}</div>
                        </div>
                      </div>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                        textTransform: "uppercase", padding: "3px 9px", borderRadius: 5,
                        background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}`,
                      }}>
                        <Shield size={9} />
                        {profile?.role?.replace("_", " ")}
                      </span>
                    </div>
                    <div style={{ padding: 7 }}>
                      <button
                        className="danger-btn"
                        onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}
                      >
                        <LogOut size={15} /> Keluar dari Akun
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* ── CONTENT AREA ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "36px 32px" }}>
          <AnimatePresence mode="wait">

            {/* OVERVIEW */}
            {view === "overview" && (
              <motion.div
                key="ov"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ maxWidth: 880, margin: "0 auto" }}
              >
                <div style={{ marginBottom: 28 }}>
                  <h1 style={{
                    fontSize: 32, fontWeight: 800, letterSpacing: "-0.04em",
                    color: t.hi, marginBottom: 7, lineHeight: 1.15,
                  }}>
                    Daftar Laporan
                  </h1>
                  <p style={{ fontSize: 15, color: t.mid, fontWeight: 400 }}>
                    Pilih modul laporan yang ingin Anda kelola.
                  </p>
                </div>

                {/* Context banner */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 11,
                  padding: "13px 16px", marginBottom: 28, borderRadius: 10,
                  border: `1px solid ${activePartner ? t.blueBd : t.line}`,
                  background: activePartner ? t.blueBg : (d ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)"),
                }}>
                  <MapPin size={15} style={{ color: activePartner ? t.blue : t.lo, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: activePartner ? t.hi : t.mid, fontWeight: 500 }}>
                    {activePartner
                      ? <><strong style={{ fontWeight: 700 }}>{activePartner}</strong>{activeBranch && <> &middot; <strong style={{ fontWeight: 700 }}>{activeBranch}</strong></>}</>
                      : "Tentukan filter di sidebar untuk mengaktifkan modul laporan."}
                  </span>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: 16,
                }}>
                  <DashCard
                    icon={<PieChart size={23} />} title="Laporan P&L"
                    desc="Analisis pendapatan harian, margin produk, dan pengeluaran operasional partner."
                    tag="Profit & Loss" active={canPnl}
                    onClick={() => navigate("summary")} t={t} d={d}
                  />
                  {isSPM && (
                    <DashCard
                      icon={<Layers size={23} />} title="PNL Control Center"
                      desc="Monitoring progres pengisian laporan seluruh branch di wilayah Sumatera."
                      tag="Admin" active={true}
                      onClick={() => navigate("control-center")} t={t} d={d}
                    />
                  )}
                </div>
              </motion.div>
            )}

            {/* CONTROL CENTER */}
            {view === "control-center" && (
              <motion.div
                key="cc"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 28 }}>
                  <ChevronLeft size={16} /> Kembali ke Overview
                </button>
                <PNLControlCenter
                  theme={theme} masterData={masterData}
                  activeYear={activeYear} activeMonth={activeMonth}
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

            {/* FORM VIEWS */}
            {["summary", "pendapatan", "pengeluaran"].includes(view) && (
              <motion.div
                key="fv"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ maxWidth: 960, margin: "0 auto" }}
              >
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 24 }}>
                  <ChevronLeft size={16} /> Kembali ke Overview
                </button>

                {/* Tab bar */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
                  <div style={{
                    display: "flex", gap: 4, padding: 5,
                    borderRadius: 12, border: `1px solid ${t.line}`,
                    background: d ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)",
                  }}>
                    {[
                      { id: "summary",     label: "Summary",    icon: <LayoutGrid size={15} /> },
                      { id: "pendapatan",  label: "Pendapatan", icon: <ArrowUpRight size={15} /> },
                      { id: "pengeluaran", label: "Pengeluaran",icon: <ArrowDownLeft size={15} /> },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setView(tab.id)}
                        className={`tab-pill ${view === tab.id ? "on" : "off"}`}
                      >
                        {tab.icon}
                        <span className="tab-label">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Form container */}
                <div style={{
                  borderRadius: 14, border: `1px solid ${t.line}`,
                  background: t.surface, boxShadow: t.shadowSm, overflow: "hidden",
                }}>
                  <div style={{ padding: "36px 40px" }}>
                    <AnimatePresence mode="wait">
                      {view === "summary" && (
                        <motion.div key="sv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}>
                          <FormSummary theme={theme} activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }} />
                        </motion.div>
                      )}
                      {view === "pendapatan" && (
                        <motion.div key="pv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}>
                          <FormPendapatan theme={theme} setIsFormDirty={setFormDirty}
                            activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }} />
                        </motion.div>
                      )}
                      {view === "pengeluaran" && (
                        <motion.div key="ev" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.13 }}>
                          <FormPengeluaran theme={theme} setIsFormDirty={setFormDirty}
                            activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }} />
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

      {/* ════════════════════ MOBILE OVERLAY ════════════════════ */}
      <AnimatePresence>
        {mobileOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.72)",
                backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
              }}
            />
            <motion.aside
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              style={{
                position: "absolute", top: 0, left: 0, bottom: 0, width: 284,
                background: t.sidebar, borderRight: `1px solid ${t.line}`,
                display: "flex", flexDirection: "column", zIndex: 50,
              }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                style={{
                  position: "absolute", top: 14, right: 14,
                  width: 32, height: 32, borderRadius: 8,
                  border: `1px solid ${t.line}`, background: t.inputBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: t.mid, zIndex: 10, outline: "none",
                }}
              ><X size={15} /></button>
              <SidebarInner />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ════════════════════ EXIT CONFIRM MODAL ════════════════════ */}
      <AnimatePresence>
        {exitConfirm && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 300,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
            background: "rgba(0,0,0,0.82)",
            backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
          }}>
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                maxWidth: 360, width: "100%",
                background: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: 16, boxShadow: t.shadowLg, overflow: "hidden",
              }}
            >
              <div style={{ padding: 32, textAlign: "center" }}>
                <div style={{
                  width: 54, height: 54, borderRadius: 12,
                  background: t.redBg, margin: "0 auto 20px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: t.red,
                }}>
                  <AlertTriangle size={24} />
                </div>
                <h3 style={{
                  fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em",
                  color: t.hi, marginBottom: 9,
                }}>Batalkan Progress?</h3>
                <p style={{ fontSize: 14, color: t.mid, lineHeight: 1.7, marginBottom: 26 }}>
                  Data yang belum disimpan akan terhapus dan tidak dapat dipulihkan.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    onClick={() => { setFormDirty(false); setView(pendingView); setExitConfirm(false); }}
                    style={{
                      width: "100%", padding: 13, background: t.red, color: "#fff",
                      border: "none", borderRadius: 9,
                      fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
                      cursor: "pointer", transition: "opacity 0.13s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.82"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  >Hapus & Lanjutkan</button>
                  <button
                    onClick={() => setExitConfirm(false)}
                    style={{
                      width: "100%", padding: 13, background: "transparent",
                      color: t.mid, border: `1px solid ${t.line}`,
                      borderRadius: 9, fontSize: 14, fontWeight: 600,
                      letterSpacing: "-0.01em", cursor: "pointer", transition: "all 0.13s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.hover; e.currentTarget.style.color = t.hi; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.mid; }}
                  >Kembali ke Form</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}