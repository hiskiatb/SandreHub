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
 *      memverifikasi role & menolak Admin Partner (MDI).
 * Lihat public/report-merge/index.html untuk isi shim-nya.
 *
 * Saat menu dibuka, yang tampil pertama adalah public/report-merge/home.html
 * (kartu pilih menu). Alur "Partner SDP" dan "Partner MDI" (port dari Smart Mail Sumatera)
 * ada di halaman terpisah public/report-merge/sdp.html dan mdi.html. Tombol alurnya
 * tetap satu deret di topbar masing-masing halaman; perpindahan halaman
 * dikirim lewat postMessage { rmOpen: 'home' | 'report' | 'sdp' | 'mdi', mode } dan
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
  { id: "home", title: "Report Merge — pilih menu", src: "/report-merge/home.html" },
  { id: "report", title: "Report Merge", src: "/report-merge/index.html" },
  { id: "sdp", title: "Partner SDP", src: "/report-merge/sdp.html" },
  { id: "mdi", title: "Partner MDI", src: "/report-merge/mdi.html" },
  // Performance Report = Blast Email Report (index.html) + perf-report.js, iframe terpisah.
  { id: "performance", title: "Performance Report", src: "/report-merge/index.html?flow=performance" },
];

function syncTheme(frame) {
  // Tema disimpan bersama di localStorage 'rm-theme'; halaman yang sedang
  // disembunyikan belum tentu tahu kalau tema diganti di halaman lain.
  try {
    const theme = localStorage.getItem("rm-theme") || "dark";
    // Halaman Partner SDP/MDI (sdp.html, mdi.html) membaca tema dari shim-nya sendiri.
    if (frame && frame.contentWindow && frame.contentWindow.__smTerapkanTema) frame.contentWindow.__smTerapkanTema(theme);
    const doc = frame && frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    doc.documentElement.setAttribute("data-theme", theme);
    const icon = doc.getElementById("themeToggle");
    if (icon) icon.textContent = theme === "dark" ? "🌙" : "☀️";
  } catch (e) { /* iframe belum siap, biarkan */ }
}

// Tema dashboard SandraHub (gelap/terang) disalin ke halaman Report Merge.
// `t` dari dashboard: appBg #0D0D0E = gelap.
const temaDari = (t) => (t && t.appBg === "#0D0D0E" ? "dark" : "light");

export default function ReportMerge_Module({ t }) {
  // Selalu mulai dari halaman pilih menu (Blast Email Report / Partner SDP / Partner MDI).
  const [page, setPage] = useState("home");
  const [opened, setOpened] = useState(["home"]);
  const [penuh, setPenuh] = useState(false);
  const frames = useRef({});
  const wadah = useRef(null);
  const tema = temaDari(t);

  // Ikuti tema dashboard: simpan ke 'rm-theme' (dibaca semua halaman Report Merge) lalu terapkan ke iframe yang terbuka.
  useEffect(() => {
    try { localStorage.setItem("rm-theme", tema); } catch (e) { /* abaikan */ }
    Object.values(frames.current).forEach((f) => syncTheme(f));
  }, [tema]);

  // Tombol "Layar penuh": area Report Merge memenuhi seluruh layar (Esc untuk keluar).
  useEffect(() => {
    const onFs = () => setPenuh(document.fullscreenElement === wadah.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleLayarPenuh = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (wadah.current && wadah.current.requestFullscreen) wadah.current.requestFullscreen().catch(() => {});
  };

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
      ref={wadah}
      style={{
        position: "relative",
        borderRadius: penuh ? 0 : 12,
        border: penuh ? 0 : `1px solid ${t.line}`,
        background: t.appBg,
        boxShadow: penuh ? "none" : t.shadowSm,
        overflow: "hidden",
        height: penuh ? "100vh" : "calc(100vh - 220px)",
        minHeight: 560,
      }}
    >
      <button
        type="button"
        onClick={toggleLayarPenuh}
        title={penuh ? "Keluar dari layar penuh (Esc)" : "Tampilkan Report Merge layar penuh"}
        style={{
          position: "absolute", right: 12, bottom: 12, zIndex: 5,
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 12px", borderRadius: 8, cursor: "pointer",
          fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
          color: t.hi, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.shadowMd,
        }}
      >
        {penuh ? "⤡ Keluar layar penuh" : "⛶ Layar penuh"}
      </button>
      {PAGES.filter((p) => opened.includes(p.id)).map((p) => (
        <iframe
          key={p.id}
          ref={(el) => { frames.current[p.id] = el; }}
          title={p.title}
          src={p.src}
          onLoad={(e) => syncTheme(e.currentTarget)}
          style={{ width: "100%", height: "100%", border: 0, display: p.id === page ? "block" : "none", background: t.appBg }}
        />
      ))}
    </div>
  );
}
