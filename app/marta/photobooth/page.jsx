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
import { AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, Download, FolderOpen, ImageOff, ImagePlus, Loader2, Monitor, Move, Plus, Send, Settings, Sparkles, Trash2, UploadCloud, RefreshCw, X, ArrowLeft, Upload } from "lucide-react";
import { addRpvPrompt, createRpvSession, deleteRpvPrompt, deleteRpvSession, getRpvSession, listRpvPhotos, listRpvPrompts, listRpvSessions, rpvPublicUrl, subscribeRpvPhotos, uploadRpvAiResult, uploadRpvPromptImage } from "../../../lib/rpv";

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

const DIR_DB_NAME = "rpv-dirhandle-db";
const DIR_STORE_NAME = "handles";
const DIR_STORE_KEY = "rpv-connect-folder";

function idbOpenDirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DIR_DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(DIR_STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSaveDirHandle(handle) {
  const db = await idbOpenDirDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DIR_STORE_NAME, "readwrite");
    tx.objectStore(DIR_STORE_NAME).put(handle, DIR_STORE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbLoadDirHandle() {
  const db = await idbOpenDirDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(DIR_STORE_NAME, "readonly");
    const req = tx.objectStore(DIR_STORE_NAME).get(DIR_STORE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbClearDirHandle() {
  try {
    const db = await idbOpenDirDb();
    await new Promise((resolve) => {
      const tx = db.transaction(DIR_STORE_NAME, "readwrite");
      tx.objectStore(DIR_STORE_NAME).delete(DIR_STORE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

function siteOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export default function RpvControlRoom() {
  const router = useRouter();
  const unsubRef = useRef(null);
  const dropRef = useRef(null);
  const fileRef = useRef(null);
  const dirPollRef = useRef(null);

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
  const [selectedCode, setSelectedCode] = useState(""); // foto kamera yg lagi di-preview kiri-atas

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

  // Urut naik (lama->baru) khusus navigasi geser kiri/kanan preview -
  // konsisten & bisa diprediksi, terlepas urutan realtime masuknya.
  const camPhotosAsc = useMemo(
    () => [...camPhotos].sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at)),
    [camPhotos]
  );
  const previewIndex = camPhotosAsc.findIndex((p) => p.photo_code === selectedCode);
  const previewPhoto = previewIndex >= 0 ? camPhotosAsc[previewIndex] : null;
  const goPrev = () => { if (previewIndex > 0) setSelectedCode(camPhotosAsc[previewIndex - 1].photo_code); };
  const goNext = () => { if (previewIndex >= 0 && previewIndex < camPhotosAsc.length - 1) setSelectedCode(camPhotosAsc[previewIndex + 1].photo_code); };

  // ── Panel kanan-atas: Connect to Folder ─────────────────────────────────
  // Handle folder-nya disimpan permanen di IndexedDB (idbSaveDirHandle),
  // jadi TIDAK perlu showDirectoryPicker lagi tiap buka halaman - begitu
  // folder pernah di-connect sekali, kunjungan berikutnya otomatis coba
  // pulihkan lewat idbLoadDirHandle() + queryPermission() di useEffect
  // bawah. Kalau browser masih nyimpan izinnya ("granted") -> langsung
  // kebuka tanpa dialog apapun. Kalau browser minta konfirmasi ulang
  // ("prompt" - ini keputusan browser sendiri, biasanya krn sesi/browser
  // baru dibuka lagi, BUKAN sesuatu yg bisa kita lewati dari kode), UI
  // menampilkan tombol "Lanjutkan Akses Folder" (dirNeedsPermission) yg
  // cukup 1x klik - TIDAK perlu pilih folder dari awal lagi.
  const [dirSupported] = useState(() => typeof window !== "undefined" && "showDirectoryPicker" in window);
  const [dirHandle, setDirHandle] = useState(null);
  const [dirName, setDirName] = useState("");
  const [dirFiles, setDirFiles] = useState([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirUploadingName, setDirUploadingName] = useState("");
  const [dirUploadedNames, setDirUploadedNames] = useState(() => new Set());
  const [dirNeedsPermission, setDirNeedsPermission] = useState(false); // handle tersimpan, tinggal 1x klik lanjut
  const [dirRestoring, setDirRestoring] = useState(() => typeof window !== "undefined" && "showDirectoryPicker" in window); // lagi coba pulihkan folder tersimpan saat mount (langsung false kalau browser tdk support)

  const readDirFiles = useCallback(async (handle) => {
    const items = [];
    for await (const entry of handle.values()) {
      if (entry.kind !== "file" || !IMG_EXT.test(entry.name)) continue;
      try {
        const file = await entry.getFile();
        items.push({ name: entry.name, url: URL.createObjectURL(file), lastModified: file.lastModified, file });
      } catch { /* file mungkin lagi ditulis/terkunci - lewati */ }
    }
    items.sort((a, b) => b.lastModified - a.lastModified);
    return items.slice(0, 40);
  }, []);

  const activateDirHandle = useCallback(async (handle) => {
    setDirHandle(handle);
    setDirName(handle.name);
    setDirNeedsPermission(false);
    setDirLoading(true);
    try { setDirFiles(await readDirFiles(handle)); } finally { setDirLoading(false); }
  }, [readDirFiles]);

  // Coba pulihkan folder yg pernah di-connect sebelumnya, sekali saat
  // komponen pertama kali mount.
  useEffect(() => {
    if (!dirSupported) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await idbLoadDirHandle();
        if (!saved) return;
        const perm = await saved.queryPermission({ mode: "read" });
        if (perm === "granted") {
          await activateDirHandle(saved);
        } else if (perm === "prompt") {
          // Izin masih "nempel" tapi browser mau konfirmasi ulang - simpan
          // handle-nya, tampilkan tombol 1x klik (bukan showDirectoryPicker).
          setDirHandle(saved);
          setDirName(saved.name);
          setDirNeedsPermission(true);
        } else {
          await idbClearDirHandle();
        }
      } catch { /* handle korup/expired - biarkan user connect ulang */ }
      finally { if (!cancelled) setDirRestoring(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectFolder = async () => {
    if (!dirSupported) return;
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      await idbSaveDirHandle(handle);
      await activateDirHandle(handle);
    } catch { /* user batal - diamkan */ }
  };

  // "Putuskan folder" - lupakan folder tersimpan (mis. ganti ke folder lain).
  const forgetDirFolder = async () => {
    clearInterval(dirPollRef.current);
    await idbClearDirHandle();
    setDirHandle(null); setDirName(""); setDirFiles([]); setDirNeedsPermission(false);
  };

  // Tombol "Lanjutkan Akses Folder" - 1x klik, TIDAK buka dialog pilih
  // folder lagi, cuma minta browser mengonfirmasi izin folder yg SAMA persis
  // yg tersimpan.
  const continueDirAccess = async () => {
    if (!dirHandle) return;
    try {
      const perm = await dirHandle.requestPermission({ mode: "read" });
      if (perm === "granted") await activateDirHandle(dirHandle);
      else setDirNeedsPermission(true);
    } catch { /* diamkan */ }
  };

  const refreshDir = useCallback(async () => {
    if (!dirHandle || dirNeedsPermission) return;
    setDirLoading(true);
    try { setDirFiles(await readDirFiles(dirHandle)); } finally { setDirLoading(false); }
  }, [dirHandle, dirNeedsPermission, readDirFiles]);

  useEffect(() => {
    if (!dirHandle || dirNeedsPermission) { clearInterval(dirPollRef.current); return; }
    dirPollRef.current = setInterval(refreshDir, 4000);
    return () => clearInterval(dirPollRef.current);
  }, [dirHandle, dirNeedsPermission, refreshDir]);

  const uploadFromDir = async (item) => {
    if (dirUploadingName || !activeCode) return;
    setDirUploadingName(item.name);
    try {
      await uploadRpvAiResult(activeCode, null, item.file);
      setDirUploadedNames((prev) => new Set(prev).add(item.name));
    } catch { /* biarkan operator coba lagi manual */ }
    finally { setDirUploadingName(""); }
  };

  // ── Panel kanan-bawah: drag & drop upload hasil Gemini ──────────────────
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (files) => {
    if (!files.length || !activeCode) return;
    setUploading(true);
    for (const file of files) {
      try { await uploadRpvAiResult(activeCode, null, file); } catch { /* lanjut file berikutnya */ }
    }
    setUploading(false);
  };
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    uploadFiles(Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/")));
  };
  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    uploadFiles(files);
  };

  // ── Panel kiri-bawah: template/prompt sesi aktif ────────────────────────
  // Sekarang klik 1 kartu template = LANGSUNG copy teks prompt-nya (tanpa
  // perlu "pilih dulu lalu tekan tombol copy" - status per-kartu dianimasikan
  // (lihat className "rpv-tpl-card"/"rpv-tpl-copied" di <style> global bawah
  // halaman). Gambarnya sendiri (foto tamu yg dipreview di kiri-atas) TIDAK
  // lagi lewat clipboard - dibuat draggable, tinggal diseret langsung ke tab
  // Gemini (lihat quadrant "Preview Foto Kamera").
  const [prompts, setPrompts] = useState([]);
  const [promptsState, setPromptsState] = useState("idle");
  const [copied, setCopied] = useState(""); // key prompt yg baru saja di-copy

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

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1500);
    }).catch(() => {});
  };

  // Klik kartu template -> langsung salin teks prompt-nya (instan, tanpa
  // langkah pilih-dulu). Kunci status per-kartu = id prompt itu sendiri.
  const copyPromptText = (p) => copy(p.prompt_text || "", p.id);

  // Drag foto preview LANGSUNG jadi FILE gambar sungguhan saat di-drop (persis
  // spt drag dari Finder/File Explorer ke app lain) - bukan cuma link/teks.
  // Trik "DownloadURL" (fitur khusus Chrome/Chromium/Edge): browser sendiri
  // yg mengunduh resource dari URL saat di-drop & menyerahkannya sbg File ke
  // target, jadi TIDAK butuh fetch()/CORS dari JS kita. Format datanya:
  // "mime:namafile:url". Ini jugalah cara file dari Google Images / halaman
  // web lain bisa di-drag ke app native/tab lain sbg file, bukan cuma teks.
  // Fallback text/uri-list & text/plain disertakan utk browser lain (Firefox
  // dll) yg tidak mendukung DownloadURL - minimal URL-nya tetap ikut ke-drop.
  const handlePhotoDragStart = (e, photo) => {
    if (!photo?.url) return;
    const ext = (photo.storage_path || photo.photo_code || "").split(".").pop();
    const safeExt = ext && ext.length <= 4 && /^[a-zA-Z0-9]+$/.test(ext) ? ext.toLowerCase() : "jpg";
    const mime = safeExt === "png" ? "image/png" : safeExt === "webp" ? "image/webp" : "image/jpeg";
    const filename = `${photo.photo_code || "foto"}.${safeExt}`;
    try {
      e.dataTransfer.setData("DownloadURL", `${mime}:${filename}:${photo.url}`);
      e.dataTransfer.setData("text/uri-list", photo.url);
      e.dataTransfer.setData("text/plain", photo.url);
      e.dataTransfer.effectAllowed = "copy";
    } catch { /* browser tdk dukung salah satu tipe - biarkan drag native default jalan */ }
  };

  const [downloadedKey, setDownloadedKey] = useState("");
  const downloadPhoto = async (photo) => {
    if (!photo?.url) return;
    try {
      const resp = await fetch(photo.url);
      const blob = await resp.blob();
      const ext = (photo.storage_path || photo.photo_code || "").split(".").pop();
      const safeExt = ext && ext.length <= 4 && /^[a-zA-Z0-9]+$/.test(ext) ? ext.toLowerCase() : "jpg";
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${photo.photo_code || "foto"}.${safeExt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      setDownloadedKey(photo.photo_code);
      setTimeout(() => setDownloadedKey((k) => (k === photo.photo_code ? "" : k)), 2600);
    } catch { /* biarkan - user bisa klik lagi */ }
  };

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

      {/* Grid kerja 2x2 */}
      {activeCode && (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }} className="rpv-room-grid">
          {/* Kiri-atas: preview foto kamera - geser manual, TIDAK auto pindah */}
          <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}`, background: "#000" }}>
            <div style={{ padding: "8px 12px", background: t.card, borderBottom: `1px solid ${t.lineSoft}`, display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <Camera size={13} color={RED} />
              <span style={{ fontSize: 11.5, fontWeight: 800, color: t.hi }}>Preview Foto Kamera</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: t.lo, fontWeight: 700, fontFamily: "monospace" }}>
                {camPhotosAsc.length > 0 ? `${previewIndex + 1}/${camPhotosAsc.length}` : "0/0"}
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {sessionState === "loading" && <Loader2 size={22} color={t.lo} style={{ animation: "spin .8s linear infinite" }} />}
              {sessionState === "ready" && !previewPhoto && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: t.lo }}>
                  <ImageOff size={22} />
                  <span style={{ fontSize: 11.5 }}>Belum ada foto tamu masuk</span>
                </div>
              )}
              {previewPhoto && (
                <div className="rpv-drag-photo-wrap" style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", display: "flex" }}>
                  <img src={previewPhoto.url} alt="" draggable="true" title="Geser (drag) foto ini ke tab Gemini"
                    className="rpv-drag-photo"
                    onDragStart={(e) => handlePhotoDragStart(e, previewPhoto)}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "grab" }} />
                  <button onClick={() => downloadPhoto(previewPhoto)} title="Download foto ini (lalu drag dari Downloads ke Gemini, spt drag dari Finder)"
                    className="rpv-download-btn"
                    style={{ position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, border: "none", background: downloadedKey === previewPhoto.photo_code ? "#16A34A" : "rgba(0,0,0,0.68)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", color: "#fff", cursor: "pointer", fontFamily: FONT }}>
                    {downloadedKey === previewPhoto.photo_code
                      ? <Check size={12} />
                      : <Download size={12} className="rpv-drag-hint-icon" />}
                    <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {downloadedKey === previewPhoto.photo_code ? "Tersimpan — drag dari Downloads" : "Download foto (lalu drag ke Gemini)"}
                    </span>
                  </button>
                </div>
              )}
              {camPhotosAsc.length > 1 && (
                <>
                  <button onClick={goPrev} disabled={previewIndex <= 0} title="Foto sebelumnya"
                    style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: 999, border: "none", background: "rgba(0,0,0,0.5)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: previewIndex <= 0 ? "default" : "pointer", opacity: previewIndex <= 0 ? 0.3 : 1 }}>
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={goNext} disabled={previewIndex >= camPhotosAsc.length - 1} title="Foto berikutnya"
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: 999, border: "none", background: "rgba(0,0,0,0.5)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: previewIndex >= camPhotosAsc.length - 1 ? "default" : "pointer", opacity: previewIndex >= camPhotosAsc.length - 1 ? 0.3 : 1 }}>
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Kanan-atas: Connect to Folder - handle-nya persisten (IndexedDB),
              jadi setelah connect sekali, kunjungan berikutnya otomatis coba
              nyambung lagi tanpa showDirectoryPicker (lihat useEffect restore
              di atas + fungsi activateDirHandle/continueDirAccess). */}
          <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", borderBottom: `1px solid ${t.line}`, background: t.card }}>
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${t.lineSoft}`, display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <FolderOpen size={13} color={VIO} />
              <span style={{ fontSize: 11.5, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dirName ? `Folder: ${dirName}` : "Connect to Folder"}</span>
              {dirHandle && !dirNeedsPermission && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <button onClick={refreshDir} title="Refresh" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    {dirLoading ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <RefreshCw size={12} />}
                  </button>
                  <button onClick={forgetDirFolder} title="Putuskan folder ini" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
              {!dirSupported && (
                <div style={{ fontSize: 11, color: "#F5C542", background: "rgba(245,197,66,0.1)", border: "1px solid rgba(245,197,66,0.3)", borderRadius: 10, padding: "9px 11px", lineHeight: 1.5 }}>
                  Browser/perangkat ini belum mendukung &ldquo;Connect to Folder&rdquo; (perlu Chrome/Edge di desktop — belum didukung di HP) — pakai panel drag &amp; drop di bawah.
                </div>
              )}
              {dirSupported && dirRestoring && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.lo, padding: "8px 0" }}>
                  <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> Memulihkan folder tersimpan…
                </div>
              )}
              {dirSupported && !dirRestoring && dirNeedsPermission && (
                <button onClick={continueDirAccess}
                  style={{ width: "100%", height: 96, borderRadius: 13, border: `1.5px dashed #F5C54266`, background: "rgba(245,197,66,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", fontFamily: FONT }}>
                  <FolderOpen size={20} color="#F5C542" />
                  <span style={{ fontSize: 12, fontWeight: 800, color: t.hi }}>Lanjutkan Akses Folder</span>
                  <span style={{ fontSize: 10, color: t.lo, textAlign: "center", padding: "0 10px" }}>&ldquo;{dirName}&rdquo; sudah pernah terhubung — 1x klik utk lanjut (tanpa pilih folder lagi)</span>
                </button>
              )}
              {dirSupported && !dirRestoring && !dirNeedsPermission && !dirHandle && (
                <button onClick={connectFolder}
                  style={{ width: "100%", height: 96, borderRadius: 13, border: `1.5px dashed ${VIO}66`, background: "rgba(124,58,237,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", fontFamily: FONT }}>
                  <FolderOpen size={20} color={VIO} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: t.hi }}>Pilih Folder Download</span>
                  <span style={{ fontSize: 10, color: t.lo, textAlign: "center", padding: "0 10px" }}>Folder tempat hasil download Gemini tersimpan — cukup 1x, tersimpan otomatis</span>
                </button>
              )}
              {dirHandle && !dirNeedsPermission && dirFiles.length === 0 && !dirLoading && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "22px 0", color: t.lo }}>
                  <ImageOff size={18} />
                  <span style={{ fontSize: 11 }}>Belum ada gambar di folder ini</span>
                </div>
              )}
              {dirHandle && !dirNeedsPermission && dirFiles.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))", gap: 7 }}>
                  {dirFiles.map((f) => {
                    const done = dirUploadedNames.has(f.name);
                    return (
                      <div key={f.name} style={{ position: "relative", borderRadius: 9, overflow: "hidden", aspectRatio: "1/1", background: "#000", border: `1px solid ${t.lineSoft}` }}>
                        <img src={f.url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <button onClick={() => uploadFromDir(f)} disabled={!!dirUploadingName || done} title={done ? "Sudah diupload" : `Upload ${f.name}`}
                          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: done ? "default" : "pointer",
                            background: done ? "rgba(21,128,61,0.45)" : dirUploadingName === f.name ? "rgba(124,58,237,0.55)" : "rgba(0,0,0,0.32)" }}>
                          {dirUploadingName === f.name ? <Loader2 size={16} color="#fff" style={{ animation: "spin .8s linear infinite" }} /> : done ? <Check size={16} color="#fff" /> : <Send size={14} color="#fff" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Kiri-bawah: template/prompt sesi aktif - klik 1 kartu = LANGSUNG
              copy teks prompt-nya (instan, dgn animasi status per-kartu),
              hover thumbnail = zoom halus. Teks prompt lengkap cuma bisa
              dilihat/diubah lewat "+ Kelola". Gambarnya (foto tamu di kiri-
              atas) diseret manual ke tab Gemini - lihat quadrant sebelah. */}
          <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${t.line}`, background: t.card }}>
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${t.lineSoft}`, display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <Sparkles size={13} color={MAGA} />
              <span style={{ fontSize: 11.5, fontWeight: 800, color: t.hi }}>Template Prompt</span>
              <span style={{ fontSize: 9.5, color: t.lo, fontWeight: 600 }}>· klik = copy teks</span>
              <button onClick={() => { setSettingsTab("prompt"); setSettingsOpen(true); }} title="Kelola prompt"
                style={{ marginLeft: "auto", fontSize: 10.5, color: "#E29BDC", fontWeight: 700, background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT }}>
                + Kelola
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
              {promptsState === "loading" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.lo, padding: "8px 0" }}>
                  <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> Memuat template…
                </div>
              )}
              {promptsState === "ready" && prompts.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "22px 0", color: t.lo }}>
                  <Sparkles size={18} />
                  <span style={{ fontSize: 11 }}>Belum ada template — tambah lewat Settings</span>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 9 }}>
                {prompts.map((p) => {
                  const justCopied = copied === p.id;
                  return (
                    <button key={p.id} onClick={() => copyPromptText(p)} title={`Copy prompt: ${p.label}`}
                      className="rpv-tpl-card"
                      style={{ position: "relative", aspectRatio: "1/1", borderRadius: 14, overflow: "hidden", cursor: "pointer", padding: 0,
                        border: `2px solid ${justCopied ? "#16A34A" : "transparent"}`,
                        background: t.fieldBg }}>
                      <span className="rpv-tpl-thumb" style={{ position: "absolute", inset: 0, display: "block" }}>
                        {p.promptImageUrl ? (
                          <img src={p.promptImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: t.lo }}>
                            <Sparkles size={18} />
                          </div>
                        )}
                      </span>
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.72) 100%)", pointerEvents: "none" }} />
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "5px 6px", textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#fff", lineHeight: 1.25, textShadow: "0 1px 3px rgba(0,0,0,0.6)", pointerEvents: "none" }}>
                        {p.label}
                      </div>
                      {/* Overlay status copy - fade+scale in saat baru diklik */}
                      <div className={justCopied ? "rpv-tpl-copied-overlay rpv-tpl-copied-overlay--on" : "rpv-tpl-copied-overlay"}
                        style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(22,163,74,0.82)", pointerEvents: "none" }}>
                        <span className="rpv-tpl-copied-badge" style={{ display: "flex", alignItems: "center", gap: 5, color: "#fff", fontSize: 11, fontWeight: 800 }}>
                          <Check size={16} /> Tersalin
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Kanan-bawah: drag & drop hasil Gemini - INI YG TAMPIL DI MODE TV */}
          <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", background: t.card }}>
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${t.lineSoft}`, display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <UploadCloud size={13} color={MAGA} />
              <span style={{ fontSize: 11.5, fontWeight: 800, color: t.hi }}>Upload Hasil Gemini</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: t.lo, fontWeight: 700 }}>{aiPhotos.length} hasil · tampil di Mode TV</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />
              <div ref={dropRef}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{ height: 64, borderRadius: 12, border: `1.5px dashed ${dragOver ? MAGA : `${MAGA}66`}`, background: dragOver ? "rgba(198,22,141,0.16)" : "rgba(198,22,141,0.08)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: uploading ? "not-allowed" : "pointer" }}>
                {uploading ? <Loader2 size={16} color="#E29BDC" style={{ animation: "spin .8s linear infinite" }} /> : <UploadCloud size={16} color="#E29BDC" />}
                <span style={{ fontSize: 11.5, fontWeight: 800, color: "#E29BDC" }}>{uploading ? "Mengunggah…" : "Seret file hasil Gemini ke sini, atau klik"}</span>
              </div>

              {aiPhotos.length > 0 ? (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))", gap: 7 }}>
                  {aiPhotos.map((p) => (
                    <div key={p.photo_code} style={{ position: "relative", borderRadius: 9, overflow: "hidden", aspectRatio: "1/1", background: "#000" }}>
                      <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", top: 4, left: 4, display: "flex", alignItems: "center", gap: 3, fontSize: 8, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg,${VIO},${MAGA})`, borderRadius: 999, padding: "2px 6px" }}>
                        <Sparkles size={7} /> AI
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "22px 0", color: t.lo }}>
                  <ImageOff size={18} />
                  <span style={{ fontSize: 11 }}>Belum ada hasil Gemini diunggah</span>
                </div>
              )}
            </div>
          </div>
        </div>
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

        /* ── Mobile (HP) - overhaul tampilan ─────────────────────────────
           1) Grid kerja 2x2 jadi 1 kolom (scroll vertikal per-quadrant).
           2) Header menyusut & tidak overflow: label teks disembunyikan,
              tinggal ikon; divider disembunyikan.
           3) Semua <input>/<textarea> dipaksa font-size 16px supaya iOS
              Safari TIDAK auto-zoom saat difokus (bug klasik mobile web).
           4) Tombol2 penting diperbesar sedikit biar nyaman disentuh jari
              (target sentuh minimal ~40px, standar aksesibilitas mobile). */
        @media (max-width: 860px) {
          .rpv-room-grid { grid-template-columns: 1fr !important; grid-template-rows: repeat(4, minmax(280px,1fr)) !important; overflow-y: auto; }
          .rpv-header { padding: 8px 10px !important; gap: 6px !important; }
          .rpv-header-back-label { display: none; }
          .rpv-header-divider { display: none; }
          .rpv-header-summary { max-width: 40vw !important; font-size: 11.5px !important; }
          .rpv-header-viewer-label { display: none; }
          input, textarea, select { font-size: 16px !important; }
          .rpv-tpl-card:hover { transform: none; box-shadow: none; }
          .rpv-tpl-card:hover .rpv-tpl-thumb img { transform: none; }
        }
        @media (max-width: 480px) {
          .rpv-header-summary { max-width: 32vw !important; }
        }

        /* Kartu Template Prompt: hover = thumbnail zoom halus, klik = pop
           kecil biar berasa "ngeklik", overlay hijau "Tersalin" fade+scale in. */
        .rpv-tpl-card { transition: transform .18s ease, box-shadow .18s ease; }
        .rpv-tpl-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.28); }
        .rpv-tpl-card:active { transform: translateY(0) scale(0.97); }
        .rpv-tpl-thumb img { transition: transform .35s cubic-bezier(.22,1,.36,1); }
        .rpv-tpl-card:hover .rpv-tpl-thumb img { transform: scale(1.12); }
        .rpv-tpl-copied-overlay { opacity: 0; transform: scale(0.85); transition: opacity .2s ease, transform .2s cubic-bezier(.34,1.56,.64,1); }
        .rpv-tpl-copied-overlay--on { opacity: 1; transform: scale(1); animation: rpv-tpl-flash .55s ease; }
        @keyframes rpv-tpl-flash { 0%{opacity:0;transform:scale(0.7)} 55%{opacity:1;transform:scale(1.08)} 100%{opacity:1;transform:scale(1)} }
        .rpv-tpl-copied-badge { animation: rpv-tpl-badge-pop .4s cubic-bezier(.34,1.56,.64,1); }
        @keyframes rpv-tpl-badge-pop { 0%{transform:scale(0.5);opacity:0} 100%{transform:scale(1);opacity:1} }

        /* Foto preview kamera: draggable ke tab Gemini - kasih affordance
           visual (grab cursor + badge hint yg pulse halus) & sedikit zoom
           saat mulai di-drag supaya kerasa "kepegang". */
        .rpv-drag-photo:active { cursor: grabbing; }
        .rpv-drag-photo-wrap:hover .rpv-drag-photo { transform: scale(1.015); transition: transform .25s ease; }
        .rpv-drag-hint { animation: rpv-drag-hint-pulse 2.4s ease-in-out infinite; }
        @keyframes rpv-drag-hint-pulse { 0%,100%{ transform: translateX(-50%) translateY(0); } 50%{ transform: translateX(-50%) translateY(-3px); } }
        .rpv-drag-hint-icon { animation: rpv-drag-hint-wiggle 1.6s ease-in-out infinite; }
        @keyframes rpv-drag-hint-wiggle { 0%,100%{ transform: translateX(0); } 50%{ transform: translateX(2px); } }
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
