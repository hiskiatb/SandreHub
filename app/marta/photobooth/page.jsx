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
import { AlertTriangle, ArrowLeft, Bold, Camera, Check, Copy, FlipHorizontal2, FlipVertical2, FolderOpen, ImageOff, ImagePlus, Layers, Loader2, Minus, Monitor, Plus, Printer, Radio, RotateCw, Save, Search, Settings, Sparkles, Star, Trash2, Type, X, ZoomIn } from "lucide-react";
import ScanQrGlyph from "./_scan-glyph";
import { addRpvPrompt, clearRpvDefaultFrameTemplate, createRpvSession, deleteRpvCustomFont, deleteRpvFrameTemplate, deleteRpvPhoto, deleteRpvPrompt, deleteRpvSession, findRpvPhotoByQueue, getRpvSession, listRpvCustomFonts, listRpvFrameTemplates, listRpvPhotos, listRpvPrompts, listRpvSessions, rpvPublicUrl, saveRpvFrameTemplate, setRpvDefaultFrameTemplate, subscribeRpvOperatorPairing, subscribeRpvPhotos, uploadRpvCustomFont, uploadRpvPromptImage, uploadRpvTemplateImage } from "../../../lib/rpv";

const FONT = `"Google Sans","DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const VIO = "#7C3AED";
const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;
const ACTIVE_KEY = "rpv-active-session";
const OPERATOR_ID_KEY = "rpv-operator-id";

// Jam upload singkat (HH:mm) - kalau bukan hari ini, tambahkan tanggal
// singkat juga, biar tetap jelas dr sesi yg sudah jalan >1 hari.
function formatPhotoTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return time;
    const date = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    return `${date} ${time}`;
  } catch { return ""; }
}

const t = {
  bg: "#0E0F10", card: "#1E1F20", cardHi: "#232427", line: "#3C3D40", lineSoft: "#2A2B2D",
  hi: "#E8E9EA", mid: "#B4B7BB", lo: "#8A8D91", fieldBg: "#131314",
};

// ── Fase 2: Print Station ───────────────────────────────────────────────
// Ukuran cetak DIKUNCI ke 2R (6×9cm) - permintaan operator: semua sesi
// cetak pakai ukuran ini saja, jadi tidak ada lagi pilihan ukuran di UI.
const PRINT_SIZE = { label: "2R", w: 6, h: 9 };

// Frame CSS-ONLY (border/caption teks) - SENGAJA tidak pakai gambar bingkai
// bikinan sendiri (cuma boleh pakai foto asli yg diupload tamu), jadi semua
// efek "frame" di sini murni border/warna/teks lewat CSS. "custom" (dulu
// "Aksen 5G" - permintaan: "jangan buat aksen 5g namun custom saja") =
// operator susun sendiri kotak teks (bold/tidak, ukuran, font bebas) & taruh
// gambar apa saja di mana saja, lalu simpan sbg TEMPLATE di database (lihat
// TemplateEditorModal & marta_hub/rpv_frame_templates_schema.sql) supaya
// bisa dipakai lagi kapan saja dari device manapun.
// Cuma NAMA/ID template terakhir dipakai yg diingat di localStorage (bukan
// isi templatenya - isi selalu dari DATABASE) - supaya begitu operator pilih
// Bingkai "Custom" lagi (device sama, reload halaman, atau foto/sesi baru),
// template yg terakhir dipakai otomatis kepasang lagi tanpa harus buka
// Editor Template & klik ulang tiap kali.
const LAST_TEMPLATE_ID_KEY = "rpv_last_frame_template_id";
const FRAME_PRESETS = [
  { key: "none", label: "Tanpa Bingkai" },
  { key: "white", label: "Polaroid Putih" },
  { key: "custom", label: "Custom" },
];

// Pilihan font utk kotak teks template custom - dimuat lewat Google Fonts
// (lihat <link> TEMPLATE_GOOGLE_FONTS_HREF di render utama) supaya benar2
// tampil sesuai nama font-nya baik di layar MAUPUN saat dicetak (window.
// print ikut memakai stylesheet yg sama).
const TEMPLATE_FONTS = [
  { key: "dm-sans", label: "DM Sans", css: `"DM Sans", sans-serif` },
  { key: "poppins", label: "Poppins", css: `"Poppins", sans-serif` },
  { key: "playfair", label: "Playfair Display", css: `"Playfair Display", serif` },
  { key: "oswald", label: "Oswald", css: `"Oswald", sans-serif` },
  { key: "caveat", label: "Caveat", css: `"Caveat", cursive` },
  { key: "roboto-mono", label: "Roboto Mono", css: `"Roboto Mono", monospace` },
];
const TEMPLATE_FONT_MAP = Object.fromEntries(TEMPLATE_FONTS.map((f) => [f.key, f]));
const TEMPLATE_GOOGLE_FONTS_HREF = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&family=Poppins:wght@400;700&family=Playfair+Display:wght@400;700&family=Oswald:wght@400;700&family=Caveat:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap";

/** fontKey elemen teks bisa berupa key bawaan ("dm-sans" dkk, lihat
 * TEMPLATE_FONT_MAP) ATAU "custom:<id>" utk font upload sendiri operator
 * (lihat rpv_custom_fonts) - resolver ini yg nentuin nama CSS font-family
 * final dipakai <span> teks di PhotoFrame, cocok dgn @font-face yg
 * diinject dari daftar customFonts (lihat customFontFaceCss di bawah). */
function resolveTemplateFontCss(fontKey, customFonts) {
  if (fontKey && fontKey.startsWith("custom:")) {
    const id = fontKey.slice(7);
    const found = (customFonts || []).find((f) => f.id === id);
    return found ? `"rpv-cf-${id}", sans-serif` : FONT;
  }
  return TEMPLATE_FONT_MAP[fontKey]?.css || FONT;
}
/** @font-face utk semua font custom tersimpan - dibuat sekali dari daftar
 * `customFonts`, format ditebak dari ekstensi file yg diupload. */
function customFontFaceCss(customFonts) {
  return (customFonts || []).map((f) => {
    const ext = (f.storagePath || "").split(".").pop()?.toLowerCase();
    const fmt = ext === "otf" ? "opentype" : ext === "woff" ? "woff" : ext === "woff2" ? "woff2" : "truetype";
    return `@font-face { font-family: "rpv-cf-${f.id}"; src: url("${f.url}") format("${fmt}"); font-display: swap; }`;
  }).join("\n");
}

/** Elemen kosong baru utk template custom - posisi/ukuran dlm PERSEN thd
 * bingkai (bukan px/cm) supaya resolution-independent: posisi identik baik
 * dipreview di layar (ukuran px berubah2 sesuai lebar panel) MAUPUN dicetak
 * fisik (ukuran cm tetap) MAUPUN dimuat ulang dari template tersimpan -
 * TIDAK ADA transformasi/normalisasi apa pun saat simpan/muat, jadi elemen
 * dijamin TIDAK bergeser sedikit pun dari posisi yg diatur operator. */
function newTemplateTextElement() {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "text", xPct: 14, yPct: 40, wPct: 72, hPct: 20,
    text: "Teks Baru", fontKey: "dm-sans", fontSizePct: 7, bold: false, color: "#FFFFFF", align: "center",
  };
}
function newTemplateImageElement(url) {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "image", xPct: 30, yPct: 30, wPct: 40, hPct: 40, url,
  };
}
const clampPct = (v, min, max) => Math.round(Math.max(min, Math.min(max, v)) * 100) / 100;

const DEFAULT_CROP = { zoom: 1, panX: 0, panY: 0, rotate: 0, flipX: false, flipY: false };
// Rotasi yg biasa dibutuhkan case cetak (foto kepotret miring/landscape ke
// potret dst) - dibatasi ke kelipatan 90° saja (bkn rotasi bebas) supaya
// hasil cetak TETAP presisi ngepas bingkai ukuran cetak, tapi operator
// tetap bisa lihat derajat persisnya di label tombol.
const ROTATE_STEP = 90;

/** Satu foto + crop (zoom/pan) + bingkai, dipakai UTUH baik di preview layar
 * (mode="screen", ukuran px tetap) MAUPUN di lembar cetak sungguhan (mode=
 * "print", ukuran FISIK dlm cm) - crop pakai transform scale+translate(%)
 * yg resolution-independent, jadi hasil preview & cetak DIJAMIN identik. */
function PhotoFrame({ photo, ratio, crop, frame, mode, queueLabel, sessionTitle, imgRef, onPointerDown, customElements, customBaseStyle, customFonts, onElementPointerDown, selectedElId, wrapperRef }) {
  const isPolaroid = frame === "white";
  const isCustom = frame === "custom";
  // "Custom" bisa pakai bentuk dasar "polaroid" (foto diberi margin putih +
  // strip putih bawah, spt "Polaroid Putih") supaya operator bisa taruh
  // elemen (teks/gambar) di area putihnya juga - atau "none" (foto penuh).
  const isPolaroidShape = isPolaroid || (isCustom && customBaseStyle === "polaroid");
  const sizeStyle = mode === "print"
    ? { width: `${ratio.w}cm`, height: `${ratio.h}cm` }
    : { width: "100%", aspectRatio: `${ratio.w} / ${ratio.h}` };
  const photoAreaStyle = isPolaroidShape
    ? { position: "absolute", left: "4%", right: "4%", top: "4%", bottom: "16%" }
    : { position: "absolute", inset: 0 };
  const interactive = typeof onElementPointerDown === "function";
  // Token dinamis dlm kotak teks custom - "{Nama Event}"/"{Photo ID}" diganti
  // isi sungguhan sesi/foto aktif, SAAT RENDER SAJA (bukan disimpan sbg teks
  // statis) - jadi 1 template bisa dipakai berulang, teksnya otomatis ikut
  // sesi manapun yg lagi aktif. Fallback tampil kalau belum ada sesi/foto
  // (spt di editor) supaya operator tetap lihat di mana token itu muncul.
  const resolveTemplateText = (text) => String(text || "")
    .replaceAll("{Nama Event}", sessionTitle || "Nama Event")
    .replaceAll("{Photo ID}", queueLabel || "00000");
  return (
    <div ref={wrapperRef} style={{
      ...sizeStyle, position: "relative", overflow: "hidden", backgroundColor: isPolaroidShape ? "#fff" : "#000",
      borderRadius: mode === "print" ? 0 : 10,
      // containerType:"size" - dasar unit `cqh` dipakai ukuran font elemen
      // teks custom di bawah, supaya font-size SELALU proporsional thd
      // TINGGI bingkai sungguhan (bukan thd font induk spt unit % biasa),
      // baik saat preview layar (lebar berubah2) maupun saat dicetak.
      containerType: "size",
    }}>
      <div style={{ ...photoAreaStyle, overflow: "hidden", background: "#000" }}>
        {photo ? (
          <img ref={imgRef} src={photo.url} alt="" draggable={false}
            onPointerDown={mode === "screen" ? onPointerDown : undefined}
            style={{
              width: "100%", height: "100%", objectFit: "cover", display: "block",
              cursor: mode === "screen" ? "grab" : "default", touchAction: "none",
              // Urutan transform: rotate+flip DULU (posisi/orientasi dasar
              // foto), baru scale+translate (zoom/pan operator) - supaya
              // drag-geser & zoom tetap terasa wajar walau foto sudah
              // diputar/dibalik.
              transform: `scale(${crop.zoom}) translate(${crop.panX}%, ${crop.panY}%) rotate(${crop.rotate}deg) scaleX(${crop.flipX ? -1 : 1}) scaleY(${crop.flipY ? -1 : 1})`,
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
      {/* Bingkai "Custom" - render PERSIS elemen tersimpan (posisi/ukuran %
          apa adanya, TANPA normalisasi) - dipakai IDENTIK di preview layar,
          lembar cetak sungguhan, MAUPUN di dalam editor template (lewat
          prop interaktif opsional di bawah), supaya WYSIWYG & tidak ada
          celah drift antar tampilan. */}
      {isCustom && (customElements || []).map((el) => {
        const isSelected = interactive && el.id === selectedElId;
        const justify = el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center";
        return (
          <div key={el.id}
            onPointerDown={interactive ? (e) => onElementPointerDown(e, el, "move") : undefined}
            style={{
              position: "absolute", left: `${el.xPct}%`, top: `${el.yPct}%`, width: `${el.wPct}%`, height: `${el.hPct}%`,
              display: "flex", alignItems: "center", justifyContent: el.type === "text" ? justify : "center",
              overflow: "visible", cursor: interactive ? "move" : "default",
              outline: isSelected ? `1.5px dashed ${MAGA}` : "none", outlineOffset: 2,
            }}>
            {el.type === "image" ? (
              <img src={el.url} alt="" draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none" }} />
            ) : (
              <span style={{
                width: "100%", pointerEvents: "none", userSelect: "none",
                fontFamily: resolveTemplateFontCss(el.fontKey, customFonts),
                fontWeight: el.bold ? 800 : 400,
                fontSize: mode === "print" ? `${(el.fontSizePct / 100) * ratio.h}cm` : `${el.fontSizePct}cqh`,
                color: el.color || "#fff", textAlign: el.align || "center",
                whiteSpace: "pre-wrap", overflowWrap: "break-word", lineHeight: 1.15,
              }}>{resolveTemplateText(el.text)}</span>
            )}
            {interactive && isSelected && (
              <div onPointerDown={(e) => onElementPointerDown(e, el, "resize")}
                style={{
                  position: "absolute", right: -7, bottom: -7, width: 16, height: 16, borderRadius: 5,
                  background: MAGA, border: "2px solid #fff", cursor: "nwse-resize", pointerEvents: "auto",
                }} />
            )}
          </div>
        );
      })}
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
  // Toast singkat kalau HP scanner scan Photo ID yg TIDAK ketemu di sesi ini
  // (misal foto blm selesai diupload/diproses Gemini saat itu, atau typo/QR
  // rusak) - supaya beda jelas dr kasus "scanner-nya sendiri yg bermasalah".
  const [scanNotFound, setScanNotFound] = useState(null); // { digits, at }
  const scanNotFoundTimerRef = useRef(null);

  // ── Identitas operator + pairing realtime dgn scanner mobile ───────────
  // Scan QR SEKARANG dilakukan dr HP (/marta/photobooth/scan/[code]), bukan
  // lagi dr panel ini - jadi bisa ada BEBERAPA operator (device) sekaligus
  // aktif per sesi, & tiap HP scanner harus pilih mau pairing ke operator
  // mana dulu sblm scan (lihat `subscribeRpvOperatorPairing` di lib/rpv.js).
  const [operatorId, setOperatorId] = useState(""); // id unik per PERANGKAT (localStorage), bukan per sesi
  const joinedAtRef = useRef(0);
  const [operators, setOperators] = useState([]); // semua operator yg online di sesi aktif, terurut siapa gabung duluan

  useEffect(() => {
    // Baca localStorage di dalam async IIFE (bukan langsung di badan effect)
    // supaya setState-nya tidak dihitung "sync setState in effect" oleh lint.
    (async () => {
      let id = "";
      try {
        id = localStorage.getItem(OPERATOR_ID_KEY) || "";
        if (!id) {
          id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `op-${Math.random().toString(36).slice(2)}`;
          localStorage.setItem(OPERATOR_ID_KEY, id);
        }
      } catch { id = `op-${Math.random().toString(36).slice(2)}`; }
      joinedAtRef.current = Date.now();
      setOperatorId(id);
    })();
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scanLinkOpen, setScanLinkOpen] = useState(false);
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
  // (Enter) MAUPUN dr HP scanner yg berpasangan (lihat effect pairing di
  // bawah). SENGAJA TIDAK langsung cetak ("jangan langsung ngetrigger
  // print") - begitu ketemu, foto cuma dipilih & panel editor (crop/zoom/
  // rotate/flip) langsung tampil, operator masih bisa atur dulu sebelum
  // tekan tombol "Cetak" sendiri.
  // PENTING: selectByDigits HARUS stabil (identitas fungsi tdk berubah²) -
  // dipakai sbg dependency effect pairing channel scanner<->operator di
  // bawah. Sebelumnya fungsi ini dibuat ulang tiap `allPhotos` berubah
  // (yaitu TIAP ADA FOTO BARU MASUK dari tamu manapun), yg bikin effect
  // pairing ikut unsubscribe+resubscribe channel Realtime tiap saat itu -
  // kalau scan dari HP scanner kebetulan lewat PAS lagi resubscribe,
  // broadcast-nya hilang begitu saja (Supabase broadcast tidak di-retry),
  // makanya kadang "sudah pilih operator tapi scan tidak muncul". Fix:
  // baca activeCode/allPhotos dr ref terbaru, bukan dr closure dependency.
  const activeCodeRef = useRef("");
  const allPhotosRef = useRef([]);
  useEffect(() => { activeCodeRef.current = activeCode; }, [activeCode]);
  useEffect(() => { allPhotosRef.current = allPhotos; }, [allPhotos]);

  const selectByDigits = useCallback(async (rawDigits) => {
    const digits = String(rawDigits || "").trim().replace(/\D/g, "");
    const code = activeCodeRef.current;
    if (!digits || !code) return false;
    const hit = allPhotosRef.current.find((p) => p.queue_label === digits.padStart(5, "0"));
    if (hit) {
      setSelectedCode(hit.photo_code);
      return true;
    }
    try {
      const found = await findRpvPhotoByQueue(code, Number(digits));
      if (found) {
        const item = { photo_code: found.photo_code, storage_path: found.storage_path, uploaded_at: found.uploaded_at, is_ai_result: true, url: found.url, queue_no: found.queue_no, queue_label: found.queue_label };
        setAiPhotos((prev) => (prev.some((x) => x.photo_code === item.photo_code) ? prev : [item, ...prev]));
        setSelectedCode(item.photo_code);
        return true;
      }
    } catch { /* tidak ketemu - diamkan, list tetap kefilter kosong */ }
    return false;
  }, []);

  const searchExact = () => { selectByDigits(searchQuery); };

  // ── Hapus foto yg sudah masuk - dari daftar kiri panel Print Station.
  // Two-tap "arm" confirm (tap 1x jadi warna merah/icon centang "yakin?",
  // tap ke-2 dlm 3s baru benar2 hapus) - biar operator tidak kepencet hapus
  // foto tamu cuma krn klik ganda tanpa sengaja, tanpa perlu modal terpisah.
  const [confirmDeleteCode, setConfirmDeleteCode] = useState("");
  const [deletingPhotoCode, setDeletingPhotoCode] = useState("");
  const confirmDeleteTimerRef = useRef(null);
  const handleDeletePhoto = async (e, p) => {
    e.stopPropagation(); // jangan ikut trigger pilih/preview foto
    if (deletingPhotoCode) return;
    if (confirmDeleteCode !== p.photo_code) {
      clearTimeout(confirmDeleteTimerRef.current);
      setConfirmDeleteCode(p.photo_code);
      confirmDeleteTimerRef.current = setTimeout(() => {
        setConfirmDeleteCode((c) => (c === p.photo_code ? "" : c));
      }, 3000);
      return;
    }
    clearTimeout(confirmDeleteTimerRef.current);
    setConfirmDeleteCode("");
    setDeletingPhotoCode(p.photo_code);
    try {
      await deleteRpvPhoto(activeCode, p.photo_code, p.storage_path);
      if (p.is_ai_result) setAiPhotos((prev) => prev.filter((x) => x.photo_code !== p.photo_code));
      else setCamPhotos((prev) => prev.filter((x) => x.photo_code !== p.photo_code));
      setSelectedCode((cur) => (cur === p.photo_code ? "" : cur));
    } catch { /* gagal hapus (jaringan/permission) - diamkan, operator tinggal coba lagi */ }
    finally { setDeletingPhotoCode(""); }
  };

  // Join channel pairing operator utk sesi aktif - begitu HP scanner yg
  // berpasangan berhasil scan Photo ID, langsung PILIH foto itu di SINI saja
  // (operator lain yg pairing ke device lain tidak ikut ter-trigger) - TANPA
  // langsung cetak, operator masih sempat edit crop/rotate/zoom dulu.
  useEffect(() => {
    if (!activeCode || !operatorId) {
      // Bungkus setState reset ini di microtask supaya tidak dihitung
      // "sync setState in effect" oleh lint (pola yg sama dgn effect id-operator).
      Promise.resolve().then(() => setOperators([]));
      return;
    }
    const pairing = subscribeRpvOperatorPairing(
      activeCode,
      { id: operatorId, role: "operator", joinedAt: joinedAtRef.current },
      {
        onOperatorsChange: setOperators,
        onSelectPhoto: ({ digits }) => {
          if (!digits) return;
          selectByDigits(digits).then((ok) => {
            if (ok) return;
            clearTimeout(scanNotFoundTimerRef.current);
            setScanNotFound({ digits, at: Date.now() });
            scanNotFoundTimerRef.current = setTimeout(() => setScanNotFound(null), 4000);
          });
        },
      }
    );
    return () => pairing.unsubscribe();
  }, [activeCode, operatorId, selectByDigits]);

  const myOperatorIndex = operators.findIndex((o) => o.id === operatorId);
  const myOperatorLabel = myOperatorIndex >= 0 ? `Operator ${myOperatorIndex + 1}` : "";

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
  const rotateBy = (deg) => setCrop((c) => ({ ...c, rotate: (c.rotate + deg + 360) % 360 }));
  const toggleFlipX = () => setCrop((c) => ({ ...c, flipX: !c.flipX }));
  const toggleFlipY = () => setCrop((c) => ({ ...c, flipY: !c.flipY }));
  const resetCrop = () => setCrop(DEFAULT_CROP);

  // ── Ukuran cetak & bingkai ────────────────────────────────────────────
  const [frameKey, setFrameKey] = useState("none");
  const printRatio = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };

  // ── Bingkai "Custom": elemen teks/gambar bebas + template tersimpan di
  // DATABASE (bukan localStorage - lihat lib/rpv.js listRpvFrameTemplates
  // dkk & marta_hub/rpv_frame_templates_schema.sql), supaya bisa dipakai
  // lagi dari sesi/device manapun. `customElements` inilah yg benar2
  // dipakai render PhotoFrame (preview & cetak) SEKALIGUS yg diedit lewat
  // TemplateEditorModal - satu sumber data, jadi tidak ada celah drift
  // antara apa yg diedit vs apa yg dicetak/disimpan.
  const [customElements, setCustomElements] = useState([]);
  const [customBaseStyle, setCustomBaseStyle] = useState("none"); // "none" | "polaroid"
  const [selectedElId, setSelectedElId] = useState("");
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [templatesState, setTemplatesState] = useState("idle"); // idle|loading|ready
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [activeTemplateName, setActiveTemplateName] = useState("Template Baru");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateUploading, setTemplateUploading] = useState(false);
  const templateFrameRef = useRef(null);
  const elDragRef = useRef(null);

  // Font custom (upload sendiri operator, lihat lib/rpv.js + rpv_custom_
  // fonts_schema.sql) - dimuat SEKALI di level halaman (bukan cuma di
  // editor) supaya preview panel print & lembar cetak sungguhan JUGA bisa
  // render font custom yg dipakai template tersimpan, bukan cuma di dalam
  // editor-nya saja.
  const [customFonts, setCustomFonts] = useState([]);
  const [customFontsState, setCustomFontsState] = useState("idle");
  const [fontUploading, setFontUploading] = useState(false);

  const loadTemplateList = useCallback(async () => {
    setTemplatesState("loading");
    try { setSavedTemplates(await listRpvFrameTemplates()); }
    catch { /* gagal muat daftar - diamkan, operator bisa coba lagi */ }
    finally { setTemplatesState("ready"); }
  }, []);
  const loadCustomFonts = useCallback(async () => {
    setCustomFontsState("loading");
    try { setCustomFonts(await listRpvCustomFonts()); }
    catch { /* gagal muat daftar font - diamkan */ }
    finally { setCustomFontsState("ready"); }
  }, []);
  useEffect(() => {
    if (!templateEditorOpen) return;
    Promise.resolve().then(() => { loadTemplateList(); loadCustomFonts(); });
  }, [templateEditorOpen, loadTemplateList, loadCustomFonts]);
  // Font custom dipakai di render cetak/preview print panel JUGA (bukan
  // cuma saat editor dibuka) - muat sekali begitu halaman siap.
  useEffect(() => { Promise.resolve().then(() => loadCustomFonts()); }, [loadCustomFonts]);

  const uploadCustomFont = async (file) => {
    if (!file) return;
    const name = (window.prompt("Nama font ini (utk ditampilkan di daftar):", file.name.replace(/\.[^.]+$/, "")) || "").trim();
    if (!name) return;
    setFontUploading(true);
    try { await uploadRpvCustomFont(file, name); await loadCustomFonts(); }
    catch { /* gagal upload font - diamkan, operator bisa coba lagi */ }
    finally { setFontUploading(false); }
  };
  const removeCustomFont = async (id) => {
    if (!window.confirm("Hapus font custom ini? Kotak teks yg masih memakainya akan kembali ke font bawaan.")) return;
    try { await deleteRpvCustomFont(id); await loadCustomFonts(); }
    catch { /* gagal hapus - diamkan */ }
  };

  const updateElement = useCallback((id, patch) => {
    setCustomElements((els) => els.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);
  const addTextElement = () => {
    const el = newTemplateTextElement();
    setCustomElements((els) => [...els, el]);
    setSelectedElId(el.id);
  };
  const addImageElementFromFile = async (file) => {
    if (!file) return;
    setTemplateUploading(true);
    try {
      const url = await uploadRpvTemplateImage(file);
      const el = newTemplateImageElement(url);
      setCustomElements((els) => [...els, el]);
      setSelectedElId(el.id);
    } catch { /* gagal upload gambar - diamkan, operator bisa coba lagi */ }
    finally { setTemplateUploading(false); }
  };
  const removeElement = (id) => {
    setCustomElements((els) => els.filter((e) => e.id !== id));
    setSelectedElId((s) => (s === id ? "" : s));
  };

  // Drag geser (mode "move") & drag pojok utk resize (mode "resize") - pola
  // sama dgn onCropPointerDown (window pointermove/pointerup, hitung delta
  // dlm % thd bounding box bingkai) - SEMUA dlm PERSEN supaya konsisten dgn
  // penyimpanan template (lihat newTemplateTextElement/Image di atas).
  const onElementPointerDown = useCallback((e, el, mode) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedElId(el.id);
    const rect = templateFrameRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    elDragRef.current = {
      id: el.id, mode, startClientX: e.clientX, startClientY: e.clientY,
      rectW: rect.width, rectH: rect.height,
      startXPct: el.xPct, startYPct: el.yPct, startWPct: el.wPct, startHPct: el.hPct,
    };
    const move = (ev) => {
      const d = elDragRef.current;
      if (!d) return;
      const dxPct = ((ev.clientX - d.startClientX) / d.rectW) * 100;
      const dyPct = ((ev.clientY - d.startClientY) / d.rectH) * 100;
      if (d.mode === "move") {
        updateElement(d.id, { xPct: clampPct(d.startXPct + dxPct, -20, 96), yPct: clampPct(d.startYPct + dyPct, -20, 96) });
      } else {
        updateElement(d.id, { wPct: clampPct(d.startWPct + dxPct, 4, 200), hPct: clampPct(d.startHPct + dyPct, 4, 200) });
      }
    };
    const up = () => {
      elDragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [updateElement]);

  const applyTemplate = (tpl) => {
    // Muat APA ADANYA (tanpa transformasi) - jaminan "tidak bergeser jika
    // sudah disimpan templatenya".
    setCustomElements(Array.isArray(tpl.elements) ? tpl.elements : []);
    setCustomBaseStyle(tpl.baseStyle || "none");
    setActiveTemplateId(tpl.id);
    setActiveTemplateName(tpl.name);
    setSelectedElId("");
    // Ingat template ini sbg "terakhir dipakai" di device ini, supaya lain
    // kali (foto baru, reload halaman) otomatis kepasang lagi tanpa perlu
    // buka Editor Template & pilih manual lagi.
    try { window.localStorage.setItem(LAST_TEMPLATE_ID_KEY, tpl.id); } catch { /* localStorage tdk tersedia - diamkan */ }
  };
  const startBlankTemplate = () => {
    setCustomElements([]);
    setCustomBaseStyle("none");
    setActiveTemplateId("");
    setActiveTemplateName("Template Baru");
    setSelectedElId("");
    try { window.localStorage.removeItem(LAST_TEMPLATE_ID_KEY); } catch { /* diamkan */ }
  };

  // Daftar template JUGA dimuat sekali di awal (bukan cuma saat Editor
  // Template dibuka) - supaya template terakhir dipakai (localStorage,
  // lihat LAST_TEMPLATE_ID_KEY) bisa otomatis kepasang begitu halaman
  // dibuka / pindah ke foto lain, tanpa operator harus buka editor dulu.
  useEffect(() => { Promise.resolve().then(() => loadTemplateList()); }, [loadTemplateList]);
  useEffect(() => {
    if (templatesState !== "ready" || activeTemplateId || savedTemplates.length === 0) return;
    // Prioritas: (1) template terakhir dipakai DI DEVICE INI (localStorage -
    // continuity kerja yg sedang berjalan), lalu (2) kalau belum ada,
    // template yg ditandai DEFAULT di DATABASE (rpv_frame_templates.is_default
    // - jadi berlaku utk device/operator manapun, bukan cuma browser ini).
    let lastId = "";
    try { lastId = window.localStorage.getItem(LAST_TEMPLATE_ID_KEY) || ""; } catch { /* diamkan */ }
    const tpl = (lastId && savedTemplates.find((t) => t.id === lastId)) || savedTemplates.find((t) => t.isDefault);
    if (!tpl) return;
    Promise.resolve().then(() => {
      applyTemplate(tpl);
      setFrameKey("custom");
    });
  }, [templatesState, savedTemplates, activeTemplateId]);
  const saveTemplate = async (asNew) => {
    const name = (window.prompt("Nama template:", asNew ? "" : activeTemplateName) || "").trim();
    if (!name) return;
    setTemplateSaving(true);
    try {
      const saved = await saveRpvFrameTemplate(asNew ? null : activeTemplateId, name, customElements, customBaseStyle);
      if (saved) {
        setActiveTemplateId(saved.id);
        setActiveTemplateName(saved.name);
        try { window.localStorage.setItem(LAST_TEMPLATE_ID_KEY, saved.id); } catch { /* diamkan */ }
        await loadTemplateList();
      }
    } catch (err) {
      window.alert(`Gagal menyimpan template: ${err?.message || "Terjadi kesalahan tidak diketahui."}`);
    } finally { setTemplateSaving(false); }
  };
  const deleteTemplate = async (id) => {
    if (!window.confirm("Hapus template ini? Tindakan ini tidak bisa dibatalkan.")) return;
    try {
      await deleteRpvFrameTemplate(id);
      if (id === activeTemplateId) startBlankTemplate();
      await loadTemplateList();
    } catch { /* gagal hapus - diamkan */ }
  };
  // Set/lepas template DEFAULT (tersimpan di kolom is_default, bukan
  // localStorage) - dipakai otomatis utk foto/sesi/device baru yg belum
  // pernah pilih template sendiri (lihat effect auto-apply di atas).
  const setDefaultTemplate = async (id) => {
    try {
      await setRpvDefaultFrameTemplate(id);
      await loadTemplateList();
    } catch (err) {
      window.alert(`Gagal menjadikan default: ${err?.message || "Terjadi kesalahan tidak diketahui."}`);
    }
  };
  const unsetDefaultTemplate = async () => {
    try {
      await clearRpvDefaultFrameTemplate();
      await loadTemplateList();
    } catch (err) {
      window.alert(`Gagal melepas default: ${err?.message || "Terjadi kesalahan tidak diketahui."}`);
    }
  };

  const handlePrint = () => { if (selectedPhoto) window.print(); };

  const activeSummary = session ? `${session.title} · ${activeCode}` : "Belum ada sesi aktif";

  return (
    <div className="flashprint-root" style={{ height: "100svh", background: t.bg, fontFamily: FONT, color: t.hi, display: "flex", flexDirection: "column", overflow: "hidden", colorScheme: "dark", position: "relative" }}>
      {/* Font pilihan kotak teks template Custom - dimuat sekali di sini
          (bukan next/font krn daftarnya dinamis/opsional) supaya nama font
          benar2 tampil sesuai pilihan, baik di preview layar maupun saat
          window.print(). */}
      <link rel="stylesheet" href={TEMPLATE_GOOGLE_FONTS_HREF} />
      {/* @font-face utk font custom upload sendiri operator - lihat
          customFontFaceCss/resolveTemplateFontCss di atas. */}
      {customFonts.length > 0 && <style>{customFontFaceCss(customFonts)}</style>}
      {/* Ambient TIPIS di belakang seluruh panel operator, senada dgn
          halaman2 tamu/scanner - sengaja opacity/blur lebih rendah supaya
          tidak ganggu kerja operator (banyak teks/angka), cuma sentuhan
          brand di sela panel, & responsive (blob width pakai min(vw,px)
          jadi tidak jadi kotak keras di layar lebar). */}
      <div className="rpv-op-ambient" aria-hidden="true">
        <div className="rpv-op-ambient-blob rpv-op-ambient-blob--a" />
        <div className="rpv-op-ambient-blob rpv-op-ambient-blob--b" />
      </div>
      {/* Toast: HP scanner scan Photo ID yg tidak ketemu di sesi aktif ini -
          beda jelas dr kesan "scanner tidak berfungsi" (lihat catatan di
          effect pairing di atas). */}
      {scanNotFound && (
        <div style={{
          position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 50,
          display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 11,
          background: "#2A1416", border: `1.5px solid ${RED}66`, color: "#FFD9DA", fontSize: 12.5, fontWeight: 700,
          fontFamily: FONT, boxShadow: "0 10px 26px -8px rgba(0,0,0,0.5)", maxWidth: "92vw",
        }}>
          <AlertTriangle size={15} color={RED} style={{ flexShrink: 0 }} />
          Photo ID {scanNotFound.digits} tidak ditemukan di sesi ini - pastikan foto sudah selesai diupload.
        </div>
      )}
      {/* Header tipis - responsif: di layar sempit (HP), label "Buka Viewer"
          disembunyikan (ikon-nya tetap ada) & ringkasan sesi menyusut biar
          tidak overflow/kepotong (lihat .rpv-header* di <style> global). */}
      <div className="rpv-header" style={{ flexShrink: 0, minHeight: 54, display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: t.card, borderBottom: `1px solid ${t.line}`, position: "relative", zIndex: 1 }}>
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
          {activeCode && myOperatorLabel && (
            <button onClick={() => setScanLinkOpen(true)} title="ID perangkat operator ini - klik utk lihat link HP scanner"
              style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.mid, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
              <Radio size={12} color={MAGA} /> {myOperatorLabel}
            </button>
          )}
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
          <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Belum ada sesi</div>
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
              <div style={{ position: "relative" }}>
                <Search size={14} color={t.lo} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") searchExact(); }}
                  placeholder="Cari Photo ID (5 digit)…" inputMode="numeric"
                  style={{ width: "100%", height: 38, borderRadius: 10, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontSize: 13, fontFamily: "monospace", letterSpacing: "0.04em", padding: "0 12px 0 32px", boxSizing: "border-box" }} />
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
                const confirming = confirmDeleteCode === p.photo_code;
                const rowDeleting = deletingPhotoCode === p.photo_code;
                return (
                  // NOTE: pakai <div role="button"> (bukan <button>) di sini krn
                  // tombol Hapus di dalamnya JUGA <button> - <button> di dalam
                  // <button> tidak valid HTML & browser akan reparent/rusak.
                  <div key={p.photo_code} role="button" tabIndex={0}
                    onClick={() => setSelectedCode(p.photo_code)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCode(p.photo_code); } }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10, padding: 8, marginBottom: 6, borderRadius: 12,
                      border: `1.5px solid ${confirming ? "#DC2626" : active ? MAGA : "transparent"}`, background: confirming ? "rgba(220,38,38,0.12)" : active ? `${MAGA}1c` : t.fieldBg, cursor: "pointer", fontFamily: FONT, textAlign: "left",
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
                      <div style={{ fontSize: 10, color: t.lo, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.photo_code}{p.uploaded_at ? ` · ${formatPhotoTime(p.uploaded_at)}` : ""}
                      </div>
                    </div>
                    {/* Hapus foto - tap 1x "arm" (jadi merah, minta konfirmasi),
                        tap ke-2 dlm 3s baru benar2 hapus (storage + baris DB). */}
                    <button onClick={(e) => handleDeletePhoto(e, p)} disabled={rowDeleting}
                      title={confirming ? "Yakin? Klik lagi utk hapus" : "Hapus foto ini"}
                      style={{
                        width: 26, height: 26, borderRadius: 8, flexShrink: 0, border: `1px solid ${confirming ? "#DC2626" : t.line}`,
                        background: confirming ? "#DC2626" : "transparent", color: confirming ? "#fff" : "#FF8A8F",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: rowDeleting ? "not-allowed" : "pointer",
                      }}>
                      {rowDeleting ? <Loader2 size={11} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={11} />}
                    </button>
                  </div>
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
                        imgRef={imgRef} onPointerDown={onCropPointerDown} customElements={customElements} customBaseStyle={customBaseStyle} customFonts={customFonts} />
                    </div>
                    {/* Zoom - HANYA lewat scroll (wheel, lihat onWheel di wrapper
                        di atas) atau tombol/slider di sini. Elemen <img>
                        sudah diberi touchAction:"none" (lihat PhotoFrame),
                        jadi gestur pinch bawaan browser TIDAK memicu zoom -
                        satu2nya jalur zoom yg konsisten & presisi utk
                        keperluan cetak. */}
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <button onClick={() => zoomBy(-0.15)} title="Perkecil" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Minus size={13} /></button>
                      <input type="range" min="1" max="4" step="0.01" value={crop.zoom} onChange={(e) => setCrop((c) => ({ ...c, zoom: +Number(e.target.value).toFixed(2) }))}
                        className="rpv-zoom-slider" style={{ flex: 1, maxWidth: 140, accentColor: MAGA }} />
                      <span style={{ fontSize: 11, color: t.lo, fontWeight: 700, width: 38, textAlign: "center", flexShrink: 0 }}>{Math.round(crop.zoom * 100)}%</span>
                      <button onClick={() => zoomBy(0.15)} title="Perbesar" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><ZoomIn size={13} /></button>
                    </div>
                    <div style={{ marginTop: 2, textAlign: "center", fontSize: 10, color: t.lo }}>Geser gambar utk atur posisi · scroll/slider utk zoom</div>

                    {/* Putar & balik - buat case cetak yg fotonya kepotret
                        miring/landscape padahal mau dicetak potret, atau
                        HP scanner tamu megang kamera terbalik. Putar
                        selalu kelipatan 90° (presisi ngepas bingkai cetak),
                        label tombol nunjukin derajat saat ini. */}
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => rotateBy(ROTATE_STEP)} title="Putar 90° searah jarum jam"
                        style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                        <RotateCw size={13} /> Putar 90° <span style={{ color: t.lo, fontWeight: 600 }}>({crop.rotate}°)</span>
                      </button>
                      <button onClick={toggleFlipX} title="Balik horizontal (cermin kiri-kanan)"
                        style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: `1.5px solid ${crop.flipX ? MAGA : t.line}`, background: crop.flipX ? `${MAGA}22` : t.card, color: crop.flipX ? "#fff" : t.mid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                        <FlipHorizontal2 size={13} /> Balik H
                      </button>
                      <button onClick={toggleFlipY} title="Balik vertikal (cermin atas-bawah)"
                        style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: `1.5px solid ${crop.flipY ? MAGA : t.line}`, background: crop.flipY ? `${MAGA}22` : t.card, color: crop.flipY ? "#fff" : t.mid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                        <FlipVertical2 size={13} /> Balik V
                      </button>
                      <button onClick={resetCrop} title="Reset posisi/zoom/rotasi/balik"
                        style={{ fontSize: 10.5, color: t.lo, fontWeight: 700, background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}>Reset Semua</button>
                    </div>
                  </div>

                  {/* Ukuran cetak - dikunci ke 2R (tidak ada lagi pilihan ukuran lain). */}
                  <div style={{ width: "100%", maxWidth: 340 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, marginBottom: 8 }}>UKURAN CETAK</div>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: 9,
                      border: `1.5px solid ${MAGA}`, background: `${MAGA}22`, color: "#fff", fontSize: 11, fontWeight: 700,
                    }}>
                      {PRINT_SIZE.label} · {PRINT_SIZE.w}×{PRINT_SIZE.h}cm
                    </div>
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
                    {frameKey === "custom" && (
                      <button onClick={() => setTemplateEditorOpen(true)}
                        style={{
                          marginTop: 8, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                          height: 34, borderRadius: 9, border: `1.5px solid ${MAGA}66`, background: `${MAGA}18`, color: "#fff",
                          fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
                        }}>
                        <Layers size={13} /> Editor Template {activeTemplateName ? `· ${activeTemplateName}` : ""}
                      </button>
                    )}
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
            queueLabel={selectedPhoto.queue_label} sessionTitle={session?.title} customElements={customElements} customBaseStyle={customBaseStyle} customFonts={customFonts} />
        </div>
      )}
      <style>{`@page { size: ${printRatio.w}cm ${printRatio.h}cm; margin: 0; }`}</style>

      {scanLinkOpen && activeCode && (
        <ScanLinkPopup code={activeCode} onClose={() => setScanLinkOpen(false)} />
      )}

      {templateEditorOpen && (
        <TemplateEditorModal
          photo={selectedPhoto} ratio={printRatio}
          elements={customElements} selectedElId={selectedElId} setSelectedElId={setSelectedElId}
          baseStyle={customBaseStyle} onSetBaseStyle={setCustomBaseStyle}
          customFonts={customFonts} customFontsState={customFontsState} onUploadFont={uploadCustomFont} onDeleteFont={removeCustomFont} fontUploading={fontUploading}
          frameRef={templateFrameRef} onElementPointerDown={onElementPointerDown}
          onAddText={addTextElement} onAddImage={addImageElementFromFile} onUpdateElement={updateElement} onRemoveElement={removeElement}
          uploading={templateUploading}
          templates={savedTemplates} templatesState={templatesState}
          activeTemplateId={activeTemplateId} activeTemplateName={activeTemplateName}
          onApplyTemplate={applyTemplate} onNewTemplate={startBlankTemplate}
          onSaveTemplate={() => saveTemplate(false)} onSaveTemplateAs={() => saveTemplate(true)} onDeleteTemplate={deleteTemplate}
          onSetDefaultTemplate={setDefaultTemplate} onUnsetDefaultTemplate={unsetDefaultTemplate}
          saving={templateSaving}
          onClose={() => { setTemplateEditorOpen(false); setSelectedElId(""); }}
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

        /* Ambient TIPIS panel operator - blob jauh lebih redup/kecil drpd
           versi tamu/scanner (opacity rendah, blur besar) supaya cuma
           terasa sbg tekstur brand di sela panel, bukan elemen yg
           mengganggu fokus kerja. Ukuran pakai min(vw,px) + blur
           proporsional vw supaya tetap wajar di layar lebar (tidak
           terpotong kotak keras di desktop). */
        .rpv-op-ambient {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
          opacity: 0.5;
        }
        .rpv-op-ambient-blob {
          position: absolute; border-radius: 50%; filter: blur(min(64px, 9vw));
          width: min(46vw, 420px); aspect-ratio: 1;
        }
        .rpv-op-ambient-blob--a {
          left: -6%; top: -12%; background: radial-gradient(circle, ${MAGA}22 0%, transparent 70%);
          animation: rpv-op-ambient-drift-a 18s ease-in-out infinite;
        }
        .rpv-op-ambient-blob--b {
          right: -8%; bottom: -14%; width: min(40vw, 380px); background: radial-gradient(circle, ${VIO}20 0%, transparent 70%);
          animation: rpv-op-ambient-drift-b 21s ease-in-out infinite 1.5s;
        }
        @keyframes rpv-op-ambient-drift-a {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          50%       { transform: translate(6%, 5%) scale(1.12); }
        }
        @keyframes rpv-op-ambient-drift-b {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          50%       { transform: translate(-5%, -6%) scale(1.1); }
        }
        @media (max-width: 860px) {
          .rpv-op-ambient { opacity: 0.35; }
        }

        /* Slider zoom preview cetak - versi native disederhanakan biar
           konsisten lintas browser (track tipis, thumb bulat kecil). */
        .rpv-zoom-slider { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 99px; background: ${t.line}; cursor: pointer; }
        .rpv-zoom-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 15px; height: 15px; border-radius: 99px; background: ${MAGA}; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.35); cursor: pointer; }
        .rpv-zoom-slider::-moz-range-thumb { width: 15px; height: 15px; border-radius: 99px; background: ${MAGA}; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.35); cursor: pointer; }

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

/** Popup kecil berisi LINK HP scanner (`/marta/photobooth/scan/[code]`) utk
 * sesi aktif - dibuka dgn klik badge "Operator N" di header. Operator
 * tinggal share link ini (WA/dsb) ke HP yg mau dijadikan scanner, HP tsb
 * nanti pilih sendiri mau pairing ke operator device mana sblm scan. */
/** Editor bingkai "Custom" - full-screen: kiri kanvas preview (drag utk
 * geser elemen, drag pojok kanan-bawah elemen terpilih utk resize),
 * kanan toolbar (tambah teks/gambar, inspector elemen terpilih: teks, font,
 * ukuran, bold, warna, align) + panel Template (simpan/simpan-sbg/muat/
 * hapus - SEMUA lewat database, lihat lib/rpv.js). Kanvas re-pakai
 * <PhotoFrame mode="screen" frame="custom"> APA ADANYA (bukan re-impl
 * terpisah) supaya WYSIWYG 100% sama dgn preview & hasil cetak sungguhan. */
function TemplateEditorModal({
  photo, ratio, elements, selectedElId, setSelectedElId, frameRef, onElementPointerDown,
  baseStyle, onSetBaseStyle,
  customFonts, customFontsState, onUploadFont, onDeleteFont, fontUploading,
  onAddText, onAddImage, onUpdateElement, onRemoveElement, uploading,
  templates, templatesState, activeTemplateId, activeTemplateName,
  onApplyTemplate, onNewTemplate, onSaveTemplate, onSaveTemplateAs, onDeleteTemplate, saving,
  onSetDefaultTemplate, onUnsetDefaultTemplate,
  onClose,
}) {
  const fileInputRef = useRef(null);
  const fontInputRef = useRef(null);
  const selectedEl = elements.find((e) => e.id === selectedElId) || null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 90, background: "rgba(6,6,8,0.86)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "stretch", justifyContent: "center", fontFamily: FONT,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        margin: "auto", width: "min(96vw, 1040px)", height: "min(92vh, 720px)", background: t.bg,
        border: `1px solid ${t.line}`, borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${t.line}`, background: t.card }}>
          <Layers size={16} color={MAGA} />
          <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Editor Template Custom</div>
          <div style={{ fontSize: 11, color: t.lo, fontWeight: 600 }}>{activeTemplateName}{activeTemplateId ? "" : " (belum disimpan)"}</div>
          <button onClick={onClose} title="Tutup"
            style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>

        {/* Body: kanvas + toolbar */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }} className="rpv-tpl-body">
          {/* Kanvas */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 22, background: "#000", overflow: "auto" }}
            onPointerDown={() => setSelectedElId("")}>
            <div style={{ width: "min(100%, 420px)", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
              <PhotoFrame photo={photo} ratio={ratio} crop={DEFAULT_CROP} frame="custom" customBaseStyle={baseStyle} mode="screen"
                queueLabel={photo?.queue_label} sessionTitle="" wrapperRef={frameRef}
                customElements={elements} customFonts={customFonts} onElementPointerDown={onElementPointerDown} selectedElId={selectedElId} />
            </div>
          </div>

          {/* Toolbar kanan */}
          <div style={{ width: 280, flexShrink: 0, borderLeft: `1px solid ${t.line}`, background: t.card, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Bentuk dasar - "Polaroid Putih" ngasih margin+strip putih
                  (spt preset "white") tapi elemen tetap bisa ditaruh di
                  area putihnya juga (elemen selalu overlay di SELURUH
                  bingkai, lihat PhotoFrame) - "Penuh" = foto tanpa margin. */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: t.mid, marginBottom: 8, letterSpacing: "0.04em" }}>BENTUK DASAR</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["none", "Penuh"], ["polaroid", "Polaroid Putih"]].map(([v, lbl]) => (
                    <button key={v} onClick={() => onSetBaseStyle(v)}
                      style={{
                        flex: 1, height: 32, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                        border: `1.5px solid ${baseStyle === v ? MAGA : t.line}`, background: baseStyle === v ? `${MAGA}22` : t.fieldBg,
                        color: baseStyle === v ? "#fff" : t.mid,
                      }}>{lbl}</button>
                  ))}
                </div>
              </div>

              {/* Tambah elemen */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: t.mid, marginBottom: 8, letterSpacing: "0.04em" }}>TAMBAH ELEMEN</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={onAddText}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, borderRadius: 9, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                    <Type size={13} /> Teks
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, borderRadius: 9, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontSize: 11.5, fontWeight: 700, cursor: uploading ? "not-allowed" : "pointer", fontFamily: FONT, opacity: uploading ? 0.6 : 1 }}>
                    {uploading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <ImagePlus size={13} />} Gambar
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onAddImage(f); }} />
                </div>
              </div>

              {/* Inspector elemen terpilih */}
              {selectedEl ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: t.mid, letterSpacing: "0.04em" }}>{selectedEl.type === "text" ? "KOTAK TEKS" : "GAMBAR"}</div>
                    <button onClick={() => onRemoveElement(selectedEl.id)} title="Hapus elemen"
                      style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", color: RED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {selectedEl.type === "text" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea value={selectedEl.text} onChange={(e) => onUpdateElement(selectedEl.id, { text: e.target.value })}
                        rows={2} placeholder="Tulis teks... atau sisipkan token di bawah"
                        style={{ width: "100%", resize: "vertical", borderRadius: 8, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontSize: 12, padding: 8, fontFamily: FONT }} />

                      {/* Token dinamis - diganti otomatis dgn nama sesi/Photo
                          ID SUNGGUHAN saat render (preview & cetak), jadi 1
                          template bisa dipakai berulang utk sesi manapun -
                          lihat resolveTemplateText di PhotoFrame. */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["{Nama Event}", "{Photo ID}"].map((token) => (
                          <button key={token} type="button"
                            onClick={() => onUpdateElement(selectedEl.id, { text: `${selectedEl.text || ""}${selectedEl.text ? " " : ""}${token}` })}
                            style={{ height: 24, padding: "0 9px", borderRadius: 6, border: `1px dashed ${t.line}`, background: "transparent", color: t.mid, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>
                            + {token}
                          </button>
                        ))}
                      </div>

                      <label style={{ fontSize: 10, color: t.lo, fontWeight: 700 }}>Font</label>
                      <select value={selectedEl.fontKey} onChange={(e) => onUpdateElement(selectedEl.id, { fontKey: e.target.value })}
                        style={{ width: "100%", height: 32, borderRadius: 8, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontSize: 12, padding: "0 8px" }}>
                        <optgroup label="Bawaan">
                          {TEMPLATE_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </optgroup>
                        {customFonts.length > 0 && (
                          <optgroup label="Font Kustom Anda">
                            {customFonts.map((f) => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
                          </optgroup>
                        )}
                      </select>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button onClick={() => onUpdateElement(selectedEl.id, { bold: !selectedEl.bold })}
                          style={{
                            flex: 1, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            border: `1.5px solid ${selectedEl.bold ? MAGA : t.line}`, background: selectedEl.bold ? `${MAGA}22` : t.fieldBg,
                            color: selectedEl.bold ? "#fff" : t.mid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          }}>
                          <Bold size={12} /> Bold
                        </button>
                        <input type="color" value={selectedEl.color} onChange={(e) => onUpdateElement(selectedEl.id, { color: e.target.value })}
                          title="Warna teks" style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.line}`, background: "none", cursor: "pointer", padding: 0 }} />
                      </div>

                      <label style={{ fontSize: 10, color: t.lo, fontWeight: 700 }}>Ukuran font ({selectedEl.fontSizePct}% tinggi bingkai)</label>
                      <input type="range" min="2" max="26" step="0.5" value={selectedEl.fontSizePct}
                        onChange={(e) => onUpdateElement(selectedEl.id, { fontSizePct: Number(e.target.value) })}
                        style={{ width: "100%", accentColor: MAGA }} />

                      <label style={{ fontSize: 10, color: t.lo, fontWeight: 700 }}>Perataan</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[["left", "Kiri"], ["center", "Tengah"], ["right", "Kanan"]].map(([v, lbl]) => (
                          <button key={v} onClick={() => onUpdateElement(selectedEl.id, { align: v })}
                            style={{
                              flex: 1, height: 28, borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                              border: `1.5px solid ${selectedEl.align === v ? MAGA : t.line}`, background: selectedEl.align === v ? `${MAGA}22` : t.fieldBg,
                              color: selectedEl.align === v ? "#fff" : t.mid,
                            }}>{lbl}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: t.lo, lineHeight: 1.6 }}>
                      Geser gambar utk pindah posisi, tarik kotak kecil di pojok kanan-bawah utk ubah ukuran.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: t.lo, lineHeight: 1.6 }}>
                  Klik salah satu elemen di kanvas utk mengatur teks/font/ukuran/warna, atau tambah elemen baru di atas.
                </div>
              )}

              {/* Template tersimpan */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: t.mid, marginBottom: 8, letterSpacing: "0.04em" }}>TEMPLATE TERSIMPAN</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 140, overflowY: "auto" }}>
                  {templatesState === "loading" && (
                    <div style={{ display: "flex", justifyContent: "center", padding: 10 }}><Loader2 size={16} color={MAGA} style={{ animation: "spin 1s linear infinite" }} /></div>
                  )}
                  {templatesState === "ready" && templates.length === 0 && (
                    <div style={{ fontSize: 10.5, color: t.lo, padding: "6px 2px" }}>Belum ada template tersimpan.</div>
                  )}
                  {templates.map((tpl) => (
                    <div key={tpl.id} onClick={() => onApplyTemplate(tpl)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "7px 9px", borderRadius: 8, cursor: "pointer",
                        border: `1.5px solid ${tpl.id === activeTemplateId ? MAGA : t.lineSoft}`, background: tpl.id === activeTemplateId ? `${MAGA}18` : t.fieldBg,
                      }}>
                      <FolderOpen size={12} color={tpl.id === activeTemplateId ? MAGA : t.lo} style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tpl.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); tpl.isDefault ? onUnsetDefaultTemplate() : onSetDefaultTemplate(tpl.id); }}
                        title={tpl.isDefault ? "Default saat ini - klik utk lepas" : "Jadikan template default (otomatis dipakai foto/sesi baru)"}
                        style={{ width: 20, height: 20, borderRadius: 6, border: "none", background: "transparent", color: tpl.isDefault ? "#F5B400" : t.lo, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                        <Star size={11} fill={tpl.isDefault ? "#F5B400" : "none"} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDeleteTemplate(tpl.id); }} title="Hapus template"
                        style={{ width: 20, height: 20, borderRadius: 6, border: "none", background: "transparent", color: t.lo, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Font custom - upload sendiri (.ttf/.otf/.woff/.woff2),
                  tersimpan di database+storage, langsung muncul di dropdown
                  Font kotak teks di atas ("Font Kustom Anda"). */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: t.mid, marginBottom: 8, letterSpacing: "0.04em" }}>FONT KUSTOM</div>
                <button onClick={() => fontInputRef.current?.click()} disabled={fontUploading}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 32, borderRadius: 8, border: `1px dashed ${t.line}`, background: "transparent", color: t.mid, fontSize: 11, fontWeight: 700, cursor: fontUploading ? "not-allowed" : "pointer", fontFamily: FONT, opacity: fontUploading ? 0.6 : 1 }}>
                  {fontUploading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <ImagePlus size={12} />} Upload Font (.ttf/.otf/.woff)
                </button>
                <input ref={fontInputRef} type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUploadFont(f); }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 110, overflowY: "auto", marginTop: 8 }}>
                  {customFontsState === "loading" && (
                    <div style={{ display: "flex", justifyContent: "center", padding: 6 }}><Loader2 size={14} color={MAGA} style={{ animation: "spin 1s linear infinite" }} /></div>
                  )}
                  {customFontsState === "ready" && customFonts.length === 0 && (
                    <div style={{ fontSize: 10.5, color: t.lo, padding: "4px 2px" }}>Belum ada font custom.</div>
                  )}
                  {customFonts.map((f) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 9px", borderRadius: 8, border: `1px solid ${t.lineSoft}`, background: t.fieldBg }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: `"rpv-cf-${f.id}", ${FONT}` }}>{f.name}</span>
                      <button onClick={() => onDeleteFont(f.id)} title="Hapus font"
                        style={{ width: 20, height: 20, borderRadius: 6, border: "none", background: "transparent", color: t.lo, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Aksi simpan - fixed di bawah toolbar */}
            <div style={{ flexShrink: 0, padding: 12, borderTop: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={onSaveTemplate} disabled={saving}
                style={{
                  height: 36, borderRadius: 9, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer",
                  fontFamily: FONT, opacity: saving ? 0.7 : 1,
                }}>
                {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
                {activeTemplateId ? "Simpan Perubahan" : "Simpan Template"}
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={onSaveTemplateAs} disabled={saving}
                  style={{ flex: 1, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.mid, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  Simpan Sbg Baru
                </button>
                <button onClick={onNewTemplate}
                  style={{ flex: 1, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.mid, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  Kosongkan
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 720px) {
          .rpv-tpl-body { flex-direction: column !important; }
        }
      `}</style>
    </div>
  );
}

function ScanLinkPopup({ code, onClose }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/marta/photobooth/scan/${code}` : `/marta/photobooth/scan/${code}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard tdk tersedia - biarkan, link tetap kelihatan di popup */ }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(6,6,8,0.6)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.hi, display: "flex", alignItems: "center", gap: 8 }}>
            <ScanQrGlyph size={16} color={MAGA} strokeWidth={1.8} /> Link HP Scanner
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 9, border: "none", background: "rgba(255,255,255,0.08)", color: t.hi, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: t.mid, lineHeight: 1.6, marginBottom: 14 }}>
          Buka link ini di HP yang mau dijadikan scanner QR Photo ID. Di HP,
          pilih dulu operator device mana yang mau dipasangkan sebelum scan.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 11, border: `1px solid ${t.line}`, background: t.fieldBg, marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 11.5, color: t.hi, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link}</div>
        </div>
        <button onClick={copyLink}
          style={{ width: "100%", height: 44, borderRadius: 12, border: "none", background: copied ? "#16A34A" : `linear-gradient(135deg,${VIO},${MAGA})`, color: "#fff", fontFamily: FONT, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
          {copied ? <><Check size={15} /> Tersalin</> : <><Copy size={15} /> Salin Link</>}
        </button>
      </div>
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
      if (!s?.code) throw new Error("Gagal membuat sesi.");
      setTitle("");
      await refreshSessions();
      setActiveCode(s.code);
    } catch (e) {
      alert(e.message || "Gagal membuat sesi.");
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

