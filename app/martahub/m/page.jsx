"use client";
/**
 * /martahub/m — Beranda sesi mobile-web MartaHub (BME/RGE).
 *
 * Padanan `dashboard_screen.dart` (Flutter) — sebelumnya versi web ini cuma
 * kartu ringkasan sederhana; direstrukturisasi supaya elemen yang sudah
 * dikembangkan di Flutter tidak "hilang" saat migrasi ke web:
 *   1. Kartu ACHIEVEMENT dgn selector bulan + progress bar + kuadran
 *      Plan/Actual/Productivity/Cost Ratio (bukan cuma % SP seperti sebelumnya).
 *   2. Carousel 3 kartu (Mission/Approval-Draft/Tips) + dot indicator,
 *      padanan `_MissionCarousel` Flutter.
 *   3. Grid "Menu" (Buat Plan/Aktivitas/Peta/Leaderboard/Transfer/Profil,
 *      +Approval khusus approver), padanan `_quickActions()` Flutter.
 * "Peta" masih ditandai SEGERA — belum ada padanan web-nya (map di Flutter
 * sendiri cuma scatter-plot custom, bukan basemap asli). Notifikasi sudah
 * punya inbox penuh di /martahub/m/notifications.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut, MapPin, Building2, ChevronRight, Sparkles, ArrowLeftRight, Bell,
  CalendarPlus, ListChecks, Map as MapIcon, Trophy, User2, ShieldCheck, ClipboardCheck, Lightbulb, PackageCheck,
} from "lucide-react";
import supabaseMarta from "../../../lib/supabaseMarta";
import { HubLogo } from "../../../components/HubLogo";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "./_shared/MobileShell";
import { statusMeta, fmtDate, fmtInt, MONTHS } from "./_shared/activityUi";
import { APPROVER_ROLES } from "./_shared/planData";
import { fetchUnreadCount } from "./_shared/notifData";

const ROLE_LABEL = { bme: "BME", rge: "RGE", tmv: "Brand TMV", head: "Head TMV", admin: "Admin", spm_sumatera: "SPM Sumatera" };
const ACTIVITY_COLS = "id,event_name,brand,event_category,plan_date,status,checkin_valid,target_sp,target_fwa,actual_sp,actual_fwa,cost_actual,actual_rev_3m,created_at";

const TIPS = [
  "Check-in tepat di lokasi site supaya validasi laporan otomatis lolos tanpa perlu ditinjau manual.",
  "Upload minimal 2 foto dokumentasi yang jelas saat mengisi laporan actual — ini wajib sebelum bisa dikirim.",
  "Nomor MSISDN yang sudah tercatat di plan lain akan otomatis ditandai konflik — ajukan transfer lewat menu Transfer MSISDN.",
];

function monthOptions() {
  const now = new Date();
  const opts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
}

export default function MartaMobileHome() {
  const router = useRouter();
  const { loading, email, scope } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [pendingTransfers, setPendingTransfers] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const months = useMemo(monthOptions, []);
  const [monthKey, setMonthKey] = useState(months[0].key);

  const isApprover = APPROVER_ROLES.includes(scope?.role);

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseMarta
          .rpc("mh_activities_for_me")
          .select(ACTIVITY_COLS)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat aktivitas");
      }
    })();
    (async () => {
      try {
        const { data } = await supabaseMarta.rpc("mh_msisdn_transfer_list_for_me");
        if (alive) setPendingTransfers((data || []).filter((t) => t.status === "pending").length);
      } catch { /* best-effort */ }
    })();
    (async () => {
      try {
        const n = await fetchUnreadCount();
        if (alive) setUnreadNotifs(n || 0);
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
  }, [loading]);

  // Hitung antrean approval hanya utk approver — query ringan terpisah,
  // TIDAK men-scope ulang mh_activities_for_me (yg utk approver mengembalikan
  // baris orang lain, bukan miliknya sendiri).
  useEffect(() => {
    if (loading || !isApprover) return;
    let alive = true;
    (async () => {
      try {
        const { count } = await supabaseMarta
          .from("mh_activities")
          .select("id", { count: "exact", head: true })
          .in("status", ["plan_submitted", "revision_actual"]);
        if (alive) setPendingApprovals(count || 0);
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isApprover]);

  const signOut = async () => {
    await supabaseMarta.auth.signOut();
    router.replace("/martahub/m/login");
  };

  if (loading) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  const monthRows = (rows || []).filter((r) => (r.plan_date || "").slice(0, 7) === monthKey);
  const targetSp = monthRows.reduce((s, r) => s + (r.target_sp || 0), 0);
  const actualSp = monthRows.reduce((s, r) => s + (r.actual_sp || 0), 0);
  const costTotal = monthRows.reduce((s, r) => s + (r.cost_actual || 0), 0);
  const revenueTotal = monthRows.reduce((s, r) => s + (r.actual_rev_3m || 0), 0);
  const achievementPct = targetSp > 0 ? Math.round((actualSp / targetSp) * 100) : 0;
  const productivityPct = costTotal > 0 ? Math.round((revenueTotal / costTotal) * 100) : null;
  const costRatioPct = revenueTotal > 0 ? Math.round((costTotal / revenueTotal) * 100) : null;
  const planCount = monthRows.length;
  const actualCount = monthRows.filter((r) => r.actual_sp != null).length;

  // Kartu "Mission" — aksi paling relevan berikutnya: butuh check-in dulu >
  // butuh isi laporan actual > lihat plan mendatang terdekat > kosong.
  const needsCheckin = (rows || []).find((r) => (r.status === "draft" || r.status === "approved") && r.checkin_valid == null);
  const needsReport = (rows || []).find((r) => r.checkin_valid != null && r.actual_sp == null);
  const upcoming = (rows || []).filter((r) => r.plan_date && r.plan_date >= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.plan_date > b.plan_date ? 1 : -1))[0];

  const draftCount = (rows || []).filter((r) => r.status === "draft").length;
  const recent = (rows || []).slice(0, 5);

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <HubLogo variant="marta" size={38} dark={false} shadow inBox />
            <div>
              <div style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600 }}>{greeting()},</div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {scope?.fullName || email}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => router.push("/martahub/m/transfers")}
              style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, cursor: "pointer", color: "#8A8A96" }}>
              <ArrowLeftRight size={15} />
              {pendingTransfers > 0 && <Badge n={pendingTransfers} />}
            </button>
            <button onClick={() => router.push("/martahub/m/notifications")}
              style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, cursor: "pointer", color: "#8A8A96" }}>
              <Bell size={15} />
              {unreadNotifs > 0 && <Badge n={unreadNotifs} />}
            </button>
            <button onClick={signOut}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, cursor: "pointer", color: "#8A8A96" }}>
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* Scope — sampai di sini authState sudah pasti 'active' (lihat
            useMartaSession di MobileShell.jsx, yg redirect ke /pending atau
            /revoked lebih dulu kalau belum aktif). */}
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(scope?.branchName || scope?.region) && <Pill icon={Building2} text={scope.branchName || scope.region} />}
          {scope?.brand && <Pill icon={MapPin} text={scope.brand.toUpperCase()} />}
        </div>
      </div>

      {/* ACHIEVEMENT card */}
      <div style={{ padding: "18px 20px 0" }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 20, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8A96", letterSpacing: 0.6, textTransform: "uppercase" }}>Achievement</div>
            <div style={{ position: "relative" }}>
              <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
                style={{ appearance: "none", WebkitAppearance: "none", background: "#F6F7F9", border: "1px solid #ECEDF0", borderRadius: 999, padding: "6px 26px 6px 12px", fontSize: 11.5, fontWeight: 700, color: "#3A3A44", fontFamily: FF, cursor: "pointer" }}>
                {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <ChevronRight size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: "#8A8A96", pointerEvents: "none" }} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", color: "#17181C" }}>{achievementPct}%</div>
            <div style={{ fontSize: 12.5, color: "#8A8A96", fontWeight: 600 }}>dari target bulan ini</div>
          </div>

          <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: "#F0F0F3", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(achievementPct, 100)}%`, borderRadius: 999, background: BRAND, transition: "width .3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>{achievementPct}%</span>
            <span style={{ fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>Target 100%</span>
          </div>

          <div style={{ display: "flex", marginTop: 16, paddingTop: 14, borderTop: "1px solid #F0F0F3" }}>
            <QuadStat label="Plan" value={fmtInt(planCount)} />
            <QuadStat label="Actual" value={fmtInt(actualCount)} valueColor="#C2187C" />
            <QuadStat label="Productivity" value={productivityPct != null ? `${productivityPct}%` : "—"} valueColor="#1A9E90" />
            <QuadStat label="Cost Ratio" value={costRatioPct != null ? `${costRatioPct}%` : "—"} valueColor="#1A9E90" />
          </div>
        </div>
      </div>

      {/* Carousel: Mission / Draft / Tips */}
      <div style={{ marginTop: 18 }}>
        <MissionCarousel
          needsCheckin={needsCheckin} needsReport={needsReport} upcoming={upcoming}
          isApprover={isApprover} pendingApprovals={pendingApprovals} draftCount={draftCount}
          router={router}
        />
      </div>

      {/* Menu grid */}
      <div style={{ padding: "22px 20px 0" }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 12 }}>Menu</div>
        <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 20, padding: "18px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", rowGap: 18 }}>
            <MenuItem icon={CalendarPlus} label="Buat Plan" onClick={() => router.push("/martahub/m/activities/new")} />
            <MenuItem icon={ListChecks} label="Aktivitas" onClick={() => router.push("/martahub/m/activities")} />
            <MenuItem icon={MapIcon} label="Peta" segera />
            <MenuItem icon={Trophy} label="Leaderboard" onClick={() => router.push("/martahub/m/leaderboard")} />
            <MenuItem icon={ArrowLeftRight} label="Transfer" onClick={() => router.push("/martahub/m/transfers")} badge={pendingTransfers} />
            <MenuItem icon={PackageCheck} label="POSM" onClick={() => router.push(isApprover ? "/martahub/m/posm/stock" : "/martahub/m/posm")} />
            {isApprover && <MenuItem icon={ShieldCheck} label="Approval" onClick={() => router.push("/martahub/approval")} badge={pendingApprovals} />}
            <MenuItem icon={Bell} label="Notifikasi" onClick={() => router.push("/martahub/m/notifications")} badge={unreadNotifs} />
            <MenuItem icon={User2} label="Profil" onClick={() => router.push("/martahub/m/profile")} />
          </div>
        </div>
      </div>

      {/* Aktivitas terbaru */}
      <div style={{ padding: "22px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em" }}>Aktivitas Terbaru</div>
          <button onClick={() => router.push("/martahub/m/activities")}
            style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", color: "#ED1C24", fontSize: 12.5, fontWeight: 700, fontFamily: FF }}>
            Lihat Semua <ChevronRight size={14} />
          </button>
        </div>

        {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {rows === null && !err ? (
          <div style={{ marginTop: 14 }}><ShellSpinner /></div>
        ) : recent.length === 0 ? (
          <div style={{ marginTop: 14, textAlign: "center", padding: "32px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada aktivitas</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Aktivitas yang dibuat akan muncul di sini.</div>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {recent.map((r) => <ActivityRow key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat Pagi";
  if (h < 15) return "Selamat Siang";
  if (h < 18) return "Selamat Sore";
  return "Selamat Malam";
}

function Badge({ n }) {
  return (
    <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: "#ED1C24", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "2px solid #F4F5F7" }}>
      {n}
    </span>
  );
}

function Pill({ icon: Icon, text }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999, background: "#FFFFFF", border: "1px solid #E9EAEE", fontSize: 12, fontWeight: 700, color: "#3A3A44" }}>
      <Icon size={12.5} color="#8A8A96" /> {text}
    </div>
  );
}

function QuadStat({ label, value, valueColor }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#B0B0BA", fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: valueColor || "#17181C" }}>{value}</div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, segera, badge }) {
  return (
    <button onClick={segera ? undefined : onClick} disabled={segera}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: "none", border: "none", cursor: segera ? "default" : "pointer", fontFamily: FF, padding: 0 }}>
      <div style={{ position: "relative", width: 52, height: 52, borderRadius: "50%", background: segera ? "#D8D9E0" : BRAND, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: segera ? "none" : "0 4px 12px rgba(17,17,20,0.1)" }}>
        <Icon size={22} color="#fff" strokeWidth={2.1} />
        {badge > 0 && <Badge n={badge} />}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: segera ? "#B0B0BA" : "#3A3A44", textAlign: "center", lineHeight: 1.3 }}>{label}</span>
      {segera && <span style={{ fontSize: 8, fontWeight: 800, color: "#C4C4CE", letterSpacing: 0.3, marginTop: -4 }}>SEGERA</span>}
    </button>
  );
}

function MissionCarousel({ needsCheckin, needsReport, upcoming, isApprover, pendingApprovals, draftCount, router }) {
  const [page, setPage] = useState(0);

  let missionCard;
  if (needsCheckin) {
    missionCard = { badge: "AKTIVITAS · CHECK IN", accent: "#1A9E90", title: needsCheckin.event_name || "Check In", subtitle: "Plan siap — lakukan check-in di lokasi site.", action: () => router.push(`/martahub/m/activities/${needsCheckin.id}/checkin`) };
  } else if (needsReport) {
    missionCard = { badge: "AKTIVITAS · LAPORAN", accent: "#C2187C", title: needsReport.event_name || "Isi Laporan", subtitle: "Check-in selesai — lengkapi laporan actual sekarang.", action: () => router.push(`/martahub/m/activities/${needsReport.id}/submit`) };
  } else if (upcoming) {
    missionCard = { badge: "AKTIVITAS · MENDATANG", accent: "#ED1C24", title: upcoming.event_name || "Plan Mendatang", subtitle: `Dijadwalkan ${fmtDate(upcoming.plan_date)}.`, action: () => router.push(`/martahub/m/activities/${upcoming.id}`) };
  } else {
    missionCard = { badge: "AKTIVITAS", accent: "#8A8A96", title: "Belum ada plan", subtitle: "Mulai buat plan aktivitas pertama Anda.", action: () => router.push("/martahub/m/activities/new") };
  }

  const approvalCard = isApprover
    ? { badge: "APPROVAL", accent: "#B45309", title: pendingApprovals > 0 ? `${pendingApprovals} menunggu persetujuan` : "Tidak ada antrean", subtitle: pendingApprovals > 0 ? "Ada plan/report yang perlu ditinjau." : "Semua plan & report sudah diputuskan.", action: () => router.push("/martahub/approval") }
    : { badge: "ACTIVITY · DRAFT", accent: "#1A9E90", title: draftCount > 0 ? `${draftCount} draft belum lengkap` : "Belum ada draft", subtitle: draftCount > 0 ? "Lanjutkan draft yang tersimpan sebelum diajukan." : "Plan yang disimpan sebagai draft tampil di sini.", action: () => router.push("/martahub/m/activities?tab=draft") };

  const tipsCard = { badge: "TIPS", accent: "#8A8A96", title: "Tips MartaHub", subtitle: TIPS[new Date().getDate() % TIPS.length], action: null };

  const cards = [missionCard, approvalCard, tipsCard];

  return (
    <div>
      <div
        onScroll={(e) => { const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth); if (i !== page) setPage(i); }}
        style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", gap: 0, paddingBottom: 2 }}
      >
        {cards.map((c, i) => (
          <div key={i} style={{ flex: "0 0 100%", scrollSnapAlign: "start", padding: "0 20px" }}>
            <CarouselCard {...c} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
        {cards.map((_, i) => (
          <span key={i} style={{ width: i === page ? 16 : 6, height: 6, borderRadius: 3, background: i === page ? "#ED1C24" : "#D8D9E0", transition: "width .2s" }} />
        ))}
      </div>
    </div>
  );
}

function CarouselCard({ badge, accent, title, subtitle, action }) {
  const Icon = badge?.includes("APPROVAL") ? ClipboardCheck : badge?.includes("TIPS") ? Lightbulb : ListChecks;
  return (
    <button onClick={action || undefined} disabled={!action}
      style={{ width: "100%", textAlign: "left", background: "#FFFFFF", border: "1px solid #E9EAEE", borderLeft: `4px solid ${accent}`, borderRadius: 18, padding: "16px 16px", cursor: action ? "pointer" : "default", fontFamily: FF, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 12, background: `${accent}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={19} color={accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: accent, letterSpacing: 0.4 }}>{badge}</span>
        </div>
        <div style={{ marginTop: 3, fontSize: 14, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ marginTop: 2, fontSize: 11.5, color: "#8A8A96", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{subtitle}</div>
      </div>
      {action && <ChevronRight size={16} color="#C4C4CE" style={{ flexShrink: 0 }} />}
    </button>
  );
}

function ActivityRow({ r }) {
  const router = useRouter();
  const meta = statusMeta(r.status);
  return (
    <button onClick={() => router.push(`/martahub/m/activities/${r.id}`)}
      style={{ textAlign: "left", width: "100%", background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "13px 14px", cursor: "pointer", fontFamily: FF }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.event_name || "—"}</div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>{fmtDate(r.plan_date)} · Target {fmtInt(r.target_sp)}/{fmtInt(r.target_fwa)} SP/FWA</div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
          {meta.label}
        </span>
      </div>
    </button>
  );
}
