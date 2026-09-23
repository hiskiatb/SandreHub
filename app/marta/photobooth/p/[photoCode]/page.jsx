"use client";
/**
 * /marta/photobooth/p/[photoCode] — halaman detail 1 foto, dibuka saat tamu
 * scan QR per-foto di layar Viewer. Tampilkan foto + ID-nya secara jelas,
 * dan 3 aksi: Share (Web Share API, fallback copy link), Download (langsung
 * unduh file), Print (buka /marta/photobooth/print/[photoCode] di tab baru,
 * reuse halaman print yang sudah ada supaya logic auto-print tidak dobel).
 *
 * UPDATE (permintaan user - "saat qr utk share itu ada muncul foto dengan
 * template yg sudah kita set default utk dibagikan ke social media, pastikan
 * sync langsung dgn template operator sehingga sama dgn hasil print & yg
 * muncul di viewer"): foto TIDAK lagi ditampilkan mentah (<img src=photo.url>)
 * - sekarang dirender lewat <PhotoFrame> yg SAMA PERSIS dipakai operator
 * panel & TV Viewer (import dari ../../_frame), dgn crop/zoom/pan tersimpan
 * milik foto ini + TEMPLATE DEFAULT (is_default) yg lagi aktif - WYSIWYG
 * penuh dgn hasil cetak & tampilan TV. Krn Web Share/Download butuh FILE
 * gambar datar (bukan DOM hidup), hasil <PhotoFrame> di-rasterisasi ke PNG
 * pakai html2canvas sebelum di-share/download, supaya file yg dibagikan ke
 * medsos/di-download beneran sudah termasuk bingkai template-nya.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { AlertTriangle, Check, Download, Loader2, Printer, QrCode as QrIcon, Share2 } from "lucide-react";
import { getRpvPhotoByCode, listRpvFrameTemplates, listRpvCustomFonts } from "../../../../../lib/rpv";
import { PhotoFrame, PRINT_SIZE, TEMPLATE_GOOGLE_FONTS_HREF, customFontFaceCss, findDefaultFrameTemplate } from "../../_frame";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const SHARE_RATIO = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };

export default function RpvPhotoDetailPage() {
  const params = useParams();
  const photoCode = (params?.photoCode || "").toString();
  const [state, setState] = useState("loading");
  const [photo, setPhoto] = useState(null);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pageQrUrl, setPageQrUrl] = useState(""); // QR ke HALAMAN INI SENDIRI - supaya bisa diteruskan/discan lagi oleh org lain
  const [frameTemplates, setFrameTemplates] = useState([]);
  const [customFonts, setCustomFonts] = useState([]);
  const frameRef = useRef(null); // wrapper <PhotoFrame> - dirasterisasi ke PNG saat Share/Download
  const defaultTemplate = useMemo(() => findDefaultFrameTemplate(frameTemplates), [frameTemplates]);

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

  // Template default + font kustom - persis pola yg sama dgn TV Viewer, spy
  // hasil di halaman ini otomatis ikut template default operator tanpa perlu
  // pilihan manual apa pun di sini.
  useEffect(() => {
    Promise.resolve().then(async () => {
      try { setFrameTemplates(await listRpvFrameTemplates()); } catch { /* diamkan */ }
      try { setCustomFonts(await listRpvCustomFonts()); } catch { /* diamkan */ }
    });
  }, []);

  // QR ke URL halaman ini sendiri - jadi tamu yg lagi lihat halaman ini bisa
  // tunjukkan QR-nya ke org lain, org itu scan & langsung sampai ke halaman
  // yg SAMA persis (lihat foto, Photo ID, QR lagi, & download).
  useEffect(() => {
    if (state !== "ready" || typeof window === "undefined") return;
    let alive = true;
    QRCode.toDataURL(window.location.href, { margin: 1, width: 220, color: { dark: "#111116", light: "#FFFFFF" } })
      .then((url) => { if (alive) setPageQrUrl(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [state]);

  // Rasterisasi <PhotoFrame> (foto + crop + template default) jadi 1 file
  // PNG datar - dipakai bareng oleh Share & Download supaya keduanya SELALU
  // ikut menyertakan bingkai template, bukan cuma foto polos.
  async function renderFramedBlob() {
    if (!frameRef.current) return null;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(frameRef.current, {
      backgroundColor: "#ffffff",
      useCORS: true,
      scale: Math.min(3, (typeof window !== "undefined" ? window.devicePixelRatio : 1) * 2 || 2),
    });
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
  }

  // FIX (permintaan user): supaya "kalau pilih Instagram Story bisa langsung
  // post story" - share HARUS mengirim FILE gambarnya sendiri, bukan cuma
  // URL. Web Share API Level 1 (url saja) TIDAK bisa dipakai IG utk story -
  // Instagram/aplikasi lain di share sheet OS cuma menerima gambar kalau
  // kita share via `files:[...]` (Web Share API Level 2, `canShare({files})`).
  // Sekarang file yg dibagikan adalah HASIL RASTER <PhotoFrame> (sudah
  // termasuk template default), bukan lagi foto mentah dari storage.
  async function handleShare() {
    if (!photo || sharing) return;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    setSharing(true);
    try {
      const blob = await renderFramedBlob();
      if (!blob) throw new Error("render-failed");
      const file = new File([blob], `foto-${photo.photo_code}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Foto ${photo.photo_code}`, text: "Lihat fotoku dari FlashPrint!" });
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

  const [downloading, setDownloading] = useState(false);
  async function handleDownload() {
    if (!photo || downloading) return;
    setDownloading(true);
    try {
      const blob = await renderFramedBlob();
      if (!blob) throw new Error("render-failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foto-${photo.photo_code}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      // fallback: kalau rasterisasi gagal (mis. gambar CORS blocked), tetap
      // kasih file foto aslinya spy tombol download tidak mati total.
      window.open(photo.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  function handlePrint() {
    if (!photo) return;
    window.open(`/marta/photobooth/print/${photo.photo_code}`, "_blank", "noopener,noreferrer");
  }

  if (state === "loading") {
    return (
      <div className="flashprint-root" style={{ minHeight: "100svh", background: "#111116", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} />
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }
  if (state === "notfound") {
    return (
      <div className="flashprint-root" style={{ minHeight: "100svh", background: "#111116", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT, gap: 10, color: "#F0F0F2" }}>
        <AlertTriangle size={28} color={RED} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>Foto tidak ditemukan.</div>
      </div>
    );
  }

  return (
    <div className="flashprint-root" style={{ minHeight: "100svh", background: "linear-gradient(180deg,#111116 0%,#1B1B20 100%)", fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 16px 34px" }}>
      <link rel="stylesheet" href={TEMPLATE_GOOGLE_FONTS_HREF} />
      {customFonts.length > 0 && <style>{customFontFaceCss(customFonts)}</style>}
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: RED }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#B8B8C0", letterSpacing: "0.14em", textTransform: "uppercase" }}>FlashPrint</span>
        </div>

        <div style={{ width: "100%", maxWidth: 280, borderRadius: 20, overflow: "hidden", boxShadow: "0 18px 44px rgba(0,0,0,0.45)", aspectRatio: `${SHARE_RATIO.w} / ${SHARE_RATIO.h}` }}>
          <div ref={frameRef} style={{ width: "100%", height: "100%" }}>
            <PhotoFrame photo={photo} ratio={SHARE_RATIO} crop={photo.crop} mode="screen"
              frame={defaultTemplate ? "custom" : "none"} customBaseStyle={defaultTemplate?.baseStyle}
              customElements={defaultTemplate?.elements} customFonts={customFonts} queueLabel={photo.queue_label} />
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: "#1E1E24", border: "1px solid #2C2C33", borderRadius: 99, padding: "8px 16px" }}>
          <span style={{ fontSize: 11, color: "#8A8A93", fontWeight: 600, letterSpacing: "0.04em" }}>ID FOTO</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "monospace", letterSpacing: "0.08em" }}>{photo.queue_label || photo.photo_code}</span>
        </div>

        {/* QR ke halaman ini sendiri - biar tamu bisa terusin/tunjukkan ke
            org lain, discan lagi & sampai ke halaman yg sama (foto + ID +
            QR + download) - bukan cuma jalur 1 arah dr layar Viewer/upload. */}
        <div style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", gap: 12, background: "#1E1E24", border: "1px solid #2C2C33", borderRadius: 16, padding: "12px 14px" }}>
          {pageQrUrl ? (
            <img src={pageQrUrl} alt="QR halaman ini" style={{ width: 64, height: 64, borderRadius: 8, flexShrink: 0, background: "#fff", padding: 4 }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 8, flexShrink: 0, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={16} color="#B4B4BC" style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#F0F0F2", display: "flex", alignItems: "center", gap: 6 }}>
              <QrIcon size={12} color={RED} /> Scan untuk buka halaman ini
            </div>
            <div style={{ marginTop: 3, fontSize: 10.5, color: "#8A8A93", lineHeight: 1.5 }}>
              Tunjukkan QR ini ke orang lain supaya mereka juga bisa lihat &amp; unduh foto ini.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22, width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <button onClick={handleShare} disabled={sharing}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", borderRadius: 14, border: "1px solid #2C2C33", background: "#1E1E24", color: "#F0F0F2", cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.6 : 1 }}>
            {sharing ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : shared ? <Check size={18} color="#3DDC84" /> : <Share2 size={18} />}
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>{sharing ? "Menyiapkan…" : shared ? "Tersalin" : "Share"}</span>
          </button>
          <button onClick={handleDownload} disabled={downloading}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", borderRadius: 14, border: "1px solid #2C2C33", background: "#1E1E24", color: "#F0F0F2", cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.6 : 1 }}>
            {downloading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={18} />}
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>{downloading ? "Menyiapkan…" : "Download"}</span>
          </button>
          <button onClick={handlePrint}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", borderRadius: 14, border: "1px solid #2C2C33", background: "#1E1E24", color: "#F0F0F2", cursor: "pointer" }}>
            <Printer size={18} />
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>Print</span>
          </button>
        </div>

        <button onClick={handleDownload} disabled={downloading}
          style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 48, borderRadius: 14, border: "none", background: RED, color: "#fff", fontWeight: 800, fontSize: 14, cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.7 : 1 }}>
          {downloading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={16} />}
          {downloading ? "Menyiapkan…" : "Download Foto Ini"}
        </button>
      </div>
    </div>
  );
}
