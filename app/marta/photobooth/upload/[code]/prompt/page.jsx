"use client";
/**
 * /marta/photobooth/upload/[code]/prompt — halaman PUBLIK (tanpa login),
 * SEKARANG jadi PINTU MASUK UTAMA tamu (bukan lagi menu kamera manual -
 * lihat perubahan start_url PWA & redirect /go/[code]) - jadi didesain
 * ulang total ("masih kurang profesional... redesign total gaya darkmode
 * profesional rapi"): tema gelap penuh senada dgn Ruang Kontrol operator
 * (bukan lagi kartu putih di atas app dark), TANPA tombol kembali di
 * header (halaman ini akar/home, tidak ada "atasnya" utk dikembalikan),
 * dan pakai SPLASH boot penuh-layar bergaya sama dgn `MartaSplash` di
 * app/martahub/m/_shared/MobileShell.jsx (logo icon PWA Photobooth +
 * animasi spring-in/breathe/shimmer + bar loading) selagi sesi & daftar
 * prompt dimuat - relevan krn halaman ini yg bakal di-install sbg PWA.
 *
 * Alur (tak berubah, cuma tampilannya):
 *   1. Pilih 1 template -> teks prompt-nya langsung tersalin.
 *   2. Pindah ke app Gemini di HP-nya SENDIRI - foto & generate di sana.
 *   3. Download hasilnya ke galeri HP.
 *   4. Balik ke sini, tekan "Upload Gambar Gemini Anda" -> pilih hasil
 *      Gemini dari galeri -> diunggah ke sesi ini.
 *   5. Begitu SUKSES masuk database, tampil layar sukses dgn QR code +
 *      "Photo ID" (nomor antrian 5 digit, unik per sesi).
 * "Kelola Template Prompt" (tombol gerigi di header) tetap ada - tamu/
 * operator bisa tambah/edit/hapus template langsung dari HP.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  AlertTriangle, Check, Clock, Download, ImagePlus, LogOut, Loader2,
  Pencil, Plus, QrCode, Settings2, Sparkles, Ticket, Trash2, X,
} from "lucide-react";
import { addRpvPrompt, deleteRpvPrompt, getRpvSession, listRpvPhotos, listRpvPrompts, rpvPublicUrl, subscribeRpvPhotos, updateRpvPrompt, uploadRpvGeminiResult, uploadRpvPromptImage } from "../../../../../../lib/rpv";
import { PhotoboothPwaHead, usePhotoboothServiceWorker } from "../../../_pwa";

function fmtHistoryTime(ms) {
  try {
    return new Date(ms).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const VIO = "#7C3AED";

// ── Tema gelap - senada dgn palet Ruang Kontrol operator (app/marta/
// photobooth/page.jsx > `t`), supaya identitas visual Photobooth konsisten
// di HP tamu MAUPUN panel operator, bukan lagi kartu terang di app gelap. ──
const BG = "#0A0A0B";
const CARD = "#1A1B1D";
const CARD_HI = "#212226";
const LINE = "rgba(255,255,255,0.09)";
const LINE_SOFT = "rgba(255,255,255,0.06)";
const FIELD = "#111213";
const INK = "#F1F1F3";
const MID = "#B4B4BC";
const SUB = "#84848C";

const PAGE_LEAVE_MS = 260; // durasi fade-out sblm pindah halaman (mis. "Keluar dari sesi ini") - transisi antar halaman tidak lagi loncat mendadak

export default function RpvPromptUploadPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();
  const fileRef = useRef(null);
  usePhotoboothServiceWorker();

  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [session, setSession] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [copiedId, setCopiedId] = useState("");
  const [manageOpen, setManageOpen] = useState(false); // sheet "Kelola Prompt" - tamu/operator bisa tambah & edit template lgs dr HP
  const [leaving, setLeaving] = useState(false); // fade-out halaman sblm keluar dari sesi
  // "Riwayat Upload" - permintaan user: tampilkan SEMUA foto yg sudah
  // diupload di sesi ini oleh SEMUA tamu/device (bukan cuma device sendiri),
  // spy bisa munculin lagi QR-nya - diambil live dr DB (listRpvPhotos +
  // subscribeRpvPhotos), sama pola dgn halaman Galeri/kamera.
  const [uploadHistory, setUploadHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyUnsubRef = useRef(null);

  const exitSession = () => {
    if (leaving) return;
    setManageOpen(false);
    setLeaving(true);
    setTimeout(() => router.push("/marta/photobooth/go"), PAGE_LEAVE_MS);
  };

  // upload: idle | uploading | done | error
  const [upload, setUpload] = useState({ phase: "idle", progress: 0, error: "", result: null });
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await getRpvSession(code);
        if (!s || !s.is_active) { setState("notfound"); return; }
        setSession(s);
        const p = await listRpvPrompts(code).catch(() => []);
        setPrompts(p);
        setState("ready");
        try {
          setUploadHistory(await listRpvPhotos(code));
        } catch { /* diamkan */ }
        historyUnsubRef.current = subscribeRpvPhotos(s.id, (row) => {
          const photoCode = row.photo_code ?? row.code;
          const queueLabel = row.queue_no != null ? String(row.queue_no).padStart(5, "0") : null;
          setUploadHistory((prev) => (prev.some((x) => x.photo_code === photoCode)
            ? prev
            : [{ photo_code: photoCode, storage_path: row.storage_path, url: rpvPublicUrl(row.storage_path), uploaded_at: row.uploaded_at, queue_label: queueLabel, is_ai_result: row.is_ai_result }, ...prev]));
        }, { sessionCode: code });
      } catch { setState("notfound"); }
    })();
    return () => historyUnsubRef.current?.();
  }, [code]);

  // Begitu berhasil upload, generate QR code (isi = Photo ID 5-digit saja,
  // BUKAN url) - supaya mode Scanner operator tinggal decode teks digitnya
  // langsung tanpa parsing URL, & petugas juga bisa baca angkanya manual
  // kalau scanner tidak dipakai. Warna QR disesuaikan tema gelap (kotak
  // putih, modul gelap - QR TETAP kontras tinggi & mudah discan meski
  // ditampilkan di atas background gelap).
  useEffect(() => {
    if (upload.phase !== "done" || !upload.result?.queueLabel) return;
    let alive = true;
    // QR ANGKA (Photo ID polos, BUKAN url) - ini yg dipindai operator di
    // /marta/photobooth/scan/[code] (deteksi jsQR-nya strip semua non-digit,
    // jadi HARUS tetap teks digit murni, tidak boleh dicampur url).
    QRCode.toDataURL(upload.result.queueLabel, { margin: 1, width: 280, color: { dark: "#111116", light: "#FFFFFF" } })
      .then((url) => { if (alive) setQrUrl(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [upload.phase, upload.result]);

  const copyPromptText = async (p) => {
    const text = p.prompt_text || "";
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(p.id);
      setTimeout(() => setCopiedId((c) => (c === p.id ? "" : c)), 1500);
    } catch { /* clipboard bisa ditolak browser - diamkan, tamu tinggal ketik manual */ }
  };

  const onPickGeminiFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    startUpload(file);
  };

  const startUpload = async (file) => {
    setUpload({ phase: "uploading", progress: 0.02, error: "", result: null });
    try {
      const result = await uploadRpvGeminiResult(code, file, (p) => {
        setUpload((u) => ({ ...u, progress: p }));
      });
      setUpload({ phase: "done", progress: 1, error: "", result });
    } catch (e) {
      setUpload({ phase: "error", progress: 0, error: e.message || "Gagal mengunggah foto.", result: null });
    }
  };

  const resetUpload = () => setUpload({ phase: "idle", progress: 0, error: "", result: null });

  if (state === "loading") {
    return <RpvPhotoboothSplash />;
  }
  if (state === "notfound") {
    return (
      <Center>
        <span style={{ width: 58, height: 58, borderRadius: 18, background: "rgba(237,28,36,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AlertTriangle size={26} color={RED} />
        </span>
        <div style={{ marginTop: 16, fontSize: 15.5, fontWeight: 800, color: INK }}>Sesi tidak ditemukan</div>
        <div style={{ marginTop: 5, fontSize: 12.5, color: SUB, textAlign: "center", maxWidth: 280, lineHeight: 1.55 }}>Link ini sudah tidak berlaku atau sesi belum aktif.</div>
      </Center>
    );
  }

  if (upload.phase === "done" && upload.result) {
    return (
      <GeminiUploadSuccessScreen
        result={upload.result}
        qrUrl={qrUrl}
        onUploadMore={resetUpload}
      />
    );
  }

  return (
    <div className={leaving ? "rpv-m-page rpv-m-page--leaving flashprint-root" : "rpv-m-page flashprint-root"} style={{ height: "100svh", background: BG, fontFamily: FONT, display: "flex", flexDirection: "column", colorScheme: "dark", position: "relative", overflowY: "auto" }}>
      <PhotoboothPwaHead />
      <div className="rpv-m-ambient" aria-hidden="true">
        <div className="rpv-m-ambient-blob rpv-m-ambient-blob--a" />
        <div className="rpv-m-ambient-blob rpv-m-ambient-blob--b" />
        <div className="rpv-m-ambient-dots" />
      </div>
      {/* Header - TANPA tombol kembali: halaman ini akar/pintu masuk utama
          tamu (start_url PWA & redirect /go/[code] mendarat di sini), jadi
          tidak ada "layar sebelumnya" yg relevan utk dikembalikan. */}
      <div style={{ padding: "10px 16px", background: CARD, borderBottom: `1px solid ${LINE}`, position: "sticky", top: 0, zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 40, height: 40, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${VIO},${MAGA})`, flexShrink: 0, boxShadow: `0 8px 20px -6px ${VIO}66`, overflow: "hidden" }}>
            <img src="/photobooth/icon-192.png" alt="FlashPrint" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{session?.title}</div>
          </div>
          <button onClick={() => setHistoryOpen(true)} title="Riwayat Upload"
            style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, background: FIELD, border: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center", color: MID, cursor: "pointer", position: "relative" }}>
            <Clock size={16} />
            {uploadHistory.length > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 999, background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {uploadHistory.length > 99 ? "99+" : uploadHistory.length}
              </span>
            )}
          </button>
          <button onClick={() => setManageOpen(true)} title="Kelola Prompt"
            style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, background: FIELD, border: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center", color: MID, cursor: "pointer" }}>
            <Settings2 size={16} />
          </button>
        </div>
      </div>
      {historyOpen && (
        <UploadHistoryPanel history={uploadHistory} onClose={() => setHistoryOpen(false)} />
      )}

      <div style={{ flex: 1, minHeight: 0, padding: "10px 14px 12px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box", position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
        {/* Langkah 1 - pilih template, klik = langsung copy teks prompt.
            FIX (permintaan user - "kepotong, harusnya ukurannya menyesuaikan
            tinggi layar sehingga tidak perlu scroll"): sebelumnya thumbnail
            dipaksa persegi (aspectRatio 1/1) dgn tinggi TETAP tanpa peduli
            sisa ruang layar, jadi kalau totalnya lebih tinggi dari layar ya
            kepotong/harus scroll. Sekarang bagian grid ini dibuat flex:1 +
            minHeight:0 (ngambil PERSIS sisa tinggi layar stlh header/step2/
            step3), dan grid pakai gridTemplateRows (bukan aspect-ratio)
            supaya barisnya ikut menyusut/melebar otomatis sesuai tinggi
            layar sungguhan - thumbnail selalu utuh kelihatan, TIDAK kepotong,
            TANPA perlu scroll, di layar berapa pun tingginya. */}
        <div style={{ flexShrink: 0 }}>
          <SectionLabel n={1} text="Pilih Template & Salin Prompt" hint="Ketuk salah satu, teksnya langsung tersalin" />
        </div>

        {prompts.length === 0 ? (
          <div style={{ padding: "26px 14px", borderRadius: 16, background: CARD, border: `1.5px dashed ${LINE}`, textAlign: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: SUB, fontWeight: 600 }}>Belum ada template prompt di sesi ini.</span>
          </div>
        ) : (
          <div style={{
            flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
            gridTemplateRows: `repeat(${Math.ceil(prompts.length / 2)}, 1fr)`, gap: 8,
          }}>
            {prompts.map((p) => {
              const justCopied = copiedId === p.id;
              return (
                <button key={p.id} onClick={() => copyPromptText(p)}
                  className="rpv-m-tpl-card"
                  style={{ display: "flex", flexDirection: "column", minHeight: 0, border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: FONT, textAlign: "left" }}>
                  <div className="rpv-m-tpl-thumb" style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, borderRadius: 16, overflow: "hidden", background: CARD_HI, border: `1px solid ${LINE}` }}>
                    {p.promptImageUrl ? (
                      <img src={p.promptImageUrl} alt={p.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: SUB }}><Sparkles size={18} /></div>
                    )}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0) 50%,rgba(0,0,0,0.78) 100%)" }} />
                    <div style={{ position: "absolute", left: 6, right: 6, bottom: 6, fontSize: 10, fontWeight: 800, color: "#fff", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.label}
                    </div>
                    <div className={justCopied ? "rpv-m-tpl-copied rpv-m-tpl-copied--on" : "rpv-m-tpl-copied"}>
                      <span className="rpv-m-tpl-copied-ring">
                        <Check size={18} color="#fff" strokeWidth={3.2} />
                      </span>
                      <span className="rpv-m-tpl-copied-label">Tersalin!</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Langkah 2 - instruksi singkat ke Gemini */}
        <div style={{ flexShrink: 0, marginTop: 10, padding: "8px 12px", borderRadius: 14, background: `${VIO}14`, border: `1px solid ${VIO}3D`, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, background: VIO, color: "#fff", fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>2</span>
          <div style={{ fontSize: 10.5, color: "#D5C7EE", lineHeight: 1.45, fontWeight: 600 }}>
            Buka app <b style={{ color: "#fff" }}>Gemini</b> di HP kamu, <b style={{ color: "#fff" }}>ambil/upload foto</b> langsung di sana, lalu tempel (paste) prompt yang tadi tersalin untuk generate, dan <b style={{ color: "#fff" }}>download hasilnya</b> ke galeri HP.
          </div>
        </div>

        {/* Langkah 3 - upload hasil Gemini */}
        <div style={{ flexShrink: 0 }}>
          <SectionLabel n={3} text="Upload Gambar Gemini Anda" hint="Pilih hasil Gemini dari galeri HP kamu" style={{ marginTop: 10, marginBottom: 8 }} />
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickGeminiFile} style={{ display: "none" }} />

        {upload.phase === "idle" && (
          // Tombol PRIMARY sesungguhnya - ini alur utama halaman (bukan
          // sekadar opsi tambahan), jadi TIDAK pakai kartu dashed/glow spt
          // sebelumnya (itu kesannya opsional/sekunder). Sekarang solid
          // penuh warna brand, teks putih kontras, TANPA box-shadow/glow
          // sama sekali (permintaan user - "highlight sempurna tanpa efek
          // glow, seperti primary key").
          <button onClick={() => fileRef.current?.click()} className="rpv-m-upload-zone"
            style={{
              width: "100%", borderRadius: 14, cursor: "pointer", fontFamily: FONT,
              background: `linear-gradient(135deg,${RED},${MAGA})`, border: "none", boxShadow: "none",
              padding: "14px 14px", boxSizing: "border-box",
              display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
            }}>
            <ImagePlus size={16} color="#fff" style={{ flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Upload Gambar Gemini Anda</span>
              <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.82)", fontWeight: 600 }}>Ketuk untuk buka galeri HP kamu</span>
            </div>
          </button>
        )}

        {upload.phase === "uploading" && (
          <div style={{ flexShrink: 0, width: "100%", padding: "18px 16px", boxSizing: "border-box", borderRadius: 16, background: `linear-gradient(180deg, ${CARD_HI} 0%, ${CARD} 100%)`, border: `1.5px solid ${LINE}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <Loader2 size={24} color={MAGA} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: MID }}>Mengunggah… {Math.round(upload.progress * 100)}%</span>
            <div style={{ width: "70%", height: 5, borderRadius: 99, background: FIELD, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, width: `${upload.progress * 100}%`, background: `linear-gradient(90deg,${RED},${MAGA})`, transition: "width .2s ease" }} />
            </div>
          </div>
        )}

        {upload.phase === "error" && (
          <div style={{ flexShrink: 0, width: "100%", borderRadius: 16, background: "rgba(198,40,40,0.12)", border: "1.5px solid rgba(198,40,40,0.4)", padding: "14px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, textAlign: "center" }}>
            <AlertTriangle size={22} color="#FF8A8F" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#FF8A8F" }}>{upload.error}</span>
            <button onClick={resetUpload}
              style={{ height: 38, padding: "0 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}>
              Coba Lagi
            </button>
          </div>
        )}
      </div>

      {manageOpen && (
        <RpvPromptManagerSheet
          code={code}
          prompts={prompts}
          onClose={() => setManageOpen(false)}
          onChanged={(next) => setPrompts(next)}
          onExitSession={exitSession}
        />
      )}
      <style>{`
        @keyframes rpv-m-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes rpv-m-fade-out { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes rpv-m-ambient-drift-a {
          0%, 100% { transform: translate(-14%, 10%) scale(1); }
          50%       { transform: translate(12%, -8%) scale(1.28); }
        }
        @keyframes rpv-m-ambient-drift-b {
          0%, 100% { transform: translate(16%, 8%) scale(1.15); }
          50%       { transform: translate(-12%, -10%) scale(0.88); }
        }
        @keyframes rpv-m-ambient-pulse {
          0%, 100% { opacity: 0.62; }
          50%       { opacity: 0.92; }
        }
        .rpv-m-page { animation: rpv-m-fade-in .45s ease both; }
        .rpv-m-page--leaving { animation: rpv-m-fade-out ${PAGE_LEAVE_MS}ms ease both; }
        .rpv-m-ambient {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
          animation: rpv-m-fade-in 1.1s ease both .1s;
          /* Mask satu lapisan utk SELURUH ambient (blob + dots) supaya
             memudar mulus ke atas - bukan lagi dipotong tegas oleh tinggi
             box tetap (yg kelihatan sbg garis kotak keras di layar lebar/
             desktop, "tidak responsive"). */
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
          mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
        }
        .rpv-m-ambient-blob {
          position: absolute; border-radius: 50%; filter: blur(min(48px, 8vw));
          width: min(70vw, 560px); aspect-ratio: 1;
        }
        .rpv-m-ambient-blob--a {
          left: 4%; bottom: -18%; background: radial-gradient(circle, ${MAGA}52 0%, transparent 68%);
          animation: rpv-m-ambient-drift-a 11s ease-in-out infinite, rpv-m-ambient-pulse 6s ease-in-out infinite;
        }
        .rpv-m-ambient-blob--b {
          right: 0%; bottom: -22%; width: min(62vw, 500px); background: radial-gradient(circle, ${VIO}46 0%, transparent 68%);
          animation: rpv-m-ambient-drift-b 13s ease-in-out infinite, rpv-m-ambient-pulse 7.5s ease-in-out infinite 1.3s;
        }
        .rpv-m-ambient-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(${MAGA}80 1px, transparent 1.6px);
          background-size: 22px 22px;
          animation: rpv-m-ambient-pulse 4s ease-in-out infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { background: ${BG}; }
        .rpv-m-tpl-card { transition: transform .15s ease; }
        .rpv-m-tpl-card:active { transform: scale(0.95); }
        .rpv-m-upload-zone { transition: filter .15s ease, transform .15s ease; box-shadow: none !important; }
        .rpv-m-upload-zone:active { transform: scale(0.985); filter: brightness(0.92); }
        .rpv-m-tpl-copied {
          position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
          background: rgba(10,10,11,0); backdrop-filter: blur(0px); opacity: 0; pointer-events: none;
          transition: opacity .2s ease, background .2s ease;
        }
        .rpv-m-tpl-copied--on {
          opacity: 1; background: rgba(10,10,11,0.62); backdrop-filter: blur(2px);
          animation: rpv-m-copied-in .42s cubic-bezier(.34,1.56,.64,1) both;
        }
        .rpv-m-tpl-copied-ring {
          width: 34px; height: 34px; border-radius: 999px; display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg,#22C55E,#16A34A); box-shadow: 0 0 0 5px rgba(34,197,94,0.22), 0 6px 16px -4px rgba(0,0,0,0.5);
          animation: rpv-m-copied-pop .42s cubic-bezier(.34,1.56,.64,1) .04s both;
        }
        .rpv-m-tpl-copied-label { font-size: 10px; font-weight: 800; color: #fff; letter-spacing: 0.02em; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
        @keyframes rpv-m-copied-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes rpv-m-copied-pop { 0% { transform: scale(0.3); opacity: 0; } 65% { transform: scale(1.14); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

/** Panel "Riwayat Upload" - daftar foto yg sudah diupload di sesi ini oleh
 * SIAPA PUN (semua device), diambil live dr DB - dgn tombol per-foto utk
 * menampilkan lagi QR-nya (dibuat on-demand, bukan sekaligus semua), spy
 * tamu bisa scan ulang & download foto yg sudah pernah diupload. Tema
 * gelap, senada dgn palet halaman ini (BG/CARD/FIELD/LINE). */
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
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, maxHeight: "82svh", background: CARD, border: `1px solid ${LINE}`, borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", fontFamily: FONT }}>
        <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} color={MAGA} />
            <span style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>Riwayat Upload</span>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: FIELD, color: MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
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
                <span style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: FIELD, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
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
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", borderRadius: 9, border: "none", background: openCode === it.photo_code ? FIELD : `linear-gradient(135deg,${RED},${MAGA})`, color: openCode === it.photo_code ? MID : "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
                  <QrCode size={12} /> {openCode === it.photo_code ? "Tutup" : "QR"}
                </button>
              </div>
              {openCode === it.photo_code && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  {qrLoading === it.photo_code && <Loader2 size={20} color={RED} style={{ animation: "spin 1s linear infinite" }} />}
                  {idQrByCode[it.photo_code] && shareQrByCode[it.photo_code] && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
                      {/* QR Photo ID - buat kebutuhan CETAK (dipindai operator di
                          /marta/photobooth/scan/[code], persis pola QR sukses
                          upload), lengkap dgn teks Photo ID di bawahnya. */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <img src={idQrByCode[it.photo_code]} alt={`QR Photo ID ${it.photo_code}`} width={140} height={140} style={{ borderRadius: 10, border: `1px solid ${LINE}` }} />
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: SUB, letterSpacing: "0.06em", textTransform: "uppercase" }}>QR Photo ID (Cetak)</span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, fontFamily: "monospace" }}>{it.queue_label || it.photo_code}</span>
                        <a href={idQrByCode[it.photo_code]} download={`qr-id-${it.photo_code}.png`}
                          style={{ display: "flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 9, border: `1px solid ${LINE}`, color: MID, fontSize: 10.5, fontWeight: 700, textDecoration: "none" }}>
                          <Download size={11} /> Simpan
                        </a>
                      </div>
                      {/* QR Share - buat tamu lain scan & lihat/download/share
                          foto ini sendiri (link ke /marta/photobooth/p/[photoCode]). */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <img src={shareQrByCode[it.photo_code]} alt={`QR share ${it.photo_code}`} width={140} height={140} style={{ borderRadius: 10, border: `1px solid ${LINE}` }} />
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: SUB, letterSpacing: "0.06em", textTransform: "uppercase" }}>QR Share Foto</span>
                        <a href={`/marta/photobooth/p/${it.photo_code}`} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12.5, fontWeight: 800, color: MAGA, textDecoration: "none" }}>
                          Buka Foto
                        </a>
                        <a href={shareQrByCode[it.photo_code]} download={`qr-share-${it.photo_code}.png`}
                          style={{ display: "flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 9, border: `1px solid ${LINE}`, color: MID, fontSize: 10.5, fontWeight: 700, textDecoration: "none" }}>
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

function SectionLabel({ n, text, hint, style }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 11, ...style }}>
      <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 8, background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{text}</div>
        {hint && <div style={{ fontSize: 10.5, color: SUB, fontWeight: 600, marginTop: 1 }}>{hint}</div>}
      </div>
    </div>
  );
}

/** Layar sukses upload hasil Gemini - QR code + Photo ID (nomor antrian 5
 * digit) besar & jelas, supaya tamu tinggal tunjukkan/sebutkan ke petugas
 * cetak, atau petugas scan QR-nya langsung (mode Scanner). Tema gelap,
 * kartu QR tetap PUTIH (kontras scan tetap maksimal). */
// FIX ulang (permintaan user - "seharusnya QR yg muncul setelah selesai
// upload hanya QR utk SHARE saja, lalu setelah di-share akan muncul foto
// tamunya, di situ baru QR yg muncul cuma QR Photo ID saja utk ditunjukkan
// ke operator utk print"): sebelumnya KEDUA qr (Photo ID + Share) tampil
// SEKALIGUS di 1 layar begitu upload selesai, foto tamunya sendiri malah
// tidak pernah ditampilkan. Sekarang jadi 2 TAHAP jelas:
//  1) "share" (tampil PERTAMA) - HANYA QR Share (link ke halaman publik
//     foto), tanpa Photo ID sama sekali, + tombol Share (Web Share API) -
//     begitu tamu bagikan (atau tekan "Lanjut" kalau device tidak support
//     Web Share), baru pindah ke tahap 2.
//  2) "reveal" (tampil SETELAH share) - foto tamunya sendiri ditampilkan
//     besar, DI BAWAHNYA baru muncul QR Photo ID (murni utk ditunjukkan ke
//     petugas operator saat cetak) - tidak ada lagi QR share di tahap ini.
// FIX (permintaan user - "setelah selesai upload harusnya hanya ada QR dan
// tombol kembali ke laman pilih prompt dan upload lagi agar lebih simple"):
// dirombak dari alur 2-tahap (share dulu -> baru reveal foto+Photo ID QR)
// jadi SATU layar simpel: cuma QR Photo ID + 1 tombol kembali ke laman
// pilih template & upload (yg sekaligus artinya "upload lagi", tidak perlu
// 2 tombol Upload Lagi/Selesai terpisah lagi). Tahap share ke sosmed &
// reveal foto DIHAPUS dari layar ini.
function GeminiUploadSuccessScreen({ result, qrUrl, onUploadMore }) {
  return (
    <div className="flashprint-root" style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: BG, fontFamily: FONT }}>
      <div style={{ textAlign: "center", maxWidth: 340, width: "100%" }}>
        <div style={{ position: "relative", width: 86, height: 86, margin: "0 auto" }}>
          <div className="rpv-m-success-pop" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(21,128,61,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="42" height="42" viewBox="0 0 52 52">
              <circle className="rpv-m-success-circle" cx="26" cy="26" r="23" fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" />
              <path className="rpv-m-success-tick" d="M15 27l7.5 7.5L37.5 18" fill="none" stroke="#4ADE80" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div style={{ marginTop: 18, fontSize: 17.5, fontWeight: 800, color: INK }}>Foto Gemini Berhasil Diunggah!</div>
        <div style={{ marginTop: 7, fontSize: 12.5, color: MID, lineHeight: 1.65 }}>
          Tunjukkan atau sebutkan <b style={{ color: INK }}>Photo ID</b> di bawah ini ke petugas untuk mencetak fotomu.
        </div>

        <div style={{ marginTop: 22, padding: 22, borderRadius: 22, background: "#fff" }}>
          {qrUrl ? (
            <img src={qrUrl} alt="QR Photo ID" style={{ width: 184, height: 184, margin: "0 auto", display: "block", borderRadius: 12 }} />
          ) : (
            <div style={{ width: 184, height: 184, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={22} color="#B4B4BC" style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}
          <div style={{ marginTop: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Ticket size={16} color={MAGA} />
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#9A9AA6", letterSpacing: 0.3 }}>PHOTO ID</span>
          </div>
          <div style={{ marginTop: 2, fontSize: 34, fontWeight: 900, color: "#17181C", letterSpacing: "0.08em", fontFamily: "monospace" }}>
            {result.queueLabel}
          </div>
        </div>

        <button onClick={onUploadMore}
          style={{ width: "100%", marginTop: 22, height: 50, borderRadius: 13, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}>
          Kembali &amp; Upload Lagi
        </button>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rpv-m-success-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes rpv-m-success-circle { from { stroke-dasharray: 145; stroke-dashoffset: 145; } to { stroke-dasharray: 145; stroke-dashoffset: 0; } }
        @keyframes rpv-m-success-tick { from { stroke-dasharray: 34; stroke-dashoffset: 34; } to { stroke-dasharray: 34; stroke-dashoffset: 0; } }
        @keyframes rpv-m-stage-fade { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .rpv-m-success-pop { animation: rpv-m-success-pop 0.42s cubic-bezier(.34,1.56,.64,1) both; }
        .rpv-m-success-circle { animation: rpv-m-success-circle 0.55s 0.05s cubic-bezier(.65,0,.35,1) both; }
        .rpv-m-success-tick { animation: rpv-m-success-tick 0.35s 0.5s cubic-bezier(.65,0,.35,1) both; }
        .rpv-m-stage-fade { animation: rpv-m-stage-fade 0.4s cubic-bezier(.4,0,.2,1) both; }
      `}</style>
    </div>
  );
}

/** Sheet "Kelola Prompt" - tamu/operator bisa tambah template BARU atau
 * edit/hapus yg sudah ada, langsung dari HP. Dirombak ulang ("perbaiki lagi
 * tampilan untuk edit prompt dan tambahkan prompt") jadi 2 bagian yg jelas
 * terpisah: daftar template tersimpan (kartu lebih lega, thumbnail lebih
 * besar) di atas, dan form tambah/edit sbg KARTU TERSENDIRI dgn header +
 * label field yg eksplisit di bawahnya - bukan lagi form padat tanpa label
 * yg nyatu sama tombol upload gambar kecil. */
function RpvPromptManagerSheet({ code, prompts, onClose, onChanged, onExitSession }) {
  const [deletingId, setDeletingId] = useState("");
  const [err, setErr] = useState("");
  const [formOpen, setFormOpen] = useState(false); // popup terpisah utk tambah/edit ("pakai pop up saja")
  const [editingPrompt, setEditingPrompt] = useState(null); // null = mode tambah baru, selain itu = objek prompt yg diedit

  const openAdd = () => { setEditingPrompt(null); setFormOpen(true); };
  const openEdit = (p) => { setEditingPrompt(p); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditingPrompt(null); };

  const handleDelete = async (promptId) => {
    if (deletingId) return;
    setDeletingId(promptId);
    try {
      await deleteRpvPrompt(code, promptId);
      onChanged(prompts.filter((p) => p.id !== promptId));
    } catch { setErr("Gagal menghapus prompt."); }
    finally { setDeletingId(""); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "92svh", background: BG, borderRadius: "24px 24px 0 0", display: "flex", flexDirection: "column", overflow: "hidden", border: `1px solid ${LINE}`, borderBottom: "none" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.18)", margin: "10px auto 4px", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 18px 14px", flexShrink: 0, borderBottom: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: `${MAGA}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Settings2 size={15} color={MAGA} />
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Kelola Template Prompt</div>
              <div style={{ fontSize: 10.5, color: SUB, fontWeight: 600, marginTop: 1 }}>{prompts.length} template tersimpan</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: FIELD, color: MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 22px" }}>
          {err && (
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10, background: "rgba(198,40,40,0.14)", border: "1px solid rgba(198,40,40,0.35)" }}>
              <AlertTriangle size={13} color="#FF8A8F" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#FF8A8F", fontWeight: 700 }}>{err}</span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: SUB, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Template Tersimpan
            </div>
            <button onClick={openAdd}
              style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 11.5, fontWeight: 800, padding: "8px 13px", borderRadius: 10, cursor: "pointer", fontFamily: FONT }}>
              <Plus size={13} /> Tambah Template
            </button>
          </div>

          {prompts.length === 0 ? (
            <div style={{ padding: "24px 14px", borderRadius: 16, background: CARD, border: `1.5px dashed ${LINE}`, textAlign: "center" }}>
              <Sparkles size={18} color={SUB} style={{ marginBottom: 6 }} />
              <div style={{ fontSize: 12, color: SUB, fontWeight: 600 }}>Belum ada template - ketuk &ldquo;Tambah Template&rdquo; utk menambahkan.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {prompts.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, background: CARD, border: `1.5px solid ${LINE}`, borderRadius: 14, padding: "10px 12px" }}>
                  {p.promptImageUrl ? (
                    <img src={p.promptImageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 11, flexShrink: 0, background: FIELD, display: "flex", alignItems: "center", justifyContent: "center", color: SUB }}>
                      <Sparkles size={16} />
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</div>
                    {p.prompt_text ? (
                      <div style={{ fontSize: 11, color: SUB, marginTop: 2, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.prompt_text}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: SUB, marginTop: 2, fontStyle: "italic" }}>Belum ada teks prompt</div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(p)} title="Edit"
                      style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${LINE}`, background: "transparent", color: MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} title="Hapus"
                      style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${LINE}`, background: "transparent", color: "#FF8A8F", display: "flex", alignItems: "center", justifyContent: "center", cursor: deletingId === p.id ? "not-allowed" : "pointer" }}>
                      {deletingId === p.id ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${LINE}` }}>
            <button onClick={onExitSession}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, border: `1px solid rgba(198,40,40,0.35)`, background: "rgba(198,40,40,0.1)", color: "#FF8A8F", fontSize: 12.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}>
              <LogOut size={15} />
              Keluar dari Sesi Ini
            </button>
          </div>
        </div>
      </div>

      {formOpen && (
        <RpvPromptFormPopup
          code={code}
          prompts={prompts}
          editingPrompt={editingPrompt}
          onClose={closeForm}
          onChanged={onChanged}
        />
      )}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

/** Popup terpisah utk tambah/edit template - dipisah dari sheet daftar
 * ("untuk tambah template baru dan edit template itu menggunakan pop up
 * saja"), jadi sheet "Kelola Template Prompt" cuma daftar + tombol Tambah,
 * dan form-nya sendiri muncul sbg kartu modal di TENGAH layar (di atas
 * sheet), dgn tombol X utk batal. */
function RpvPromptFormPopup({ code, prompts, editingPrompt, onClose, onChanged }) {
  const imgRef = useRef(null);
  const isEditing = !!editingPrompt;
  const [label, setLabel] = useState(editingPrompt?.label || "");
  const [text, setText] = useState(editingPrompt?.prompt_text || "");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [existingImageUrl, setExistingImageUrl] = useState(editingPrompt?.promptImageUrl || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const thumbUrl = preview || existingImageUrl;

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const removeImage = () => {
    setFile(null); setPreview(""); setExistingImageUrl("");
  };

  const handleSave = async () => {
    if (saving || (!text.trim() && !file && !existingImageUrl)) return;
    setSaving(true); setErr("");
    try {
      let imagePath = null;
      if (file) imagePath = await uploadRpvPromptImage(code, file);
      if (isEditing) {
        const row = await updateRpvPrompt(code, editingPrompt.id, label, text, imagePath);
        if (row) onChanged(prompts.map((p) => (p.id === editingPrompt.id ? row : p)));
      } else {
        const row = await addRpvPrompt(code, label || `Template ${prompts.length + 1}`, text, imagePath);
        if (row) onChanged([...prompts, row]);
      }
      onClose();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan prompt.");
    } finally { setSaving(false); }
  };

  const canSave = !saving && (text.trim() || file || existingImageUrl);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, maxHeight: "88svh", overflowY: "auto", background: BG, border: `1.5px solid ${isEditing ? MAGA : LINE}`, borderRadius: 22, padding: 18, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 30, height: 30, borderRadius: 10, background: isEditing ? `${MAGA}25` : `${RED}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {isEditing ? <Pencil size={14} color={MAGA} /> : <Plus size={15} color={RED} />}
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>{isEditing ? "Edit Template" : "Tambah Template Baru"}</span>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: FIELD, color: MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: SUB, marginBottom: 5 }}>Nama Template</div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="mis. Gaya Neon, Taj Mahal, Colosseum…" autoFocus
          style={{ width: "100%", height: 42, borderRadius: 11, border: `1px solid ${LINE}`, background: FIELD, padding: "0 13px", fontSize: 13.5, fontFamily: FONT, color: INK, boxSizing: "border-box" }} />

        <div style={{ fontSize: 10.5, fontWeight: 700, color: SUB, marginTop: 13, marginBottom: 5 }}>Isi Prompt Gemini</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Tulis instruksi lengkap utk Gemini di sini - mis. latar belakang, pencahayaan, gaya foto…"
          style={{ width: "100%", borderRadius: 11, border: `1px solid ${LINE}`, background: FIELD, padding: "10px 13px", fontSize: 13, lineHeight: 1.55, fontFamily: FONT, color: INK, boxSizing: "border-box", resize: "vertical" }} />

        <div style={{ fontSize: 10.5, fontWeight: 700, color: SUB, marginTop: 13, marginBottom: 5 }}>Gambar Referensi <span style={{ fontWeight: 500, color: SUB, textTransform: "none" }}>(opsional)</span></div>
        <input ref={imgRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: "none" }} />
        {thumbUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: 9, borderRadius: 12, background: FIELD, border: `1px solid ${LINE}` }}>
            <img src={thumbUrl} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1, fontSize: 11, color: MID, fontWeight: 600 }}>
              {file ? file.name : "Gambar tersimpan"}
            </div>
            <button onClick={() => imgRef.current?.click()} title="Ganti gambar"
              style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${LINE}`, background: "transparent", color: MID, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <ImagePlus size={13} />
            </button>
            <button onClick={removeImage} title="Hapus gambar"
              style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${LINE}`, background: "transparent", color: "#FF8A8F", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <button onClick={() => imgRef.current?.click()}
            style={{ width: "100%", height: 58, borderRadius: 12, border: `1.5px dashed ${LINE}`, background: FIELD, color: SUB, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontFamily: FONT }}>
            <ImagePlus size={16} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>Tambah gambar referensi</span>
          </button>
        )}

        {err && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10, background: "rgba(198,40,40,0.14)", border: "1px solid rgba(198,40,40,0.35)" }}>
            <AlertTriangle size={13} color="#FF8A8F" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#FF8A8F", fontWeight: 700 }}>{err}</span>
          </div>
        )}

        <button onClick={handleSave} disabled={!canSave}
          style={{ width: "100%", marginTop: 14, height: 46, borderRadius: 12, border: "none", background: canSave ? `linear-gradient(135deg,${RED},${MAGA})` : FIELD, color: canSave ? "#fff" : SUB, fontWeight: 800, fontSize: 13.5, cursor: canSave ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: FONT }}>
          {saving ? <Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> : isEditing ? <Check size={15} /> : <Plus size={15} />}
          {isEditing ? "Simpan Perubahan" : "Tambah Template"}
        </button>
      </div>
    </div>
  );
}
/** Splash boot penuh-layar - dipakai selagi sesi & daftar prompt dimuat
 * (`state === "loading"`). Gaya & pola animasi SAMA PERSIS dgn `MartaSplash`
 * / `HubLogoLoader` di app/martahub/m/_shared/MobileShell.jsx &
 * components/HubLogoLoader.jsx (spring-in -> shimmer sekali lewat -> breathe
 * pelan terus-menerus, nama muncul naik, bar loading berdenyut) - cuma
 * logo/copy-nya diganti identitas Photobooth (pakai ikon PWA yg sama dgn
 * /photobooth/manifest.webmanifest) & wadahnya gelap, bukan diduplikasi
 * dari file MartaHub (beda app/route group). */
function RpvPhotoboothSplash() {
  return (
    <div className="flashprint-root" style={{ position: "fixed", inset: 0, background: BG, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, colorScheme: "dark" }}>
      <style suppressHydrationWarning>{`
        @keyframes pbs-ambient-drift-a {
          0%, 100% { transform: translate(-8%, 6%) scale(1); }
          50%       { transform: translate(6%, -4%) scale(1.18); }
        }
        @keyframes pbs-ambient-drift-b {
          0%, 100% { transform: translate(10%, 4%) scale(1.1); }
          50%       { transform: translate(-6%, -6%) scale(0.92); }
        }
        @keyframes pbs-ambient-pulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 0.9; }
        }
        @keyframes pbs-spring-in {
          0%   { transform: scale(0.22) rotate(-8deg); opacity: 0; }
          60%  { transform: scale(1.07) rotate(1deg);  opacity: 1; }
          80%  { transform: scale(0.96) rotate(-0.3deg); }
          100% { transform: scale(1.00) rotate(0deg);  opacity: 1; }
        }
        @keyframes pbs-breathe {
          0%, 100% { transform: scale(1.00); }
          50%       { transform: scale(1.045); }
        }
        @keyframes pbs-up {
          0%   { transform: translateY(14px); opacity: 0; }
          100% { transform: translateY(0px);  opacity: 1; }
        }
        @keyframes pbs-bar {
          0%, 100% { transform: scaleX(0.18); opacity: 0.30; }
          50%       { transform: scaleX(1.00); opacity: 1.00; }
        }
        @keyframes pbs-shimmer {
          0%   { left: -120%; }
          100% { left:  130%; }
        }
        .pbs-logo-box {
          animation: pbs-spring-in 0.75s cubic-bezier(0.34,1.56,0.64,1) both,
                     pbs-breathe   2.8s ease-in-out 0.9s infinite;
        }
        .pbs-shimmer-wrap { position:relative; overflow:hidden; display:inline-flex; border-radius:20px; }
        .pbs-shimmer-wrap::after {
          content:""; position:absolute; inset:0;
          background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,0.45) 50%,transparent 70%);
          left:-120%;
          animation: pbs-shimmer 1.8s ease-out 0.85s 1 forwards;
        }
        .pbs-name { animation: pbs-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.55s both; }
        .pbs-sub  { animation: pbs-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.70s both; }
        .pbs-bar-track { width:56px; height:3px; border-radius:99px; background:rgba(237,28,36,0.18); overflow:hidden; position:relative; }
        .pbs-bar-fill  { position:absolute; inset:0; border-radius:99px; background:${RED}; transform-origin:left center; animation: pbs-bar 1.4s cubic-bezier(0.4,0,0.6,1) 0.9s infinite; }
        .pbs-loader { animation: pbs-up 0.4s ease 1.0s both; }
        .pbs-ambient { position: absolute; left: 0; right: 0; bottom: 0; height: 46%; pointer-events: none; z-index: 0; }
        .pbs-ambient-blob { position: absolute; border-radius: 50%; filter: blur(46px); }
        .pbs-ambient-blob--a {
          left: 8%; bottom: -18%; width: 70%; aspect-ratio: 1; background: radial-gradient(circle, ${MAGA}59 0%, transparent 68%);
          animation: pbs-ambient-drift-a 9s ease-in-out infinite, pbs-ambient-pulse 5s ease-in-out infinite;
        }
        .pbs-ambient-blob--b {
          right: 4%; bottom: -22%; width: 62%; aspect-ratio: 1; background: radial-gradient(circle, ${VIO}52 0%, transparent 68%);
          animation: pbs-ambient-drift-b 11s ease-in-out infinite, pbs-ambient-pulse 6.5s ease-in-out infinite 1.2s;
        }
        .pbs-ambient-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(${MAGA}99 1px, transparent 1.6px);
          background-size: 22px 22px;
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 55%, rgba(0,0,0,0.55) 100%);
          mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 55%, rgba(0,0,0,0.55) 100%);
          animation: pbs-ambient-pulse 3.6s ease-in-out infinite;
        }
      `}</style>
      <div className="pbs-ambient">
        <div className="pbs-ambient-blob pbs-ambient-blob--a" />
        <div className="pbs-ambient-blob pbs-ambient-blob--b" />
        <div className="pbs-ambient-dots" />
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
        <div className="pbs-logo-box">
          <div className="pbs-shimmer-wrap">
            <img src="/photobooth/icon-192.png" alt="FlashPrint" draggable={false}
              style={{ height: 84, width: 84, display: "block", borderRadius: 19 }} />
          </div>
        </div>
        <div className="pbs-name" style={{ marginTop: 18 }}>
          <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>
            FlashPrint
          </span>
        </div>
        <div className="pbs-sub" style={{ marginTop: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: SUB }}>
            Memuat sesi…
          </span>
        </div>
        <div className="pbs-loader" style={{ marginTop: 30 }}>
          <div className="pbs-bar-track"><div className="pbs-bar-fill" /></div>
        </div>
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div className="flashprint-root" style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BG, fontFamily: FONT, padding: 20, boxSizing: "border-box", colorScheme: "dark" }}>
      {children}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
