"use client";
/**
 * /marta/photobooth — panel OPERATOR (bikin & kelola sesi Photobooth).
 * Publik tanpa login SandraHub, dibuka dari kartu "Realtime Photo Viewer"
 * di /marta/login atau dari /martahub.
 *
 * Prompt Gemini SEKARANG BISA LEBIH DARI SATU per sesi ("bisa menambahkan
 * beberapa prompt") - dipindah dari 1 kolom teks di rpv_sessions ke tabel
 * rpv_session_prompts sendiri (lihat lib/rpv.js: listRpvPrompts/addRpvPrompt/
 * deleteRpvPrompt). Tiap sesi bisa punya beberapa varian prompt (mis. "Gaya
 * Neon", "Gaya Retro") - masing2 dgn label, teks & gambar referensi sendiri,
 * masing2 punya tombol Copy Prompt sendiri.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, Camera, Check, ChevronDown, ChevronUp, Copy, ImagePlus, Loader2, Monitor, Plus, Sparkles, Trash2, Upload, ArrowLeft, Images, X, Smartphone, Wifi, LayoutDashboard, ChevronRight } from "lucide-react";
import { addRpvPrompt, createRpvSession, deleteRpvPrompt, deleteRpvSession, listRpvPrompts, listRpvSessions, uploadRpvPromptImage } from "../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";

const t = {
  bg: "#F4F4F6", card: "#FFFFFF", line: "#E4E2EA",
  hi: "#17181C", mid: "#5A5A68", lo: "#8A8A96", fieldBg: "#FAFAFB",
};

function siteOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export default function RpvPhotoboothHome() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [copied, setCopied] = useState("");
  const [promptsOpenFor, setPromptsOpenFor] = useState(""); // code sesi yg panel prompt-nya lagi terbuka
  const [promptsByCode, setPromptsByCode] = useState({}); // { [code]: { state: "loading"|"ready", items: [] } }
  const [deleteTarget, setDeleteTarget] = useState(null); // sesi yg lagi diproses hapus (buka modal konfirmasi)

  // Cache instan dari localStorage (sesi buatan device ini) - dibaca lewat
  // lazy initializer (bukan di dalam effect) supaya list tidak kosong/kedip
  // sebelum RPC selesai, lalu langsung ditimpa hasil RPC (sumber kebenaran,
  // sinkron lintas device) begitu datang lewat refreshSessions() di bawah.
  const [sessions, setSessions] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const cached = JSON.parse(window.localStorage.getItem("rpv-sessions") || "[]");
      return Array.isArray(cached) ? cached : [];
    } catch { return []; }
  });

  // TIDAK setLoadingList(true) di baris pertama (sinkron) - effect di
  // bawah memanggil fungsi ini langsung, & aturan react-hooks/set-state-in-
  // effect melarang setState sinkron sebelum `await` pertama di dalam
  // fungsi yg dipanggil dari badan effect. setLoadingList(true) dipanggil
  // manual di titik panggil non-effect (handleCreate) saja.
  const refreshSessions = useCallback(async () => {
    try {
      const rows = await listRpvSessions(50);
      setSessions(rows);
      setLoadingList(false);
      try { localStorage.setItem("rpv-sessions", JSON.stringify(rows.slice(0, 20))); } catch { /* best-effort */ }
    } catch { setLoadingList(false); /* biarkan cache lama tetap tampil kalau RPC gagal */ }
  }, []);

  useEffect(() => { (async () => { await refreshSessions(); })(); }, [refreshSessions]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const s = await createRpvSession(title);
      if (!s?.code) throw new Error("Gagal membuat sesi photobooth.");
      setTitle("");
      await refreshSessions();
      setPromptsOpenFor(s.code); // langsung buka panel prompt sesi baru, memudahkan lgsg isi
    } catch (e) {
      alert(e.message || "Gagal membuat sesi photobooth.");
    } finally { setCreating(false); }
  };

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1400);
    }).catch(() => {});
  };

  const loadPrompts = useCallback(async (code) => {
    setPromptsByCode((m) => ({ ...m, [code]: { state: "loading", items: m[code]?.items || [] } }));
    try {
      const items = await listRpvPrompts(code);
      setPromptsByCode((m) => ({ ...m, [code]: { state: "ready", items } }));
    } catch {
      setPromptsByCode((m) => ({ ...m, [code]: { state: "error", items: [] } }));
    }
  }, []);

  const togglePrompts = (code) => {
    const next = promptsOpenFor === code ? "" : code;
    setPromptsOpenFor(next);
    if (next && !promptsByCode[next]) loadPrompts(next);
  };

  const handleDeleted = async (code) => {
    setDeleteTarget(null);
    setSessions((prev) => prev.filter((s) => s.code !== code));
    await refreshSessions();
  };

  return (
    <div style={{ minHeight: "100svh", background: t.bg, fontFamily: FONT }}>
      <div style={{ padding: "22px 18px 100px", maxWidth: 560, margin: "0 auto" }}>
        <button onClick={() => router.push("/martahub")} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: t.mid, fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: "pointer", padding: "4px 0 14px" }}>
          <ArrowLeft size={15} /> MartaHub
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 46, height: 46, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", boxShadow: `0 8px 20px -6px ${RED}66` }}>
            <Camera size={21} />
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.hi, letterSpacing: "-0.01em" }}>Realtime Photo Viewer</div>
            <div style={{ fontSize: 12, color: t.lo, marginTop: 2 }}>Photobooth dgn upload dari galeri, layar viewer realtime, beberapa prompt Gemini & cetak per-ID</div>
          </div>
        </div>

        {/* Fork mode DI PALING ATAS - "pisahkan dari awal agar tidak
            bingung": begitu halaman ini dibuka, langsung jelas ada 2 jalur
            beda - Mode Kamera (buat TAMU, di HP, installable sbg PWA
            sendiri lewat layout.jsx) vs Panel Operator (buat PANITIA, bikin
            & kelola sesi - konten di bawah fork ini). Sebelumnya form
            "Buat Sesi Baru" langsung muncul begitu halaman dibuka, jadi
            siapapun yg mampir (termasuk tamu yg salah buka link) bingung
            ini halaman apa. */}
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={() => router.push("/marta/photobooth/go")}
            style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 16, border: `1px solid ${t.line}`, background: t.card, cursor: "pointer", fontFamily: FONT }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff" }}>
              <Smartphone size={17} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Mode Kamera</div>
              <div style={{ fontSize: 10.5, color: t.lo, marginTop: 2, lineHeight: 1.4 }}>Ambil &amp; upload foto dari HP tamu</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 800, color: "#15803D", background: "#EAF9EF", borderRadius: 999, padding: "3px 8px", alignSelf: "flex-start" }}>
              <Wifi size={9} /> PWA Ready
            </span>
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 16, border: `1.5px solid ${RED}33`, background: "#FFF7F7", fontFamily: FONT }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: "#111116", color: "#fff" }}>
              <LayoutDashboard size={17} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Panel Operator</div>
              <div style={{ fontSize: 10.5, color: t.lo, marginTop: 2, lineHeight: 1.4 }}>Kelola sesi, prompt &amp; hasil Gemini di bawah ini</div>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, color: RED }}>
              Sedang dibuka <ChevronRight size={12} />
            </span>
          </div>
        </div>

        {/* Buat sesi baru - prompt ditambahkan SETELAH sesi dibuat, lewat
            panel "Prompt" tiap kartu (bisa lebih dari satu). */}
        <div style={{ marginTop: 18, background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, padding: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: t.hi, marginBottom: 10 }}>Buat Sesi Baru</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} placeholder="Nama sesi (mis. Grand Launching 5G Medan)"
            style={{ width: "100%", height: 44, borderRadius: 11, border: `1px solid ${t.line}`, background: t.fieldBg, padding: "0 13px", fontSize: 13.5, fontFamily: FONT, color: t.hi, boxSizing: "border-box" }} />
          <button onClick={handleCreate} disabled={creating}
            style={{ marginTop: 12, width: "100%", height: 46, borderRadius: 12, border: "none", cursor: creating ? "not-allowed" : "pointer", fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(135deg,${RED},${MAGA})`, opacity: creating ? 0.7 : 1 }}>
            {creating ? <Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> : <Plus size={15} />} Buat Sesi
          </button>
        </div>

        {/* Daftar sesi - sinkron lintas device lewat RPC */}
        <div style={{ marginTop: 26, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: t.hi }}>Sesi Photobooth</div>
          {loadingList && <Loader2 size={13} color={t.lo} style={{ animation: "spin .8s linear infinite" }} />}
        </div>

        {!loadingList && sessions.length === 0 && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: t.lo, textAlign: "center", padding: "20px 0" }}>Belum ada sesi dibuat.</div>
        )}

        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map((s) => (
            <motion.div key={s.code} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: t.lo, marginTop: 2, fontFamily: "monospace", letterSpacing: "0.05em" }}>KODE SESI: {s.code} · {s.photo_count ?? 0} foto</div>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button onClick={() => copy(`${siteOrigin()}/marta/photobooth/go/${s.code}`, `u-${s.code}`)} style={btnGhost}>
                  <Upload size={13} /> {copied === `u-${s.code}` ? "Tersalin!" : "Link Upload"}
                </button>
                <button onClick={() => window.open(`/marta/photobooth/viewer/${s.code}`, "_blank")} style={btnGhost}>
                  <Monitor size={13} /> Buka Viewer
                </button>
                <button onClick={() => window.open(`/marta/photobooth/upload/${s.code}/gallery`, "_blank")} title="Galeri foto ASLI dari kamera tamu" style={btnGhost}>
                  <Images size={13} /> Galeri Kamera
                </button>
                <button onClick={() => window.open(`/marta/photobooth/upload/${s.code}/gemini`, "_blank")} title="Upload hasil edit Gemini ke Viewer"
                  style={{ ...btnGhost, borderColor: "#DDCBFA", color: "#7C3AED", background: "#F5EEFE" }}>
                  <Sparkles size={13} /> Upload Hasil Gemini
                </button>
                <button onClick={() => togglePrompts(s.code)} style={{ ...btnGhost, marginLeft: "auto", borderColor: "#F0CCE4", color: MAGA, background: "#FEF4FA" }}>
                  <Sparkles size={13} /> Prompt{promptsByCode[s.code]?.items?.length ? ` (${promptsByCode[s.code].items.length})` : ""}
                  {promptsOpenFor === s.code ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button onClick={() => setDeleteTarget(s)} title="Hapus sesi" style={{ ...btnGhost, borderColor: "#F5C6C6", color: "#C62828", background: "#FDEDED" }}>
                  <Trash2 size={13} /> Hapus
                </button>
              </div>

              {promptsOpenFor === s.code && (
                <PromptsPanel code={s.code} entry={promptsByCode[s.code]} copiedKey={copied} onCopy={copy}
                  onChanged={(items) => setPromptsByCode((m) => ({ ...m, [s.code]: { state: "ready", items } }))} />
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {deleteTarget && (
        <DeleteSessionModal session={deleteTarget} onCancel={() => setDeleteTarget(null)} onDeleted={() => handleDeleted(deleteTarget.code)} />
      )}

      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

/** Modal konfirmasi hapus sesi - DIKUNCI KETAT sesuai permintaan user:
 * tombol Hapus baru aktif kalau operator mengetik ULANG kata "HAPUS" persis
 * (case-sensitive), bukan cuma klik "Ya/Confirm" - supaya tidak ada sesi
 * (+ semua foto & prompt di dalamnya) yg kehapus gara2 tap tidak sengaja. */
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
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,17,22,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 20, padding: 20, fontFamily: FONT, boxShadow: "0 30px 70px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: "#FDEDED", color: "#C62828", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={18} />
            </span>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: t.hi }}>Hapus Sesi?</div>
          </div>
          <button onClick={onCancel} style={{ border: "none", background: "transparent", color: t.lo, cursor: "pointer", padding: 4 }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12.5, color: t.mid, lineHeight: 1.55 }}>
          Sesi <b style={{ color: t.hi }}>&ldquo;{session.title}&rdquo;</b> ({session.code}) beserta <b>semua foto & prompt di dalamnya</b> akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
        </div>

        <div style={{ marginTop: 14, fontSize: 11.5, fontWeight: 700, color: t.hi }}>
          Ketik <span style={{ fontFamily: "monospace", color: "#C62828", letterSpacing: "0.06em" }}>HAPUS</span> untuk konfirmasi:
        </div>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          placeholder="HAPUS" autoFocus
          style={{ marginTop: 6, width: "100%", height: 42, borderRadius: 10, border: `1.5px solid ${canDelete ? "#C62828" : t.line}`, background: t.fieldBg, padding: "0 12px", fontSize: 14, fontFamily: "monospace", letterSpacing: "0.08em", color: t.hi, boxSizing: "border-box" }} />
        {error && <div style={{ marginTop: 8, fontSize: 11.5, color: "#C62828", fontWeight: 600 }}>{error}</div>}

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 42, borderRadius: 11, border: `1px solid ${t.line}`, background: "#fff", color: t.mid, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
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

/** Panel prompt sebuah sesi - list prompt yg sudah ada (tiap punya Copy &
 * Hapus sendiri) + form kecil utk nambah prompt baru (label + teks +
 * gambar referensi opsional), bisa dipakai BERKALI-KALI utk beberapa prompt
 * sekaligus di 1 sesi ("bisa menambahkan beberapa prompt"). */
function PromptsPanel({ code, entry, copiedKey, onCopy, onChanged }) {
  const imgRef = useRef(null);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const items = entry?.items || [];

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
      const row = await addRpvPrompt(code, label || `Prompt ${items.length + 1}`, text, imagePath);
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
    } catch {
      alert("Gagal menghapus prompt.");
    } finally { setDeletingId(""); }
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.line}` }}>
      {entry?.state === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.lo, padding: "6px 0" }}>
          <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> Memuat prompt…
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {items.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: t.fieldBg, border: `1px solid ${t.line}`, borderRadius: 11, padding: "9px 10px" }}>
              {p.promptImageUrl && <img src={p.promptImageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: t.hi }}>{p.label}</div>
                {p.prompt_text && <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.prompt_text}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {p.prompt_text && (
                  <button onClick={() => onCopy(p.prompt_text, `pp-${p.id}`)} title="Copy prompt"
                    style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: copiedKey === `pp-${p.id}` ? "#16A34A" : `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    {copiedKey === `pp-${p.id}` ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
                <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} title="Hapus prompt"
                  style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.line}`, background: "#fff", color: "#C62828", display: "flex", alignItems: "center", justifyContent: "center", cursor: deletingId === p.id ? "not-allowed" : "pointer" }}>
                  {deletingId === p.id ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={12} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Tambah Prompt</div>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (mis. Gaya Neon)"
        style={{ width: "100%", height: 36, borderRadius: 9, border: `1px solid ${t.line}`, background: "#fff", padding: "0 11px", fontSize: 12.5, fontFamily: FONT, color: t.hi, boxSizing: "border-box" }} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Isi prompt Gemini..."
        style={{ width: "100%", marginTop: 6, borderRadius: 9, border: `1px solid ${t.line}`, background: "#fff", padding: "8px 11px", fontSize: 12.5, fontFamily: FONT, color: t.hi, boxSizing: "border-box", resize: "vertical" }} />
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input ref={imgRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: "none" }} />
        <button onClick={() => imgRef.current?.click()} style={{ ...btnGhost, height: 30, fontSize: 11 }}>
          <ImagePlus size={12} /> {file ? "Ganti Gambar" : "Gambar Referensi"}
        </button>
        {preview && <img src={preview} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />}
        <button onClick={handleAdd} disabled={adding || (!text.trim() && !file)}
          style={{ marginLeft: "auto", height: 30, padding: "0 12px", borderRadius: 8, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontWeight: 800, fontSize: 11.5, cursor: adding ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5, opacity: adding || (!text.trim() && !file) ? 0.6 : 1 }}>
          {adding ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <Plus size={12} />} Tambah
        </button>
      </div>
    </div>
  );
}

const btnGhost = {
  display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 9,
  border: "1px solid #E4E2EA", background: "#fff", color: "#5A5A68", fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
