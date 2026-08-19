"use client";
/**
 * /martahub/m - Beranda sesi mobile-web MartaHub (BME/RGE).
 *
 * Padanan `dashboard_screen.dart` (Flutter) - sebelumnya versi web ini cuma
 * kartu ringkasan sederhana; direstrukturisasi supaya elemen yang sudah
 * dikembangkan di Flutter tidak "hilang" saat migrasi ke web:
 *   1. Kartu ACHIEVEMENT dgn selector bulan + progress bar + kuadran
 *      Plan/Actual/Productivity/Cost Ratio (bukan cuma % SP seperti sebelumnya).
 *   2. Carousel 3 kartu (Mission/Approval-Draft/Tips) + dot indicator,
 *      padanan `_MissionCarousel` Flutter.
 *   3. Grid "Menu" (Buat Plan/Aktivitas/Peta/Leaderboard/Transfer/Profil,
 *      +Approval khusus approver), padanan `_quickActions()` Flutter.
 * "Peta" masih ditandai SEGERA - belum ada padanan web-nya (map di Flutter
 * sendiri cuma scatter-plot custom, bukan basemap asli). Notifikasi sudah
 * punya inbox penuh di /martahub/m/notifications.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut, Building2, ChevronRight, Bell,
  CalendarPlus, ListChecks, Map as MapIcon, Trophy, ShieldCheck, ClipboardCheck, Lightbulb, PackageCheck,
  Target, CheckCircle2, Gauge, Wallet, Tags, LayoutDashboard, UserCog, FileEdit,
} from "lucide-react";
import supabaseMarta from "../../../lib/supabaseMarta";
import { applyMartaScope, loadBranchMap } from "../../../lib/martaScope";
import MobileShell, { useMartaSession, ShellSpinner, MartaSplash, FF, BRAND } from "./_shared/MobileShell";
import { statusMeta, fmtDate, fmtInt, isDraftIncomplete } from "./_shared/activityUi";
import { APPROVER_ROLES, ADDABLE_ROLES_FOR, BRAND_DISPLAY } from "./_shared/planData";
import { fetchUnreadCount } from "./_shared/notifData";

const ROLE_LABEL = { bme: "BME", rge: "RGE", tmv: "Brand TMV", head: "Head TMV", admin: "Admin", spm_sumatera: "SPM Sumatera" };
// mc/poi_type/event_categories/plan_date_start/plan_dates_multi ditambahkan
// supaya "draft belum lengkap" di Beranda pakai definisi yg SAMA PERSIS dgn
// halaman detail & daftar Aktivitas (lihat isDraftIncomplete di activityUi.js).
const ACTIVITY_COLS = "id,event_name,brand,branch_id,mc,event_category,event_categories,plan_date,plan_date_start,plan_dates_multi,poi_type,status,checkin_valid,target_sp,target_fwa,actual_sp,actual_fwa,cost_actual,actual_rev_3m,created_at,site_id";

const TIPS = [
  "Check-in tepat di lokasi site supaya validasi laporan otomatis lolos tanpa perlu ditinjau manual.",
  "Upload minimal 2 foto dokumentasi yang jelas saat mengisi laporan actual - ini wajib sebelum bisa dikirim.",
  "Nomor MSISDN yang sudah tercatat di plan lain akan otomatis ditandai konflik - ajukan transfer langsung dari layar konflik tersebut.",
];

// Nama bulan lengkap khusus selector periode Home (MONTHS di activityUi.js
// sengaja tetap disingkat krn dipakai tampilan lain yg ruangnya lebih sempit).
const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// MartaHub mobile mulai dipakai Agustus 2026 - jangan tampilkan bulan
// sebelum itu di selector periode (tidak ada data plan sebelum tanggal
// ini, jadi cuma bikin daftar panjang isinya kosong semua).
const LAUNCH_YEAR = 2026, LAUNCH_MONTH = 7; // Agustus = index 7

function monthOptions() {
  const now = new Date();
  const launch = new Date(LAUNCH_YEAR, LAUNCH_MONTH, 1);
  const cursor = now < launch ? launch : now;
  const span = (cursor.getFullYear() - LAUNCH_YEAR) * 12 + (cursor.getMonth() - LAUNCH_MONTH);
  const opts = [];
  for (let i = 0; i <= span; i++) {
    const d = new Date(LAUNCH_YEAR, LAUNCH_MONTH + span - i, 1);
    opts.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}` });
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
  const [branchMap, setBranchMap] = useState(() => new Map());
  const months = useMemo(monthOptions, []);
  const [monthKey, setMonthKey] = useState(months[0].key);
  const [branchFilter, setBranchFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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

  // Nama cabang utk filter - hanya diperlukan role unscoped (admin/head/
  // spm_sumatera), yg baris aktivitasnya lintas cabang. Pakai loadBranchMap()
  // yang sudah di-cache di lib/martaScope.js (dipakai bareng applyMartaScope
  // di bawah) - sebelumnya halaman ini query mh_branches sendiri, padahal
  // isinya sama persis dgn yang sudah/akan diambil helper itu.
  useEffect(() => {
    if (loading || !scope?.unscoped) return;
    let alive = true;
    (async () => {
      try {
        const map = await loadBranchMap();
        if (alive) setBranchMap(new Map(Array.from(map, ([id, b]) => [id, b.name])));
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
  }, [loading, scope?.unscoped]);

  // Hitung antrean approval hanya utk approver - query ringan terpisah,
  // TIDAK men-scope ulang mh_activities_for_me (yg utk approver mengembalikan
  // baris orang lain, bukan miliknya sendiri).
  useEffect(() => {
    if (loading || !isApprover) return;
    let alive = true;
    (async () => {
      try {
        // Discope ke region×brand approver (sama persis dgn query di
        // /martahub/m/approval) - sebelumnya query ini TIDAK di-scope, jadi
        // badge-nya bisa lebih besar dari isi Approval Center yg sebenarnya
        // (approver brand/region tertentu tapi badge menghitung Sumatera).
        let q = supabaseMarta.from("mh_activities").select("id", { count: "exact", head: true }).in("status", ["plan_submitted", "revision_actual"]);
        q = await applyMartaScope(q, scope);
        const { count } = await q;
        if (alive) setPendingApprovals(count || 0);
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isApprover, scope]);

  // Keluar sekarang WAJIB lewat konfirmasi dulu (LogoutConfirmSheet) -
  // sebelumnya satu tap langsung logout, gampang kepencet tidak sengaja
  // krn posisinya persis sebelah ikon Notifikasi di header.
  const signOut = async () => {
    setLoggingOut(true);
    await supabaseMarta.auth.signOut();
    router.replace("/martahub/m/login");
  };

  if (loading) return <MartaSplash />;

  const branchOptions = scope?.unscoped
    ? Array.from(new Set((rows || []).map((r) => r.branch_id).filter(Boolean)))
        .map((id) => ({ value: id, label: branchMap.get(id) || id }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];
  const brandOptions = scope?.unscoped
    ? Array.from(new Set((rows || []).map((r) => r.brand).filter(Boolean)))
        .map((b) => ({ value: b, label: BRAND_DISPLAY[b] || b.toUpperCase() }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];

  // Perbandingan brand HARUS case-insensitive - rows di sini datang dari
  // mh_activities (brand disimpan "IM3"/"TRI", huruf besar), sedangkan
  // brandFilter utk role scoped (bme/rge/tmv dst) berasal dari scope.brand
  // (mh_profiles, "im3"/"tri" huruf kecil). Tanpa .toLowerCase() di sini,
  // memilih filter brand pada role scoped akan selalu menampilkan 0 hasil
  // krn "IM3" !== "im3".
  const scopedRows = (rows || []).filter((r) =>
    (!branchFilter || r.branch_id === branchFilter) && (!brandFilter || (r.brand || "").toLowerCase() === brandFilter.toLowerCase())
  );
  const monthRows = scopedRows.filter((r) => (r.plan_date || "").slice(0, 7) === monthKey);
  const targetSp = monthRows.reduce((s, r) => s + (r.target_sp || 0), 0);
  const actualSp = monthRows.reduce((s, r) => s + (r.actual_sp || 0), 0);
  const costTotal = monthRows.reduce((s, r) => s + (r.cost_actual || 0), 0);
  const revenueTotal = monthRows.reduce((s, r) => s + (r.actual_rev_3m || 0), 0);
  const achievementPct = targetSp > 0 ? Math.round((actualSp / targetSp) * 100) : 0;
  const productivityPct = costTotal > 0 ? Math.round((revenueTotal / costTotal) * 100) : null;
  const costRatioPct = revenueTotal > 0 ? Math.round((costTotal / revenueTotal) * 100) : null;
  const planCount = monthRows.length;
  const actualCount = monthRows.filter((r) => r.actual_sp != null).length;

  // Kartu "Mission" - aksi paling relevan berikutnya: butuh check-in dulu >
  // butuh isi laporan actual > lihat plan mendatang terdekat > kosong.
  // Draft BELUM boleh diminta check-in (belum diajukan/disetujui TMV) -
  // sebelumnya disamakan dgn "approved" jadi plan yang masih draft/belum
  // selesai muncul seolah "Plan siap - lakukan check-in". Draft yang belum
  // lengkap sudah dinudge lewat approvalCard "Lanjutkan Draft" di bawah.
  const needsCheckin = (rows || []).find((r) => r.status === "approved" && r.checkin_valid == null);
  const needsReport = (rows || []).find((r) => r.checkin_valid != null && r.actual_sp == null);
  const upcoming = (rows || []).filter((r) => r.plan_date && r.plan_date >= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.plan_date > b.plan_date ? 1 : -1))[0];

  const draftCount = (rows || []).filter((r) => r.status === "draft").length;
  // "Belum diselesaikan" = draft yg field wajib wizard-nya masih kosong
  // (definisi SAMA PERSIS dgn kartu Aktivitas & redirect otomatis di halaman
  // detail) - dipakai banner khusus di bawah supaya infonya jelas & tidak
  // terkubur di dalam carousel yg auto-geser.
  const draftIncompleteCount = (rows || []).filter((r) => r.status === "draft" && isDraftIncomplete(r)).length;
  const recent = (rows || []).slice(0, 5);

  return (
    <MobileShell active="home">
      {/* Header (sapaan/nama + Notifikasi/Keluar) STICKY dgn glass blur -
          sebelumnya ikut tergulung ke atas bareng konten krn cuma div biasa
          tanpa position:sticky sama sekali. Background buram SELALU aktif
          (bukan bergantung state scroll JS) supaya dijamin selalu solid &
          menempel di atas, sama seperti perbaikan di app Promotor. Filter
          Cabang/Brand SENGAJA dibiarkan di luar (scroll normal), cuma baris
          nama+ikon yang perlu selalu terlihat. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 12px",
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600 }}>{greeting()},</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {scope?.fullName || email}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Transfer MSISDN tidak lagi punya akses terpisah - permintaan yg
                ditujukan ke "yang bersangkutan" (pemilik nomor saat ini) masuk
                lewat inbox Notifikasi yang sama, badge-nya digabung di sini. */}
            <button onClick={() => router.push("/martahub/m/notifications")}
              style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, cursor: "pointer", color: "#8A8A96" }}>
              <Bell size={15} />
              {(unreadNotifs + pendingTransfers) > 0 && <Badge n={unreadNotifs + pendingTransfers} />}
            </button>
            {/* Keluar - sengaja diberi warna merah (beda dari Notifikasi)
                supaya aksi destruktif ini langsung terlihat beda tegas,
                dan sekarang butuh konfirmasi (LogoutConfirmSheet) dulu -
                bukan langsung logout begitu ditap. */}
            <button onClick={() => setLogoutConfirmOpen(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "#FDECEC", border: "1px solid #F6C6C6", borderRadius: 11, cursor: "pointer", color: "#ED1C24" }}>
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px 4px" }}>
        {/* Scope - sampai di sini authState sudah pasti 'active' (lihat
            useMartaSession di MobileShell.jsx, yg redirect ke /pending atau
            /revoked lebih dulu kalau belum aktif). Cabang & Brand SEKARANG
            SELALU dirender lewat komponen select yg sama persis (bukan
            berbeda antara role unscoped vs scoped seperti sebelumnya) -
            bedanya cuma DAFTAR OPSI: role unscoped (admin/head/spm_sumatera)
            dapat daftar penuh dari data & benar-benar bisa memfilter, role
            scoped (BME/RGE dst) cuma dikasih satu opsi (cabang/brand
            miliknya sendiri) sehingga field otomatis tampil non-interaktif
            (abu-abu, tanpa panah) - user langsung paham itu TIDAK BISA
            ditekan utk diganti, bukan cuma dropdown kosong yg mubazir. */}
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <div style={{ flex: "7 1 0%", minWidth: 0 }}>
            <FilterSelect
              icon={Building2}
              value={branchFilter}
              onChange={setBranchFilter}
              placeholder="Semua Cabang"
              options={scope?.unscoped ? branchOptions : ((scope?.branchName || scope?.region) ? [{ value: "self", label: scope.branchName || scope.region }] : [])}
              fullWidth
            />
          </div>
          <div style={{ flex: "3 1 0%", minWidth: 0 }}>
            <BrandTagSelect
              value={brandFilter}
              onChange={setBrandFilter}
              options={scope?.unscoped ? brandOptions : (scope?.brand ? [{ value: scope.brand, label: BRAND_DISPLAY[scope.brand] || scope.brand.toUpperCase() }] : [])}
            />
          </div>
        </div>
      </div>

      {logoutConfirmOpen && (
        <LogoutConfirmSheet
          loading={loggingOut}
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={signOut}
        />
      )}

      {/* Banner draft belum selesai - SENGAJA elemen berdiri sendiri yg
          SELALU terlihat (bukan dikubur di dalam MissionCarousel yg
          auto-geser tiap 5 detik & bisa saja user tidak sedang melihat
          kartu itu), supaya jumlah draft yg belum lengkap langsung jelas
          begitu buka Beranda. Hanya utk non-approver (approver melihat
          antrean approval-nya sendiri lewat carousel, bukan draft miliknya). */}
      {!isApprover && draftIncompleteCount > 0 && (
        <div style={{ padding: "16px 20px 0" }}>
          <button onClick={() => router.push("/martahub/m/activities?tab=draft")}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer", fontFamily: FF,
              padding: "14px 15px", borderRadius: 18, border: "1px solid #FED7AA",
              background: "linear-gradient(135deg, #FFF7ED 0%, #FFFBF5 65%)",
              boxShadow: "0 4px 14px rgba(194,65,12,0.08)",
            }}>
            <div style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 13, background: "linear-gradient(150deg,#F97316,#EA580C)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(234,88,12,0.28)" }}>
              <FileEdit size={19} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "#9A3412" }}>
                {draftIncompleteCount} draft belum selesai
              </div>
              <div style={{ marginTop: 2, fontSize: 11.5, color: "#B45309", fontWeight: 600, lineHeight: 1.4 }}>
                Lengkapi &amp; ajukan plan sebelum tanggal acara terlewat.
              </div>
            </div>
            <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 999, background: "rgba(234,88,12,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight size={15} color="#EA580C" />
            </div>
          </button>
        </div>
      )}

      {/* ACHIEVEMENT card - panel gelap premium: gradasi multi-stop (bukan
          abu flat), sheen halus di sudut, teks persentase gradient, quad
          stat dipisah hairline vertikal spt kartu fintech. Palet: abu
          #4A4A50, merah #E63325, kuning #F5CD46, teal #57C2AC, ungu #B32E85,
          pink #EC1E79. */}
      <div style={{ padding: "18px 20px 0" }}>
        <div style={{
          position: "relative", borderRadius: 22, padding: "20px 18px 18px",
          background: "linear-gradient(150deg,#38383E 0%,#4A4A50 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 8px 20px rgba(17,17,20,0.16), 0 2px 5px rgba(17,17,20,0.1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 5, height: 5, borderRadius: 99, background: "linear-gradient(135deg,#E63325,#EC1E79)" }} />
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: 1, textTransform: "uppercase" }}>Achievement</div>
            </div>
            <MonthSelect value={monthKey} onChange={setMonthKey} options={months} />
          </div>

          <div style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 8, marginTop: 18 }}>
            <div style={{
              fontSize: 42, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              background: "linear-gradient(120deg,#FFFFFF 0%,#F7D9E8 55%,#EC1E79 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>{achievementPct}%</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>dari target bulan ini</div>
          </div>

          <div style={{ marginTop: 16, height: 9, borderRadius: 999, background: "rgba(0,0,0,0.25)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(achievementPct, 100)}%`, borderRadius: 999, background: "linear-gradient(90deg,#E63325,#EC1E79)", transition: "width .3s" }} />
          </div>
          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", marginTop: 7 }}>
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>{achievementPct}%</span>
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Target 100%</span>
          </div>

          <div style={{ position: "relative", display: "flex", marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
            <QuadStat dark icon={Target} dot="#FFFFFF" label="Plan" value={fmtInt(planCount)} />
            <QuadDivider />
            <QuadStat dark icon={CheckCircle2} dot="#EC1E79" label="Actual" value={fmtInt(actualCount)} valueColor="#F286B4" />
            <QuadDivider />
            <QuadStat dark icon={Gauge} dot="#57C2AC" label="Productivity" value={productivityPct != null ? `${productivityPct}%` : "-"} valueColor="#7FD9C6" />
            <QuadDivider />
            <QuadStat dark icon={Wallet} dot="#F5CD46" label="Cost Ratio" value={costRatioPct != null ? `${costRatioPct}%` : "-"} valueColor="#F5CD46" />
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

      {/* Menu grid - tiap ikon dikasih warna aksen berbeda dari palet yg sama
          dgn kartu Achievement (bukan seragam merah-pink semua), supaya
          menu lebih gampang di-scan sekilas & terasa lebih "dirancang".
          Notifikasi & Profil SENGAJA tidak diulang di sini - keduanya
          sudah punya akses permanen sendiri (Notifikasi lewat ikon lonceng
          di header, Profil lewat tab bawah "Profil"), jadi Menu ini cuma
          isi aksi yg belum ada jalan pintas lain. */}
      <div style={{ padding: "22px 20px 0" }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 12 }}>Menu</div>
        <div style={{ background: "#FFFFFF", border: "1px solid #EDEDF1", borderRadius: 22, padding: "20px 12px", boxShadow: "0 6px 16px rgba(17,17,20,0.05), 0 1px 3px rgba(17,17,20,0.03)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", rowGap: 20 }}>
            <MenuItem icon={CalendarPlus} label="Buat Plan" color={BRAND} onClick={() => router.push("/martahub/m/activities/new")} />
            <MenuItem icon={ListChecks} label="Aktivitas" color="#57C2AC" onClick={() => router.push("/martahub/m/activities")} />
            <MenuItem icon={MapIcon} label="Peta" color="#1A9E90" onClick={() => router.push("/martahub/m/map")} />
            <MenuItem icon={Trophy} label="Leaderboard" color="#F5CD46" onClick={() => router.push("/martahub/m/leaderboard")} />
            {/* Sama seperti Aktivitas - SEMUA role masuk ke hub POSM yang
                sama (termasuk Head/Brand TMV), bukan langsung dialihkan ke
                Kelola Stok. Mereka bisa "Catat" instalasi & pilih sendiri
                mau pasang di branch mana; akses Kelola Stok tetap ada lewat
                quick-link di dalam hub POSM (lihat posm/page.jsx). */}
            <MenuItem icon={PackageCheck} label="POSM" color="#B32E85" onClick={() => router.push("/martahub/m/posm")} />
            {isApprover && <MenuItem icon={ShieldCheck} label="Approval" color="#E63325" onClick={() => router.push("/martahub/m/approval")} badge={pendingApprovals} />}
            {/* Management View - KHUSUS spm_sumatera (bukan approver lain),
                satu-satunya role yg benar-benar mengelola seluruh Sumatera
                tanpa batas region/brand. Beda dari Approval (yg soal
                memutuskan plan/laporan masuk) - ini soal pemantauan +
                edit tim secara total. */}
            {scope?.role === "spm_sumatera" && <MenuItem icon={LayoutDashboard} label="Management" color="#38383E" onClick={() => router.push("/martahub/m/management")} />}
            {/* User Management - halaman terpisah dari Management View,
                dibuka utk role yg punya "bawahan" utk dikelola (lihat
                ADDABLE_ROLES_FOR di planData.js: spm_sumatera/admin/head/
                tmv/bme/rge/tl_dsf). dsf/md/dst di bawah tl_dsf tidak dapat
                menu ini krn mereka tidak mengelola siapa pun. */}
            {Object.prototype.hasOwnProperty.call(ADDABLE_ROLES_FOR, scope?.role) && (
              <MenuItem icon={UserCog} label="User Management" color="#7C3AED" onClick={() => router.push("/martahub/m/user-management")} />
            )}
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

/** Pill berbentuk <select> - dipakai utk filter Cabang di Home. Sekarang
 * SELALU dipakai baik role unscoped (opsi banyak, benar-benar interaktif)
 * maupun scoped (cuma 1 opsi - cabang miliknya sendiri, otomatis terkunci).
 * Panah kanan HANYA muncul kalau options.length > 1 (baru benar-benar ada
 * pilihan lain utk dibuat) - kalau cuma 1 opsi, field beralih ke gaya
 * non-interaktif (abu-abu, tanpa overlay <select> sama sekali, cursor
 * default) supaya jelas terlihat SEKALI PANDANG bahwa field ini terkunci,
 * bukan dropdown kosong yg terlihat sama tapi ternyata tidak bisa apa-apa.
 * Saat interaktif, <select> ditumpuk transparan menutupi SELURUH pill
 * (overlay), jadi tap di mana saja di dalam pill membuka pilihan. */
function FilterSelect({ icon: Icon, value, onChange, placeholder, options, fullWidth }) {
  const selected = options.find((o) => o.value === value);
  const interactive = options.length > 1;
  const label = selected ? selected.label : (options.length === 1 ? options[0].label : placeholder);
  const active = interactive && !!value;
  return (
    <div style={{
      position: "relative", display: fullWidth ? "flex" : "inline-flex", width: fullWidth ? "100%" : undefined,
      boxSizing: "border-box", alignItems: "center", gap: 7,
      minHeight: 40, padding: interactive ? "0 34px 0 14px" : "0 14px", borderRadius: 999,
      background: !interactive ? "#F4F5F7" : (active ? "#FDECEC" : "#FFFFFF"),
      border: `1.5px solid ${!interactive ? "#E9EAEE" : (active ? "#ED1C24" : "#E4E5EA")}`,
      cursor: interactive ? "pointer" : "default",
    }}>
      <Icon size={13} color={!interactive ? "#B0B0BA" : (active ? "#ED1C24" : "#8A8A96")} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: !interactive ? "#9A9AA6" : (active ? "#C62828" : "#3A3A44"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: fullWidth ? 1 : undefined, maxWidth: fullWidth ? undefined : 150 }}>
        {label}
      </span>
      {interactive && (
        <ChevronRight size={12} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: active ? "#ED1C24" : "#8A8A96", pointerEvents: "none" }} />
      )}
      {interactive && (
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", cursor: "pointer", fontFamily: FF, fontSize: 16 }}>
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}

/** Brand ditampilkan sbg tag warna kecil (spt badge IM3/3ID di kartu lain
 * di app ini) - bukan field dropdown penuh, krn cuma 2 pilihan brand.
 * Belum ada logo brand asli (aset gambar) yg bisa dipakai di sini, jadi
 * "ikon"-nya berupa lencana huruf singkat bertinta warna brand masing²
 * (IM3 = merah, Tri = pink) - tetap kebaca sekilas persis logo, tanpa
 * bergantung ke file gambar eksternal. Placeholder "Brand" (belum pilih)
 * pakai ikon Tags generik dari lucide. */
const BRAND_TAG_COLORS = { im3: "#E53935", tri: "#E23B86" };
const BRAND_TAG_INITIAL = { im3: "i3", tri: "3" };
/** Sama seperti FilterSelect - mengikuti pola interaktif/terkunci yg sama:
 * panah HANYA muncul kalau options.length > 1, kalau cuma 1 opsi (brand
 * tunggal miliknya sendiri, role scoped) badge & teks otomatis diredupkan
 * jadi abu-abu netral (bukan warna brand) dan overlay <select> dilepas sama
 * sekali - jelas kelihatan itu cuma informasi, bukan tombol yg bisa ditekan. */
function BrandTagSelect({ value, onChange, options }) {
  const interactive = options.length > 1;
  const selected = options.find((o) => o.value === value);
  const effective = selected || (options.length === 1 ? options[0] : null);
  const color = interactive && effective ? (BRAND_TAG_COLORS[effective.value] || "#5A5A68") : "#9A9AA6";
  const initial = effective ? (BRAND_TAG_INITIAL[effective.value] || effective.label?.[0] || "?") : null;
  return (
    <div style={{
      position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", boxSizing: "border-box",
      minHeight: 40, padding: interactive ? "0 22px 0 10px" : "0 10px", borderRadius: 999,
      background: !interactive ? "#F4F5F7" : (value ? `${color}14` : "#FFFFFF"),
      border: `1.5px solid ${!interactive ? "#E9EAEE" : (value ? color : "#E4E5EA")}`,
      cursor: interactive ? "pointer" : "default",
    }}>
      {effective ? (
        <span style={{
          width: 16, height: 16, borderRadius: 5, flexShrink: 0, background: interactive ? color : "#B0B0BA", color: "#fff",
          fontSize: 8.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: -0.2,
        }}>{initial}</span>
      ) : (
        <Tags size={12} color={color} strokeWidth={2.2} style={{ flexShrink: 0 }} />
      )}
      <span style={{ fontSize: 12, fontWeight: 800, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {effective ? effective.label : "Brand"}
      </span>
      {interactive && (
        <ChevronRight size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%) rotate(90deg)", color, pointerEvents: "none" }} />
      )}
      {interactive && (
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Brand"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", cursor: "pointer", fontFamily: FF, fontSize: 16 }}>
          <option value="">Semua Brand</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}

/** Bottom sheet konfirmasi Keluar - dipanggil dari tombol Keluar merah di
 * header, mencegah logout tidak sengaja (posisinya persis sebelah ikon
 * Notifikasi). Bisa dibatalkan lewat tombol Batal ATAU tap backdrop, sama
 * seperti pola konfirmasi/detail lain di app ini (mis. ActivityDetailPopup). */
function LogoutConfirmSheet({ onCancel, onConfirm, loading }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FF }}>
      <div onClick={loading ? undefined : onCancel} style={{ position: "absolute", inset: 0, background: "rgba(23,24,28,0.45)" }} />
      <div style={{
        position: "relative", width: "100%", maxWidth: 480, boxSizing: "border-box",
        background: "#FFFFFF", borderRadius: "24px 24px 0 0",
        padding: "22px 20px calc(env(safe-area-inset-bottom,0px) + 20px)",
        boxShadow: "0 -10px 32px rgba(17,17,20,0.16)",
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 18px" }} />
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "#FDECEC", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <LogOut size={22} color="#ED1C24" />
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, textAlign: "center", color: "#17181C" }}>Keluar dari akun?</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", textAlign: "center", lineHeight: 1.5 }}>
          Anda perlu login kembali untuk mengakses MartaHub.
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={loading}
            style={{ flex: 1, padding: "13px 0", borderRadius: 14, background: "#F4F5F7", border: "1px solid #E4E5EA", fontSize: 13.5, fontWeight: 800, color: "#3A3A44", cursor: loading ? "default" : "pointer", fontFamily: FF }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            style={{ flex: 1, padding: "13px 0", borderRadius: 14, background: "#ED1C24", border: "none", fontSize: 13.5, fontWeight: 800, color: "#FFFFFF", cursor: loading ? "default" : "pointer", opacity: loading ? 0.75 : 1, fontFamily: FF }}>
            {loading ? "Memproses..." : "Ya, Keluar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Select periode Achievement - ditumpuk transparan (overlay) di atas label
 * yg selebar TEKS TERPILIH SAJA (bukan native <select> polos yg di banyak
 * browser lebar sendiri mengikuti opsi TERPANJANG dalam daftar, jadi
 * nyisain banyak ruang kosong pas opsi yg lagi aktif pendek, mis. "Mei
 * 2026" tapi lebarnya tetap segede "September 2026"). */
function MonthSelect({ value, onChange, options }) {
  const selected = options.find((o) => o.key === value);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", minHeight: 36, padding: "9px 30px 9px 14px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#FFFFFF", whiteSpace: "nowrap" }}>{selected?.label}</span>
      </div>
      <ChevronRight size={12} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: "rgba(255,255,255,0.6)", pointerEvents: "none" }} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Periode"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", cursor: "pointer", fontFamily: FF, fontSize: 16 }}>
        {options.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
    </div>
  );
}

/** Tiap kuadran kini punya ikon sendiri yg mencerminkan artinya (bukan cuma
 * titik warna generik): Plan = Target (rencana yg dibidik), Actual =
 * CheckCircle2 (yg sudah tercapai/tervalidasi), Productivity = Gauge
 * (kecepatan/efisiensi kerja), Cost Ratio = Wallet (efisiensi biaya) -
 * ditaruh dlm badge bulat tipis bertinta warna dot-nya masing-masing. */
function QuadStat({ label, value, valueColor, dark, dot, icon: Icon }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      {Icon && (
        <div style={{
          width: 22, height: 22, borderRadius: 8, margin: "0 auto 6px",
          background: dark ? `${dot}26` : `${dot}1A`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={12} color={dot} strokeWidth={2.4} />
        </div>
      )}
      <div style={{ fontSize: 9.5, color: dark ? "rgba(255,255,255,0.5)" : "#B0B0BA", fontWeight: 700, letterSpacing: 0.2 }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 15.5, fontWeight: 800, color: valueColor || (dark ? "#FFFFFF" : "#17181C") }}>{value}</div>
    </div>
  );
}

function QuadDivider() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.08)" }} />;
}

function MenuItem({ icon: Icon, label, onClick, segera, badge, color = BRAND }) {
  const bg = color.startsWith("linear-gradient") ? color : `linear-gradient(150deg, ${color}, ${color}CC)`;
  // Shadow tipis & rapat (bukan blur besar/menyebar spt glow) - cuma
  // ngangkat ikon dari kartu, warnanya ikut aksennya.
  const shadowColor = color.startsWith("linear-gradient") ? "rgba(237,28,36,0.2)" : `${color}30`;
  return (
    <button onClick={segera ? undefined : onClick} disabled={segera}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: "none", border: "none", cursor: segera ? "default" : "pointer", fontFamily: FF, padding: 0 }}>
      <div style={{ position: "relative", width: 50, height: 50, borderRadius: 15, background: segera ? "#EDEDF1" : bg, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: segera ? "none" : `0 3px 8px ${shadowColor}` }}>
        <Icon size={21} color={segera ? "#B0B0BA" : "#fff"} strokeWidth={2.1} />
        {badge > 0 && <Badge n={badge} />}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: segera ? "#B0B0BA" : "#3A3A44", textAlign: "center", lineHeight: 1.3 }}>{label}</span>
      {segera && <span style={{ fontSize: 8, fontWeight: 800, color: "#C4C4CE", letterSpacing: 0.3, marginTop: -4 }}>SEGERA</span>}
    </button>
  );
}

function MissionCarousel({ needsCheckin, needsReport, upcoming, isApprover, pendingApprovals, draftCount, router }) {
  const [page, setPage] = useState(0);
  const trackRef = useRef(null);
  const pausedRef = useRef(false);

  let missionCard;
  if (needsCheckin) {
    missionCard = { badge: "AKTIVITAS · CHECK IN", accent: "#1A9E90", title: needsCheckin.event_name || "Check In", subtitle: "Plan siap - lakukan check-in di lokasi site.", cta: "Check-in Sekarang", action: () => router.push(`/martahub/m/activities/${needsCheckin.id}/checkin`) };
  } else if (needsReport) {
    missionCard = { badge: "AKTIVITAS · LAPORAN", accent: "#C2187C", title: needsReport.event_name || "Isi Laporan", subtitle: "Check-in selesai - lengkapi laporan actual sekarang.", cta: "Isi Laporan", action: () => router.push(`/martahub/m/activities/${needsReport.id}/submit`) };
  } else if (upcoming) {
    // Lokasi ikut ditampilkan (site_id plan) - sebelumnya cuma tanggal,
    // padahal ini kartu "mendatang" yg paling relevan utk tahu KE MANA.
    missionCard = { badge: "AKTIVITAS · MENDATANG", accent: "#ED1C24", title: upcoming.event_name || "Plan Mendatang", subtitle: `${fmtDate(upcoming.plan_date)}${upcoming.site_id ? ` · ${upcoming.site_id}` : ""}`, cta: "Lihat Detail", action: () => router.push(`/martahub/m/activities/${upcoming.id}`) };
  } else {
    missionCard = { badge: "AKTIVITAS", accent: "#6B6B76", title: "Belum ada plan", subtitle: "Mulai buat plan aktivitas pertama Anda.", cta: "Buat Plan Sekarang", action: () => router.push("/martahub/m/activities/new") };
  }

  const approvalCard = isApprover
    ? { badge: "APPROVAL", accent: "#B45309", title: pendingApprovals > 0 ? `${pendingApprovals} menunggu persetujuan` : "Tidak ada antrean", subtitle: pendingApprovals > 0 ? "Ada plan/report yang perlu ditinjau." : "Semua plan & report sudah diputuskan.", cta: pendingApprovals > 0 ? "Tinjau Sekarang" : "Lihat Detail", action: () => router.push("/martahub/m/approval") }
    : { badge: "ACTIVITY · DRAFT", accent: "#1A9E90", title: draftCount > 0 ? `${draftCount} draft belum lengkap` : "Belum ada draft", subtitle: draftCount > 0 ? "Lanjutkan draft yang tersimpan sebelum diajukan." : "Plan yang disimpan sebagai draft tampil di sini.", cta: draftCount > 0 ? "Lanjutkan Draft" : "Buat Plan", action: () => router.push("/martahub/m/activities?tab=draft") };

  const tipsCard = { badge: "TIPS", accent: "#6B6B76", title: "Tips MartaHub", subtitle: TIPS[new Date().getDate() % TIPS.length], cta: null, action: null };

  const cards = [missionCard, approvalCard, tipsCard];

  // Auto-swipe tiap 5 detik - berhenti sebentar kalau user lagi sentuh/geser
  // sendiri (pausedRef), supaya tidak "berebut" kontrol dgn scroll manual.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      const next = (page + 1) % cards.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
      setPage(next);
    }, 5000);
    return () => clearInterval(id);
  }, [page, cards.length]);

  return (
    <div>
      {/* Sembunyikan scrollbar horizontal bawaan browser - itu yg kelihatan
          spt "garis hitam" tebal di bawah kartu; indikator posisi kita
          sendiri (titik-titik di bawah) sudah cukup, tidak perlu dobel. */}
      <style>{`.mh-carousel-track{scrollbar-width:none;-ms-overflow-style:none}.mh-carousel-track::-webkit-scrollbar{display:none;height:0;width:0}`}</style>
      <div
        ref={trackRef}
        className="mh-carousel-track"
        onScroll={(e) => { const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth); if (i !== page) setPage(i); }}
        onTouchStart={() => { pausedRef.current = true; }}
        onTouchEnd={() => { setTimeout(() => { pausedRef.current = false; }, 4000); }}
        onMouseDown={() => { pausedRef.current = true; }}
        onMouseUp={() => { setTimeout(() => { pausedRef.current = false; }, 4000); }}
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

// Tinggi kartu carousel DISAMAKAN persis (bukan cuma "kebetulan mirip") -
// ketiga konsep (Aktivitas/Approval-Draft/Tips) pakai struktur identik:
// header (ikon+badge+judul+subjudul, dibatasi 2 baris) lalu footer CTA yg
// nempel di bawah lewat marginTop:"auto", dibungkus minHeight tetap supaya
// kartu tanpa CTA (Tips) tetap sama tingginya dgn yg lain. Diperkecil sejak
// CTA dipadatkan jadi chevron bulat sejajar ikon (bukan baris terpisah di
// bawah lagi) - kartu jadi tidak makan tempat tinggi.
const CAROUSEL_CARD_MIN_H = 92;

function CarouselCard({ badge, accent, title, subtitle, action, cta }) {
  const Icon = badge?.includes("APPROVAL") ? ClipboardCheck : badge?.includes("TIPS") ? Lightbulb : ListChecks;
  return (
    <button onClick={action || undefined} disabled={!action}
      style={{
        width: "100%", minHeight: CAROUSEL_CARD_MIN_H, boxSizing: "border-box",
        textAlign: "left", cursor: action ? "pointer" : "default", fontFamily: FF,
        display: "flex", flexDirection: "column", justifyContent: "center", borderRadius: 20, padding: "14px 16px",
        background: `linear-gradient(135deg, ${accent}14 0%, #FFFFFF 55%)`,
        border: `1px solid ${accent}30`,
        boxShadow: "0 4px 14px rgba(17,17,20,0.05), 0 1px 2px rgba(17,17,20,0.03)",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, flex: 1 }}>
        <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 13, background: `linear-gradient(150deg, ${accent}, ${accent}CC)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 10px ${accent}33` }}>
          <Icon size={19} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: accent, letterSpacing: 0.5 }}>{badge}</span>
          <div style={{ marginTop: 3, fontSize: 14, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: "#4A4A55", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{subtitle}</div>
        </div>
        {/* CTA dipadatkan jadi chevron saja di kanan, sejajar dgn ikon+teks
            (bukan baris terpisah di bawah) - supaya tinggi kartu tidak
            membengkak & tidak makan tempat, tapi masih jelas bisa ditap. */}
        {action && cta && (
          <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 999, background: `${accent}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronRight size={15} color={accent} />
          </div>
        )}
      </div>
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
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.event_name || "-"}</div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>{fmtDate(r.plan_date)} · Target {fmtInt(r.target_sp)}/{fmtInt(r.target_fwa)} SP/FWA</div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
          {meta.label}
        </span>
      </div>
    </button>
  );
}
