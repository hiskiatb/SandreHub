"use client";
/**
 * CollageSuggestionCard - kartu saran "gabungkan jadi kolase?" yang muncul
 * begitu ada TEPAT 9 foto dokumentasi (persis jumlah slot kolase 3x3 yang
 * paling padat, lihat COLLAGE_LAYOUTS/PhotoCollageSheet) - baik saat masih
 * memilih foto di form Isi Laporan Actual (blm submit) MAUPUN saat melihat
 * detail activity yang sudah tersubmit (foto2 sudah ada di server).
 *
 * SENGAJA cuma SARAN, bukan paksaan: py tombol "Gabungkan" & "Nanti Saja",
 * dan bisa di-DISMISS dgn geser (swipe) kartu ke kiri/kanan sama seperti
 * notifikasi native - pakai `motion/react` yg sudah jadi dependency project
 * ini (dipakai di app/martahub/page.jsx), bukan nambah lib gesture baru.
 *
 * Komponen ini TIDAK tahu cara mengambil/menyimpan foto - pemanggil yang
 * sediakan `getBlobs()` (Blob[] yg akan digabung, urutan = urutan tampil)
 * dan `onAccept(collageBlob, previewUrl)` (apa yg terjadi setelah kolase
 * jadi, beda2 di submit/page.jsx [ganti state lokal] vs activities/[id]/
 * page.jsx [upload ke server, hapus 9 dokumen lama]) - supaya satu
 * komponen ini dipakai ulang di kedua konteks tanpa duplikasi UI/gesture.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LayoutGrid, X, Loader2, Sparkles } from "lucide-react";
import { FF } from "./MobileShell";
import { composeCollage } from "./imageTools";

export default function CollageSuggestionCard({ previewUrls, getBlobs, onAccept, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);
  const [composing, setComposing] = useState(false);
  const [err, setErr] = useState("");

  if (dismissed) return null;

  async function handleAccept() {
    setComposing(true); setErr("");
    try {
      const blobs = await getBlobs();
      const blob = await composeCollage(blobs, 9, { orientation: "landscape" });
      const previewUrl = URL.createObjectURL(blob);
      await onAccept(blob, previewUrl);
      setDismissed(true);
    } catch (e) {
      setErr(e?.message || "Gagal membuat kolase - foto asli tetap aman, tidak ada yg berubah.");
    } finally {
      setComposing(false);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <AnimatePresence>
      <motion.div
        key="collage-suggestion"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.75}
        onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 90) handleDismiss(); }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.18 }}
        style={{
          position: "relative", marginBottom: 12, borderRadius: 14, padding: "12px 14px",
          background: "linear-gradient(135deg, rgba(237,28,36,0.06), rgba(198,22,141,0.06))",
          border: "1px solid rgba(237,28,36,0.18)", cursor: "grab", touchAction: "pan-y",
        }}>
        <button onClick={handleDismiss} aria-label="Tutup saran"
          style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8A96" }}>
          <X size={12} />
        </button>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <LayoutGrid size={16} color="#ED1C24" />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", fontFamily: FF, display: "flex", alignItems: "center", gap: 5 }}>
              <Sparkles size={12} color="#C6168D" /> Gabungkan jadi 1 kolase?
            </div>
            <div style={{ fontSize: 11.5, color: "#6B6B76", fontFamily: FF, marginTop: 2, lineHeight: 1.4 }}>
              Ada 9 foto terpisah - bisa digabung otomatis jadi satu foto kolase 3×3 biar lebih rapi.
            </div>
            {previewUrls?.length === 9 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, width: 60, marginTop: 8, borderRadius: 6, overflow: "hidden" }}>
                {previewUrls.slice(0, 9).map((u, i) => (
                  <div key={i} style={{ aspectRatio: "1", background: `url(${u}) center/cover`, backgroundColor: "#E3E4E8" }} />
                ))}
              </div>
            )}
            {err && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 6 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={handleAccept} disabled={composing}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, border: "none", background: "#ED1C24", color: "#fff", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: composing ? "default" : "pointer", opacity: composing ? 0.75 : 1 }}>
                {composing ? <Loader2 size={12} style={{ animation: "mh-collage-spin .8s linear infinite" }} /> : <LayoutGrid size={12} />}
                {composing ? "Menggabungkan…" : "Gabungkan"}
              </button>
              <button onClick={handleDismiss} disabled={composing}
                style={{ padding: "7px 12px", borderRadius: 999, border: "1px solid #E3E4E8", background: "#fff", color: "#6B6B76", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                Nanti Saja
              </button>
            </div>
          </div>
        </div>
        <style>{"@keyframes mh-collage-spin { to { transform: rotate(360deg); } }"}</style>
      </motion.div>
    </AnimatePresence>
  );
}
