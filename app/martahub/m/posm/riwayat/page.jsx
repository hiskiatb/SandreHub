"use client";
/**
 * /martahub/m/posm/riwayat - Riwayat Instalasi POSM lengkap (dipisah dari
 * Beranda POSM supaya halaman utama tetap ringkas - Beranda cuma tampilkan
 * kartu ringkasan yang mengarah ke sini). Padanan histori instalasi
 * `md_activities_screen.dart` (Flutter), sisi BME/RGE.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, History, MapPin, Navigation, Milestone, CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF } from "../../_shared/MobileShell";
import { fmtInt } from "../../_shared/activityUi";
import { fetchMyInstallations, INSTALL_MODES } from "../../_shared/posmData";

const MODE_ICON = { activity: Milestone, outlet: MapPin, street: Navigation };

function reviewBadge(status) {
  const map = {
    valid: { label: "Tervalidasi", color: "#15803D", bg: "rgba(21,128,61,0.10)", icon: CheckCircle2 },
    approved: { label: "Tervalidasi", color: "#15803D", bg: "rgba(21,128,61,0.10)", icon: CheckCircle2 },
    mismatch: { label: "Tidak Cocok", color: "#DC2626", bg: "rgba(220,38,38,0.10)", icon: XCircle },
    rejected: { label: "Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)", icon: XCircle },
  };
  return map[status] || { label: "Menunggu Validasi", color: "#B45309", bg: "rgba(180,83,9,0.10)", icon: Clock };
}

export default function PosmRiwayatPage() {
  const router = useRouter();
  const { loading: sessionLoading } = useMartaSession();
  const [installs, setInstalls] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    fetchMyInstallations()
      .then((d) => { if (alive) setInstalls(d || []); })
      .catch((e) => { if (alive) setErr(e.message || "Gagal memuat riwayat instalasi"); });
    return () => { alive = false; };
  }, [sessionLoading]);

  if (sessionLoading || installs === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push("/martahub/m/posm")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> POSM
        </button>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <History size={18} color="#5A5A68" />
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Riwayat Instalasi</div>
        </div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>Semua pemasangan POSM yang pernah Anda catat</div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 100px" }}>
        {installs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada instalasi tercatat</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Pilih salah satu kategori POSM utk mulai mencatat pemasangan.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {installs.map((ins) => <InstallCard key={ins.id} ins={ins} router={router} />)}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function InstallCard({ ins, router }) {
  const Icon = MODE_ICON[ins.mode] || Milestone;
  const badge = reviewBadge(ins.location_status);
  const BadgeIcon = badge.icon;
  const label = ins.mode === "activity" ? (ins.activity_name || "Terikat Activity") : ins.mode === "outlet" ? (ins.retailer_outlet_name ? ins.retailer_outlet_name.toUpperCase() : (ins.site_id || "Terikat Outlet")) : (ins.street_description || "Street Branding");
  const totalQty = (ins.items || []).reduce((s, it) => s + Number(it.qty || 0), 0);
  const needsRevision = ins.retailer_outlet_code && ins.review_status === "revision_needed";
  return (
    <div style={{ textAlign: "left", width: "100%", background: needsRevision ? "#FFF7F7" : "#FFFFFF", border: `1px solid ${needsRevision ? "#F3C6C6" : "#E9EAEE"}`, borderRadius: 16, padding: "13px 14px", fontFamily: FF, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", color: "#5A5A68" }}>
          <Icon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
          <div style={{ marginTop: 3, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>
            {INSTALL_MODES.find((m) => m.key === ins.mode)?.label} · {fmtInt(totalQty)} item · {new Date(ins.created_at).toLocaleDateString("id-ID")}
          </div>
        </div>
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 800, padding: "4px 8px", borderRadius: 999, color: badge.color, background: badge.bg }}>
          <BadgeIcon size={10} /> {badge.label}
        </span>
      </div>
      {ins.plan_id && ins.in_period === false && (
        <div style={{ marginTop: 8, fontSize: 9.5, fontWeight: 800, color: "#B8860B", background: "rgba(184,134,11,0.10)", display: "inline-block", padding: "3px 8px", borderRadius: 999 }}>
          Di luar periode Plan
        </div>
      )}
      {needsRevision && (
        <div style={{ marginTop: 10, padding: "9px 10px", borderRadius: 11, background: "#FFFFFF", border: "1px solid #F3C6C6" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            <AlertTriangle size={13} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: "#7A1F1F", fontWeight: 600, lineHeight: 1.5, flex: 1 }}>
              CMS meminta revisi{ins.review_notes ? `: ${ins.review_notes}` : "."}
            </div>
          </div>
          <button onClick={() => router.push(`/martahub/m/posm/revisi/${ins.id}`)}
            style={{ marginTop: 8, width: "100%", height: 36, borderRadius: 10, border: "none", background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
            Perbaiki Sekarang
          </button>
        </div>
      )}
    </div>
  );
}
