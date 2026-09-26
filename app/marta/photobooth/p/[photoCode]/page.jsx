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
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, Download, FlipHorizontal2, FlipVertical2, Minus, Move, RotateCw, Save, Share2, Loader2, ZoomIn } from "lucide-react";
import { getRpvPhotoByCode, listRpvFrameTemplates, listRpvCustomFonts, saveRpvPhotoCrop } from "../../../../../lib/rpv";
import { DEFAULT_CROP, PhotoFrame, PRINT_SIZE, TEMPLATE_GOOGLE_FONTS_HREF, customFontFaceCss, findDefaultFrameTemplate, renderPhotoFrameToBlob } from "../../_frame";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const SHARE_RATIO = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };

export default function RpvPhotoDetailPage() {
  const params = useParams();
  const photoCode = (params?.photoCode || "").toString();
  const [state, setState] = useState("loading");
  const [photo, setPhoto] = useState(null);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Penyesuaian posisi/zoom/rotate/flip LANGSUNG di halaman share ini
  // (permintaan user: "di sisi orang yang foto saat share dia juga bisa
  // atur penyesuaian ke dalam framenya sebelum mereka download") - simpan
  // lewat saveRpvPhotoCrop yg SAMA PERSIS dipakai operator/tamu pengupload,
  // jadi otomatis ke-sync ke Print Station operator juga (kolom
  // rpv_photos.crop_json yg sama).
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [savedCrop, setSavedCrop] = useState(DEFAULT_CROP);
  const [adjustMode, setAdjustMode] = useState(false);
  const [cropSaving, setCropSaving] = useState(false);
  const cropDirty = JSON.stringify(crop) !== JSON.stringify(savedCrop);
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const [frameTemplates, setFrameTemplates] = useState([]);
  const [customFonts, setCustomFonts] = useState([]);
  const defaultTemplate = useMemo(() => findDefaultFrameTemplate(frameTemplates), [frameTemplates]);

  // FIX (permintaan user - "kenapa Photo ID tidak langsung muncul, harus
  // refresh dulu, QR yg discan operator malah balik ID mentah 5GMDN...
  // padahal seharusnya 00007"): ROOT CAUSE ketemu di DB - RPC
  // `rpv_get_photo` (dipakai halaman ini) TIDAK PERNAH ikut select
  // queue_no/queue_label sama sekali (beda dgn rpv_list_photos yg sudah
  // benar), jadi photo.queue_label selalu undefined & fallback ke
  // photo_code mentah - BUKAN soal refresh/timing. Sudah diperbaiki lewat
  // migrasi SQL (rpv_get_photo sekarang ikut lpad(queue_no,5,'0') sbg
  // queue_label, sama persis rpv_list_photos). Retry singkat di bawah ini
  // dibiarkan sbg jaring pengaman kalau suatu saat memang ada race
  // insert/reserve queue_no yg genuinely belum commit.
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
        setCrop(p.crop || DEFAULT_CROP);
        setSavedCrop(p.crop || DEFAULT_CROP);
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

  // Bikin 1 file PNG (foto + crop + template default), beresolusi PENUH &
  // TANPA kompresi - dipakai bareng oleh Share & Download.
  async function renderFramedBlob() {
    if (!photo) return null;
    return renderPhotoFrameToBlob({
      photo, ratio: SHARE_RATIO, crop,
      frame: defaultTemplate ? "custom" : "none",
      customBaseStyle: defaultTemplate?.baseStyle,
      customElements: defaultTemplate?.elements,
      customFonts, queueLabel: photo.queue_label,
    });
  }

  const onCropPointerDown = (e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: crop.panX, startPanY: crop.panY, dragging: true };
    const move = (ev) => {
      if (!dragRef.current?.dragging || !imgRef.current) return;
      const w = imgRef.current.offsetWidth || 1;
      const h = imgRef.current.offsetHeight || 1;
      const dx = ((ev.clientX - dragRef.current.startX) / w) * 100;
      const dy = ((ev.clientY - dragRef.current.startY) / h) * 100;
      setCrop((c) => ({ ...c, panX: dragRef.current.startPanX + dx / c.zoom, panY: dragRef.current.startPanY + dy / c.zoom }));
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const zoomBy = (delta) => setCrop((c) => ({ ...c, zoom: Math.max(1, Math.min(4, +(c.zoom + delta).toFixed(2))) }));
  const rotateBy = (deg) => setCrop((c) => ({ ...c, rotate: (c.rotate + deg + 360) % 360 }));
  const toggleFlipX = () => setCrop((c) => ({ ...c, flipX: !c.flipX }));
  const toggleFlipY = () => setCrop((c) => ({ ...c, flipY: !c.flipY }));

  // Tombol tunggal "Kembali" - kalau ada perubahan blm tersimpan, otomatis
  // jadi "Simpan & Kembali" (simpan dulu ke DB, baru keluar mode adjust).
  async function handleBackFromAdjust() {
    if (!cropDirty) { setAdjustMode(false); return; }
    setCropSaving(true);
    try {
      await saveRpvPhotoCrop(photo.photo_code, crop);
      setSavedCrop(crop);
      setPhoto((p) => (p ? { ...p, crop } : p));
    } catch { /* gagal simpan - tamu masih bisa buka lagi & coba ulang */ }
    finally {
      setCropSaving(false);
      setAdjustMode(false);
    }
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

  // FIX (permintaan user - "highlight nomor antriannya, dan buat responsive
  // jangan sampai dia bisa discroll"): sblmnya root cuma minHeight:"100svh" +
  // padding tetap, jadi begitu total konten (foto + kartu QR + 2 baris
  // tombol) lebih tinggi dari layar HP, halaman jadi bisa discroll (spt
  // screenshot user). Sekarang root diubah height:"100svh" (BUKAN minHeight)
  // + overflowY:"auto" (fallback aman), dibungkus flex column dgn SATU
  // bagian fleksibel (foto, pakai flex+minHeight:0+maxHeight cair via vh -
  // BUKAN aspectRatio kaku spt sblmnya) yg otomatis menyusut ngikutin sisa
  // tinggi layar sungguhan, sisanya (QR/tombol) flexShrink:0 & padding
  // dirampingkan - jadi semuanya selalu utuh kelihatan tanpa perlu scroll,
  // di tinggi layar berapa pun.
  return (
    <div className="flashprint-root" style={{ height: "100svh", overflowY: "auto", background: "linear-gradient(180deg,#111116 0%,#1B1B20 100%)", fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 16px 16px", boxSizing: "border-box" }}>
      <link rel="stylesheet" href={TEMPLATE_GOOGLE_FONTS_HREF} />
      {customFonts.length > 0 && <style>{customFontFaceCss(customFonts)}</style>}
      <div style={{ width: "100%", maxWidth: 420, minHeight: 0, flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: RED }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#B8B8C0", letterSpacing: "0.14em", textTransform: "uppercase" }}>FlashPrint</span>
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, width: "auto", maxWidth: 280, maxHeight: "100%", aspectRatio: `${SHARE_RATIO.w} / ${SHARE_RATIO.h}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 18px 44px rgba(0,0,0,0.45)" }}>
          <PhotoFrame photo={photo} ratio={SHARE_RATIO} crop={crop} mode="screen"
            frame={defaultTemplate ? "custom" : "none"} customBaseStyle={defaultTemplate?.baseStyle}
            customElements={defaultTemplate?.elements} customFonts={customFonts} queueLabel={photo.queue_label}
            imgRef={imgRef} onPointerDown={adjustMode ? onCropPointerDown : undefined} />
        </div>

        {/* Kontrol penyesuaian - permintaan user: "di sisi orang yang foto
            saat share dia juga bisa atur penyesuaian ke dalam framenya
            sebelum mereka download". Sembunyi dulu di balik 1 tombol kecil
            (bukan langsung tampil) spy tampilan default tetap ringkas. */}
        {!adjustMode ? (
          <button onClick={() => setAdjustMode(true)}
            style={{ flexShrink: 0, marginTop: 10, display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 100, border: "1px solid #2C2C33", background: "#1E1E24", color: "#F0F0F2", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            <Move size={13} color={MAGA} /> Sesuaikan Posisi
          </button>
        ) : (
          <div style={{ flexShrink: 0, marginTop: 10, width: "100%", maxWidth: 260, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "#1E1E24", border: "1px solid #2C2C33", borderRadius: 16, padding: "12px 14px" }}>
            <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <button onClick={() => zoomBy(-0.15)} title="Perkecil"
                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #2C2C33", background: "#111116", color: "#B4B4BC", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <Minus size={12} />
              </button>
              <input type="range" min="1" max="4" step="0.01" value={crop.zoom} onChange={(e) => setCrop((c) => ({ ...c, zoom: +Number(e.target.value).toFixed(2) }))}
                style={{ flex: 1, maxWidth: 120, accentColor: MAGA }} />
              <span style={{ fontSize: 10.5, color: "#B4B4BC", fontWeight: 700, width: 34, textAlign: "center", flexShrink: 0 }}>{Math.round(crop.zoom * 100)}%</span>
              <button onClick={() => zoomBy(0.15)} title="Perbesar"
                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #2C2C33", background: "#111116", color: "#B4B4BC", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <ZoomIn size={12} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => rotateBy(90)} title="Putar 90°"
                style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 9px", borderRadius: 8, border: "1px solid #2C2C33", background: "#111116", color: "#B4B4BC", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                <RotateCw size={11} /> {crop.rotate}°
              </button>
              <button onClick={toggleFlipX} title="Balik horizontal"
                style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 9px", borderRadius: 8, border: `1.5px solid ${crop.flipX ? MAGA : "#2C2C33"}`, background: crop.flipX ? `${MAGA}33` : "#111116", color: crop.flipX ? "#fff" : "#B4B4BC", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                <FlipHorizontal2 size={11} /> H
              </button>
              <button onClick={toggleFlipY} title="Balik vertikal"
                style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 9px", borderRadius: 8, border: `1.5px solid ${crop.flipY ? MAGA : "#2C2C33"}`, background: crop.flipY ? `${MAGA}33` : "#111116", color: crop.flipY ? "#fff" : "#B4B4BC", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                <FlipVertical2 size={11} /> V
              </button>
              <button onClick={() => setCrop(DEFAULT_CROP)} style={{ fontSize: 9.5, color: "#8A8A93", fontWeight: 700, background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}>Reset</button>
            </div>
            {/* Satu tombol - permintaan user: "ada tombol kembali, namun
                kalau ada perubahan simpan dan kembali". Kalau blm ada
                perubahan cukup keluar mode adjust; kalau ada, simpan dulu
                (saveRpvPhotoCrop - otomatis ke-sync ke Print Station
                operator) baru keluar. */}
            <button onClick={handleBackFromAdjust} disabled={cropSaving}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 32, borderRadius: 9, border: "none",
                background: cropDirty ? MAGA : "#2C2C33", color: "#fff", fontSize: 11, fontWeight: 800, cursor: cropSaving ? "default" : "pointer",
                fontFamily: FONT, opacity: cropSaving ? 0.7 : 1,
              }}>
              {cropSaving ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={12} />}
              {cropSaving ? "Menyimpan..." : cropDirty ? "Simpan & Kembali" : "Kembali"}
            </button>
          </div>
        )}

        {/* Photo ID - QR Cetak DIHAPUS (permintaan user: sudah tidak ada
            lagi fitur HP Scanner, jadi cukup sebutkan Photo ID ini lisan ke
            petugas operator, tidak perlu di-scan lagi). Nomor tetap
            di-HIGHLIGHT (badge merah-magenta kontras) spy gampang dibaca. */}
        <div style={{ flexShrink: 0, marginTop: 10, width: "100%", maxWidth: 220, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "#1E1E24", border: "1px solid #2C2C33", borderRadius: 16, padding: "12px 14px" }}>
          <span style={{
            fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: "monospace", letterSpacing: "0.08em",
            padding: "5px 16px", borderRadius: 10, background: `linear-gradient(135deg,${RED},${MAGA})`,
            boxShadow: `0 6px 16px -4px ${MAGA}80`,
          }}>{photo.queue_label || photo.photo_code}</span>
          <span style={{ fontSize: 9.5, color: "#8A8A93", textAlign: "center", lineHeight: 1.4 }}>Sebutkan Photo ID ini ke petugas operator utk dicetak</span>
        </div>

        <div style={{ flexShrink: 0, marginTop: 12, width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={handleShare} disabled={sharing}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 6px", borderRadius: 14, border: "1px solid #2C2C33", background: "#1E1E24", color: "#F0F0F2", cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.6 : 1 }}>
            {sharing ? <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} /> : shared ? <Check size={17} color="#3DDC84" /> : <Share2 size={17} />}
            <span style={{ fontSize: 11, fontWeight: 700 }}>{sharing ? "Menyiapkan…" : shared ? "Tersalin" : "Share"}</span>
          </button>
          <button onClick={handleDownload} disabled={downloading}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 6px", borderRadius: 14, border: "1px solid #2C2C33", background: "#1E1E24", color: "#F0F0F2", cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.6 : 1 }}>
            {downloading ? <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={17} />}
            <span style={{ fontSize: 11, fontWeight: 700 }}>{downloading ? "Menyiapkan…" : "Download"}</span>
          </button>
        </div>

        <button onClick={handleDownload} disabled={downloading}
          style={{ flexShrink: 0, marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 44, borderRadius: 14, border: "none", background: RED, color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.7 : 1 }}>
          {downloading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={16} />}
          {downloading ? "Menyiapkan…" : "Download Foto Ini"}
        </button>
      </div>
    </div>
  );
}
