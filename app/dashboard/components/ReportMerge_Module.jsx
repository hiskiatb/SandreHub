"use client";
/**
 * ReportMerge_Module.jsx
 * Placeholder shell untuk fitur "Report Merge" (mail-merge email + surat PDF).
 * Akses sudah digating di dashboard/page.jsx (canReportMerge) DAN akan
 * di-enforce ulang di server lewat lib/reportMerge/auth.js pada setiap
 * endpoint /api/report-merge/*. Konten UI penuh akan diisi bertahap.
 */
import { Mail } from "lucide-react";

export default function ReportMerge_Module({ t, profile }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${t.line}`,
        background: t.surface,
        boxShadow: t.shadowSm,
        padding: "40px 28px",
        textAlign: "center",
        color: t.textMuted || t.sub,
      }}
    >
      <div
        style={{
          width: 48, height: 48, borderRadius: 12,
          background: t.chipBg || "rgba(99,102,241,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
        }}
      >
        <Mail size={22} color={t.accent || "#6366f1"} />
      </div>
      <h3 style={{ margin: "0 0 6px", color: t.text }}>Report Merge</h3>
      <p style={{ margin: 0, fontSize: 13, maxWidth: 420, marginInline: "auto" }}>
        Modul mail-merge email &amp; pembuatan surat PDF sedang disiapkan
        untuk dipindahkan ke sini. Akses dibatasi untuk Internal IOH dan
        SPM Sumatera.
      </p>
    </div>
  );
}
