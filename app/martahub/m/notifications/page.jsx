"use client";
/**
 * /martahub/m/notifications — Inbox notifikasi (web mobile), padanan
 * `notifications_screen.dart` Flutter. Sumber data: `mh_notifications`,
 * diisi server-side (inline insert) oleh RPC lain saat ada kejadian relevan
 * (permintaan/keputusan transfer MSISDN, dst — lihat _shared/notifData.js) —
 * halaman ini HANYA baca & tandai terbaca, tidak pernah insert langsung.
 * SAMA PERSIS dgn Flutter: membuka halaman ini otomatis menandai SEMUA
 * notifikasi sebagai terbaca.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, ArrowRightLeft, CheckCircle2, XCircle, Clock } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, notifTypeMeta, translateNotifRoute } from "../_shared/notifData";

const TYPE_ICON = {
  msisdn_transfer_requested: ArrowRightLeft,
  msisdn_transfer_approved: CheckCircle2,
  msisdn_transfer_rejected: XCircle,
  activity_approved: CheckCircle2,
  activity_rejected: XCircle,
};

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function NotificationsPage() {
  const router = useRouter();
  const { loading: sessionLoading } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    (async () => {
      try {
        const data = await fetchNotifications(50);
        if (!alive) return;
        setRows(data);
        // Membuka inbox = tandai semua terbaca, SAMA PERSIS dgn initState()
        // notifications_screen.dart Flutter — best-effort, tidak menahan render.
        markAllNotificationsRead().catch(() => {});
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat notifikasi");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading]);

  async function openNotif(n) {
    if (!n.read_at) {
      markNotificationRead(n.id).catch(() => {});
      setRows((prev) => prev.map((r) => r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r));
    }
    const target = translateNotifRoute(n.route);
    if (target) router.push(target);
  }

  if (sessionLoading || rows === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push("/martahub/m")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> Beranda
        </button>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Bell size={19} color="#ED1C24" />
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Notifikasi</div>
        </div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 40px" }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada notifikasi</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Pemberitahuan approval &amp; transfer MSISDN akan muncul di sini.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((n) => (
              <NotifRow key={n.id} n={n} onOpen={() => openNotif(n)} />
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function NotifRow({ n, onOpen }) {
  const meta = notifTypeMeta(n.type);
  const Icon = TYPE_ICON[n.type] || Clock;
  const unread = !n.read_at;
  const clickable = !!translateNotifRoute(n.route);
  return (
    <button onClick={onOpen} disabled={!clickable}
      style={{
        textAlign: "left", width: "100%", background: unread ? "#FFF8F8" : "#FFFFFF",
        border: `1px solid ${unread ? "#F7C6C9" : "#E9EAEE"}`, borderRadius: 16, padding: "13px 14px",
        cursor: clickable ? "pointer" : "default", fontFamily: FF, display: "flex", gap: 11,
      }}>
      <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 11, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", color: meta.color, position: "relative" }}>
        <Icon size={16} />
        {unread && <span style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%", background: "#ED1C24", border: "2px solid #FFF8F8" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: meta.color, letterSpacing: 0.3 }}>{meta.label.toUpperCase()}</span>
          <span style={{ fontSize: 10, color: "#B0B0BA", fontWeight: 600, flexShrink: 0 }}>{timeAgo(n.created_at)}</span>
        </div>
        <div style={{ marginTop: 3, fontSize: 13, fontWeight: unread ? 800 : 700, color: "#17181C" }}>{n.title}</div>
        <div style={{ marginTop: 2, fontSize: 11.5, color: "#8A8A96", lineHeight: 1.4 }}>{n.body}</div>
      </div>
    </button>
  );
}
