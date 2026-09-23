"use client";
/**
 * /marta/photobooth/p/[photoCode] — halaman detail 1 foto, dibuka saat tamu
 * scan QR per-foto di layar Viewer. Tampilkan foto (WYSIWYG dgn template
 * default operator) + 2 QR TERPISAH (Cetak & Share), dan 2 aksi: Share
 * (Web Share API, fallback copy link) & Download.
 *
 * UPDATE 1 (template default sync - lihat _frame.jsx): foto dirender lewat
 * <PhotoFrame> yg SAMA PERSIS dipakai operator panel & TV Viewer, dgn
 * crop/zoom/pan tersimpan milik foto ini + TEMPLATE DEFAULT (is_default)
 * yg lagi aktif.
 *
 * UPDATE 2 (permintaan user - "hasil foto yg didownload stretch & jangan
 * ada kompresi sama sekali, & di laman ini masih ada ID mentah 5GMDN...,
 * seharusnya 2 QR terpisah aja (QR cetak & QR share), hilangkan tombol
 * Print"):
 * 1) Share/Download SEBELUMNYA pakai html2canvas menangkap <div> hasil
 *    render di layar (kecil, & html2canvas kadang salah hitung aspect-ratio
 *    CSS -> hasil stretch) - SEKARANG diganti `renderPhotoFrameToBlob`
 *    (lihat _frame.jsx), yg gambar ulang foto ASLI + crop + template
 *    LANGSUNG di <canvas> beresolusi penuh (bukan capture DOM), export PNG
 *    (lossless, TANPA kompresi kualitas apa pun).
 * 2) Badge "ID FOTO 5GMDN-..." (kode mentah) DIHAPUS. Diganti 2 kartu QR
 *    terpisah: "QR Cetak" (QR angka Photo ID murni, dipindai operator di
 *    /marta/photobooth/scan/[code] utk keperluan cetak) & "QR Share"
 *    (link ke halaman ini sendiri, utk tamu lain lihat/unduh foto ini).
 * 3) Tombol Print DIHAPUS dari halaman tamu ini - cetak fisik HANYA lewat
 *    panel operator (Print Station).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { AlertTriangle, Check, Download, Loader2, Printer, Share2 } from "lucide-react";
import { getRpvPhotoByCode, listRpvFrameTemplates, listRpvCustomFonts } from "../../../../../lib/rpv";
import { PhotoFrame, PRINT_SIZE, TEMPLATE_GOOGLE_FONTS_HREF, customFontFaceCss, findDefaultFrameTemplate, renderPhotoFrameToBlob } from "../../_frame";

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
  const [printQrUrl, setPrintQrUrl] = useState(""); // QR ANGKA Photo ID murni - dipindai OPERATOR di /scan/[code] utk cetak
  const [frameTemplates, setFrameTemplates] = useState([]);
  const [customFonts, setCustomFonts] = useState([]);
  const defaultTemplate = useMemo(() => findDefaultFrameTemplate(frameTemplates), [frameTemplates]);

  // FIX (permintaan user - "kenapa Photo ID tidak langsung muncul, harus
  // refresh dulu"): tepat setelah upload, row rpv_photos yg baru saja
  // di-insert/reserve queue_no-nya kadang belum sepenuhnya "terlihat" oleh
  // request GET berikutnya (replica/connection lag di sisi Supabase) - jadi
  // queue_label bisa balik null/kosong sesaat. Solusi: retry singkat
  // (polling) kalau queue_label masih kosong, sebelum nampilin apa adanya.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let p = await getRpvPhotoByCode(photoCode);
        if (!p) { if (alive) setState("notfound"); return; }
        let tries = 0;
        while (alive && !p.queue_label && tries < 4) {
          await new Promise((r) => setTimeout(r, 500));
          tries += 1;
          try {
            const fresh = await getRpvPhotoByCode(photoCode);
            if (fresh) p = fresh;
          } catch { /* diamkan, pakai data terakhir yg berhasil */ }
        }
        if (!alive) return;
        setPhoto(p);
        setState("ready");
      } catch { if (alive) setState("notfound"); }
    })();
    return () => { alive = false; };
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

  // QR Cetak - angka Photo ID murni, sama persis pola QR yg dibuat begitu
  // tamu selesai upload. (QR Share dihapus - permintaan user: halaman ini
  // dipakai panitia utk ditunjukkan ke tamu utk discan operator saat cetak,
  // jadi cukup 1 QR Photo ID saja, tidak perlu QR balik ke halaman ini.)
  useEffect(() => {
    if (state !== "ready" || typeof window === "undefined" || !photo) return;
    let alive = true;
    const idText = (photo.queue_label || photo.photo_code || "").toString();
    QRCode.toDataURL(idText, { margin: 1, width: 220, color: { dark: "#111116", light: "#FFFFFF" } })
      .then((url) => { if (alive) setPrintQrUrl(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [state, photo]);

  // Bikin 1 file PNG (foto + crop + template default), beresolusi PENUH &
  // TANPA kompresi - dipakai bareng oleh Share & Download.
  async function renderFramedBlob() {
    if (!photo) return null;
    return renderPhotoFrameToBlob({
      photo, ratio: SHARE_RATIO, crop: photo.crop,
      frame: defaultTemplate ? "custom" : "none",
      customBaseStyle: defaultTemplate?.baseStyle,
      customElements: defaultTemplate?.elements,
      customFonts, queueLabel: photo.queue_label,
    });
  }

  // FIX (permintaan user): supaya "kalau pilih Instagram Story bisa langsung
  // post story" - share HARUS mengirim FILE gambarnya sendiri, bukan cuma
  // URL. Web Share API Level 1 (url saja) TIDAK bisa dipakai IG utk story -
  // Instagram/aplikasi lain di share sheet OS cuma menerima gambar kalau
  // kita share via `files:[...]` (Web Share API Level 2, `canShare({files})`).
  async function handleShare() {
    if (!photo || sharing) return;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    setSharing(true);
    try {
      const blob = await renderFramedBlob();
      if (!blob) throw new Error("render-failed");
      const file = new File([blob], `foto-${photo.queue_label || photo.photo_code}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Foto ${photo.queue_label || photo.photo_code}`, text: "Lihat fotoku dari FlashPrint!" });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: `Foto ${photo.queue_label || photo.photo_code}`, url: shareUrl });
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
      a.download = `foto-${photo.queue_label || photo.photo_code}.png`;
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
          <PhotoFrame photo={photo} ratio={SHARE_RATIO} crop={photo.crop} mode="screen"
            frame={defaultTemplate ? "custom" : "none"} customBaseStyle={defaultTemplate?.baseStyle}
            customElements={defaultTemplate?.elements} customFonts={customFonts} queueLabel={photo.queue_label} />
        </div>

        {/* QR Cetak saja - permintaan user: halaman ini dipakai panitia utk
            ditunjukkan ke tamu/discan operator saat cetak, QR Share ke
            halaman ini sendiri tidak diperlukan lagi di sini. */}
        <div style={{ marginTop: 16, width: "100%", maxWidth: 220, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "#1E1E24", border: "1px solid #2C2C33", borderRadius: 16, padding: "18px 14px" }}>
          {printQrUrl ? (
            <img src={printQrUrl} alt="QR Photo ID untuk cetak" style={{ width: 140, height: 140, borderRadius: 8, background: "#fff", padding: 6 }} />
          ) : (
            <div style={{ width: 140, height: 140, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={18} color="#B4B4BC" style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: "#F0F0F2" }}>
            <Printer size={12} color={RED} /> QR Cetak
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "monospace", letterSpacing: "0.06em" }}>{photo.queue_label || photo.photo_code}</span>
          <span style={{ fontSize: 9.5, color: "#8A8A93", textAlign: "center", lineHeight: 1.4 }}>Tunjukkan ke petugas utk dicetak</span>
        </div>

        <div style={{ marginTop: 22, width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
