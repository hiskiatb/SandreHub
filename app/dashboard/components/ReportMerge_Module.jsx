"use client";
import { useEffect, useRef, useState } from "react";
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
 * Alur "Partner SDP" dan "Partner MDI" (port dari Smart Mail Sumatera)
 * ada di halaman terpisah public/report-merge/sdp.html dan mdi.html. Tombol alurnya
 * tetap satu deret di topbar masing-masing halaman; perpindahan halaman
 * dikirim lewat postMessage { rmOpen: 'report' | 'sdp' | 'mdi', mode } dan
 * ditangani di sini. Iframe yang pernah dibuka tetap terpasang (cuma
 * disembunyikan) supaya pekerjaan yang belum selesai tidak hilang.
 *
 * Akses ke menu ini sudah digating di dashboard/page.jsx
 * (canReportMerge = isSPM || isIOHAny) DAN di-enforce ulang di server
 * lewat lib/reportMerge/auth.js pada setiap endpoint /api/report-merge/*
 * — jadi walau file HTML-nya sendiri statis (bisa dibuka lewat URL
 * langsung), semua data tetap ditolak di server untuk role yang tidak
 * diizinkan.
 */
const PAGES = [
  { id: "report", title: "Report Merge", src: "/report-merge/index.html" },
  { id: "sdp", title: "Partner SDP", src: "/report-merge/sdp.html" },
  { id: "mdi", title: "Partner MDI", src: "/report-merge/mdi.html" },
];

function syncTheme(frame) {
  // Tema disimpan bersama di localStorage 'rm-theme'; halaman yang sedang
  // disembunyikan belum tentu tahu kalau tema diganti di halaman lain.
  try {
    const theme = localStorage.getItem("rm-theme") || "dark";
    const doc = frame && frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    doc.documentElement.setAttribute("data-theme", theme);
    const icon = doc.getElementById("themeToggle");
    if (icon) icon.textContent = theme === "dark" ? "🌙" : "☀️";
  } catch (e) { /* iframe belum siap, biarkan */ }
}

export default function ReportMerge_Module({ t }) {
  const [page, setPage] = useState("report");
  const [opened, setOpened] = useState(["report"]);
  const frames = useRef({});

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || !e.data || !e.data.rmOpen) return;
      const id = PAGES.some((p) => p.id === e.data.rmOpen) ? e.data.rmOpen : "report";
      setOpened((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setPage(id);
      const frame = frames.current[id];
      syncTheme(frame);
      if (id === "report" && e.data.mode) {
        try { frame.contentWindow.switchAppMode(e.data.mode); } catch (err) { /* abaikan */ }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${t.line}`,
        background: t.surface,
        boxShadow: t.shadowSm,
        overflow: "hidden",
        height: "calc(100vh - 220px)",
        minHeight: 560,
      }}
    >
      {PAGES.filter((p) => opened.includes(p.id)).map((p) => (
        <iframe
          key={p.id}
          ref={(el) => { frames.current[p.id] = el; }}
          title={p.title}
          src={p.src}
          style={{ width: "100%", height: "100%", border: 0, display: p.id === page ? "block" : "none", background: "#fff" }}
        />
      ))}
    </div>
  );
}
