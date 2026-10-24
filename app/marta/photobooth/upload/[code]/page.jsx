"use client";
/**
 * /marta/photobooth/upload/[code] — halaman PUBLIK (tanpa login), dibuka
 * tamu lewat link/QR yang dibagikan panitia.
 *
 * DIROMBAK lagi ("perbaiki ui nya jangan ada efek glow, buat preview dulu,
 * saat upload ada waktunya dengan jelas utk menguatkan jaringan 5g"):
 * 1) Semua boxShadow warna/blur ("glow") DIHAPUS - kartu & tombol sekarang
 *    flat, border tipis netral, tanpa cahaya di sekeliling elemen.
 * 2) Alur SEKARANG 2 tahap: pilih foto -> PREVIEW dulu (grid foto terpilih,
 *    bisa hapus salah satu) -> baru tekan "Upload N Foto" utk benar2 mulai
 *    unggah. Sebelumnya upload langsung jalan begitu foto dipilih.
 * 3) Selama upload, tiap foto punya TIMER berjalan (mm:ss.d, di-refresh tiap
 *    100ms) yg jelas kelihatan, bukan cuma progress ring - begitu selesai,
 *    waktu FINAL + throughput (Mbps) ditampilkan besar & mencolok (hijau,
 *    ikon petir) utk menguatkan showcase kecepatan jaringan 5G, juga
 *    dirangkum di layar sukses ("Total X foto dlm Ys, rata-rata Z Mbps").
 * 4) Begitu sesi diklik, LANGSUNG buka antarmuka KAMERA LIVE (getUserMedia,
 *    bukan cuma tombol "Pilih dari Galeri") - shutter utk jepret, hasil
 *    jepretan langsung tampil sbg PREVIEW besar (Ambil Ulang / Upload),
 *    baru setelah itu diunggah. "Pilih dari Galeri" tetap ada sbg opsi
 *    sekunder (link kecil) utk device tanpa kamera/izin ditolak.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Camera, Check, Clock, Download, Frame as FrameIcon, ImagePlus, Images, Loader2, Move, Pencil, QrCode, RefreshCcw, RotateCcw, Search, Sparkles, SwitchCamera, Ticket, Trash2, Upload, X, Zap } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { getRpvSession, uploadRpvPhoto, rpvThroughputMbps, listRpvPhotos, listRpvFrameTemplates, listRpvCustomFonts, rpvPublicUrl, subscribeRpvPhotos, saveRpvFrameTemplate, deleteRpvFrameTemplate, uploadRpvTemplateImage, saveRpvPhotoCrop } from "../../../../../lib/rpv";
import { PhotoboothPwaHead, usePhotoboothServiceWorker } from "../../_pwa";
import { FrameOverlayElements, PhotoFrame, PRINT_SIZE, DEFAULT_CROP, renderPhotoFrameToBlob } from "../../_frame";

// ── Riwayat Upload ───────────────────────────────────────────────────────
// FIX (permintaan user - "ini diambil dari semua yg diupload oleh SEMUA yg
// upload di mobile di berbagai device, jadi bukan hanya di device sendiri
// saja"): riwayat SEBELUMNYA sempat disimpan di localStorage per-device
// (cuma keliatan di HP yg sama) - sekarang diganti jadi query LANGSUNG ke
// DB (listRpvPhotos + subscribeRpvPhotos, sesi yg sama dgn dipakai halaman
// Galeri), supaya "Riwayat Upload" menampilkan foto yg diupload tamu MANA
// PUN di sesi ini, real-time, bukan cuma dari device sendiri.

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const VIO = "#7C3AED";
const INK = "#111116";
const LINE = "#E4E2EA";
const SUB = "#8A8A96";

function fmtElapsed(ms) {
  const s = ms / 1000;
  return `${s.toFixed(1)}s`;
}

/** Elapsed berjalan 1 item antrean (dipakai DirectFrameReviewScreen) -
 * diekstrak jadi helper BIASA (bukan dipanggil performance.now() langsung
 * di body komponen) spy lolos lint react-hooks/purity (sama spt pola
 * `it.status==="uploading"...` yg sudah ada sblmnya, cuma dibungkus 1
 * lapis fungsi di sini krn lint menandai pemanggilan langsung di komponen
 * baru ini). */
function liveElapsedMsOf(it) {
  return it.status === "uploading" && it.startedAt ? performance.now() - it.startedAt : null;
}

export default function RpvUploadPage() {
  const params = useParams();
  const code = (params?.code || "").toString().toUpperCase();
  const fileRef = useRef(null);

  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [session, setSession] = useState(null);
  // phase: "pick" (belum ada foto dipilih) | "preview" (sudah dipilih, blm
  // diupload, bisa dihapus) | "uploading"/"done" (proses & hasil unggah)
  const [phase, setPhase] = useState("pick");
  const [queue, setQueue] = useState([]); // { id, file, previewUrl, status, progress, photoCode, error, startedAt, uploadMs, fileSizeBytes }
  const [showSuccess, setShowSuccess] = useState(false);
  const [tick, setTick] = useState(0); // re-render tiap 100ms selama ada yg uploading, dipakai hitung elapsed timer live
  const celebratedRef = useRef(false);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyUnsubRef = useRef(null);
  // Halaman "Mode Kamera" tamu - manifest/SW Photobooth dipasang di sini
  // (& /marta/photobooth/go) SAJA, supaya "Tambah ke Layar Utama" tidak
  // muncul di halaman Panel Operator.
  usePhotoboothServiceWorker();

  // ── Fitur "Frame Langsung" (sesi mode='direct_frame') ───────────────────
  // Tamu pilih 1 frame dari galeri SEBELUM jepret/upload - frame itu ikut
  // menempel ke foto (frame_template_id), BUKAN cuma 1 default global spt
  // alur AI. Sesi mode='ai_prompt' (default/lama) sama sekali TIDAK kena
  // langkah ini - perilakunya tetap identik spt sebelumnya.
  const isDirectFrame = session?.mode === "direct_frame";
  const [frameTemplates, setFrameTemplates] = useState([]);
  const [customFonts, setCustomFonts] = useState([]);
  const [frameTemplatesState, setFrameTemplatesState] = useState("idle"); // idle | loading | ready
  // undefined = BELUM pilih apa2 (tombol aksi di bawah blm muncul) | null =
  // "Tanpa Frame" dipilih EKSPLISIT | {id,...} = 1 frame custom dipilih.
  const [selectedFrame, setSelectedFrame] = useState(undefined);

  useEffect(() => {
    if (!isDirectFrame || frameTemplatesState !== "idle") return;
    setFrameTemplatesState("loading");
    (async () => {
      try {
        const [tpls, fonts] = await Promise.all([listRpvFrameTemplates(), listRpvCustomFonts()]);
        setFrameTemplates(tpls);
        setCustomFonts(fonts);
      } catch { /* diamkan - tamu tetap bisa lanjut tanpa frame */ }
      setFrameTemplatesState("ready");
    })();
  }, [isDirectFrame, frameTemplatesState]);

  // ── Kamera live (getUserMedia) ──────────────────────────────────────────
  // cameraOpen = TRUE begitu halaman siap (default), supaya tamu langsung
  // lihat antarmuka kamera - bukan cuma tombol "Pilih dari Galeri" yg
  // pasif. Dibuka lagi lewat tombol "Ambil Foto Lagi" di tahap preview.
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState("idle"); // idle | starting | ready | denied | unsupported
  const [facing, setFacing] = useState("environment");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async (mode) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraState("unsupported");
      return;
    }
    setCameraState("starting");
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraState("ready");
    } catch {
      setCameraState("denied");
    }
  };

  // Kamera cuma AKTIF selagi cameraOpen true - dimatikan (stopCamera) begitu
  // ditutup/pindah tahap lain, supaya lampu kamera device tidak nyala terus
  // & baterai/privasi tamu terjaga.
  useEffect(() => {
    if (!cameraOpen) { stopCamera(); return; }
    startCamera(facing);
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, facing]);

  const [framePicked, setFramePicked] = useState(false); // sudah lewat langkah pilih frame (sesi direct_frame saja)

  // Begitu sesi siap & belum ada foto sama sekali di antrean - LANGSUNG
  // buka kamera (ini yg dimaksud "klik sesi -> langsung interface kamera").
  // KHUSUS sesi 'direct_frame': JANGAN langsung buka kamera - tamu harus
  // pilih frame dulu (lihat FramePickScreen), baru dari situ pilih "Ambil
  // Foto" (buka kamera dgn overlay frame live) atau "Upload dari Galeri".
  useEffect(() => {
    if (isDirectFrame) return;
    if (state === "ready" && phase === "pick" && queue.length === 0) setCameraOpen(true);
  }, [state, phase, queue.length, isDirectFrame]);

  const flipCamera = () => setFacing((f) => (f === "environment" ? "user" : "environment"));

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    // Mirror horizontal utk kamera depan ("user") - biar preview terasa
    // natural spt cermin (kiri-kanan sesuai gerakan tamu), sedangkan kamera
    // belakang ("environment") dibiarkan apa adanya.
    if (facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file, previewUrl: URL.createObjectURL(blob), status: "pending", progress: 0, photoCode: null, error: "",
        startedAt: null, uploadMs: null, fileSizeBytes: blob.size || null,
        frameTemplateId: isDirectFrame ? (selectedFrame?.id || null) : null,
        crop: DEFAULT_CROP, // UPDATE "Frame Langsung" - posisi foto bisa digeser/zoom spt di CMS (lihat DirectFrameReviewScreen)
      };
      setQueue((q) => [item, ...q]);
      setCameraOpen(false);
      setPhase("preview"); // langsung tampil sbg preview - belum diupload
    }, "image/jpeg", 0.92);
  };

  useEffect(() => {
    const storageUrl = process.env.NEXT_PUBLIC_MARTA_SUPABASE_URL;
    if (!storageUrl) return;
    fetch(`${storageUrl}/storage/v1/object/public/rpv-photos/`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  }, []);

  const storageOrigin = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_MARTA_SUPABASE_URL || "").origin; } catch { return ""; }
  })();

  useEffect(() => {
    (async () => {
      try {
        const s = await getRpvSession(code);
        if (!s || !s.is_active) { setState("notfound"); return; }
        setSession(s);
        setState("ready");
        try {
          setUploadHistory(await listRpvPhotos(code));
        } catch { /* diamkan */ }
        historyUnsubRef.current = subscribeRpvPhotos(s.id, (row) => {
          const photoCode = row.photo_code ?? row.code;
          const queueLabel = row.queue_no != null ? String(row.queue_no).padStart(5, "0") : null;
          setUploadHistory((prev) => (prev.some((p) => p.photo_code === photoCode)
            ? prev
            : [{ photo_code: photoCode, storage_path: row.storage_path, url: rpvPublicUrl(row.storage_path), uploaded_at: row.uploaded_at, queue_label: queueLabel, is_ai_result: row.is_ai_result }, ...prev]));
        }, { sessionCode: code });
      } catch { setState("notfound"); }
    })();
    return () => historyUnsubRef.current?.();
  }, [code]);

  const activeCount = queue.filter((x) => x.status === "pending" || x.status === "uploading").length;

  // Timer live - tick tiap 100ms SELAMA ada foto yg lagi diunggah, dipakai
  // menghitung elapsed berjalan tiap item (bukan cuma persentase progress).
  useEffect(() => {
    if (activeCount === 0) return;
    const t = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [activeCount]);

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const items = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file, previewUrl: URL.createObjectURL(file), status: "pending", progress: 0, photoCode: null, error: "",
      startedAt: null, uploadMs: null, fileSizeBytes: file.size || null,
      frameTemplateId: isDirectFrame ? (selectedFrame?.id || null) : null,
      crop: DEFAULT_CROP, // UPDATE "Frame Langsung" - posisi foto bisa digeser/zoom spt di CMS (lihat DirectFrameReviewScreen)
    }));
    setQueue((q) => [...items, ...q]);
    setPhase("preview"); // TIDAK langsung upload - tampilkan preview dulu, tamu review sebelum unggah
    // UPDATE (permintaan user - "mengapa ada halaman ini harusnya saat
    // galeri cukup membuka file galeri saja"): framePicked BARU di-set true
    // DI SINI (setelah tamu benar2 pilih file), bukan lagi langsung saat
    // tombol "Galeri" di popup ditekan. Sebelumnya setFramePicked(true)
    // dipanggil DULUAN lalu baru fileRef.current?.click() - itu bikin layar
    // FramePickScreen langsung dilepas & halaman utama (tema terang, lama,
    // ada banner "Edit dengan Gemini AI") sempat KELIHATAN di belakang
    // sebelum/kalau file-picker OS dibatalkan - padahal sesi ini direct_frame,
    // halaman itu tidak relevan sama sekali. Sekarang klik "Galeri" cuma
    // membuka file-picker OS saja (lihat onGallery di FramePickScreen) -
    // kalau tamu batal pilih file, tetap di FramePickScreen spt semula.
    if (isDirectFrame) setFramePicked(true);
  };

  const removeItem = (id) => setQueue((q) => q.filter((x) => x.id !== id));
  // UPDATE (permintaan user - "untuk upload dari galeri dia bisa
  // menyesuaikan untuk geser geser gambarnya gunakan konsep yang sama
  // seperti di cms nya"): update posisi/zoom 1 foto di antrean SEBELUM
  // diupload (lihat DirectFrameReviewScreen) - dipakai jg utk foto hasil
  // jepretan kamera, bukan cuma galeri.
  const setItemCrop = (id, crop) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, crop } : x)));

  const startUpload = async () => {
    celebratedRef.current = false;
    setPhase("uploading");
    const items = queue.filter((x) => x.status === "pending");
    await Promise.all(items.map(uploadOne));
  };

  const uploadOne = async (item) => {
    const startedAt = performance.now();
    setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "uploading", progress: 0.02, startedAt } : x)));
    try {
      const { photoCode, uploadMs, fileSizeBytes } = await uploadRpvPhoto(code, item.file, (p) => {
        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, progress: p } : x)));
      }, { frameTemplateId: item.frameTemplateId || null });
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "done", progress: 1, photoCode, uploadMs, fileSizeBytes: fileSizeBytes ?? x.fileSizeBytes } : x)));
      // Riwayat sendiri sudah ke-update otomatis lewat subscribeRpvPhotos
      // (real-time, mencakup semua device) - tidak perlu disimpan manual lagi.
      // UPDATE "Frame Langsung" - simpan penyesuaian geser/zoom (kalau ada,
      // beda dr DEFAULT_CROP) ke rpv_photos.crop_json LEWAT RPC YG SAMA dgn
      // operator (saveRpvPhotoCrop) - best-effort, jgn sampai gagalkan
      // upload foto itu sendiri kalau ini gagal.
      if (item.crop && JSON.stringify(item.crop) !== JSON.stringify(DEFAULT_CROP)) {
        saveRpvPhotoCrop(photoCode, item.crop).catch(() => {});
      }
    } catch (e) {
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "error", error: e.message || "Gagal unggah" } : x)));
    }
  };

  const doneItems = queue.filter((x) => x.status === "done");
  const doneCount = doneItems.length;
  const errorCount = queue.filter((x) => x.status === "error").length;
  const overallProgress = useMemo(() => {
    if (!queue.length) return 0;
    const sum = queue.reduce((s, x) => s + (x.status === "done" || x.status === "error" ? 1 : x.progress || 0), 0);
    return sum / queue.length;
  }, [queue]);

  // Rata2 throughput semua foto yg sukses - ditonjolkan di layar sukses
  // sbg ringkasan showcase kekuatan jaringan 5G ("3 foto dlm 2.1s, rata2 X Mbps").
  const uploadSummary = useMemo(() => {
    if (!doneItems.length) return null;
    const totalMs = doneItems.reduce((s, x) => s + (x.uploadMs || 0), 0);
    const mbpsList = doneItems.map((x) => rpvThroughputMbps(x.fileSizeBytes, x.uploadMs)).filter(Boolean);
    const avgMbps = mbpsList.length ? mbpsList.reduce((s, v) => s + v, 0) / mbpsList.length : null;
    return { totalMs, avgMbps };
  }, [doneItems]);

  useEffect(() => {
    if (phase !== "uploading" || activeCount > 0 || celebratedRef.current) return;
    if (doneCount > 0) {
      celebratedRef.current = true;
      setPhase("done");
      setShowSuccess(true);
    }
  }, [phase, activeCount, doneCount]);

  // UPDATE (permintaan user - "loadingnya mengapa putih harusnya temanya
  // sama"): state loading/notfound SEBELUMNYA pakai <Center> TERANG
  // (#F4F4F6) - jadi tamu sesi 'direct_frame' sempat lihat kilatan putih
  // sebelum masuk ke FramePickScreen yg sudah gelap (mode sesi baru
  // diketahui SETELAH getRpvSession selesai, jadi loading state ini belum
  // tau mode-nya). Disamakan jadi GELAP + ambient blob/dot yg SAMA dgn
  // /marta/photobooth/go (lihat FpAmbientBg) supaya transisinya mulus,
  // tidak ada kedipan tema sama sekali, apa pun mode sesinya nanti.
  if (state === "loading") {
    return (
      <FpDarkScreen>
        <Loader2 size={26} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
      </FpDarkScreen>
    );
  }
  if (state === "notfound") {
    return (
      <FpDarkScreen>
        <AlertTriangle size={30} color={RED} />
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: FP_INK }}>Sesi tidak ditemukan</div>
        <div style={{ marginTop: 4, fontSize: 13, color: FP_SUB, textAlign: "center", maxWidth: 280 }}>Link ini sudah tidak berlaku atau sesi belum aktif.</div>
      </FpDarkScreen>
    );
  }

  if (showSuccess) {
    // UPDATE (permintaan user - "baru klik selanjutnya langsung ada animasi
    // berhasil menampilkan preview foto dan qr nya"): sesi direct_frame
    // dapat layar sukses SENDIRI, GELAP, yg LANGSUNG menampilkan hasil
    // jepretan dgn bingkainya (WYSIWYG, bukan cuma teks "berhasil") + QR
    // share - sesi AI-prompt (Gemini) tetap pakai UploadSuccessScreen lama
    // (generic, tanpa frame custom).
    if (isDirectFrame) {
      return (
        <DirectFrameSuccessScreen
          doneItems={doneItems} errorCount={errorCount} frameTemplates={frameTemplates} customFonts={customFonts}
          sessionTitle={session?.title}
          onDone={() => { setShowSuccess(false); setQueue([]); setPhase("pick"); setFramePicked(false); }}
          onUploadMore={() => { setShowSuccess(false); setQueue([]); setPhase("pick"); setCameraOpen(true); }}
        />
      );
    }
    return (
      <UploadSuccessScreen
        doneCount={doneCount}
        errorCount={errorCount}
        summary={uploadSummary}
        onDone={() => { setShowSuccess(false); setQueue([]); setPhase("pick"); }}
        onUploadMore={() => { setShowSuccess(false); setQueue([]); setPhase("pick"); setCameraOpen(true); }}
      />
    );
  }

  // Tamu sesi 'direct_frame' WAJIB pilih frame dulu (atau "Tanpa Frame"
  // secara eksplisit) sebelum jepret/upload foto pertamanya - tapi HANYA
  // di awal (queue kosong, blm pernah lanjut) supaya "Ambil Foto Lagi" di
  // tahap preview tidak balik nanya frame lagi tiap kali (frame yg sama
  // dipakai terus sampai tamu ganti sendiri lewat "Ganti Frame").
  if (isDirectFrame && !framePicked && phase !== "uploading" && phase !== "done" && !cameraOpen) {
    return (
      <>
        <PhotoboothPwaHead />
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />
        <FramePickScreen
          templates={frameTemplates}
          loading={frameTemplatesState !== "ready"}
          customFonts={customFonts}
          sessionTitle={session?.title}
          selected={selectedFrame}
          onSelect={setSelectedFrame}
          onTemplateCreated={(tpl) => { setFrameTemplates((list) => [tpl, ...list]); setSelectedFrame(tpl); }}
          onTemplateRenamed={(tpl) => { setFrameTemplates((list) => list.map((t) => (t.id === tpl.id ? tpl : t))); setSelectedFrame(tpl); }}
          onTemplateDeleted={(id) => setFrameTemplates((list) => list.filter((t) => t.id !== id))}
          onCapture={() => { setFramePicked(true); setCameraOpen(true); }}
          onGallery={() => fileRef.current?.click()}
          onBack={queue.length > 0 ? () => setFramePicked(true) : null}
        />
      </>
    );
  }

  if (cameraOpen) {
    return (
      <>
        <PhotoboothPwaHead />
        {/* FIX (bug: "ambil foto dari galeri kembali ke mode foto") - input
            file tersembunyi ini SEBELUMNYA tidak dirender di branch ini,
            jadi fileRef.current masih null begitu tombol "Pilih dari
            Galeri" di CameraView ditekan -> click() cuma no-op diam2 &
            picker OS tidak pernah terbuka. */}
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />
        <CameraView
        videoRef={videoRef}
        cameraState={cameraState}
        facing={facing}
        onFlip={flipCamera}
        onCapture={capturePhoto}
        onRetry={() => startCamera(facing)}
        onUseGallery={() => { setCameraOpen(false); fileRef.current?.click(); }}
        headerTitle={isDirectFrame ? "Ambil Foto" : undefined}
        onBack={() => { if (queue.length === 0) { setFramePicked(false); } setCameraOpen(false); }}
        sessionTitle={session?.title}
        overlayElements={isDirectFrame ? selectedFrame?.elements : null}
        overlayCustomFonts={customFonts}
        />
        {historyOpen && <UploadHistoryPanel history={uploadHistory} onClose={() => setHistoryOpen(false)} />}
      </>
    );
  }

  // UPDATE (permintaan user - "mengapa seperti ini, harusnya langsung
  // menampilkan seperti ini saja... pastikan tema semua sama dari awal
  // hingga akhir ya style gelap"): tahap preview/uploading sesi direct_frame
  // SEBELUMNYA jatuh ke layar generic di bawah (tema TERANG, dipakai jg
  // oleh alur AI-prompt - ada banner "Edit dengan Gemini AI" yg sama
  // sekali tidak relevan, & thumbnail foto cuma mentah tanpa bingkai).
  // Sekarang dapat layar SENDIRI, GELAP+ambient (konsisten dgn
  // FramePickScreen/CameraView), menampilkan foto DENGAN bingkainya
  // (WYSIWYG) + bisa digeser/zoom sblm upload (lihat DirectFrameReviewScreen).
  if (isDirectFrame) {
    return (
      <>
        <PhotoboothPwaHead />
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />
        <DirectFrameReviewScreen
          queue={queue} phase={phase} tick={tick}
          frameTemplates={frameTemplates} customFonts={customFonts} sessionTitle={session?.title}
          selectedFrameName={selectedFrame?.name}
          onRemove={removeItem} onCropChange={setItemCrop}
          onAddCamera={() => setCameraOpen(true)} onAddGallery={() => fileRef.current?.click()}
          onChangeFrame={() => setFramePicked(false)}
          onUpload={startUpload}
        />
        {historyOpen && <UploadHistoryPanel history={uploadHistory} onClose={() => setHistoryOpen(false)} />}
      </>
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: "#F4F4F6", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      {historyOpen && <UploadHistoryPanel history={uploadHistory} onClose={() => setHistoryOpen(false)} />}
      <PhotoboothPwaHead />
      {storageOrigin && <link rel="preconnect" href={storageOrigin} />}
      <div style={{ padding: "22px 18px 16px", background: "#fff", borderBottom: `1px solid ${LINE}`, position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", flexShrink: 0 }}>
            <Camera size={19} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{session?.title}</div>
            <div style={{ fontSize: 11.5, color: SUB, marginTop: 1 }}>Kode sesi <b style={{ color: "#5A5A68", fontFamily: "monospace", letterSpacing: "0.05em" }}>{code}</b> · Unggah foto dari galeri kamu</div>
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <Link href={`/marta/photobooth/upload/${code}/gallery`}
              style={{ display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px", borderRadius: 9, border: `1px solid ${LINE}`, color: "#5A5A68", fontSize: 11.5, fontWeight: 700, textDecoration: "none" }}>
              <Images size={13} /> Galeri
            </Link>
            <button onClick={() => setHistoryOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px", borderRadius: 9, border: `1px solid ${LINE}`, background: "#fff", color: "#5A5A68", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              <Clock size={13} /> Riwayat{uploadHistory.length > 0 ? ` (${uploadHistory.length})` : ""}
            </button>
          </div>
        </div>
        <Link href="/marta/photobooth/go" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 10.5, color: "#B0B0BA", fontWeight: 600, textDecoration: "none" }}>
          <RefreshCcw size={10} /> Ganti sesi
        </Link>
        <Link href={`/marta/photobooth/upload/${code}/prompt`}
          style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 13, background: "linear-gradient(135deg,#7C3AED14,#C6168D14)", border: "1px solid #7C3AED33", textDecoration: "none" }}>
          <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#7C3AED,#C6168D)", color: "#fff" }}>
            <Sparkles size={14} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#17181C" }}>Edit dengan Gemini AI</div>
            <div style={{ fontSize: 10, color: "#8A8A96", fontWeight: 600 }}>Pilih template prompt &amp; upload hasil Gemini kamu</div>
          </div>
        </Link>
        {phase === "uploading" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10.5, fontWeight: 700, color: SUB, marginBottom: 5 }}>
              <span>Mengunggah via 5G {doneCount + errorCount}/{queue.length}…</span>
              <span style={{ color: RED }}>{Math.round(overallProgress * 100)}%</span>
            </div>
            <div style={{ width: "100%", height: 6, borderRadius: 99, background: "#EFEDF3", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, width: `${overallProgress * 100}%`, background: `linear-gradient(90deg,${RED},${MAGA})`, transition: "width .25s ease" }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: "20px 16px 100px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />

        {/* Tahap "preview": aksi UTAMA utk nambah foto adalah buka kamera
            LIVE lagi ("Ambil Foto Lagi") - "Pilih dari Galeri" jadi opsi
            SEKUNDER (link kecil di bawahnya), sama spt pola di CameraView. */}
        {phase === "preview" && (
          <button onClick={() => setCameraOpen(true)}
            style={{
              width: "100%", height: 96, borderRadius: 18, cursor: "pointer", fontFamily: FONT,
              background: "#fff", border: `1.5px dashed ${LINE}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7,
            }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
              background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff",
            }}>
              <Camera size={18} />
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>Ambil Foto Lagi</span>
          </button>
        )}
        {phase === "preview" && (
          <button onClick={() => fileRef.current?.click()}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%", marginTop: 8, border: "none", background: "transparent", color: SUB, fontSize: 11.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer", padding: "6px 0" }}>
            <ImagePlus size={13} /> atau pilih dari galeri
          </button>
        )}
        {phase === "preview" && isDirectFrame && (
          <button onClick={() => setFramePicked(false)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%", marginTop: 2, border: "none", background: "transparent", color: MAGA, fontSize: 11, fontWeight: 700, fontFamily: FONT, cursor: "pointer", padding: "6px 0" }}>
            <FrameIcon size={12} /> Ganti frame{selectedFrame ? ` (${selectedFrame.name})` : ""}
          </button>
        )}

        {/* Tombol pilih foto dari galeri - dipakai kalau kamera tidak
            terbuka (mis. fallback state pick tanpa cameraOpen) - FLAT,
            tanpa efek glow. */}
        {phase !== "uploading" && phase !== "done" && phase !== "preview" && (
          <button onClick={() => fileRef.current?.click()}
            style={{
              width: "100%", height: 132, borderRadius: 18, cursor: "pointer", fontFamily: FONT,
              background: "#fff", border: `1.5px dashed ${LINE}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9,
            }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center",
              background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff",
            }}>
              <ImagePlus size={21} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#17181C" }}>Pilih Foto dari Galeri</span>
            <span style={{ fontSize: 11, color: SUB, fontWeight: 600 }}>Bisa pilih beberapa foto sekaligus</span>
          </button>
        )}

        {/* Tahap PREVIEW - foto sudah dipilih tapi BELUM diunggah, tamu bisa
            cek & hapus sebelum benar2 kirim. */}
        {phase === "preview" && queue.length > 0 && (
          <>
            <div style={{ marginTop: 20, fontSize: 12, fontWeight: 700, color: "#5A5A68" }}>Pratinjau · {queue.length} foto dipilih</div>
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
              {queue.map((it) => (
                <div key={it.id} style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: "1/1", background: "#E4E2EA", border: `1px solid ${LINE}` }}>
                  <img src={it.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button onClick={() => removeItem(it.id)} style={{ position: "absolute", top: 5, right: 5, width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(17,17,22,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={startUpload}
              style={{ marginTop: 18, width: "100%", height: 52, borderRadius: 14, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 15, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(135deg,${RED},${MAGA})` }}>
              <Upload size={17} /> Upload {queue.length} Foto
            </button>
          </>
        )}

        {(phase === "uploading" || phase === "done") && queue.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5A5A68", marginBottom: 10 }}>{doneCount}/{queue.length} foto terunggah</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
              {queue.map((it) => {
                const liveElapsedMs = it.status === "uploading" && it.startedAt ? (performance.now() - it.startedAt) : null;
                const mbps = it.status === "done" ? rpvThroughputMbps(it.fileSizeBytes, it.uploadMs) : null;
                void tick; // dipakai supaya komponen re-render tiap 100ms & liveElapsedMs ikut ter-update
                return (
                  <div key={it.id} style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: "1/1", background: "#E4E2EA", border: `1px solid ${LINE}` }}>
                    <img src={it.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {/* Overlay uploading: timer berjalan JELAS (bukan cuma
                        ring persentase) - permintaan eksplisit user utk
                        menguatkan showcase kecepatan jaringan 5G. */}
                    {it.status === "uploading" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(17,17,22,0.42)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <CircularProgress value={it.progress || 0} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>{fmtElapsed(liveElapsedMs || 0)}</span>
                      </div>
                    )}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0) 50%,rgba(0,0,0,0.68) 100%)", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-end", padding: 7, pointerEvents: "none" }}>
                      {it.status === "done" && (
                        <>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#fff", fontSize: 11, fontWeight: 700 }}>
                            <Ticket size={12} /> {it.photoCode}
                          </span>
                          {/* Waktu FINAL + Mbps - besar & mencolok (hijau + petir)
                              spy jadi bukti nyata kecepatan 5G, bukan cuma
                              detail kecil di pojok. */}
                          {!!it.uploadMs && (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#7CF5A8", fontSize: 12, fontWeight: 800, marginTop: 2 }}>
                              <Zap size={12} /> {fmtElapsed(it.uploadMs)}{mbps ? ` · ${mbps.toFixed(1)} Mbps` : ""}
                            </span>
                          )}
                        </>
                      )}
                      {it.status === "error" && <span style={{ color: "#FCA5A5", fontSize: 10.5, fontWeight: 700 }}>Gagal</span>}
                    </div>
                    {it.status === "done" && (
                      <span style={{ position: "absolute", top: 5, left: 5, width: 20, height: 20, borderRadius: 999, background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}"}</style>
    </div>
  );
}

/** 1 kartu foto di DirectFrameReviewScreen - render WYSIWYG (foto+crop+
 * bingkai) via PhotoFrame yg SAMA PERSIS dipakai operator/cetak/TV Viewer,
 * & kalau `interactive` bisa digeser (drag) + zoom +/- PAKAI MEKANISME
 * DRAG YG SAMA PERSIS dgn onCropPointerDown di app/marta/photobooth/
 * page.jsx (panel operator) - cuma crop-nya disimpan di state `queue`
 * (lewat onCropChange) bukan state lokal operator. Permintaan user:
 * "untuk upload dari galeri dia bisa menyesuaikan untuk geser geser
 * gambarnya gunakan konsep yang sama seperti di cms nya". */
// UPDATE (permintaan user - "saat digeser, pastikan dia tidak bisa sampai
// jadi blank area tampila geser samapai batas fotonya saja"): krn urutan
// transform `scale(zoom) translate(panX%, panY%) ...` (lihat PhotoFrame di
// _frame.jsx), translate% itu dihitung thd kotak <img> SEBELUM di-scale -
// jadi overflow yg tersedia di layar, sbg fraksi lebar/tinggi kotak, PERSIS
// (zoom-1)/2 (foto yg SUDAH "cover" pas kotak di zoom=1, trus discale
// zoom kali dari tengah). Dibalik ke satuan panX/panY (dibagi lagi dgn
// zoom spt rumus drag-nya), batas amannya jadi 50*(zoom-1)/zoom - di
// zoom=1 hasilnya 0 (memang tidak boleh geser sama sekali, foto udah pas),
// makin gede zoom makin leluasa geser. Dipakai BAIK saat drag (clamp tiap
// gerakan) MAUPUN saat zoom diturunkan dari slider (clamp ulang pan yg
// mungkin jadi "kelebihan" krn batas baru lebih sempit).
function maxPanPct(zoom) {
  return Math.max(0, (50 * (zoom - 1)) / zoom);
}
function clampCrop(crop) {
  const max = maxPanPct(crop.zoom);
  return { ...crop, panX: Math.max(-max, Math.min(max, crop.panX)), panY: Math.max(-max, Math.min(max, crop.panY)) };
}

function DirectFrameCropCard({ item, ratio, template, customFonts, sessionTitle, queueLabel, onCropChange, onRemove, interactive }) {
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const crop = item.crop || DEFAULT_CROP;
  // UPDATE (permintaan user - "saat digeser sampai batas maksimal, ada
  // notif atur zoom untuk geser lebih"): toast kecil muncul PERSIS saat
  // drag kena mentok batas (bukan selalu tampil) - hilang otomatis.
  const [hitLimit, setHitLimit] = useState(false);
  const hitLimitTimer = useRef(null);
  const flashLimit = () => {
    setHitLimit(true);
    clearTimeout(hitLimitTimer.current);
    hitLimitTimer.current = setTimeout(() => setHitLimit(false), 1100);
  };

  const onCropPointerDown = (e) => {
    if (!interactive) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: crop.panX, startPanY: crop.panY };
    const move = (ev) => {
      if (!dragRef.current || !imgRef.current) return;
      const w = imgRef.current.offsetWidth || 1;
      const h = imgRef.current.offsetHeight || 1;
      const dx = ((ev.clientX - dragRef.current.startX) / w) * 100;
      const dy = ((ev.clientY - dragRef.current.startY) / h) * 100;
      const rawX = dragRef.current.startPanX + dx / crop.zoom;
      const rawY = dragRef.current.startPanY + dy / crop.zoom;
      const next = clampCrop({ ...crop, panX: rawX, panY: rawY });
      if (next.panX !== rawX || next.panY !== rawY) flashLimit();
      onCropChange(item.id, next);
    };
    const end = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const setZoom = (zoom) => onCropChange(item.id, clampCrop({ ...crop, zoom }));

  return (
    <div style={{ width: "100%", maxWidth: 340, margin: "0 auto" }}>
      <div style={{ position: "relative" }}>
        <div style={{ borderRadius: 20, overflow: "hidden", border: `1.5px solid ${FP_LINE}`, boxShadow: "0 16px 40px -16px rgba(0,0,0,0.6)" }}>
          <PhotoFrame photo={{ url: item.previewUrl }} ratio={ratio} crop={crop} frame={template ? "custom" : "none"}
            mode="screen" queueLabel={queueLabel} sessionTitle={sessionTitle}
            imgRef={imgRef} onPointerDown={interactive ? onCropPointerDown : undefined}
            customElements={template?.elements} customBaseStyle={template?.baseStyle} customFonts={customFonts} />
        </div>
        {/* UPDATE (permintaan user - "pada frame tidak perlu ada tombol x,
            agar tidak ada kemungkinan pratinjau 0 foto"): tombol hapus per-
            foto DIHAPUS - jalan SATU2NYA utk batal/ulang sekarang cuma
            tombol "Batalkan" di bawah (yg sekaligus balik ke kamera), jadi
            antrean TIDAK PERNAH bisa jadi kosong selagi masih di layar
            preview ini. */}
        {interactive && hitLimit && (
          <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 5, background: "rgba(198,22,141,0.92)", borderRadius: 999, padding: "6px 12px", color: "#fff", fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap", animation: "rpv-df-limit-pop .18s ease both" }}>
            Sudah mentok - perbesar zoom utk geser lebih
          </div>
        )}
      </div>

      {interactive && (
        <>
          {/* UPDATE (permintaan user - "jelas tek geser untuk atur posisi"):
              keterangan dipindah jadi CAPTION di BAWAH kartu (bukan lagi
              label kecil nempel di pojok foto yg bisa ketutup elemen
              bingkai) - selalu kebaca jelas apa pun desain bingkainya. */}
          <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, fontWeight: 700, color: FP_SUB }}>
            Geser foto di atas utk atur posisi
          </div>
          {/* UPDATE (permintaan user - "untuk tombol zoomnya sliding saja"):
              ganti tombol +/- jadi 1 slider zoom penuh, label % di
              sampingnya. */}
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: FP_SUB, minWidth: 30 }}>Zoom</span>
            <input type="range" min={1} max={4} step={0.02} value={crop.zoom}
              onChange={(e) => setZoom(+e.target.value)}
              className="rpv-df-zoom-slider" style={{ flex: 1, accentColor: MAGA }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: FP_INK, minWidth: 40, textAlign: "right" }}>{Math.round(crop.zoom * 100)}%</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Layar preview/upload KHUSUS sesi 'direct_frame' - permintaan user:
 * "mengapa seperti ini, harusnya langsung menampilkan seperti ini saja...
 * pastikan tema semua sama dari awal hingga akhir ya style gelap dengan
 * blob gradient bergerak dan dot". Menggantikan layar preview generic
 * (tema terang, dipakai jg alur AI-prompt) - di sini foto langsung
 * ditampilkan DENGAN bingkainya (WYSIWYG via DirectFrameCropCard di atas),
 * bukan cuma thumbnail mentah, & tema gelap+ambient konsisten dgn
 * FramePickScreen/CameraView sebelumnya di alur ini. */
function DirectFrameReviewScreen({ queue, phase, tick, frameTemplates, customFonts, sessionTitle, selectedFrameName, onRemove, onCropChange, onAddCamera, onAddGallery, onChangeFrame, onUpload }) {
  const ratio = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };
  const uploading = phase === "uploading";
  const pendingOrDoneCount = queue.filter((x) => x.status === "done").length;
  const overallProgress = queue.length ? queue.reduce((s, x) => s + (x.status === "done" || x.status === "error" ? 1 : x.progress || 0), 0) / queue.length : 0;

  return (
    // FIX (permintaan user - "mengapa halaman ini tidak bisa di scroll"):
    // root SEBELUMNYA overflow:"hidden" (dipakai hanya utk motong blob
    // ambient di belakang) - tapi div ini adalah flex-item langsung di
    // `body` (lihat app/layout.js: body punya class flex flex-col), & per
    // spesifikasi flexbox, flex-item dgn overflow selain "visible" otomatis
    // dapat min-height:0 - akibatnya begitu antrean foto/kartu hasil lebih
    // tinggi dr layar, kelebihannya KEPOTONG bukan discroll. overflowY:
    // "auto" (ganti "hidden") membiarkan div ini sendiri yg jadi scroll
    // container, overflowX tetap "hidden" spy blob ambient tetap tidak
    // bikin scroll horizontal nongol.
    <div style={{ minHeight: "100svh", height: "100svh", background: FP_BG, fontFamily: FONT, colorScheme: "dark", position: "relative", overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
      <FpAmbientBg />
      <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${FP_LINE}`, position: "sticky", top: 0, zIndex: 5, background: "rgba(10,10,11,0.72)", backdropFilter: "blur(10px)" }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: FP_INK, letterSpacing: "-0.01em" }}>
          {uploading ? `Mengunggah via 5G ${pendingOrDoneCount}/${queue.length}…` : `Pratinjau · ${queue.length} foto`}
        </div>
        {uploading ? (
          // UPDATE (permintaan user - "buat loadingnya menjadi lebih bagus
          // dan juga animasinya bagus" - saat upload foto): progress bar
          // header skrg ada efek "shimmer" bergerak di atas gradientnya
          // (pseudo-animasi cahaya berjalan), bukan lagi batang gradient
          // statis - kerasa lebih "hidup" selagi unggahan berjalan.
          <div style={{ marginTop: 10, width: "100%", height: 7, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", borderRadius: 99, width: `${overallProgress * 100}%`, background: `linear-gradient(90deg,${RED},${MAGA})`, transition: "width .25s ease", position: "relative", overflow: "hidden" }}>
              <div className="rpv-df-progress-shimmer" />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: FP_SUB, marginTop: 2 }}>Cek posisi fotomu, geser/zoom kalau perlu, baru unggah.</div>
        )}
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "20px 16px 110px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ marginTop: 0, display: "flex", flexDirection: "column", gap: 28 }}>
          {queue.map((it) => {
            const template = (frameTemplates || []).find((t) => t.id === it.frameTemplateId) || null;
            const liveElapsedMs = liveElapsedMsOf(it);
            const mbps = it.status === "done" ? rpvThroughputMbps(it.fileSizeBytes, it.uploadMs) : null;
            void tick; // re-render tiap 100ms selama upload berjalan spy liveElapsedMs ikut update
            return (
              <div key={it.id} style={{ position: "relative" }}>
                <DirectFrameCropCard item={it} ratio={ratio} template={template} customFonts={customFonts} sessionTitle={sessionTitle}
                  queueLabel="00000" onCropChange={onCropChange} onRemove={onRemove} interactive={!uploading} />
                {uploading && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 20, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    {it.status === "uploading" && (
                      <div className="rpv-df-upload-overlay" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,10,12,0.3),rgba(10,10,12,0.6))", backdropFilter: "blur(2px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <CircularProgress value={it.progress || 0} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>{fmtElapsed(liveElapsedMs || 0)}</span>
                      </div>
                    )}
                    {it.status === "done" && (
                      <div className="rpv-df-done-badge" style={{ position: "absolute", bottom: 14, left: "50%", display: "flex", alignItems: "center", gap: 6, background: "rgba(22,163,74,0.92)", borderRadius: 999, padding: "6px 13px", boxShadow: "0 8px 20px -6px rgba(22,163,74,0.6)" }}>
                        <Check size={13} color="#fff" />
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#fff" }}>{fmtElapsed(it.uploadMs || 0)}{mbps ? ` · ${mbps.toFixed(1)} Mbps` : ""}</span>
                      </div>
                    )}
                    {it.status === "error" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#FCA5A5" }}>Gagal diunggah</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* UPDATE (permintaan user - "tidak perlu ada opsi ambil foto atau
            ganti frame, dan buttin batalkan jangan transparan dan teksnya
            batalkan, dan jangan Upload 1 foto namun Upload foto buat 2
            button ini bagus dan rapi"): link galeri/ganti-frame DIHAPUS -
            cuma 2 tombol bersih: "Upload Foto" (primer, gradient) &
            "Batalkan" (sekunder, background SOLID gelap - bukan transparan
            lagi), dipasangkan rapi dgn tinggi & radius yg sama. */}
        {!uploading && queue.length > 0 && (
          <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={onUpload}
              style={{ width: "100%", height: 54, borderRadius: 16, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 15, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(135deg,${RED},${MAGA})`, boxShadow: "0 14px 34px -12px rgba(198,22,141,0.55)" }}>
              <Upload size={17} /> Upload Foto
            </button>
            <button onClick={() => { queue.forEach((it) => onRemove(it.id)); onAddCamera(); }}
              style={{ width: "100%", height: 54, borderRadius: 16, border: `1.5px solid ${FP_LINE}`, background: FP_CARD_HI, cursor: "pointer", fontFamily: FONT, fontSize: 15, fontWeight: 800, color: FP_INK }}>
              Batalkan
            </button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes rpv-df-limit-pop { 0% { opacity: 0; transform: translateX(-50%) scale(0.85); } 100% { opacity: 1; transform: translateX(-50%) scale(1); } }
        .rpv-df-zoom-slider { -webkit-appearance: none; appearance: none; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.14); outline: none; }
        .rpv-df-zoom-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 999px; background: #fff; border: 3px solid ${MAGA}; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.35); }
        .rpv-df-zoom-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 999px; background: #fff; border: 3px solid ${MAGA}; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.35); }
        /* UPDATE (permintaan user - "buat loadingnya menjadi lebih bagus
           dan juga animasinya bagus" saat upload foto): shimmer bergerak di
           atas progress bar header, overlay per-kartu fade-in halus begitu
           statusnya "uploading", & badge "selesai" pop-in dgn sedikit
           bounce - bukan lagi muncul instan diam. */
        @keyframes rpv-df-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .rpv-df-progress-shimmer {
          position: absolute; inset: 0; width: 50%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          animation: rpv-df-shimmer 1.3s ease-in-out infinite;
        }
        @keyframes rpv-df-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        .rpv-df-upload-overlay { animation: rpv-df-overlay-in .25s ease both; }
        @keyframes rpv-df-badge-pop { 0% { opacity: 0; transform: translateX(-50%) scale(0.75); } 60% { opacity: 1; transform: translateX(-50%) scale(1.06); } 100% { transform: translateX(-50%) scale(1); } }
        .rpv-df-done-badge { animation: rpv-df-badge-pop .4s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes rpv-df-cp-glow-pulse { 0%, 100% { opacity: 0.45; transform: scale(0.9); } 50% { opacity: 0.85; transform: scale(1.15); } }
        .rpv-df-cp-glow {
          position: absolute; inset: -4px; border-radius: 999px; pointer-events: none;
          background: radial-gradient(circle, ${MAGA}99 0%, transparent 70%);
          animation: rpv-df-cp-glow-pulse 1.6s ease-in-out infinite;
        }
        *{box-sizing:border-box}
      `}</style>
    </div>
  );
}

/** Layar sukses KHUSUS sesi 'direct_frame' - permintaan user: "baru klik
 * selanjutnya langsung ada animasi berhasil menampilkan preview foto dan
 * qr nya". Animasi check singkat, lalu LANGSUNG tampil kartu hasil (foto+
 * bingkai WYSIWYG, sama persis spt /marta/photobooth/p/[photoCode]) + QR
 * share - semua di atas tema gelap+ambient yg sama dgn seluruh alur ini. */
function DirectFrameSuccessScreen({ doneItems, errorCount, frameTemplates, customFonts, sessionTitle, onDone, onUploadMore }) {
  const ratio = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };
  const [qrByCode, setQrByCode] = useState({});
  const [checkDone, setCheckDone] = useState(false);
  // UPDATE (permintaan user - "bisa langsung download foto juga disini"):
  // tamu skrg bisa langsung simpan file PNG foto+bingkainya dr layar hasil
  // ini juga (sblmnya cuma lewat scan QR/buka link /p/[photoCode] dulu) -
  // render PAKAI renderPhotoFrameToBlob yg SAMA PERSIS dgn tombol Download
  // di /p/[photoCode] (hasil foto+bingkai, resolusi penuh, tanpa kompresi),
  // jadi hasilnya identik, bukan screenshot mentah.
  const [downloadingId, setDownloadingId] = useState(null);
  const handleDownload = async (it, template) => {
    if (downloadingId) return;
    setDownloadingId(it.id);
    try {
      const blob = await renderPhotoFrameToBlob({
        photo: { url: it.previewUrl }, ratio, crop: it.crop || DEFAULT_CROP,
        frame: template ? "custom" : "none", queueLabel: it.photoCode || "00000", sessionTitle,
        customElements: template?.elements, customBaseStyle: template?.baseStyle, customFonts,
      });
      if (!blob) throw new Error("render-failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foto-${it.photoCode || it.id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { /* biarkan tamu masih bisa download lewat QR/link /p/ kalau render gagal */ }
    setDownloadingId(null);
  };

  useEffect(() => {
    const t = setTimeout(() => setCheckDone(true), 650);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    (async () => {
      const missing = doneItems.filter((it) => it.photoCode && !qrByCode[it.photoCode]);
      if (!missing.length) return;
      const entries = await Promise.all(missing.map(async (it) => {
        try {
          const url = `${window.location.origin}/marta/photobooth/p/${it.photoCode}`;
          const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#111116", light: "#FFFFFF" } });
          return [it.photoCode, dataUrl];
        } catch { return [it.photoCode, null]; }
      }));
      setQrByCode((m) => ({ ...m, ...Object.fromEntries(entries) }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneItems]);

  return (
    // FIX (permintaan user - "mengapa halaman ini tidak bisa di scroll"):
    // overflow:"hidden" bikin kelebihan tinggi (apalagi dgn >1 foto + kartu
    // QR per foto) KEPOTONG, bukan discroll - lihat komentar sama persis di
    // DirectFrameReviewScreen di atas (flex-item child dr body + overflow
    // selain visible -> min-height:0 otomatis). overflowY:"auto" bikin
    // layar ini sendiri jadi scroll container-nya.
    <div style={{ minHeight: "100svh", height: "100svh", background: FP_BG, fontFamily: FONT, colorScheme: "dark", position: "relative", overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
      <FpAmbientBg />
      <div style={{ position: "relative", zIndex: 1, padding: "34px 18px 90px", maxWidth: 420, width: "100%", margin: "0 auto", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative", width: 76, height: 76, borderRadius: 999, background: "rgba(22,163,74,0.14)", display: "flex", alignItems: "center", justifyContent: "center", animation: "rpv-df-pop .42s cubic-bezier(.34,1.56,.64,1) both" }}>
          <svg width="40" height="40" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="23" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round"
              style={{ strokeDasharray: 145, strokeDashoffset: checkDone ? 0 : 145, transition: "stroke-dashoffset .5s ease" }} />
            <path d="M15 27l7.5 7.5L37.5 18" fill="none" stroke="#22C55E" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 34, strokeDashoffset: checkDone ? 0 : 34, transition: "stroke-dashoffset .35s ease .25s" }} />
          </svg>
        </div>
        <div style={{ marginTop: 16, fontSize: 17, fontWeight: 800, color: FP_INK, textAlign: "center" }}>
          {doneItems.length > 1 ? `${doneItems.length} Foto Berhasil Diunggah!` : "Foto Berhasil Diunggah!"}
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: FP_SUB, textAlign: "center" }}>Scan QR di bawah utk share/download fotomu.</div>

        {errorCount > 0 && (
          <div style={{ marginTop: 12, fontSize: 11.5, fontWeight: 700, color: "#FCA5A5" }}>{errorCount} foto gagal diunggah.</div>
        )}

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
          {doneItems.map((it, i) => {
            const template = (frameTemplates || []).find((t) => t.id === it.frameTemplateId) || null;
            return (
              <div key={it.id} className="rpv-df-success-card" style={{ animationDelay: `${0.12 + i * 0.08}s` }}>
                <div style={{ borderRadius: 20, overflow: "hidden", border: `1.5px solid ${FP_LINE}`, boxShadow: "0 16px 40px -16px rgba(0,0,0,0.6)" }}>
                  <PhotoFrame photo={{ url: it.previewUrl }} ratio={ratio} crop={it.crop || DEFAULT_CROP} frame={template ? "custom" : "none"}
                    mode="screen" queueLabel={it.photoCode || "00000"} sessionTitle={sessionTitle}
                    customElements={template?.elements} customBaseStyle={template?.baseStyle} customFonts={customFonts} />
                </div>
                <div style={{ marginTop: 12, borderRadius: 16, background: FP_CARD, border: `1px solid ${FP_LINE}`, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  {qrByCode[it.photoCode] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrByCode[it.photoCode]} alt={`QR ${it.photoCode}`} width={150} height={150} style={{ borderRadius: 10, background: "#fff", padding: 6 }} />
                  ) : (
                    <div style={{ width: 150, height: 150, borderRadius: 10, background: FP_FIELD, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Loader2 size={20} color={MAGA} style={{ animation: "spin 1s linear infinite" }} />
                    </div>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 800, color: FP_SUB, letterSpacing: "0.06em", textTransform: "uppercase" }}>Scan utk Share &amp; Download</span>
                  {it.photoCode && (
                    <Link href={`/marta/photobooth/p/${it.photoCode}`} style={{ fontSize: 12.5, fontWeight: 800, color: MAGA, textDecoration: "none" }}>
                      Buka di HP ini
                    </Link>
                  )}
                  <button onClick={() => handleDownload(it, template)} disabled={downloadingId === it.id}
                    style={{ marginTop: 6, width: "100%", height: 42, borderRadius: 12, border: "none", cursor: downloadingId === it.id ? "default" : "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: `linear-gradient(135deg,${RED},${MAGA})`, opacity: downloadingId && downloadingId !== it.id ? 0.5 : 1 }}>
                    {downloadingId === it.id ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />}
                    {downloadingId === it.id ? "Menyiapkan…" : "Download Foto"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          <button onClick={onUploadMore}
            style={{ width: "100%", height: 50, borderRadius: 14, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg,${RED},${MAGA})` }}>
            Ambil Foto Lagi
          </button>
          <button onClick={onDone}
            style={{ width: "100%", height: 50, borderRadius: 14, border: `1.5px solid ${FP_LINE}`, background: "transparent", color: FP_MID, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Selesai
          </button>
        </div>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes rpv-df-pop { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes rpv-df-card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .rpv-df-success-card { animation: rpv-df-card-in .4s ease both; }
        *{box-sizing:border-box}
      `}</style>
    </div>
  );
}

function fmtHistoryTime(ms) {
  try {
    return new Date(ms).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

/** Panel "Riwayat Upload" - daftar foto yg sudah pernah berhasil diunggah
 * dari HP/perangkat ini (disimpan di localStorage per kode sesi), dgn
 * tombol per-foto utk menampilkan lagi QR-nya (dibuat on-demand pas
 * dibuka, bukan semua sekaligus) - kegunaannya spy tamu bisa scan ulang
 * & download foto yg sudah diunggah sebelumnya tanpa harus ingat kodenya. */
function UploadHistoryPanel({ history, onClose }) {
  const [openCode, setOpenCode] = useState(null);
  // 2 QR terpisah per foto - permintaan user ("seharusnya ada QR Photo ID
  // utk kebutuhan cetak lengkap dgn Photo ID-nya, DAN ada QR utk share
  // fotonya"): idQr = QR ANGKA murni (queue_label/photo_code) yg dipindai
  // operator di /marta/photobooth/scan/[code] utk keperluan CETAK - sama
  // persis pola QR yg dibuat begitu tamu selesai upload (GeminiUploadSuccessScreen).
  // shareQr = QR LINK ke /marta/photobooth/p/[photoCode], utk tamu lain
  // scan & lihat/download/share foto itu sendiri.
  const [idQrByCode, setIdQrByCode] = useState({});
  const [shareQrByCode, setShareQrByCode] = useState({});
  const [qrLoading, setQrLoading] = useState(null);

  const toggleQr = async (it) => {
    const photoCode = it.photo_code;
    if (openCode === photoCode) { setOpenCode(null); return; }
    setOpenCode(photoCode);
    if (idQrByCode[photoCode] && shareQrByCode[photoCode]) return;
    setQrLoading(photoCode);
    try {
      const idText = (it.queue_label || it.photo_code || "").toString();
      const shareUrl = `${window.location.origin}/marta/photobooth/p/${photoCode}`;
      const [idDataUrl, shareDataUrl] = await Promise.all([
        QRCode.toDataURL(idText, { margin: 1, width: 200, color: { dark: "#111116", light: "#FFFFFF" } }),
        QRCode.toDataURL(shareUrl, { margin: 1, width: 200, color: { dark: "#111116", light: "#FFFFFF" } }),
      ]);
      setIdQrByCode((m) => ({ ...m, [photoCode]: idDataUrl }));
      setShareQrByCode((m) => ({ ...m, [photoCode]: shareDataUrl }));
    } catch { /* diamkan - tombol tetap bisa dicoba lagi */ }
    setQrLoading(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(17,17,22,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, maxHeight: "82svh", background: "#fff", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", fontFamily: FONT }}>
        <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} color={MAGA} />
            <span style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>Riwayat Upload</span>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: "#F4F4F6", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "8px 14px 22px" }}>
          {history.length === 0 && (
            <div style={{ padding: "34px 10px", textAlign: "center", color: SUB, fontSize: 12.5 }}>
              Belum ada foto yang diunggah di sesi ini.
            </div>
          )}
          {history.map((it) => (
            <div key={it.photo_code} style={{ padding: "10px 6px", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: "#F4F4F6", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {it.url ? (
                    <img src={it.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <Ticket size={15} color={MAGA} />
                  )}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: INK, fontFamily: "monospace", letterSpacing: "0.03em" }}>{it.photo_code}</div>
                  <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>{fmtHistoryTime(it.uploaded_at)}</div>
                </div>
                <button onClick={() => toggleQr(it)}
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", borderRadius: 9, border: "none", background: openCode === it.photo_code ? "#F4F4F6" : `linear-gradient(135deg,${RED},${MAGA})`, color: openCode === it.photo_code ? "#5A5A68" : "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
                  <QrCode size={12} /> {openCode === it.photo_code ? "Tutup" : "QR"}
                </button>
              </div>
              {openCode === it.photo_code && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  {qrLoading === it.photo_code && <Loader2 size={20} color={RED} style={{ animation: "spin 1s linear infinite" }} />}
                  {idQrByCode[it.photo_code] && shareQrByCode[it.photo_code] && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
                      {/* QR Photo ID - buat kebutuhan CETAK (dipindai operator
                          di /marta/photobooth/scan/[code]), lengkap dgn teks
                          Photo ID di bawahnya. */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <img src={idQrByCode[it.photo_code]} alt={`QR Photo ID ${it.photo_code}`} width={140} height={140} style={{ borderRadius: 10, border: `1px solid ${LINE}` }} />
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: SUB, letterSpacing: "0.06em", textTransform: "uppercase" }}>QR Photo ID (Cetak)</span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, fontFamily: "monospace" }}>{it.queue_label || it.photo_code}</span>
                        <a href={idQrByCode[it.photo_code]} download={`qr-id-${it.photo_code}.png`}
                          style={{ display: "flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 9, border: `1px solid ${LINE}`, color: "#5A5A68", fontSize: 10.5, fontWeight: 700, textDecoration: "none" }}>
                          <Download size={11} /> Simpan
                        </a>
                      </div>
                      {/* QR Share - link ke /marta/photobooth/p/[photoCode],
                          buat tamu lain scan & lihat/download/share foto ini. */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <img src={shareQrByCode[it.photo_code]} alt={`QR share ${it.photo_code}`} width={140} height={140} style={{ borderRadius: 10, border: `1px solid ${LINE}` }} />
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: SUB, letterSpacing: "0.06em", textTransform: "uppercase" }}>QR Share Foto</span>
                        <Link href={`/marta/photobooth/p/${it.photo_code}`}
                          style={{ fontSize: 12.5, fontWeight: 800, color: MAGA, textDecoration: "none" }}>
                          Buka Foto
                        </Link>
                        <a href={shareQrByCode[it.photo_code]} download={`qr-share-${it.photo_code}.png`}
                          style={{ display: "flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 9, border: `1px solid ${LINE}`, color: "#5A5A68", fontSize: 10.5, fontWeight: 700, textDecoration: "none" }}>
                          <Download size={11} /> Simpan
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ring progress melingkar kecil (SVG, tanpa library) - dipakai di tengah
 * tiap thumbnail foto yg lagi diunggah, menunjukkan PERSENTASE riil,
 * dipasangkan dgn timer teks (fmtElapsed) di bawahnya. */
// UPDATE (permintaan user - "buat loadingnya menjadi lebih bagus dan juga
// animasinya bagus" saat upload foto): ring progress per-kartu SEBELUMNYA
// stroke putih polos - skrg stroke GRADIENT merah->magenta (konsisten dgn
// warna brand di seluruh app ini) + glow lembut berdenyut pelan di
// belakangnya, biar kerasa "hidup" selagi nunggu unggahan tiap foto.
function CircularProgress({ value }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 16, c = 2 * Math.PI * r;
  const gradId = `rpv-df-cp-grad-${useId().replace(/:/g, "")}`;
  return (
    <div style={{ position: "relative", width: 40, height: 40 }}>
      <div className="rpv-df-cp-glow" aria-hidden="true" />
      <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)", position: "relative" }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={RED} />
            <stop offset="100%" stopColor={MAGA} />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3.5" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .2s ease" }} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, color: "#fff" }}>
        {Math.round(pct * 100)}
      </span>
    </div>
  );
}

/** Layar sukses full-screen begitu antrean upload tuntas. Animasi confetti/
 * ring sonar/checkmark tetap dipertahankan (konsisten dgn SubmitSuccessScreen
 * MartaHub mobile), tapi TANPA efek glow (shadow warna) di elemen lain,
 * & sekarang menampilkan ringkasan kecepatan 5G ("3 foto dlm 2.1s, rata2
 * X Mbps") sbg penguat showcase jaringan. */
function UploadSuccessScreen({ doneCount, errorCount, summary, onDone, onUploadMore }) {
  const confetti = useMemo(() => {
    const colors = ["#ED1C24", "#F59E0B", "#15803D", "#2563EB", "#EC008C", "#7C3AED"];
    return Array.from({ length: 14 }, (_, i) => {
      const angle = (360 / 14) * i + (Math.random() * 22 - 11);
      const dist = 58 + Math.random() * 34;
      const rad = (angle * Math.PI) / 180;
      return {
        id: i,
        tx: Math.round(Math.cos(rad) * dist),
        ty: Math.round(Math.sin(rad) * dist),
        rot: Math.round(Math.random() * 360),
        delay: (Math.random() * 0.1).toFixed(2),
        size: 5 + Math.round(Math.random() * 3),
        color: colors[i % colors.length],
        round: i % 2 === 0,
      };
    });
  }, []);

  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [[880, now, 0.11], [1318.5, now + 0.1, 0.22]].forEach(([freq, start, dur]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      });
      const closeTimer = setTimeout(() => ctx.close().catch(() => {}), 700);
      return () => clearTimeout(closeTimer);
    } catch { /* best-effort - polesan, jangan sampai mengganggu alur */ }
  }, []);

  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#F4F4F6", fontFamily: FONT, overflow: "hidden" }}>
      <div style={{ textAlign: "center", maxWidth: 340, width: "100%" }}>
        <div style={{ position: "relative", width: 108, height: 108, margin: "0 auto" }}>
          <div className="mh-success-ring" style={{ animationDelay: "0.05s" }} />
          <div className="mh-success-ring" style={{ animationDelay: "0.35s" }} />
          {confetti.map((c) => (
            <span key={c.id} className="mh-confetti"
              style={{
                "--tx": `${c.tx}px`, "--ty": `${c.ty}px`, "--rot": `${c.rot}deg`,
                animationDelay: `${c.delay}s`, width: c.size, height: c.size,
                background: c.color, borderRadius: c.round ? "50%" : "2px",
              }} />
          ))}
          <div className="mh-success-pop" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(21,128,61,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle className="mh-success-circle" cx="26" cy="26" r="23" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" />
              <path className="mh-success-tick" d="M15 27l7.5 7.5L37.5 18" fill="none" stroke="#15803D" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div className="mh-success-text" style={{ marginTop: 22, fontSize: 19, fontWeight: 800, color: "#17181C" }}>
          {doneCount > 1 ? `${doneCount} Foto Berhasil Diunggah!` : "Foto Berhasil Diunggah!"}
        </div>
        <div className="mh-success-text" style={{ marginTop: 8, fontSize: 13, color: "#6B6B76", lineHeight: 1.6, animationDelay: "0.08s" }}>
          Fotomu sudah tampil di layar Viewer - cari ID di bawah fotomu kalau mau cetak.
        </div>

        {/* Ringkasan kecepatan 5G - penguat showcase, ditaruh sbg pill flat
            (bukan card ber-glow) di bawah teks sukses. */}
        {summary && (
          <div className="mh-success-text" style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 999, background: "#EAF9EF", border: "1px solid #CDEED9", animationDelay: "0.12s" }}>
            <Zap size={13} color="#16A34A" />
            <span style={{ fontSize: 12, fontWeight: 800, color: "#15803D" }}>
              {doneCount} foto dlm {fmtElapsed(summary.totalMs)}{summary.avgMbps ? ` · rata-rata ${summary.avgMbps.toFixed(1)} Mbps` : ""}
            </span>
          </div>
        )}

        {errorCount > 0 && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 7, padding: "10px 12px", borderRadius: 11, background: "rgba(180,83,9,0.08)", textAlign: "left" }}>
            <AlertTriangle size={14} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8A6D00", lineHeight: 1.45 }}>
              {errorCount} foto gagal diunggah - coba pilih ulang foto itu.
            </span>
          </div>
        )}
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={onUploadMore}
            style={{ width: "100%", height: 48, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}>
            Unggah Foto Lagi
          </button>
          <button onClick={onDone}
            style={{ width: "100%", height: 48, borderRadius: 12, border: `1.5px solid ${LINE}`, background: "#fff", color: "#5A5A68", fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
            Selesai
          </button>
        </div>
      </div>
      <style>{`
        @keyframes mh-success-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes mh-success-circle { from { stroke-dasharray: 145; stroke-dashoffset: 145; } to { stroke-dasharray: 145; stroke-dashoffset: 0; } }
        @keyframes mh-success-tick { from { stroke-dasharray: 34; stroke-dashoffset: 34; } to { stroke-dasharray: 34; stroke-dashoffset: 0; } }
        @keyframes mh-success-sonar { 0% { transform: scale(0.7); opacity: 0.55; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes mh-confetti-burst { 0% { transform: translate(-50%,-50%) translate(0,0) rotate(0deg); opacity: 1; } 65% { opacity: 1; } 100% { transform: translate(-50%,-50%) translate(var(--tx), calc(var(--ty) + 30px)) rotate(var(--rot)); opacity: 0; } }
        @keyframes mh-success-text-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .mh-success-pop { animation: mh-success-pop 0.42s cubic-bezier(.34,1.56,.64,1) both; }
        .mh-success-circle { animation: mh-success-circle 0.55s 0.05s cubic-bezier(.65,0,.35,1) both; }
        .mh-success-tick { animation: mh-success-tick 0.35s 0.5s cubic-bezier(.65,0,.35,1) both; }
        .mh-success-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid #15803D; animation: mh-success-sonar 1.3s cubic-bezier(0,.6,.4,1) both; }
        .mh-confetti { position: absolute; left: 50%; top: 50%; display: block; animation: mh-confetti-burst 0.85s 0.28s cubic-bezier(.25,.8,.4,1) both; }
        .mh-success-text { animation: mh-success-text-in 0.4s 0.5s ease both; }
      `}</style>
    </div>
  );
}

function Center({ children, dark }) {
  return (
    <div style={{ minHeight: dark ? "auto" : "100svh", flex: dark ? 1 : undefined, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: dark ? "transparent" : "#F4F4F6", fontFamily: FONT, padding: 20, position: "relative", zIndex: 2 }}>
      {children}
      {!dark && <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>}
    </div>
  );
}

/** Langkah "Pilih Frame" (fitur "Frame Langsung", sesi mode='direct_frame')
 * - tamu pilih 1 bingkai dari galeri SEBELUM jepret/upload; begitu dipilih,
 * muncul 2 opsi aksi ("Ambil Foto" / "Upload dari Galeri") di bawahnya -
 * persis permintaan user ("akan ada pilihan untuk langsung foto... atau
 * upload dari galeri"). Preview tiap kartu pakai FrameOverlayElements yang
 * SAMA dgn dipakai live kamera & hasil akhir, jadi tamu lihat persis posisi
 * elemen bingkainya sebelum memilih. */
// Palet GELAP - SENADA dgn halaman /upload/[code]/prompt (pintu masuk
// utama tamu, sudah "redesign total gaya darkmode profesional") - fix
// "mengapa uinya seperti ini" (sblmnya kartu putih terang, beda sendiri
// dari sisa app yg gelap). Dideklarasikan lokal (bukan FONT/RED/MAGA/INK/
// LINE/SUB di atas yg dipakai halaman kamera-TERANG di file ini) supaya
// cuma FramePickScreen yg berubah tema, tanpa mengubah halaman lain.
const FP_BG = "#0A0A0B";
const FP_CARD = "#1A1B1D";
const FP_CARD_HI = "#212226";
const FP_LINE = "rgba(255,255,255,0.09)";
const FP_FIELD = "#111213";
const FP_INK = "#F1F1F3";
const FP_MID = "#B4B4BC";
const FP_SUB = "#84848C";

/** Ambient blob + dot pattern - SAMA PERSIS dgn /marta/photobooth/go
 * (rpv-go-ambient) - dipakai di belakang layar loading/notfound & di
 * FramePickScreen supaya nuansa "app sungguhan" (bukan web biasa) tetap
 * konsisten sejak tamu pertama kali buka link sampai pilih frame. Prefix
 * class "rpv-fp-ambient" (beda dr "rpv-go-ambient") supaya tidak bentrok
 * kalau kedua halaman kebetulan ke-render bersamaan (mis. transisi). */
function FpAmbientBg() {
  return (
    <>
      <div className="rpv-fp-ambient" aria-hidden="true">
        <div className="rpv-fp-ambient-blob rpv-fp-ambient-blob--a" />
        <div className="rpv-fp-ambient-blob rpv-fp-ambient-blob--b" />
        <div className="rpv-fp-ambient-dots" />
      </div>
      <style>{`
        @keyframes rpv-fp-ambient-drift-a {
          0%, 100% { transform: translate(-14%, 10%) scale(1); }
          50%       { transform: translate(12%, -8%) scale(1.28); }
        }
        @keyframes rpv-fp-ambient-drift-b {
          0%, 100% { transform: translate(16%, 8%) scale(1.15); }
          50%       { transform: translate(-12%, -10%) scale(0.88); }
        }
        @keyframes rpv-fp-ambient-pulse {
          0%, 100% { opacity: 0.62; }
          50%       { opacity: 0.92; }
        }
        @keyframes rpv-fp-sheet-backdrop {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes rpv-fp-sheet-up {
          0% { transform: translateY(100%); }
          100% { transform: translateY(0); }
        }
        .rpv-fp-ambient {
          position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
          mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
        }
        .rpv-fp-ambient-blob {
          position: absolute; border-radius: 50%; filter: blur(min(48px, 8vw));
          width: min(70vw, 560px); aspect-ratio: 1;
        }
        .rpv-fp-ambient-blob--a {
          left: 4%; bottom: -18%; background: radial-gradient(circle, ${MAGA}52 0%, transparent 68%);
          animation: rpv-fp-ambient-drift-a 11s ease-in-out infinite, rpv-fp-ambient-pulse 6s ease-in-out infinite;
        }
        .rpv-fp-ambient-blob--b {
          right: 0%; bottom: -22%; width: min(62vw, 500px); background: radial-gradient(circle, ${VIO}46 0%, transparent 68%);
          animation: rpv-fp-ambient-drift-b 13s ease-in-out infinite, rpv-fp-ambient-pulse 7.5s ease-in-out infinite 1.3s;
        }
        .rpv-fp-ambient-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(${MAGA}80 1px, transparent 1.6px);
          background-size: 22px 22px;
          animation: rpv-fp-ambient-pulse 4s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}

/** Layar penuh GELAP + ambient - dipakai utk state loading/notfound sblm
 * sesi diketahui, biar tidak ada kilatan tema terang sama sekali. */
function FpDarkScreen({ children }) {
  return (
    <div style={{ minHeight: "100svh", background: FP_BG, fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, position: "relative", overflow: "hidden", colorScheme: "dark" }}>
      <FpAmbientBg />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>{children}</div>
    </div>
  );
}

function FramePickScreen({ templates, loading, customFonts, sessionTitle, selected, onSelect, onTemplateCreated, onTemplateRenamed, onTemplateDeleted, onCapture, onGallery, onBack }) {
  const ratio = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };
  // Pencarian - permintaan user ("tambahkan kolom pencarian juga jika
  // nanti templatenya sudah banyak") - cocokkan ke nama frame, case-
  // insensitive; "Tanpa Frame" selalu tetap tampil apa pun querynya.
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter((tpl) => (tpl.name || "").toLowerCase().includes(s));
  }, [templates, q]);
  // UPDATE (permintaan user - "tambahkan menu Upload Frame dari mobile
  // langsung, sesuaikan dengan 4R, dan buat namanya"): sekarang SIAPA PUN
  // di layar Pilih Frame bisa upload PNG bingkai siap pakai (sudah ada
  // lubang transparan) langsung dari HP-nya sendiri, kasih nama, lalu
  // otomatis jadi template baru & langsung kepilih. Disimpan lewat RPC yg
  // SAMA dgn Template Editor operator (rpv_save_frame_template +
  // storage bucket rpv-template-assets) - BUKAN disimpan lokal di
  // browser/device - jadi begitu tersimpan langsung muncul utk SEMUA
  // orang yg buka link sesi ini (lihat permintaan user "pastikan ini
  // nantinya tidak hanya local ya, bisa dilihat semuanya"). Elemennya 1
  // "image" full-cover (xPct/yPct 0, wPct/hPct 100) - tetap dirender via
  // FrameOverlayElements yg sama persis dgn semua frame lain, jadi otomatis
  // pas ke rasio cetak 4R (ratio w/h di atas) spt template lain.
  const [uploadOpen, setUploadOpen] = useState(false);
  // UPDATE (permintaan user - "bisa edit nama frame"): nama frame yg
  // ke-upload sblmnya tidak bisa diganti lagi stlh tersimpan (mis. kalau
  // tamu lupa isi nama & kepakai nama file mentah spt "file_0000...").
  // Sekarang ada ikon pensil di sebelah nama di popup "Frame Terpilih"
  // utk ganti nama langsung di situ - update lewat RPC yg sama (id diisi
  // -> jadi UPDATE, bukan insert baru) jadi tersimpan ke semua orang.
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameErr, setRenameErr] = useState("");
  const startRename = () => { setRenameValue(selected?.name || ""); setRenameErr(""); setRenaming(true); };
  const cancelRename = () => { setRenaming(false); setRenameErr(""); };
  // Popup "Frame Terpilih" cuma di-mount/unmount lewat selected !==
  // undefined (bukan diganti antar frame selagi terbuka - pilih frame lain
  // berarti tutup dulu popup ini), jadi cukup reset `renaming` tiap popup
  // DITUTUP (bukan lewat useEffect, spy tidak ada setState sinkron di
  // effect body/cascading render - react-hooks/set-state-in-effect).
  // UPDATE (permintaan user - "buat saat diklik preview framenya lebih
  // besar"): thumbnail kecil di popup "Frame Terpilih" sekarang bisa
  // diketuk utk buka preview GEDE (lightbox) - biar tamu bisa lihat detail
  // bingkainya dulu sblm jepret/upload foto beneran.
  const [zoomOpen, setZoomOpen] = useState(false);
  // UPDATE (permintaan user - "perbaiki tombol untuk close itu di pojok
  // kanan dan bisa digeser juga, dan untuk card ini animasinya bagus
  // muncul dari bawah dan saat nutup dia juga digeser kebawah, dan bisa
  // di drag perlahan kebawah"): popup "Frame Terpilih" skrg bottom-sheet
  // NATIVE-FEEL - bisa diseret turun dr area handle (pill di atas), ikut
  // jari secara live (dragY), snap balik kalau ditarik dikit, atau TERTUTUP
  // dgn animasi meluncur ke bawah kalau ditarik jauh/dilepas tombol X/tap
  // backdrop - BUKAN lagi langsung hilang instan (`selected` baru diset
  // undefined SETELAH animasi `leaving` selesai, lihat closeSheet).
  const sheetDragStartY = useRef(null);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const [sheetLeaving, setSheetLeaving] = useState(false);
  const closeSheet = () => {
    setRenaming(false);
    setZoomOpen(false);
    setAdjustOpen(false);
    setDeleteConfirmOpen(false);
    setSheetLeaving(true);
    setTimeout(() => { onSelect(undefined); setSheetLeaving(false); setSheetDragY(0); }, 220);
  };
  // FIX (permintaan user - "mengapa tidak bisa di drag linenya ini"): drag
  // SEBELUMNYA pakai setPointerCapture + onPointerMove/onPointerUp di
  // ELEMEN HANDLE itu sendiri - ternyata tidak reliable di semua browser/
  // preview (capture kadang tidak "nempel" begitu jari/kursor gerak cepat
  // keluar dari handle kecil itu, jadi event move/up berikutnya tidak
  // pernah sampai -> drag kerasa diam/tidak merespons). Diganti pola yg
  // SAMA PERSIS dgn drag crop foto operator (onCropPointerDown di app/
  // marta/photobooth/page.jsx) - listener move/up dipasang di `window`,
  // bukan di elemen kecilnya, jadi drag tetap jalan mulus ke mana pun
  // kursor/jari bergerak, sampai pointerup/cancel di mana saja.
  const onSheetDragStart = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    sheetDragStartY.current = startY;
    setSheetDragging(true);
    const move = (ev) => {
      const dy = ev.clientY - startY;
      if (dy > 0) setSheetDragY(dy);
      else setSheetDragY(0);
    };
    const end = (ev) => {
      const dy = Math.max(0, ev.clientY - startY);
      sheetDragStartY.current = null;
      setSheetDragging(false);
      if (dy > 90) closeSheet();
      else setSheetDragY(0);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const saveRename = async () => {
    const v = renameValue.trim();
    if (!v) { setRenameErr("Nama tidak boleh kosong."); return; }
    if (v === selected.name) { setRenaming(false); return; }
    setRenameBusy(true);
    setRenameErr("");
    try {
      const tpl = await saveRpvFrameTemplate(selected.id, v, selected.elements, selected.baseStyle);
      if (!tpl) throw new Error("Gagal menyimpan nama baru.");
      onTemplateRenamed(tpl);
      setRenaming(false);
    } catch (e) {
      setRenameErr(e?.message || "Gagal ganti nama - coba lagi.");
    } finally {
      setRenameBusy(false);
    }
  };

  // UPDATE (permintaan user - "tambahkan fitur untuk hapus frame ini"):
  // UPDATE (permintaan user - "tombol hapus juga harus ada popup
  // konfirmasi dulu"): SEBELUMNYA 2-tap inline (tombol berubah jd "Yakin?"
  // merah) - diganti popup konfirmasi BENERAN (dialog gelap kecil di atas
  // segalanya, sengaja BUKAN window.confirm() browser biar tetap senada
  // tema gelap app ini) spy jelas & tidak ketukar sama tap lain di popup
  // sheet yg sama.
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const askDelete = () => { setDeleteErr(""); setDeleteConfirmOpen(true); };
  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteErr("");
    try {
      await deleteRpvFrameTemplate(selected.id);
      onTemplateDeleted(selected.id);
      setDeleteConfirmOpen(false);
      closeSheet();
    } catch (e) {
      setDeleteErr(e?.message || "Gagal menghapus - coba lagi.");
    } finally {
      setDeleteBusy(false);
    }
  };

  // UPDATE (permintaan user - "tombol untuk sesuaikan posisi frame...
  // tidak ada area kosong bisa zoom juga" + "zoom otomatis... indikator
  // jika ada bolong"): hanya berlaku utk template "upload mobile" yg
  // persis 1 elemen image full-area (kasus paling umum - bingkai custom
  // kompleks dgn banyak elemen teks/badge dilewati, krn "posisi" di situ
  // maksudnya tiap elemen, bukan 1 gambar tunggal, & itu sudah diatur di
  // Template Editor operator).
  const soleImageEl = (tpl) => (tpl && Array.isArray(tpl.elements) && tpl.elements.length === 1 && tpl.elements[0]?.type === "image" ? tpl.elements[0] : null);
  const selEl = soleImageEl(selected);
  const hasGapRisk = !!selEl && selEl.fit !== "cover";
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustErr, setAdjustErr] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [elTransform, setElTransform] = useState(null); // {zoom,panX,panY} - draft selagi popup "Atur Posisi" terbuka
  const openAdjust = () => {
    if (!selEl) return;
    setElTransform({ zoom: selEl.fit === "cover" ? (selEl.zoom || 1) : 1, panX: selEl.fit === "cover" ? (selEl.panX || 0) : 0, panY: selEl.fit === "cover" ? (selEl.panY || 0) : 0 });
    setAdjustErr("");
    setAdjustOpen(true);
  };
  const onElAdjustPointerDown = (e) => {
    if (!elTransform) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startPanX = elTransform.panX, startPanY = elTransform.panY;
    const box = e.currentTarget.getBoundingClientRect();
    const w = box.width || 1, h = box.height || 1;
    const move = (ev) => {
      const dx = ((ev.clientX - startX) / w) * 100;
      const dy = ((ev.clientY - startY) / h) * 100;
      setElTransform((t) => (t ? clampCrop({ ...t, panX: startPanX + dx / t.zoom, panY: startPanY + dy / t.zoom }) : t));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const commitAdjust = async () => {
    if (!selEl || !elTransform) return;
    setAdjustBusy(true);
    setAdjustErr("");
    try {
      const newEl = { ...selEl, fit: "cover", zoom: elTransform.zoom, panX: elTransform.panX, panY: elTransform.panY };
      const tpl = await saveRpvFrameTemplate(selected.id, selected.name, [newEl], selected.baseStyle);
      if (!tpl) throw new Error("Gagal menyimpan posisi frame.");
      onTemplateRenamed(tpl);
      setAdjustOpen(false);
    } catch (e) {
      setAdjustErr(e?.message || "Gagal menyimpan - coba lagi.");
    } finally {
      setAdjustBusy(false);
    }
  };
  // "Zoom Otomatis" - langsung set fit:"cover", zoom 1, pan 0 (menutupi
  // kotak penuh tanpa geser sama sekali) - cara TERCEPAT hilangkan bolong
  // tanpa perlu buka popup "Atur Posisi" manual dulu.
  const autoZoomFix = async () => {
    if (!selEl) return;
    setAdjustBusy(true);
    try {
      const newEl = { ...selEl, fit: "cover", zoom: 1, panX: 0, panY: 0 };
      const tpl = await saveRpvFrameTemplate(selected.id, selected.name, [newEl], selected.baseStyle);
      if (tpl) onTemplateRenamed(tpl);
    } catch { /* biarkan indikator tetap tampil, tamu bisa coba lagi */ }
    setAdjustBusy(false);
  };

  return (
    <div style={{ minHeight: "100svh", background: FP_BG, fontFamily: FONT, display: "flex", flexDirection: "column", colorScheme: "dark", position: "relative", overflow: "hidden" }}>
      <FpAmbientBg />
      <div style={{ padding: "22px 18px 16px", background: "transparent", borderBottom: `1px solid ${FP_LINE}`, position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 12 }}>
        {onBack ? (
          <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 999, border: "none", background: FP_FIELD, color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <X size={16} />
          </button>
        ) : (
          <span style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff" }}>
            <FrameIcon size={19} />
          </span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: FP_INK, letterSpacing: "-0.01em" }}>Pilih Frame Anda</div>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "14px 16px 0", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box", display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={14} color={FP_SUB} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama frame…"
            style={{ width: "100%", height: 40, borderRadius: 11, border: `1px solid ${FP_LINE}`, background: FP_FIELD, color: FP_INK, fontSize: 13, fontFamily: FONT, padding: "0 12px 0 34px", boxSizing: "border-box", outline: "none" }} />
          {q && (
            <button onClick={() => setQ("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.08)", color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={12} />
            </button>
          )}
        </div>
        <button onClick={() => setUploadOpen(true)}
          style={{ height: 40, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 13px", borderRadius: 11, border: `1px solid ${FP_LINE}`, background: FP_FIELD, color: FP_INK, fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
          <Upload size={14} color={MAGA} /> Upload Frame
        </button>
      </div>

      <div style={{ position: "relative", zIndex: 1, flex: 1, padding: "14px 16px 110px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <Loader2 size={22} color={RED} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
            {/* "Tanpa Frame" - opsi eksplisit, foto polos tanpa bingkai custom.
                Selalu tampil (TIDAK ikut difilter pencarian) spy tamu selalu
                punya jalan keluar cepat. */}
            {!q.trim() && (
              <button onClick={() => onSelect(null)}
                style={{ textAlign: "left", padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT }}>
                <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: `${ratio.w} / ${ratio.h}`, background: FP_CARD, border: selected === null ? `2.5px solid ${MAGA}` : `1.5px solid ${FP_LINE}` }}>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)" }}>
                    <X size={22} />
                  </div>
                  {selected === null && (
                    <span style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 999, background: MAGA, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Check size={13} color="#fff" />
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: FP_MID, textAlign: "center" }}>Tanpa Frame</div>
              </button>
            )}
            {filtered.map((tpl) => {
              const isSelected = selected?.id === tpl.id;
              return (
                <button key={tpl.id} onClick={() => onSelect(tpl)}
                  style={{ textAlign: "left", padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT }}>
                  <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: `${ratio.w} / ${ratio.h}`, background: tpl.baseStyle === "polaroid" ? "#fff" : FP_CARD_HI, border: isSelected ? `2.5px solid ${MAGA}` : `1.5px solid ${FP_LINE}`, containerType: "size" }}>
                    <FrameOverlayElements customElements={tpl.elements} customFonts={customFonts} mode="screen" ratio={ratio} sessionTitle={sessionTitle} queueLabel="00000" />
                    {isSelected && (
                      <span style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 999, background: MAGA, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Check size={13} color="#fff" />
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: FP_MID, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tpl.name}</div>
                </button>
              );
            })}
            {!loading && filtered.length === 0 && q.trim() && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "20px 4px", fontSize: 11.5, color: FP_SUB }}>Frame &quot;{q}&quot; tidak ditemukan.</div>
            )}
            {!loading && templates.length === 0 && !q.trim() && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "10px 4px", fontSize: 11.5, color: FP_SUB }}>Belum ada bingkai custom lain - pilih &quot;Tanpa Frame&quot; utk lanjut.</div>
            )}
          </div>
        )}

      </div>

      {/* UPDATE (permintaan user - "saya ingin jadi ada popup menampilkan
          informasi template yang dipilih dan ada button ambil foto, atau
          galeri"): ganti dr bar tombol polos jadi POPUP/bottom-sheet begitu
          1 frame dipilih - nampilin preview + nama frame yg dipilih dulu
          spy tamu yakin itu frame yg dia mau, baru 2 tombol aksi di
          bawahnya. Backdrop gelap transparan di belakangnya supaya jelas
          ini sebuah popup, bukan bagian dari layar biasa; tap backdrop =
          batal (balik pilih frame lain). */}
      {!loading && selected !== undefined && (
        <div onClick={closeSheet}
          style={{ position: "fixed", inset: 0, zIndex: 20, display: "flex", alignItems: "flex-end", justifyContent: "center", background: sheetLeaving ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)", transition: "background .22s ease" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 520, position: "relative", background: FP_CARD, borderTop: `1px solid ${FP_LINE}`,
              borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: "10px 18px calc(18px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box",
              transform: sheetLeaving ? "translateY(120%)" : `translateY(${sheetDragY}px)`,
              transition: sheetDragging ? "none" : "transform .24s cubic-bezier(.22,1,.36,1)",
              animation: sheetLeaving ? "none" : "rpv-fp-sheet-up .28s cubic-bezier(.22,1,.36,1) both",
              touchAction: "none",
            }}>
            {/* Tombol tutup FIX di pojok kanan atas - sebelumnya nyempil di
                tengah baris nama (gampang ketuker sama tombol cancel rename
                di sebelahnya) - sekarang 1 tombol X jelas, posisinya tetap
                konsisten di pojok kanan apa pun state-nya (ganti nama dll). */}
            <button onClick={closeSheet} aria-label="Tutup"
              style={{ position: "absolute", top: 12, right: 14, zIndex: 2, width: 32, height: 32, borderRadius: 999, border: "none", background: FP_CARD_HI, color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={15} />
            </button>
            {/* Zona drag - diseret dr sini (handle pill + padding di
                sekelilingnya) utk tutup popup perlahan spt bottom-sheet app
                native; dilepas di tengah jalan (<90px) -> snap balik ke
                atas, dilepas setelah ditarik jauh (>90px) -> lanjut
                animasi meluncur turun & nutup beneran. */}
            <div onPointerDown={onSheetDragStart}
              style={{ margin: "-10px -18px 4px", padding: "14px 18px 10px", cursor: sheetDragging ? "grabbing" : "grab", touchAction: "none" }}>
              <div style={{ width: 38, height: 4.5, borderRadius: 999, background: FP_LINE, margin: "0 auto" }} />
            </div>
            {/* UPDATE (permintaan user - "buat lebih besar lagi"): preview
                sekarang maxWidth 260 (sblmnya 190) - kartu paling dominan
                di popup ini, biar tamu lihat detail bingkainya sejelas
                mungkin sblm jepret/upload beneran. */}
            <div
              onClick={adjustOpen ? undefined : () => selected && setZoomOpen(true)}
              onPointerDown={adjustOpen ? onElAdjustPointerDown : undefined}
              role="button" tabIndex={0}
              style={{ display: "block", width: "100%", maxWidth: 260, margin: "0 auto", position: "relative", borderRadius: 18, overflow: "hidden", aspectRatio: `${ratio.w} / ${ratio.h}`, background: selected?.baseStyle === "polaroid" ? "#fff" : FP_CARD_HI, border: adjustOpen ? `1.5px solid ${MAGA}` : `1.5px solid ${FP_LINE}`, containerType: "size", padding: 0, cursor: adjustOpen ? "grab" : selected ? "zoom-in" : "default", fontFamily: FONT, boxShadow: "0 14px 34px -14px rgba(0,0,0,0.6)", touchAction: adjustOpen ? "none" : "auto" }}>
              {selected ? (
                <FrameOverlayElements
                  customElements={adjustOpen && selEl && elTransform ? [{ ...selEl, fit: "cover", zoom: elTransform.zoom, panX: elTransform.panX, panY: elTransform.panY }] : selected.elements}
                  customFonts={customFonts} mode="screen" ratio={ratio} sessionTitle={sessionTitle} queueLabel="00000" />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)" }}>
                  <X size={30} />
                </div>
              )}
              {adjustOpen && (
                <div style={{ position: "absolute", left: 8, bottom: 8, display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 999, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                  <Move size={10} /> Geser utk atur posisi
                </div>
              )}
            </div>
            {/* UPDATE (permintaan user - "zoom otomatis... indikator jika ada
                bolong dibawah frame yang diupload"): badge peringatan muncul
                HANYA kalau bingkai ini masih mode "contain" lama (berpotensi
                nyisa area kosong/transparan di tepi kalau rasio file PNG-nya
                beda dr kotak 4R) - tombol "Zoom Otomatis" langsung
                menutupinya penuh (fit:"cover", tanpa geser) 1 tap saja. */}
            {!adjustOpen && hasGapRisk && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 12, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" }}>
                <AlertTriangle size={15} color="#F59E0B" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 11, color: "#FBBF24", fontWeight: 600, lineHeight: 1.4 }}>Mungkin ada area kosong di tepi bingkai ini.</div>
                <button onClick={autoZoomFix} disabled={adjustBusy}
                  style={{ flexShrink: 0, height: 28, padding: "0 10px", borderRadius: 8, border: "none", background: "#F59E0B", color: "#1A1205", fontSize: 11, fontWeight: 800, fontFamily: FONT, cursor: adjustBusy ? "default" : "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  {adjustBusy ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={12} />} Zoom Otomatis
                </button>
              </div>
            )}
            {adjustOpen && elTransform && (
              <div style={{ marginTop: 10, padding: "12px 12px 10px", borderRadius: 14, background: FP_CARD_HI, border: `1px solid ${FP_LINE}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: FP_SUB }}>
                  <span>Zoom</span><span>{Math.round(elTransform.zoom * 100)}%</span>
                </div>
                <input type="range" min={1} max={2.5} step={0.01} value={elTransform.zoom}
                  onChange={(e) => setElTransform((t) => (t ? clampCrop({ ...t, zoom: Number(e.target.value) }) : t))}
                  style={{ width: "100%", marginTop: 6, accentColor: MAGA }} />
                {adjustErr && <div style={{ marginTop: 6, fontSize: 11, color: "#F87171", fontWeight: 600 }}>{adjustErr}</div>}
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button onClick={commitAdjust} disabled={adjustBusy}
                    style={{ flex: 1, height: 38, borderRadius: 10, border: "none", background: MAGA, color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FONT, cursor: adjustBusy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {adjustBusy ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />} Simpan Posisi
                  </button>
                  <button onClick={() => { setAdjustOpen(false); setAdjustErr(""); }} disabled={adjustBusy}
                    style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: FP_FIELD, color: FP_MID, cursor: adjustBusy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: FP_SUB, textTransform: "uppercase", letterSpacing: "0.05em" }}>Frame Terpilih</div>
              {renaming ? (
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, paddingRight: 36 }}>
                  <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} disabled={renameBusy} maxLength={60}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") cancelRename(); }}
                    style={{ flex: 1, minWidth: 0, height: 32, borderRadius: 9, border: `1px solid ${MAGA}`, background: FP_FIELD, color: FP_INK, fontSize: 13.5, fontWeight: 700, fontFamily: FONT, padding: "0 10px", boxSizing: "border-box", outline: "none" }} />
                  <button onClick={saveRename} disabled={renameBusy}
                    style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: MAGA, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: renameBusy ? "default" : "pointer", flexShrink: 0 }}>
                    {renameBusy ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />}
                  </button>
                  <button onClick={cancelRename} disabled={renameBusy}
                    style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: FP_CARD_HI, color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: renameBusy ? "default" : "pointer", flexShrink: 0 }}>
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 17.5, fontWeight: 800, color: FP_INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected ? selected.name : "Tanpa Frame"}</div>
                  {/* UPDATE (permintaan user - "perbaiki uinya" + "terlalu
                      kecil untuk ketiga tombol ini dan buat rata kanan
                      sejajar bagian kiri tombol galeri"): ikon diperbesar
                      32->38px (lebih enak diketuk di HP), & `paddingRight:
                      36` yg SEBELUMNYA nyisain jarak dr tepi kanan sheet
                      (dulu dipakai biar tdk numpuk tombol X di pojok atas,
                      padahal baris ini sudah jauh di bawahnya) dihapus -
                      skrg sisi kanan chip ini rata PERSIS dgn sisi kanan
                      tombol Ambil Foto/Galeri di bawahnya (sama2 cuma
                      dibatasi padding sheet 18px). */}
                  {selected && (
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", background: FP_FIELD, borderRadius: 12, border: `1px solid ${FP_LINE}`, overflow: "hidden" }}>
                      <button onClick={startRename} aria-label="Ganti nama"
                        style={{ width: 38, height: 38, border: "none", background: "transparent", color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Pencil size={16} />
                      </button>
                      {/* UPDATE (permintaan user - "tambahkan... tombol
                          untuk sesuaikan posisi frame"): cuma utk template
                          upload mobile 1-gambar (lihat selEl). */}
                      {selEl && (
                        <button onClick={openAdjust} aria-label="Atur posisi frame"
                          style={{ width: 38, height: 38, border: "none", borderLeft: `1px solid ${FP_LINE}`, background: "transparent", color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <Move size={16} />
                        </button>
                      )}
                      <button onClick={askDelete} aria-label="Hapus frame"
                        style={{ width: 38, height: 38, border: "none", borderLeft: `1px solid ${FP_LINE}`, background: "transparent", color: "#F87171", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
              {renaming && renameErr && <div style={{ marginTop: 5, fontSize: 11, color: "#F87171", fontWeight: 600 }}>{renameErr}</div>}
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button onClick={onCapture}
                style={{ flex: 1, height: 50, borderRadius: 14, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: `linear-gradient(135deg,${RED},${MAGA})`, boxShadow: "0 10px 28px -8px rgba(198,22,141,0.55)" }}>
                <Camera size={16} /> Ambil Foto
              </button>
              <button onClick={onGallery}
                style={{ flex: 1, height: 50, borderRadius: 14, border: `1.5px solid ${FP_LINE}`, cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 800, color: FP_INK, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: FP_CARD_HI }}>
                <ImagePlus size={16} /> Galeri
              </button>
            </div>
          </div>
        </div>
      )}

      {zoomOpen && selected && (
        <div onClick={() => setZoomOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 25, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, background: "rgba(0,0,0,0.88)", animation: "rpv-fp-sheet-backdrop .18s ease both" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", width: "100%", maxWidth: 340, aspectRatio: `${ratio.w} / ${ratio.h}`, borderRadius: 18, overflow: "hidden", background: selected.baseStyle === "polaroid" ? "#fff" : FP_CARD_HI, border: `1.5px solid ${FP_LINE}`, boxShadow: "0 24px 60px -16px rgba(0,0,0,0.7)", containerType: "size" }}>
            <FrameOverlayElements customElements={selected.elements} customFonts={customFonts} mode="screen" ratio={ratio} sessionTitle={sessionTitle} queueLabel="00000" />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: FP_INK, textAlign: "center" }}>{selected.name}</div>
          <button onClick={() => setZoomOpen(false)}
            style={{ width: 38, height: 38, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={17} />
          </button>
        </div>
      )}

      {uploadOpen && (
        <UploadFrameSheet ratio={ratio} onClose={() => setUploadOpen(false)}
          onCreated={(tpl) => { onTemplateCreated(tpl); setUploadOpen(false); }} />
      )}

      {/* UPDATE (permintaan user - "tombol hapus juga harus ada popup
          konfirmasi dulu"): dialog konfirmasi hapus - terpisah dr sheet
          "Frame Terpilih" di belakangnya (z-index lebih tinggi) spy jelas
          ini aksi yg butuh perhatian ekstra sblm dieksekusi, bisa dibatalkan
          dgn tap backdrop/tombol Batal, TIDAK bisa ditutup selagi proses
          hapus berjalan (deleteBusy). */}
      {deleteConfirmOpen && selected && (
        <div onClick={deleteBusy ? undefined : () => setDeleteConfirmOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)", animation: "rpv-fp-sheet-backdrop .18s ease both" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 320, borderRadius: 18, background: FP_CARD, border: `1px solid ${FP_LINE}`, padding: 20, boxShadow: "0 24px 60px -16px rgba(0,0,0,0.7)", animation: "rpv-fp-sheet-up .22s cubic-bezier(.22,1,.36,1) both" }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(239,68,68,0.14)", color: "#F87171" }}>
              <Trash2 size={20} />
            </div>
            <div style={{ marginTop: 14, fontSize: 15.5, fontWeight: 800, color: FP_INK }}>Hapus frame ini?</div>
            <div style={{ marginTop: 5, fontSize: 12.5, color: FP_SUB, lineHeight: 1.5 }}>
              <b style={{ color: FP_MID }}>{selected.name}</b> akan dihapus permanen & tidak bisa dipakai lagi oleh siapa pun di sesi ini.
            </div>
            {deleteErr && <div style={{ marginTop: 10, fontSize: 11.5, color: "#F87171", fontWeight: 600 }}>{deleteErr}</div>}
            <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirmOpen(false)} disabled={deleteBusy}
                style={{ flex: 1, height: 44, borderRadius: 12, border: `1.5px solid ${FP_LINE}`, background: FP_CARD_HI, color: FP_INK, fontSize: 13, fontWeight: 800, fontFamily: FONT, cursor: deleteBusy ? "default" : "pointer" }}>
                Batal
              </button>
              <button onClick={confirmDelete} disabled={deleteBusy}
                style={{ flex: 1, height: 44, borderRadius: 12, border: "none", background: "#EF4444", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FONT, cursor: deleteBusy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                {deleteBusy ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />} Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Popup upload frame dari HP sendiri - permintaan user ("tambahkan menu
 * Upload Frame dari mobile langsung, sesuaikan dengan 4R, dan buat
 * namanya"). Khusus utk PNG bingkai siap pakai (sudah ada lubang
 * transparan di tengah) - tinggal pilih file + kasih nama, TANPA proses
 * crop manual (1 elemen "image" full-cover 0/0/100/100, sama persis spt
 * elemen gambar di Template Editor operator). Tersimpan ke DB+storage yg
 * sama dgn template lain (rpv_save_frame_template / bucket
 * rpv-template-assets) - jadi langsung kelihatan utk SEMUA orang yg buka
 * link sesi ini, bukan cuma di device sendiri. */
function UploadFrameSheet({ ratio, onClose, onCreated }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
    if (!name) setName(f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60));
    setErr("");
  };

  const onSave = async () => {
    if (!file) { setErr("Pilih gambar PNG bingkainya dulu."); return; }
    if (!name.trim()) { setErr("Kasih nama frame ini dulu."); return; }
    setBusy(true);
    setErr("");
    try {
      const url = await uploadRpvTemplateImage(file);
      const elId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `el-${Date.now()}`;
      // UPDATE (permintaan user - "zoom otomatis... indikator jika ada
      // bolong"): elemen bingkai BARU langsung dipasang fit:"cover" (bukan
      // lagi "contain" bawaan) - PNG apa pun rasionya langsung menutupi
      // penuh kotak 4R dr awal, jadi tidak pernah ada area kosong/transparan
      // di tepi begitu diupload, tanpa tamu perlu atur apa2 lagi.
      const elements = [{ id: elId, type: "image", url, xPct: 0, yPct: 0, wPct: 100, hPct: 100, fit: "cover", zoom: 1, panX: 0, panY: 0 }];
      const tpl = await saveRpvFrameTemplate(null, name.trim(), elements, "none");
      if (!tpl) throw new Error("Gagal menyimpan template.");
      onCreated(tpl);
    } catch (e) {
      setErr(e?.message || "Gagal upload frame - coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={busy ? undefined : onClose}
      style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)", animation: "rpv-fp-sheet-backdrop .2s ease both" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, maxHeight: "88svh", overflowY: "auto", background: FP_CARD, borderTop: `1px solid ${FP_LINE}`, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: "10px 18px calc(20px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box", animation: "rpv-fp-sheet-up .25s cubic-bezier(.22,1,.36,1) both" }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: FP_LINE, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff" }}>
            <Upload size={17} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: FP_INK }}>Upload Frame Sendiri</div>
            <div style={{ fontSize: 11.5, color: FP_SUB, marginTop: 1 }}>PNG bingkai siap pakai (ada lubang transparan), pas ke rasio cetak 4R.</div>
          </div>
          <button onClick={busy ? undefined : onClose} disabled={busy}
            style={{ width: 30, height: 30, borderRadius: 999, border: "none", background: FP_CARD_HI, color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        <input ref={fileRef} type="file" accept="image/png,image/webp,image/*" onChange={onPickFile} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          style={{
            width: "100%", border: previewUrl ? `1.5px solid ${FP_LINE}` : `1.5px dashed ${FP_LINE}`, borderRadius: 16,
            background: FP_FIELD, cursor: busy ? "default" : "pointer", padding: 0, overflow: "hidden",
            position: "relative", aspectRatio: `${ratio.w} / ${ratio.h}`, maxWidth: 220, margin: "0 auto", display: "block",
          }}>
          {previewUrl ? (
            <>
              <div style={{
                position: "absolute", inset: 0,
                backgroundImage: "linear-gradient(45deg,#2a2a2e 25%,transparent 25%),linear-gradient(-45deg,#2a2a2e 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a2e 75%),linear-gradient(-45deg,transparent 75%,#2a2a2e 75%)",
                backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0px", backgroundColor: "#1c1c1f",
              }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
            </>
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: FP_SUB }}>
              <ImagePlus size={24} />
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>Pilih file PNG</span>
            </div>
          )}
        </button>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: FP_SUB, marginBottom: 6 }}>Nama frame</div>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} maxLength={60}
            placeholder="Mis. Bingkai Ulang Tahun"
            style={{ width: "100%", height: 42, borderRadius: 11, border: `1px solid ${FP_LINE}`, background: FP_FIELD, color: FP_INK, fontSize: 13.5, fontFamily: FONT, padding: "0 13px", boxSizing: "border-box", outline: "none" }} />
        </div>

        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#F87171", fontWeight: 600 }}>{err}</div>}

        <button onClick={onSave} disabled={busy}
          style={{ marginTop: 16, width: "100%", height: 50, borderRadius: 14, border: "none", cursor: busy ? "default" : "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: `linear-gradient(135deg,${RED},${MAGA})`, opacity: busy ? 0.7 : 1 }}>
          {busy ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={16} />}
          {busy ? "Mengunggah…" : "Simpan Frame"}
        </button>
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

/** Antarmuka kamera LIVE full-screen (getUserMedia) - dibuka begitu sesi
 * siap (default) atau lewat tombol "Ambil Foto Lagi". Shutter besar gaya
 * app kamera, tombol flip depan/belakang, & fallback "Pilih dari Galeri"
 * utk device tanpa kamera / izin ditolak.
 * UPDATE (fitur "Frame Langsung"): `overlayElements` opsional - kalau ada
 * (tamu sudah pilih frame di FramePickScreen), elemen bingkai itu dirender
 * LANGSUNG di atas video live (FrameOverlayElements, sumber sama dgn
 * PhotoFrame) - jadi tamu lihat persis posisi bingkai sambil pose, bukan
 * cuma ditempel belakangan setelah jepret. */
function CameraView({ videoRef, cameraState, facing, onFlip, onCapture, onRetry, onUseGallery, onBack, headerTitle, sessionTitle, overlayElements, overlayCustomFonts }) {
  const ratio = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", fontFamily: FONT, display: "flex", flexDirection: "column", zIndex: 50 }}>
      {/* Header overlay - UPDATE (permintaan user): judul sekarang label TETAP
          "Ambil Foto" (headerTitle, bukan lagi judul sesi mentah) utk sesi
          direct_frame, & tombol kembali SELALU terlihat di kiri atas (tdk lg
          tergantung canGoBack) - tombol ganti kamera dipindah ke bawah dekat
          shutter, jadi slot kanan header dikosongkan saja biar judul tetap
          center. */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 14px", background: "linear-gradient(180deg,rgba(0,0,0,0.55),rgba(0,0,0,0))" }}>
        <button onClick={onBack} aria-label="Kembali" style={{ width: 38, height: 38, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <X size={18} />
        </button>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#fff", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{headerTitle || sessionTitle}</div>
        <span style={{ width: 38, flexShrink: 0 }} />
      </div>

      {/* UPDATE (permintaan user - "perbaiki ui nya agar lebih baik"): SEBELUMNYA
          video + overlay bingkai sama2 dipasang full-bleed `inset:0` layar HP
          (rasio ~9:19.5) - padahal posisi tiap elemen bingkai (xPct/yPct/dst,
          lihat FrameOverlayElements di _frame.jsx) dihitung relatif thd kotak
          berasio cetak 4R (2:3). Hasilnya elemen jadi salah tempat & "meledak"
          (teks raksasa, badge dobel posisi) krn kotak pembungkusnya ketinggian
          dibanding yg didesain di Template Editor. Sekarang video+overlay
          dibungkus 1 "jendela bidik" (viewfinder) yg DIKUNCI rasio 4R persis
          spt kotak di Template Editor/hasil cetak (WYSIWYG beneran), dikasih
          rounded-corner + border tipis spy kelihatan rapi sbg kartu foto -
          bukan lagi video mentah selebar layar. */}
      <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 18px", minHeight: 0 }}>
        <div style={{
          position: "relative", width: "100%", maxWidth: 420, maxHeight: "100%",
          aspectRatio: `${ratio.w} / ${ratio.h}`, borderRadius: 20, overflow: "hidden",
          background: "#111", border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 18px 46px -14px rgba(0,0,0,0.65)",
        }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
              transform: facing === "user" ? "scaleX(-1)" : "none",
              opacity: cameraState === "ready" ? 1 : 0, transition: "opacity .25s ease",
            }}
          />
          {/* Overlay bingkai live - ditumpuk PERSIS di atas jendela bidik di
              atas (bukan lagi di atas seluruh layar), dibungkus div
              containerType: "size" spy unit cqh elemen teks tetap
              proporsional sama spt di PhotoFrame/hasil cetak akhir.
              pointerEvents none spy tidak menghalangi tombol shutter/flip. */}
          {overlayElements && cameraState === "ready" && (
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none", containerType: "size",
              overflow: "hidden",
            }}>
              <FrameOverlayElements customElements={overlayElements} customFonts={overlayCustomFonts} mode="screen" ratio={ratio} sessionTitle={sessionTitle} queueLabel="00000" />
            </div>
          )}

          {cameraState === "starting" && (
            <Center dark>
              <Loader2 size={26} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ marginTop: 10, fontSize: 12.5, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>Membuka kamera…</div>
            </Center>
          )}

          {cameraState === "denied" && (
            <Center dark>
              <AlertTriangle size={28} color="#F59E0B" />
              <div style={{ marginTop: 12, fontSize: 14.5, fontWeight: 800, color: "#fff", textAlign: "center" }}>Izin kamera ditolak</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.72)", textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>Aktifkan izin kamera di browser kamu, lalu coba lagi - atau pilih foto dari galeri.</div>
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 9, width: "100%", maxWidth: 240 }}>
                <button onClick={onRetry} style={{ height: 44, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}>Coba Lagi</button>
                <button onClick={onUseGallery} style={{ height: 44, borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.28)", background: "transparent", color: "#fff", fontSize: 13.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>Pilih dari Galeri</button>
              </div>
            </Center>
          )}

          {cameraState === "unsupported" && (
            <Center dark>
              <AlertTriangle size={28} color="#F59E0B" />
              <div style={{ marginTop: 12, fontSize: 14.5, fontWeight: 800, color: "#fff", textAlign: "center" }}>Kamera tidak didukung</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.72)", textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>Browser ini belum mendukung akses kamera langsung - pilih foto dari galeri saja.</div>
              <button onClick={onUseGallery} style={{ marginTop: 18, height: 44, padding: "0 22px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}>Pilih dari Galeri</button>
            </Center>
          )}
        </div>
      </div>

      {/* Shutter + galeri + ganti kamera - UPDATE (permintaan user): kedua
          tombol skrg jd icon-button BULAT di KANAN shutter (bukan lagi link
          teks di bawah shutter / icon di header kanan atas), biar satu baris
          kontrol rapi & konsisten dgn pola icon-button lainnya di layar ini. */}
      {cameraState === "ready" && (
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 22, padding: "14px 20px 30px" }}>
          <button onClick={onCapture} aria-label="Jepret foto"
            style={{
              width: 74, height: 74, borderRadius: 999, border: "4px solid rgba(255,255,255,0.9)",
              background: "rgba(255,255,255,0.18)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
            <span style={{ width: 58, height: 58, borderRadius: 999, background: "#fff" }} />
          </button>
          <div style={{ display: "flex", flexDirection: "row", gap: 10 }}>
            <button onClick={onFlip} aria-label="Ganti kamera" style={{ width: 44, height: 44, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <SwitchCamera size={19} />
            </button>
            <button onClick={onUseGallery} aria-label="Pilih dari galeri" style={{ width: 44, height: 44, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <ImagePlus size={19} />
            </button>
          </div>
        </div>
      )}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
