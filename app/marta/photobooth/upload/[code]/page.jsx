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
import { AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, Clock, Download, Frame as FrameIcon, ImagePlus, Images, Link2, Loader2, Move, Pencil, QrCode, RefreshCcw, RotateCcw, Search, Sparkles, SwitchCamera, Ticket, Trash2, Upload, X, Zap, ZoomIn } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { getRpvSession, uploadRpvPhoto, rpvThroughputMbps, listRpvPhotos, listRpvPhotosGallery, listRpvFrameTemplates, listRpvCustomFonts, rpvPublicUrl, subscribeRpvPhotos, saveRpvFrameTemplate, deleteRpvFrameTemplate, uploadRpvTemplateImage, saveRpvPhotoCrop } from "../../../../../lib/rpv";
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
  // "pastikan switch camera itu bukan flip orientasi kamera, jadi jika
  // kamera cuma satu ya tidak terjadi apa apa" - deteksi berapa KAMERA FISIK
  // (video input device) yg device tamu punya lewat enumerateDevices().
  // CATATAN: browser biasanya cuma expose 2 "device" (depan & belakang) utk
  // HP modern walau belakangnya ada banyak lensa fisik (wide/ultra-wide/
  // telephoto) - lensa2 itu disatukan di balik facingMode:"environment" oleh
  // OS/browser, jadi tidak bisa dibedakan dari web. Yang BISA dideteksi &
  // berguna: kalau device CUMA punya 1 kamera (mis. laptop/webcam tunggal),
  // tombol ganti kamera di-nonaktifkan supaya tidak coba flip ke lensa yg
  // tidak ada (yg sebelumnya bisa bikin error getUserMedia / flip ke stream
  // identik tanpa guna).
  const [hasMultipleCameras, setHasMultipleCameras] = useState(true); // optimis sampai terbukti sebaliknya

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
      // UPDATE (permintaan user - "mengapa hasilnya tercompress ya, saya
      // ingin original quality"): SEBELUMNYA getUserMedia dipanggil TANPA
      // batasan resolusi sama sekali - browser/device bebas kasih stream
      // seadanya (banyak device DEFAULT ke resolusi rendah spt 640x480 kalau
      // tidak diminta eksplisit), jadi hasil jepretan ikut kabur/kecil
      // walau kamera fisiknya jauh lebih tinggi. Skrg diminta resolusi
      // SETINGGI MUNGKIN (ideal 4K, minimal diusahakan >= Full HD) - pakai
      // `ideal` (bukan `exact`) spy tetap AMAN fallback ke resolusi
      // tertinggi yg didukung kamera itu kalau 4K tidak tersedia, tidak
      // bikin getUserMedia gagal total di device yg kameranya lebih kecil.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraState("ready");
      // Baru SETELAH izin kamera diberikan device label video input terisi
      // (sebelum izin, enumerateDevices() cuma kasih device tanpa label &
      // kadang cuma 1 entri generik) - makanya cek jumlah kamera di sini,
      // bukan sebelum getUserMedia berhasil.
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(cams.length > 1);
      } catch {
        setHasMultipleCameras(true); // gagal deteksi -> jangan kunci tombol, biarkan seperti semula
      }
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

  const flipCamera = () => {
    if (!hasMultipleCameras) return; // kamera cuma 1 -> tidak terjadi apa apa (bukan flip orientasi)
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  };

  const enqueueCapturedBlob = (blob) => {
    if (!blob) return;
    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
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
  };

  // Ambil 1 FRAME dari video STREAM yg sedang tampil di layar (cara lama,
  // selalu tersedia di semua browser) - dipakai sbg FALLBACK kalau
  // ImageCapture.takePhoto() tidak didukung/gagal. Resolusinya dibatasi
  // resolusi stream video (lihat constraint width/height di startCamera),
  // BUKAN resolusi foto still asli sensor kamera device.
  const captureFromVideoFrame = () => new Promise((resolve) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { resolve(null); return; }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    // Mirror horizontal utk kamera depan ("user") - biar preview terasa
    // natural spt cermin (kiri-kanan sesuai gerakan tamu), sedangkan kamera
    // belakang ("environment") dibiarkan apa adanya.
    if (facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.98);
  });

  // Mirror horizontal 1 blob foto - dipakai khusus utk hasil
  // ImageCapture.takePhoto() kamera DEPAN: takePhoto() ambil langsung dari
  // sensor (jalur foto still, bukan video), jadi TIDAK otomatis ikut
  // ter-mirror spt tampilan <video> di layar - perlu di-flip manual di
  // sini spy hasilnya konsisten dgn apa yg tamu lihat saat menjepret.
  const mirrorBlobHorizontally = (blob) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((out) => resolve(out || blob), "image/jpeg", 0.98);
    };
    img.onerror = () => resolve(blob);
    img.src = URL.createObjectURL(blob);
  });

  // UPDATE (permintaan user - "ohh ini konsepnya video ya berarti tidak
  // bisa betul betul foto ya?"): SEBELUMNYA SELALU ambil foto lewat
  // captureFromVideoFrame (1 frame dari stream video) - resolusinya
  // dibatasi resolusi stream video, bukan resolusi foto still ASLI sensor
  // kamera (yg di HP modern umumnya jauh lebih tinggi drpd resolusi video
  // yg dikirim ke browser). Skrg DIUTAMAKAN pakai ImageCapture.takePhoto()
  // - API browser yg benar2 memakai jalur FOTO STILL kamera (bukan video) -
  // kalau device/browser-nya mendukung (umumnya Android/Chrome; iOS/
  // Safari TIDAK mendukung ImageCapture sama sekali). Gagal apa pun
  // sebabnya (tidak didukung, takePhoto() di-reject, dsb) -> otomatis
  // fallback diam2 ke cara lama spy tetap jalan normal di semua device.
  const capturePhoto = async () => {
    let blob = null;
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (track && typeof window !== "undefined" && "ImageCapture" in window) {
      try {
        const capture = new window.ImageCapture(track);
        const photoBlob = await capture.takePhoto();
        blob = facing === "user" ? await mirrorBlobHorizontally(photoBlob) : photoBlob;
      } catch {
        blob = null; // gagal -> lanjut fallback di bawah
      }
    }
    if (!blob) blob = await captureFromVideoFrame();
    enqueueCapturedBlob(blob);
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
          // UPDATE (permintaan user - "4 digit unique"): padStart turun dr
          // 5 ke 4 digit, sinkron dgn server (rpv_confirm_photo dkk).
          const queueLabel = row.queue_no != null ? String(row.queue_no).padStart(4, "0") : null;
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
    // FIX (permintaan user - "saat upload galeri gagal jangan biarkan dia
    // ke laman ini, dan... tambahkan tombol kembali... agar tidak stuck di
    // laman ini"): kamera DITUTUP DI SINI (setelah file benar2 terpilih),
    // BUKAN lagi lgsg saat tombol "Pilih dari Galeri" di CameraView ditekan
    // (lihat onUseGallery di bawah). Sebelumnya cameraOpen di-set false
    // SEBELUM tau hasil file-picker OS - kalau tamu batal pilih (atau
    // picker-nya gagal), cameraOpen sudah kadung false & framePicked sudah
    // true sejak sblmnya (dari alur "Ambil Foto"), jadi render JATUH ke
    // DirectFrameReviewScreen dgn queue MASIH KOSONG (blm ada foto sama
    // sekali) - layar itu TIDAK ADA tombol apa pun selain yg muncul kalau
    // queue.length > 0, jadi tamu macet permanen di layar kosong itu. Skrg
    // kamera cuma ditutup setelah kita BENAR2 punya file.
    setCameraOpen(false);
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
      // UPDATE (permintaan user - "perbaiki untuk penomoran foto dari Pilih
      // Frame ini... ubah nomor antrianya juga start dari 1, 4 digit unique
      // untuk semua foto dari semua frame agar mudah dicari di cms"):
      // uploadRpvPhoto skrg jg kasih balik queueNo/queueLabel (lihat
      // lib/rpv.js) - disimpan ke item antrean spy "{Photo ID}" di bingkai &
      // layar sukses nunjukin nomor BENERAN, bukan placeholder "0000" terus.
      const { photoCode, uploadMs, fileSizeBytes, queueNo, queueLabel } = await uploadRpvPhoto(code, item.file, (p) => {
        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, progress: p } : x)));
      }, { frameTemplateId: item.frameTemplateId || null });
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "done", progress: 1, photoCode, uploadMs, fileSizeBytes: fileSizeBytes ?? x.fileSizeBytes, queueNo, queueLabel } : x)));
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
          sessionCode={code}
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
        canFlip={hasMultipleCameras}
        onCapture={capturePhoto}
        onRetry={() => startCamera(facing)}
        // FIX (lihat catatan di onPick): kamera TIDAK ditutup di sini lagi -
        // cuma buka file-picker OS, kamera baru ditutup di onPick SETELAH
        // tamu benar2 pilih file (kalau batal, kamera tetap kebuka spt
        // semula, bukan loncat ke layar lain yg bisa kosong).
        onUseGallery={() => fileRef.current?.click()}
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
          // FIX (permintaan user - "tambahkan tombol kembali di kiri atas
          // agar tidak stuck di laman ini"): tombol X jaga-jaga di pojok
          // kiri atas - SELALU ada apa pun isi queue-nya (beda dgn tombol
          // "Batalkan" di bawah yg cuma muncul saat queue.length > 0),
          // supaya kalaupun suatu saat layar ini kebuka dgn queue kosong
          // (mis. sebab lain yg blm ketahuan), tamu tetap punya jalan keluar
          // - balik ke FramePickScreen, bukan macet permanen.
          onBack={() => {
            if (queue.length > 0 && !window.confirm("Foto yg sudah diambil/dipilih akan dibatalkan. Kembali ke pilih frame?")) return;
            queue.forEach((it) => removeItem(it.id));
            setFramePicked(false);
          }}
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
              {/* UPDATE (permintaan user - "jangan buat mengunggah
                  menggunakan 5G, ini bukan lagi untuk test 5G"): label
                  sblmnya eksplisit sebut "via 5G" (dulu dipakai utk
                  showcase kecepatan jaringan 5G booth) - skrg generic
                  "Mengunggah..." aja, krn acara ini bukan lagi demo 5G. */}
              <span>Mengunggah {doneCount + errorCount}/{queue.length}…</span>
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
  // UPDATE (permintaan user - "dan bisa pinch to zoom juga"): sebelumnya
  // cuma bisa zoom lewat slider di bawah kartu - skrg bisa jg cubit 2 jari
  // LANGSUNG di atas fotonya (gesture umum di semua app kamera/galeri HP).
  // Dipakai 1 set ref yg SAMA utk kedua gesture (geser 1 jari & cubit 2
  // jari) krn keduanya bisa terjadi berurutan dlm 1 sesi sentuh (mis. mulai
  // geser 1 jari, lalu jari ke-2 nempel -> otomatis pindah mode cubit, lalu
  // angkat 1 jari -> balik geser lagi) - makanya pelacakan pointer pakai
  // Map persisten (pointersRef), BUKAN cuma 1 pointer spt sblmnya.
  // cropRef/itemIdRef/onCropChangeRef selalu disinkronkan render terbaru
  // (assignment biasa, bukan baca saat render) spy listener window yg
  // di-attach SEKALI per sesi sentuh tetap baca data TERBARU, tidak basi.
  const pointersRef = useRef(new Map()); // pointerId -> {x, y}
  const pinchRef = useRef(null); // {startDist, startZoom}
  const listenersAttachedRef = useRef(false);
  const cropRef = useRef(crop);
  const onCropChangeRef = useRef(onCropChange);
  // FIX (lint react-hooks/refs - "Cannot access refs during render"): tulis
  // ref di useEffect, BUKAN langsung di body render (assignment langsung
  // sblmnya lolos logikanya tp dilarang aturan React - efek samping di
  // render dianggap "impure" walau cuma assignment ref, bukan baca state).
  useEffect(() => { cropRef.current = crop; }, [crop]);
  useEffect(() => { onCropChangeRef.current = onCropChange; }, [onCropChange]);
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

  const handleGestureMove = (ev) => {
    if (!pointersRef.current.has(ev.pointerId)) return;
    pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const scale = dist / pinchRef.current.startDist;
      const newZoom = Math.max(1, Math.min(4, pinchRef.current.startZoom * scale));
      onCropChangeRef.current(item.id, clampCrop({ ...cropRef.current, zoom: newZoom }));
      return;
    }
    if (dragRef.current && imgRef.current) {
      const w = imgRef.current.offsetWidth || 1;
      const h = imgRef.current.offsetHeight || 1;
      const dx = ((ev.clientX - dragRef.current.startX) / w) * 100;
      const dy = ((ev.clientY - dragRef.current.startY) / h) * 100;
      const rawX = dragRef.current.startPanX + dx / cropRef.current.zoom;
      const rawY = dragRef.current.startPanY + dy / cropRef.current.zoom;
      const next = clampCrop({ ...cropRef.current, panX: rawX, panY: rawY });
      if (next.panX !== rawX || next.panY !== rawY) flashLimit();
      onCropChangeRef.current(item.id, next);
    }
  };
  const handleGestureEnd = (ev) => {
    pointersRef.current.delete(ev.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
      window.removeEventListener("pointermove", handleGestureMove);
      window.removeEventListener("pointerup", handleGestureEnd);
      window.removeEventListener("pointercancel", handleGestureEnd);
      listenersAttachedRef.current = false;
    } else if (pointersRef.current.size === 1) {
      // 1 jari masih nempel stlh jari lain diangkat (keluar dari mode
      // cubit) - lanjut geser biasa dari posisi SEKARANG, bukan loncat.
      const [[, pos]] = pointersRef.current.entries();
      dragRef.current = { startX: pos.x, startY: pos.y, startPanX: cropRef.current.panX, startPanY: cropRef.current.panY };
    }
  };
  const onCropPointerDown = (e) => {
    if (!interactive) return;
    e.preventDefault();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: cropRef.current.panX, startPanY: cropRef.current.panY };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      pinchRef.current = { startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, startZoom: cropRef.current.zoom };
      dragRef.current = null;
    }
    if (!listenersAttachedRef.current) {
      listenersAttachedRef.current = true;
      window.addEventListener("pointermove", handleGestureMove);
      window.addEventListener("pointerup", handleGestureEnd);
      window.addEventListener("pointercancel", handleGestureEnd);
    }
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
            Geser atau cubit foto di atas utk atur posisi &amp; zoom
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
function DirectFrameReviewScreen({ queue, phase, tick, frameTemplates, customFonts, sessionTitle, selectedFrameName, onRemove, onCropChange, onAddCamera, onAddGallery, onChangeFrame, onUpload, onBack }) {
  const ratio = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };
  const uploading = phase === "uploading";
  const pendingOrDoneCount = queue.filter((x) => x.status === "done").length;
  const overallProgress = queue.length ? queue.reduce((s, x) => s + (x.status === "done" || x.status === "error" ? 1 : x.progress || 0), 0) / queue.length : 0;

  return (
    // FIX (permintaan user - "mengapa halaman ini tidak bisa di scroll" ->
    // "masih belum enak scrollnya" -> "apakah ada area yang gabisa di
    // scroll"): 2 percobaan sebelumnya (height:100svh+overflow:auto,
    // position:fixed+inset:0 sbg "lapisan scroll sendiri") sama2 bikin
    // SEBAGIAN area halaman kerasa tidak respons thd scroll. Disederhanakan
    // total skrg: TIDAK ada overflow/height fixed apa pun di div ini -
    // cuma minHeight:100svh biasa, overflow default "visible" - `body` yg
    // jadi scroll container-nya (scroll dokumen native bawaan browser,
    // SELALU jalan, tidak ada "area" yg bisa ke-skip). Header progress di
    // atas tetap position:"sticky" spt sblmnya - itu justru BUTUH `body`
    // sbg scroll container utk nempel ke atas layar dgn benar selagi
    // discroll (perilaku sticky paling umum & paling reliable).
    <div style={{ minHeight: "100svh", background: FP_BG, fontFamily: FONT, colorScheme: "dark", position: "relative" }}>
      <FpAmbientBg />
      {/* UPDATE (permintaan user - "perbaiki total ui untuk upload ini buat
          lebih besar dan lebih seamless dengan laman berhasil diunggah...
          animasinya sangat baguss, paling bagus"): header upload skrg
          BUKAN cuma judul kecil + bar tipis lagi - ada ring progress BESAR
          (54px, sama komponen CircularProgress yg dipakai di overlay kartu,
          jd satu bahasa visual yg konsisten) di samping judul yg jg
          diperbesar, baris status kecil di bawahnya, baru bar progress
          (lebih tebal, 9px) dgn shimmer. Begitu overallProgress capai 100%
          ring ini jg yg "serah terima" ke checkmark besar di layar sukses -
          ukuran & posisi senada (sama2 di kiri-atas blok konten) bikin
          transisi kerasa 1 alur, bukan loncat ke layar lain. */}
      <div style={{ padding: "22px 20px 16px", borderBottom: `1px solid ${FP_LINE}`, position: "sticky", top: 0, zIndex: 5, background: "rgba(10,10,11,0.78)", backdropFilter: "blur(14px)" }}>
        <div style={{ maxWidth: 520, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", gap: uploading ? 14 : 10 }}>
          {uploading && (
            <div className="rpv-df-header-ring-in" style={{ flexShrink: 0 }}>
              <CircularProgress value={overallProgress} size={50} />
            </div>
          )}
          {/* UPDATE (permintaan user - "tambahkan tombol kembali di kiri
              atas agar tidak stuck di laman ini"): tombol X jaga-jaga -
              SELALU dirender (tidak digantung queue.length > 0 spt tombol
              "Batalkan" di bawah), disembunyikan cuma selagi upload aktif
              berjalan (tidak masuk akal membatalkan di tengah proses
              unggah). */}
          {!uploading && (
            <button onClick={onBack} aria-label="Kembali"
              style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 999, border: "none", background: FP_CARD_HI, color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={16} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: uploading ? 17.5 : 16.5, fontWeight: 800, color: FP_INK, letterSpacing: "-0.01em" }}>
              {/* UPDATE (permintaan user - "jangan buat mengunggah
                  menggunakan 5G, ini bukan lagi untuk test 5G"): label
                  "Mengunggah via 5G" dihapus sebutan "via 5G"-nya. */}
              {uploading ? `Mengunggah` : `Pratinjau · ${queue.length} foto`}
            </div>
            {uploading ? (
              <div style={{ fontSize: 12.5, color: FP_SUB, marginTop: 1, fontWeight: 600 }}>
                {pendingOrDoneCount}/{queue.length} foto selesai…
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: FP_SUB, marginTop: 2 }}>Cek posisi fotomu, geser/zoom kalau perlu, baru unggah.</div>
            )}
          </div>
        </div>
        {uploading && (
          // UPDATE: bar progress diperbesar (7px->9px) + shimmer tetap jalan
          // di atasnya - bar ini skrg jadi elemen SEKUNDER (ring besar di
          // atas sudah jadi fokus utama "hero"), tapi tetap kebaca jelas.
          <div style={{ marginTop: 12, maxWidth: 520, width: "100%", margin: "12px auto 0", height: 9, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", borderRadius: 99, width: `${overallProgress * 100}%`, background: `linear-gradient(90deg,${RED},${MAGA})`, transition: "width .25s ease", position: "relative", overflow: "hidden" }}>
              <div className="rpv-df-progress-shimmer" />
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "26px 16px 110px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ marginTop: 0, display: "flex", flexDirection: "column", gap: 32 }}>
          {queue.map((it) => {
            const template = (frameTemplates || []).find((t) => t.id === it.frameTemplateId) || null;
            const liveElapsedMs = liveElapsedMsOf(it);
            const mbps = it.status === "done" ? rpvThroughputMbps(it.fileSizeBytes, it.uploadMs) : null;
            void tick; // re-render tiap 100ms selama upload berjalan spy liveElapsedMs ikut update
            return (
              <div key={it.id} className={uploading ? "rpv-df-upload-card" : undefined} style={{ position: "relative" }}>
                <DirectFrameCropCard item={it} ratio={ratio} template={template} customFonts={customFonts} sessionTitle={sessionTitle}
                  queueLabel="0000" onCropChange={onCropChange} onRemove={onRemove} interactive={!uploading} />
                {uploading && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 20, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    {it.status === "uploading" && (
                      // UPDATE ("lebih besar"): ring progress per-kartu
                      // diperbesar 40->84 - jadi momen visual utama di
                      // tengah foto, bukan lingkaran kecil yg gampang
                      // kelewat. Waktu berjalan di bawahnya jg ikut naik
                      // ukuran fontnya.
                      <div className="rpv-df-upload-overlay" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,10,12,0.32),rgba(10,10,12,0.64))", backdropFilter: "blur(3px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                        <CircularProgress value={it.progress || 0} size={84} />
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "monospace", letterSpacing: "0.01em" }}>{fmtElapsed(liveElapsedMs || 0)}</span>
                      </div>
                    )}
                    {it.status === "done" && (
                      <div className="rpv-df-done-badge" style={{ position: "absolute", bottom: 16, left: "50%", display: "flex", alignItems: "center", gap: 7, background: "rgba(22,163,74,0.94)", borderRadius: 999, padding: "8px 16px", boxShadow: "0 10px 26px -8px rgba(22,163,74,0.65)" }}>
                        <Check size={15} color="#fff" />
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#fff" }}>{fmtElapsed(it.uploadMs || 0)}{mbps ? ` · ${mbps.toFixed(1)} Mbps` : ""}</span>
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
        /* UPDATE (permintaan user - "animasinya sangat baguss, paling
           bagus"): ring progress besar di header muncul dgn pop halus pas
           upload mulai, & tiap kartu yg lagi diunggah dapat "napas" halus
           (scale sangat kecil, hampir tidak kentara tapi kerasa hidup) +
           cincin cahaya magenta tipis yg muncul-redup di tepi kartu -
           menyatukan bahasa visual dgn glow ring progress-nya sendiri. */
        @keyframes rpv-df-ring-in { 0% { opacity: 0; transform: scale(0.6); } 60% { opacity: 1; transform: scale(1.08); } 100% { transform: scale(1); } }
        .rpv-df-header-ring-in { animation: rpv-df-ring-in .5s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes rpv-df-upload-breathe { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(198,22,141,0); } 50% { transform: scale(1.006); box-shadow: 0 0 32px -6px rgba(198,22,141,0.35); } }
        .rpv-df-upload-card { border-radius: 20px; animation: rpv-df-upload-breathe 2.2s ease-in-out infinite; }
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
  // UPDATE (permintaan user - "klik foto untuk preview"): thumbnail foto
  // skrg bisa diketuk utk buka lightbox GEDE (pola sama persis dgn
  // "Frame Terpilih" di FramePickScreen) - berguna krn kartu fotonya baru
  // saja dikecilkan (220px) biar QR jadi fokus utama, jadi perlu jalan utk
  // tetap bisa lihat detail fotonya jelas kalau mau.
  const [zoomedId, setZoomedId] = useState(null);
  const zoomedItem = doneItems.find((it) => it.id === zoomedId) || null;
  const zoomedTemplate = zoomedItem ? (frameTemplates || []).find((t) => t.id === zoomedItem.frameTemplateId) || null : null;
  // UPDATE (permintaan user - "bisa langsung download foto juga disini"):
  // tamu skrg bisa langsung simpan file PNG foto+bingkainya dr layar hasil
  // ini juga (sblmnya cuma lewat scan QR/buka link /p/[photoCode] dulu) -
  // render PAKAI renderPhotoFrameToBlob yg SAMA PERSIS dgn tombol Download
  // di /p/[photoCode] (hasil foto+bingkai, resolusi penuh, tanpa kompresi),
  // jadi hasilnya identik, bukan screenshot mentah.
  const [downloadingId, setDownloadingId] = useState(null);
  // UPDATE (permintaan user - "ganti buka di hp menjadi copy link"): tombol
  // "Buka di HP" (Link, pindah halaman) diganti "Salin Link" - copy URL
  // /p/[photoCode] ke clipboard langsung, feedback singkat "Tersalin!" per
  // item (bukan cuma 1 state global) krn bisa ada >1 foto di layar ini.
  const [copiedId, setCopiedId] = useState(null);
  const copyTimerRef = useRef(null);
  const handleCopyLink = async (it) => {
    if (!it.photoCode) return;
    const url = `${window.location.origin}/marta/photobooth/p/${it.photoCode}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback browser lama/tanpa izin clipboard - textarea sementara + execCommand
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch { return; }
    }
    setCopiedId(it.id);
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 1800);
  };
  const handleDownload = async (it, template) => {
    if (downloadingId) return;
    setDownloadingId(it.id);
    try {
      const blob = await renderPhotoFrameToBlob({
        photo: { url: it.previewUrl }, ratio, crop: it.crop || DEFAULT_CROP,
        // FIX ("4 digit unique untuk semua foto... agar mudah dicari di
        // cms"): sblmnya dipakai it.photoCode (kode panjang internal, mis.
        // "5GMDN-261024-0256") sbg isi "{Photo ID}" di bingkai - skrg pakai
        // it.queueLabel (nomor antrian pendek 4 digit yg BENERAN dimaksud
        // utk dicari di CMS), fallback "0000" kalau blm ada.
        frame: template ? "custom" : "none", queueLabel: it.queueLabel || "0000", sessionTitle,
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
    // FIX (permintaan user - "mengapa halaman ini tidak bisa di scroll" ->
    // "masih belum enak scrollnya" -> "apakah ada area yang gabisa di
    // scroll"): 2 percobaan sebelumnya (height:100svh+overflow:auto, lalu
    // position:fixed+inset:0 sbg "lapisan scroll sendiri") sama2 masih
    // bikin SEBAGIAN area kerasa tidak responsif thd scroll - root
    // masalahnya: div ini dipaksa jadi scroll CONTAINER-nya sendiri, bukan
    // ikut scroll dokumen biasa (body). SEKARANG disederhanakan total:
    // TIDAK ada `overflow`/`height` fixed apa pun di sini lagi - div ini
    // cuma elemen BIASA (overflow default "visible", minHeight:100svh tapi
    // boleh lebih tinggi dr itu kalau kontennya panjang), jadi `body` yg
    // jadi scroll container-nya (scroll dokumen native, SELALU jalan di
    // semua browser, tidak ada "area" yg bisa ke-skip). FpAmbientBg jadi
    // ikut membentang full tinggi KONTEN (bukan cuma 1 layar), bonus:
    // ambient background-nya kelihatan di sepanjang scroll, bukan cuma di
    // atas.
    // FIX (permintaan user - "mengapa laman ini kembali tidak bisa
    // discroll"): root sblmnya pakai display:"flex", flexDirection:"column",
    // justifyContent:"center" utk centering vertikal otomatis - TAPI begitu
    // konten diperbesar (checkmark, foto, QR, tombol semua naik ukuran di
    // update sblmnya) & jadi lebih tinggi dr layar, kombinasi "flex container
    // yg di-center" + minHeight:100svh berpotensi bikin sebagian browser
    // tidak menghitung overflow-nya dgn benar sbg area yg bisa discroll
    // (celah klasik flexbox "justify-content:center saat overflow"). Layar
    // DirectFrameReviewScreen SEBELAH (fungsi di atas) TIDAK pernah kena
    // masalah ini krn rootnya dari awal MEMANG TIDAK pakai flex/justify-
    // content apa pun - cuma block biasa + minHeight:100svh. Disamakan ke
    // pola yg sama di sini: flex/justifyContent DIHAPUS dr root, div anak
    // (konten) cukup di-center HORIZONTAL via margin:"0 auto"+maxWidth spt
    // biasa - scroll 100% balik ke `body` sbg satu2nya scroll container,
    // konsisten dgn semua layar lain di alur ini.
    <div style={{ minHeight: "100svh", background: FP_BG, fontFamily: FONT, colorScheme: "dark", position: "relative" }}>
      <FpAmbientBg />
      {/* UPDATE (permintaan user - "perbaiki total ui untuk upload ini buat
          lebih besar dan lebih seamless dengan laman berhasil diunggah...
          animasinya sangat baguss, paling bagus"): layar sukses skrg lebih
          lega (maxWidth 380->440) & checkmark-nya BESAR (52->78px) dgn
          cincin cahaya hijau berdenyut di belakangnya - bahasa visual yg
          sama persis dgn ring progress magenta (.rpv-df-cp-glow) di layar
          upload sebelumnya, cuma warnanya jadi hijau "berhasil" - jadi
          transisi upload -> sukses kerasa SATU alur yg "serah terima",
          bukan loncat ke desain lain. */}
      <div style={{ position: "relative", zIndex: 1, padding: "36px 18px 28px", maxWidth: 440, width: "100%", margin: "0 auto", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative", width: 78, height: 78, borderRadius: 999, background: "rgba(22,163,74,0.14)", display: "flex", alignItems: "center", justifyContent: "center", animation: "rpv-df-pop .48s cubic-bezier(.34,1.56,.64,1) both" }}>
          <div className="rpv-df-success-glow" aria-hidden="true" />
          <svg width="42" height="42" viewBox="0 0 52 52" style={{ position: "relative" }}>
            <circle cx="26" cy="26" r="23" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round"
              style={{ strokeDasharray: 145, strokeDashoffset: checkDone ? 0 : 145, transition: "stroke-dashoffset .5s ease" }} />
            <path d="M15 27l7.5 7.5L37.5 18" fill="none" stroke="#22C55E" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 34, strokeDashoffset: checkDone ? 0 : 34, transition: "stroke-dashoffset .35s ease .25s" }} />
          </svg>
        </div>
        <div style={{ marginTop: 14, fontSize: 19.5, fontWeight: 800, color: FP_INK, textAlign: "center", letterSpacing: "-0.01em" }}>
          {doneItems.length > 1 ? `${doneItems.length} Foto Berhasil Diunggah!` : "Foto Berhasil Diunggah!"}
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: FP_SUB, textAlign: "center" }}>Scan QR di bawah utk share/download fotomu.</div>

        {errorCount > 0 && (
          <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: "#FCA5A5" }}>{errorCount} foto gagal diunggah.</div>
        )}

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
          {doneItems.map((it, i) => {
            const template = (frameTemplates || []).find((t) => t.id === it.frameTemplateId) || null;
            return (
              <div key={it.id} className="rpv-df-success-card" style={{ animationDelay: `${0.12 + i * 0.08}s` }}>
                {/* UPDATE ("buat lebih besar"): kartu foto diperbesar lagi
                    (148->224px) - cukup besar utk kelihatan jelas tapi QR
                    di bawahnya tetap jadi fokus utama scan share/download. */}
                {/* UPDATE (permintaan user - "klik untuk pratinjau"): badge
                    kecil ditambahkan di pojok bawah kartu foto - sblmnya
                    foto ini SUDAH bisa diketuk (buka lightbox gede, lihat
                    setZoomedId) tapi tidak ada petunjuk visual apa pun jadi
                    tamu tidak sadar itu tombol - skrg ada label eksplisit
                    + ikon kaca pembesar, muncul di atas foto spy jelas. */}
                <button onClick={() => setZoomedId(it.id)} aria-label="Lihat foto lebih besar"
                  style={{ display: "block", width: "100%", maxWidth: 224, margin: "0 auto", padding: 0, border: "none", background: "transparent", cursor: "zoom-in", borderRadius: 18, overflow: "hidden", boxShadow: "0 18px 46px -16px rgba(0,0,0,0.6)", position: "relative" }}>
                  <div style={{ borderRadius: 18, overflow: "hidden", border: `1.5px solid ${FP_LINE}` }}>
                    <PhotoFrame photo={{ url: it.previewUrl }} ratio={ratio} crop={it.crop || DEFAULT_CROP} frame={template ? "custom" : "none"}
                      mode="screen" queueLabel={it.queueLabel || "0000"} sessionTitle={sessionTitle}
                      customElements={template?.elements} customBaseStyle={template?.baseStyle} customFonts={customFonts} />
                  </div>
                  <div style={{ position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 999, background: "rgba(10,10,12,0.72)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.14)", whiteSpace: "nowrap" }}>
                    <ZoomIn size={12} color="#fff" />
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff" }}>Klik utk Pratinjau</span>
                  </div>
                </button>
                {/* UPDATE (permintaan user - "perbaiki lagi uinya ini
                    menjadi sangat baik"): kartu QR+aksi dirombak total -
                    label kecil all-caps diganti baris ikon+teks yg lebih
                    enak dibaca, QR dibungkus kartu putih sendiri dgn bingkai
                    "sudut pemindai" (corner marks, kesan kamera/scanner
                    beneran), & "Buka di HP ini"/"Download" yg SEBELUMNYA
                    nyempil jadi link+tombol numpuk vertikal skrg jadi 2
                    tombol SEJAJAR senada (outline + gradient solid), rapi
                    & seimbang - bukan lagi dominan QR doang. */}
                <div style={{ marginTop: 12, borderRadius: 20, background: `linear-gradient(180deg,${FP_CARD_HI},${FP_CARD})`, border: `1px solid ${FP_LINE}`, padding: "16px 16px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: FP_SUB }}>
                    <QrCode size={13} />
                    <span style={{ fontSize: 11.5, fontWeight: 800 }}>Pindai utk Bagikan &amp; Unduh</span>
                  </div>
                  <div className="rpv-df-qr-frame">
                    {qrByCode[it.photoCode] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrByCode[it.photoCode]} alt={`QR ${it.photoCode}`} width={164} height={164} style={{ display: "block", borderRadius: 10, background: "#fff" }} />
                    ) : (
                      <div style={{ width: 164, height: 164, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Loader2 size={20} color={MAGA} style={{ animation: "spin 1s linear infinite" }} />
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 9, width: "100%" }}>
                    {/* UPDATE (permintaan user - "ganti buka di hp menjadi
                        copy link"): link pindah-halaman diganti copy-to-
                        clipboard - icon+label-nya berubah sekejap jadi
                        "Tersalin!" (checkmark hijau) begitu berhasil, balik
                        normal otomatis stlh ~1.8dtk (lihat handleCopyLink). */}
                    {it.photoCode && (
                      <button onClick={() => handleCopyLink(it)}
                        style={{ flex: 1, height: 48, borderRadius: 13, border: `1.5px solid ${copiedId === it.id ? "#22C55E66" : FP_LINE}`, background: copiedId === it.id ? "rgba(34,197,94,0.12)" : FP_FIELD, color: copiedId === it.id ? "#4ADE80" : FP_INK, fontSize: 13, fontWeight: 800, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all .15s ease" }}>
                        {copiedId === it.id ? <Check size={14} /> : <Link2 size={14} color={MAGA} />}
                        {copiedId === it.id ? "Tersalin!" : "Salin Link"}
                      </button>
                    )}
                    <button onClick={() => handleDownload(it, template)} disabled={downloadingId === it.id}
                      style={{ flex: 1, height: 48, borderRadius: 13, border: "none", cursor: downloadingId === it.id ? "default" : "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: `linear-gradient(135deg,${RED},${MAGA})`, boxShadow: "0 10px 24px -10px rgba(198,22,141,0.6)", opacity: downloadingId && downloadingId !== it.id ? 0.5 : 1 }}>
                      {downloadingId === it.id ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />}
                      {downloadingId === it.id ? "…" : "Download"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          <button onClick={onUploadMore}
            style={{ width: "100%", height: 54, borderRadius: 16, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 15, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg,${RED},${MAGA})`, boxShadow: "0 14px 34px -12px rgba(198,22,141,0.55)" }}>
            Ambil Foto Lagi
          </button>
          <button onClick={onDone}
            style={{ width: "100%", height: 54, borderRadius: 16, border: `1.5px solid ${FP_LINE}`, background: FP_CARD_HI, color: FP_INK, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Kembali
          </button>
        </div>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes rpv-df-pop { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes rpv-df-card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .rpv-df-success-card { animation: rpv-df-card-in .4s ease both; }
        @keyframes rpv-fp-sheet-backdrop { from { opacity: 0; } to { opacity: 1; } }
        /* UPDATE (permintaan user - "hilangkan juga line pink di qr ini"):
           "bingkai pemindai" (corner marks magenta) DIHAPUS SELURUHNYA -
           sblmnya sudah dikurangi jd cuma 2 sudut bawah, tapi msh nabrak/
           numpuk visual dgn 2 tombol Salin Link/Download tepat di
           bawahnya. Kartu QR putih polos (shadow lembut) saja sudah cukup
           rapi tanpa perlu hiasan sudut ini. */
        .rpv-df-qr-frame {
          padding: 14px; border-radius: 16px; background: #fff;
          box-shadow: 0 10px 30px -14px rgba(198,22,141,0.5);
        }
        /* FIX: class ini sblmnya dipakai di JSX checkmark tapi belum ada
           definisinya sama sekali (ketinggalan pas nambah elemen glow-nya)
           - cincin cahaya HIJAU berdenyut di belakang checkmark, pola sama
           persis dgn .rpv-df-cp-glow (magenta) di CircularProgress. */
        @keyframes rpv-df-success-glow-pulse { 0%, 100% { opacity: 0.4; transform: scale(0.88); } 50% { opacity: 0.8; transform: scale(1.18); } }
        .rpv-df-success-glow {
          position: absolute; inset: -6px; border-radius: 999px; pointer-events: none;
          background: radial-gradient(circle, #22C55E99 0%, transparent 70%);
          animation: rpv-df-success-glow-pulse 1.8s ease-in-out infinite;
        }
        *{box-sizing:border-box}
      `}</style>

      {zoomedItem && (
        <div onClick={() => setZoomedId(null)}
          style={{ position: "fixed", inset: 0, zIndex: 25, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, background: "rgba(0,0,0,0.88)", animation: "rpv-fp-sheet-backdrop .18s ease both" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", width: "100%", maxWidth: 340, aspectRatio: `${ratio.w} / ${ratio.h}`, borderRadius: 18, overflow: "hidden", border: `1.5px solid ${FP_LINE}`, boxShadow: "0 24px 60px -16px rgba(0,0,0,0.7)" }}>
            <PhotoFrame photo={{ url: zoomedItem.previewUrl }} ratio={ratio} crop={zoomedItem.crop || DEFAULT_CROP} frame={zoomedTemplate ? "custom" : "none"}
              mode="screen" queueLabel={zoomedItem.queueLabel || "0000"} sessionTitle={sessionTitle}
              customElements={zoomedTemplate?.elements} customBaseStyle={zoomedTemplate?.baseStyle} customFonts={customFonts} />
          </div>
          <button onClick={() => setZoomedId(null)} aria-label="Tutup"
            style={{ width: 38, height: 38, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={17} />
          </button>
        </div>
      )}
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
// UPDATE (permintaan user - "perbaiki total ui untuk upload ini buat lebih
// besar... animasinya sangat bagus"): CircularProgress skrg bisa diatur
// ukurannya via prop `size` (default tetap 40 spy pemanggil lama tidak
// berubah) - dipakai dgn size besar (84) di overlay upload per-kartu biar
// jadi "hero" momen yg jelas kelihatan, bukan lingkaran kecil nyempil.
function CircularProgress({ value, size = 40 }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = size * 0.4, c = 2 * Math.PI * r;
  const sw = Math.max(3, size * 0.088);
  const cx = size / 2;
  const gradId = `rpv-df-cp-grad-${useId().replace(/:/g, "")}`;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div className="rpv-df-cp-glow" aria-hidden="true" />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", position: "relative" }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={RED} />
            <stop offset="100%" stopColor={MAGA} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .2s ease" }} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.26, fontWeight: 800, color: "#fff", fontFamily: FONT }}>
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
        @keyframes rpv-fp-fab-glow-pulse {
          0%, 100% { opacity: 0.55; transform: scale(0.94); }
          50%       { opacity: 0.95; transform: scale(1.1); }
        }
        @keyframes rpv-fp-fab-in {
          0% { opacity: 0; transform: translateY(14px) scale(0.86); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .rpv-fp-gallery-fab {
          position: fixed; z-index: 15; display: flex; align-items: center; gap: 9px;
          height: 50px; padding: 0 19px 0 15px; border-radius: 999px; border: none; cursor: pointer;
          font-family: inherit; font-weight: 800; font-size: 13px; letter-spacing: -0.01em; color: #fff;
          background: linear-gradient(135deg, #ED1C24, #C6168D);
          box-shadow: 0 16px 36px -10px rgba(198,22,141,0.6), 0 2px 10px -2px rgba(0,0,0,0.5);
          animation: rpv-fp-fab-in 0.3s cubic-bezier(.22,1,.36,1) both;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .rpv-fp-gallery-fab:active { transform: scale(0.93); box-shadow: 0 8px 20px -8px rgba(198,22,141,0.55); }
        .rpv-fp-gallery-fab-glow {
          position: absolute; inset: -7px; border-radius: 999px; pointer-events: none; z-index: -1;
          background: radial-gradient(circle, rgba(237,28,36,0.55) 0%, rgba(198,22,141,0.0) 72%);
          animation: rpv-fp-fab-glow-pulse 2.2s ease-in-out infinite;
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

function FramePickScreen({ templates, loading, customFonts, sessionCode, sessionTitle, selected, onSelect, onTemplateCreated, onTemplateRenamed, onTemplateDeleted, onCapture, onGallery, onBack }) {
  // UPDATE (permintaan user - "tambahkan fitur galeri dan bisa filter per
  // jenis frame, dan melakukan pencarian nomor... swipe kiri kanan... ada
  // tombol download foto dan tombol tampilkan QR Share"): "Galeri" di sini
  // BEDA dari prop `onGallery` yg sudah ada (itu buka file picker device
  // tamu, utk UPLOAD foto baru) - ini buka overlay BARU yg nampilin SEMUA
  // foto yg SUDAH diunggah di sesi ini (lintas frame), lihat
  // PhotoGallerySheet di bawah.
  const [galleryOpen, setGalleryOpen] = useState(false);
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
      // UPDATE (permintaan user - "ini linenya bisa diklik baru di drag
      // untuk nutup"): sblmnya handle INI CUMA bisa nutup sheet lewat
      // drag jauh (>90px) - sekedar TAP/KLIK singkat di line-nya (nyaris
      // tanpa gerakan) tidak melakukan apa pun. Skrg ditambah: gerakan
      // SANGAT kecil (<6px, berarti ini tap/klik, bukan niat drag) jg
      // langsung nutup sheet - pola umum bottom-sheet app native (tap
      // handle = dismiss), TANPA mengandalkan event "click" bawaan
      // (yg di browser/touch device kadang TIDAK terpicu stlh
      // preventDefault() di pointerdown) - makanya dideteksi lewat jarak
      // gerak pointerup ini, bukan listener click terpisah.
      if (dy > 48 || dy < 6) closeSheet();
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
        <button onClick={() => setUploadOpen(true)}
          style={{ height: 36, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 13px", borderRadius: 11, border: `1px solid ${FP_LINE}`, background: FP_FIELD, color: FP_INK, fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
          <Upload size={14} color={MAGA} /> Upload Frame
        </button>
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "14px 16px 0", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} color={FP_SUB} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama frame…"
            style={{ width: "100%", height: 40, borderRadius: 11, border: `1px solid ${FP_LINE}`, background: FP_FIELD, color: FP_INK, fontSize: 13, fontFamily: FONT, padding: "0 12px 0 34px", boxSizing: "border-box", outline: "none" }} />
          {q && (
            <button onClick={() => setQ("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.08)", color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={12} />
            </button>
          )}
        </div>
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
                    <FrameOverlayElements customElements={tpl.elements} customFonts={customFonts} mode="screen" ratio={ratio} sessionTitle={sessionTitle} queueLabel="0000" />
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
              borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: "10px 22px calc(32px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box",
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
                native; dilepas sblm 48px -> snap balik ke atas, dilepas
                setelah ditarik lewat 48px -> lanjut animasi meluncur
                turun & nutup beneran (threshold diturunkan dr 90px krn
                tamu lapor "masih belum bisa di drag ke bawah" - drag
                wajar terasa tidak merespons kalau jarak yg dibutuhkan
                terlalu jauh). */}
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
                  customFonts={customFonts} mode="screen" ratio={ratio} sessionTitle={sessionTitle} queueLabel="0000" />
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
            <FrameOverlayElements customElements={selected.elements} customFonts={customFonts} mode="screen" ratio={ratio} sessionTitle={sessionTitle} queueLabel="0000" />
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

      <button onClick={() => setGalleryOpen(true)} aria-label="Galeri Upload" className="rpv-fp-gallery-fab"
        style={{ right: 24, bottom: "calc(34px + env(safe-area-inset-bottom, 0px))" }}>
        <span className="rpv-fp-gallery-fab-glow" aria-hidden="true" />
        <Images size={18} />
        <span>Galeri Upload</span>
      </button>

      {galleryOpen && (
        <PhotoGallerySheet sessionCode={sessionCode} templates={templates} customFonts={customFonts} sessionTitle={sessionTitle}
          onClose={() => setGalleryOpen(false)} />
      )}
    </div>
  );
}

/** Overlay "Galeri Foto" - permintaan user ("tambahkan fitur galeri dan
 * bisa filter per jenis frame, dan melakukan pencarian nomor jika salah
 * satu di klik bisa swipe kiri kanan, dan ada tombol download foto dan
 * tombol tampilkan QR Share"). Nampilin SEMUA foto yg sudah diunggah di
 * sesi ini (lintas frame, lewat listRpvPhotos - RPC yg sama dipakai panel
 * Riwayat), dgn:
 * - Kolom pencarian nomor antrian (cocokkan queue_label/queue_no/photo_code)
 * - Chip filter per frame ("Semua" / "Tanpa Frame" / nama tiap frame)
 * - Grid thumbnail, diketuk -> lightbox full-screen yg bisa digeser (swipe
 *   pointer) ATAU tombol panah kiri/kanan utk pindah antar foto HASIL
 *   FILTER yg lagi aktif (bukan semua foto)
 * - Di lightbox: tombol Download (render ulang foto+bingkai resolusi
 *   penuh, sama persis dgn tombol Download di layar sukses/halaman /p/),
 *   & tombol "Tampilkan QR Share" (generate QR link /p/[photoCode] on-
 *   demand, toggle tampil/sembunyi di atas foto).
 */
function PhotoGallerySheet({ sessionCode, templates, customFonts, sessionTitle, onClose }) {
  const ratio = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [q, setQ] = useState("");
  // UPDATE (permintaan user - "galeri upload harusnya, pastikan filternya
  // itu tepat"): filter SEBELUMNYA dikelompokkan lewat frame_template_id
  // (FK live ke rpv_frame_templates) - begitu operator hapus 1 template,
  // SEMUA foto lama yg dulu pakai frame itu otomatis kena
  // "frame_template_id = null" (FK ON DELETE SET NULL di DB), jadi salah
  // masuk kelompok "Tanpa Frame" walau sebenarnya dulu diupload pakai
  // frame tsb. Skrg dikelompokkan lewat `frame_name` - teks nama frame yg
  // DISNAPSHOT ke rpv_photos SAAT foto dikonfirmasi (lihat
  // rpv_confirm_photo & listRpvPhotosGallery di lib/rpv.js) - jadi tetap
  // akurat biarpun frame-nya belakangan dihapus.
  const [filterName, setFilterName] = useState("all"); // "all" | "none" | <frame_name>
  const [openIndex, setOpenIndex] = useState(null);
  const [qrOpenCode, setQrOpenCode] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [downloadingCode, setDownloadingCode] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadErr("");
      try {
        const rows = await listRpvPhotosGallery(sessionCode);
        if (!cancelled) setPhotos(rows || []);
      } catch (e) {
        if (!cancelled) setLoadErr(e?.message || "Gagal memuat galeri.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sessionCode]);

  const templateById = useMemo(() => {
    const m = new Map();
    (templates || []).forEach((t) => m.set(t.id, t));
    return m;
  }, [templates]);

  // Daftar chip filter dibangun dari `frame_name` yg BENAR-BENAR ada di
  // data foto sesi ini (bukan dari daftar template yg masih hidup skrg) -
  // jadi kalaupun 1 frame sudah dihapus, chip-nya tetap muncul selama
  // masih ada foto lama yg memakainya, urut sesuai kemunculan pertama.
  const frameNameChips = useMemo(() => {
    const seen = new Map();
    for (const p of photos) {
      if (p.frame_name && !seen.has(p.frame_name)) seen.set(p.frame_name, true);
    }
    return Array.from(seen.keys());
  }, [photos]);

  const filtered = useMemo(() => {
    let list = photos;
    if (filterName === "none") list = list.filter((p) => !p.frame_name);
    else if (filterName !== "all") list = list.filter((p) => p.frame_name === filterName);
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter((p) => {
        const label = (p.queue_label || "").toLowerCase();
        const no = p.queue_no != null ? String(p.queue_no) : "";
        const code = (p.photo_code || "").toLowerCase();
        return label.includes(s) || no.includes(s) || code.includes(s);
      });
    }
    return list;
  }, [photos, filterName, q]);

  // Index di lightbox dijaga tetap VALID walau daftar `filtered` berubah
  // (mis. tamu ganti filter/cari selagi lightbox terbuka) - kalau index
  // lama sudah di luar jangkauan, anggap lightbox tertutup drpd nunjuk ke
  // foto yg salah (dihitung langsung, bukan lewat effect+setState).
  const openIndexValid = openIndex != null && openIndex < filtered.length ? openIndex : null;
  const openItem = openIndexValid != null ? filtered[openIndexValid] : null;
  const openTemplate = openItem ? templateById.get(openItem.frame_template_id) || null : null;

  const closeLightbox = () => { setOpenIndex(null); setQrOpenCode(null); setQrDataUrl(null); };
  const goDelta = (delta) => {
    setOpenIndex((i) => {
      if (i == null) return i;
      const next = i + delta;
      if (next < 0 || next >= filtered.length) return i;
      return next;
    });
    setQrOpenCode(null);
    setQrDataUrl(null);
  };

  // Swipe kiri/kanan - pola ringan pakai 1 pointer (bukan window listener
  // spt drag sheet lain di file ini, krn di sini cukup baca titik awal &
  // akhir SETELAH gesture selesai, tidak perlu update posisi live tiap
  // pixel gerak).
  const swipeStartRef = useRef(null);
  const onSwipeDown = (e) => { swipeStartRef.current = { x: e.clientX, y: e.clientY }; };
  const onSwipeUp = (e) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goDelta(1); else goDelta(-1);
    }
  };

  const toggleQr = async (it) => {
    if (!it?.photo_code) return;
    if (qrOpenCode === it.photo_code) { setQrOpenCode(null); return; }
    setQrOpenCode(it.photo_code);
    setQrDataUrl(null);
    setQrLoading(true);
    try {
      const url = `${window.location.origin}/marta/photobooth/p/${it.photo_code}`;
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#111116", light: "#FFFFFF" } });
      setQrDataUrl(dataUrl);
    } catch { setQrDataUrl(null); }
    setQrLoading(false);
  };

  const handleDownload = async (it, tpl) => {
    if (!it?.photo_code || downloadingCode) return;
    setDownloadingCode(it.photo_code);
    try {
      const blob = await renderPhotoFrameToBlob({
        photo: { url: it.url }, ratio, crop: it.crop || DEFAULT_CROP,
        frame: tpl ? "custom" : "none", queueLabel: it.queue_label || "0000", sessionTitle,
        customElements: tpl?.elements, customBaseStyle: tpl?.baseStyle, customFonts,
      });
      if (!blob) throw new Error("render-failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foto-${it.photo_code}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { /* biarkan tamu coba lagi */ }
    setDownloadingCode(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40, background: FP_BG, display: "flex", flexDirection: "column", fontFamily: FONT, colorScheme: "dark", animation: "rpv-fp-sheet-backdrop .18s ease both" }}>
      <FpAmbientBg />
      <div style={{ position: "relative", zIndex: 1, padding: "18px 16px 12px", borderBottom: `1px solid ${FP_LINE}`, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onClose} aria-label="Tutup galeri"
          style={{ width: 36, height: 36, borderRadius: 999, border: "none", background: FP_FIELD, color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <X size={16} />
        </button>
        <div style={{ flex: 1, fontSize: 15.5, fontWeight: 800, color: FP_INK, letterSpacing: "-0.01em" }}>Galeri Foto</div>
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "12px 16px 0", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} color={FP_SUB} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor antrian…" inputMode="numeric"
            style={{ width: "100%", height: 40, borderRadius: 11, border: `1px solid ${FP_LINE}`, background: FP_FIELD, color: FP_INK, fontSize: 13, fontFamily: FONT, padding: "0 12px 0 34px", boxSizing: "border-box", outline: "none" }} />
          {q && (
            <button onClick={() => setQ("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.08)", color: FP_MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* UPDATE (permintaan user - "untuk filter frame dropdown saja dan
          urutkan dari template yang terakhir diupload"): baris chip yg
          discroll horizontal DIGANTI 1 dropdown native - lebih ringkas &
          tidak makan tempat kalau daftar framenya panjang. Urutan opsi
          ikut `frameNameChips` yg sudah urut dari frame yg foto TERBARUNYA
          plg baru diupload (lihat komentar di frameNameChips di atas -
          `photos` sumbernya sendiri sudah urut uploaded_at DESC). */}
      <div style={{ position: "relative", zIndex: 1, padding: "12px 16px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ position: "relative" }}>
          <select value={filterName} onChange={(e) => setFilterName(e.target.value)}
            style={{ width: "100%", height: 42, borderRadius: 12, border: `1px solid ${FP_LINE}`, background: FP_FIELD, color: FP_INK, fontSize: 12.5, fontWeight: 800, fontFamily: FONT, padding: "0 34px 0 14px", boxSizing: "border-box", appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}>
            <option value="all">Semua Frame</option>
            <option value="none">Tanpa Frame</option>
            {frameNameChips.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <ChevronRight size={14} color={FP_SUB} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%) rotate(90deg)", pointerEvents: "none" }} />
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "8px 16px 40px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <Loader2 size={22} color={RED} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : loadErr ? (
          <div style={{ textAlign: "center", padding: "30px 10px", fontSize: 12, color: "#FCA5A5" }}>{loadErr}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 10px", fontSize: 12, color: FP_SUB }}>
            {q.trim() ? `Tidak ada foto dgn nomor "${q}".` : "Belum ada foto di sesi ini."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 10 }}>
            {filtered.map((it, idx) => {
              const tpl = templateById.get(it.frame_template_id) || null;
              // Frame-nya sudah dihapus operator tapi foto ini tetap
              // tercatat pernah memakainya (frame_name snapshot ada,
              // template live-nya tidak) - visual frame-nya memang tidak
              // bisa direkonstruksi lagi, tapi labeli biar tetap jelas drpd
              // kelihatan seakan "Tanpa Frame" dari awal.
              const frameDeleted = !tpl && !!it.frame_name;
              return (
                <button key={it.photo_code} onClick={() => setOpenIndex(idx)}
                  style={{ textAlign: "left", padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT }}>
                  <div style={{ position: "relative", borderRadius: 13, overflow: "hidden", aspectRatio: `${ratio.w} / ${ratio.h}`, background: tpl?.baseStyle === "polaroid" ? "#fff" : FP_CARD_HI, border: `1.5px solid ${FP_LINE}`, containerType: "size" }}>
                    <PhotoFrame photo={{ url: it.url }} ratio={ratio} crop={it.crop || DEFAULT_CROP} frame={tpl ? "custom" : "none"}
                      mode="screen" queueLabel={it.queue_label || "0000"} sessionTitle={sessionTitle}
                      customElements={tpl?.elements} customBaseStyle={tpl?.baseStyle} customFonts={customFonts} />
                    {frameDeleted && (
                      <span style={{ position: "absolute", left: 6, top: 6, maxWidth: "calc(100% - 12px)", padding: "3px 7px", borderRadius: 999, background: "rgba(0,0,0,0.65)", color: "rgba(255,255,255,0.75)", fontSize: 9, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.frame_name}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 5, fontSize: 10.5, fontWeight: 800, color: FP_SUB, textAlign: "center", fontFamily: "monospace", letterSpacing: "0.02em" }}>
                    #{it.queue_label || "----"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {openItem && (
        <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(0,0,0,0.94)", display: "flex", flexDirection: "column", animation: "rpv-fp-sheet-backdrop .18s ease both" }}>
          <div style={{ padding: "16px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#fff", fontFamily: "monospace", letterSpacing: "0.03em" }}>#{openItem.queue_label || "----"}</span>
            <button onClick={closeLightbox} aria-label="Tutup"
              style={{ width: 36, height: 36, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>

          <div onPointerDown={onSwipeDown} onPointerUp={onSwipeUp}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 8px", position: "relative", touchAction: "pan-y" }}>
            <button onClick={() => goDelta(-1)} disabled={openIndex === 0} aria-label="Foto sebelumnya"
              style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: openIndex === 0 ? "default" : "pointer", opacity: openIndex === 0 ? 0.3 : 1 }}>
              <ChevronLeft size={19} />
            </button>
            <div style={{ position: "relative", width: "100%", maxWidth: 320, aspectRatio: `${ratio.w} / ${ratio.h}`, borderRadius: 18, overflow: "hidden", border: `1.5px solid ${FP_LINE}`, boxShadow: "0 24px 60px -16px rgba(0,0,0,0.7)", flexShrink: 0 }}>
              <PhotoFrame photo={{ url: openItem.url }} ratio={ratio} crop={openItem.crop || DEFAULT_CROP} frame={openTemplate ? "custom" : "none"}
                mode="screen" queueLabel={openItem.queue_label || "0000"} sessionTitle={sessionTitle}
                customElements={openTemplate?.elements} customBaseStyle={openTemplate?.baseStyle} customFonts={customFonts} />
              {qrOpenCode === openItem.photo_code && (
                <div onClick={() => setQrOpenCode(null)}
                  style={{ position: "absolute", inset: 0, background: "rgba(10,10,12,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer" }}>
                  {qrLoading ? (
                    <Loader2 size={22} color={MAGA} style={{ animation: "spin 1s linear infinite" }} />
                  ) : qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt={`QR ${openItem.photo_code}`} width={160} height={160} style={{ display: "block", borderRadius: 10, background: "#fff", padding: 8 }} />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#FCA5A5" }}>Gagal memuat QR.</span>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => goDelta(1)} disabled={openIndex === filtered.length - 1} aria-label="Foto berikutnya"
              style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: openIndex === filtered.length - 1 ? "default" : "pointer", opacity: openIndex === filtered.length - 1 ? 0.3 : 1 }}>
              <ChevronRight size={19} />
            </button>
          </div>

          {filtered.length > 1 && (
            <div style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>{openIndex + 1} / {filtered.length}</div>
          )}

          <div style={{ padding: "12px 16px calc(28px + env(safe-area-inset-bottom, 0px))", display: "flex", gap: 10, maxWidth: 400, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <button onClick={() => toggleQr(openItem)}
              style={{ flex: 1, height: 46, borderRadius: 13, border: `1.5px solid ${qrOpenCode === openItem.photo_code ? "#C6168D66" : "rgba(255,255,255,0.18)"}`, background: qrOpenCode === openItem.photo_code ? "rgba(198,22,141,0.14)" : "rgba(255,255,255,0.08)", color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <QrCode size={14} /> {qrOpenCode === openItem.photo_code ? "Sembunyikan QR" : "Tampilkan QR Share"}
            </button>
            <button onClick={() => handleDownload(openItem, openTemplate)} disabled={downloadingCode === openItem.photo_code}
              style={{ flex: 1, height: 46, borderRadius: 13, border: "none", cursor: downloadingCode === openItem.photo_code ? "default" : "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: `linear-gradient(135deg,${RED},${MAGA})`, opacity: downloadingCode && downloadingCode !== openItem.photo_code ? 0.5 : 1 }}>
              {downloadingCode === openItem.photo_code ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />}
              {downloadingCode === openItem.photo_code ? "…" : "Download"}
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
function CameraView({ videoRef, cameraState, facing, onFlip, canFlip = true, onCapture, onRetry, onUseGallery, onBack, headerTitle, sessionTitle, overlayElements, overlayCustomFonts }) {
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
              <FrameOverlayElements customElements={overlayElements} customFonts={overlayCustomFonts} mode="screen" ratio={ratio} sessionTitle={sessionTitle} queueLabel="0000" />
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

      {/* Shutter + galeri + ganti kamera - UPDATE (permintaan user: "terbalik
          galeri di kiri dan switch di kanan, dan jangan terlalu rapat"):
          SEBELUMNYA ganti-kamera di KIRI / galeri di KANAN dgn
          justify-content:"space-between" (maxWidth 360) - skrg DIBALIK jd
          galeri DI KIRI shutter, shutter di tengah, ganti-kamera DI KANAN
          shutter (sesuai referensi screenshot user), dan jarak antar tombol
          diperlebar (maxWidth naik jadi 400 + gap eksplisit 24px, bukan cuma
          space-between dlm lebar sempit) agar tidak terlalu rapat. */}
      {cameraState === "ready" && (
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 28, padding: "14px 28px 30px", maxWidth: 400, margin: "0 auto" }}>
          <button onClick={onUseGallery} aria-label="Pilih dari galeri" style={{ width: 44, height: 44, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <ImagePlus size={19} />
          </button>
          <button onClick={onCapture} aria-label="Jepret foto"
            style={{
              width: 74, height: 74, borderRadius: 999, border: "4px solid rgba(255,255,255,0.9)",
              background: "rgba(255,255,255,0.18)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
            <span style={{ width: 58, height: 58, borderRadius: 999, background: "#fff" }} />
          </button>
          {/* Jika device cuma punya 1 kamera (hasil enumerateDevices), tombol
              ini dinonaktifkan - diklik tidak terjadi apa apa, bukan flip
              orientasi ke lensa yg tidak ada. */}
          <button onClick={onFlip} disabled={!canFlip} aria-label="Ganti kamera" aria-disabled={!canFlip}
            style={{ width: 44, height: 44, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: canFlip ? "pointer" : "default", flexShrink: 0, opacity: canFlip ? 1 : 0.35 }}>
            <SwitchCamera size={19} />
          </button>
        </div>
      )}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
