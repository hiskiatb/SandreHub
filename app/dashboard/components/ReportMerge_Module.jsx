"use client";
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
export default function ReportMerge_Module({ t }) {
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
      <iframe
        title="Report Merge"
        src="/report-merge/index.html"
        style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#fff" }}
      />
    </div>
  );
}
