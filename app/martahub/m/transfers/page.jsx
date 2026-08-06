"use client";
/**
 * /martahub/m/transfers - Kotak masuk permintaan transfer kepemilikan MSISDN
 * (web mobile). Padanan `msisdn_transfer_requests_screen.dart` di Flutter:
 * daftar `mh_msisdn_transfer_list_for_me()`, aksi Setujui/Tolak via RPC
 * `mh_msisdn_transfer_decide`. Sisi PENGAJUAN (saat konflik kepemilikan
 * terdeteksi) sudah ada di halaman Submit Actual (ConflictSheet).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle, Clock, Phone, Loader2 } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";

const TABS = [
  { key: "pending", label: "Menunggu" },
  { key: "decided", label: "Riwayat" },
];

export default function TransfersPage() {
  const router = useRouter();
  const { loading: sessionLoading } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("pending");
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const { data, error } = await supabaseMarta.rpc("mh_msisdn_transfer_list_for_me");
      if (error) throw error;
      setRows((data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (e) {
      setErr(e.message || "Gagal memuat permintaan transfer");
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    load();
  }, [sessionLoading]);

  async function decide(id, decision) {
    setBusyId(id);
    try {
      const { error } = await supabaseMarta.rpc("mh_msisdn_transfer_decide", { p_request_id: id, p_decision: decision });
      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e.message || "Gagal memproses keputusan");
    } finally {
      setBusyId(null);
    }
  }

  if (sessionLoading || rows === null) {
    return (
      <MobileShell active="home">
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px" }}>
          <BackBar router={router} />
        </div>
        <ShellSpinner />
      </MobileShell>
    );
  }

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");
  const list = tab === "pending" ? pending : decided;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <BackBar router={router} />
        <div style={{ marginTop: 14, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Transfer MSISDN</div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>
          Permintaan transfer kepemilikan nomor yang ditujukan kepada Anda
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const n = t.key === "pending" ? pending.length : decided.length;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 999,
                  background: active ? "#17181C" : "#FFFFFF", border: `1px solid ${active ? "#17181C" : "#E9EAEE"}`,
                  color: active ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer",
                }}>
                {t.label}
                <span style={{ fontSize: 10.5, fontWeight: 800, opacity: active ? 0.85 : 0.6 }}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "16px 20px 40px" }}>
        {err && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>
              {tab === "pending" ? "Tidak ada permintaan menunggu" : "Belum ada riwayat"}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>
              {tab === "pending" ? "Permintaan transfer nomor akan muncul di sini." : "Keputusan transfer akan tercatat di sini."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {list.map((r) => (
              <TransferCard key={r.id} r={r} busy={busyId === r.id} onApprove={() => decide(r.id, "approved")} onReject={() => decide(r.id, "rejected")} />
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function BackBar({ router }) {
  return (
    <button onClick={() => router.push("/martahub/m")}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
      <ArrowLeft size={16} /> Beranda
    </button>
  );
}

function statusBadge(status) {
  const map = {
    pending: { label: "Menunggu", color: "#B45309", bg: "rgba(180,83,9,0.10)", icon: <Clock size={11} /> },
    approved: { label: "Disetujui", color: "#15803D", bg: "rgba(21,128,61,0.10)", icon: <CheckCircle2 size={11} /> },
    rejected: { label: "Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)", icon: <XCircle size={11} /> },
  };
  return map[status] || { label: status || "-", color: "#6B7280", bg: "rgba(107,114,128,0.10)", icon: null };
}

function TransferCard({ r, busy, onApprove, onReject }) {
  const badge = statusBadge(r.status);
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "14px 15px", fontFamily: FF }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Phone size={14} color="#8A8A96" />
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{r.msisdn}</div>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: badge.color, background: badge.bg }}>
          {badge.icon} {badge.label}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "10px 11px", borderRadius: 10, background: "#F7F7F9" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 700, textTransform: "uppercase" }}>Dari</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#3A3A44", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.from_name || "-"}</div>
        </div>
        <ArrowRight size={14} color="#B0B0BA" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 700, textTransform: "uppercase" }}>Ke</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#3A3A44", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.to_name || "Anda"}</div>
        </div>
      </div>

      {r.to_category && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>
          Kategori: {r.to_category.toUpperCase()}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10.5, color: "#B0B0BA" }}>
        {new Date(r.created_at).toLocaleString("id-ID")}
        {r.decided_at ? ` · diputuskan ${new Date(r.decided_at).toLocaleString("id-ID")}` : ""}
      </div>

      {r.status === "pending" && (
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={onReject} disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: 11, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            Tolak
          </button>
          <button onClick={onApprove} disabled={busy}
            style={{ flex: 1.3, height: 42, borderRadius: 11, border: "none", background: BRAND, color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: busy ? "default" : "pointer", opacity: busy ? 0.75 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {busy ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={14} />}
            Setujui
          </button>
        </div>
      )}
    </div>
  );
}
