"use client";
/**
 * SDP2_StatusForm.jsx — SDP Management (Baru), pintu masuk.
 * Menu di dalam modul baru ini akan bertambah satu-per-satu seiring modul
 * archive dipindahkan (lihat plan rebuild) — untuk sekarang baru ada
 * "Registrasi SDP". Struktur menu disiapkan supaya kartu berikutnya tinggal
 * ditambah ke MENU_ITEMS tanpa mengubah yang sudah ada.
 *
 * Tampilan sengaja minimalis (standar enterprise console): tanpa hero
 * banner/gradient, tanpa badge "Aktif" pada kartu yang memang sudah bisa
 * dipakai — status hanya ditandai pada kartu yang BELUM tersedia.
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useState } from "react";
import { ArrowLeft, ChevronRight, Sparkles, Lock } from "lucide-react";
import SDP2_Home from "./SDP2_Home";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF",
  cardHover: d ? "#1C1C21" : "#FAFAF9",
  line: d ? "rgba(255,255,255,.08)" : "rgba(15,17,23,.09)",
  hi: d ? "#F5F4F1" : "#14151A", mid: d ? "#9A9AA6" : "#5B5F67", lo: d ? "#5C5C68" : "#9AA0AA",
  teal: "#3FCFC0", tealD: "#1A9E90",
  tealBg: d ? "rgba(63,207,192,.10)" : "rgba(26,158,144,.07)",
  tealBd: d ? "rgba(63,207,192,.24)" : "rgba(26,158,144,.16)",
  sub: d ? "#1D1D22" : "#F7F7F6",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 2px rgba(15,17,23,.04)",
  md: d ? "0 10px 26px rgba(0,0,0,.45)" : "0 10px 22px rgba(15,17,23,.07)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// Tambah kartu baru di sini setiap kali satu modul selesai dirapikan dari
// Archive — urutannya menentukan urutan tampil di menu.
const MENU_ITEMS = [
  {
    id: "registrasi",
    icon: Sparkles,
    label: "Registrasi SDP",
    desc: "Daftarkan SDP baru dan pantau progres registrasi yang sudah diajukan, dari satu layar.",
  },
];

// Kartu bayangan untuk modul yang belum dirapikan dari Archive.
const UPCOMING_ITEMS = [
  { id: "hq", label: "Validasi HQ & Status" },
  { id: "term", label: "Terminate & Rebordering" },
];

function MenuCard({ item, t, onClick }) {
  const [hover, setHover] = useState(false);
  const Icon = item.icon;
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        padding: "20px 20px 18px", borderRadius: 14, cursor: "pointer",
        background: hover ? t.cardHover : t.card,
        border: `1px solid ${hover ? t.tealBd : t.line}`,
        boxShadow: hover ? t.md : t.sm,
        transition: "border-color .15s, box-shadow .15s, background .15s",
        display: "flex", flexDirection: "column", gap: 14, minHeight: 140,
      }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: t.tealBg, border: `1px solid ${t.tealBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={17} color={t.tealD} strokeWidth={2} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: t.hi, marginBottom: 5, letterSpacing: -0.1 }}>{item.label}</div>
        <div style={{ fontSize: 12.5, color: t.mid, lineHeight: 1.5 }}>{item.desc}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: t.tealD }}>
        Buka <ChevronRight size={13} style={{ transform: hover ? "translateX(2px)" : "none", transition: "transform .15s" }} />
      </div>
    </div>
  );
}

function GhostCard({ t, label }) {
  return (
    <div style={{
      padding: "20px 20px 18px", borderRadius: 14, minHeight: 140,
      border: `1px solid ${t.line}`, background: t.sub,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "transparent", border: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Lock size={15} color={t.lo} strokeWidth={2} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: t.lo, marginBottom: 5 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: t.lo }}>Segera menyusul</div>
      </div>
    </div>
  );
}

export default function SDP2_StatusForm({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const [activeMenu, setActiveMenu] = useState(null);

  if (activeMenu === "registrasi") {
    return (
      <SDP2_Home supabase={supabase} theme={theme} profile={profile}
        onExit={() => setActiveMenu(null)} />
    );
  }

  return (
    <div style={{ fontFamily: FF, color: t.hi, width: "100%" }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 20 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>SDP Management</div>
        <div style={{ fontSize: 13, color: t.mid, marginTop: 4 }}>Pilih menu di bawah untuk melanjutkan. Menu lain akan menyusul.</div>
      </div>

      {/* Menu grid — responsif, tidak dipaksa satu kolom sempit di tengah */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14,
      }} className="sdp2-menu-grid">
        {MENU_ITEMS.map((item) => (
          <MenuCard key={item.id} item={item} t={t} onClick={() => setActiveMenu(item.id)} />
        ))}
        {UPCOMING_ITEMS.map((item) => (
          <GhostCard key={item.id} t={t} label={item.label} />
        ))}
      </div>

      <style>{`
        @media (max-width: 520px) {
          .sdp2-menu-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
