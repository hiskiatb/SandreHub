"use client";
/**
 * /marta/photobooth/p/[photoCode] — halaman detail 1 foto, dibuka saat tamu
 * scan QR per-foto di layar Viewer. Tampilkan foto + ID-nya secara jelas,
 * dan 3 aksi: Share (Web Share API, fallback copy link), Download (langsung
 * unduh file), Print (buka /marta/photobooth/print/[photoCode] di tab baru,
 * reuse halaman print yang sudah ada supaya logic auto-print tidak dobel).
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, Download, Loader2, Printer, Share2 } from "lucide-react";
import { getRpvPhotoByCode } from "../../../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";

export default function RpvPhotoDetailPage() {
  const params = useParams();
  const photoCode = (params?.photoCode || "").toString();
  const [state, setState] = useState("loading");
  const [photo, setPhoto] = useState(null);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getRpvPhotoByCode(photoCode);
        if (!p) { setState("notfound"); return; }
        setPhoto(p);
        setState("ready");
      } catch { setState("notfound"); }
    })();
  }, [photoCode]);

  // FIX (permintaan user): supaya "kalau pilih Instagram Story bisa langsung
  // post story" - share HARUS mengirim FILE gambarnya sendiri, bukan cuma
  // URL. Web Share API Level 1 (url saja) TIDAK bisa dipakai IG utk story -
  // Instagram/aplikasi lain di share sheet OS cuma menerima gambar kalau
  // kita share via `files:[...]` (Web Share API Level 2, `canShare({files})`).
  // Alurnya: fetch byte foto -> bungkus jadi File -> cek browser support
  // share file -> share file (+title/text) supaya OS munculkan semua app yg
  // bisa terima gambar (termasuk opsi "Add to Story" Instagram). Fallback
  // berjenjang: share URL biasa -> copy link ke clipboard, utk browser lama/
  // desktop yg tidak support Web Share sama sekali.
  async function handleShare() {
    if (!photo || sharing) return;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    setSharing(true);
    try {
      const res = await fetch(photo.url);
      if (!res.ok) throw new Error("fetch-failed");
      const blob = await res.blob();
      const ext = (blob.type && blob.type.split("/")[1]) || "jpg";
      const file = new File([blob], `foto-${photo.photo_code}.${ext}`, { type: blob.type || "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Foto ${photo.photo_code}`, text: "Lihat fotoku dari Photobooth!" });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: `Foto ${photo.photo_code}`, url: shareUrl });
        return;
      }
      throw new Error("no-web-share");
    } catch {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShared(true);
        setTimeout(() => setShared(false), 1800);
      } catch {
        // diamkan saja kalau clipboard pun gagal (browser lama / no permission)
      }
    } finally {
      setSharing(false);
    }
  }

  function handlePrint() {
    if (!photo) return;
    window.open(`/marta/photobooth/print/${photo.photo_code}`, "_blank", "noopener,noreferrer");
  }

  if (state === "loading") {
    return (
      <div style={{ minHeight: "100svh", background: "#111116", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} />
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }
  if (state === "notfound") {
    return (
      <div style={{ minHeight: "100svh", background: "#111116", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT, gap: 10, color: "#F0F0F2" }}>
        <AlertTriangle size={28} color={RED} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>Foto tidak ditemukan.</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: "linear-gradient(180deg,#111116 0%,#1B1B20 100%)", fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 16px 34px" }}>
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: RED }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#B8B8C0", letterSpacing: "0.14em", textTransform: "uppercase" }}>FlashPrint</span>
        </div>

        <div style={{ width: "100%", borderRadius: 20, overflow: "hidden", background: "#000", boxShadow: "0 18px 44px rgba(0,0,0,0.45)" }}>
          <img src={photo.url} alt={`Foto ${photo.photo_code}`} style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: "60svh" }} />
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: "#1E1E24", border: "1px solid #2C2C33", borderRadius: 99, padding: "8px 16px" }}>
          <span style={{ fontSize: 11, color: "#8A8A93", fontWeight: 600, letterSpacing: "0.04em" }}>ID FOTO</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "monospace", letterSpacing: "0.08em" }}>{photo.photo_code}</span>
        </div>

        <div style={{ marginTop: 22, width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <button onClick={handleShare} disabled={sharing}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", borderRadius: 14, border: "1px solid #2C2C33", background: "#1E1E24", color: "#F0F0F2", cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.6 : 1 }}>
            {sharing ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : shared ? <Check size={18} color="#3DDC84" /> : <Share2 size={18} />}
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>{sharing ? "Menyiapkan…" : shared ? "Tersalin" : "Share"}</span>
          </button>
          <a href={photo.url} download={`foto-${photo.photo_code}.jpg`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", borderRadius: 14, border: "1px solid #2C2C33", background: "#1E1E24", color: "#F0F0F2", textDecoration: "none", cursor: "pointer" }}>
            <Download size={18} />
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>Download</span>
          </a>
          <button onClick={handlePrint}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", borderRadius: 14, border: "1px solid #2C2C33", background: "#1E1E24", color: "#F0F0F2", cursor: "pointer" }}>
            <Printer size={18} />
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>Print</span>
          </button>
        </div>

        <a href={photo.url} download={`foto-${photo.photo_code}.jpg`}
          style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 48, borderRadius: 14, background: RED, color: "#fff", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
          <Download size={16} /> Download Foto Ini
        </a>
      </div>
    </div>
  );
}
