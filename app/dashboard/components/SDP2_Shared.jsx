"use client";
/**
 * SDP2_Shared.jsx — gaya visual bersama utk SELURUH modul "SDP Management"
 * (SDP2_StatusForm, SDP2_Home, SDP2_CMS, SDP2_Detail, SDP_QuickForm).
 *
 * UPDATE (permintaan user - referensi screenshot popover "Format Penamaan
 * SDP ID": "untuk semua menu SDP Management, coba buatkan style seperti
 * ini warnanya teal ke warna gelap, termasuk untuk primary color, buat
 * dengan sangat bagus dan konsisten stylenya" + follow-up "pastikan setiap
 * teks tetap kontras"): satu sumber kebenaran utk gradient teal→gelap
 * (header banner & tombol primary/CTA utama) dipakai SERAGAM di semua
 * layar modul ini — menggantikan gradient merah/magenta (acc/mag) yang
 * sebelumnya dipakai di SDP_QuickForm (dipinjam dari style modul lain di
 * app ini, bukan khas SDP Management).
 *
 * KONTRAS: kedua gradient dipilih (& dicek manual pakai rumus WCAG relative
 * luminance) supaya teks putih DI MANA PUN posisinya di atas gradient ini
 * tetap >= rasio kontras 4.5:1 (AA) - bukan cuma di satu titik warna. Jangan
 * ganti stop warna di sini tanpa menghitung ulang kontras titik PALING
 * TERANG-nya (titik akhir SDP_GRADIENT, #1F5B5C → kontras ~7.7:1).
 */
import React from "react";

// Header banner — arah diagonal 120deg, biru-gelap nyaris hitam (#0F2027)
// ke teal gelap (#1F5B5C, BUKAN teal terang - supaya teks putih tetap aman).
export const SDP_GRADIENT = "linear-gradient(120deg, #0F2027 0%, #1B3A3E 55%, #1F5B5C 100%)";
// Tombol primary/CTA — teal lebih hidup di titik awal drpd header, tapi
// TETAP cukup gelap di seluruh gradasi (#0E6A61 → #0B2E31) biar teks putih
// di atasnya tetap kebaca jelas dari ujung ke ujung tombol.
export const SDP_GRADIENT_CTA = "linear-gradient(135deg, #0E6A61 0%, #0B2E31 100%)";
export const SDP_GRADIENT_CTA_SHADOW = "0 8px 18px rgba(14,106,97,0.38)";

/** Banner judul gradient — dipakai di pintu masuk/puncak tiap layar modul. */
export function SdpHeaderBanner({ icon: Icon, title, subtitle, right }) {
  return (
    <div style={{
      position: "relative", borderRadius: 18, padding: "19px 22px", marginBottom: 22,
      background: SDP_GRADIENT, color: "#fff", display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 14, flexWrap: "wrap", overflow: "hidden",
      boxShadow: "0 10px 26px rgba(15,32,39,0.28)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
        {Icon && (
          <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.26)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={19} color="#fff" strokeWidth={2} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3, color: "#fff", lineHeight: 1.25 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.82)", marginTop: 3 }}>{subtitle}</div>}
        </div>
      </div>
      {right && <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>{right}</div>}
    </div>
  );
}

/** Tombol "Kembali" versi ghost yang kontras di atas banner gelap — opsional, dipakai saat tombol Kembali ditaruh DI DALAM banner (bukan di atasnya). */
export function SdpGhostBackButton({ onClick, children = "Kembali" }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.14)",
      border: "1px solid rgba(255,255,255,.26)", borderRadius: 9, cursor: "pointer", color: "#fff",
      fontFamily: `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`,
      fontSize: 12.5, fontWeight: 700, padding: "7px 12px",
    }}>
      {children}
    </button>
  );
}
