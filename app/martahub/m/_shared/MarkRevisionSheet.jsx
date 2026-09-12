"use client";
/**
 * MarkRevisionSheet - SATU-SATUNYA komponen di MartaHub mobile yang boleh
 * memicu RPC `mh_activity_mark_revision` (menandai Activity Plan perlu
 * direvisi). Dipakai HANYA dari halaman Activity Detail
 * (`m/activities/[id]/page.jsx`) - sengaja tidak diduplikasi ke tempat lain
 * (kartu daftar, Beranda, dst) supaya "pintu" menandai revisi cuma satu,
 * konsisten dgn versi desktop (RevisionConfirm di ActivityDetail.jsx) yang
 * memanggil RPC yang SAMA PERSIS.
 *
 * Arah revisinya (plan ATAU laporan actual) TIDAK ditebak di sini - server
 * (RPC) yang menentukan berdasar tahap activity ini sekarang (lihat catatan
 * di migration mh_activity_mark_revision). Komponen ini cuma mengumpulkan
 * catatan (wajib diisi) lalu menyerahkan keputusan sepenuhnya ke server.
 *
 * @param {{ activityId: string, eventName?: string, isActualStage: boolean, email: string, onClose: () => void, onRevised: (row) => void }} props
 */
import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { FF } from "./MobileShell";
import supabaseMarta from "../../../../lib/supabaseMarta";
import BottomSheet from "./BottomSheet";

export default function MarkRevisionSheet({ activityId, eventName, isActualStage, email, onClose, onRevised }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ready = note.trim().length > 0;

  async function confirm() {
    setBusy(true); setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_activity_mark_revision", {
        p_activity_id: activityId, p_note: note.trim(), p_caller_email: email,
      });
      if (error) throw error;
      onRevised?.(data);
      onClose();
    } catch (e) {
      setErr(e.message || "Gagal menandai revisi");
      setBusy(false);
    }
  }

  return (
    <BottomSheet onClose={onClose} zIndex={200} borderRadius="24px 24px 0 0"
      backdropOpacity={0.5} disableBackdropClose={busy} disableSwipeClose={busy}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(180,83,9,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertTriangle size={19} color="#B45309" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>Tandai Perlu Revisi</div>
          {eventName && <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eventName}</div>}
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12.5, color: "#5A5A68", lineHeight: 1.6 }}>
        {isActualStage
          ? "Laporan actual akan dikembalikan ke BME/RGE untuk diperbaiki."
          : "Plan akan dikembalikan ke BME/RGE untuk diperbaiki sebelum bisa dieksekusi."}
        {" "}Tulis dengan jelas apa yang perlu diperbaiki - catatan ini langsung tampil ke pemilik plan.
      </div>

      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} autoFocus
        placeholder="Contoh: Site plan salah, seharusnya di site X. Tolong diperbaiki dan submit ulang."
        style={{ marginTop: 12, width: "100%", padding: "11px 13px", borderRadius: 12, border: "1px solid #E4E5EA", fontSize: 13, fontFamily: FF, resize: "vertical" }} />

      {err && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button onClick={onClose} disabled={busy}
          style={{ flex: 1, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: busy ? "default" : "pointer" }}>
          Batal
        </button>
        <button onClick={confirm} disabled={busy || !ready}
          style={{
            flex: 1.3, height: 48, borderRadius: 12, border: "none", cursor: !ready ? "default" : "pointer", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF,
            background: !ready ? "#D8D9E0" : "#B45309",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
          {busy ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <AlertTriangle size={15} />}
          Kirim & Tandai Revisi
        </button>
      </div>
    </BottomSheet>
  );
}
