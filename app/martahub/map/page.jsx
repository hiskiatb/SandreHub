"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { guardMarta } from "../../../lib/martaAccess";
import { getMartaScope, applyMartaScope, applyMartaScopeSlug } from "../../../lib/martaScope";
import { supabaseMarta } from "../../../lib/supabaseMarta";
import { HubLogo } from "../../../components/HubLogo";
import { HubLogoLoader } from "../../../components/HubLogoLoader";
import MapFull from "../components/SumatraMap";

// Sama seperti dashboard (app/martahub/page.jsx) - data mh_activities direset
// & mulai lagi dari Agustus 2026, jadi fetch peta di sini juga dibatasi dari
// titik yang sama (bukan rolling window dari hari ini).
const MIN_MONTH_KEY = "2026-08";

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
  const [activityPoints, setActivityPoints] = useState([]);
  const [posmPoints, setPosmPoints] = useState([]);
  const t = mk(dark);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("hub-theme") : null;
    if (saved) setDark(saved !== "light");
    else if (typeof window !== "undefined") setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    guardMarta(router, "/martahub/map").then((res) => {
      if (!res.ok) return;
      setCanManage(!!res.canManage);
      setLoading(false);
      const email = res.profile?.email || res.session?.user?.email;
      if (!email) return;
      (async () => {
        try {
          const sc = await getMartaScope(email);

          // Titik Activity (mh_activities.branch_id = uuid mh_branches.id)
          const sinceISO = `${MIN_MONTH_KEY}-01`;
          let aq = supabaseMarta.from("mh_activities")
            .select("id,status,event_name,branch_id,plan_date,latitude,longitude")
            .gte("plan_date", sinceISO).not("latitude", "is", null).not("longitude", "is", null)
            .order("plan_date", { ascending: false }).limit(1000);
          aq = await applyMartaScope(aq, sc);
          const { data: aRows, error: aErr } = await aq;
          if (!aErr) setActivityPoints((aRows || []).map((r) => ({
            lat: r.latitude, lng: r.longitude, name: r.event_name || "Aktivitas", statusKey: r.status || "draft",
          })));

          // Titik POSM (mh_md_installations.branch_id = slug text - scoping
          // beda jalur, lihat applyMartaScopeSlug di lib/martaScope.js).
          let pq = supabaseMarta.from("mh_md_installations")
            .select("id,mode,site_id,street_description,branch_id,brand,created_at,latitude,longitude")
            .not("latitude", "is", null).not("longitude", "is", null)
            .order("created_at", { ascending: false }).limit(1000);
          pq = await applyMartaScopeSlug(pq, sc);
          const { data: pRows, error: pErr } = await pq;
          if (!pErr) setPosmPoints((pRows || []).map((r) => ({
            lat: r.latitude, lng: r.longitude,
            name: r.mode === "activity" ? "Instalasi POSM" : r.mode === "outlet" ? (r.site_id || "POSM Outlet") : (r.street_description || "Street Branding"),
            branch: r.branch_id ? r.branch_id.replace(/-/g, " ").toUpperCase() : null,
            mode: r.mode,
          })));
        } catch { /* best-effort - peta tetap tampil tanpa titik kalau gagal */ }
      })();
    });
  }, [router]);

  const toggle = () => { const n = !dark; setDark(n); localStorage.setItem("hub-theme", n ? "dark" : "light"); };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: t.appBg }}>
      <HubLogoLoader variant="marta" logoSize={84} />
    </div>
  );

  return (
    <div className="mh-root" style={{ height: "100vh", display: "flex", flexDirection: "column", background: t.appBg, fontFamily: FONT, color: t.hi }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:${dark ? "#2A3350" : "#CBD6EA"};border-radius:99px}
        .mh-root select{
          -webkit-appearance:none !important; -moz-appearance:none !important; appearance:none !important;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>") !important;
          background-repeat:no-repeat !important; background-position:right 11px center !important;
          background-size:13px !important; padding-right:30px !important; cursor:pointer;
        }
        .mh-root select::-ms-expand{display:none !important;}
        .mh-root button{ white-space:nowrap; }
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
        <MapFull t={t} dark={dark} canManage={canManage} activityPoints={activityPoints} posmPoints={posmPoints} />
      </div>
    </div>
  );
}
