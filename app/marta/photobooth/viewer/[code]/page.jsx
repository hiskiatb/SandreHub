"use client";
/**
 * /marta/photobooth/viewer/[code] — layar besar di lokasi acara (TV/monitor).
 * Halaman PUBLIK (tanpa login) — realtime menampilkan semua foto yg masuk ke
 * sesi ini, QR unik di pojok kanan bawah mengarah ke halaman download publik,
 * dan kotak "masukkan ID" utk mencari 1 foto by tiket klaim lalu mencetaknya.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { AlertTriangle, Camera, ChevronLeft, ChevronRight, Eye, EyeOff, Images, Link2, Loader2, Maximize2, Minimize2, Printer, QrCode as QrIcon, Search, Sparkles, Trash2, X, Zap } from "lucide-react";
import { getRpvSession, listRpvPhotos, subscribeRpvPhotos, rpvPublicUrl, getRpvPhotoByCode, deleteRpvPhoto, uploadRpvAiResult, rpvThroughputMbps } from "../../../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";

export default function RpvViewerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = (params?.code || "").toString().toUpperCase();
  // `?tv=1` - dipakai tombol "Buka Mode TV" di halaman Upload Hasil Gemini
  // biar langsung buka Viewer INI ke Mode TV, tanpa perlu klik lagi.
  const startInTvMode = searchParams?.get("tv") === "1";

  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [session, setSession] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [qrUrl, setQrUrl] = useState("");
  const [photoQr, setPhotoQr] = useState({}); // { [photo_code]: dataUrl } - QR unik per FOTO (download langsung foto itu)
  const [lookup, setLookup] = useState("");
  const [lookupState, setLookupState] = useState("idle"); // idle | loading | error
  const [lookupError, setLookupError] = useState("");
  const [viewIndex, setViewIndex] = useState(null); // index di photosAsc yg lagi dibuka full-screen, null = tertutup
  const [deletingCode, setDeletingCode] = useState(""); // photo_code yg lagi diproses hapus (disable tombolnya sementara)
  // Toggle "hide UI" di carousel full-screen - sembunyikan tombol tutup/
  // hapus/panah/label ID spy foto tampil bersih tanpa gangguan (mis. saat
  // dipakai foto acara/dipajang), TAPI navigasi geser kiri/kanan TETAP bisa
  // lewat panah keyboard ATAU tap di tepi kiri/kanan layar (lihat zona tap
  // di render carousel di bawah) - dan QR pojok kanan bawah ("Ikut Upload
  // Fotomu") TIDAK PERNAH ikut disembunyikan (itu div terpisah, di luar
  // blok carousel ini sama sekali).
  const [chromeHidden, setChromeHidden] = useState(false);
  // Indikator kecil di header: "live" kalau socket realtime tersambung,
  // "reconnecting" saat lagi sambung ulang (jaringan venue putus2) - foto
  // baru TETAP masuk otomatis walau lagi status ini karena ada fallback
  // polling di subscribeRpvPhotos (lib/rpv.js).
  const [liveStatus, setLiveStatus] = useState("connecting");
  // "Mode TV" - tampilan full-bleed foto terbaru + wordmark + QR raksasa di
  // bawah, persis konsep mockup TV booth ("SCAN TO DOWNLOAD") - dipisah dari
  // grid biasa (tetap ada, dipakai panitia utk kelola/hapus/cari-cetak),
  // jadi toggle saja, bukan ganti halaman.
  const [tvMode, setTvMode] = useState(startInTvMode);
  const [tvIndex, setTvIndex] = useState(0);
  const unsubRef = useRef(null);
  const touchStartXRef = useRef(null);

  // `photos` (dipakai grid) urutannya terbaru-dulu (utk highlight foto baru
  // masuk). Carousel geser kiri/kanan HARUS mengikuti URUTAN FOTO DIUPLOAD
  // (lama -> baru), jadi dibikin daftar terpisah yg diurutkan naik by
  // uploaded_at, dipakai khusus utk navigasi carousel & panah kiri/kanan.
  const photosAsc = useMemo(
    () => [...photos].sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at)),
    [photos]
  );

  // Mode TV: kalau SUDAH ada hasil AI (operator upload lewat tombol
  // sparkle), slideshow HANYA nampilin hasil AI itu (lebih layak dipamerin
  // ke tamu dibanding foto mentah) - kalau belum ada satupun hasil AI,
  // fallback nampilin foto mentah dulu spy layar TV tidak kosong nunggu.
  // `photos` sudah terurut terbaru-dulu jadi tvIndex=0 = yg terbaru.
  const tvPhotos = useMemo(() => {
    const aiOnly = photos.filter((p) => p.is_ai_result);
    return aiOnly.length > 0 ? aiOnly : photos;
  }, [photos]);

  // Begitu daftar tvPhotos bertambah (foto mentah baru masuk, ATAU hasil AI
  // baru diupload operator), langsung balik ke index 0 spy yg terbaru
  // tampil duluan, bukan nunggu giliran slideshow.
  const prevTvCountRef = useRef(0);
  useEffect(() => {
    if (tvPhotos.length > prevTvCountRef.current) setTvIndex(0);
    prevTvCountRef.current = tvPhotos.length;
  }, [tvPhotos.length]);

  useEffect(() => {
    if (!tvMode || tvPhotos.length < 2) return;
    const t = setInterval(() => setTvIndex((i) => (i + 1) % tvPhotos.length), 6000);
    return () => clearInterval(t);
  }, [tvMode, tvPhotos.length]);

  const tvPhoto = tvPhotos[Math.min(tvIndex, Math.max(tvPhotos.length - 1, 0))] || null;
  const tvShowingAi = !!tvPhoto?.is_ai_result;

  useEffect(() => {
    (async () => {
      try {
        const s = await getRpvSession(code);
        if (!s || !s.is_active) { setState("notfound"); return; }
        setSession(s);
        const list = await listRpvPhotos(code);
        setPhotos(list);
        setState("ready");
        // Tampilan pertama LANGSUNG layar preview (foto terbaru), bukan
        // grid - permintaan eksplisit user ("di viewer tampilan pertama
        // langsung layar preview saja"). Grid tetap ada, dibuka lewat
        // tombol "Lihat Semua" di pojok kiri atas carousel.
        if (list.length > 0) setViewIndex(list.length - 1);

        unsubRef.current = subscribeRpvPhotos(
          s.id,
          (row) => {
            const photoCode = row.photo_code ?? row.code;
            setPhotos((prev) => {
              if (prev.some((p) => p.photo_code === photoCode)) return prev;
              return [{ photo_code: photoCode, storage_path: row.storage_path, uploaded_at: row.uploaded_at, upload_ms: row.upload_ms, file_size_bytes: row.file_size_bytes, parent_code: row.parent_code, is_ai_result: row.is_ai_result, url: rpvPublicUrl(row.storage_path) }, ...prev];
            });
          },
          {
            sessionCode: code,
            onStatusChange: (status) => {
              if (status === "SUBSCRIBED") setLiveStatus("live");
              else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveStatus("reconnecting");
            },
          }
        );
      } catch { setState("notfound"); }
    })();
    return () => unsubRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // FIX: QR pojok kanan bawah SEBELUMNYA mengarah ke halaman "download
  // semua foto sesi ini" - padahal yg dibutuhkan tamu adalah download FOTO
  // MEREKA SENDIRI satu-satu, bukan zip semua foto orang lain. Diganti jadi
  // QR ke halaman Upload (ajakan scan utk unggah/upload lagi) - QR download
  // per-foto dipindah ke tiap tile foto di grid (lihat effect di bawah &
  // render grid), supaya setiap tamu bisa scan QR TEPAT DI BAWAH fotonya
  // sendiri utk mengunduhnya langsung ke HP.
  const latestPhoto = photos[0] || null; // `photos` terurut terbaru-dulu

  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = latestPhoto
      ? `${window.location.origin}/marta/photobooth/p/${latestPhoto.photo_code}`
      : `${window.location.origin}/marta/photobooth/upload/${code}`;
    QRCode.toDataURL(target, { margin: 1, width: 220, color: { dark: "#111116", light: "#FFFFFF" } })
      .then(setQrUrl).catch(() => setQrUrl(""));
  }, [code, latestPhoto]);

  // QR per-foto - generate begitu ada foto baru yg belum punya QR-nya
  // (termasuk yg masuk lewat Realtime), cache di state biar tidak
  // digenerate ulang tiap render. Isi QR = link ke halaman detail
  // /marta/photobooth/p/[photoCode] (share + download + ID + print),
  // BUKAN lagi URL gambar mentah - supaya scan QR membuka halaman yg
  // sudah ada tombol Share/Download/Print & ID-nya, bukan cuma file foto.
  useEffect(() => {
    if (typeof window === "undefined" || !photos.length) return;
    const pending = photos.filter((p) => !photoQr[p.photo_code]);
    if (!pending.length) return;
    let alive = true;
    Promise.all(
      pending.map((p) =>
        QRCode.toDataURL(`${window.location.origin}/marta/photobooth/p/${p.photo_code}`, { margin: 0, width: 120, color: { dark: "#111116", light: "#FFFFFF" } })
          .then((dataUrl) => [p.photo_code, dataUrl])
          .catch(() => [p.photo_code, ""])
      )
    ).then((entries) => {
      if (!alive) return;
      setPhotoQr((prev) => {
        const next = { ...prev };
        entries.forEach(([code2, dataUrl]) => { if (dataUrl) next[code2] = dataUrl; });
        return next;
      });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  const idleTimerRef = useRef(null);
  const wakeChrome = useCallback(() => {
    setChromeHidden(false);
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setChromeHidden(true), 3000);
  }, []);

  // Auto-hide tombol next/prev & kontrol lain saat carousel terbuka & kursor
  // diam >3 detik - permintaan eksplisit user. Cuma mousemove/touchstart yg
  // dianggap "gerakan kursor" (bukan klik navigasi/keyboard), jadi geser
  // foto lewat panah/keyboard/tap-zone TIDAK memicu tombol muncul lagi.
  useEffect(() => {
    if (viewIndex == null) { clearTimeout(idleTimerRef.current); return; }
    // Mulai idle-timer TANPA setState sinkron di badan effect (aturan
    // react-hooks/set-state-in-effect) - chromeHidden sudah di-reset ke
    // false oleh openViewer()/pembuka carousel lain sebelum effect ini
    // jalan, jadi di sini cukup PASANG timer hide-nya saja.
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setChromeHidden(true), 3000);
    window.addEventListener("mousemove", wakeChrome);
    window.addEventListener("touchstart", wakeChrome);
    return () => {
      window.removeEventListener("mousemove", wakeChrome);
      window.removeEventListener("touchstart", wakeChrome);
      clearTimeout(idleTimerRef.current);
    };
  }, [viewIndex, wakeChrome]);

  const openViewer = useCallback((photoCode) => {
    const idx = photosAsc.findIndex((p) => p.photo_code === photoCode);
    if (idx >= 0) { setViewIndex(idx); setChromeHidden(false); } // selalu mulai dgn UI terlihat tiap buka carousel
  }, [photosAsc]);
  const closeViewer = useCallback(() => setViewIndex(null), []);
  const goPrev = useCallback(() => {
    setViewIndex((i) => (i == null ? i : (i - 1 + photosAsc.length) % photosAsc.length));
  }, [photosAsc.length]);
  const goNext = useCallback(() => {
    setViewIndex((i) => (i == null ? i : (i + 1) % photosAsc.length));
  }, [photosAsc.length]);

  // Navigasi keyboard (panah kiri/kanan geser foto, Esc menutup) - berguna
  // kalau layar Viewer dikontrol dari keyboard/remote di lokasi acara.
  useEffect(() => {
    if (viewIndex == null) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewIndex, goPrev, goNext, closeViewer]);

  const handleLookup = async () => {
    const id = lookup.trim();
    if (!id) return;
    setLookupState("loading"); setLookupError("");
    try {
      const photo = await getRpvPhotoByCode(id);
      if (!photo || photo.session_code !== code) {
        setLookupState("error"); setLookupError("ID tidak ditemukan di sesi ini."); return;
      }
      // Buka halaman cetak khusus (full-bleed image + auto trigger print).
      window.open(`/marta/photobooth/print/${photo.photo_code}`, "_blank");
      setLookupState("idle"); setLookup("");
    } catch {
      setLookupState("error"); setLookupError("Gagal mencari foto.");
    }
  };

  // Hapus foto dari sisi Viewer (grid tile & carousel full-screen). Konfirmasi
  // dulu (window.confirm) supaya tidak ke-tap tidak sengaja di layar sentuh.
  const handleDelete = useCallback(async (photo) => {
    if (!photo || deletingCode) return;
    if (typeof window !== "undefined" && !window.confirm(`Hapus foto ID ${photo.photo_code}? Tindakan ini tidak bisa dibatalkan.`)) return;
    setDeletingCode(photo.photo_code);
    try {
      await deleteRpvPhoto(code, photo.photo_code, photo.storage_path);
      setPhotos((prev) => prev.filter((p) => p.photo_code !== photo.photo_code));
      setViewIndex((i) => {
        if (i == null) return i;
        const idx = photosAsc.findIndex((p) => p.photo_code === photo.photo_code);
        if (idx < 0) return i;
        return null; // foto yg lagi dibuka dihapus -> tutup carousel
      });
    } catch {
      if (typeof window !== "undefined") window.alert("Gagal menghapus foto. Coba lagi.");
    } finally {
      setDeletingCode("");
    }
  }, [code, deletingCode, photosAsc]);

  // Upload hasil edit Gemini (operator, dari file di komputer - lihat
  // tombol "sparkle" di tiap tile) - di-link ke foto ASLI-nya via
  // parentCode, tampil sbg tile terpisah begitu selesai (realtime, sama
  // spt upload tamu biasa).
  const aiFileRef = useRef(null);
  const [aiUploadTarget, setAiUploadTarget] = useState(""); // photo_code parent yg lagi ditembak tombol sparkle-nya
  const [aiUploadingFor, setAiUploadingFor] = useState(""); // photo_code parent yg lagi proses upload
  const [aiUploadError, setAiUploadError] = useState("");

  const openAiUpload = useCallback((parentCode) => {
    setAiUploadTarget(parentCode);
    setAiUploadError("");
    aiFileRef.current?.click();
  }, []);

  const onAiFilePicked = useCallback(async (e) => {
    const file = e.target.files?.[0];
    const parentCode = aiUploadTarget;
    e.target.value = "";
    if (!file || !parentCode) return;
    setAiUploadingFor(parentCode);
    setAiUploadError("");
    try {
      await uploadRpvAiResult(code, parentCode, file);
      // Tidak perlu setPhotos manual - realtime INSERT (+ fallback polling
      // di subscribeRpvPhotos) yg nambahin tile barunya begitu confirm sukses.
    } catch {
      setAiUploadError(`Gagal upload hasil AI untuk ${parentCode}.`);
    } finally {
      setAiUploadingFor("");
    }
  }, [code, aiUploadTarget]);

  if (state === "loading") {
    return <Center><Loader2 size={30} color={RED} style={{ animation: "spin 1s linear infinite" }} /></Center>;
  }
  if (state === "notfound") {
    return (
      <Center>
        <AlertTriangle size={34} color={RED} />
        <div style={{ marginTop: 14, fontSize: 18, fontWeight: 700, color: "#fff" }}>Sesi tidak ditemukan</div>
      </Center>
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: "#0A0A0B", fontFamily: FONT, position: "relative", overflow: "hidden" }}>
      {/* Ambient glow brand di background - dekoratif saja (pointerEvents:none),
          bikin layar besar acara terasa "hidup"/mewah, bukan kotak hitam polos. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: `radial-gradient(560px 420px at 8% -6%, ${RED}22, transparent 60%), radial-gradient(620px 460px at 104% 108%, ${MAGA}22, transparent 60%)` }} />

      {/* Header */}

      {/* Mode TV - full-bleed foto terbaru (slideshow otomatis kalau >1
          foto) + wordmark event di atas + QR raksasa "SCAN TO DOWNLOAD" di
          bawah, meniru persis mockup layar TV booth yg diminta. Overlay
          fixed di atas segalanya - grid/header di baliknya tetap jalan
          normal (realtime, dsb), cuma ketutup visual saja. */}
      {tvMode && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000" }}>
          {tvPhoto ? (
            <>
              <img src={tvPhoto.url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(28px) brightness(0.55)", transform: "scale(1.15)" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "min(6vh,64px) min(6vw,64px) min(18vh,220px)" }}>
                <img key={tvPhoto.photo_code} src={tvPhoto.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 20, boxShadow: "0 40px 100px -20px rgba(0,0,0,0.7)", objectFit: "contain", animation: "rpv-tv-fade .5s ease" }} />
              </div>
            </>
          ) : (
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(700px 520px at 20% 10%, ${RED}33, transparent 60%), radial-gradient(700px 520px at 85% 90%, ${MAGA}33, transparent 60%), #0A0A0B` }} />
          )}

          {/* Wordmark atas */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "min(5vh,42px) min(5vw,56px) min(9vh,80px)", background: "linear-gradient(180deg, rgba(0,0,0,0.65), transparent)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "clamp(20px,2.6vw,34px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: "0.5ch" }}>
                <span style={{ color: RED }}>5G</span> <span style={{ opacity: 0.6 }}>×</span> <span style={{ color: "#E7A8FF" }}>Gemini</span> <span style={{ opacity: 0.85 }}>Live Photo</span>
              </div>
              <div style={{ fontSize: "clamp(12px,1.3vw,16px)", color: "rgba(255,255,255,0.72)", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                {session?.title} · Your Moment
                {tvShowingAi && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "clamp(10px,1vw,12px)", fontWeight: 800, color: "#fff", background: `linear-gradient(135deg,${RED},${MAGA})`, borderRadius: 999, padding: "3px 9px 3px 7px" }}>
                    <Sparkles size={11} /> AI Enhanced
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setTvMode(false)}
              style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(0,0,0,0.35)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <Minimize2 size={15} /> Keluar Mode TV
            </button>
          </div>

          {/* QR raksasa bawah - "SCAN TO DOWNLOAD" */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "min(6vh,56px) min(5vw,56px) min(5vh,44px)", background: "linear-gradient(0deg, rgba(0,0,0,0.72), transparent)", display: "flex", alignItems: "center", justifyContent: "center", gap: "min(3vw,32px)" }}>
            <div style={{ background: "#fff", borderRadius: 18, padding: "clamp(10px,1.4vw,16px)", boxShadow: "0 20px 50px -14px rgba(0,0,0,0.6)" }}>
              {qrUrl && <img src={qrUrl} alt={latestPhoto ? "QR lihat & download foto" : "QR upload"} style={{ width: "clamp(90px,11vw,150px)", height: "clamp(90px,11vw,150px)", display: "block" }} />}
            </div>
            <div>
              <div style={{ fontSize: "clamp(18px,2.4vw,30px)", fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>{tvPhoto ? "SCAN TO DOWNLOAD" : "SCAN TO UPLOAD"}</div>
              <div style={{ fontSize: "clamp(12px,1.3vw,15px)", color: "rgba(255,255,255,0.75)", marginTop: 4 }}>{tvPhoto ? "Arahkan kamera HP ke QR ini utk lihat, download & share fotomu" : "Arahkan kamera HP ke QR ini untuk ikut unggah fotomu"}</div>
              {tvPhoto && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "clamp(11px,1.1vw,13px)", fontFamily: "monospace", color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 999, padding: "5px 12px" }}>
                    <Camera size={13} /> {tvPhoto.photo_code}
                  </div>
                  {/* Showcase kecepatan upload 5G Indosat - ini justru INTI
                      demo-nya (lihat konteks obrolan), jadi dibuat menonjol
                      (hijau, ikon petir) bukan cuma detail kecil. */}
                  {!!tvPhoto.upload_ms && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "clamp(11px,1.2vw,14px)", fontWeight: 800, color: "#7CF5A8", background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: 999, padding: "5px 12px" }}>
                      <Zap size={13} /> <SpeedLabel ms={tvPhoto.upload_ms} bytes={tvPhoto.file_size_bytes} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "26px 32px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#F5F5F7", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg,${RED},${MAGA})`, boxShadow: `0 6px 18px -6px ${RED}88` }}>
              <Images size={20} color="#fff" />
            </span>
            {session?.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 13, color: "#9C9CA8", letterSpacing: "0.01em" }}>
              <b style={{ color: "#E7E7EC" }}>{photos.length}</b> foto · kode sesi <span style={{ fontFamily: "monospace", color: "#C7C7D1" }}>{code}</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, padding: "3px 9px 3px 7px", borderRadius: 20, color: liveStatus === "live" ? "#7CF5A8" : "#F5C56B", background: liveStatus === "live" ? "rgba(52,211,153,0.12)" : "rgba(245,197,107,0.12)", border: `1px solid ${liveStatus === "live" ? "rgba(52,211,153,0.3)" : "rgba(245,197,107,0.3)"}` }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: liveStatus === "live" ? "#34D399" : "#F5C56B", boxShadow: liveStatus === "live" ? "0 0 0 0 rgba(52,211,153,0.6)" : "none", animation: liveStatus === "live" ? "rpv-live-dot 1.6s ease-out infinite" : "none" }} />
              {liveStatus === "live" ? "Live" : "Menyambung…"}
            </span>
          </div>
        </div>

        {/* Toggle "Mode TV" - full-bleed foto terbaru + QR raksasa, sesuai
            konsep mockup booth. */}
        <button onClick={() => setTvMode(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))", color: "#E7E7EC", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 10px 30px -12px rgba(0,0,0,0.5)" }}>
          <Maximize2 size={15} /> Mode TV
        </button>

        {/* Kotak cari ID utk print - dinaikkan jadi card dgn elevasi + label kecil,
            biar konsisten sama bahasa desain card QR pojok kanan bawah (bukan
            cuma kotak polos nempel di header). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "10px 12px", boxShadow: "0 10px 30px -12px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#7A7A88", letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 2 }}>Cari &amp; cetak foto</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 10px", flex: 1 }}>
              <Search size={15} color="#8A8A96" />
              <input value={lookup} onChange={(e) => { setLookup(e.target.value); setLookupState("idle"); }} onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                placeholder="cth. 5GMDN-260917-0087" style={{ width: 210, background: "transparent", border: "none", outline: "none", color: "#F0F0F2", fontSize: 13.5, fontFamily: "monospace", letterSpacing: "0.03em" }} />
            </div>
            <button onClick={handleLookup} disabled={lookupState === "loading"}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer", boxShadow: `0 6px 16px -6px ${RED}77` }}>
              {lookupState === "loading" ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <Printer size={13} />} Cetak
            </button>
          </div>
        </div>
      </div>
      {lookupError && (
        <div style={{ margin: "0 32px 10px", color: "#F87171", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
          <X size={13} /> {lookupError}
        </div>
      )}

      {/* Grid foto */}
      <div style={{ padding: "6px 32px 140px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        {photos.length === 0 && (
          <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", alignItems: "center", padding: "120px 0 90px", textAlign: "center" }}>
            <div style={{ position: "relative", width: 84, height: 84, marginBottom: 22 }}>
              <div style={{ position: "absolute", inset: -10, borderRadius: "50%", border: `1.5px solid ${RED}44`, animation: "rpv-empty-ring 2.4s ease-out infinite" }} />
              <div style={{ position: "absolute", inset: -10, borderRadius: "50%", border: `1.5px solid ${MAGA}33`, animation: "rpv-empty-ring 2.4s ease-out infinite 0.6s" }} />
              <div style={{ width: 84, height: 84, borderRadius: 22, background: `linear-gradient(135deg,${RED},${MAGA})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 14px 34px -10px ${RED}66` }}>
                <Camera size={34} color="#fff" />
              </div>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#E7E7EC", letterSpacing: "-0.01em" }}>Menunggu foto pertama</div>
            <div style={{ fontSize: 13.5, color: "#767684", marginTop: 6, maxWidth: 340, lineHeight: 1.55 }}>
              Foto akan langsung muncul di sini begitu ada yg diunggah — ajak tamu scan QR &ldquo;Ikut Upload Fotomu&rdquo; di pojok kanan bawah.
            </div>
          </div>
        )}
        {photos.map((p) => (
          <div key={p.photo_code} onClick={() => openViewer(p.photo_code)}
            style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: "3/4", background: "#1A1A1E", cursor: "pointer" }}>
            <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {/* Tombol hapus per-tile - stopPropagation supaya tidak ikut membuka carousel. */}
            <button onClick={(e) => { e.stopPropagation(); handleDelete(p); }} disabled={deletingCode === p.photo_code} aria-label={`Hapus foto ${p.photo_code}`}
              style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(10,10,11,0.72)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: deletingCode === p.photo_code ? "not-allowed" : "pointer", opacity: deletingCode === p.photo_code ? 0.5 : 1 }}>
              {deletingCode === p.photo_code ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={13} />}
            </button>
            {/* Tombol "Upload hasil AI" - cuma di foto ASLI (bukan di tile
                hasil AI itu sendiri, tidak masuk akal nge-link hasil AI ke
                hasil AI). Operator klik -> pilih file hasil download Gemini
                -> otomatis ke-link ke foto ini via parentCode. */}
            {!p.is_ai_result && (
              <button onClick={(e) => { e.stopPropagation(); openAiUpload(p.photo_code); }} disabled={aiUploadingFor === p.photo_code}
                aria-label={`Upload hasil AI utk foto ${p.photo_code}`} title="Upload hasil edit Gemini"
                style={{ position: "absolute", top: 8, right: 44, width: 30, height: 30, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: aiUploadingFor === p.photo_code ? "rgba(198,22,141,0.55)" : "rgba(10,10,11,0.72)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: aiUploadingFor === p.photo_code ? "not-allowed" : "pointer" }}>
                {aiUploadingFor === p.photo_code ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <Sparkles size={13} />}
              </button>
            )}
            {p.is_ai_result && (
              <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#fff", background: `linear-gradient(135deg,${RED},${MAGA})`, borderRadius: 999, padding: "3px 8px 3px 6px" }}>
                <Sparkles size={10} /> Hasil AI
              </div>
            )}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 10px 8px", background: "linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0.72) 100%)", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "monospace", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 5 }}>
                  {p.is_ai_result && <Link2 size={11} color="#F0A8DC" />}
                  ID {p.photo_code}
                </div>
                {/* Showcase kecepatan upload raw (HP -> Storage) - lihat
                    SpeedLabel & rpvThroughputMbps di lib/rpv.js utk gimana
                    ms mentah dikonversi jadi Mbps yg apple-to-apple antar
                    ukuran file beda-beda. */}
                {!!p.upload_ms && (
                  <div style={{ fontSize: 10, color: "#9CE6C4", fontWeight: 600, marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                    <Zap size={10} /> <SpeedLabel ms={p.upload_ms} bytes={p.file_size_bytes} />
                  </div>
                )}
              </div>
              {/* QR unik foto ini - scan utk download LANGSUNG foto ini ke HP, bukan zip semua foto sesi. */}
              {photoQr[p.photo_code] && (
                <div style={{ background: "#fff", borderRadius: 6, padding: 3, flexShrink: 0, lineHeight: 0 }}>
                  <img src={photoQr[p.photo_code]} alt={`QR download foto ${p.photo_code}`} width={44} height={44} style={{ display: "block" }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input file tersembunyi utk tombol sparkle "Upload hasil AI" - satu
          input dipakai bergilir utk semua tile (target tile-nya disimpan di
          aiUploadTarget), bukan 1 input per tile. */}
      <input ref={aiFileRef} type="file" accept="image/*" onChange={onAiFilePicked} style={{ display: "none" }} />
      {aiUploadError && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: "rgba(248,113,113,0.16)", border: "1px solid rgba(248,113,113,0.4)", color: "#F87171", fontSize: 13, fontWeight: 600, padding: "10px 16px", borderRadius: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} /> {aiUploadError}
        </div>
      )}

      {/* QR pojok kanan bawah - SEKARANG mengarah ke halaman Upload (ajakan
          ikut unggah foto), BUKAN lagi download semua foto sesi - download
          per-foto sudah ada di QR kecil di bawah tiap foto pada grid. */}
      {/* Kartu QR pojok kanan bawah - didesain ulang jadi "kartu ajakan"
          yg lebih jelas & menarik perhatian (dulu cuma kotak putih polos +
          QR + teks kecil): header gradient brand MartaHub dgn ikon kamera
          & judul ajakan yg besar, QR dibingkai kotak putih ber-border +
          aksen sudut spy kelihatan "kartu" bukan cuma gambar mengambang,
          dan kode sesi ditampilkan sbg badge/pill spy gampang dibaca dari
          jarak jauh (di lokasi acara). Ring pulsing halus di sekeliling
          kartu menarik perhatian tanpa mengganggu. */}
      <div style={{ position: "fixed", right: 26, bottom: 26, zIndex: 10 }}>
        <div style={{ position: "absolute", inset: -6, borderRadius: 26, border: `2px solid ${RED}`, opacity: 0.35, animation: "rpv-qr-pulse 2.2s ease-out infinite" }} />
        <div style={{
          position: "relative", width: 196, background: "#fff", borderRadius: 22, overflow: "hidden",
          boxShadow: "0 18px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.25)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
            background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff",
          }}>
            <div style={{ width: 26, height: 26, borderRadius: 9, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Camera size={14} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, letterSpacing: "-0.01em" }}>
              {latestPhoto ? <>Lihat &amp; Download<br />Fotomu!</> : <>Ikut Upload<br />Fotomu!</>}
            </div>
          </div>
          <div style={{ padding: "16px 16px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative", width: 148, height: 148, borderRadius: 14, border: "1.5px solid #EDEDF2", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Aksen sudut - kesan "kartu QR" yg lebih dirancang, bukan cuma gambar polos ditaruh di kotak. */}
              {["0,0", "0,1", "1,0", "1,1"].map((pos) => {
                const [vy, vx] = pos.split(",");
                const top = vy === "0" ? -1.5 : undefined, bottom = vy === "1" ? -1.5 : undefined;
                const left = vx === "0" ? -1.5 : undefined, right = vx === "1" ? -1.5 : undefined;
                return (
                  <div key={pos} style={{
                    position: "absolute", top, bottom, left, right, width: 16, height: 16,
                    borderTop: vy === "0" ? `2.5px solid ${RED}` : "none",
                    borderBottom: vy === "1" ? `2.5px solid ${RED}` : "none",
                    borderLeft: vx === "0" ? `2.5px solid ${RED}` : "none",
                    borderRight: vx === "1" ? `2.5px solid ${RED}` : "none",
                    borderRadius: 4,
                  }} />
                );
              })}
              {qrUrl ? (
                <img src={qrUrl} alt={latestPhoto ? "QR lihat & download foto" : "QR upload foto"} width={124} height={124} style={{ display: "block" }} />
              ) : (
                <Loader2 size={26} color="#C7C7D1" style={{ animation: "spin 1s linear infinite" }} />
              )}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#5A5A68", textAlign: "center" }}>
              {latestPhoto ? "Scan utk preview, download & share" : "Scan pakai kamera HP"}
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 999,
              background: "#FBEAEC",
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: RED, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.08em", color: RED }}>{code}</span>
            </div>
          </div>
        </div>
      </div>
      {/* Carousel full-screen - geser kiri/kanan mengikuti URUTAN FOTO
          DIUPLOAD (lama -> baru), dibuka dgn klik salah satu foto di grid.
          Panah kiri/kanan, keyboard ArrowLeft/ArrowRight (lihat effect di
          atas), & swipe sentuh semua didukung. */}
      {viewIndex != null && photosAsc[viewIndex] && (
        <div
          onTouchStart={(e) => { touchStartXRef.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => {
            const startX = touchStartXRef.current;
            touchStartXRef.current = null;
            if (startX == null) return;
            const endX = e.changedTouches[0]?.clientX ?? startX;
            const dx = endX - startX;
            if (Math.abs(dx) < 40) return; // swipe terlalu pendek, abaikan
            if (dx > 0) goPrev(); else goNext();
          }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", zIndex: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {/* Zona tap tepi kiri/kanan - navigasi tetap bisa dipakai (klik
              atau keyboard ArrowLeft/ArrowRight, lihat effect keyboard di
              atas) WALAU UI disembunyikan (chromeHidden) & tombol panah
              ikut hilang - berguna khususnya di layar sentuh tanpa
              keyboard. Lebarnya cuma di tepi (14%) spy tidak menutupi
              area foto/klik-buka lain. */}
          {chromeHidden && photosAsc.length > 1 && (
            <>
              <div onClick={goPrev} aria-label="Foto sebelumnya" style={{ position: "absolute", inset: "0 auto 0 0", width: "14%", cursor: "pointer", zIndex: 1 }} />
              <div onClick={goNext} aria-label="Foto berikutnya" style={{ position: "absolute", inset: "0 0 0 auto", width: "14%", cursor: "pointer", zIndex: 1 }} />
            </>
          )}

          {/* Toggle hide/show UI - SELALU tampil (inilah satu2nya kontrol
              yg tidak ikut disembunyikan, kalau tidak user tidak akan bisa
              menampilkan lagi UI-nya). */}
          <button onClick={() => setChromeHidden((v) => !v)} aria-label={chromeHidden ? "Tampilkan UI" : "Sembunyikan UI"}
            title={chromeHidden ? "Tampilkan UI" : "Sembunyikan UI"}
            style={{ position: "absolute", top: 22, left: 26, zIndex: 2, width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            {chromeHidden ? <Eye size={17} /> : <EyeOff size={17} />}
          </button>

          {!chromeHidden && (
            <>
              <button onClick={closeViewer} aria-label="Lihat semua foto (grid)" title="Lihat semua foto"
                style={{ position: "absolute", top: 22, left: 76, height: 40, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: FONT }}>
                <Images size={15} /> Lihat Semua
              </button>
              <button onClick={closeViewer} aria-label="Tutup"
                style={{ position: "absolute", top: 22, right: 26, width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={18} />
              </button>
              <button onClick={() => handleDelete(photosAsc[viewIndex])} disabled={deletingCode === photosAsc[viewIndex].photo_code} aria-label="Hapus foto ini"
                style={{ position: "absolute", top: 22, right: 76, width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.14)", color: "#F87171", display: "flex", alignItems: "center", justifyContent: "center", cursor: deletingCode === photosAsc[viewIndex].photo_code ? "not-allowed" : "pointer", opacity: deletingCode === photosAsc[viewIndex].photo_code ? 0.5 : 1 }}>
                {deletingCode === photosAsc[viewIndex].photo_code ? <Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={16} />}
              </button>

              <div style={{ position: "absolute", top: 72, left: 76, fontSize: 13, fontWeight: 700, color: "#F0F0F2", fontFamily: "monospace", letterSpacing: "0.06em" }}>
                {viewIndex + 1} / {photosAsc.length} · ID {photosAsc[viewIndex].photo_code}
              </div>

              {photosAsc.length > 1 && (
                <button onClick={goPrev} aria-label="Foto sebelumnya"
                  style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 2 }}>
                  <ChevronLeft size={24} />
                </button>
              )}
            </>
          )}

          <img src={photosAsc[viewIndex].url} alt="" style={{ maxWidth: "min(92vw, 900px)", maxHeight: "76vh", objectFit: "contain", borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }} />

          {!chromeHidden && (
            <>
              {photosAsc.length > 1 && (
                <button onClick={goNext} aria-label="Foto berikutnya"
                  style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 2 }}>
                  <ChevronRight size={24} />
                </button>
              )}

              {photoQr[photosAsc[viewIndex].photo_code] && (
                <div style={{ marginTop: 18, background: "#fff", borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <img src={photoQr[photosAsc[viewIndex].photo_code]} alt="QR download foto ini" width={72} height={72} style={{ display: "block" }} />
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: "#111116" }}>Scan utk download</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <style>{"@keyframes spin{to{transform:rotate(360deg)}} @keyframes rpv-qr-pulse{0%{transform:scale(0.97);opacity:0.45}70%{transform:scale(1.04);opacity:0}100%{transform:scale(1.04);opacity:0}} @keyframes rpv-live-dot{0%{box-shadow:0 0 0 0 rgba(52,211,153,0.55)}100%{box-shadow:0 0 0 6px rgba(52,211,153,0)}} @keyframes rpv-empty-ring{0%{transform:scale(0.85);opacity:0.9}100%{transform:scale(1.35);opacity:0}} @keyframes rpv-tv-fade{from{opacity:0;transform:scale(0.98)}to{opacity:1;transform:scale(1)}}"}</style>
    </div>
  );
}

/** Label kecil showcase kecepatan - "842 ms · 4.1 Mbps" (throughput riil,
    bukan cuma ms mentah - lihat komentar rpvThroughputMbps di lib/rpv.js). */
function SpeedLabel({ ms, bytes }) {
  if (!ms) return null;
  const mbps = rpvThroughputMbps(bytes, ms);
  return (
    <>{ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}{mbps ? ` · ${mbps.toFixed(1)} Mbps` : ""}</>
  );
}

function Center({ children }) {
  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0A0A0B", fontFamily: FONT }}>
      {children}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
