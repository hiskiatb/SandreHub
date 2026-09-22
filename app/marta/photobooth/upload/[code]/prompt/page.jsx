"use client";
/**
 * /marta/photobooth/upload/[code]/prompt — halaman PUBLIK (tanpa login),
 * versi MOBILE dari fitur "Template Prompt" yang sebelumnya cuma ada di
 * layar operator (Ruang Kontrol web). Sekarang tamu SENDIRI yang:
 *   1. Pilih 1 template di sini -> teks prompt-nya langsung tersalin
 *      (tinggal ditempel/paste di app Gemini).
 *   2. Pindah ke app Gemini di HP-nya SENDIRI - foto & generate di sana.
 *   3. Download hasilnya ke galeri HP.
 *   4. Balik ke sini, tekan "Upload Gambar Gemini Anda" -> pilih hasil
 *      Gemini dari galeri -> diunggah ke sesi ini.
 *   5. Begitu SUKSES masuk database, tampil layar sukses dgn QR code +
 *      "Photo ID" (nomor antrian 5 digit, unik per sesi - lihat
 *      rpv_confirm_gemini_photo di lib/rpv.js) - ini yang disebutkan tamu
 *      ke petugas cetak / di-scan operator lewat mode Scanner (Fase 2).
 *
 * Operator TIDAK LAGI perlu memilih prompt sendiri di layar Ruang Kontrol -
 * semua sudah selesai di HP tamu sampai foto masuk DB; layar operator
 * (Fase 2) fokus penuh ke pencarian/scan + cetak.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import {
  AlertTriangle, ArrowLeft, Camera, Check, ImagePlus, Loader2,
  Sparkles, Ticket,
} from "lucide-react";
import { getRpvSession, listRpvPrompts, uploadRpvGeminiResult } from "../../../../../../lib/rpv";
import { PhotoboothPwaHead, usePhotoboothServiceWorker } from "../../../_pwa";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const VIO = "#7C3AED";
const INK = "#111116";
const LINE = "#E4E2EA";
const SUB = "#8A8A96";

export default function RpvPromptUploadPage() {
  const params = useParams();
  const code = (params?.code || "").toString().toUpperCase();
  const fileRef = useRef(null);
  usePhotoboothServiceWorker();

  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [session, setSession] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [copiedId, setCopiedId] = useState("");

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
      } catch { setState("notfound"); }
    })();
  }, [code]);

  // Begitu berhasil upload, generate QR code (isi = Photo ID 5-digit saja,
  // BUKAN url) - supaya mode Scanner operator (Fase 2) tinggal decode teks
  // digitnya langsung tanpa parsing URL, & petugas juga bisa baca angkanya
  // manual kalau scanner tidak dipakai.
  useEffect(() => {
    if (upload.phase !== "done" || !upload.result?.queueLabel) return;
    let alive = true;
    QRCode.toDataURL(upload.result.queueLabel, { margin: 1, width: 260, color: { dark: "#111116", light: "#FFFFFF" } })
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
    return <Center><Loader2 size={26} color={VIO} style={{ animation: "spin 1s linear infinite" }} /></Center>;
  }
  if (state === "notfound") {
    return (
      <Center>
        <AlertTriangle size={30} color={VIO} />
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: INK }}>Sesi tidak ditemukan</div>
        <div style={{ marginTop: 4, fontSize: 13, color: SUB, textAlign: "center", maxWidth: 280 }}>Link ini sudah tidak berlaku atau sesi photobooth belum aktif.</div>
      </Center>
    );
  }

  if (upload.phase === "done" && upload.result) {
    return (
      <GeminiUploadSuccessScreen
        result={upload.result}
        qrUrl={qrUrl}
        onUploadMore={resetUpload}
        onBackToCamera={() => { resetUpload(); }}
        code={code}
      />
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: "#F4F4F6", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <PhotoboothPwaHead />
      <div style={{ padding: "18px 18px 14px", background: "#fff", borderBottom: `1px solid ${LINE}`, position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`/marta/photobooth/upload/${code}`}
            style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 11, background: "#F4F4F6", border: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#5A5A68" }}>
            <ArrowLeft size={16} />
          </Link>
          <span style={{ width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${VIO},${MAGA})`, color: "#fff", flexShrink: 0 }}>
            <Sparkles size={17} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Edit dengan Gemini AI</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 1 }}>{session?.title}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "18px 16px 40px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {/* Langkah 1 - pilih template, klik = langsung copy teks prompt */}
        <SectionLabel n={1} text="Pilih Template & Salin Prompt" hint="Ketuk salah satu, teksnya langsung tersalin" />
        {prompts.length === 0 ? (
          <div style={{ padding: "22px 14px", borderRadius: 14, background: "#fff", border: `1.5px dashed ${LINE}`, textAlign: "center" }}>
            <span style={{ fontSize: 12, color: SUB, fontWeight: 600 }}>Belum ada template prompt di sesi ini.</span>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {prompts.map((p) => {
              const justCopied = copiedId === p.id;
              return (
                <button key={p.id} onClick={() => copyPromptText(p)}
                  className="rpv-m-tpl-card"
                  style={{ display: "flex", flexDirection: "column", border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: FONT, textAlign: "left" }}>
                  <div className="rpv-m-tpl-thumb" style={{ position: "relative", width: "100%", aspectRatio: "1/1", borderRadius: 14, overflow: "hidden", background: "#E4E2EA", border: `1px solid ${LINE}` }}>
                    {p.promptImageUrl ? (
                      <img src={p.promptImageUrl} alt={p.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: SUB }}><Sparkles size={18} /></div>
                    )}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,0.62) 100%)" }} />
                    <div style={{ position: "absolute", left: 6, right: 6, bottom: 6, fontSize: 10, fontWeight: 800, color: "#fff", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.label}
                    </div>
                    <div className={justCopied ? "rpv-m-tpl-copied rpv-m-tpl-copied--on" : "rpv-m-tpl-copied"}>
                      <Check size={20} color="#fff" strokeWidth={3} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Langkah 2 - instruksi singkat ke Gemini */}
        <div style={{ marginTop: 18, padding: "12px 14px", borderRadius: 14, background: "#F7F4FB", border: `1px solid ${VIO}33`, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 999, background: VIO, color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>2</span>
          <div style={{ fontSize: 11.5, color: "#4A3A66", lineHeight: 1.55, fontWeight: 600 }}>
            Buka app <b>Gemini</b> di HP kamu, tempel (paste) prompt yang tadi tersalin, foto/generate di sana, lalu <b>download hasilnya</b> ke galeri HP.
          </div>
        </div>

        {/* Langkah 3 - upload hasil Gemini */}
        <SectionLabel n={3} text="Upload Gambar Gemini Anda" hint="Pilih hasil Gemini dari galeri HP kamu" style={{ marginTop: 20 }} />
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickGeminiFile} style={{ display: "none" }} />

        {upload.phase === "idle" && (
          <button onClick={() => fileRef.current?.click()}
            style={{
              width: "100%", height: 118, borderRadius: 18, cursor: "pointer", fontFamily: FONT,
              background: "#fff", border: `1.5px dashed ${MAGA}55`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9,
            }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff" }}>
              <ImagePlus size={20} />
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>Upload Gambar Gemini Anda</span>
            <span style={{ fontSize: 10.5, color: SUB, fontWeight: 600 }}>Buka galeri HP kamu</span>
          </button>
        )}

        {upload.phase === "uploading" && (
          <div style={{ width: "100%", height: 118, borderRadius: 18, background: "#fff", border: `1.5px solid ${LINE}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <Loader2 size={24} color={MAGA} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5A5A68" }}>Mengunggah… {Math.round(upload.progress * 100)}%</span>
            <div style={{ width: "70%", height: 5, borderRadius: 99, background: "#EFEDF3", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, width: `${upload.progress * 100}%`, background: `linear-gradient(90deg,${RED},${MAGA})`, transition: "width .2s ease" }} />
            </div>
          </div>
        )}

        {upload.phase === "error" && (
          <div style={{ width: "100%", borderRadius: 18, background: "#FDEDED", border: "1.5px solid #F3B8B8", padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <AlertTriangle size={22} color="#C62828" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#C62828" }}>{upload.error}</span>
            <button onClick={resetUpload}
              style={{ height: 38, padding: "0 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}>
              Coba Lagi
            </button>
          </div>
        )}

        <Link href={`/marta/photobooth/upload/${code}`}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 18, fontSize: 11.5, color: SUB, fontWeight: 700, textDecoration: "none" }}>
          <Camera size={13} /> atau kembali ke Menu Kamera biasa
        </Link>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        .rpv-m-tpl-card { transition: transform .15s ease; }
        .rpv-m-tpl-card:active { transform: scale(0.95); }
        .rpv-m-tpl-copied {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          background: rgba(21,128,61,0.0); opacity: 0; pointer-events: none;
          transition: opacity .18s ease, background .18s ease;
        }
        .rpv-m-tpl-copied--on { opacity: 1; background: rgba(21,128,61,0.62); animation: rpv-m-flash .5s ease; }
        @keyframes rpv-m-flash { 0% { transform: scale(0.6); opacity: 0; } 55% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

function SectionLabel({ n, text, hint, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, ...style }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 999, background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>{text}</div>
        {hint && <div style={{ fontSize: 10.5, color: SUB, fontWeight: 600 }}>{hint}</div>}
      </div>
    </div>
  );
}

/** Layar sukses upload hasil Gemini - QR code + Photo ID (nomor antrian 5
 * digit) besar & jelas, supaya tamu tinggal tunjukkan/sebutkan ke petugas
 * cetak, atau petugas scan QR-nya langsung (mode Scanner, Fase 2). */
function GeminiUploadSuccessScreen({ result, qrUrl, onUploadMore, onBackToCamera, code }) {
  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#F4F4F6", fontFamily: FONT }}>
      <div style={{ textAlign: "center", maxWidth: 340, width: "100%" }}>
        <div style={{ position: "relative", width: 84, height: 84, margin: "0 auto" }}>
          <div className="rpv-m-success-pop" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(21,128,61,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="42" height="42" viewBox="0 0 52 52">
              <circle className="rpv-m-success-circle" cx="26" cy="26" r="23" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" />
              <path className="rpv-m-success-tick" d="M15 27l7.5 7.5L37.5 18" fill="none" stroke="#15803D" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 17, fontWeight: 800, color: "#17181C" }}>Foto Gemini Berhasil Diunggah!</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "#6B6B76", lineHeight: 1.6 }}>
          Tunjukkan atau sebutkan <b>Photo ID</b> di bawah ini ke petugas untuk mencetak fotomu.
        </div>

        <div style={{ marginTop: 20, padding: 18, borderRadius: 20, background: "#fff", border: `1.5px solid ${LINE}` }}>
          {qrUrl ? (
            <img src={qrUrl} alt="QR Code" style={{ width: 176, height: 176, margin: "0 auto", display: "block", borderRadius: 10 }} />
          ) : (
            <div style={{ width: 176, height: 176, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={22} color={SUB} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Ticket size={16} color={MAGA} />
            <span style={{ fontSize: 9.5, fontWeight: 800, color: SUB, letterSpacing: 0.3 }}>PHOTO ID</span>
          </div>
          <div style={{ marginTop: 2, fontSize: 34, fontWeight: 900, color: INK, letterSpacing: "0.08em", fontFamily: "monospace" }}>
            {result.queueLabel}
          </div>
        </div>

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={onUploadMore}
            style={{ width: "100%", height: 48, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}>
            Upload Gemini Lagi
          </button>
          <Link href={`/marta/photobooth/upload/${code}`} onClick={onBackToCamera}
            style={{ width: "100%", height: 48, borderRadius: 12, border: `1.5px solid ${LINE}`, background: "#fff", color: "#5A5A68", fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Selesai
          </Link>
        </div>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rpv-m-success-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes rpv-m-success-circle { from { stroke-dasharray: 145; stroke-dashoffset: 145; } to { stroke-dasharray: 145; stroke-dashoffset: 0; } }
        @keyframes rpv-m-success-tick { from { stroke-dasharray: 34; stroke-dashoffset: 34; } to { stroke-dasharray: 34; stroke-dashoffset: 0; } }
        .rpv-m-success-pop { animation: rpv-m-success-pop 0.42s cubic-bezier(.34,1.56,.64,1) both; }
        .rpv-m-success-circle { animation: rpv-m-success-circle 0.55s 0.05s cubic-bezier(.65,0,.35,1) both; }
        .rpv-m-success-tick { animation: rpv-m-success-tick 0.35s 0.5s cubic-bezier(.65,0,.35,1) both; }
      `}</style>
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F4F4F6", fontFamily: FONT, padding: 20 }}>
      {children}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
