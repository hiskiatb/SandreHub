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
  Building2, ChevronRight, Clock,
  CalendarPlus, ListChecks, Map as MapIcon, Trophy, ShieldCheck, ClipboardCheck, Lightbulb, PackageCheck,
  Target, CheckCircle2, Gauge, Wallet, Tags, LayoutDashboard, UserCog, FileEdit,
} from "lucide-react";
import supabaseMarta from "../../../lib/supabaseMarta";
import { applyMartaScope, loadBranchMap } from "../../../lib/martaScope";
import MobileShell, { useMartaSession, ShellSpinner, InlineSpinner, MartaSplash, FF, BRAND } from "./_shared/MobileShell";
import AppHeader, { Badge } from "./_shared/AppHeader";
import { fmtDate, fmtTimeLabel, fmtInt, isDraftIncomplete, activityStage } from "./_shared/activityUi";
import { APPROVER_ROLES, ADDABLE_ROLES_FOR, BRAND_DISPLAY, BRANDS } from "./_shared/planData";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ MOCK DASHBOARD DATA - HANYA UNTUK VISUALISASI, HAPUS KAPAN SAJA          ║
// ║ Set USE_MOCK_HOME_DATA = false (atau hapus blok ini + baris             ║
// ║ pemanggilannya di useEffect, cari "MOCK_HOME_ACTIVITIES") utk kembali    ║
// ║ ke data asli mh_activities_for_me. Tidak menyentuh database sama sekali ║
// ║ - murni override state lokal browser SETELAH fetch asli selesai.        ║
// ║ branch_id pakai UUID mh_branches ASLI (sama dgn mock dashboard web)     ║
// ║ supaya nama cabang tetap tampil benar utk role unscoped (admin/head/    ║
// ║ spm_sumatera) yang filternya baca dari branchMap.                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const USE_MOCK_HOME_DATA = false;
const MOCK_HOME_BRANCHES = {
  MEDAN: "61b44f8c-2af6-4cf3-a450-9ca695aad1ae",
  ACEH: "6444e7cf-e2bb-4cfd-81d0-c18c7c1d5ceb",
  PEKANBARU: "8d3177d7-4a0e-44b6-80c7-e4b53ea95742",
  PADANG: "04fc17ac-43de-4ec9-b960-5f27530775c8",
  PALEMBANG: "1afd6760-2f2a-4784-b424-a5ee180d7006",
  "BANDAR LAMPUNG": "785db1f7-283d-498d-9025-ec8764a973c5",
};
const MHB = MOCK_HOME_BRANCHES;
const MOCK_HOME_ACTIVITIES = [
  { id: "mock-h1", event_name: "Direct Selling Plaza Medan Fair", brand: "IM3", branch_id: MHB.MEDAN, mc: "MC-01", event_category: "directSelling", event_categories: null, plan_date: "2026-08-03", plan_date_start: null, plan_dates_multi: null, poi_type: "mall", status: "approved", checkin_valid: true, target_sp: 14, target_fwa: 8, actual_sp: 15, actual_fwa: 9, cost_actual: 4200000, actual_rev_3m: 9800000, created_at: "2026-08-03T09:15:00+07:00", site_id: "MDN-014" },
  { id: "mock-h2", event_name: "Sponsorship Festival Kuliner Aceh", brand: "TRI", branch_id: MHB.ACEH, mc: "MC-02", event_category: "sponsorship", event_categories: null, plan_date: "2026-08-06", plan_date_start: null, plan_dates_multi: null, poi_type: "outdoor", status: "approved", checkin_valid: true, target_sp: 10, target_fwa: 6, actual_sp: 9, actual_fwa: 5, cost_actual: 3100000, actual_rev_3m: 6400000, created_at: "2026-08-06T10:00:00+07:00", site_id: "ACH-002" },
  { id: "mock-h3", event_name: "Thematic Ramadan Preview Pekanbaru", brand: "IM3", branch_id: MHB.PEKANBARU, mc: "MC-05", event_category: "thematic", event_categories: null, plan_date: "2026-08-17", plan_date_start: null, plan_dates_multi: null, poi_type: "mall", status: "plan_submitted", checkin_valid: null, target_sp: 12, target_fwa: 7, actual_sp: null, actual_fwa: null, cost_actual: null, actual_rev_3m: null, created_at: "2026-08-17T08:30:00+07:00", site_id: "PKU-021" },
  { id: "mock-h4", event_name: "Joint Event Kampus Unand Padang", brand: "TRI", branch_id: MHB.PADANG, mc: "MC-08", event_category: "jointEvent", event_categories: null, plan_date: "2026-08-11", plan_date_start: null, plan_dates_multi: null, poi_type: "kampus", status: "approved", checkin_valid: true, target_sp: 15, target_fwa: 8, actual_sp: 15, actual_fwa: 8, cost_actual: 4900000, actual_rev_3m: 12200000, created_at: "2026-08-11T09:15:00+07:00", site_id: "PDG-007" },
  // Draft sengaja belum lengkap (tanpa site_id/poi_type) - biar banner
  // "draft belum selesai" di Beranda ikut ter-mockup, bukan cuma daftar biasa.
  { id: "mock-h5", event_name: "Project Perluasan Jaringan Aceh Besar", brand: "IM3", branch_id: MHB.ACEH, mc: null, event_category: "project", event_categories: null, plan_date: "2026-08-19", plan_date_start: null, plan_dates_multi: null, poi_type: null, status: "draft", checkin_valid: null, target_sp: 20, target_fwa: 12, actual_sp: null, actual_fwa: null, cost_actual: null, actual_rev_3m: null, created_at: "2026-08-19T07:45:00+07:00", site_id: null },
  { id: "mock-h6", event_name: "Direct Selling Jakabaring Palembang", brand: "IM3", branch_id: MHB.PALEMBANG, mc: "MC-09", event_category: "directSelling", event_categories: null, plan_date: "2026-08-06", plan_date_start: null, plan_dates_multi: null, poi_type: "outdoor", status: "approved", checkin_valid: true, target_sp: 12, target_fwa: 7, actual_sp: 13, actual_fwa: 7, cost_actual: 3700000, actual_rev_3m: 8900000, created_at: "2026-08-06T09:10:00+07:00", site_id: "PLB-030" },
  { id: "mock-h7", event_name: "Joint Event Kampus Unila Lampung", brand: "TRI", branch_id: MHB["BANDAR LAMPUNG"], mc: "MC-12", event_category: "jointEvent", event_categories: null, plan_date: "2026-08-14", plan_date_start: null, plan_dates_multi: null, poi_type: "kampus", status: "approved", checkin_valid: true, target_sp: 17, target_fwa: 9, actual_sp: 16, actual_fwa: 9, cost_actual: 5400000, actual_rev_3m: 12800000, created_at: "2026-08-14T09:15:00+07:00", site_id: "TLK-008" },
  // Approved tapi belum check-in - dipakai kartu Mission ("Plan siap -
  // lakukan check-in") supaya carousel Beranda tidak jatuh ke state kosong.
  { id: "mock-h8", event_name: "Open Booth Simpang Lima Aceh", brand: "IM3", branch_id: MHB.ACEH, mc: "MC-03", event_category: "openBooth", event_categories: null, plan_date: "2026-08-19", plan_date_start: null, plan_dates_multi: null, poi_type: "outdoor", status: "approved", checkin_valid: null, target_sp: 9, target_fwa: 5, actual_sp: null, actual_fwa: null, cost_actual: null, actual_rev_3m: null, created_at: "2026-08-19T07:00:00+07:00", site_id: "ACH-018" },
  { id: "mock-h9", event_name: "Sponsorship Car Free Day Pekanbaru", brand: "TRI", branch_id: MHB.PEKANBARU, mc: "MC-06", event_category: "sponsorship", event_categories: null, plan_date: "2026-08-12", plan_date_start: null, plan_dates_multi: null, poi_type: "outdoor", status: "plan_submitted", checkin_valid: null, target_sp: 8, target_fwa: 4, actual_sp: null, actual_fwa: null, cost_actual: null, actual_rev_3m: null, created_at: "2026-08-12T09:20:00+07:00", site_id: "PKU-011" },
  { id: "mock-h10", event_name: "Project Perluasan Way Halim Lampung", brand: "IM3", branch_id: MHB["BANDAR LAMPUNG"], mc: "MC-11", event_category: "project", event_categories: null, plan_date: "2026-08-19", plan_date_start: null, plan_dates_multi: null, poi_type: "outdoor", status: "approved", checkin_valid: true, target_sp: 10, target_fwa: 5, actual_sp: 11, actual_fwa: 6, cost_actual: 3300000, actual_rev_3m: 7900000, created_at: "2026-08-19T08:50:00+07:00", site_id: "TLK-021" },
];

const ROLE_LABEL = { bme_rge: "BME/RGE", tmv: "Brand TMV", head: "Head TMV", admin: "Admin", spm_sumatera: "SPM Sumatera" };
// mc/poi_type/event_categories/plan_date_start/plan_dates_multi ditambahkan
// supaya "draft belum lengkap" di Beranda pakai definisi yg SAMA PERSIS dgn
// halaman detail & daftar Aktivitas (lihat isDraftIncomplete di activityUi.js).
const ACTIVITY_COLS = "id,event_name,brand,branch_id,mc,event_category,event_categories,plan_date,plan_date_start,plan_date_end,plan_dates_multi,plan_date_times,is_all_day,start_time,end_time,poi_type,status,checkin_valid,target_sp,target_fwa,actual_sp,actual_fwa,cost_actual,actual_rev_3m,created_at,site_id";

// Rotasi harian (getDate() % TIPS.length) - deterministik per hari & ikut
// menyesuaikan otomatis kalau jumlah tips berubah, jadi tiap tips kebagian
// giliran tampil scr merata sepanjang bulan tanpa perlu state/random.
// Semua tips dijaga MAKSIMAL 2 baris di kartu carousel (WebkitLineClamp:2
// di CarouselCard) - kalimat sengaja dipadatkan spy tidak terpotong.
const TIPS = [
  "Isi laporan actual tepat di lokasi site (pakai \"Perbaiki Titik GPS\") supaya validasi laporan otomatis lolos tanpa perlu ditinjau manual.",
  "Upload foto dokumentasi yang jelas saat isi laporan actual - mempercepat proses validasi.",
  "Nomor MSISDN yang sudah tercatat di plan lain akan otomatis ditandai konflik - ajukan transfer langsung dari layar konflik tersebut.",
  "Plan belum lengkap otomatis tersimpan sbg draft - lanjutkan kapan saja dari menu Aktivitas.",
  "Plan ditandai Perlu Revisi? Baca dulu komentarnya di detail aktivitas sebelum mengedit.",
  "Laporan actual yang telat diisi setelah tanggal event ditandai Menunggu Laporan.",
  "Cek menu Kalender dulu sebelum buat plan baru, agar tidak bentrok tanggal dgn plan lain.",
  "Bandingkan target vs actual lewat tombol Lihat Plan vs Actual di kartu aktivitas.",
  "Nama lengkap bisa diubah sendiri lewat Profil > Informasi Akun, berlaku di semua role.",
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
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [branchMap, setBranchMap] = useState(() => new Map());
  // Nama branch per site utk kartu "Aktivitas Terbaru" - SAMA PERSIS dgn
  // pendekatan di daftar Aktivitas (activities/page.jsx): lewat mh_sites
  // (site_id -> branch text), BUKAN mh_activities.branch_id -> mh_branches
  // (branchMap di atas, dipakai KHUSUS utk opsi filter Branch/Region) - dua
  // tabel wilayah ini belum direkonsiliasi (lihat catatan di martaScope.js),
  // & utk banyak baris branch_id-nya ternyata tidak match ke mh_branches
  // sama sekali (makanya branch sempat tidak muncul di kartu ini).
  const [branchBySite, setBranchBySite] = useState({});
  const months = useMemo(monthOptions, []);
  const [monthKey, setMonthKey] = useState(months[0].key);
  const [branchFilter, setBranchFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  const isApprover = APPROVER_ROLES.includes(scope?.role);

  useEffect(() => {
    if (loading) return;
    let alive = true;
    const activitiesFetch = (async () => {
      try {
        const { data, error } = await supabaseMarta
          .rpc("mh_activities_for_me")
          .select(ACTIVITY_COLS)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        if (alive) setRows(data || []);

        const siteIds = Array.from(new Set((data || []).map((r) => r.site_id).filter(Boolean)));
        if (siteIds.length > 0) {
          const { data: siteRows } = await supabaseMarta.from("mh_sites").select("site_id,branch").in("site_id", siteIds);
          const map = {};
          (siteRows || []).forEach((s2) => { if (s2.branch) map[s2.site_id] = s2.branch; });
          if (alive) setBranchBySite(map);
        }
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat aktivitas");
      }
    })();
    // ── MOCK DASHBOARD DATA - lihat blok besar dekat import atas file
    // (MOCK_HOME_ACTIVITIES dkk). Override HANYA state lokal browser,
    // ditunggu lewat Promise.allSettled supaya BENAR-BENAR jalan setelah
    // fetch asli di atas selesai (bukan race/setTimeout tebakan). Hapus
    // blok ini + baris pemanggilannya utk kembali ke data asli.
    if (USE_MOCK_HOME_DATA) {
      Promise.allSettled([activitiesFetch]).then(() => {
        if (!alive) return;
        setRows(MOCK_HOME_ACTIVITIES);
        setErr("");
      });
    }
    return () => { alive = false; };
  }, [loading]);

  // Nama cabang utk filter - diperlukan siapa pun yg baris aktivitasnya
  // lintas cabang: admin/spm_sumatera (nasional), Head TMV (satu region,
  // tapi banyak cabang di dalamnya), maupun Brand TMV (region sendiri, tapi
  // brand-nya sendiri sudah terkunci - lihat canBrowseBranches/canBrowseBrands
  // di bawah). BME/RGE/TL DSF dst TETAP terkunci ke satu cabang saja, jadi
  // TIDAK perlu peta ini. Pakai loadBranchMap() yang sudah di-cache di
  // lib/martaScope.js (dipakai bareng applyMartaScope di bawah).
  const canBrowseBranches = !!(scope?.unscoped || scope?.role === "head" || scope?.role === "tmv");
  const canBrowseBrands = !!(scope?.unscoped || scope?.role === "head");
  useEffect(() => {
    if (loading || !canBrowseBranches) return;
    let alive = true;
    (async () => {
      try {
        // SIMPAN utuh {name, region} (bukan cuma nama) - dipakai branchOptions
        // di bawah utk menyaring cabang sesuai region Head/Brand TMV. Sebelumnya
        // opsi dibangun dari baris AKTIVITAS yg sudah ada (rows), jadi akun yg
        // belum pernah/baru sedikit ada aktivitas (mis. bulan ini masih 0%)
        // opsinya ikut kosong -> field kelihatan terkunci padahal harusnya bisa
        // dipilih. Sekarang diambil LANGSUNG dari master data mh_branches.
        const map = await loadBranchMap();
        if (alive) setBranchMap(map);
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
  }, [loading, canBrowseBranches]);

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

  if (loading) return <MartaSplash />;

  // Opsi filter Branch/Brand dibangun dari MASTER DATA (mh_branches lewat
  // branchMap, & daftar brand tetap), BUKAN dari `rows` (baris aktivitas yg
  // sudah ada) - sebelumnya dibangun dari rows, jadi akun yg belum/baru
  // sedikit aktivitas (mis. achievement masih 0%) opsinya ikut kosong dan
  // field kelihatan terkunci abu-abu padahal harusnya bisa dipilih (spm_
  // sumatera/admin selalu; Head TMV & Brand TMV disaring ke region sendiri).
  const branchOptions = canBrowseBranches
    ? Array.from(branchMap.entries())
        .filter(([, b]) => scope?.unscoped || b.region === scope?.region)
        .map(([id, b]) => ({ value: id, label: b.name }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];
  const brandOptions = canBrowseBrands
    ? BRANDS.map((b) => ({ value: b, label: BRAND_DISPLAY[b] || b.toUpperCase() }))
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

  // Kartu "Mission" - aksi paling relevan berikutnya: butuh isi laporan
  // actual > lihat plan mendatang terdekat > kosong. Check-in DIHAPUS
  // (bukan lagi bagian dari alur - laporan actual langsung bisa diisi
  // begitu plan approved, tanpa perlu check-in GPS di lokasi dulu).
  const needsReport = (rows || []).find((r) => r.status === "approved" && r.actual_sp == null);
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
        <AppHeader scope={scope} email={email} />
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
              placeholder="SEMUA BRANCH"
              prefixLabel="BRANCH"
              options={canBrowseBranches ? branchOptions : ((scope?.branchName || scope?.region) ? [{ value: "self", label: scope.branchName || scope.region }] : [])}
              fullWidth
            />
          </div>
          <div style={{ flex: "3 1 0%", minWidth: 0 }}>
            <BrandTagSelect
              value={brandFilter}
              onChange={setBrandFilter}
              options={canBrowseBrands ? brandOptions : (scope?.brand ? [{ value: scope.brand, label: BRAND_DISPLAY[scope.brand] || scope.brand.toUpperCase() }] : [])}
            />
          </div>
        </div>
      </div>

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
          opacity: rows === null && !err ? 0.55 : 1, transition: "opacity .2s",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {rows === null && !err ? (
                <div style={{ width: 10, height: 10, border: "1.5px solid rgba(255,255,255,0.25)", borderTopColor: "#EC1E79", borderRadius: "50%", animation: "mspin 0.8s linear infinite" }} />
              ) : (
                <div style={{ width: 5, height: 5, borderRadius: 99, background: "linear-gradient(135deg,#E63325,#EC1E79)" }} />
              )}
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
          needsReport={needsReport} upcoming={upcoming}
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
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 12 }}>Menu Anda</div>
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
              <MenuItem icon={UserCog} label="Kelola User" color="#7C3AED" onClick={() => router.push("/martahub/m/user-management")} />
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
          <InlineSpinner label="Memuat aktivitas…" />
        ) : recent.length === 0 ? (
          <div style={{ marginTop: 14, textAlign: "center", padding: "32px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada aktivitas</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Aktivitas yang dibuat akan muncul di sini.</div>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {recent.map((r) => <ActivityRow key={r.id} r={r} branchLabel={branchBySite[r.site_id]} />)}
          </div>
        )}
      </div>
    </MobileShell>
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
function FilterSelect({ icon: Icon, value, onChange, placeholder, options, fullWidth, prefixLabel }) {
  const selected = options.find((o) => o.value === value);
  const interactive = options.length > 1;
  const label = selected ? selected.label : (options.length === 1 ? options[0].label : placeholder);
  const active = interactive && !!value;
  // Kata depan ("Cabang") SEBELUM nilainya - tanpa ini badge cuma nampilin
  // nama cabang polos (mis. "ACEH") yg ambigu itu label field apa, apalagi
  // di sebelah badge Brand yg juga cuma satu kata.
  const showPrefix = prefixLabel && (selected || options.length === 1);
  return (
    <div style={{
      position: "relative", display: fullWidth ? "flex" : "inline-flex", width: fullWidth ? "100%" : undefined,
      boxSizing: "border-box", alignItems: "center", gap: 7,
      minHeight: 40, padding: interactive ? "0 34px 0 14px" : "0 14px", borderRadius: 999,
      background: active ? "#FDECEC" : "#FFFFFF",
      border: `1.5px solid ${active ? "#ED1C24" : "#E4E5EA"}`,
      cursor: interactive ? "pointer" : "default",
    }}>
      <Icon size={13} color={active ? "#ED1C24" : "#8A8A96"} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? "#C62828" : "#3A3A44", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: fullWidth ? 1 : undefined, maxWidth: fullWidth ? undefined : 150 }}>
        {showPrefix && <span style={{ fontWeight: 600, opacity: 0.68 }}>{prefixLabel} </span>}
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
 * "ikon"-nya berupa TITIK POLOS bertinta warna brand masing² (IM3 = merah,
 * Tri = pink) - SENGAJA bukan lencana huruf ("i3"/"3") spt sebelumnya,
 * krn itu kebaca kayak singkatan asing yg membingungkan, bukan lambang.
 * Placeholder "Brand" (belum pilih) pakai ikon Tags generik dari lucide. */
const BRAND_TAG_COLORS = { im3: "#E53935", tri: "#E23B86" };
/** Sama seperti FilterSelect - mengikuti pola interaktif/terkunci yg sama:
 * panah HANYA muncul kalau options.length > 1, kalau cuma 1 opsi (brand
 * tunggal miliknya sendiri, role scoped) badge & teks otomatis diredupkan
 * jadi abu-abu netral (bukan warna brand) dan overlay <select> dilepas sama
 * sekali - jelas kelihatan itu cuma informasi, bukan tombol yg bisa ditekan. */
function BrandTagSelect({ value, onChange, options }) {
  const interactive = options.length > 1;
  const selected = options.find((o) => o.value === value);
  const effective = selected || (options.length === 1 ? options[0] : null);
  const color = effective ? (BRAND_TAG_COLORS[effective.value] || "#5A5A68") : "#9A9AA6";
  return (
    <div style={{
      position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", boxSizing: "border-box",
      minHeight: 40, padding: interactive ? "0 22px 0 10px" : "0 10px", borderRadius: 999,
      background: value ? `${color}14` : "#FFFFFF",
      border: `1.5px solid ${value ? color : "#E4E5EA"}`,
      cursor: interactive ? "pointer" : "default",
    }}>
      {effective ? (
        <span style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: color }} />
      ) : (
        <Tags size={12} color={color} strokeWidth={2.2} style={{ flexShrink: 0 }} />
      )}
      <span style={{ fontSize: 12, fontWeight: 800, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {effective ? <><span style={{ fontWeight: 600, opacity: 0.68 }}>BRAND </span>{effective.label}</> : "BRAND"}
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

function MissionCarousel({ needsReport, upcoming, isApprover, pendingApprovals, draftCount, router }) {
  const [page, setPage] = useState(0);
  const trackRef = useRef(null);
  const pausedRef = useRef(false);

  let missionCard;
  if (needsReport) {
    missionCard = { badge: "AKTIVITAS · LAPORAN", accent: "#C2187C", title: needsReport.event_name || "Isi Laporan", subtitle: "Plan sudah disetujui - lengkapi laporan actual sekarang.", cta: "Isi Laporan", action: () => router.push(`/martahub/m/activities/${needsReport.id}/submit`) };
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
// ikon + judul + subjudul (dibatasi 2 baris), dibungkus minHeight tetap
// supaya kartu tanpa CTA (Tips) tetap sama tingginya dgn yg lain. Label
// badge kecil ("ACTIVITY · DRAFT" dkk di atas judul) DIHAPUS - cuma makan
// baris ekstra tanpa nambah info baru (judul di bawahnya sudah cukup
// jelas), jadi kartu bisa lebih pendek. MIN_H ikut diperkecil sejalan
// dgn hilangnya baris badge itu.
const CAROUSEL_CARD_MIN_H = 78;

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
          <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: "#4A4A55", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{subtitle}</div>
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

// Warna brand - SAMA PERSIS dgn skema di wizard Buat Plan & kartu daftar
// Aktivitas (BRAND_COLOR di activities/page.jsx): IM3 kuning, 3ID magenta.
const HOME_BRAND_COLOR = { im3: "#F5CD46", tri: "#E23B86" };

// Kartu ini SEKARANG SAMA PERSIS bahasa visualnya dgn kartu di daftar
// Aktivitas (activities/page.jsx ActivityCard) - title, subtitle MC ·
// Branch · badge Brand solid, baris waktu, & pill status di bawahnya -
// CUMA TANPA blok "Plan vs Actual" (grid target/actual + banner revenue),
// krn kartu ringkas di Beranda ini murni utk sekilas lihat & lompat ke
// detail, bukan tempat baca breakdown angka. Pill kanan-atas juga PAKAI
// STATUS ASLI (statusMeta), bukan countdown "Hari Ini"/H- spt di kartu
// daftar Aktivitas - di Beranda user belum tentu fokus ke satu plan
// tertentu, jadi info "tahap apa" lebih berguna drpd "berapa hari lagi".
function ActivityRow({ r, branchLabel }) {
  const router = useRouter();
  // SATU pill status - activityStage() (activityUi.js) SEKARANG jadi
  // satu-satunya sumber label status, dipakai SAMA PERSIS dgn kartu di
  // daftar Aktivitas (dulu di sini "Hari Ini"/countdown dobel dgn pill
  // status lain di bawah, kelihatan kontradiksi).
  const stage = activityStage(r);
  const timeLabel = fmtTimeLabel(r);

  return (
    <button onClick={() => router.push(`/martahub/m/activities/${r.id}`)}
      style={{ position: "relative", textAlign: "left", width: "100%", background: "#FFFFFF", border: "1px solid #EDEDF1", borderRadius: 18, padding: "15px 16px", cursor: "pointer", fontFamily: FF, boxShadow: "0 2px 10px rgba(23,24,28,0.04), 0 1px 2px rgba(23,24,28,0.03)" }}>
      <span style={{
        position: "absolute", right: 16, bottom: 13,
        width: 30, height: 30, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E7E7EC",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <ChevronRight size={15} color="#5A5A68" />
      </span>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.event_name || "-"}</div>
          {/* Urutan subtitle: Brand (badge) → Branch → MC - brand paling kiri
              krn itu identitas paling cepat dikenali (warnanya), baru
              lingkup wilayah (Branch), baru siapa (MC). */}
          <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {r.brand && (
              <span style={{
                flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap",
                background: HOME_BRAND_COLOR[r.brand.toLowerCase()] || "#8A8A96",
                color: r.brand.toLowerCase() === "tri" ? "#FFFFFF" : "#17181C",
              }}>
                {r.brand.toLowerCase() === "tri" ? "3ID" : "IM3"}
              </span>
            )}
            <span style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {[branchLabel, r.mc].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: stage.color, background: stage.bg, whiteSpace: "nowrap" }}>
          {stage.label}
        </span>
      </div>

      <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#5A5A68", fontWeight: 600, paddingRight: 28 }}>
        <Clock size={12} color="#B0B0BA" style={{ flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(r.plan_date)} · {timeLabel}</span>
      </div>
    </button>
  );
}
