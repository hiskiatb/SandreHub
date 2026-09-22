"use client";
/**
 * /marta/photobooth/go — LANDING tamu (start_url PWA). Kalau operator
 * cuma menjalankan 1 sesi aktif, tamu langsung dilempar ke situ tanpa
 * layar antara. Kalau ada >1 sesi aktif, tampilkan daftar utk dipilih -
 * dirapikan jadi tema GELAP profesional, senada dgn halaman pemilihan
 * template (bukan lagi kartu terang yg beda gaya dr sisa app) ("untuk
 * pemilihan sesinya juga perbaiki").
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, AlertTriangle, Ticket } from "lucide-react";
import { listRpvSessions } from "../../../../lib/rpv";
import { PhotoboothPwaHead, usePhotoboothServiceWorker } from "../_pwa";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const BG = "#0A0A0B";
const CARD = "#1A1B1D";
const CARD_HI = "#212226";
const LINE = "rgba(255,255,255,0.09)";
const INK = "#F1F1F3";
const SUB = "#84848C";

export default function RpvGoLanding() {
  const router = useRouter();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [sessions, setSessions] = useState([]);
  // Halaman "Mode Kamera" tamu - satu2nya tempat manifest/SW Photobooth
  // dipasang, supaya "Tambah ke Layar Utama" cuma tersedia di sini.
  usePhotoboothServiceWorker();

  useEffect(() => {
    (async () => {
      try {
        const rows = await listRpvSessions(30);
        const active = rows.filter((s) => s.is_active);
        // Selalu tampilkan daftar pemilihan sesi, walau cuma 1 sesi aktif -
        // tombol pemilihan sesi tetap perlu ada & terlihat, tidak lagi
        // auto-lompat lewati layar ini.
        setSessions(active);
        setState("ready");
      } catch { setState("error"); }
    })();
  }, []);

  return (
    <div style={{ minHeight: "100svh", background: BG, fontFamily: FONT, colorScheme: "dark" }}>
      <PhotoboothPwaHead />
      <div style={{ padding: "40px 20px 24px", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, margin: "0 auto", borderRadius: 19, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, boxShadow: `0 12px 30px -8px ${MAGA}77`, overflow: "hidden" }}>
          <img src="/photobooth/icon-192.png" alt="FlashPrint" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ marginTop: 16, fontSize: 19, fontWeight: 800, color: INK, letterSpacing: "-0.01em" }}>Pilih Sesi Photobooth</div>
        <div style={{ marginTop: 5, fontSize: 12.5, color: SUB, fontWeight: 600 }}>Pilih sesi acara yang sedang berlangsung untuk mulai unggah foto</div>
      </div>

      <div style={{ padding: "0 16px 44px", maxWidth: 480, margin: "0 auto" }}>
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
          <button key={s.code} onClick={() => router.push(`/marta/photobooth/go/${s.code}`)}
            className="rpv-go-card"
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: `linear-gradient(180deg, ${CARD_HI} 0%, ${CARD} 100%)`, border: `1px solid ${LINE}`, borderRadius: 16, padding: "14px 14px", marginBottom: 10, cursor: "pointer", fontFamily: FONT }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED}22,${MAGA}22)`, color: MAGA }}>
              <Ticket size={18} />
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
        * { box-sizing: border-box; }
        body { background: ${BG}; }
        .rpv-go-card { transition: transform .15s ease, border-color .15s ease; }
        .rpv-go-card:active { transform: scale(0.98); border-color: ${MAGA}66; }
      `}</style>
    </div>
  );
}
