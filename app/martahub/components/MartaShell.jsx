"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { guardMarta } from "../../../lib/martaAccess";
import { HubLogo } from "../../../components/HubLogo";
import { HubLogoLoader } from "../../../components/HubLogoLoader";
import { supabase } from "../../../lib/supabase";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

// Palet MartaHub (light).
export const T = {
  appBg: "#F0F4FA", sidebar: "#FFFFFF", card: "#FFFFFF", hover: "#F0F4FA",
  line: "#E3E8F0", hi: "#0D1117", mid: "#4A5568", lo: "#7B8BAD",
  primary: "#ED1C24", primaryBg: "#FCEAEE", primaryBd: "#F3C6D6",
  blue: "#1565C0", blueBg: "#E7F0FB", success: "#2E7D32", successBg: "#E8F5E9",
  warning: "#F57F17", warningBg: "#FFFDE7", error: "#C62828", errorBg: "#FFEBEE",
  im3: "#E53935", tri: "#E23B86",
};

// Nav MartaHub web (semua diarahkan ke halaman /martahub/<path>).
const NAV = [
  { label: "Dashboard", path: "", route: "/martahub" },
  { section: "ACTIVITY" },
  { label: "Activity Plan", path: "activities" },
  { label: "Activity Submission", path: "submission" },
  { section: "INTELLIGENCE" },
  { label: "Map Intelligence", path: "map" },
  { label: "Leaderboard", path: "leaderboard" },
  { section: "MANAGEMENT" },
  { label: "Approval Center", path: "approval" },
  { label: "Assignments", path: "assignments" },
  { label: "Master Data (List Site)", path: "master" },
];

function Ic({ d, size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/**
 * Shell konsisten untuk semua sub-menu MartaHub web.
 * Pakai: <MartaShell active="activities" title="Activity Plan">{(ctx)=> ...}</MartaShell>
 * ctx = { profile, canManage, session }.
 */
export default function MartaShell({ active, title, subtitle, actions, children }) {
  const router = useRouter();
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    guardMarta(router, typeof window !== "undefined" ? window.location.pathname : "/martahub").then((res) => {
      if (!res.ok) return;
      setCtx({ profile: res.profile, canManage: res.canManage, session: res.session });
      setLoading(false);
    });
  }, [router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.appBg }}>
        <HubLogoLoader variant="marta" logoSize={80} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.appBg, fontFamily: FONT, display: "flex", color: T.hi }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');*{box-sizing:border-box}`}</style>

      {/* Sidebar */}
      <aside style={{ width: 248, background: T.sidebar, borderRight: `1px solid ${T.line}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "18px 18px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.line}` }}>
          <HubLogo variant="marta" size={34} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.03em" }}>MartaHub</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.lo, textTransform: "uppercase" }}>Marketing Sumatera</div>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 10px 20px" }}>
          {NAV.map((it, i) => {
            if (it.section) return <div key={i} style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: T.lo, padding: "14px 10px 6px" }}>{it.section}</div>;
            const on = active === it.path;
            return (
              <button key={i} onClick={() => router.push(it.route || `/martahub/${it.path}`)}
                style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", marginBottom: 2, borderRadius: 9, border: "none", cursor: "pointer",
                  background: on ? T.primaryBg : "transparent", color: on ? T.primary : T.mid, fontWeight: on ? 700 : 600, fontSize: 13, fontFamily: FONT }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: on ? T.primary : T.line }} />
                {it.label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: 12, borderTop: `1px solid ${T.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 6 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
              {(ctx?.profile?.full_name || "U").charAt(0)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx?.profile?.full_name || "User"}</div>
              <div style={{ fontSize: 10.5, color: T.lo }}>{ctx?.canManage ? "Admin" : "Viewer"}</div>
            </div>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.replace("/marta/login"); }}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: "transparent", color: T.mid, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: FONT }}>
            Keluar
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{ padding: "18px 26px", borderBottom: `1px solid ${T.line}`, background: T.sidebar, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: T.mid, marginTop: 2 }}>{subtitle}</div>}
          </div>
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
