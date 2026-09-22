"use client";
/**
 * /marta/photobooth/scan — landing SCANNER (tanpa kode sesi di URL), supaya
 * ada menu masuk yang jelas dari halaman login ("belum ada menu scanner") -
 * sebelumnya scanner cuma bisa diakses lewat link yang di-share manual dari
 * panel operator (popup "Link HP Scanner"). Tampilkan daftar sesi AKTIF,
 * begitu dipilih baru diarahkan ke /marta/photobooth/scan/[code] utk lanjut
 * pilih operator & scan. Tema & pola sama persis dgn /marta/photobooth/go
 * (landing tamu), cuma beda ikon/warna aksen & tujuan link.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, AlertTriangle, QrCode } from "lucide-react";
import { listRpvSessions } from "../../../../lib/rpv";
import { PhotoboothPwaHead, usePhotoboothServiceWorker } from "../_pwa";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const VIO = "#7C3AED";
const BG = "#0A0A0B";
const CARD = "#1A1B1D";
const CARD_HI = "#212226";
const LINE = "rgba(255,255,255,0.09)";
const INK = "#F1F1F3";
const SUB = "#84848C";
const PAGE_LEAVE_MS = 260;

export default function RpvScanLanding() {
  const router = useRouter();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [sessions, setSessions] = useState([]);
  const [leavingCode, setLeavingCode] = useState("");

  const goToSession = (code) => {
    if (leavingCode) return;
    setLeavingCode(code);
    setTimeout(() => router.push(`/marta/photobooth/scan/${code}`), PAGE_LEAVE_MS);
  };
  usePhotoboothServiceWorker();

  useEffect(() => {
    (async () => {
      try {
        const rows = await listRpvSessions(30);
        setSessions(rows.filter((s) => s.is_active));
        setState("ready");
      } catch { setState("error"); }
    })();
  }, []);

  return (
    <div className={leavingCode ? "rpv-scango-page rpv-scango-page--leaving" : "rpv-scango-page"} style={{ minHeight: "100svh", background: BG, fontFamily: FONT, colorScheme: "dark", position: "relative" }}>
      <PhotoboothPwaHead />
      <div className="rpv-scango-ambient" aria-hidden="true">
        <div className="rpv-scango-ambient-blob rpv-scango-ambient-blob--a" />
        <div className="rpv-scango-ambient-blob rpv-scango-ambient-blob--b" />
        <div className="rpv-scango-ambient-dots" />
      </div>
      <div style={{ position: "relative", zIndex: 1, padding: "40px 20px 24px", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, margin: "0 auto", borderRadius: 19, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${VIO},${MAGA})`, boxShadow: `0 12px 30px -8px ${MAGA}77` }}>
          <QrCode size={28} color="#fff" />
        </div>
        <div style={{ marginTop: 16, fontSize: 19, fontWeight: 800, color: INK, letterSpacing: "-0.01em" }}>Scanner Operator</div>
        <div style={{ marginTop: 5, fontSize: 12.5, color: SUB, fontWeight: 600, lineHeight: 1.5 }}>
          Pilih sesi yang sedang berlangsung<br />untuk mulai pindai QR Photo ID
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "0 16px 44px", maxWidth: 480, margin: "0 auto" }}>
        {state === "loading" && (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <Loader2 size={24} color={MAGA} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}
        {state === "error" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", color: SUB, fontSize: 12.5, fontWeight: 600, gap: 9 }}>
            <AlertTriangle size={22} color={RED} /> Gagal memuat daftar sesi. Coba muat ulang halaman.
          </div>
        )}
        {state === "ready" && sessions.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 14px", borderRadius: 16, background: CARD, border: `1.5px dashed ${LINE}`, color: SUB, fontSize: 12.5, fontWeight: 600 }}>Belum ada sesi aktif saat ini.</div>
        )}
        {state === "ready" && sessions.map((s) => (
          <button key={s.code} onClick={() => goToSession(s.code)} disabled={!!leavingCode}
            className="rpv-scango-card"
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: `linear-gradient(180deg, ${CARD_HI} 0%, ${CARD} 100%)`, border: `1px solid ${LINE}`, borderRadius: 16, padding: "14px 14px", marginBottom: 10, cursor: leavingCode ? "default" : "pointer", fontFamily: FONT, opacity: leavingCode && leavingCode !== s.code ? 0.4 : 1, transition: "opacity .2s ease" }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${VIO}22,${MAGA}22)`, color: MAGA }}>
              <QrCode size={18} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
              <div style={{ fontSize: 11, color: SUB, marginTop: 2, fontWeight: 600 }}>{s.photo_count ?? 0} foto terunggah</div>
            </div>
            <ChevronRight size={17} color={SUB} />
          </button>
        ))}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rpv-scango-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes rpv-scango-fade-out { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes rpv-scango-ambient-drift-a {
          0%, 100% { transform: translate(-14%, 10%) scale(1); }
          50%       { transform: translate(12%, -8%) scale(1.28); }
        }
        @keyframes rpv-scango-ambient-drift-b {
          0%, 100% { transform: translate(16%, 8%) scale(1.15); }
          50%       { transform: translate(-12%, -10%) scale(0.88); }
        }
        @keyframes rpv-scango-ambient-pulse {
          0%, 100% { opacity: 0.62; }
          50%       { opacity: 0.92; }
        }
        * { box-sizing: border-box; }
        body { background: ${BG}; }
        .rpv-scango-page { animation: rpv-scango-fade-in .45s ease both; }
        .rpv-scango-page--leaving { animation: rpv-scango-fade-out ${PAGE_LEAVE_MS}ms ease both; }
        .rpv-scango-card { transition: transform .15s ease, border-color .15s ease; }
        .rpv-scango-card:active { transform: scale(0.98); border-color: ${MAGA}66; }
        .rpv-scango-ambient {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
          animation: rpv-scango-fade-in 1.1s ease both .1s;
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
          mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
        }
        .rpv-scango-ambient-blob {
          position: absolute; border-radius: 50%; filter: blur(min(48px, 8vw));
          width: min(70vw, 560px); aspect-ratio: 1;
        }
        .rpv-scango-ambient-blob--a {
          left: 4%; bottom: -18%; background: radial-gradient(circle, ${MAGA}52 0%, transparent 68%);
          animation: rpv-scango-ambient-drift-a 11s ease-in-out infinite, rpv-scango-ambient-pulse 6s ease-in-out infinite;
        }
        .rpv-scango-ambient-blob--b {
          right: 0%; bottom: -22%; width: min(62vw, 500px); background: radial-gradient(circle, ${VIO}46 0%, transparent 68%);
          animation: rpv-scango-ambient-drift-b 13s ease-in-out infinite, rpv-scango-ambient-pulse 7.5s ease-in-out infinite 1.3s;
        }
        .rpv-scango-ambient-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(${MAGA}80 1px, transparent 1.6px);
          background-size: 22px 22px;
          animation: rpv-scango-ambient-pulse 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
