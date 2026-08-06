"use client";
/**
 * /martahub/m/profile — Profil BME/RGE (web mobile), padanan `profile_screen.dart`
 * di Flutter: identitas, scope penugasan, akses ke Transfer MSISDN, dan Keluar.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Mail, Building2, MapPin, Sparkles, ArrowLeftRight, Target, TrendingUp, ChevronRight, Hash } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { fmtInt } from "../_shared/activityUi";

const ROLE_LABEL = { bme: "BME", rge: "RGE", tmv: "Brand TMV", head: "Head TMV", admin: "Admin", spm_sumatera: "SPM Sumatera" };

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || name[0]?.toUpperCase() || "?";
}

export default function ProfilePage() {
  const router = useRouter();
  const { loading, email, userId, scope } = useMartaSession();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (loading || !userId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabaseMarta.from("mh_leaderboard_summary").select("total_activities, achievement_pct, final_score").eq("user_id", userId).maybeSingle();
        if (alive) setStats(data || null);
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
  }, [loading, userId]);

  const signOut = async () => {
    await supabaseMarta.auth.signOut();
    router.replace("/martahub/m/login");
  };

  if (loading) return <MobileShell active="profile"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="profile">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <BackBar router={router} />

        {/* Header card */}
        <div style={{ marginTop: 16, borderRadius: 20, background: BRAND, padding: "22px 20px", color: "#fff", boxShadow: "0 6px 18px rgba(17,17,20,0.12)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -30, top: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
              {initials(scope?.fullName || email)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scope?.fullName || "—"}</div>
              <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <Mail size={11} /> {email}
              </div>
            </div>
          </div>
          {stats && (
            <div style={{ display: "flex", gap: 20, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
              <MiniStat icon={Sparkles} label="Aktivitas" value={fmtInt(stats.total_activities)} />
              <MiniStat icon={Target} label="Capaian" value={`${Math.round(stats.achievement_pct || 0)}%`} />
              <MiniStat icon={TrendingUp} label="Skor" value={fmtInt(Math.round(stats.final_score || 0))} />
            </div>
          )}
        </div>

        {/* Scope info — authState sudah pasti 'active' di titik ini (lihat
            catatan redirect di useMartaSession, MobileShell.jsx). */}
        <SectionCard title="Penugasan">
          <RowKV icon={<Sparkles size={13} />} label="Peran" value={ROLE_LABEL[scope?.role] || scope?.role} />
          {scope?.brand && <RowKV icon={<Building2 size={13} />} label="Brand" value={scope.brand.toUpperCase()} />}
          {scope?.branchName && <RowKV icon={<MapPin size={13} />} label="Cabang" value={scope.branchName} />}
          {scope?.region && <RowKV icon={<MapPin size={13} />} label="Region" value={scope.region} />}
        </SectionCard>

        {/* Menu */}
        <div style={{ marginTop: 14, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, overflow: "hidden" }}>
          <MenuRow icon={<ArrowLeftRight size={16} />} label="Transfer MSISDN" onTap={() => router.push("/martahub/m/transfers")} />
          <MenuRow icon={<Hash size={16} />} label="Semua Aktivitas" onTap={() => router.push("/martahub/m/activities")} last />
        </div>

        <button onClick={signOut}
          style={{ width: "100%", marginTop: 14, height: 48, borderRadius: 14, border: "1px solid #F7C6C9", background: "#FFF5F6", color: "#DC2626", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <LogOut size={15} /> Keluar
        </button>

        <div style={{ textAlign: "center", marginTop: 18, marginBottom: 30, fontSize: 10.5, color: "#C4C4CE", fontWeight: 600 }}>
          MartaHub · IOH Sumatera
        </div>
      </div>
    </MobileShell>
  );
}

function BackBar({ router }) {
  return (
    <button onClick={() => router.push("/martahub/m")}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
      <ArrowLeft size={16} /> Beranda
    </button>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.85 }}>
        <Icon size={11} />
        <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ marginTop: 14, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "14px 15px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function RowKV({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0" }}>
      <span style={{ color: "#8A8A96", display: "flex" }}>{icon}</span>
      <span style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: "#17181C", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function MenuRow({ icon, label, onTap, last }) {
  return (
    <button onClick={onTap}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "14px 15px", background: "none", border: "none", borderBottom: last ? "none" : "1px solid #F0F0F3", cursor: "pointer", fontFamily: FF }}>
      <span style={{ color: "#5A5A68", display: "flex" }}>{icon}</span>
      <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 700, color: "#17181C" }}>{label}</span>
      <ChevronRight size={16} color="#C4C4CE" />
    </button>
  );
}
