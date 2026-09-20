"use client";
import { Target, RadioTower } from "lucide-react";

const FF = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

/**
 * Badge "Kecamatan Fokus" & "Site LRS" dipakai di SEMUA kartu aktivitas
 * MartaHub mobile (ActivityCard di halaman Aktivitas & EventActivityCard
 * di Report Hub) - SATU komponen ini adalah sumber kebenaran styling-nya
 * spy tidak ada dua salinan yg diam-diam beda kalau salah satu lupa
 * diperbarui. Dua badge ini INDEPENDEN - bisa tampil berdua sekaligus,
 * cuma salah satu, atau tidak sama sekali (row-nya otomatis kosong/null
 * kalau keduanya false).
 */
export default function ActivityFlagBadges({ kecamatanFokus, siteLrs, style }) {
  if (!kecamatanFokus && !siteLrs) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, ...style }}>
      {kecamatanFokus && (
        <span style={{
          display: "flex", alignItems: "center", gap: 4, fontFamily: FF,
          fontSize: 9, fontWeight: 800, color: "#7C3AED", background: "#F1E9FE",
          border: "1px solid #DDCBFA", borderRadius: 999, padding: "2.5px 7px", whiteSpace: "nowrap",
        }}>
          <Target size={9.5} strokeWidth={2.6} />
          Kecamatan Fokus
        </span>
      )}
      {siteLrs && (
        <span style={{
          display: "flex", alignItems: "center", gap: 4, fontFamily: FF,
          fontSize: 9, fontWeight: 800, color: "#0E7490", background: "#E0F7FA",
          border: "1px solid #B7E9F2", borderRadius: 999, padding: "2.5px 7px", whiteSpace: "nowrap",
        }}>
          <RadioTower size={9.5} strokeWidth={2.6} />
          Site LRS
        </span>
      )}
    </div>
  );
}
