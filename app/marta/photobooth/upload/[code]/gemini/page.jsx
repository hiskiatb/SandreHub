"use client";
/**
 * /marta/photobooth/upload/[code]/gemini — LAYAR OPERATOR (desktop/laptop,
 * dipakai di sebelah tab Gemini) utk alur manual "copy prompt -> paste di
 * Gemini -> download hasil -> upload balik". Dirombak jadi LAYAR TERBAGI
 * biar semuanya kelihatan sekaligus tanpa gonta-ganti halaman:
 *
 *   ┌─────────────────────┬─────────────────────┐
 *   │ Connect to Folder    │ Drag Files to Upload │   <- 50% atas, 2 kolom
 *   │ (isi folder Download  │ + hasil Gemini yg    │
 *   │  otomatis Gemini)      │  sudah masuk          │
 *   ├─────────────────────┴─────────────────────┤
 *   │      Thumbnail SEMUA foto kamera di sesi ini        │   <- 50% bawah
 *   └───────────────────────────────────────────┘
 *
 * "Connect to Folder" pakai File System Access API (showDirectoryPicker) -
 * operator pilih folder Download-nya SEKALI, lalu isinya (foto2 hasil
 * Gemini yg baru didownload) otomatis kebaca & tinggal diklik "Upload" per
 * foto (tanpa perlu drag manual). Ini CUMA didukung Chrome/Edge desktop -
 * browser lain dikasih tahu & tetap bisa pakai drag & drop di panel kanan.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Camera, Check, FolderOpen, ImageOff, Loader2, Monitor, RefreshCw, Send, Sparkles, UploadCloud } from "lucide-react";
import { getRpvSession, listRpvPhotos, subscribeRpvPhotos, rpvPublicUrl, uploadRpvAiResult } from "../../../../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const MAGA = "#C6168D";
const VIO = "#7C3AED";
const RED = "#ED1C24";
const INK = "#111116";
const LINE = "#E4E2EA";
const SUB = "#8A8A96";
const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;

export default function RpvGeminiUploadPage() {
  const params = useParams();
  const code = (params?.code || "").toString().toUpperCase();
  const unsubRef = useRef(null);
  const dropRef = useRef(null);
  const fileRef = useRef(null);
  const dirPollRef = useRef(null);

  const [state, setState] = useState("loading");
  const [session, setSession] = useState(null);
  const [camPhotos, setCamPhotos] = useState([]); // foto ASLI kamera (bukan hasil AI) - strip bawah
  const [aiPhotos, setAiPhotos] = useState([]); // hasil Gemini yg sudah masuk - panel kanan atas

  // Panel kiri atas - folder Download yg di-connect
  const [dirSupported] = useState(() => typeof window !== "undefined" && "showDirectoryPicker" in window);
  const [dirHandle, setDirHandle] = useState(null);
  const [dirName, setDirName] = useState("");
  const [dirFiles, setDirFiles] = useState([]); // [{ name, url, lastModified }]
  const [dirLoading, setDirLoading] = useState(false);
  const [dirUploadingName, setDirUploadingName] = useState("");
  const [dirUploadedNames, setDirUploadedNames] = useState(() => new Set());

  // Panel kanan atas - drag & drop
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await getRpvSession(code);
        if (!s || !s.is_active) { setState("notfound"); return; }
        setSession(s);
        const all = await listRpvPhotos(code);
        setCamPhotos(all.filter((p) => !p.is_ai_result));
        setAiPhotos(all.filter((p) => p.is_ai_result));
        setState("ready");
        unsubRef.current = subscribeRpvPhotos(s.id, (row) => {
          const photoCode = row.photo_code ?? row.code;
          const item = { photo_code: photoCode, storage_path: row.storage_path, uploaded_at: row.uploaded_at, is_ai_result: row.is_ai_result, url: rpvPublicUrl(row.storage_path) };
          if (row.is_ai_result) setAiPhotos((prev) => (prev.some((p) => p.photo_code === photoCode) ? prev : [item, ...prev]));
          else setCamPhotos((prev) => (prev.some((p) => p.photo_code === photoCode) ? prev : [item, ...prev]));
        }, { sessionCode: code });
      } catch { setState("notfound"); }
    })();
    return () => unsubRef.current?.();
  }, [code]);

  // ── Panel kiri atas: Connect to Folder ─────────────────────────────────
  const readDirFiles = useCallback(async (handle) => {
    const items = [];
    for await (const entry of handle.values()) {
      if (entry.kind !== "file" || !IMG_EXT.test(entry.name)) continue;
      try {
        const file = await entry.getFile();
        items.push({ name: entry.name, url: URL.createObjectURL(file), lastModified: file.lastModified, file });
      } catch { /* file mungkin lagi ditulis/terkunci - lewati, coba lagi tick berikutnya */ }
    }
    items.sort((a, b) => b.lastModified - a.lastModified);
    return items.slice(0, 40); // cukup 40 terbaru, biar ringan
  }, []);

  const connectFolder = async () => {
    if (!dirSupported) return;
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      setDirHandle(handle);
      setDirName(handle.name);
      setDirLoading(true);
      setDirFiles(await readDirFiles(handle));
      setDirLoading(false);
    } catch { /* user batal pilih folder - diamkan */ }
  };

  const refreshDir = useCallback(async () => {
    if (!dirHandle) return;
    setDirLoading(true);
    try { setDirFiles(await readDirFiles(dirHandle)); } finally { setDirLoading(false); }
  }, [dirHandle, readDirFiles]);

  // Browser TIDAK punya "file watcher" native - jadi begitu folder ter-
  // connect, list isinya di-refresh polling tiap 4 detik supaya foto BARU
  // hasil download Gemini otomatis kelihatan tanpa operator klik Refresh
  // manual tiap kali.
  useEffect(() => {
    if (!dirHandle) { clearInterval(dirPollRef.current); return; }
    dirPollRef.current = setInterval(refreshDir, 4000);
    return () => clearInterval(dirPollRef.current);
  }, [dirHandle, refreshDir]);

  const uploadFromDir = async (item) => {
    if (dirUploadingName) return;
    setDirUploadingName(item.name);
    try {
      await uploadRpvAiResult(code, null, item.file);
      setDirUploadedNames((prev) => new Set(prev).add(item.name));
    } catch {
      setError(`Gagal upload "${item.name}".`);
    } finally { setDirUploadingName(""); }
  };

  // ── Panel kanan atas: drag & drop / pilih file manual ──────────────────
  const uploadFiles = async (files) => {
    if (!files.length) return;
    setUploading(true); setError("");
    let ok = 0;
    for (const file of files) {
      try { await uploadRpvAiResult(code, null, file); ok += 1; } catch { /* lanjut ke file berikutnya */ }
    }
    if (ok < files.length) setError(`${files.length - ok} dari ${files.length} file gagal diunggah.`);
    setUploading(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/")));
  };
  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    uploadFiles(files);
  };

  if (state === "loading") return <Center><Loader2 size={26} color={VIO} style={{ animation: "spin 1s linear infinite" }} /></Center>;
  if (state === "notfound") return <Center><AlertTriangle size={28} color={VIO} /><div style={{ marginTop: 10, fontWeight: 700 }}>Sesi tidak ditemukan</div></Center>;

  return (
    <div style={{ height: "100svh", background: "#F4F4F6", fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header tipis - judul sesi + Mode TV (langsung buka Viewer dgn
          ?tv=1, tampilkan slideshow hasil Gemini di layar besar). */}
      <div style={{ padding: "10px 16px", background: "#fff", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Link href={`/marta/photobooth/upload/${code}/gallery`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: SUB, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
          <ArrowLeft size={14} /> Galeri Kamera
        </Link>
        <div style={{ width: 1, height: 18, background: LINE, flexShrink: 0 }} />
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 800, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <Sparkles size={14} color={VIO} /> {session?.title} · Hasil Gemini
        </span>
        <button onClick={() => window.open(`/marta/photobooth/viewer/${code}?tv=1`, "_blank")}
          style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px", borderRadius: 10, border: "none", background: "#111116", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
          <Monitor size={14} /> Buka Mode TV
        </button>
      </div>

      {error && (
        <div style={{ padding: "8px 16px", background: "#FDEDED", color: "#C62828", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{error}</div>
      )}

      {/* Baris atas - 2 kolom, tinggi 50% sisa layar */}
      <div style={{ flex: "1 1 50%", minHeight: 0, display: "flex", borderBottom: `1px solid ${LINE}` }}>
        {/* Kiri atas: Connect to Folder */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${LINE}`, background: "#fff" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <FolderOpen size={15} color={VIO} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{dirName ? `Folder: ${dirName}` : "Connect to Folder"}</span>
            {dirHandle && (
              <button onClick={refreshDir} title="Refresh"
                style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: 8, border: `1px solid ${LINE}`, background: "#fff", color: SUB, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {dirLoading ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <RefreshCw size={13} />}
              </button>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
            {!dirSupported && (
              <div style={{ fontSize: 11.5, color: "#B45309", background: "#FEF6E7", border: "1px solid #F5D9A0", borderRadius: 10, padding: "10px 12px", lineHeight: 1.5 }}>
                Browser ini belum mendukung &ldquo;Connect to Folder&rdquo; (perlu Chrome/Edge desktop). Pakai panel drag &amp; drop di sebelah kanan sbg gantinya.
              </div>
            )}
            {dirSupported && !dirHandle && (
              <button onClick={connectFolder}
                style={{ width: "100%", height: 110, borderRadius: 14, border: `1.5px dashed ${VIO}55`, background: "#F7F4FB", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontFamily: FONT }}>
                <FolderOpen size={22} color={VIO} />
                <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Pilih Folder Download</span>
                <span style={{ fontSize: 10.5, color: SUB, textAlign: "center", padding: "0 10px" }}>Folder tempat hasil download Gemini tersimpan</span>
              </button>
            )}
            {dirHandle && dirFiles.length === 0 && !dirLoading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "30px 0", color: SUB }}>
                <ImageOff size={22} />
                <span style={{ fontSize: 11.5 }}>Belum ada gambar di folder ini</span>
              </div>
            )}
            {dirHandle && dirFiles.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                {dirFiles.map((f) => {
                  const done = dirUploadedNames.has(f.name);
                  return (
                    <div key={f.name} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "1/1", background: "#E4E2EA", border: `1px solid ${LINE}` }}>
                      <img src={f.url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <button onClick={() => uploadFromDir(f)} disabled={!!dirUploadingName || done} title={done ? "Sudah diupload" : `Upload ${f.name}`}
                        style={{
                          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          border: "none", cursor: done ? "default" : "pointer",
                          background: done ? "rgba(21,128,61,0.35)" : dirUploadingName === f.name ? "rgba(124,58,237,0.5)" : "rgba(17,17,22,0.28)",
                          opacity: done ? 1 : undefined,
                        }}>
                        {dirUploadingName === f.name ? <Loader2 size={18} color="#fff" style={{ animation: "spin .8s linear infinite" }} />
                          : done ? <Check size={18} color="#fff" />
                          : <Send size={16} color="#fff" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Kanan atas: Drag Files to Upload + hasil Gemini yg sudah masuk */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#fff" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <UploadCloud size={15} color={MAGA} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Drag Files to Upload</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: SUB, fontWeight: 700 }}>{aiPhotos.length} hasil Gemini</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />
            <div ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                height: 74, borderRadius: 12, border: `1.5px dashed ${dragOver ? MAGA : `${MAGA}55`}`,
                background: dragOver ? "#FCE9F5" : "#FEF4FA", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                cursor: uploading ? "not-allowed" : "pointer",
              }}>
              {uploading ? <Loader2 size={17} color={MAGA} style={{ animation: "spin .8s linear infinite" }} /> : <UploadCloud size={17} color={MAGA} />}
              <span style={{ fontSize: 12, fontWeight: 800, color: MAGA }}>{uploading ? "Mengunggah…" : "Seret file ke sini atau klik"}</span>
            </div>

            {aiPhotos.length > 0 ? (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                {aiPhotos.map((p) => (
                  <div key={p.photo_code} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "1/1", background: "#E4E2EA" }}>
                    <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <div style={{ position: "absolute", top: 4, left: 4, display: "flex", alignItems: "center", gap: 3, fontSize: 8.5, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg,${VIO},${MAGA})`, borderRadius: 999, padding: "2px 6px" }}>
                      <Sparkles size={8} /> AI
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "26px 0", color: SUB }}>
                <ImageOff size={20} />
                <span style={{ fontSize: 11.5 }}>Belum ada hasil Gemini diunggah</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Baris bawah - strip thumbnail SEMUA foto kamera di sesi ini, full width */}
      <div style={{ flex: "1 1 50%", minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Camera size={15} color={RED} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Foto dari Kamera Tamu</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: SUB, fontWeight: 700 }}>{camPhotos.length} foto · tahan &amp; seret ke Gemini</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
          {camPhotos.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "26px 0", color: SUB }}>
              <Camera size={20} />
              <span style={{ fontSize: 11.5 }}>Belum ada foto tamu masuk</span>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
              {camPhotos.map((p) => (
                <div key={p.photo_code} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "1/1", background: "#E4E2EA" }}>
                  <img src={p.url} alt="" draggable style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}"}</style>
    </div>
  );
}

function Center({ children }) {
  return <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F7F4FB", fontFamily: FONT }}>{children}<style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style></div>;
}
