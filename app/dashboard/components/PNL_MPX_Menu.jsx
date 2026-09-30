"use client";
/**
 * PNL_MPX_Menu.jsx — landing "MPX P&L Report".
 *
 * Dulu 4 modul P&L (Laporan P&L, PNL Control Center, Pivot P&L Summary,
 * Import Data Otomatis) tampil sebagai 4 kartu terpisah langsung di Overview
 * + 4 sub-item di sidebar. Dirapikan jadi SATU menu "MPX P&L Report" di
 * Overview/sidebar, yang membuka layar ini — pola yang sama persis dengan
 * SDP2_StatusForm.jsx (lihat file itu untuk komponen kembar MenuCard).
 *
 * Grid pakai auto-fit (bukan lebar tetap) supaya kartu ikut melebar mengisi
 * ruang yang ada — 4 sejajar di layar lebar, turun bertahap ke 1 kolom di
 * mobile — jadi tidak ada spasi kosong terbuang di kanan pada layar lebar.
 *
 * Filter Laporan (Region/Partner/Branch) di sidebar sengaja HANYA muncul
 * selama pengguna berada di dalam salah satu dari 4 modul ini — diatur dari
 * page.jsx (SHOW_SIDEBAR_FILTER_VIEWS), bukan di file ini.
 *
 * Props: { theme = "dark", onSelect(viewId), onExit, items }
 *   items: [{ id, icon, label, desc, tag }] — sudah difilter oleh role di page.jsx.
 */
import React, { useState } from "react";
import { ArrowLeft, ChevronRight, PieChart } from "lucide-react";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF",
  cardHover: d ? "#1C1C21" : "#FAFAF9",
  line: d ? "rgba(255,255,255,.08)" : "rgba(15,17,23,.09)",
  hi: d ? "#F5F4F1" : "#14151A", mid: d ? "#9A9AA6" : "#5B5F67", lo: d ? "#5C5C68" : "#9AA0AA",
  sub: d ? "#1D1D22" : "#F7F7F6",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 2px rgba(15,17,23,.04)",
  md: d ? "0 14px 30px rgba(0,0,0,.5)" : "0 14px 28px rgba(15,17,23,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

function MenuCard({ item, t, onClick }) {
  const [hover, setHover] = useState(false);
  const Icon = item.icon;
  const ac = item.accent || { color: t.mid, bg: t.sub, bd: t.line };
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", padding: "22px 20px 18px", borderRadius: 16, cursor: "pointer",
        background: hover ? t.cardHover : t.card,
        border: `1px solid ${hover ? ac.bd : t.line}`,
        boxShadow: hover ? `0 14px 30px ${ac.color}22, ${t.sm}` : t.sm,
        transition: "border-color .16s, box-shadow .16s, background .16s, transform .16s",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        display: "flex", flexDirection: "column", gap: 13, minHeight: 172, overflow: "hidden",
      }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: ac.color, opacity: hover ? 1 : 0, transition: "opacity .16s" }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: hover ? ac.color : ac.bg, border: `1px solid ${hover ? ac.color : ac.bd}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "background .16s, border-color .16s" }}>
          <Icon size={19} color={hover ? "#FFFFFF" : ac.color} strokeWidth={2} />
        </div>
        {item.tag && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 5, color: ac.color, background: ac.bg, border: `1px solid ${ac.bd}`, whiteSpace: "nowrap" }}>{item.tag}</span>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 6, letterSpacing: -0.1 }}>{item.label}</div>
        <div style={{
          fontSize: 12.5, color: t.mid, lineHeight: 1.5,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{item.desc}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: ac.color }}>
        Buka <ChevronRight size={13} style={{ transform: hover ? "translateX(2px)" : "none", transition: "transform .16s" }} />
      </div>
    </div>
  );
}

export default function PNL_MPX_Menu({ theme = "dark", onSelect, onExit, items }) {
  const d = theme === "dark";
  const t = mk(d);

  return (
    <div style={{ fontFamily: FF, color: t.hi, width: "100%" }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 20 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: t.sub, border: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PieChart size={18} color={t.mid} strokeWidth={2} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px" }}>MPX P&amp;L Report</div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.lo, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 99, padding: "2px 9px" }}>{items.length} modul</span>
          </div>
          <div style={{ fontSize: 13, color: t.mid, marginTop: 3 }}>Pilih modul laporan P&amp;L di bawah. Gunakan filter Region/Partner/Branch di sidebar untuk mempersempit tampilan.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }} className="pnlmpx-menu-grid">
        {items.map((item) => (
          <MenuCard key={item.id} item={item} t={t} onClick={() => onSelect(item.id)} />
        ))}
      </div>

      <style>{`
        @media (max-width: 480px) {
          .pnlmpx-menu-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
