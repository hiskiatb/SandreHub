"use client";
/**
 * /marta/photobooth — "RUANG KONTROL" operator (bukan lagi daftar sesi +
 * form terpisah). Dirombak total ("jangan ada lagi pilihan Mode Kamera, kan
 * sudah dipisahkan di awal [di /marta/login]; langsung saja layoutnya...")
 * jadi satu layar kerja 2x2 utk SATU sesi aktif:
 *
 *   ┌─────────────────────┬─────────────────────┐
 *   │ Preview foto kamera   │ Connect Folder        │  <- 50% atas
 *   │ (geser kiri/kanan,     │ (isi folder Download   │
 *   │  TIDAK auto-refresh)   │  otomatis Gemini)      │
 *   ├─────────────────────┼─────────────────────┤
 *   │ Template/Prompt        │ Drag file utk upload   │  <- 50% bawah
 *   │ (dikelola dr Settings) │ balik + hasil Gemini    │
 *   └─────────────────────┴─────────────────────┘
 *
 * Sesi aktif + pembuatan sesi baru + kelola prompt SEKARANG semua pindah ke
 * panel "Settings" (ikon gerigi kanan atas), bukan lagi tampil penuh di
 * body halaman - body-nya cuma utk KERJA (lihat foto, pilih template, kirim
 * hasil Gemini). Panel kanan-bawah (hasil Gemini yg sudah diupload) itulah
 * yg dipakai Mode TV di layar Viewer (lihat viewer/[code]/page.jsx `tvPhotos`
 * - sudah otomatis prioritaskan hasil AI terbaru drpd foto kamera pertama).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Camera, Check, ImageOff, ImagePlus, Loader2, Minus, Monitor, Plus, Printer, QrCode, ScanLine, Search, Settings, Sparkles, Trash2, X, ZoomIn } from "lucide-react";
import { addRpvPrompt, createRpvSession, deleteRpvPrompt, deleteRpvSession, findRpvPhotoByQueue, getRpvSession, listRpvPhotos, listRpvPrompts, listRpvSessions, rpvPublicUrl, subscribeRpvPhotos, uploadRpvPromptImage } from "../../../lib/rpv";

const FONT = `"Google Sans","DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const VIO = "#7C3AED";
const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;
const ACTIVE_KEY = "rpv-active-session";

const t = {
  bg: "#0E0F10", card: "#1E1F20", cardHi: "#232427", line: "#3C3D40", lineSoft: "#2A2B2D",
  hi: "#E8E9EA", mid: "#B4B7BB", lo: "#8A8D91", fieldBg: "#131314",
};

// ── Fase 2: Print Station ───────────────────────────────────────────────
// Ukuran cetak umum photobooth (cm) - operator bisa juga isi custom manual.
const PRINT_PRESETS = [
  { key: "4r", label: "4R", w: 10, h: 15 },
  { key: "strip", label: "Photo Strip", w: 5, h: 15 },
  { key: "square", label: "Square", w: 10, h: 10 },
  { key: "postcard", label: "Postcard", w: 10, h: 14.8 },
  { key: "a4", label: "A4", w: 21, h: 29.7 },
  { key: "custom", label: "Custom", w: 0, h: 0 },
];

// Frame CSS-ONLY (border/caption teks) - SENGAJA tidak pakai gambar bingkai
// bikinan sendiri (cuma boleh pakai foto asli yg diupload tamu), jadi semua
// efek "frame" di sini murni border/warna/teks lewat CSS.
const FRAME_PRESETS = [
  { key: "none", label: "Tanpa Bingkai" },
  { key: "white", label: "Polaroid Putih" },
  { key: "brand", label: "Aksen 5G" },
];

const DEFAULT_CROP = { zoom: 1, panX: 0, panY: 0 };

/** Satu foto + crop (zoom/pan) + bingkai, dipakai UTUH baik di preview layar
 * (mode="screen", ukuran px tetap) MAUPUN di lembar cetak sungguhan (mode=
 * "print", ukuran FISIK dlm cm) - crop pakai transform scale+translate(%)
 * yg resolution-independent, jadi hasil preview & cetak DIJAMIN identik. */
function PhotoFrame({ photo, ratio, crop, frame, mode, queueLabel, sessionTitle, imgRef, onPointerDown }) {
  const isPolaroid = frame === "white";
  const isBrand = frame === "brand";
  const sizeStyle = mode === "print"
    ? { width: `${ratio.w}cm`, height: `${ratio.h}cm` }
    : { width: "100%", aspectRatio: `${ratio.w} / ${ratio.h}` };
  const photoAreaStyle = isPolaroid
    ? { position: "absolute", left: "4%", right: "4%", top: "4%", bottom: "16%" }
    : isBrand
      ? { position: "absolute", inset: "3%" }
      : { position: "absolute", inset: 0 };
  return (
    <div style={{
      ...sizeStyle, position: "relative", overflow: "hidden", backgroundColor: isPolaroid ? "#fff" : "#000",
      borderRadius: mode === "print" ? 0 : 10,
      border: isBrand ? `${mode === "print" ? "0.25cm" : "6px"} solid transparent` : "none",
      backgroundImage: isBrand ? `linear-gradient(#fff,#fff), linear-gradient(135deg,${RED},${MAGA})` : undefined,
      backgroundOrigin: isBrand ? "border-box" : undefined,
      backgroundClip: isBrand ? "content-box, border-box" : undefined,
    }}>
      <div style={{ ...photoAreaStyle, overflow: "hidden", background: "#000" }}>
        {photo ? (
          <img ref={imgRef} src={photo.url} alt="" draggable={false}
            onPointerDown={mode === "screen" ? onPointerDown : undefined}
            style={{
              width: "100%", height: "100%", objectFit: "cover", display: "block",
              cursor: mode === "screen" ? "grab" : "default", touchAction: "none",
              transform: `scale(${crop.zoom}) translate(${crop.panX}%, ${crop.panY}%)`,
              transformOrigin: "center center",
            }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: t.lo }}>
            <ImageOff size={mode === "print" ? 24 : 22} />
          </div>
        )}
      </div>
      {isPolaroid && (
        <div style={{ position: "absolute", left: "4%", right: "4%", bottom: "4%", height: "10%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
          <span style={{ fontSize: mode === "print" ? "0.32cm" : 10.5, fontWeight: 800, color: "#17181C" }}>{sessionTitle || "FlashPrint"}</span>
          <span style={{ fontSize: mode === "print" ? "0.26cm" : 9, color: "#8A8A96", fontFamily: "monospace", letterSpacing: "0.06em" }}>{queueLabel}</span>
        </div>
      )}
    </div>
  );
}

export default function RpvControlRoom() {
  const router = useRouter();
  const unsubRef = useRef(null);
  const dragRef = useRef(null); // { startX, startY, startPanX, startPanY, dragging } - crop pan
  const imgRef = useRef(null);

  const [sessions, setSessions] = useState([]);
  const [sessionsState, setSessionsState] = useState("loading"); // loading | ready
  // Mulai kosong di render pertama (server & client harus sama persis utk
  // menghindari hydration mismatch) - nilai tersimpan di localStorage baru
  // diisi lewat useEffect di bawah, SETELAH mount di client.
  const [activeCode, setActiveCode] = useState("");
  const [session, setSession] = useState(null); // sesi aktif penuh (id, title, code, photo_count)
  const [sessionState, setSessionState] = useState("idle"); // idle | loading | ready | notfound

  const [camPhotos, setCamPhotos] = useState([]); // foto ASLI kamera tamu
  const [aiPhotos, setAiPhotos] = useState([]); // hasil Gemini yg sudah diupload
  const [selectedCode, setSelectedCode] = useState(""); // photo_code yg dipilih di panel Print Station
  const [scanOpen, setScanOpen] = useState(false); // sheet scan QR (menggantikan kolom cari)
  const autoPrintCodeRef = useRef(""); // photo_code yg harus auto-print begitu selectedPhoto sinkron (ref, bukan state - efeknya cuma perlu BACA, bukan setState)

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("sesi"); // sesi | prompt

  // ── Muat daftar sesi (utk panel Settings) & tentukan sesi aktif ─────────
  const refreshSessions = useCallback(async () => {
    try {
      const rows = await listRpvSessions(50);
      setSessions(rows);
      setSessionsState("ready");
      return rows;
    } catch { setSessionsState("ready"); return []; }
  }, []);

  useEffect(() => {
    // Baru baca localStorage di sini (client-only, setelah mount) supaya
    // render pertama di server & client tetap identik.
    let saved = "";
    try { saved = localStorage.getItem(ACTIVE_KEY) || ""; } catch { /* ignore */ }
    (async () => {
      const rows = await refreshSessions();
      // Belum ada sesi aktif tersimpan (atau sesinya sudah dihapus) -
      // default ke sesi PALING BARU di daftar, bukan biarkan kosong.
      setActiveCode((cur) => {
        const want = cur || saved;
        if (want && rows.some((r) => r.code === want)) return want;
        return rows[0]?.code || "";
      });
    })();
  }, [refreshSessions]);

  useEffect(() => {
    if (activeCode) { try { localStorage.setItem(ACTIVE_KEY, activeCode); } catch { /* best-effort */ } }
  }, [activeCode]);

  // ── Muat sesi aktif penuh + foto2nya + realtime ─────────────────────────
  useEffect(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    (async () => {
      setSelectedCode("");
      setCamPhotos([]); setAiPhotos([]);
      if (!activeCode) { setSession(null); setSessionState("idle"); return; }
      setSessionState("loading");
      try {
        const s = await getRpvSession(activeCode);
        if (!s) { setSessionState("notfound"); return; }
        setSession(s);
        setSessionState("ready");
        const all = await listRpvPhotos(activeCode);
        const cam = all.filter((p) => !p.is_ai_result);
        setCamPhotos(cam);
        setAiPhotos(all.filter((p) => p.is_ai_result));
        // Default preview = foto PERTAMA di daftar (terbaru saat itu) - lalu
        // TIDAK dipindah otomatis lagi walau ada foto baru masuk realtime.
        if (cam.length > 0) setSelectedCode(cam[0].photo_code);
        unsubRef.current = subscribeRpvPhotos(s.id, (row) => {
          const photoCode = row.photo_code ?? row.code;
          const item = { photo_code: photoCode, storage_path: row.storage_path, uploaded_at: row.uploaded_at, is_ai_result: row.is_ai_result, url: rpvPublicUrl(row.storage_path) };
          if (row.is_ai_result) {
            setAiPhotos((prev) => (prev.some((p) => p.photo_code === photoCode) ? prev : [item, ...prev]));
          } else {
            setCamPhotos((prev) => (prev.some((p) => p.photo_code === photoCode) ? prev : [item, ...prev]));
            // Preview TIDAK ikut pindah ke foto baru - kecuali sebelumnya
            // memang belum ada foto sama sekali (kosong -> baru dpt 1).
            setSelectedCode((cur) => cur || photoCode);
          }
        }, { sessionCode: activeCode });
      } catch { setSessionState("notfound"); }
    })();
    return () => unsubRef.current?.();
  }, [activeCode]);


  // ── Panel kiri-bawah: template/prompt sesi aktif ────────────────────────
  // Sekarang klik 1 kartu template = LANGSUNG copy teks prompt-nya (tanpa
  // perlu "pilih dulu lalu tekan tombol copy" - status per-kartu dianimasikan
  // (lihat className "rpv-tpl-card"/"rpv-tpl-copied" di <style> global bawah
  // halaman). Gambarnya sendiri (foto tamu yg dipreview di kiri-atas) TIDAK
  // lagi lewat clipboard - dibuat draggable, tinggal diseret langsung ke tab
  // Gemini (lihat quadrant "Preview Foto Kamera").
  const [prompts, setPrompts] = useState([]);
  const [promptsState, setPromptsState] = useState("idle");

  const loadPrompts = useCallback(async (code) => {
    if (!code) { setPrompts([]); setPromptsState("idle"); return; }
    setPromptsState("loading");
    try {
      const items = await listRpvPrompts(code);
      setPrompts(items);
      setPromptsState("ready");
    } catch { setPromptsState("ready"); }
  }, []);

  useEffect(() => { (async () => { await loadPrompts(activeCode); })(); }, [activeCode, loadPrompts]);

  // ── Print Station: gabungan semua foto (kamera + hasil Gemini), terbaru
  // dulu - dipakai list kiri & pencarian by Photo ID (queue_label). ───────
  const allPhotos = useMemo(
    () => [...camPhotos, ...aiPhotos].sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)),
    [camPhotos, aiPhotos]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const filteredPhotos = useMemo(() => {
    const q = searchQuery.trim().replace(/^0+(?=\d)/, "").toLowerCase();
    if (!q) return allPhotos;
    return allPhotos.filter((p) => {
      const label = (p.queue_label || "").toLowerCase();
      const bare = label.replace(/^0+(?=\d)/, "");
      return label.includes(q) || bare.includes(q) || (p.photo_code || "").toLowerCase().includes(q);
    });
  }, [allPhotos, searchQuery]);
  const selectedPhoto = allPhotos.find((p) => p.photo_code === selectedCode) || null;

  // Cari foto by Photo ID (5 digit) persis - dipakai dr kolom pencarian
  // (Enter) MAUPUN dr sheet Scan QR (`RpvScanSheet` di bawah). `autoPrint`
  // dipakai scanner: begitu foto ketemu & tersinkron ke `selectedPhoto`,
  // langsung cetak tanpa perlu tombol/konfirmasi lagi - lihat efek
  // `autoPrintCode` di bawah (menunggu render foto beres dulu, supaya
  // window.print() TIDAK mencetak konten lama/basi).
  const selectByDigits = useCallback(async (rawDigits, { autoPrint = false } = {}) => {
    const digits = String(rawDigits || "").trim().replace(/\D/g, "");
    if (!digits || !activeCode) return false;
    const hit = allPhotos.find((p) => p.queue_label === digits.padStart(5, "0"));
    if (hit) {
      setSelectedCode(hit.photo_code);
      if (autoPrint) autoPrintCodeRef.current = hit.photo_code;
      return true;
    }
    try {
      const found = await findRpvPhotoByQueue(activeCode, Number(digits));
      if (found) {
        const item = { photo_code: found.photo_code, storage_path: found.storage_path, uploaded_at: found.uploaded_at, is_ai_result: true, url: found.url, queue_no: found.queue_no, queue_label: found.queue_label };
        setAiPhotos((prev) => (prev.some((x) => x.photo_code === item.photo_code) ? prev : [item, ...prev]));
        setSelectedCode(item.photo_code);
        if (autoPrint) autoPrintCodeRef.current = item.photo_code;
        return true;
      }
    } catch { /* tidak ketemu - diamkan, list tetap kefilter kosong */ }
    return false;
  }, [activeCode, allPhotos]);

  const searchExact = () => { selectByDigits(searchQuery); };

  // Begitu `selectedPhoto` sudah SINKRON dgn hasil scan (bukan foto lama),
  // baru trigger window.print() - kalau langsung print di dalam
  // selectByDigits, DOM preview/lembar cetak bisa masih menampilkan foto
  // sebelumnya (state React belum sempat re-render).
  useEffect(() => {
    if (autoPrintCodeRef.current && selectedPhoto?.photo_code === autoPrintCodeRef.current) {
      autoPrintCodeRef.current = "";
      window.print();
    }
  }, [selectedPhoto]);

  // ── Crop (zoom/pan) per foto - direset tiap ganti foto. Pola "adjusting
  // state during render" (dibandingkan langsung di body, BUKAN di dalam
  // useEffect) - direkomendasikan React resmi utk reset state akibat
  // perubahan input, tanpa memicu render tambahan yg tidak perlu.
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [prevCropKey, setPrevCropKey] = useState(selectedCode);
  if (selectedCode !== prevCropKey) {
    setPrevCropKey(selectedCode);
    setCrop(DEFAULT_CROP);
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
  const resetCrop = () => setCrop(DEFAULT_CROP);

  // ── Ukuran cetak & bingkai ────────────────────────────────────────────
  const [printSizeKey, setPrintSizeKey] = useState("4r");
  const [customW, setCustomW] = useState("10");
  const [customH, setCustomH] = useState("15");
  const [frameKey, setFrameKey] = useState("none");
  const printRatio = useMemo(() => {
    if (printSizeKey === "custom") {
      const w = Math.max(1, Math.min(60, Number(customW) || 10));
      const h = Math.max(1, Math.min(90, Number(customH) || 15));
      return { w, h };
    }
    const preset = PRINT_PRESETS.find((x) => x.key === printSizeKey) || PRINT_PRESETS[0];
    return { w: preset.w, h: preset.h };
  }, [printSizeKey, customW, customH]);

  const handlePrint = () => { if (selectedPhoto) window.print(); };

  const activeSummary = session ? `${session.title} · ${activeCode}` : "Belum ada sesi aktif";

  return (
    <div style={{ height: "100svh", background: t.bg, fontFamily: FONT, color: t.hi, display: "flex", flexDirection: "column", overflow: "hidden", colorScheme: "dark" }}>
      {/* Header tipis - responsif: di layar sempit (HP), label "Buka Viewer"
          disembunyikan (ikon-nya tetap ada) & ringkasan sesi menyusut biar
          tidak overflow/kepotong (lihat .rpv-header* di <style> global). */}
      <div className="rpv-header" style={{ flexShrink: 0, minHeight: 54, display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: t.card, borderBottom: `1px solid ${t.line}` }}>
        <button onClick={() => router.push("/martahub")} className="rpv-header-back" style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: t.mid, fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer", flexShrink: 0 }}>
          <ArrowLeft size={14} /> <span className="rpv-header-back-label">MartaHub</span>
        </button>
        <div className="rpv-header-divider" style={{ width: 1, height: 20, background: t.line, flexShrink: 0 }} />
        <button onClick={() => { setSettingsTab("sesi"); setSettingsOpen(true); }}
          style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT, padding: "5px 8px", borderRadius: 9, flex: "1 1 auto" }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", flexShrink: 0 }}>
            <Camera size={13} />
          </span>
          <span className="rpv-header-summary" style={{ fontSize: 12.5, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{activeSummary}</span>
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {activeCode && (
            <button onClick={() => window.open(`/marta/photobooth/viewer/${activeCode}`, "_blank")} title="Buka Viewer"
              style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              <Monitor size={13} /> <span className="rpv-header-viewer-label">Buka Viewer</span>
            </button>
          )}
          <button onClick={() => { setSettingsTab("sesi"); setSettingsOpen(true); }} title="Settings"
            style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* Belum ada sesi aktif sama sekali - arahkan ke Settings */}
      {!activeCode && sessionsState === "ready" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 20 }}>
          <Camera size={30} color={t.lo} />
          <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Belum ada sesi Photobooth</div>
          <div style={{ fontSize: 12, color: t.lo, textAlign: "center", maxWidth: 280 }}>Buat sesi baru lewat menu Settings di kanan atas utk mulai.</div>
          <button onClick={() => { setSettingsTab("sesi"); setSettingsOpen(true); }}
            style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 7, height: 42, padding: "0 18px", borderRadius: 11, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
            <Settings size={14} /> Buka Settings
          </button>
        </div>
      )}

      {/* Print Station: kiri daftar foto + cari Photo ID, kanan panel cetak */}
      {activeCode && (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }} className="rpv-ps-layout">
          {/* Kiri: daftar semua foto sesi + pencarian by Photo ID */}
          <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${t.line}`, background: t.card }} className="rpv-ps-left">
            <div style={{ padding: 12, borderBottom: `1px solid ${t.lineSoft}`, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  <Search size={14} color={t.lo} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") searchExact(); }}
                    placeholder="Cari Photo ID (5 digit)…" inputMode="numeric"
                    style={{ width: "100%", height: 38, borderRadius: 10, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontSize: 13, fontFamily: "monospace", letterSpacing: "0.04em", padding: "0 12px 0 32px" }} />
                </div>
                <button onClick={() => setScanOpen(true)} title="Scan QR - langsung cetak"
                  style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${VIO},${MAGA})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <QrCode size={16} />
                </button>
              </div>
              <div style={{ marginTop: 6, fontSize: 10.5, color: t.lo, fontWeight: 600 }}>{filteredPhotos.length} foto{searchQuery ? ` cocok dari ${allPhotos.length}` : ""}</div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 8 }}>
              {sessionState === "loading" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.lo, padding: "10px 6px" }}>
                  <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> Memuat foto…
                </div>
              )}
              {sessionState === "ready" && filteredPhotos.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "30px 0", color: t.lo }}>
                  <ImageOff size={20} />
                  <span style={{ fontSize: 11 }}>{searchQuery ? "Photo ID tidak ditemukan" : "Belum ada foto masuk"}</span>
                </div>
              )}
              {filteredPhotos.map((p) => {
                const active = p.photo_code === selectedCode;
                return (
                  <button key={p.photo_code} onClick={() => setSelectedCode(p.photo_code)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10, padding: 8, marginBottom: 6, borderRadius: 12,
                      border: `1.5px solid ${active ? MAGA : "transparent"}`, background: active ? `${MAGA}1c` : t.fieldBg, cursor: "pointer", fontFamily: FONT, textAlign: "left",
                    }}>
                    <div style={{ width: 42, height: 42, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: "#000" }}>
                      <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: t.hi, fontFamily: "monospace", letterSpacing: "0.04em" }}>{p.queue_label || "—"}</span>
                        {p.is_ai_result && (
                          <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 8, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg,${VIO},${MAGA})`, borderRadius: 999, padding: "1.5px 5px" }}>
                            <Sparkles size={7} /> AI
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: t.lo, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.photo_code}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kanan: panel printer - preview crop/zoom + bingkai + ukuran + cetak */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: t.bg }} className="rpv-ps-right">
            {!selectedPhoto ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: t.lo }}>
                <Printer size={26} />
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>Pilih foto di daftar kiri (atau scan/cari Photo ID) untuk mulai cetak</span>
              </div>
            ) : (
              <>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <Printer size={14} color={RED} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: t.hi }}>Cetak Foto</span>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: MAGA, fontWeight: 800, letterSpacing: "0.04em" }}>{selectedPhoto.queue_label}</span>
                  <button onClick={handlePrint}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FONT }}>
                    <Printer size={14} /> Cetak
                  </button>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
                  {/* Preview crop/zoom - drag utk geser, tombol/scroll utk zoom */}
                  <div style={{ width: "100%", maxWidth: 340 }}>
                    <div
                      onWheel={(e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 0.1 : -0.1); }}
                      style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.45)" }}>
                      <PhotoFrame photo={selectedPhoto} ratio={printRatio} crop={crop} frame={frameKey} mode="screen"
                        queueLabel={selectedPhoto.queue_label} sessionTitle={session?.title}
                        imgRef={imgRef} onPointerDown={onCropPointerDown} />
                    </div>
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <button onClick={() => zoomBy(-0.15)} title="Perkecil" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Minus size={13} /></button>
                      <span style={{ fontSize: 11, color: t.lo, fontWeight: 700, width: 40, textAlign: "center" }}>{Math.round(crop.zoom * 100)}%</span>
                      <button onClick={() => zoomBy(0.15)} title="Perbesar" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><ZoomIn size={13} /></button>
                      <button onClick={resetCrop} title="Reset posisi/zoom" style={{ marginLeft: 6, fontSize: 10.5, color: t.lo, fontWeight: 700, background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}>Reset</button>
                    </div>
                    <div style={{ marginTop: 2, textAlign: "center", fontSize: 10, color: t.lo }}>Geser gambar utk atur posisi · scroll/tombol utk zoom</div>
                  </div>

                  {/* Ukuran cetak */}
                  <div style={{ width: "100%", maxWidth: 340 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, marginBottom: 8 }}>UKURAN CETAK</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {PRINT_PRESETS.map((preset) => (
                        <button key={preset.key} onClick={() => setPrintSizeKey(preset.key)}
                          style={{
                            padding: "7px 11px", borderRadius: 9, border: `1.5px solid ${printSizeKey === preset.key ? MAGA : t.line}`,
                            background: printSizeKey === preset.key ? `${MAGA}22` : t.card, color: printSizeKey === preset.key ? "#fff" : t.mid,
                            fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          }}>
                          {preset.label}{preset.key !== "custom" ? ` · ${preset.w}×${preset.h}cm` : ""}
                        </button>
                      ))}
                    </div>
                    {printSizeKey === "custom" && (
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="number" min="1" max="60" value={customW} onChange={(e) => setCustomW(e.target.value)}
                          style={{ width: 64, height: 34, borderRadius: 8, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontSize: 12, textAlign: "center" }} />
                        <span style={{ fontSize: 11, color: t.lo }}>cm ×</span>
                        <input type="number" min="1" max="90" value={customH} onChange={(e) => setCustomH(e.target.value)}
                          style={{ width: 64, height: 34, borderRadius: 8, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontSize: 12, textAlign: "center" }} />
                        <span style={{ fontSize: 11, color: t.lo }}>cm</span>
                      </div>
                    )}
                  </div>

                  {/* Bingkai */}
                  <div style={{ width: "100%", maxWidth: 340 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, marginBottom: 8 }}>BINGKAI</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {FRAME_PRESETS.map((f) => (
                        <button key={f.key} onClick={() => setFrameKey(f.key)}
                          style={{
                            flex: 1, padding: "9px 8px", borderRadius: 9, border: `1.5px solid ${frameKey === f.key ? MAGA : t.line}`,
                            background: frameKey === f.key ? `${MAGA}22` : t.card, color: frameKey === f.key ? "#fff" : t.mid,
                            fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          }}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lembar cetak sungguhan - TERSEMBUNYI di layar, HANYA muncul saat
          window.print() (lihat .rpv-print-sheet-wrap di <style> bawah).
          @page diatur dinamis persis ukuran cetak yg dipilih operator. */}
      {selectedPhoto && (
        <div className="rpv-print-sheet-wrap">
          <PhotoFrame photo={selectedPhoto} ratio={printRatio} crop={crop} frame={frameKey} mode="print"
            queueLabel={selectedPhoto.queue_label} sessionTitle={session?.title} />
        </div>
      )}
      <style>{`@page { size: ${printRatio.w}cm ${printRatio.h}cm; margin: 0; }`}</style>

      {scanOpen && (
        <RpvScanSheet
          onClose={() => setScanOpen(false)}
          onDetect={(digits) => { setScanOpen(false); selectByDigits(digits, { autoPrint: true }); }}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          tab={settingsTab} setTab={setSettingsTab}
          sessions={sessions} sessionsState={sessionsState}
          activeCode={activeCode} setActiveCode={setActiveCode}
          refreshSessions={refreshSessions}
          prompts={prompts} promptsState={promptsState}
          onPromptsChanged={(items) => setPrompts(items)}
        />
      )}

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        :root{color-scheme: dark;}

        /* Lembar cetak sungguhan - disembunyikan total di layar biasa,
           HANYA dirender saat print (window.print()) lewat @media print
           di bawah - operator TIDAK PERNAH melihatnya kecuali di dialog
           print/hasil cetak fisik. */
        .rpv-print-sheet-wrap { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .rpv-print-sheet-wrap, .rpv-print-sheet-wrap * { visibility: visible !important; }
          .rpv-print-sheet-wrap { display: block !important; position: fixed; inset: 0; margin: 0; padding: 0; }
        }

        /* ── Mobile (HP) - responsif ──────────────────────────────────── */
        @media (max-width: 860px) {
          .rpv-ps-layout { flex-direction: column; overflow-y: auto; }
          .rpv-ps-left { width: 100% !important; max-height: 40vh; }
          .rpv-header { padding: 8px 10px !important; gap: 6px !important; }
          .rpv-header-back-label { display: none; }
          .rpv-header-divider { display: none; }
          .rpv-header-summary { max-width: 40vw !important; font-size: 11.5px !important; }
          .rpv-header-viewer-label { display: none; }
          input, textarea, select { font-size: 16px !important; }
        }
        @media (max-width: 480px) {
          .rpv-header-summary { max-width: 32vw !important; }
        }
      `}</style>
    </div>
  );
}

/** Panel Settings (drawer kanan) - 2 tab: "Sesi" (daftar/buat/pilih aktif/
 * hapus) & "Prompt" (kelola template prompt milik sesi AKTIF). Menggantikan
 * body halaman lama yg langsung menampilkan form+list di layar utama -
 * sekarang disembunyikan di sini supaya layar utama fokus kerja. */
function SettingsPanel({ onClose, tab, setTab, sessions, sessionsState, activeCode, setActiveCode, refreshSessions, prompts, promptsState, onPromptsChanged }) {
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const s = await createRpvSession(title);
      if (!s?.code) throw new Error("Gagal membuat sesi photobooth.");
      setTitle("");
      await refreshSessions();
      setActiveCode(s.code);
    } catch (e) {
      alert(e.message || "Gagal membuat sesi photobooth.");
    } finally { setCreating(false); }
  };

  const handleDeleted = async (code) => {
    setDeleteTarget(null);
    await refreshSessions();
    if (activeCode === code) setActiveCode("");
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 420, height: "100%", background: t.card, borderLeft: `1px solid ${t.line}`, display: "flex", flexDirection: "column", fontFamily: FONT }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Settings size={16} color={t.hi} />
          <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Settings</div>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "transparent", color: t.lo, cursor: "pointer", padding: 4 }}><X size={17} /></button>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "10px 16px 0", flexShrink: 0 }}>
          <button onClick={() => setTab("sesi")} style={{ flex: 1, height: 34, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 800, background: tab === "sesi" ? `linear-gradient(135deg,${RED},${MAGA})` : t.fieldBg, color: tab === "sesi" ? "#fff" : t.mid }}>Sesi</button>
          <button onClick={() => setTab("prompt")} style={{ flex: 1, height: 34, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 800, background: tab === "prompt" ? `linear-gradient(135deg,${RED},${MAGA})` : t.fieldBg, color: tab === "prompt" ? "#fff" : t.mid }}>Prompt</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          {tab === "sesi" && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Buat Sesi Baru</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} placeholder="Nama sesi (mis. Grand Launching 5G Medan)"
                style={{ width: "100%", height: 42, borderRadius: 10, border: `1px solid ${t.line}`, background: t.fieldBg, padding: "0 12px", fontSize: 13, fontFamily: FONT, color: t.hi, boxSizing: "border-box" }} />
              <button onClick={handleCreate} disabled={creating}
                style={{ marginTop: 10, width: "100%", height: 42, borderRadius: 11, border: "none", cursor: creating ? "not-allowed" : "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: `linear-gradient(135deg,${RED},${MAGA})`, opacity: creating ? 0.7 : 1 }}>
                {creating ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <Plus size={14} />} Buat &amp; Jadikan Aktif
              </button>

              <div style={{ marginTop: 20, fontSize: 11.5, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                Semua Sesi {sessionsState === "loading" && <Loader2 size={11} style={{ animation: "spin .8s linear infinite" }} />}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sessions.map((s) => (
                  <div key={s.code} style={{ borderRadius: 12, border: `1.5px solid ${s.code === activeCode ? RED : t.lineSoft}`, background: s.code === activeCode ? "rgba(237,28,36,0.08)" : t.fieldBg, padding: "10px 11px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                        <div style={{ fontSize: 10, color: t.lo, marginTop: 2, fontFamily: "monospace" }}>{s.code} · {s.photo_count ?? 0} foto</div>
                      </div>
                      {s.code === activeCode && <span style={{ fontSize: 9.5, fontWeight: 800, color: RED, flexShrink: 0 }}>AKTIF</span>}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      {s.code !== activeCode && (
                        <button onClick={() => setActiveCode(s.code)} style={{ flex: 1, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Jadikan Aktif</button>
                      )}
                      <button onClick={() => setDeleteTarget(s)} title="Hapus sesi" style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid rgba(198,40,40,0.4)", background: "rgba(198,40,40,0.14)", color: "#FF8A8F", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 5 }}>
                        <Trash2 size={11} /> Hapus
                      </button>
                    </div>
                  </div>
                ))}
                {sessionsState === "ready" && sessions.length === 0 && (
                  <div style={{ fontSize: 12, color: t.lo, textAlign: "center", padding: "16px 0" }}>Belum ada sesi dibuat.</div>
                )}
              </div>
            </>
          )}

          {tab === "prompt" && (
            activeCode ? (
              <PromptsManager code={activeCode} items={prompts} state={promptsState} onChanged={onPromptsChanged} />
            ) : (
              <div style={{ fontSize: 12, color: t.lo, textAlign: "center", padding: "24px 0" }}>Pilih/buat sesi dulu di tab &ldquo;Sesi&rdquo;.</div>
            )
          )}
        </div>
      </div>

      {deleteTarget && (
        <DeleteSessionModal session={deleteTarget} onCancel={() => setDeleteTarget(null)} onDeleted={() => handleDeleted(deleteTarget.code)} />
      )}
    </div>
  );
}

/** Kelola prompt (list + tambah + hapus) utk sesi aktif - dipindah dr
 * PromptsPanel lama, sekarang tinggal di tab "Prompt" Settings. */
function PromptsManager({ code, items, state, onChanged }) {
  const imgRef = useRef(null);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleAdd = async () => {
    if (adding || (!text.trim() && !file)) return;
    setAdding(true);
    try {
      let imagePath = null;
      if (file) imagePath = await uploadRpvPromptImage(code, file);
      const row = await addRpvPrompt(code, label || `Template ${items.length + 1}`, text, imagePath);
      if (row) onChanged([...items, row]);
      setLabel(""); setText(""); setFile(null); setPreview("");
    } catch (e) {
      alert(e.message || "Gagal menambah prompt.");
    } finally { setAdding(false); }
  };

  const handleDelete = async (promptId) => {
    if (deletingId) return;
    setDeletingId(promptId);
    try {
      await deleteRpvPrompt(code, promptId);
      onChanged(items.filter((p) => p.id !== promptId));
    } catch { alert("Gagal menghapus prompt."); }
    finally { setDeletingId(""); }
  };

  return (
    <>
      {state === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.lo, padding: "6px 0" }}>
          <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> Memuat…
        </div>
      )}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {items.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: t.fieldBg, border: `1px solid ${t.lineSoft}`, borderRadius: 11, padding: "9px 10px" }}>
              {p.promptImageUrl && <img src={p.promptImageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: t.hi }}>{p.label}</div>
                {p.prompt_text && <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2, lineHeight: 1.4 }}>{p.prompt_text}</div>}
              </div>
              <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} title="Hapus prompt"
                style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.line}`, background: "transparent", color: "#FF8A8F", display: "flex", alignItems: "center", justifyContent: "center", cursor: deletingId === p.id ? "not-allowed" : "pointer", flexShrink: 0 }}>
                {deletingId === p.id ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={12} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Tambah Template</div>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (mis. Gaya Neon)"
        style={{ width: "100%", height: 36, borderRadius: 9, border: `1px solid ${t.line}`, background: t.fieldBg, padding: "0 11px", fontSize: 12.5, fontFamily: FONT, color: t.hi, boxSizing: "border-box" }} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Isi prompt Gemini..."
        style={{ width: "100%", marginTop: 6, borderRadius: 9, border: `1px solid ${t.line}`, background: t.fieldBg, padding: "8px 11px", fontSize: 12.5, fontFamily: FONT, color: t.hi, boxSizing: "border-box", resize: "vertical" }} />
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input ref={imgRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: "none" }} />
        <button onClick={() => imgRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
          <ImagePlus size={12} /> {file ? "Ganti Gambar" : "Gambar Referensi"}
        </button>
        {preview && <img src={preview} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />}
        <button onClick={handleAdd} disabled={adding || (!text.trim() && !file)}
          style={{ marginLeft: "auto", height: 30, padding: "0 12px", borderRadius: 8, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontWeight: 800, fontSize: 11.5, cursor: adding ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5, opacity: adding || (!text.trim() && !file) ? 0.6 : 1 }}>
          {adding ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <Plus size={12} />} Tambah
        </button>
      </div>
    </>
  );
}

/** Modal konfirmasi hapus sesi - tetap DIKUNCI KETAT: tombol Hapus baru
 * aktif kalau operator mengetik ULANG kata "HAPUS" persis (case-sensitive). */
function DeleteSessionModal({ session, onCancel, onDeleted }) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const canDelete = confirmText.trim() === "HAPUS";

  const handleConfirm = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true); setError("");
    try {
      await deleteRpvSession(session.code);
      onDeleted();
    } catch {
      setError("Gagal menghapus sesi. Coba lagi.");
      setDeleting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: t.card, border: `1px solid ${t.line}`, borderRadius: 20, padding: 20, fontFamily: FONT, boxShadow: "0 30px 70px rgba(0,0,0,0.55)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(198,40,40,0.18)", color: "#FF8A8F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={18} />
            </span>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: t.hi }}>Hapus Sesi?</div>
          </div>
          <button onClick={onCancel} style={{ border: "none", background: "transparent", color: t.lo, cursor: "pointer", padding: 4 }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12.5, color: t.mid, lineHeight: 1.55 }}>
          Sesi <b style={{ color: t.hi }}>&ldquo;{session.title}&rdquo;</b> ({session.code}) beserta <b>semua foto &amp; prompt di dalamnya</b> akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
        </div>

        <div style={{ marginTop: 14, fontSize: 11.5, fontWeight: 700, color: t.hi }}>
          Ketik <span style={{ fontFamily: "monospace", color: "#FF8A8F", letterSpacing: "0.06em" }}>HAPUS</span> untuk konfirmasi:
        </div>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          placeholder="HAPUS" autoFocus
          style={{ marginTop: 6, width: "100%", height: 42, borderRadius: 10, border: `1.5px solid ${canDelete ? "#C62828" : t.line}`, background: t.fieldBg, padding: "0 12px", fontSize: 14, fontFamily: "monospace", letterSpacing: "0.08em", color: t.hi, boxSizing: "border-box" }} />
        {error && <div style={{ marginTop: 8, fontSize: 11.5, color: "#FF8A8F", fontWeight: 600 }}>{error}</div>}

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 42, borderRadius: 11, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
            Batal
          </button>
          <button onClick={handleConfirm} disabled={!canDelete || deleting}
            style={{ flex: 1, height: 42, borderRadius: 11, border: "none", background: "#C62828", color: "#fff", fontWeight: 800, fontSize: 13, cursor: canDelete && !deleting ? "pointer" : "not-allowed", opacity: canDelete && !deleting ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: FONT }}>
            {deleting ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={14} />} Hapus Sesi
          </button>
        </div>
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}


/** Sheet "Scan QR" - MENGGANTIKAN kolom pencarian manual (bukan pelengkap):
 * arahkan kamera ke QR yg muncul di layar sukses-upload tamu (lihat
 * `upload/[code]/prompt/page.jsx` > GeminiUploadSuccessScreen, QR-nya
 * berisi teks polos 5 digit Photo ID) → begitu 5 digit VALID terbaca,
 * LANGSUNG panggil onDetect (tanpa tombol konfirmasi apa pun, sesuai
 * permintaan: "scan ... maka dia akan memproses langsung mempront") →
 * pemanggil (`RpvControlRoom`) yg urus pilih foto + auto-print.
 *
 * Diadaptasi dari pola `app/martahub/m/_shared/QrScanSheet.jsx` (decoder
 * jsQR murni JS via CDN, jalan di semua browser ber-kamera - BUKAN
 * BarcodeDetector native yg cuma didukung sebagian browser). Loader
 * `loadJsQR()` sengaja DIDUPLIKASI lokal (bukan diimpor dari file
 * MartaHub itu, yg khusus fitur lain) - dgn id script tag berbeda supaya
 * tidak bentrok kalau kedua fitur kebetulan dipakai di tab yg sama. */
function loadJsQR() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.jsQR) return resolve(window.jsQR);
    const existing = document.getElementById("rpv-jsqr-cdn");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.jsQR));
      existing.addEventListener("error", () => reject(new Error("load fail")));
      return;
    }
    const scr = document.createElement("script");
    scr.id = "rpv-jsqr-cdn";
    scr.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    scr.async = true;
    scr.onload = () => resolve(window.jsQR);
    scr.onerror = () => reject(new Error("load fail"));
    document.head.appendChild(scr);
  });
}

function RpvScanSheet({ onClose, onDetect }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const firedRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [detected, setDetected] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualVal, setManualVal] = useState("");
  const [camErr, setCamErr] = useState("");

  const stop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; });

  useEffect(() => {
    let alive = true;
    firedRef.current = false;

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCamErr("Kamera tidak tersedia di perangkat ini. Gunakan input manual.");
        setManual(true);
        return;
      }
      let jsQR;
      try {
        jsQR = await loadJsQR();
      } catch {
        if (!alive) return;
        setCamErr("Gagal memuat pemindai QR. Gunakan input manual.");
        setManual(true);
        return;
      }
      if (!alive) return;
      try {
        const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!alive) { st.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = st;
        const v = videoRef.current;
        if (v) { v.setAttribute("playsinline", "true"); v.srcObject = st; await v.play().catch(() => {}); }
        setScanning(true);

        const canvas = canvasRef.current || document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let last = 0, lastSeen = 0;

        const tick = (ts) => {
          if (!alive) return;
          const vid = videoRef.current, box = boxRef.current;
          if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && ts - last > 80) {
            last = ts;
            const vw = vid.videoWidth, vh = vid.videoHeight;
            const scale = Math.min(1, 560 / Math.max(vw, vh));
            const w = Math.round(vw * scale), h = Math.round(vh * scale);
            canvas.width = w; canvas.height = h;
            ctx.drawImage(vid, 0, 0, w, h);
            let img;
            try { img = ctx.getImageData(0, 0, w, h); } catch { img = null; }
            const code = img ? jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" }) : null;

            if (box) {
              if (box.width !== vw) { box.width = vw; box.height = vh; }
              const bx = box.getContext("2d");
              bx.clearRect(0, 0, vw, vh);
              if (code && code.location) {
                const fx = vw / w, fy = vh / h, L = code.location;
                const c = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => ({ x: p.x * fx, y: p.y * fy }));
                bx.lineWidth = Math.max(3, vw * 0.008); bx.lineCap = "round"; bx.lineJoin = "round";
                bx.strokeStyle = "#FFD400";
                const frac = 0.3;
                for (let i = 0; i < 4; i++) {
                  const p = c[i], a = c[(i + 3) % 4], b = c[(i + 1) % 4];
                  const pa = { x: p.x + (a.x - p.x) * frac, y: p.y + (a.y - p.y) * frac };
                  const pb = { x: p.x + (b.x - p.x) * frac, y: p.y + (b.y - p.y) * frac };
                  bx.beginPath(); bx.moveTo(pa.x, pa.y); bx.lineTo(p.x, p.y); bx.lineTo(pb.x, pb.y); bx.stroke();
                }
              }
            }

            if (code && code.data) {
              const digits = String(code.data).trim().replace(/\D/g, "");
              if (digits.length === 5) {
                lastSeen = ts; setDetected(true);
                if (!firedRef.current) {
                  firedRef.current = true;
                  stop();
                  onDetectRef.current(digits);
                  return;
                }
              }
            } else if (ts - lastSeen > 500) {
              setDetected(false);
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!alive) return;
        setCamErr("Kamera tidak dapat diakses. Izinkan akses kamera atau gunakan input manual.");
        setManual(true);
      }
    })();

    return () => { alive = false; stop(); };
  }, [stop]);

  const close = () => { stop(); onClose(); };
  const manualDigits = manualVal.trim().replace(/\D/g, "");
  const manualOk = manualDigits.length === 5;
  const confirmManual = () => {
    if (!manualOk) return;
    stop();
    onDetect(manualDigits);
  };

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(10,10,12,0.92)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: t.card, borderRadius: "24px 24px 0 0", padding: "10px 18px calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.18)", margin: "6px auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.hi, display: "flex", alignItems: "center", gap: 8 }}>
            <QrCode size={16} /> Scan QR Photo ID
          </div>
          <button onClick={close} style={{ width: 30, height: 30, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.08)", color: t.hi, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        <canvas ref={canvasRef} style={{ display: "none" }} />

        {!manual && (
          <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", borderRadius: 18, overflow: "hidden", background: "#000" }}>
            <video ref={videoRef} playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <canvas ref={boxRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            {!detected && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ width: "64%", aspectRatio: "1/1", borderRadius: 20, border: "2.5px dashed rgba(255,255,255,0.7)" }} />
              </div>
            )}
            <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
              {!scanning
                ? <><Loader2 size={14} style={{ animation: "spin .85s linear infinite" }} /> Menyalakan kamera…</>
                : detected
                  ? <span style={{ color: "#4ADE80" }}>✓ QR terdeteksi, memproses…</span>
                  : <><ScanLine size={14} /> Arahkan ke QR di layar tamu</>}
            </div>
          </div>
        )}

        {camErr && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderRadius: 12, background: "rgba(220,38,38,0.14)", border: "1px solid rgba(220,38,38,0.3)" }}>
            <AlertTriangle size={16} color="#F87171" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600, lineHeight: 1.5 }}>{camErr}</div>
          </div>
        )}

        {manual ? (
          <form onSubmit={(e) => { e.preventDefault(); confirmManual(); }} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: t.lo }}>Photo ID (5 digit)</label>
              <input value={manualVal} onChange={(e) => setManualVal(e.target.value)} inputMode="numeric" enterKeyHint="done" placeholder="00042" autoFocus
                style={{ width: "100%", height: 50, borderRadius: 13, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontFamily: "monospace", fontSize: 18, fontWeight: 800, letterSpacing: "0.1em", padding: "0 14px", outline: "none", marginTop: 6, boxSizing: "border-box" }} />
            </div>
            <button type="submit" disabled={!manualOk}
              style={{ height: 50, borderRadius: 13, border: "none", background: manualOk ? `linear-gradient(135deg,${VIO},${MAGA})` : "rgba(255,255,255,0.1)", color: manualOk ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: FONT, fontSize: 14.5, fontWeight: 800, cursor: manualOk ? "pointer" : "not-allowed" }}>
              Cari &amp; Cetak
            </button>
            {!camErr && (
              <button type="button" onClick={() => setManual(false)}
                style={{ height: 44, borderRadius: 12, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontFamily: FONT, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
                <QrCode size={14} /> Coba scan kamera lagi
              </button>
            )}
          </form>
        ) : !camErr && (
          <button onClick={() => setManual(true)}
            style={{ marginTop: 14, height: 44, width: "100%", borderRadius: 12, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontFamily: FONT, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
            Ketik Photo ID manual
          </button>
        )}
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
