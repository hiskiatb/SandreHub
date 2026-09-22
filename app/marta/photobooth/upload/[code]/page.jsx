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
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Camera, ImagePlus, Images, Loader2, RefreshCcw, RotateCcw, Sparkles, SwitchCamera, Ticket, Upload, X, Zap } from "lucide-react";
import Link from "next/link";
import { getRpvSession, uploadRpvPhoto, rpvThroughputMbps } from "../../../../../lib/rpv";
import { PhotoboothPwaHead, usePhotoboothServiceWorker } from "../../_pwa";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const INK = "#111116";
const LINE = "#E4E2EA";
const SUB = "#8A8A96";

function fmtElapsed(ms) {
  const s = ms / 1000;
  return `${s.toFixed(1)}s`;
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
  // Halaman "Mode Kamera" tamu - manifest/SW Photobooth dipasang di sini
  // (& /marta/photobooth/go) SAJA, supaya "Tambah ke Layar Utama" tidak
  // muncul di halaman Panel Operator.
  usePhotoboothServiceWorker();

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

  // Begitu sesi siap & belum ada foto sama sekali di antrean - LANGSUNG
  // buka kamera (ini yg dimaksud "klik sesi -> langsung interface kamera").
  useEffect(() => {
    if (state === "ready" && phase === "pick" && queue.length === 0) setCameraOpen(true);
  }, [state, phase, queue.length]);

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
      } catch { setState("notfound"); }
    })();
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
    }));
    setQueue((q) => [...items, ...q]);
    setPhase("preview"); // TIDAK langsung upload - tampilkan preview dulu, tamu review sebelum unggah
  };

  const removeItem = (id) => setQueue((q) => q.filter((x) => x.id !== id));

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
      });
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "done", progress: 1, photoCode, uploadMs, fileSizeBytes: fileSizeBytes ?? x.fileSizeBytes } : x)));
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

  if (state === "loading") {
    return <Center><Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} /></Center>;
  }
  if (state === "notfound") {
    return (
      <Center>
        <AlertTriangle size={30} color={RED} />
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: INK }}>Sesi tidak ditemukan</div>
        <div style={{ marginTop: 4, fontSize: 13, color: SUB, textAlign: "center", maxWidth: 280 }}>Link ini sudah tidak berlaku atau sesi photobooth belum aktif.</div>
      </Center>
    );
  }

  if (showSuccess) {
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

  if (cameraOpen) {
    return (
      <>
        <PhotoboothPwaHead />
        <CameraView
        videoRef={videoRef}
        cameraState={cameraState}
        facing={facing}
        onFlip={flipCamera}
        onCapture={capturePhoto}
        onRetry={() => startCamera(facing)}
        onUseGallery={() => { setCameraOpen(false); fileRef.current?.click(); }}
        canGoBack={queue.length > 0}
        onBack={() => setCameraOpen(false)}
        sessionTitle={session?.title}
        />
      </>
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: "#F4F4F6", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
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
          <Link href={`/marta/photobooth/upload/${code}/gallery`}
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px", borderRadius: 9, border: `1px solid ${LINE}`, color: "#5A5A68", fontSize: 11.5, fontWeight: 700, textDecoration: "none" }}>
            <Images size={13} /> Galeri
          </Link>
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

/** Ring progress melingkar kecil (SVG, tanpa library) - dipakai di tengah
 * tiap thumbnail foto yg lagi diunggah, menunjukkan PERSENTASE riil,
 * dipasangkan dgn timer teks (fmtElapsed) di bawahnya. */
function CircularProgress({ value }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 15, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 34, height: 34 }}>
      <svg width="34" height="34" viewBox="0 0 34 34" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="17" cy="17" r={r} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="3" />
        <circle cx="17" cy="17" r={r} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .2s ease" }} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>
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

/** Antarmuka kamera LIVE full-screen (getUserMedia) - dibuka begitu sesi
 * siap (default) atau lewat tombol "Ambil Foto Lagi". Shutter besar gaya
 * app kamera, tombol flip depan/belakang, & fallback "Pilih dari Galeri"
 * utk device tanpa kamera / izin ditolak. */
function CameraView({ videoRef, cameraState, facing, onFlip, onCapture, onRetry, onUseGallery, canGoBack, onBack, sessionTitle }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", fontFamily: FONT, display: "flex", flexDirection: "column", zIndex: 50 }}>
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

      {/* Header overlay - judul sesi + tombol kembali (kalau sudah ada foto di antrean) */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 14px", background: "linear-gradient(180deg,rgba(0,0,0,0.55),rgba(0,0,0,0))" }}>
        {canGoBack ? (
          <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={18} />
          </button>
        ) : <span style={{ width: 38 }} />}
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#fff", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{sessionTitle}</div>
        {cameraState === "ready" ? (
          <button onClick={onFlip} style={{ width: 38, height: 38, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <SwitchCamera size={18} />
          </button>
        ) : <span style={{ width: 38 }} />}
      </div>

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

      {/* Shutter + fallback galeri - hanya begitu feed kamera siap */}
      {cameraState === "ready" && (
        <div style={{ position: "relative", zIndex: 2, marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "0 20px 30px" }}>
          <button onClick={onCapture} aria-label="Jepret foto"
            style={{
              width: 74, height: 74, borderRadius: 999, border: "4px solid rgba(255,255,255,0.9)",
              background: "rgba(255,255,255,0.18)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <span style={{ width: 58, height: 58, borderRadius: 999, background: "#fff" }} />
          </button>
          <button onClick={onUseGallery} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
            <ImagePlus size={14} /> Pilih dari Galeri
          </button>
        </div>
      )}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
