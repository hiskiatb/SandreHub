"use client";
/**
 * SDP_StatusForm.jsx — v5 — rebuild from scratch
 * Entry point untuk fitur SDP Status di SandraHub web.
 *
 * Struktur sub-menu:
 *   SPM Sumatera → Upload Territory IOH | Dashboard Status SDP | Mapping | Rekap Data
 *   [Roles lain] → TBD (dalam pengembangan)
 *
 * Props: { supabase, theme = "dark", profile }
 */
import React, { useState } from "react";
import {
  UploadCloud, ChevronRight, ArrowLeft, Construction, Download,
} from "lucide-react";
import SDP_UploadTerritory from "./SDP_UploadTerritory";
import SDP_RekapCSE        from "./SDP_RekapCSE";

// ─── Theme ─────────────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg   : d ? "#0D0D0F" : "#F2F4F7",
  card : d ? "#17171B" : "#FFFFFF",
  sub  : d ? "#1D1D22" : "#F8F9FA",
  line : d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi   : d ? "#F1F1F4" : "#0F1117",
  mid  : d ? "#8A8A9C" : "#6B7280",
  lo   : d ? "#4A4A5E" : "#A0A8B4",
  teal : "#32BCAD",
  tealD: "#1A9E90",
  tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)",
  tealBd: d ? "rgba(50,188,173,.3)"  : "rgba(26,158,144,.2)",
  blue : d ? "#0A84FF" : "#2563EB",
  blueBg: d ? "rgba(10,132,255,.1)"  : "rgba(37,99,235,.07)",
  blueBd: d ? "rgba(10,132,255,.25)" : "rgba(37,99,235,.18)",
  mag  : "#C6168D",
  magBg: d ? "rgba(198,22,141,.12)"  : "rgba(198,22,141,.07)",
  magBd: d ? "rgba(198,22,141,.3)"   : "rgba(198,22,141,.18)",
  acc  : "#ED1C24",
  accBg: d ? "rgba(237,28,36,.1)"    : "rgba(237,28,36,.07)",
  accBd: d ? "rgba(237,28,36,.25)"   : "rgba(237,28,36,.18)",
  sm   : d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md   : d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// ─── Sub-menu definitions per role ────────────────────────────────────────────
const MENUS = {
  spm_sumatera: [
    {
      id     : "upload_territory",
      icon   : UploadCloud,
      label  : "Upload Territory IOH",
      desc   : "Sinkronisasi data SDP Sumatera dari file Territory IOH bulanan",
      accent : "teal",
    },
    {
      id     : "rekap",
      icon   : Download,
      label  : "Data SDP",
      desc   : "Tabel semua SDP per periode — filter lengkap, detail & riwayat, export Excel",
      accent : "blue",
    },
  ],
  bsm: [
    {
      id     : "rekap",
      icon   : Download,
      label  : "Data SDP",
      desc   : "Tabel SDP di branch Anda per periode — detail, riwayat & export Excel",
      accent : "blue",
    },
  ],
};

// ─── Role badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role, t }) {
  const cfg = {
    spm_sumatera  : { label: "SPM Sumatera",   color: t.mag,  bg: t.magBg,  bd: t.magBd  },
    bsm           : { label: "BSM",            color: t.teal, bg: t.tealBg, bd: t.tealBd },
    cse_rse       : { label: "CSE/RSE",        color: t.blue, bg: t.blueBg, bd: t.blueBd },
    pic_region    : { label: "PIC Region",     color: t.acc,  bg: t.accBg,  bd: t.accBd  },
  }[role] ?? { label: role, color: t.mid, bg: "transparent", bd: t.line };

  return (
    <span style={{
      display: "inline-block", padding: "3px 10px",
      borderRadius: 6, fontSize: 11.5, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bd}`,
      letterSpacing: 0.3,
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Menu card ────────────────────────────────────────────────────────────────
function MenuCard({ item, t, onClick }) {
  const [hover, setHover] = useState(false);
  const Icon = item.icon;
  const isBlue = item.accent === "blue";
  const isMag   = item.accent === "mag";
  const iconBg  = isMag ? t.magBg : isBlue ? t.blueBg  : t.tealBg;
  const iconBd  = isMag ? t.magBd : isBlue ? t.blueBd  : t.tealBd;
  const iconCol = isMag ? t.mag   : isBlue ? t.blue    : t.tealD;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 20, borderRadius: 16, cursor: "pointer",
        background: t.card, border: `1px solid ${hover ? iconBd : t.line}`,
        boxShadow: hover ? t.md : t.sm,
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "all 0.15s ease",
        display: "flex", alignItems: "flex-start", gap: 16,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: iconBg, border: `1px solid ${iconBd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={20} color={iconCol} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 4, letterSpacing: -0.2 }}>
          {item.label}
        </div>
        <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.5 }}>
          {item.desc}
        </div>
      </div>
      <ChevronRight size={16} color={t.lo} style={{ marginTop: 4, flexShrink: 0 }} />
    </div>
  );
}

// ─── Role not configured stub ─────────────────────────────────────────────────
function ComingSoon({ role, t }) {
  return (
    <div style={{
      padding: "64px 32px", textAlign: "center",
      background: t.card, borderRadius: 16, border: `1px solid ${t.line}`,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, margin: "0 auto 20px",
        background: t.tealBg, border: `1px solid ${t.tealBd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Construction size={24} color={t.tealD} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: t.hi, marginBottom: 8, letterSpacing: -0.3 }}>
        Fitur sedang disiapkan
      </div>
      <div style={{ fontSize: 13.5, color: t.mid, lineHeight: 1.6 }}>
        Menu SDP Status untuk role ini akan tersedia segera.
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SDP_StatusForm({ supabase, theme = "dark", profile }) {
  const d    = theme === "dark";
  const t    = mk(d);
  const role = profile?.role ?? "";

  const [activeMenu, setActiveMenu] = useState(null);   // null = sub-menu list

  const menus = MENUS[role] ?? null;

  const renderBack = () => (
    <button
      onClick={() => setActiveMenu(null)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "none", border: "none", cursor: "pointer",
        color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600,
        padding: "0 0 0 2px", marginBottom: 20,
      }}
    >
      <ArrowLeft size={15} />
      Kembali ke SDP Status
    </button>
  );

  // ── Active sub-view ─────────────────────────────────────────────────────────
  if (activeMenu === "upload_territory") {
    return (
      <div style={{ fontFamily: FF }}>
        {renderBack()}
        <SDP_UploadTerritory supabase={supabase} theme={theme} profile={profile} />
      </div>
    );
  }

  if (activeMenu === "rekap") {
    return (
      <div style={{ fontFamily: FF }}>
        {renderBack()}
        <SDP_RekapCSE supabase={supabase} theme={theme} profile={profile} />
      </div>
    );
  }

  // ── Sub-menu list ───────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FF, color: t.hi }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: t.hi }}>
          SDP Status
        </div>
        <div style={{ fontSize: 13, color: t.mid, marginTop: 3 }}>
          Pilih menu di bawah untuk melanjutkan
        </div>
      </div>

      {/* Menu grid or fallback */}
      {menus ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {menus.map(item => (
            <MenuCard
              key={item.id}
              item={item}
              t={t}
              onClick={() => setActiveMenu(item.id)}
            />
          ))}
        </div>
      ) : (
        <ComingSoon role={role} t={t} />
      )}
    </div>
  );
}
