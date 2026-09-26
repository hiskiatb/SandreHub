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
import { AlertTriangle, Check, Download, FlipHorizontal2, FlipVertical2, Minus, Move, RotateCw, Save, Share2, Loader2, X, ZoomIn } from "lucide-react";
import { getRpvPhotoByCode, listRpvFrameTemplates, listRpvCustomFonts, saveRpvPhotoCrop } from "../../../../../lib/rpv";
import { DEFAULT_CROP, PhotoFrame, PRINT_SIZE, TEMPLATE_GOOGLE_FONTS_HREF, customFontFaceCss, findDefaultFrameTemplate, renderPhotoFrameToBlob } from "../../_frame";

// Versi standalone (di luar komponen) dari clampCrop di bawah - dipakai saat
// memuat crop tersimpan dari DB, spy foto lama yg kebetulan sudah kesimpan
// dgn pan di luar batas (mis. dari sesi sblm fix ini) langsung dikoreksi juga.
function clampCropForLoad(c) {
  const limit = c.zoom > 1 ? ((c.zoom - 1) * 50) / c.zoom : 0;
  return { ...c, panX: Math.max(-limit, Math.min(limit, c.panX)), panY: Math.max(-limit, Math.min(limit, c.panY)) };
}

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const VIO = "#7C3AED";
const SHARE_RATIO = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };
// FIX (permintaan user - "mengapa tiba-tiba putih, halaman lain dark mode -
// samakan ambience-nya utk kedua layar"): halaman ini sempat direskin ke
// tema terang, tapi ternyata dark theme yg konsisten dgn halaman lain
// (kamera/pilih template & panel operator) yg dimaksud - dipakai token
// PERSIS sama dgn tema gelap "Ruang Kontrol" itu (lihat konstanta serupa
// di prompt/page.jsx), spy ambience konsisten di layar sukses upload MAUPUN
// halaman QR Share ini.
const BG = "#0A0A0B";
const CARD = "#1A1B1D";
const LINE = "rgba(255,255,255,0.09)";
const INK = "#F1F1F3";
const SUB = "#84848C";

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
  const dragRefCleanupRef = useRef(null); // simpan cleanup drag terakhir, spy listener window tak pernah menumpuk kalau pointerup/pointercancel gagal ke-fire pas geser cepat
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
        const loadedCrop = clampCropForLoad(p.crop || DEFAULT_CROP);
        setCrop(loadedCrop);
        setSavedCrop(loadedCrop);
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

  // FIX (permintaan user - "kalau di-scroll sampai ada area kosong, auto
  // bounce ke tepi foto biar ga keliatan area hitam"): object-fit:cover
  // dasarnya SUDAH pas nutup area (lihat _frame.jsx), jadi setiap pan (%)
  // di luar batas yg disediakan tambahan zoom bakal nyingkap pinggir
  // kosong/hitam. Batas amannya = (zoom-1)*50/zoom (dlm satuan % yg sama
  // dgn panX/panY, krn translate% diterapkan SEBELUM scale(zoom) di CSS
  // transform - lihat komentar transform di _frame.jsx). clampCrop dipakai
  // di SETIAP perubahan crop (drag, zoom, load foto) spy TIDAK PERNAH ada
  // kondisi pan melebihi batas - jadi area hitam otomatis tidak pernah
  // muncul sama sekali (bukan cuma dikoreksi belakangan pas pointerup).
  const clampCrop = (c) => {
    const limit = c.zoom > 1 ? ((c.zoom - 1) * 50) / c.zoom : 0;
    return { ...c, panX: Math.max(-limit, Math.min(limit, c.panX)), panY: Math.max(-limit, Math.min(limit, c.panY)) };
  };

  const onCropPointerDown = (e) => {
    e.preventDefault();
    if (dragRefCleanupRef.current) { dragRefCleanupRef.current(); dragRefCleanupRef.current = null; }
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: crop.panX, startPanY: crop.panY, dragging: true };
    const move = (ev) => {
      if (!dragRef.current?.dragging || !imgRef.current) return;
      const w = imgRef.current.offsetWidth || 1;
      const h = imgRef.current.offsetHeight || 1;
      const dx = ((ev.clientX - dragRef.current.startX) / w) * 100;
      const dy = ((ev.clientY - dragRef.current.startY) / h) * 100;
      setCrop((c) => clampCrop({ ...c, panX: dragRef.current.startPanX + dx / c.zoom, panY: dragRef.current.startPanY + dy / c.zoom }));
    };
    const end = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      dragRefCleanupRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    dragRefCleanupRef.current = end;
  };
  const zoomBy = (delta) => setCrop((c) => clampCrop({ ...c, zoom: Math.max(1, Math.min(4, +(c.zoom + delta).toFixed(2))) }));
  const rotateBy = (deg) => setCrop((c) => clampCrop({ ...c, rotate: (c.rotate + deg + 360) % 360 }));
  const toggleFlipX = () => setCrop((c) => clampCrop({ ...c, flipX: !c.flipX }));
  const toggleFlipY = () => setCrop((c) => clampCrop({ ...c, flipY: !c.flipY }));

  // FIX (permintaan user - "saat sesuaikan dia menjadi pop up baru ada
  // button simpan agar preview gambar bisa lebih jelas"): penyesuaian
  // posisi sekarang dibuka sbg MODAL/POP UP tersendiri (bukan kartu kecil
  // yg nyempil di bawah foto), spy preview foto yg sedang diatur bisa
  // ditampilkan jauh lebih besar & jelas. Modal py 2 aksi eksplisit:
  // "Simpan" (simpan ke DB kalau ada perubahan, kalau tidak ada perubahan
  // cukup tutup) & tombol X (Batal - buang perubahan, balik ke posisi
  // tersimpan terakhir).
  async function handleSaveAdjust() {
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
  function handleCancelAdjust() {
    setCrop(savedCrop);
    setAdjustMode(false);
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
      <div className="flashprint-root" style={{ minHeight: "100svh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} />
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }
  if (state === "notfound") {
    return (
      <div className="flashprint-root" style={{ minHeight: "100svh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT, gap: 10, color: INK }}>
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
  // FIX (permintaan user - "kenapa tombol download ada 2, perbaiki desain
  // tidak perlu kata-kata, saat sesuaikan jadi pop up"): (1) tombol Share &
  // Download dijadikan grid 2 kolom SAJA sbg satu-satunya aksi (tombol besar
  // "Download Foto Ini" yg tadinya duplikat fungsi persis sama sudah
  // DIHAPUS). (2) semua kalimat penjelas dibuang - tinggal label kartu
  // pendek (ikon+huruf kapital kecil) & angka Photo ID besar, tanpa kalimat
  // instruksi apa pun. (3) "Sesuaikan Posisi" sekarang bukan lagi kartu yg
  // nyempil di bawah foto - jadi tombol bulat kecil MENGAMBANG di pojok
  // foto yg membuka POP UP/MODAL tersendiri berisi preview foto jauh lebih
  // besar + kontrol + 1 tombol "Simpan" (& X utk batal).
  return (
    <div className="flashprint-root" style={{ height: "100svh", overflowY: "auto", background: BG, fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px", boxSizing: "border-box", position: "relative" }}>
      <link rel="stylesheet" href={TEMPLATE_GOOGLE_FONTS_HREF} />
      {customFonts.length > 0 && <style>{customFontFaceCss(customFonts)}</style>}
      {/* FIX (permintaan user - "mengapa tidak ada ambience-nya yg di
          bawah"): dekor blob gradient magenta/ungu blur + tekstur titik yg
          jadi identitas visual gelap FlashPrint di halaman lain, dipasang
          jg di sini spy konsisten - lihat definisi kelasnya di <style> di
          bawah. */}
      <div className="rpv-m-ambient" aria-hidden="true">
        <div className="rpv-m-ambient-blob rpv-m-ambient-blob--a" />
        <div className="rpv-m-ambient-blob rpv-m-ambient-blob--b" />
        <div className="rpv-m-ambient-dots" />
      </div>
      <div style={{ width: "100%", maxWidth: 420, minHeight: 0, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: RED }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: SUB, letterSpacing: "0.14em", textTransform: "uppercase" }}>FlashPrint</span>
        </div>

        <div style={{ flexShrink: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: `min(300px, calc(52vh * ${SHARE_RATIO.w} / ${SHARE_RATIO.h}))`, borderRadius: 22, overflow: "hidden", background: CARD, border: `1px solid ${LINE}` }}>
            <PhotoFrame photo={photo} ratio={SHARE_RATIO} crop={crop} mode="screen"
              frame={defaultTemplate ? "custom" : "none"} customBaseStyle={defaultTemplate?.baseStyle}
              customElements={defaultTemplate?.elements} customFonts={customFonts} queueLabel={photo.queue_label} />
            <button onClick={() => setAdjustMode(true)} title="Sesuaikan Posisi"
              style={{ position: "absolute", right: 10, bottom: 10, width: 38, height: 38, borderRadius: 99, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(17,17,22,0.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Move size={16} color="#fff" />
            </button>
          </div>
        </div>

        <div style={{
          flexShrink: 0, marginTop: 16, fontSize: 24, fontWeight: 900, color: "#fff", fontFamily: "monospace", letterSpacing: "0.08em",
          padding: "6px 18px", borderRadius: 12, background: `linear-gradient(135deg,${RED},${MAGA})`,
          boxShadow: `0 6px 16px -4px ${MAGA}80`,
        }}>{photo.queue_label || photo.photo_code}</div>

        <div style={{ flexShrink: 0, marginTop: 16, width: "100%", maxWidth: 260, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={handleShare} disabled={sharing}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "11px 6px", borderRadius: 14, border: `1px solid ${LINE}`, background: CARD, color: INK, cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.6 : 1 }}>
            {sharing ? <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} /> : shared ? <Check size={17} color="#16A34A" /> : <Share2 size={17} />}
            <span style={{ fontSize: 11, fontWeight: 700 }}>{sharing ? "…" : shared ? "Tersalin" : "Share"}</span>
          </button>
          <button onClick={handleDownload} disabled={downloading}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "11px 6px", borderRadius: 14, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.7 : 1 }}>
            {downloading ? <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={17} />}
            <span style={{ fontSize: 11, fontWeight: 700 }}>{downloading ? "…" : "Download"}</span>
          </button>
        </div>
      </div>

      {adjustMode && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(17,17,22,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }}>
          <div style={{ width: "100%", maxWidth: 380, maxHeight: "92svh", overflowY: "auto", display: "flex", flexDirection: "column", background: CARD, border: `1px solid ${LINE}`, borderRadius: 26, padding: 16, boxSizing: "border-box" }}>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, letterSpacing: 0.2 }}>Sesuaikan Posisi</span>
              <button onClick={handleCancelAdjust}
                style={{ width: 28, height: 28, borderRadius: 99, border: "none", background: BG, color: SUB, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ flexShrink: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: `min(340px, calc(50vh * ${SHARE_RATIO.w} / ${SHARE_RATIO.h}))`, borderRadius: 18, overflow: "hidden", touchAction: "none", border: `1px solid ${LINE}` }}>
                <PhotoFrame photo={photo} ratio={SHARE_RATIO} crop={crop} mode="screen"
                  frame={defaultTemplate ? "custom" : "none"} customBaseStyle={defaultTemplate?.baseStyle}
                  customElements={defaultTemplate?.elements} customFonts={customFonts} queueLabel={photo.queue_label}
                  imgRef={imgRef} onPointerDown={onCropPointerDown} />
              </div>
            </div>

            <div style={{ flexShrink: 0, marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <button onClick={() => zoomBy(-0.15)} title="Perkecil"
                  style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${LINE}`, background: BG, color: SUB, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <Minus size={13} />
                </button>
                <input type="range" min="1" max="4" step="0.01" value={crop.zoom} onChange={(e) => setCrop((c) => clampCrop({ ...c, zoom: +Number(e.target.value).toFixed(2) }))}
                  style={{ flex: 1, accentColor: MAGA }} />
                <span style={{ fontSize: 10.5, color: SUB, fontWeight: 700, width: 34, textAlign: "center", flexShrink: 0 }}>{Math.round(crop.zoom * 100)}%</span>
                <button onClick={() => zoomBy(0.15)} title="Perbesar"
                  style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${LINE}`, background: BG, color: SUB, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <ZoomIn size={13} />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => rotateBy(90)} title="Putar 90°"
                  style={{ display: "flex", alignItems: "center", gap: 4, height: 30, padding: "0 10px", borderRadius: 9, border: `1px solid ${LINE}`, background: BG, color: SUB, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  <RotateCw size={12} /> {crop.rotate}°
                </button>
                <button onClick={toggleFlipX} title="Balik horizontal"
                  style={{ display: "flex", alignItems: "center", gap: 4, height: 30, padding: "0 10px", borderRadius: 9, border: `1.5px solid ${crop.flipX ? MAGA : LINE}`, background: crop.flipX ? `${MAGA}1F` : BG, color: crop.flipX ? MAGA : SUB, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  <FlipHorizontal2 size={12} /> H
                </button>
                <button onClick={toggleFlipY} title="Balik vertikal"
                  style={{ display: "flex", alignItems: "center", gap: 4, height: 30, padding: "0 10px", borderRadius: 9, border: `1.5px solid ${crop.flipY ? MAGA : LINE}`, background: crop.flipY ? `${MAGA}1F` : BG, color: crop.flipY ? MAGA : SUB, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  <FlipVertical2 size={12} /> V
                </button>
                <button onClick={() => setCrop(DEFAULT_CROP)} style={{ fontSize: 10, color: SUB, fontWeight: 700, background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}>Reset</button>
              </div>
              <button onClick={handleSaveAdjust} disabled={cropSaving}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 12, border: "none",
                  background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: cropSaving ? "default" : "pointer",
                  fontFamily: FONT, opacity: cropSaving ? 0.7 : 1,
                }}>
                {cropSaving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
                {cropSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rpv-m-ambient-drift-a {
          0%, 100% { transform: translate(-14%, 10%) scale(1); }
          50%       { transform: translate(12%, -8%) scale(1.28); }
        }
        @keyframes rpv-m-ambient-drift-b {
          0%, 100% { transform: translate(16%, 8%) scale(1.15); }
          50%       { transform: translate(-12%, -10%) scale(0.88); }
        }
        @keyframes rpv-m-ambient-pulse {
          0%, 100% { opacity: 0.62; }
          50%       { opacity: 0.92; }
        }
        .rpv-m-ambient {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
          mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
        }
        .rpv-m-ambient-blob {
          position: absolute; border-radius: 50%; filter: blur(min(48px, 8vw));
          width: min(70vw, 560px); aspect-ratio: 1;
        }
        .rpv-m-ambient-blob--a {
          left: 4%; bottom: -18%; background: radial-gradient(circle, ${MAGA}52 0%, transparent 68%);
          animation: rpv-m-ambient-drift-a 11s ease-in-out infinite, rpv-m-ambient-pulse 6s ease-in-out infinite;
        }
        .rpv-m-ambient-blob--b {
          right: 0%; bottom: -22%; width: min(62vw, 500px); background: radial-gradient(circle, ${VIO}46 0%, transparent 68%);
          animation: rpv-m-ambient-drift-b 13s ease-in-out infinite, rpv-m-ambient-pulse 7.5s ease-in-out infinite 1.3s;
        }
        .rpv-m-ambient-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(${MAGA}80 1px, transparent 1.6px);
          background-size: 22px 22px;
          animation: rpv-m-ambient-pulse 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
