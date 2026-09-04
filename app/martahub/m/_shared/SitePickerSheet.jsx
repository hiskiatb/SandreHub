"use client";
/**
 * SitePickerSheet - bottom sheet cari+pilih site dari daftar `items`
 * ({site_id, site_name}). Dipusatkan di sini (sebelumnya duplikat lokal di
 * wizard Buat Plan) supaya alur "Tambah Site" bisa dipakai lagi di Isi
 * Laporan Actual dgn konsep yg SAMA PERSIS spt di form plan.
 */
import { useState } from "react";
import { FF } from "./MobileShell";

const inputBase = { width: "100%", height: 48, padding: "0 14px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 14, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };

export default function SitePickerSheet({ items, onClose, onSelect, title = "Pilih Site" }) {
  const [q, setQ] = useState("");
  const filtered = items.filter((s) => !q.trim() || s.site_id.toLowerCase().includes(q.toLowerCase()) || (s.site_name || "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "75vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "22px 22px 0 0", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px" }} />
        <div style={{ padding: "10px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari site…"
            style={{ ...inputBase, marginTop: 10, height: 42 }} />
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 20px" }}>
          {filtered.length === 0 && <div style={{ padding: "24px 0", textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>Tidak ada site cocok.</div>}
          {filtered.map((s) => (
            <button key={s.site_id} onClick={() => onSelect(s)}
              style={{ width: "100%", textAlign: "left", padding: "12px 10px", borderRadius: 10, border: "none", background: "none", borderBottom: "1px solid #F0F0F3", cursor: "pointer" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#17181C" }}>{s.site_id}</div>
              {s.site_name && <div style={{ fontSize: 11.5, color: "#8A8A96", marginTop: 2 }}>{s.site_name}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
