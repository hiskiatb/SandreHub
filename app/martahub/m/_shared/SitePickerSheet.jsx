"use client";
/**
 * SitePickerSheet - bottom sheet cari+pilih site dari daftar `items`
 * ({site_id, site_name}). Dipusatkan di sini (sebelumnya duplikat lokal di
 * wizard Buat Plan) supaya alur "Tambah Site" bisa dipakai lagi di Isi
 * Laporan Actual dgn konsep yg SAMA PERSIS spt di form plan.
 */
import { useEffect, useState } from "react";
import { X, Search } from "lucide-react";
import { FF } from "./MobileShell";
import { lockPullToRefresh, unlockPullToRefresh } from "./CalendarPickerSheet";

const inputBase = { width: "100%", height: 48, padding: "0 14px 0 40px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 14, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };

// Vektor menara sinyal yang sama persis dgn ikon marker site di peta
// (SumatraMap.jsx), supaya konsisten: "site" selalu direpresentasikan
// dengan ikon menara ini di manapun muncul di app.
const SITE_TOWER_PATHS = [
  "M26.7,2.3c-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4c3.5,3.5,3.5,9.1,0,12.6c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3\n\t\ts0.5-0.1,0.7-0.3C31,13.5,31,6.5,26.7,2.3z",
  "M22,12.6c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c1.1-1.1,1.7-2.5,1.6-4.1c0-1.5-0.7-3-1.8-4.1\n\t\tc-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4C23.3,8.7,23.4,11.2,22,12.6z",
  "M6.7,16.3c-3.5-3.5-3.5-9.1,0-12.6c0.4-0.4,0.4-1,0-1.4s-1-0.4-1.4,0C1,6.5,1,13.5,5.3,17.7C5.5,17.9,5.7,18,6,18\n\t\ts0.5-0.1,0.7-0.3C7.1,17.3,7.1,16.7,6.7,16.3z",
  "M8.8,14.2c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c0.4-0.4,0.4-1,0-1.4c-1.5-1.5-1.6-4-0.2-5.4c0.4-0.4,0.4-1,0-1.4\n\t\tS9,5.6,8.6,6C7.5,7.1,7,8.5,7,10.1C7,11.6,7.7,13.1,8.8,14.2z",
  "M24,28h-2.2l-4-15.6C18.5,11.9,19,11,19,10c0-1.7-1.3-3-3-3s-3,1.3-3,3c0,1,0.5,1.9,1.3,2.4l-4,15.6H8c-0.6,0-1,0.4-1,1\n\t\ts0.4,1,1,1h16c0.6,0,1-0.4,1-1S24.6,28,24,28z M17.6,20h-3.3l1.6-6.3L17.6,20z M13.9,22c0,0,0.1,0,0.1,0h4c0.1,0,0.1,0,0.1,0l1.6,6\n\t\th-7.4L13.9,22z",
];
function SiteTowerIcon({ size = 16, color = "#8A8A96" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill={color}>
      {SITE_TOWER_PATHS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export default function SitePickerSheet({ items, onClose, onSelect, title = "Pilih Site" }) {
  const [q, setQ] = useState("");
  const filtered = items.filter((s) => !q.trim() || s.site_id.toLowerCase().includes(q.toLowerCase()) || (s.site_name || "").toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    const { overflow, touchAction } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    lockPullToRefresh();
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.touchAction = touchAction;
      unlockPullToRefresh();
    };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end", overscrollBehavior: "none", touchAction: "none" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "22px 22px 0 0", fontFamily: FF, overscrollBehavior: "contain", boxShadow: "0 -8px 30px rgba(10,10,14,0.18)" }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 2px", flexShrink: 0 }} />

        <div style={{ padding: "6px 16px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 4px 10px" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C", letterSpacing: -0.2 }}>{title}</div>
            <button
              onClick={onClose}
              aria-label="Tutup"
              style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "#F1F2F5", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <Search size={16} color="#9A9AA6" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama site atau Site ID…"
              style={inputBase}
            />
          </div>
        </div>

        <div style={{ overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "0 16px calc(env(safe-area-inset-bottom,0px) + 20px)", minHeight: 160 }}>
          {filtered.length === 0 && (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>Tidak ada site cocok.</div>
          )}
          {filtered.map((s) => (
            <button
              key={s.site_id}
              onClick={() => onSelect(s)}
              style={{ width: "100%", textAlign: "left", padding: "12px 10px", borderRadius: 12, border: "none", background: "none", borderBottom: "1px solid #F0F0F3", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <SiteTowerIcon size={16} color="#8A8A96" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#17181C" }}>{s.site_id}</div>
                {s.site_name && <div style={{ fontSize: 11.5, color: "#8A8A96", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.site_name}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
