"use client";
import { useState } from "react";
/**
 * ReportMerge_Module.jsx
 * Menampilkan UI "Report Merge" (mail-merge email + surat PDF) lewat
 * iframe ke public/report-merge/index.html — file itu adalah app
 * standalone ASLI (index.html dari paket yang diupload), TIDAK diubah
 * sama sekali isinya, cuma disisipi 1 <script> shim di <head> yang:
 *   1) mengarahkan semua fetch('/api/...') ke '/api/report-merge/...'
 *   2) menambahkan header Authorization: Bearer <token sesi SandraHub>
 *      supaya endpoint di server (lib/reportMerge/auth.js) bisa
 *      memverifikasi role & menolak Finance MPX.
 * Lihat public/report-merge/index.html untuk isi shim-nya.
 *
 * Akses ke menu ini sudah digating di dashboard/page.jsx
 * (canReportMerge = isSPM || isIOHAny) DAN di-enforce ulang di server
 * lewat lib/reportMerge/auth.js pada setiap endpoint /api/report-merge/*
 * — jadi walau file HTML-nya sendiri statis (bisa dibuka lewat URL
 * langsung), semua data tetap ditolak di server untuk role yang tidak
 * diizinkan.
 */
// Halaman yang bisa dibuka di dalam iframe. "mdi" = Surat MDI (Partner MPC),
// port dari Smart Mail Sumatera; sengaja halaman terpisah supaya tidak
// menyentuh index.html.
const PAGES = [
  { id: "report", label: "Blast Email Report & Buat Surat", src: "/report-merge/index.html" },
  { id: "mdi", label: "📑 Surat MDI (Partner MPC)", src: "/report-merge/mdi.html" },
];

export default function ReportMerge_Module({ t }) {
  const [page, setPage] = useState("report");
  // Iframe yang pernah dibuka tetap dipasang (cuma disembunyikan) supaya
  // pekerjaan yang belum selesai di satu halaman tidak hilang saat pindah.
  const [opened, setOpened] = useState(["report"]);
  const open = (id) => {
    setPage(id);
    setOpened((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {PAGES.map((p) => {
          const on = p.id === page;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => open(p.id)}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                border: `1px solid ${on ? t.green : t.line}`,
                background: on ? t.greenBg : t.surface,
                color: on ? t.green : t.mid,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${t.line}`,
          background: t.surface,
          boxShadow: t.shadowSm,
          overflow: "hidden",
          height: "calc(100vh - 262px)",
          minHeight: 560,
        }}
      >
        {PAGES.filter((p) => opened.includes(p.id)).map((p) => (
          <iframe
            key={p.id}
            title={p.label}
            src={p.src}
            style={{ width: "100%", height: "100%", border: 0, display: p.id === page ? "block" : "none", background: "#fff" }}
          />
        ))}
      </div>
    </div>
  );
}
