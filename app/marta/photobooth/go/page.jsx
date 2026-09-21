"use client";
/**
 * /marta/photobooth/go — LANDING tamu, camera-first ("konsep dimatangkan"
 * bareng user: sebelum kamera dibuka, tamu disajikan dulu daftar sesi yg
 * sudah dibuat operator di panel /marta/photobooth, supaya tidak perlu
 * scan/ketik kode sesi secara blind). Sesi diambil dari RPC rpv_list_sessions
 * (publik, cuma sesi 14 hari terakhir & aktif yg ditampilkan).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import { listRpvSessions } from "../../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";

export default function RpvGoLanding() {
  const router = useRouter();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [sessions, setSessions] = useState([]);

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
    <div style={{ minHeight: "100svh", background: "linear-gradient(180deg,#F7F5FA 0%,#F4F4F6 260px)", fontFamily: FONT }}>
      <div style={{ padding: "36px 20px 24px", textAlign: "center" }}>
        <div style={{ width: 62, height: 62, margin: "0 auto", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", boxShadow: `0 12px 30px -8px ${RED}66` }}>
          <Camera size={27} />
        </div>
        <div style={{ marginTop: 14, fontSize: 19, fontWeight: 800, color: "#111116", letterSpacing: "-0.01em" }}>Pilih Sesi Photobooth</div>
        <div style={{ marginTop: 4, fontSize: 13, color: "#8A8A96" }}>Pilih sesi acara yang sedang berlangsung untuk mulai unggah foto</div>
      </div>

      <div style={{ padding: "0 16px 40px", maxWidth: 480, margin: "0 auto" }}>
        {state === "loading" && (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <Loader2 size={24} color={RED} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}
        {state === "error" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", color: "#8A8A96", fontSize: 13, gap: 8 }}>
            <AlertTriangle size={22} color={RED} /> Gagal memuat daftar sesi. Coba muat ulang halaman.
          </div>
        )}
        {state === "ready" && sessions.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8A96", fontSize: 13 }}>Belum ada sesi aktif saat ini.</div>
        )}
        {state === "ready" && sessions.map((s) => (
          <button key={s.code} onClick={() => router.push(`/marta/photobooth/go/${s.code}`)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "#fff", border: "1px solid #E4E2EA", borderRadius: 16, padding: "14px 14px", marginBottom: 10, cursor: "pointer", fontFamily: FONT }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED}1A,${MAGA}1A)`, color: RED }}>
              <Camera size={17} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
              <div style={{ fontSize: 11, color: "#8A8A96", marginTop: 2 }}>{s.photo_count ?? 0} foto terunggah</div>
            </div>
            <ChevronRight size={17} color="#B0B0BA" />
          </button>
        ))}
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
