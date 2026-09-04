"use client";
/**
 * /martahub/m/posm/claims - Inbox persetujuan klaim stok POSM (khusus
 * approver). Padanan `posmat_claim_review_screen.dart` Flutter.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackagePlus, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { fmtInt } from "../../_shared/activityUi";
import { fetchClaimRequests, decideClaimRequest } from "../../_shared/posmData";
import { BRAND_DISPLAY } from "../../_shared/planData";

const TABS = [{ key: "pending", label: "Menunggu" }, { key: "approved", label: "Disetujui" }, { key: "rejected", label: "Ditolak" }];

export default function PosmClaimsPage() {
  const router = useRouter();
  const { loading: sessionLoading } = useMartaSession();
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function load(status) {
    setRows(null);
    try {
      const data = await fetchClaimRequests(status);
      setRows(data || []);
    } catch (e) {
      setErr(e.message || "Gagal memuat klaim stok");
      setRows([]);
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, tab]);

  async function decide(id, decision) {
    setBusyId(id);
    try {
      await decideClaimRequest(id, decision, null);
      await load(tab);
    } catch (e) {
      setErr(e.message || "Gagal memproses keputusan");
    } finally {
      setBusyId(null);
    }
  }

  if (sessionLoading) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push("/martahub/m")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> Beranda
        </button>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <PackagePlus size={19} color="#ED1C24" />
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Klaim Stok POSM</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "8px 14px", borderRadius: 999, background: tab === t.key ? "#17181C" : "#FFFFFF", border: `1px solid ${tab === t.key ? "#17181C" : "#E9EAEE"}`, color: tab === t.key ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 40px" }}>
        {rows === null ? (
          <ShellSpinner />
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Tidak ada klaim {TABS.find((t) => t.key === tab)?.label.toLowerCase()}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r) => (
              <ClaimCard key={r.id} r={r} busy={busyId === r.id} onApprove={() => decide(r.id, "approved")} onReject={() => decide(r.id, "rejected")} />
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function ClaimCard({ r, busy, onApprove, onReject }) {
  const badge = { pending: { label: "Menunggu", color: "#B45309", bg: "rgba(180,83,9,0.10)", icon: Clock },
    approved: { label: "Disetujui", color: "#15803D", bg: "rgba(21,128,61,0.10)", icon: CheckCircle2 },
    rejected: { label: "Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)", icon: XCircle } }[r.status] || {};
  const BadgeIcon = badge.icon || Clock;
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "14px 15px", fontFamily: FF }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>{r.requested_by_name || "-"}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{r.branch_id} · {BRAND_DISPLAY[r.brand] || (r.brand || "").toUpperCase()} · {r.month}</div>
        </div>
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: badge.color, background: badge.bg }}>
          <BadgeIcon size={10} /> {badge.label}
        </span>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {(r.items || []).map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "7px 10px", borderRadius: 9, background: "#F7F7F9" }}>
            <span style={{ fontWeight: 700, color: "#17181C" }}>{it.type_name || it.proposed_name}</span>
            <span style={{ color: "#5A5A68", fontWeight: 600 }}>{fmtInt(it.qty)} {it.unit}</span>
          </div>
        ))}
      </div>

      {r.note && <div style={{ marginTop: 8, fontSize: 11.5, color: "#8A8A96", fontStyle: "italic" }}>"{r.note}"</div>}
      <div style={{ marginTop: 8, fontSize: 10, color: "#B0B0BA" }}>{new Date(r.created_at).toLocaleString("id-ID")}</div>

      {r.status === "pending" && (
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={onReject} disabled={busy}
            style={{ flex: 1, height: 42, borderRadius: 11, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: busy ? "default" : "pointer" }}>
            Tolak
          </button>
          <button onClick={onApprove} disabled={busy}
            style={{ flex: 1.3, height: 42, borderRadius: 11, border: "none", background: BRAND, color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {busy ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={14} />}
            Setujui
          </button>
        </div>
      )}
    </div>
  );
}
