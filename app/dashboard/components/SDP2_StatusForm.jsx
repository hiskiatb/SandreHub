"use client";
/**
 * SDP2_StatusForm.jsx — SDP Management (Baru), pintu masuk.
 * Menu di dalam modul baru ini akan bertambah satu-per-satu seiring modul
 * archive dipindahkan (lihat plan rebuild) — untuk sekarang baru ada
 * "Registrasi SDP". Struktur menu disiapkan supaya kartu berikutnya tinggal
 * ditambah ke MENU_ITEMS tanpa mengubah yang sudah ada.
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useState } from "react";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";
import SDP2_Home from "./SDP2_Home";

const mk = (d) => ({
  bg: d ? "#0D0D0F" : "#F6F5F1",
  card: d ? "#17171B" : "#FFFFFF",
  cardHover: d ? "#1C1C21" : "#FFFFFF",
  line: d ? "rgba(255,255,255,.08)" : "rgba(15,17,23,.08)",
  hi: d ? "#F5F4F1" : "#14151A", mid: d ? "#9A9AA6" : "#5B5F67", lo: d ? "#5C5C68" : "#9AA0AA",
  teal: "#3FCFC0", tealD: "#1A9E90",
  tealBg: d ? "linear-gradient(135deg, rgba(63,207,192,.16) 0%, rgba(26,158,144,.05) 100%)" : "linear-gradient(135deg, rgba(50,188,173,.12) 0%, rgba(26,158,144,.03) 100%)",
  tealBd: d ? "rgba(63,207,192,.28)" : "rgba(26,158,144,.18)",
  gold: d ? "#E8C77C" : "#B7893A",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 3px rgba(15,17,23,.05)",
  md: d ? "0 14px 34px rgba(0,0,0,.5)" : "0 14px 30px rgba(15,17,23,.08)",
});
const FF_DISPLAY = `"Fraunces","DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",serif`;
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// Tambah kartu baru di sini setiap kali satu modul selesai dirapikan dari
// Archive — urutannya menentukan urutan tampil di menu.
const MENU_ITEMS = [
  {
    id: "registrasi",
    icon: Sparkles,
    label: "Registrasi SDP",
    desc: "Daftarkan SDP baru dan pantau progres registrasi yang sudah diajukan, dari satu layar.",
    tag: "Aktif",
  },
];

function MenuCard({ item, t, onClick }) {
  const [hover, setHover] = useState(false);
  const Icon = item.icon;
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", overflow: "hidden",
        padding: "26px 26px 24px", borderRadius: 20, cursor: "pointer",
        background: hover ? t.cardHover : t.card,
        border: `1px solid ${hover ? t.tealBd : t.line}`,
        boxShadow: hover ? t.md : t.sm,
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: "all .22s cubic-bezier(.4,0,.2,1)",
        display: "flex", flexDirection: "column", gap: 18, minHeight: 168,
      }}>
      <div style={{ position: "absolute", inset: 0, opacity: hover ? 1 : 0, transition: "opacity .22s", background: t.tealBg, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, background: t.tealBg, border: `1px solid ${t.tealBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={21} color={t.tealD} strokeWidth={2.1} />
        </div>
        {item.tag && (
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: t.tealD, background: t.tealBg, border: `1px solid ${t.tealBd}`, borderRadius: 99, padding: "4px 10px" }}>{item.tag}</span>
        )}
      </div>
      <div style={{ position: "relative", flex: 1 }}>
        <div style={{ fontSize: 16.5, fontWeight: 800, color: t.hi, marginBottom: 6, letterSpacing: -0.2 }}>{item.label}</div>
        <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.55 }}>{item.desc}</div>
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: t.tealD }}>
        Buka <ChevronRight size={14} style={{ transform: hover ? "translateX(2px)" : "none", transition: "transform .18s" }} />
      </div>
    </div>
  );
}

// Kartu bayangan untuk modul yang belum dirapikan — memberi gambaran ke mana
// arah menu ini tanpa mengklaim sesuatu yang belum ada.
function GhostCard({ t, label }) {
  return (
    <div style={{
      padding: "26px 26px 24px", borderRadius: 20, minHeight: 168,
      border: `1.5px dashed ${t.line}`, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 8,
      color: t.lo,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 11.5 }}>Segera menyusul</div>
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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" />

      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 22 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      {/* Hero */}
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: 24, padding: "34px 32px",
        background: d ? "linear-gradient(135deg, #14201F 0%, #0D0D0F 70%)" : "linear-gradient(135deg, #EAF6F3 0%, #F6F5F1 70%)",
        border: `1px solid ${t.tealBd}`, marginBottom: 28,
      }}>
        <div style={{ position: "absolute", top: -60, right: -40, width: 220, height: 220, borderRadius: "50%", background: t.tealBg, filter: "blur(10px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: t.teal }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t.tealD }}>SDP Management — Baru</span>
        </div>
        <div style={{ position: "relative", fontFamily: FF_DISPLAY, fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.15, color: t.hi, maxWidth: 520 }}>
          Kelola registrasi SDP Anda, lebih cepat.
        </div>
        <div style={{ position: "relative", fontSize: 13.5, color: t.mid, marginTop: 10, maxWidth: 460, lineHeight: 1.6 }}>
          Modul ini sedang dirapikan bertahap dari SDP Management (Archive). Pilih salah satu menu di bawah untuk memulai.
        </div>
      </div>

      {/* Menu grid — responsif, tidak dipaksa satu kolom sempit di tengah */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16,
      }} className="sdp2-menu-grid">
        {MENU_ITEMS.map((item) => (
          <MenuCard key={item.id} item={item} t={t} onClick={() => setActiveMenu(item.id)} />
        ))}
        <GhostCard t={t} label="Validasi HQ & Status" />
        <GhostCard t={t} label="Terminate & Rebordering" />
      </div>

      <style>{`
        @media (max-width: 520px) {
          .sdp2-menu-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
