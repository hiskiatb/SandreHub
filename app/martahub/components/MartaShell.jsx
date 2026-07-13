"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { guardMarta } from "../../../lib/martaAccess";
import { HubLogo } from "../../../components/HubLogo";
import { HubLogoLoader } from "../../../components/HubLogoLoader";
import { supabase } from "../../../lib/supabase";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const HEADER_H = 60; // tinggi header sidebar & topbar SAMA agar garis bawah sejajar
const ACCENT = "linear-gradient(90deg, #ED1C24 0%, #C6168D 100%)"; // aksen atas MartaHub

// Palet MartaHub (light) — identik dengan Dashboard (page.jsx).
export const T = {
  appBg: "#F0F4FA", sidebar: "#FFFFFF", surface: "#FFFFFF", card: "#FFFFFF", hover: "#F0F4FA",
  line: "#E3E8F0", hi: "#0D1117", mid: "#4A5568", lo: "#7B8BAD",
  primary: "#ED1C24", primaryD: "#C6168D", primaryBg: "#FCEAEE", primaryBd: "#F3C6D6",
  blue: "#1565C0", blueBg: "#E7F0FB", success: "#2E7D32", successBg: "#E8F5E9",
  warning: "#F57F17", warningBg: "#FFFDE7", error: "#C62828", errorBg: "#FFEBEE",
  im3: "#E53935", tri: "#E23B86",
};

// Nav MartaHub — SATU sumber, dipakai Dashboard maupun semua sub-menu.
const NAV = [
  { label: "Dashboard", icon: "grid", path: "dashboard", route: "/martahub" },
  { section: "ACTIVITY" },
  { label: "Activity Plan", icon: "calendar", path: "activities", route: "/martahub/activities" },
  { label: "Activity Submission", icon: "send", path: "submission", route: "/martahub/submission" },
  { label: "Activity Monitoring", icon: "monitor", path: "monitoring", route: "/martahub" },
  { label: "Calendar", icon: "cal", path: "calendar", route: "/martahub" },
  { section: "INTELLIGENCE" },
  { label: "Map Intelligence", icon: "map", path: "map", route: "/martahub/map" },
  { label: "Productivity Analytics", icon: "chart", path: "analytics", route: "/martahub" },
  { label: "Performance Insight", icon: "insight", path: "insight", route: "/martahub" },
  { label: "Leaderboard", icon: "trophy", path: "leaderboard", route: "/martahub/leaderboard" },
  { section: "MANAGEMENT" },
  { label: "Approval Center", icon: "check", path: "approval", route: "/martahub/approval", badge: 12 },
  { label: "User Management", icon: "users", path: "assignments", route: "/martahub/assignments" },
  { label: "Master Data", icon: "db", path: "master", route: "/martahub/master" },
  { label: "System Settings", icon: "settings", path: "settings", route: "/martahub" },
];

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
    logout:   <svg style={s} viewBox="0 0 24 24" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    menu:     <svg style={s} viewBox="0 0 24 24" {...p}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    close:      <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    panelClose: <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><path d="M16 15l-3-3 3-3"/></svg>,
    panelOpen:  <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><path d="M14 9l3 3-3 3"/></svg>,
  };
  return icons[name] || null;
}

/**
 * Shell konsisten untuk semua sub-menu MartaHub web — sidebar identik dengan Dashboard.
 * Pakai: <MartaShell active="assignments" title="Assignments">{(ctx)=> ...}</MartaShell>
 * ctx = { profile, canManage, session }.
 */
export default function MartaShell({ active, title, subtitle, actions, children }) {
  const router = useRouter();
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    guardMarta(router, typeof window !== "undefined" ? window.location.pathname : "/martahub").then((res) => {
      if (!res.ok) return;
      setCtx({ profile: res.profile, canManage: res.canManage, session: res.session });
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const m = w < 768;
      setMobile(m);
      if (m) setCollapsed(false);
      else { setDrawerOpen(false); setCollapsed(w < 1200); }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleLogout = async () => { await supabase.auth.signOut(); router.replace("/marta/login"); };
  const toggleNav = () => (mobile ? setDrawerOpen((o) => !o) : setCollapsed((c) => !c));

  const displayName = ctx?.profile?.full_name || ctx?.session?.user?.email?.split("@")[0] || "Pengguna";
  const initial = (ctx?.profile?.full_name || ctx?.session?.user?.email || "M").trim()[0]?.toUpperCase() || "M";
  const roleLabel = ctx?.profile?.role === "spm_sumatera" ? "SPM Sumatera" : (ctx?.profile?.role || "");
  const SIDEBAR_W = collapsed ? 64 : 240;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.appBg }}>
        <HubLogoLoader variant="marta" logoSize={80} />
      </div>
    );
  }

  return (
    <div className="mh-root" style={{ minHeight: "100vh", background: T.appBg, fontFamily: FONT, display: "flex", color: T.hi }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#D1DBF0;border-radius:99px}
        .mh-nav{transition:background .15s,color .15s}
        .mh-nav:hover{background:${T.hover} !important}
        .mh-btn{transition:opacity .14s,transform .1s;cursor:pointer;border:none;background:none;font-family:${FONT}}
        .mh-btn:hover{opacity:.8}
        .mh-btn:active{transform:scale(.97)}

        /* ── Standarisasi seluruh MartaHub — dropdown & tombol rapi ─────────── */
        /* Dropdown: panah kustom, jarak rapi dari tepi (tidak mepet) di semua browser */
        .mh-root select{
          -webkit-appearance:none !important; -moz-appearance:none !important; appearance:none !important;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>") !important;
          background-repeat:no-repeat !important;
          background-position:right 11px center !important;
          background-size:13px !important;
          padding-right:30px !important;
          cursor:pointer;
        }
        .mh-root select::-ms-expand{display:none !important;}
        /* Tombol: satu baris, ikon & teks tak turun ke baris kedua */
        .mh-root button{ white-space:nowrap; }
      `}</style>

      {/* Backdrop drawer mobile */}
      {mobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 290 }} />
      )}

      {/* ── SIDEBAR (identik Dashboard) ─────────────────────────────────────── */}
      <div style={ mobile
        ? { width: 240, background: T.sidebar, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, height: "100vh", overflow: "hidden", zIndex: 300, transform: drawerOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform .25s cubic-bezier(.4,0,.2,1)", boxShadow: drawerOpen ? "0 0 40px rgba(0,0,0,0.3)" : "none" }
        : { width: SIDEBAR_W, minHeight: "100vh", background: T.sidebar, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflow: "hidden", transition: "width .22s cubic-bezier(.4,0,.2,1)", flexShrink: 0 } }>
        {/* Logo */}
        <div style={{ height: HEADER_H, flexShrink: 0, padding: collapsed ? 0 : "0 16px", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10, borderBottom: `1px solid ${T.line}`, cursor: "pointer", position: "relative", background: "linear-gradient(135deg, #FFF5F5 0%, #FFFFFF 100%)" }} onClick={() => router.push("/")}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: ACCENT }} />
          <div style={{ width: 38, height: 38, flexShrink: 0, margin: collapsed ? "0 auto" : 0 }}>
            <HubLogo variant="marta" size={38} shadow={false} />
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.04em", color: T.hi, lineHeight: 1 }}>
                Marta<span style={{ background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
          {NAV.map((item, i) => {
            if (item.section) return (
              !collapsed ? <div key={i} style={{ padding: "14px 8px 6px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", color: T.lo, textTransform: "uppercase" }}>{item.section}</div>
              : <div key={i} style={{ height: 1, background: T.line, margin: "10px 8px" }} />
            );
            const on = active === item.path;
            return (
              <div key={i} className="mh-nav" onClick={() => { if (mobile) setDrawerOpen(false); router.push(item.route || `/martahub/${item.path}`); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "10px 0" : "9px 10px", borderRadius: 9, cursor: "pointer", marginBottom: 1, justifyContent: collapsed ? "center" : "flex-start", background: on ? "rgba(237,28,36,0.08)" : "transparent", position: "relative" }}
                title={collapsed ? item.label : undefined}>
                <span style={{ color: on ? T.primary : T.lo, flexShrink: 0 }}><Icon name={item.icon} size={17} color={on ? T.primary : T.lo} /></span>
                {!collapsed && <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: on ? T.primary : T.mid, flex: 1 }}>{item.label}</span>}
                {!collapsed && item.badge && <span style={{ fontSize: 10, fontWeight: 700, color: "white", background: T.error, borderRadius: 100, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{item.badge}</span>}
                {on && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 3, background: T.primary, borderRadius: "0 3px 3px 0" }} />}
              </div>
            );
          })}
        </div>

        {/* User */}
        <div style={{ borderTop: `1px solid ${T.line}`, padding: collapsed ? "12px 0" : "12px 12px" }}>
          {!collapsed && (
            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${T.primary},${T.primaryD})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{initial}</span>
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                <div style={{ fontSize: 10, color: T.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{roleLabel}</div>
              </div>
            </div>
          )}
          <button className="mh-btn" onClick={handleLogout}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 8, padding: collapsed ? "8px 0" : "8px 10px", borderRadius: 8, color: T.lo, fontSize: 12, fontWeight: 600 }}>
            <Icon name="logout" size={15} color={T.lo} />
            {!collapsed && "Sign Out"}
          </button>
        </div>
      </div>

      {/* ── MAIN ─────────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{ height: HEADER_H, flexShrink: 0, padding: "0 26px", borderBottom: `1px solid ${T.line}`, background: T.surface, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: ACCENT }} />
          <button className="mh-btn" onClick={toggleNav} title={collapsed ? "Buka sidebar" : "Tutup sidebar"} style={{ padding: 6, borderRadius: 7, color: T.mid }}>
            <Icon name={mobile ? (drawerOpen ? "close" : "menu") : (collapsed ? "panelOpen" : "panelClose")} size={18} color={T.mid} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: T.hi }}>{title}</div>
          </div>
          <div style={{ flex: 1 }} />
          {actions}
        </header>
        <div style={{ flex: 1, padding: "22px 26px 60px" }}>
          {typeof children === "function" ? children(ctx) : children}
        </div>
      </main>
    </div>
  );
}

export { FONT };
