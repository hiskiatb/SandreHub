"use client";
/**
 * /marta/photobooth/viewer/[code] — layar besar di lokasi acara (TV/monitor).
 * Halaman PUBLIK (tanpa login) — realtime menampilkan semua foto yg masuk ke
 * sesi ini, QR unik di pojok kanan bawah mengarah ke halaman download publik,
 * dan kotak "masukkan ID" utk mencari 1 foto by tiket klaim lalu mencetaknya.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { AlertTriangle, ChevronLeft, ChevronRight, Images, Loader2, Printer, QrCode as QrIcon, Search, Trash2, X } from "lucide-react";
import { getRpvSession, listRpvPhotos, subscribeRpvPhotos, rpvPublicUrl, getRpvPhotoByCode, deleteRpvPhoto } from "../../../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";

export default function RpvViewerPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

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

  useEffect(() => {
    (async () => {
      try {
        const s = await getRpvSession(code);
        if (!s || !s.is_active) { setState("notfound"); return; }
        setSession(s);
        const list = await listRpvPhotos(code);
        setPhotos(list);
        setState("ready");

        unsubRef.current = subscribeRpvPhotos(s.id, (row) => {
          setPhotos((prev) => {
            if (prev.some((p) => p.photo_code === row.code)) return prev;
            return [{ photo_code: row.code, storage_path: row.storage_path, uploaded_at: row.uploaded_at, url: rpvPublicUrl(row.storage_path) }, ...prev];
          });
        });
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
  useEffect(() => {
    if (typeof window === "undefined") return;
    const uploadUrl = `${window.location.origin}/marta/photobooth/upload/${code}`;
    QRCode.toDataURL(uploadUrl, { margin: 1, width: 220, color: { dark: "#111116", light: "#FFFFFF" } })
      .then(setQrUrl).catch(() => setQrUrl(""));
  }, [code]);

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

  const openViewer = useCallback((photoCode) => {
    const idx = photosAsc.findIndex((p) => p.photo_code === photoCode);
    if (idx >= 0) setViewIndex(idx);
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
      {/* Header */}
      <div style={{ padding: "26px 32px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#F0F0F2", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
            <Images size={24} color={RED} /> {session?.title}
          </div>
          <div style={{ fontSize: 13, color: "#8A8A96", marginTop: 4 }}>{photos.length} foto · kode sesi {code} · update realtime</div>
        </div>

        {/* Kotak cari ID utk print */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "8px 10px" }}>
          <Search size={15} color="#8A8A96" />
          <input value={lookup} onChange={(e) => { setLookup(e.target.value); setLookupState("idle"); }} onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            placeholder="Masukkan ID foto…" style={{ width: 150, background: "transparent", border: "none", outline: "none", color: "#F0F0F2", fontSize: 14, fontFamily: "monospace", letterSpacing: "0.06em" }} />
          <button onClick={handleLookup} disabled={lookupState === "loading"}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 9, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
            {lookupState === "loading" ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <Printer size={13} />} Cetak
          </button>
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
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "80px 0", color: "#5A5A68", fontSize: 14 }}>
            Menunggu foto pertama masuk — scan QR di pojok kanan bawah utk mengunggah.
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
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 10px 8px", background: "linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0.72) 100%)", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "monospace", letterSpacing: "0.06em" }}>
                ID {p.photo_code}
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

      {/* QR pojok kanan bawah - SEKARANG mengarah ke halaman Upload (ajakan
          ikut unggah foto), BUKAN lagi download semua foto sesi - download
          per-foto sudah ada di QR kecil di bawah tiap foto pada grid. */}
      <div style={{ position: "fixed", right: 26, bottom: 26, background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 10 }}>
        {qrUrl ? <img src={qrUrl} alt="QR upload foto" width={140} height={140} /> : <div style={{ width: 140, height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}><QrIcon size={28} color="#8A8A96" /></div>}
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#111116", textAlign: "center", lineHeight: 1.4 }}>
          Scan utk unggah fotomu<br /><span style={{ fontFamily: "monospace", letterSpacing: "0.08em", color: RED }}>{code}</span>
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
          <button onClick={closeViewer} aria-label="Tutup"
            style={{ position: "absolute", top: 22, right: 26, width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={18} />
          </button>
          <button onClick={() => handleDelete(photosAsc[viewIndex])} disabled={deletingCode === photosAsc[viewIndex].photo_code} aria-label="Hapus foto ini"
            style={{ position: "absolute", top: 22, right: 76, width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.14)", color: "#F87171", display: "flex", alignItems: "center", justifyContent: "center", cursor: deletingCode === photosAsc[viewIndex].photo_code ? "not-allowed" : "pointer", opacity: deletingCode === photosAsc[viewIndex].photo_code ? 0.5 : 1 }}>
            {deletingCode === photosAsc[viewIndex].photo_code ? <Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={16} />}
          </button>

          <div style={{ position: "absolute", top: 24, left: 26, fontSize: 13, fontWeight: 700, color: "#F0F0F2", fontFamily: "monospace", letterSpacing: "0.06em" }}>
            {viewIndex + 1} / {photosAsc.length} · ID {photosAsc[viewIndex].photo_code}
          </div>

          {photosAsc.length > 1 && (
            <button onClick={goPrev} aria-label="Foto sebelumnya"
              style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <ChevronLeft size={24} />
            </button>
          )}

          <img src={photosAsc[viewIndex].url} alt="" style={{ maxWidth: "min(92vw, 900px)", maxHeight: "76vh", objectFit: "contain", borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }} />

          {photosAsc.length > 1 && (
            <button onClick={goNext} aria-label="Foto berikutnya"
              style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <ChevronRight size={24} />
            </button>
          )}

          {photoQr[photosAsc[viewIndex].photo_code] && (
            <div style={{ marginTop: 18, background: "#fff", borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <img src={photoQr[photosAsc[viewIndex].photo_code]} alt="QR download foto ini" width={72} height={72} style={{ display: "block" }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "#111116" }}>Scan utk download</span>
            </div>
          )}
        </div>
      )}

      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
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
