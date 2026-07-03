"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { guardMarta } from "../../../lib/martaAccess";
import { HubLogo } from "../../../components/HubLogo";
import { HubLogoLoader } from "../../../components/HubLogoLoader";
import MapFull from "../components/SumatraMap";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const mk = (d) => ({
  appBg: d ? "#0A0C10" : "#F0F4FA",
  surface: d ? "#111520" : "#FFFFFF",
  card: d ? "#141824" : "#FFFFFF",
  hover: d ? "#1A2030" : "#F0F4FA",
  line: d ? "#1E2435" : "#E3E8F0",
  hi: d ? "#E8EDF8" : "#0D1117",
  mid: d ? "#7B8BAD" : "#4A5568",
  lo: d ? "#4A5A7D" : "#7B8BAD",
});

function Icon({ name, size = 16, color = "currentColor" }) {
  const s = { width: size, height: size, flexShrink: 0 };
  const p = { fill: "none", stroke: color, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    back: <svg style={s} viewBox="0 0 24 24" {...p}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>,
    sun: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.2" y1="4.2" x2="5.6" y2="5.6" /><line x1="18.4" y1="18.4" x2="19.8" y2="19.8" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.2" y1="19.8" x2="5.6" y2="18.4" /><line x1="18.4" y1="5.6" x2="19.8" y2="4.2" /></svg>,
    moon: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
  };
  return icons[name] || null;
}

export default function MapIntelligencePage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const t = mk(dark);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("hub-theme") : null;
    if (saved) setDark(saved !== "light");
    else if (typeof window !== "undefined") setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    guardMarta(router, "/martahub/map").then((res) => { if (res.ok) { setCanManage(!!res.canManage); setLoading(false); } });
  }, [router]);

  const toggle = () => { const n = !dark; setDark(n); localStorage.setItem("hub-theme", n ? "dark" : "light"); };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: t.appBg }}>
      <HubLogoLoader variant="marta" logoSize={84} />
    </div>
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: t.appBg, fontFamily: FONT, color: t.hi }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:${dark ? "#2A3350" : "#CBD6EA"};border-radius:99px}
      `}</style>

      {/* Topbar */}
      <div style={{ height: 60, flexShrink: 0, background: t.surface, borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 14, padding: "0 20px" }}>
        <button onClick={() => router.push("/martahub")} title="Kembali ke Dashboard"
          style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
          <Icon name="back" size={17} color={t.mid} />
        </button>
        <div style={{ width: 30, height: 30 }}><HubLogo variant="marta" size={30} shadow={false} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", color: t.hi }}>Map Intelligence</div>
          <div style={{ fontSize: 11, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Peta aktivitas & batas wilayah Sumatera</div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={toggle} title="Ganti tema"
          style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
          <Icon name={dark ? "sun" : "moon"} size={16} color={t.mid} />
        </button>
      </div>

      {/* Peta penuh */}
      <div style={{ flex: 1, minHeight: 0, padding: 16 }}>
        <MapFull t={t} dark={dark} canManage={canManage} />
      </div>
    </div>
  );
}
