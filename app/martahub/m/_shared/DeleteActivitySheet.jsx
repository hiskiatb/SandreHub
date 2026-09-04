"use client";
/**
 * DeleteActivitySheet - SATU sumber kebenaran utk seluruh alur hapus
 * activity plan di MartaHub mobile. Dipakai konsisten dari mana pun
 * pemicunya (kartu di daftar Aktivitas, quick-view sheet, maupun halaman
 * detail penuh) supaya perilakunya SAMA PERSIS di ketiganya, bukan
 * reimplementasi terpisah yang bisa diam-diam berbeda.
 *
 * Alur (mengikuti `deletePlan()`/`mh_activity_delete_impact` Flutter):
 *   1. Cek dampak dulu (mh_activity_delete_impact) - berapa data terkait
 *      (nomor MSISDN, dokumen, riwayat approval, mutasi POSMAT) yang ikut
 *      terhapus, DAN apakah ada instalasi POSMAT yang masih bergantung
 *      (blocking - kalau ada, hapus ditolak total, bukan cuma diperingatkan).
 *   2. WAJIB ketik "HAPUS" dulu sebelum tombol Hapus aktif kalau plan sudah
 *      lanjut dari draft (needs_strong_confirm dari server), ATAU kalau
 *      sudah ada data pencatatan penjualan (nomor MSISDN yg sudah diclaim)
 *      - draft SEKALIPUN bisa punya nomor tercatat sekarang (fitur Catat
 *      Penjualan bisa dipakai sejak masa planning), jadi status draft saja
 *      TIDAK CUKUP utk dianggap "aman"/data kosong. Lapisan tambahan ini
 *      supaya tidak ada yang kehapus permanen krn salah/keburu klik.
 *   3. Delete asli (RLS-enforced di server - `deletePlan()` deteksi kalau
 *      0 baris terhapus krn bukan pemilik, dilempar sbg error yang jelas).
 *
 * @param {{ activityId: string, activityName?: string, onClose: () => void, onDeleted: () => void }} props
 */
import { useEffect, useState } from "react";
import { Trash2, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { FF } from "./MobileShell";
import { statusMeta } from "./activityUi";
import { deletePlanImpact, deletePlan } from "./planData";
import BottomSheet from "./BottomSheet";

export default function DeleteActivitySheet({ activityId, activityName, onClose, onDeleted }) {
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setLoadErr("");
      try {
        const data = await deletePlanImpact(activityId);
        if (alive) setImpact(data);
      } catch (e) {
        if (alive) setLoadErr(e.message || "Gagal memeriksa dampak hapus");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [activityId]);

  async function confirmDelete() {
    setBusy(true); setErr("");
    try {
      await deletePlan(activityId);
      onDeleted();
    } catch (e) {
      setErr(e.message || "Gagal menghapus plan");
      setBusy(false);
    }
  }

  const blocked = (impact?.blocking_installations || 0) > 0;
  const salesCount = impact?.sales_entries || 0;
  const hasSalesData = salesCount > 0;
  // Draft BUKAN jaminan "masih kosong" lagi - Catat Penjualan (dulu Tagging
  // Nomor) sekarang bisa dipakai sejak masa planning, jadi sebuah draft
  // bisa saja sudah membawa nomor MSISDN yang sudah diclaim orang. Konfirmasi
  // diperberat kalau salah satu (atau kedua) alasan ini berlaku, bukan cuma
  // status non-draft dari server.
  const needsStrong = !!impact?.needs_strong_confirm || hasSalesData;
  const confirmOk = !needsStrong || confirmText.trim().toUpperCase() === "HAPUS";
  const displayName = impact?.event_name || activityName || "Plan ini";

  return (
    <BottomSheet onClose={onClose} zIndex={200} borderRadius="24px 24px 0 0"
      backdropOpacity={0.5} disableBackdropClose={busy} disableSwipeClose={busy}>
        {loading ? (
          <div style={{ padding: "28px 0 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Loader2 size={26} color="#DC2626" style={{ animation: "mspin .85s linear infinite" }} />
            <div style={{ fontSize: 12.5, color: "#8A8A96", fontWeight: 600 }}>Memeriksa data terkait…</div>
          </div>
        ) : !impact ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <AlertTriangle size={20} color="#DC2626" />
              <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>Gagal Memeriksa</div>
            </div>
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{loadErr}</div>
            <button onClick={onClose}
              style={{ width: "100%", marginTop: 16, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#17181C", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
              Tutup
            </button>
          </>
        ) : blocked ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(220,38,38,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <ShieldAlert size={20} color="#DC2626" />
              </div>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>Tidak Bisa Dihapus</div>
                <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>{displayName}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, padding: "12px 13px", borderRadius: 12, background: "#FFF7ED", border: "1px solid #FED7AA", fontSize: 12.5, color: "#7C2D12", lineHeight: 1.6, fontWeight: 600 }}>
              Plan ini masih memiliki <b>{impact.blocking_installations}</b> instalasi POSMAT terkait. Selesaikan atau pindahkan instalasi tersebut terlebih dahulu sebelum menghapus plan.
            </div>
            <button onClick={onClose}
              style={{ width: "100%", marginTop: 16, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#17181C", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
              Mengerti
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(220,38,38,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Trash2 size={19} color="#DC2626" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>Hapus Plan?</div>
                <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 12.5, color: "#5A5A68", lineHeight: 1.6 }}>
              Tindakan ini <b>permanen</b> dan tidak bisa dibatalkan.
            </div>

            {/* Data pencatatan penjualan (nomor MSISDN yg sudah diclaim)
                SENGAJA dipisah jadi kotak peringatan sendiri, bukan pill
                netral biasa spt data lain - ini data bisnis nyata (nomor
                prospek/pelanggan yg sudah dikerjakan tim), bukan sekadar
                metadata, jadi harus terasa lebih serius saat mau dihapus. */}
            {hasSalesData && (
              <div style={{ marginTop: 12, padding: "12px 13px", borderRadius: 12, background: "#FDECEC", border: "1px solid #F3C6C6" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12.5, color: "#7A1F1F", lineHeight: 1.6, fontWeight: 600 }}>
                    <b>{salesCount} nomor MSISDN</b> yang sudah dicatat/diclaim (Catat Penjualan) akan ikut terhapus permanen dan <b>tidak bisa dikembalikan</b>.
                  </div>
                </div>
              </div>
            )}

            {(impact.documents > 0 || impact.approvals > 0 || impact.posmat_movements > 0) ? (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 7 }}>
                {impact.documents > 0 && <ImpactPill label={`${impact.documents} dokumen/foto`} />}
                {impact.approvals > 0 && <ImpactPill label={`${impact.approvals} riwayat approval`} />}
                {impact.posmat_movements > 0 && <ImpactPill label={`${impact.posmat_movements} mutasi POSMAT`} />}
              </div>
            ) : !hasSalesData && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: "#B0B0BA", fontWeight: 600 }}>Belum ada data lain yang terkait (plan masih baru).</div>
            )}

            {needsStrong && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, marginBottom: 7, lineHeight: 1.5 }}>
                  {hasSalesData && impact.needs_strong_confirm ? (
                    <>Plan ini sudah masuk status <b style={{ color: "#17181C" }}>{statusMeta(impact.status).label}</b> DAN masih membawa data penjualan yang sudah diclaim - </>
                  ) : hasSalesData ? (
                    <>Plan ini masih membawa <b style={{ color: "#17181C" }}>{salesCount} nomor</b> yang sudah diclaim - </>
                  ) : (
                    <>Plan ini sudah masuk status <b style={{ color: "#17181C" }}>{statusMeta(impact.status).label}</b> (bukan draft) - </>
                  )}
                  ketik <b style={{ color: "#DC2626" }}>HAPUS</b> utk konfirmasi.
                </div>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="HAPUS" autoCapitalize="characters"
                  style={{ width: "100%", height: 46, borderRadius: 12, border: `1.5px solid ${confirmText && !confirmOk ? "#F3C6C6" : "#E4E5EA"}`, padding: "0 14px", fontSize: 14, fontWeight: 700, fontFamily: FF, outline: "none", letterSpacing: 1 }} />
              </div>
            )}

            {err && (
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>
            )}

            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button onClick={onClose} disabled={busy}
                style={{ flex: 1, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: busy ? "default" : "pointer" }}>
                Batal
              </button>
              <button onClick={confirmDelete} disabled={busy || !confirmOk}
                style={{
                  flex: 1.3, height: 48, borderRadius: 12, border: "none", cursor: !confirmOk ? "default" : "pointer", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF,
                  background: !confirmOk ? "#D8D9E0" : "#DC2626",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  boxShadow: !confirmOk ? "none" : "0 4px 12px rgba(220,38,38,0.25)",
                }}>
                {busy ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <Trash2 size={15} />}
                {needsStrong ? "Ya, Hapus Permanen" : "Hapus Plan"}
              </button>
            </div>
          </>
        )}
    </BottomSheet>
  );
}

function ImpactPill({ label }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#5A5A68", background: "#F0F0F3", borderRadius: 999, padding: "5px 10px" }}>{label}</span>
  );
}
