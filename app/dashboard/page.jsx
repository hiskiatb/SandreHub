"use client";

/* ──────────────────────────────────────────────────────────────────────────────
   Dashboard shell — restyled
   - Blue accent kept (#0A84FF), used more sparingly
   - System fonts only (no Geist)
   - Restrained palette: cool-neutral slate base, blue for active states
   - Responsive: works at half-window (sidebar → drawer < 1024px) and mobile
   - Logic, state, effects, and handlers preserved 1:1 from original
────────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState, useMemo } from "react";
import supabase from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight, ArrowDownLeft, LayoutGrid, PieChart, Sun, Moon,
  Menu, X, ChevronLeft, AlertTriangle, MapPin, ChevronDown,
  LogOut, ChevronRight, Calendar, Box, Layers,
  Shield, Globe, Building2, Store, SlidersHorizontal,
  Table2,
} from "lucide-react";

import FormPendapatan   from "./components/PNL_FormPendapatan";
import FormPengeluaran  from "./components/PNL_FormPengeluaran";
import FormSummary      from "./components/PNL_MPX_Summary";
import PNLControlCenter from "./components/PNL_ControlCenter.jsx";
import PNLPivotSummary  from "./components/PNL_PivotSummary";

// ─── Design Tokens — cool slate + blue accent ────────────────────────────────
const tk = (d) => ({
  appBg:     d ? "#0A0C12" : "#F7F8FA",
  sidebar:   d ? "#0E1119" : "#FFFFFF",
  surface:   d ? "#11141C" : "#FFFFFF",
  card:      d ? "#13161F" : "#FFFFFF",
  hover:     d ? "#171B26" : "#F4F6FB",

  line:      d ? "#242937" : "#E4E7EE",
  lineSoft:  d ? "#1C2030" : "#EDEFF4",

  hi:        d ? "#F1F5F9" : "#0F172A",
  mid:       d ? "#94A3B8" : "#64748B",
  lo:        d ? "#64748B" : "#94A3B8",

  blue:      "#0A84FF",
  blueBg:    d ? "#0E223F" : "#E8F1FF",
  blueBd:    d ? "#1B3A6E" : "#BFD9FF",
  blueSoft:  d ? "#122B52" : "#F0F6FF",

  green:     d ? "#34D399" : "#16A34A",
  greenBg:   d ? "#0F2A1F" : "#E8F7EE",
  greenBd:   d ? "#1F4A33" : "#BFE5CC",

  red:       d ? "#F87171" : "#DC2626",
  redBg:     d ? "#2A1414" : "#FEEDEC",

  inputBg:   d ? "#13161F" : "#FFFFFF",
  inputBd:   d ? "#242937" : "#D8DCE5",

  shadowSm:  d ? "0 1px 2px rgba(0,0,0,0.45)"  : "0 1px 2px rgba(15,23,42,0.05)",
  shadowMd:  d ? "0 6px 18px rgba(0,0,0,0.40)" : "0 6px 18px rgba(15,23,42,0.08)",
  shadowLg:  d ? "0 20px 48px rgba(0,0,0,0.55)": "0 20px 48px rgba(15,23,42,0.14)",
});

const FONT_STACK = `-apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", Roboto, system-ui, sans-serif`;

// ─── Global Styles ───────────────────────────────────────────────────────────
const buildGlobalCSS = (d, t) => `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${d ? "#2A3144" : "#D1D6E0"}; border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: ${d ? "#3A4258" : "#B6BDCC"}; }
  select option { background: ${t.card}; color: ${t.hi}; }

  /* Breakpoints:
     - >=1024px : full desktop layout with persistent sidebar
     - 640-1023 : half-window / tablet → sidebar becomes drawer
     - <640     : mobile                                              */
  @media (min-width: 1024px) { .lg-flex { display: flex !important; } }
  @media (max-width: 1023px) {
    .lg-only { display: none !important; }
    .mob-flex { display: flex !important; }
    .lg-hide-text { display: none !important; }
  }
  @media (max-width: 640px) {
    .tab-label { display: none !important; }
    .hide-mobile { display: none !important; }
    .header-pad { padding-left: 16px !important; padding-right: 16px !important; }
    .content-pad { padding: 20px 16px !important; }
  }

  @keyframes brand-beat {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.5; transform: scale(0.92); }
  }

  .snav {
    width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 9px 11px; border-radius: 7px; border: none;
    background: transparent; cursor: pointer;
    font-size: 13.5px; font-weight: 500; letter-spacing: -0.005em;
    color: ${t.mid}; transition: background .12s, color .12s;
    text-align: left; outline: none; font-family: inherit;
  }
  .snav:hover  { background: ${t.hover}; color: ${t.hi}; }
  .snav.active {
    background: ${t.blueBg};
    color: ${t.blue};
    font-weight: 600;
  }
  .snav:disabled { opacity: 0.36; cursor: not-allowed; pointer-events: none; }

  .back-btn {
    display: inline-flex; align-items: center; gap: 5px;
    background: none; border: none; cursor: pointer;
    font-size: 13px; font-weight: 500;
    color: ${t.mid}; transition: color .12s; outline: none; padding: 6px 0;
    font-family: inherit;
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
  .tab-pill.on  {
    background: ${t.blue}; color: #fff; font-weight: 600;
    box-shadow: 0 2px 8px rgba(10,132,255,${d ? 0.32 : 0.18});
  }

  .danger-btn {
    width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 7px; border: none;
    background: transparent; cursor: pointer;
    font-size: 13.5px; font-weight: 500; color: ${t.red};
    transition: background .12s; outline: none; font-family: inherit;
  }
  .danger-btn:hover { background: ${t.redBg}; }

  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid ${t.line}; background: ${t.inputBg};
    border-radius: 8px; cursor: pointer;
    color: ${t.mid};
    transition: border-color .12s, color .12s, background .12s;
    outline: none;
  }
  .icon-btn:hover {
    border-color: ${t.blueBd}; color: ${t.blue}; background: ${t.blueSoft};
  }
`;

// ─── FilterSelect ───────────────────────────────────────────────────────────
function FilterSelect({ label, value, onChange, children, t, d, disabled, icon }) {
  return (
    <div style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        marginBottom: 6, paddingLeft: 2,
      }}>
        <span style={{ color: t.lo, display: "flex" }}>{icon}</span>
        <span style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", color: t.mid,
        }}>{label}</span>
      </div>

      <div style={{
        display: "flex", alignItems: "center",
        border: `1px solid ${t.inputBd}`, borderRadius: 8,
        background: t.inputBg, height: 36, position: "relative",
        transition: "border-color .12s",
      }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            appearance: "none", WebkitAppearance: "none",
            background: "transparent", border: "none",
            fontSize: 13.5, fontWeight: 500, color: t.hi,
            outline: "none", cursor: "pointer",
            paddingLeft: 12, paddingRight: 32,
            fontFamily: "inherit",
          }}
        >{children}</select>
        <div style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          color: t.lo, pointerEvents: "none", display: "flex",
        }}><ChevronDown size={14} /></div>
      </div>
    </div>
  );
}

function SNavItem({ icon, label, active, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`snav${active ? " active" : ""}`}>
      <span style={{ flexShrink: 0, display: "flex", opacity: active ? 1 : 0.7 }}>{icon}</span>
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
        padding: 24,
        borderRadius: 12,
        border: `1px solid ${hov && active ? t.blueBd : t.line}`,
        background: t.card,
        cursor: active ? "pointer" : "not-allowed",
        opacity: active ? 1 : 0.5,
        transition: "border-color .15s, box-shadow .15s, transform .15s",
        boxShadow: hov && active ? t.shadowMd : t.shadowSm,
        transform: hov && active ? "translateY(-1px)" : "translateY(0)",
        display: "flex", flexDirection: "column", gap: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: hov && active ? t.blue : t.blueBg,
          color: hov && active ? "#FFFFFF" : t.blue,
          border: `1px solid ${hov && active ? t.blue : t.blueBd}`,
          transition: "background .15s, color .15s, border-color .15s",
        }}>{icon}</div>
        {tag && (
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", padding: "3px 8px", borderRadius: 4,
            background: t.greenBg, color: t.green, border: `1px solid ${t.greenBd}`,
          }}>{tag}</span>
        )}
      </div>
      <div>
        <h3 style={{
          fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em",
          color: t.hi, marginBottom: 6, lineHeight: 1.3,
        }}>{title}</h3>
        <p style={{ fontSize: 13, color: t.mid, lineHeight: 1.55, fontWeight: 400 }}>{desc}</p>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        fontSize: 11.5, fontWeight: 600, letterSpacing: "0.02em",
        color: active ? t.blue : t.lo,
      }}>
        {active ? "Buka modul" : "Terkunci"}
        <ChevronRight size={13} strokeWidth={2} />
      </div>
    </div>
  );
}

const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

const CURRENT_DATE = new Date();
const CURRENT_MONTH_INDEX = CURRENT_DATE.getMonth();
const CURRENT_YEAR = CURRENT_DATE.getFullYear();

const getCurrentMonth = () => MONTHS[CURRENT_MONTH_INDEX];
const getCurrentYear  = () => CURRENT_YEAR.toString();

// ─── Main Component ─────────────────────────────────────────────────────────
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
  const [activeMonth,   setActiveMonth]   = useState(getCurrentMonth);
  const [activeYear,    setActiveYear]    = useState(getCurrentYear);
  const [formDirty,     setFormDirty]     = useState(false);
  const [exitConfirm,   setExitConfirm]   = useState(false);
  const [pendingView,   setPendingView]   = useState(null);
  const [mobileOpen,    setMobileOpen]    = useState(false);

  const availableYears = useMemo(() => {
    return Array.from(
      { length: CURRENT_YEAR - 2026 + 1 },
      (_, i) => (2026 + i).toString()
    ).reverse();
  }, []);

  const availableMonths = useMemo(() => {
    if (Number(activeYear) === CURRENT_YEAR) {
      return MONTHS.slice(0, CURRENT_MONTH_INDEX + 1);
    }
    return MONTHS;
  }, [activeYear]);

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

      let query = supabase.from("partner_branches").select("*").order("partner_name", { ascending: true });

      if (prof?.role !== "spm_sumatera") {
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
    return [
      ...new Set(
        masterData
          .filter(i =>
            i.partner_name === activePartner &&
            (activeType === "ALL" || i.mpc_mp3 === activeType)
          )
          .map(i => i.branch_name)
      ),
    ];
  }, [masterData, activePartner, activeType]);

  useEffect(() => {
    if (availableTypes.length === 1) {
      setActiveType(availableTypes[0]);
    } else if (activeType !== "ALL" && !availableTypes.includes(activeType)) {
      setActiveType("ALL");
    }
  }, [availableTypes, activePartner]);

  useEffect(() => {
    if (availableBranches.length === 1) {
      setActiveBranch(availableBranches[0]);
    } else if (!availableBranches.includes(activeBranch)) {
      setActiveBranch("");
    }
  }, [availableBranches]);

  useEffect(() => {
    if (!availableMonths.includes(activeMonth)) {
      setActiveMonth(availableMonths[availableMonths.length - 1]);
    }
  }, [activeYear, availableMonths, activeMonth]);

  const isSPM = profile?.role === "spm_sumatera";

  const canPnl = isSPM
    ? (!!activePartner && !!activeBranch)
    : (activePartner === profile?.partner_name && !!activeBranch);

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

  const HEADER_H = 60;

  // ── Sidebar inner ─────────────────────────────────────────────────────────
  const SidebarInner = () => (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", userSelect: "none",
    }}>
      {/* Brand */}
      <div style={{
        height: HEADER_H,
        display: "flex", alignItems: "center",
        padding: "0 20px", flexShrink: 0,
        borderBottom: `1px solid ${t.line}`,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          background: t.blue, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#FFFFFF",
        }}>
          <Box size={15} strokeWidth={2.2} />
        </div>
        <div style={{ marginLeft: 10, display: "flex", alignItems: "center" }}>
          <span style={{
            fontSize: 18, fontWeight: 700, letterSpacing: "-0.025em",
            color: t.hi, lineHeight: 1,
          }}>
            Sandra<span style={{ color: t.blue }}>Hub</span>
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "20px 14px 24px",
        display: "flex", flexDirection: "column", gap: 26,
      }}>

        {/* FILTERS */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 2px", marginBottom: 14,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <SlidersHorizontal size={12} style={{ color: t.lo }} />
              <span style={{
                fontSize: 10.5, fontWeight: 600, letterSpacing: "0.10em",
                textTransform: "uppercase", color: t.mid,
              }}>Filter</span>
            </div>
            <button
              onClick={clearFilters}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "transparent",
                border: `1px solid ${t.line}`,
                cursor: "pointer", fontSize: 10.5, fontWeight: 500,
                color: t.mid, padding: "3px 8px", borderRadius: 5,
                transition: "all .12s", fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.blueBd; e.currentTarget.style.color = t.blue; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = t.line; e.currentTarget.style.color = t.mid; }}
            >
              <X size={10} />Reset
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {isSPM && (
              <FilterSelect
                label="Region"
                icon={<Globe size={12} />}
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
              icon={<Building2 size={12} />}
              value={activePartner}
              onChange={v => { setActivePartner(v); setActiveBranch(""); setActiveType("ALL"); }}
              t={t} d={d}
              disabled={!isSPM}
            >
              <option value="" disabled>Pilih Partner</option>
              {filteredPartners.map(p => <option key={p} value={p}>{p}</option>)}
            </FilterSelect>

            {activePartner && (
              <FilterSelect
                label="Tipe (MPC / MP3)"
                icon={<SlidersHorizontal size={12} />}
                value={activeType}
                onChange={v => { setActiveType(v); setActiveBranch(""); }}
                t={t} d={d}
              >
                <option value="ALL">Semua Tipe</option>
                {availableTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
              </FilterSelect>
            )}

            <FilterSelect
              label="Kantor Cabang"
              icon={<Store size={12} />}
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
            fontSize: 10.5, fontWeight: 600, letterSpacing: "0.10em",
            textTransform: "uppercase", color: t.mid,
            paddingLeft: 2, marginBottom: 8,
          }}>
            Navigasi
          </div>

          <button
            onClick={() => setNavOpen(!navOpen)}
            className="snav"
            style={{ marginBottom: 2 }}
          >
            <span style={{ display: "flex", opacity: 0.7 }}><LayoutGrid size={15} /></span>
            <span style={{ flex: 1 }}>Daftar Laporan</span>
            <span style={{
              display: "flex", opacity: 0.5,
              transform: navOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform .18s",
            }}>
              <ChevronDown size={13} />
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
                  marginLeft: 14, paddingLeft: 10,
                  borderLeft: `1px solid ${t.line}`,
                  paddingTop: 4, paddingBottom: 4,
                  display: "flex", flexDirection: "column", gap: 2,
                }}>
                  {isSPM && (
                    <SNavItem
                      icon={<Layers size={14} />} label="PNL Control Center"
                      active={view === "control-center"}
                      onClick={() => navigate("control-center")}
                    />
                  )}
                  {isSPM && (
                    <SNavItem
                      icon={<Table2 size={14} />} label="Pivot P&L Summary"
                      active={view === "pivot-summary"}
                      onClick={() => navigate("pivot-summary")}
                    />
                  )}
                  <SNavItem
                    icon={<PieChart size={14} />} label="Laporan P&L"
                    active={["summary", "pendapatan", "pengeluaran"].includes(view)}
                    onClick={() => { if (canPnl) navigate("summary"); }}
                    disabled={!canPnl}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  // ─── Loading screen ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{
      width: "100%", height: "100vh",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
      background: "#0A0C12", fontFamily: FONT_STACK,
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12, background: "#0A84FF",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "brand-beat 1.6s ease-in-out infinite",
      }}>
        <Box size={22} color="#FFFFFF" strokeWidth={2.2} />
      </div>
      <span style={{
        fontSize: 11, fontWeight: 600, letterSpacing: "0.14em",
        textTransform: "uppercase", color: "#475569",
      }}>Memuat</span>
      <style>{`@keyframes brand-beat { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.5;transform:scale(.92);} }`}</style>
    </div>
  );

  // ─── Root render ──────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", height: "100vh",
      background: t.appBg, color: t.hi,
      fontFamily: FONT_STACK,
      WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale",
      overflow: "hidden",
      transition: "background .25s, color .25s",
    }}>
      <style>{buildGlobalCSS(d, t)}</style>

      {/* ──────── Desktop sidebar (≥1024px) ──────── */}
      <aside
        className="lg-flex"
        style={{
          display: "none",
          width: 252, flexShrink: 0,
          background: t.sidebar,
          borderRight: `1px solid ${t.line}`,
          flexDirection: "column",
          height: "100vh",
          position: "sticky", top: 0, zIndex: 50,
        }}
      >
        <SidebarInner />
      </aside>

      {/* ──────── Main column ──────── */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        height: "100vh", overflow: "hidden", minWidth: 0,
      }}>

        {/* Header */}
        <header className="header-pad" style={{
          height: HEADER_H, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", gap: 12,
          background: d ? "rgba(14,17,25,0.85)" : "rgba(255,255,255,0.85)",
          borderBottom: `1px solid ${t.line}`,
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          zIndex: 40,
        }}>

          {/* Left: hamburger + period picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <button
              className="mob-flex icon-btn lg-only"
              onClick={() => setMobileOpen(true)}
              style={{ display: "none", width: 36, height: 36 }}
            >
              <Menu size={17} />
            </button>

            {/* Period picker — Month + Year combined */}
            <div style={{
              display: "flex", alignItems: "center",
              border: `1px solid ${t.inputBd}`,
              borderRadius: 8, background: t.inputBg,
              height: 36, overflow: "hidden", flexShrink: 0,
            }}>
              {/* Month */}
              <div style={{
                display: "flex", alignItems: "center",
                borderRight: `1px solid ${t.inputBd}`,
                height: "100%", position: "relative",
              }}>
                <Calendar size={13} style={{ color: t.blue, marginLeft: 11 }} />
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <select
                    value={activeMonth}
                    onChange={e => setActiveMonth(e.target.value)}
                    style={{
                      appearance: "none", WebkitAppearance: "none",
                      background: "transparent", border: "none",
                      fontSize: 13.5, fontWeight: 500, color: t.hi,
                      cursor: "pointer", outline: "none",
                      paddingLeft: 7, paddingRight: 24, height: 36,
                      fontFamily: "inherit",
                    }}
                  >
                    {availableMonths.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} style={{
                    position: "absolute", right: 6, pointerEvents: "none", color: t.lo,
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
                    fontSize: 13.5, fontWeight: 500, color: t.hi,
                    cursor: "pointer", outline: "none",
                    paddingLeft: 12, paddingRight: 28, height: 36,
                    fontFamily: "inherit",
                  }}
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <ChevronDown size={12} style={{
                  position: "absolute", right: 9, pointerEvents: "none", color: t.lo,
                }} />
              </div>
            </div>
          </div>

          {/* Right: theme toggle + profile */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, minWidth: 0 }}>
            <button
              className="icon-btn"
              onClick={toggleTheme}
              style={{ width: 36, height: 36 }}
              aria-label="Ganti tema"
            >
              {d ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <div style={{ position: "relative" }}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "0 10px 0 4px", height: 36, borderRadius: 8,
                  border: `1px solid ${profileOpen ? t.blueBd : t.line}`,
                  background: profileOpen ? t.blueSoft : t.inputBg,
                  cursor: "pointer", transition: "all .12s", outline: "none",
                  fontFamily: "inherit",
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 6, background: t.blue, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#FFFFFF", fontSize: 12, fontWeight: 700, letterSpacing: "-0.02em",
                }}>
                  {profile?.full_name?.charAt(0) || "U"}
                </div>
                <span className="lg-hide-text" style={{
                  fontSize: 13.5, fontWeight: 500,
                  color: t.hi, letterSpacing: "-0.005em",
                  maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {profile?.full_name?.split(" ")[0]}
                </span>
                <ChevronDown size={12} style={{
                  color: t.lo,
                  transform: profileOpen ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform .2s",
                }} />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.13 }}
                    style={{
                      position: "absolute", right: 0, top: "calc(100% + 8px)",
                      width: 232,
                      background: t.surface,
                      border: `1px solid ${t.line}`,
                      borderRadius: 12, boxShadow: t.shadowLg,
                      zIndex: 200, overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${t.lineSoft}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8, background: t.blue, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#FFFFFF", fontSize: 14, fontWeight: 700,
                        }}>
                          {profile?.full_name?.charAt(0) || "U"}
                        </div>
                        <div style={{ overflow: "hidden", minWidth: 0 }}>
                          <div style={{
                            fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em",
                            color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>{profile?.full_name || "Member"}</div>
                          <div style={{
                            fontSize: 11.5, color: t.mid, marginTop: 2,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>{profile?.email}</div>
                        </div>
                      </div>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                        textTransform: "uppercase", padding: "2px 7px", borderRadius: 4,
                        background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}`,
                      }}>
                        <Shield size={9} />
                        {profile?.role?.replace("_", " ")}
                      </span>
                    </div>
                    <div style={{ padding: 6 }}>
                      <button
                        className="danger-btn"
                        onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}
                      >
                        <LogOut size={14} /> Keluar dari Akun
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* ─── Content area ─── */}
        <div className="content-pad" style={{ flex: 1, overflowY: "auto", padding: "28px 28px 48px" }}>
          <AnimatePresence mode="wait">

            {/* OVERVIEW */}
            {view === "overview" && (
              <motion.div
                key="ov"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ maxWidth: 980, margin: "0 auto" }}
              >
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{
                    fontSize: 26, fontWeight: 700, letterSpacing: "-0.025em",
                    color: t.hi, marginBottom: 6, lineHeight: 1.15,
                  }}>
                    Daftar Laporan
                  </h1>
                  <p style={{ fontSize: 14, color: t.mid, fontWeight: 400, lineHeight: 1.5 }}>
                    Pilih modul laporan yang ingin Anda kelola.
                  </p>
                </div>

                {/* Context banner */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 14px", marginBottom: 24, borderRadius: 9,
                  border: `1px solid ${activePartner ? t.blueBd : t.line}`,
                  background: activePartner ? t.blueSoft : t.card,
                }}>
                  <MapPin size={14} style={{ color: activePartner ? t.blue : t.lo, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: activePartner ? t.hi : t.mid, fontWeight: 400, lineHeight: 1.5, minWidth: 0 }}>
                    {activePartner
                      ? <><strong style={{ fontWeight: 600 }}>{activePartner}</strong>{activeBranch && <> &middot; <strong style={{ fontWeight: 600 }}>{activeBranch}</strong></>}</>
                      : "Tentukan filter di sidebar untuk mengaktifkan modul laporan."}
                  </span>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 14,
                }}>
                  <DashCard
                    icon={<PieChart size={20} />} title="Laporan P&L"
                    desc="Analisis pendapatan harian, margin produk, dan pengeluaran operasional partner."
                    tag="Profit & Loss" active={canPnl}
                    onClick={() => navigate("summary")} t={t} d={d}
                  />
                  {isSPM && (
                    <DashCard
                      icon={<Layers size={20} />} title="PNL Control Center"
                      desc="Monitoring progres pengisian laporan seluruh branch di wilayah Sumatera."
                      tag="Admin" active={true}
                      onClick={() => navigate("control-center")} t={t} d={d}
                    />
                  )}
                  {isSPM && (
                    <DashCard
                      icon={<Table2 size={20} />} title="Pivot P&L Summary"
                      desc="Ringkasan REV, EXP, dan P/L seluruh MPX per bulan dalam format pivot table."
                      tag="Admin" active={true}
                      onClick={() => navigate("pivot-summary")} t={t} d={d}
                    />
                  )}
                </div>
              </motion.div>
            )}

            {/* CONTROL CENTER */}
            {view === "control-center" && (
              <motion.div
                key="cc"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}>
                  <ChevronLeft size={15} /> Kembali ke Overview
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

            {/* PIVOT SUMMARY */}
            {view === "pivot-summary" && (
              <motion.div
                key="ps"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 22 }}>
                  <ChevronLeft size={15} /> Kembali ke Overview
                </button>
                <PNLPivotSummary theme={theme} activeYear={activeYear} />
              </motion.div>
            )}

            {/* FORM VIEWS */}
            {["summary", "pendapatan", "pengeluaran"].includes(view) && (
              <motion.div
                key="fv"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ maxWidth: 920, margin: "0 auto" }}
              >
                <button className="back-btn" onClick={() => navigate("overview")} style={{ marginBottom: 20 }}>
                  <ChevronLeft size={15} /> Kembali ke Overview
                </button>

                {/* Tab bar */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
                  <div style={{
                    display: "inline-flex", gap: 2, padding: 4,
                    borderRadius: 10, border: `1px solid ${t.line}`,
                    background: t.card,
                  }}>
                    {[
                      { id: "summary",     label: "Summary",    icon: <LayoutGrid size={14} /> },
                      { id: "pendapatan",  label: "Pendapatan", icon: <ArrowUpRight size={14} /> },
                      { id: "pengeluaran", label: "Pengeluaran",icon: <ArrowDownLeft size={14} /> },
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
                  borderRadius: 12, border: `1px solid ${t.line}`,
                  background: t.surface, boxShadow: t.shadowSm, overflow: "hidden",
                }}>
                  <div style={{ padding: "28px 32px" }}>
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

      {/* ──────── Mobile drawer ──────── */}
      <AnimatePresence>
        {mobileOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              }}
            />
            <motion.aside
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              style={{
                position: "absolute", top: 0, left: 0, bottom: 0,
                width: 268, maxWidth: "85vw",
                background: t.sidebar, borderRight: `1px solid ${t.line}`,
                display: "flex", flexDirection: "column", zIndex: 50,
              }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                style={{
                  position: "absolute", top: 12, right: 12,
                  width: 30, height: 30, borderRadius: 7,
                  border: `1px solid ${t.line}`, background: t.inputBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: t.mid, zIndex: 10, outline: "none",
                }}
              ><X size={14} /></button>
              <SidebarInner />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ──────── Exit confirm modal ──────── */}
      <AnimatePresence>
        {exitConfirm && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 300,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            background: "rgba(10,12,18,0.62)",
            backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
          }}>
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.14 }}
              style={{
                maxWidth: 340, width: "100%",
                background: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: 14, boxShadow: t.shadowLg, overflow: "hidden",
              }}
            >
              <div style={{ padding: 26, textAlign: "center" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 11,
                  background: t.redBg, margin: "0 auto 16px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: t.red, border: `1px solid ${t.red}33`,
                }}>
                  <AlertTriangle size={22} />
                </div>
                <h3 style={{
                  fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em",
                  color: t.hi, marginBottom: 7,
                }}>Batalkan Progress?</h3>
                <p style={{ fontSize: 13.5, color: t.mid, lineHeight: 1.55, marginBottom: 22 }}>
                  Data yang belum disimpan akan terhapus dan tidak dapat dipulihkan.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <button
                    onClick={() => { setFormDirty(false); setView(pendingView); setExitConfirm(false); }}
                    style={{
                      width: "100%", padding: 11, background: t.red, color: "#FFFFFF",
                      border: "none", borderRadius: 8,
                      fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.005em",
                      cursor: "pointer", transition: "opacity .12s", fontFamily: "inherit",
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  >Hapus & Lanjutkan</button>
                  <button
                    onClick={() => setExitConfirm(false)}
                    style={{
                      width: "100%", padding: 11, background: "transparent",
                      color: t.mid, border: `1px solid ${t.line}`,
                      borderRadius: 8, fontSize: 13.5, fontWeight: 500,
                      cursor: "pointer", transition: "all .12s", fontFamily: "inherit",
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
