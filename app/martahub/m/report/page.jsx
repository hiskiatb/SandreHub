"use client";
/**
 * /martahub/m/report - Report Hub (mobile). SATU halaman utk semua jenis
 * report di MartaHub - dipilih lewat PILL FILTER di atas (persis gaya tab
 * status "Semua/Plan Diajukan/Selesai" di menu Aktivitas), BUKAN navigasi
 * berjenjang ke halaman lain lagi.
 *
 * v3 (2026-09-16, revisi user): v2 sempat memisah jadi Report Hub (daftar
 * kartu) -> halaman detail /report/<slug> terpisah - user eksplisit minta
 * DIHAPUS langkah tambahan itu ("jangan ada step tambahan lagi ... dia
 * lebih ke filter diatas seperti ini", sambil kirim screenshot pill tab
 * Aktivitas). Sekarang report baru cukup ditambah sbg entry baru di
 * REPORT_TABS[] + satu branch di renderContent() - TIDAK perlu route/file
 * baru, & user tetap di halaman yang sama saat ganti jenis report (cuma
 * ganti pill).
 *
 * v4 (2026-09-16, revisi tampilan): 3 perbaikan eksplisit dari user -
 * (1) tombol kembali jadi ICON-ONLY dibungkus kotak bulat (bukan teks
 *     "Beranda" lagi) - konsisten dgn gaya tombol close/back kotak yg
 *     sudah dipakai di tempat lain (mis. CalendarPickerSheet).
 * (2) Pemilihan bulan (month picker) SEKARANG SEJAJAR (satu baris) dgn
 *     judul "Report" - makanya monthKey/months SEKARANG state di level
 *     ReportPage (bukan lagi di dalam KecamatanFokusReport), dioper turun
 *     lewat props ke tiap tab report yg butuh periode.
 * (3) Kartu ringkasan (hero TOTAL & tiap kartu branch) dirombak pakai
 *     bahasa visual "kartu summary" yg sama dgn kartu Achievement di
 *     Beranda (QuadStat: badge ikon bulat translucent di atas label+value),
 *     bukan lagi grid teks polos LABEL/value.
 */
import { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronDown, ChevronRight, ChevronLeft, MapPinned, RadioTower, Search, X, ArrowUpDown,
  AlertTriangle, Target, ListChecks, CheckCircle2, Megaphone, Users, Clock, ListFilter, Info, Check, CalendarRange,
  CardSim, Router, Share2, Loader2, Trophy, RefreshCw,
} from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF } from "../_shared/MobileShell";
import { fmtInt, fmtDate, fmtTimeLabel, fmtRp, statusMeta, activityStage } from "../_shared/activityUi";
import ActivityFlagBadges from "../_shared/ActivityFlagBadges";
import BottomSheet from "../_shared/BottomSheet";

// Warna pill brand - SAMA PERSIS dgn skema di ActivityCard (tab Aktivitas)
// spy kartu event di report ini terasa satu bahasa visual, bukan versi
// sendiri lagi.
const BRAND_COLOR = { im3: "#F5CD46", tri: "#E23B86" };
// Versi lookup case-insensitive + fallback abu-abu utk brand kosong/tak
// dikenal - dipakai breakdown "Kontribusi Brand" per branch di report
// Kecamatan Fokus (BRAND_COLOR sendiri dipakai apa adanya di ActivityCard
// asli & EventActivityCard, key-nya selalu lowercase persis dari sana).
function brandColor(brandKey) { return BRAND_COLOR[brandKey] || "#B0B0BA"; }
function brandLabel(brandKey) {
  if (brandKey === "tri") return "3ID";
  if (brandKey === "im3") return "IM3";
  return "Lainnya";
}

const LAUNCH_YEAR = 2026, LAUNCH_MONTH = 8; // September - Agustus blm mulai pakai MartaHub mobile
const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

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
function monthKeyToRange(key) {
  const [y, m] = key.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

// Daftar jenis report yg tampil sbg pill filter di atas - tambah report
// baru cukup nambah entry di sini + satu case baru di renderContent() di
// bawah, TIDAK perlu bikin route/file terpisah lagi. `needsMonth` menandai
// apakah report ini butuh filter periode (month picker di header cuma
// tampil kalau tab aktif butuh itu).
const REPORT_TABS = [
  { key: "kecamatan-fokus", label: "Kecamatan Fokus", icon: MapPinned, needsMonth: false },
  { key: "site-lrs", label: "Site LRS", icon: RadioTower, needsMonth: false },
  { key: "campaign", label: "Campaign", icon: Megaphone, needsMonth: true },
];

export default function ReportPage() {
  const router = useRouter();
  const [tab, setTab] = useState(REPORT_TABS[0].key);
  const months = useMemo(() => monthOptions(), []);
  const [monthKey, setMonthKey] = useState(() => months[0]?.key || "");
  const activeTab = REPORT_TABS.find((t) => t.key === tab) || REPORT_TABS[0];

  // Periode Kecamatan Fokus SEKARANG checklist multi-bulan (bukan 1
  // dropdown tunggal spt Campaign) - tetap ditaruh di kanan atas SEJAJAR
  // judul "Report" (posisi yg sama persis dgn month picker Campaign),
  // makanya state-nya diangkat ke level ReportPage juga (bukan lokal di
  // dalam KecamatanFokusReport lagi). Centang >1 bulan = pilih RENTANG
  // (periode dikirim ke RPC = min..max dari bulan2 yg dicentang).
  const [kecSelectedMonths, setKecSelectedMonths] = useState(() => (months[0] ? [months[0].key] : []));
  const [kecMonthPickerOpen, setKecMonthPickerOpen] = useState(false);
  const toggleKecMonth = (key) => {
    setKecSelectedMonths((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key);
        return next.length ? next : prev; // minimal 1 bulan harus tetap tercentang
      }
      return [...prev, key];
    });
  };
  const kecPeriod = useMemo(() => {
    if (!kecSelectedMonths.length) return null;
    const sorted = kecSelectedMonths.slice().sort();
    return { start: monthKeyToRange(sorted[0]).start, end: monthKeyToRange(sorted[sorted.length - 1]).end };
  }, [kecSelectedMonths]);
  // Label SELALU tampilkan nama bulan penuh, TIDAK disingkat jadi
  // "A - B (N bulan)" - user eksplisit minta full list biar jelas bulan
  // apa saja yg lagi dicentang, brp pun jumlahnya.
  const kecPeriodLabel = useMemo(() => {
    const sorted = kecSelectedMonths.slice().sort();
    return sorted.map((k) => months.find((o) => o.key === k)?.label).filter(Boolean).join(", ");
  }, [kecSelectedMonths, months]);

  return (
    <MobileShell active="report">
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 16px) 20px 14px", fontFamily: FF,
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        {/* Tombol kembali (icon-only, kotak) SEKARANG SEJAJAR (satu baris)
            dgn judul "Report" - ikon report di depan judul DIHAPUS (tombol
            kembali sudah cukup jadi penanda navigasi, tidak perlu ikon
            kedua lagi di sebelahnya). Month picker tetap di ujung kanan
            baris yg sama. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <button onClick={() => router.push("/martahub/m")} aria-label="Kembali ke Beranda"
              style={{
                width: 34, height: 34, borderRadius: 11, background: "#FFFFFF", border: "1px solid #E9EAEE",
                boxShadow: "0 1px 4px rgba(23,24,28,0.06)", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#3A3A44", flexShrink: 0,
              }}>
              <ArrowLeft size={16} strokeWidth={2.4} />
            </button>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Report</div>
          </div>

          {activeTab.needsMonth && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
                style={{
                  appearance: "none", WebkitAppearance: "none", background: "#F6F7F9", border: "1px solid #ECEDF0",
                  borderRadius: 999, padding: "8px 30px 8px 14px", fontSize: 12.5, fontWeight: 700, color: "#17181C",
                  fontFamily: FF, cursor: "pointer",
                }}>
                {months.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8A8A96" }} />
            </div>
          )}

          {/* Checklist multi-bulan Kecamatan Fokus - posisi SAMA PERSIS
              (kanan atas, sejajar judul Report) dgn dropdown bulan
              Campaign di atas, cuma beda tab yg mengaktifkannya. */}
          {(tab === "kecamatan-fokus" || tab === "site-lrs") && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button onClick={() => setKecMonthPickerOpen((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 14,
                  background: kecMonthPickerOpen ? "#EDE9FE" : "#F6F7F9", border: `1px solid ${kecMonthPickerOpen ? "#DDD3FB" : "#ECEDF0"}`,
                  cursor: "pointer", fontFamily: FF, maxWidth: 190, transition: "background .12s ease, border-color .12s ease",
                }}>
                <CalendarRange size={12.5} color={kecMonthPickerOpen ? "#7C3AED" : "#8A8A96"} style={{ flexShrink: 0, marginTop: 1 }} />
                {/* Label TIDAK disingkat/dielipsiskan lagi - kalau lebih
                    dari 1 bulan dicentang, teks boleh wrap ke baris
                    berikutnya di dalam chip ini (bukan lagi dipotong "..."). */}
                <span style={{ fontSize: 12, fontWeight: 700, color: kecMonthPickerOpen ? "#7C3AED" : "#17181C", whiteSpace: "normal", textAlign: "left", lineHeight: 1.3 }}>{kecPeriodLabel}</span>
                <ChevronDown size={13} color={kecMonthPickerOpen ? "#7C3AED" : "#8A8A96"} style={{ flexShrink: 0, marginTop: 1, transform: kecMonthPickerOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
              </button>

              {kecMonthPickerOpen && (
                <>
                  <div onClick={() => setKecMonthPickerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 24 }} />
                  <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: 8, zIndex: 25, width: 236, maxWidth: "calc(100vw - 40px)",
                    background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, boxShadow: "0 14px 34px rgba(23,24,28,0.16)", overflow: "hidden",
                  }}>
                    <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #F1F2F5" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>Pilih Periode</div>
                      <div style={{ marginTop: 2, fontSize: 10.5, color: "#8A8A96", fontWeight: 500 }}>Centang &gt;1 bulan utk pilih rentang - langsung diterapkan</div>
                    </div>
                    <div style={{ maxHeight: 240, overflowY: "auto", padding: 6 }}>
                      {months.map((o) => {
                        const checked = kecSelectedMonths.includes(o.key);
                        return (
                          <div key={o.key} onClick={() => toggleKecMonth(o.key)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderRadius: 10, cursor: "pointer",
                              background: checked ? "rgba(124,58,237,0.06)" : "transparent",
                            }}>
                            <div style={{
                              flexShrink: 0, width: 18, height: 18, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                              background: checked ? "#7C3AED" : "#FFFFFF", border: `1.5px solid ${checked ? "#7C3AED" : "#D3D4DA"}`, transition: "background .12s ease, border-color .12s ease",
                            }}>
                              {checked && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                            </div>
                            <span style={{ fontSize: 12.5, fontWeight: checked ? 800 : 600, color: checked ? "#17181C" : "#5A5A68" }}>{o.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Pill filter jenis report - gaya SAMA PERSIS dgn tab status di
            menu Aktivitas (active: latar hitam, inactive: putih+border tipis). */}
        <div className="mh-hide-scrollbar" style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {REPORT_TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 999,
                  background: active ? "#17181C" : "#FFFFFF", border: `1px solid ${active ? "#17181C" : "#E9EAEE"}`,
                  color: active ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
        <style jsx>{`
          .mh-hide-scrollbar::-webkit-scrollbar { display: none; height: 0; }
        `}</style>
      </div>

      <div style={{ fontFamily: FF }}>
        {tab === "kecamatan-fokus" && <KecamatanFokusReport period={kecPeriod} periodLabel={kecPeriodLabel} />}
        {tab === "site-lrs" && <FocusSiteReport mode="site-lrs" period={kecPeriod} periodLabel={kecPeriodLabel} />}
        {tab === "campaign" && <CampaignComplianceReport monthKey={monthKey} monthLabel={months.find((o) => o.key === monthKey)?.label || ""} />}
      </div>
    </MobileShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Report: Kecamatan Fokus & Site LRS - DUA report terpisah (dua pill di
// atas) tapi satu komponen `FocusSiteReport` yg sama - dikonfigurasi lewat
// `mode` (lihat FOCUS_MODES di bawah) krn struktur & interaksinya identik,
// cuma beda: sumber RPC, teks, dan warna aksen. Ringkasan per Branch (Site
// Fokus/LRS, Aktivitas Plan, Plan SP, Actual SP, Ach%, Site 0 SP) + filter
// Region + breakdown per branch berisi daftar site mana saja yg masuk.
//
// Data dari RPC `mh_kecamatan_fokus_report`/`mh_site_lrs_report`
// (p_caller_email, p_period_start, p_period_end) (SECURITY DEFINER) -
// scoping visibilitas PERSIS pakai _mh_activity_calendar_rows() yg sudah
// dipakai Calendar CMS, bukan re-implement aturan role/region/branch dari
// nol.
//
// Metrik SEKARANG SP-only (Plan SP = target_sp, Actual SP = actual_sp) -
// user eksplisit minta ganti dari GA (SP+FWA) sebelumnya krn fokus
// achievement report ini SP saja, bukan gabungan SP+FWA lagi.
//
// Filter Region BARU - RPC skr ikut balikin kolom `region` per site, opsi
// dropdown diambil dari region2 yg MUNCUL di data (bukan daftar region
// statis), krn role scoped (mis. BME/RGE) memang cuma akan lihat 1 region
// atau bahkan 0 opsi (kalau branch-nya lintas region tidak ada) - dropdown
// otomatis nyembunyiin diri kalau opsi cuma <=1.
//
// monthKey/monthLabel SEKARANG dioper dari ReportPage (header) - komponen
// ini TIDAK punya month picker sendiri (lihat catatan v4 di atas).
// ──────────────────────────────────────────────────────────────────────────

function achPct(actual, plan) { return plan > 0 ? Math.round((actual / plan) * 100) : 0; }
// Sentinel value filter region "Semua Sumatera" - dibedakan dari string
// kosong ("" = belum diinisialisasi/belum tau region user) supaya efek
// auto-pilih default region tidak salah nimpa pilihan eksplisit user.
const REGION_ALL = "__ALL__";

function achColor(pct) { return pct >= 100 ? "#6D28D9" : pct >= 40 ? "#2E7D32" : pct >= 20 ? "#B45309" : "#C62828"; }
function achBg(pct) { return pct >= 100 ? "#F1E9FE" : pct >= 40 ? "#E8F5E9" : pct >= 20 ? "#FFF3E0" : "#FFEBEE"; }

// Label tren ringkas "vs periode sebelumnya" - kalau periode sebelumnya
// BENAR2 kosong (0 plan & 0 actual, blm ada histori sama sekali, bukan
// cuma actual 0), jangan tampilkan persen (bisa nyesatkan/kelihatan
// "+100%" padahal cuma krn belum ada data pembanding) - tampilkan
// "Blm ada pembanding" netral. Kalau ADA histori tapi actual kemarin 0
// & sekarang >0, tetap tampilkan sbg "Baru" (bukan persen tak terhingga).
function trendInfo(actual, prevActual, prevPlan) {
  const hasPrevData = Number(prevActual || 0) > 0 || Number(prevPlan || 0) > 0;
  if (!hasPrevData) return { label: "Blm ada pembanding", pct: null, dir: 0 };
  if (Number(prevActual || 0) === 0) return { label: "Baru", pct: null, dir: 1 };
  const diff = Number(actual || 0) - Number(prevActual || 0);
  const pct = Math.round((diff / Number(prevActual)) * 100);
  return { label: `${pct > 0 ? "+" : ""}${pct}%`, pct, dir: pct > 0 ? 1 : pct < 0 ? -1 : 0 };
}

const SORTS = [
  { key: "ach_asc", label: "Ach % Terendah" },
  { key: "ach_desc", label: "Ach % Tertinggi" },
  { key: "kecnol_desc", label: "Site 0 SP Terbanyak" },
  { key: "kecnol_asc", label: "Site 0 SP Tersedikit" },
];


// Warna badge rank #1/2/3 (emas/perak/perunggu) di daftar branch report
// Kecamatan Fokus - lihat branchRank di KecamatanFokusReport.
const RANK_MEDAL = {
  1: { bg: "#FFF6DC", fg: "#946200", border: "#F0D687" },
  2: { bg: "#F1F2F5", fg: "#5A5A68", border: "#D9DBE0" },
  3: { bg: "#FDEEE3", fg: "#A85D1E", border: "#F0C89A" },
};

// Konfigurasi per mode - teks & warna aksen beda, struktur & interaksi
// sama. "site-lrs" pakai aksen biru (bukan pink Kecamatan Fokus) supaya
// dua report ini kelihatan beda sekilas pandang walau layoutnya identik.
const FOCUS_MODES = {
  "kecamatan-fokus": {
    rpc: "mh_kecamatan_fokus_report",
    unitLabel: "Site Fokus",
    totalEntity: "kecamatan",
    totalUnitLabel: "Kecamatan Fokus",
    subtitle: "Pencapaian SP di site yang ditandai Kecamatan Fokus, per branch",
    emptyText: (branchName) => `Belum ada site yang ditandai Kecamatan Fokus${branchName ? ` di branch ${branchName}` : ""} - tandai lewat CMS > Master Data > List Site.`,
    detailTitle: "Site Kecamatan Fokus di",
    noteLabel: "kecamatan",
    eventsEmptyText: "Belum ada event/aktivitas yang tercatat di kecamatan ini pada periode ini.",
    accent: "#EC1E79",
    accentSoft: "#7FD9C6",
    heroGradient: "linear-gradient(150deg,#38383E 0%,#4A4A50 100%)",
    totalGradient: "linear-gradient(120deg,#FFFFFF 0%,#F7D9E8 55%,#EC1E79 100%)",
    barGradient: "linear-gradient(90deg,#E63325,#EC1E79)",
    dotSite: "#7C3AED",
    softBg: "rgba(124,58,237,0.1)",
  },
  "site-lrs": {
    rpc: "mh_site_lrs_report",
    unitLabel: "Site LRS",
    totalEntity: "site",
    totalUnitLabel: "Site LRS",
    subtitle: 'Pencapaian SP di site berkategori "LRS" (kolom Site LRS di List Site), per branch',
    emptyText: (branchName) => `Belum ada site berkategori LRS${branchName ? ` di branch ${branchName}` : ""} - cek kolom Site LRS di CMS > Master Data > List Site.`,
    detailTitle: "Site LRS di",
    noteLabel: "kecamatan",
    groupByKecamatan: false,
    kecEmptyNote: "",
    accent: "#0EA5E9",
    accentSoft: "#8AE0EF",
    heroGradient: "linear-gradient(150deg,#1B3A4B 0%,#215065 100%)",
    totalGradient: "linear-gradient(120deg,#FFFFFF 0%,#BFEAFB 55%,#0EA5E9 100%)",
    barGradient: "linear-gradient(90deg,#0369A1,#0EA5E9)",
    dotSite: "#0EA5E9",
    softBg: "rgba(14,165,233,0.1)",
  },
};

/**
 * Report KECAMATAN FOKUS - v5 (revisi user, 2026-09-20): SEBELUMNYA
 * breakdown-nya branch -> site langsung (2026-09-19: sempat ditambah 1
 * level kecamatan di TENGAH, tapi drill-down TERAKHIRNYA tetap ke
 * site-per-site). User eksplisit minta breakdown TIDAK perlu sampai level
 * site lagi - laporan cukup BY KECAMATAN saja (branch -> kecamatan,
 * selesai), dan tiap kecamatan menampilkan EVENT/aktivitas apa saja yang
 * SUDAH dilakukan di situ (bukan cuma angka Plan/Actual SP), sambil tetap
 * kasih PILIHAN site di kecamatan itu (site mana yang mau "digarap/attack"
 * berikutnya) tanpa menjadikannya breakdown utama.
 *
 * Data sudah diagregasi PER KECAMATAN dari server (RPC
 * mh_kecamatan_fokus_report v2 - lihat migrasi
 * mh_kecamatan_fokus_report_by_kecamatan): satu baris = satu kecamatan
 * fokus yang UNIK (kunci `kec_key` = branch + nama kecamatan, BUKAN cuma
 * nama kecamatannya sendirian - jaga-jaga kalau ada nama kecamatan yang
 * sama tapi beda branch/kabupaten, supaya tidak ke-gabung jadi satu),
 * dengan `events` (array aktivitas yang sudah/sedang berjalan di
 * kecamatan itu) dan `sites` (daftar site fokus di kecamatan itu utk
 * dipilih) sudah dikemas sbg JSON dari server - jauh lebih ringan drpd
 * versi lama yg fetch ribuan baris site-level lalu diagregasi di client.
 */
/**
 * Report KECAMATAN FOKUS - v6 (revisi user, 2026-09-20 malam): kunci
 * "kecamatan unik" SEKARANG PERSIS sama dgn kolom mh_sites.kecamatan yg
 * sudah digenerate di CMS (format "<kecamatan_name>|<kabupaten>", kolom
 * "Kecamatan Unik" di Master Data > List Site) - BUKAN kombinasi
 * branch+nama spt v5, supaya konsisten dgn satu-satunya sumber kebenaran
 * yg sudah ada di sistem. Kabupaten & Kecamatan tetap ditampilkan sbg DUA
 * kolom/baris TERPISAH di UI (biar enak dibaca), cuma kunci grouping-nya
 * yg gabungan.
 *
 * Kartu event di sini SEKARANG pakai bahasa visual yang SAMA PERSIS dgn
 * ActivityCard di tab Aktivitas (judul, pill brand, pill status pakai
 * activityStage(), baris waktu, ringkasan SP/FWA actual) - cuma versi
 * read-only (tanpa expand "Lihat Plan vs Actual"/tombol edit, krn di sini
 * cuma utk DIBACA, bukan dikelola).
 *
 * Site di tiap kecamatan SEKARANG eksplisit "BUKAN AKSI" - dia HANYA
 * FILTER: pilih satu/lebih site (tampil site_id-nya jg) utk mempersempit
 * daftar event yg ditampilkan ke site itu saja, murni bantu BME/TMV
 * "membaca arah" (site mana di kecamatan fokus ini yg SUDAH digarap vs
 * BELUM), TIDAK memicu pembuatan plan/laporan apa pun. Pilihan site
 * tsb terkunci ke SATU kecamatan yang sedang dibuka (reset begitu ganti
 * kecamatan lain).
 */
function KecamatanFokusReport({ period, periodLabel }) {
  const cfg = FOCUS_MODES["kecamatan-fokus"];
  const { loading: sessionLoading, scope, email } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [openBranch, setOpenBranch] = useState(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  // Share SEKARANG dua tahap: (1) render poster -> tampilkan PREVIEW dulu
  // di sheet (user bisa lihat hasil gambarnya SEBELUM benar2 terkirim ke
  // WhatsApp/share sheet OS, bisa Batal kalau ternyata belum pas), baru
  // (2) tombol "Bagikan" di preview itu yg benar2 men-trigger share/download.
  // `shareStage` dipakai jg utk kasih tahu progress DI TOMBOL Share
  // (label berubah tiap tahap: Menyiapkan -> Membuat Gambar -> Menyiapkan
  // Preview), bukan cuma spinner generik tanpa keterangan.
  const [shareStage, setShareStage] = useState("idle"); // idle | preparing | rendering | encoding | sending
  const [previewImg, setPreviewImg] = useState(null); // data URL poster, null = sheet preview tertutup
  const posterRef = useRef(null);
  const shareCanvasRef = useRef(null);
  const sharing = shareStage !== "idle";
  const SHARE_STAGE_LABEL = {
    preparing: "Menyiapkan...",
    rendering: "Membuat Gambar...",
    encoding: "Menyiapkan Preview...",
    sending: "Mengirim...",
  };

  useEffect(() => {
    if (sessionLoading || !period || !email) return;
    let alive = true;
    setRows(null); setErr(""); setRegion("");
    (async () => {
      try {
        // Sudah agregat per kecamatan UNIK di server (~100an baris) - satu
        // request biasa cukup, tidak perlu paging spt versi site-level lama.
        const { data, error } = await supabaseMarta.rpc(cfg.rpc, {
          p_caller_email: email, p_period_start: period.start, p_period_end: period.end,
        });
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) {
        if (alive) { setErr(e.message || "Gagal memuat report"); setRows([]); }
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, period, email, cfg.rpc]);

  const regionOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows || []) { if (r.region) set.add(r.region); }
    return Array.from(set).sort();
  }, [rows]);
  // Cuma role yg akses LINTAS region (spm_sumatera/admin, atau head tanpa
  // region terikat) yg baris RPC-nya bisa memuat >1 region sekaligus - jadi
  // "bisa lihat semua region" DIDETEKSI dari sini (regionOptions.length>1),
  // TANPA perlu tau role eksplisit di client. Role yg terikat SATU region
  // otomatis cuma py 1 opsi (server sudah nge-scope dari awal), jadi
  // pilihan "Semua Sumatera" scr alami tidak pernah muncul buat mereka.
  const canAllRegions = regionOptions.length > 1;

  // Default filter SEKARANG SATU region spesifik (bukan lagi "Semua
  // Region" sbg default) - DITURUNKAN (derived), bukan lewat setState di
  // effect: kalau `region` yg dipilih user belum valid (blm pernah pilih,
  // atau region lama ternyata sudah tidak ada di opsi baru mis. ganti
  // periode), effectiveRegion otomatis jatuh ke region PERTAMA (alfabetis)
  // tanpa perlu render tambahan. "Semua Sumatera" (sentinel REGION_ALL)
  // TETAP tersedia sbg pilihan eksplisit di dropdown, cuma bukan default -
  // role yg berhak lintas region tetap harus SENGAJA memilihnya.
  const effectiveRegion = (region === REGION_ALL || regionOptions.includes(region)) ? region : (regionOptions[0] || "");

  const scopedRows = useMemo(() => {
    if (!effectiveRegion || effectiveRegion === REGION_ALL) return rows || [];
    return (rows || []).filter((r) => r.region === effectiveRegion);
  }, [rows, effectiveRegion]);

  const branches = useMemo(() => {
    const map = new Map();
    const brandMaps = new Map();
    const mcMaps = new Map(); // total kontribusi per MC/BME - digabung dari mc_stats tiap kecamatan (leaderboard level branch)
    for (const kc of scopedRows) {
      const key = kc.branch || "-";
      if (!map.has(key)) {
        map.set(key, { branch: key, kecList: [], siteFocus: 0, aktivitasPlan: 0, planSp: 0, actualSp: 0, siteNol: 0, kecBelum: 0, prevPlanSp: 0, prevActualSp: 0, kecMangkrak: 0 });
        brandMaps.set(key, new Map());
        mcMaps.set(key, new Map());
      }
      const b = map.get(key);
      const sites = Array.isArray(kc.sites) ? kc.sites : [];
      const events = Array.isArray(kc.events) ? kc.events : [];
      const siteNol = sites.filter((s) => Number(s.actual_sp || 0) === 0).length;
      const belum = Number(kc.site_ada || 0) === 0;

      // Breakdown per BRAND KHUSUS kecamatan ini (bukan cuma level branch) -
      // dihitung dari event-nya sendiri, ditampilkan sbg CHIP TEKS ringkas
      // (bukan bar lagi) di kartu kecamatan pas dibuka - biar TIDAK ada dua
      // "bar chart" bertumpuk (branch + kecamatan) yg bikin UI ramai (lihat
      // keluhan user: "ada dua line chart bersamaan").
      const kcBrandMap = new Map();
      for (const ev of events) {
        const bk = (ev.brand || "lainnya").toLowerCase();
        if (!kcBrandMap.has(bk)) kcBrandMap.set(bk, { brand: bk, planSp: 0, actualSp: 0 });
        const kb = kcBrandMap.get(bk);
        kb.planSp += Number(ev.target_sp || 0);
        kb.actualSp += Number(ev.actual_sp || 0);
      }
      const kcBrandTotal = Array.from(kcBrandMap.values()).reduce((n, x) => n + x.actualSp, 0) || 1;
      const kcBrandStats = Array.from(kcBrandMap.values())
        .sort((x, y) => y.actualSp - x.actualSp)
        .map((x) => ({ ...x, share: Math.round((x.actualSp / kcBrandTotal) * 100) }));

      b.kecList.push({ ...kc, sites, events, siteNol, belum, pct: achPct(kc.actual_sp, kc.plan_sp), brandStats: kcBrandStats });
      b.siteFocus += Number(kc.site_count || 0);
      b.aktivitasPlan += Number(kc.aktivitas_plan || 0);
      b.planSp += Number(kc.plan_sp || 0);
      b.actualSp += Number(kc.actual_sp || 0);
      b.siteNol += siteNol;
      if (belum) b.kecBelum += 1;
      // Trend vs periode SEBELUMNYA (panjang periode sama, digeser mundur -
      // lihat mh_kecamatan_fokus_report) & "idle streak" (berapa periode
      // BERTURUT-TURUT termasuk periode ini kecamatan ini 0 aktivitas,
      // dibatasi maks 3 di server spy query tetap aman/murah - lihat
      // komentar migration). >=3 dianggap "mangkrak" & ditandai eksplisit.
      b.prevPlanSp += Number(kc.prev_plan_sp || 0);
      b.prevActualSp += Number(kc.prev_actual_sp || 0);
      if (Number(kc.idle_streak || 0) >= 3) b.kecMangkrak += 1;

      // Leaderboard MC/BME level branch - digabung dari mc_stats tiap
      // kecamatan (server sudah agregat per kecamatan, di sini tinggal
      // dijumlah naik ke level branch).
      const mm = mcMaps.get(key);
      for (const ms of (Array.isArray(kc.mc_stats) ? kc.mc_stats : [])) {
        if (!ms.mc) continue;
        if (!mm.has(ms.mc)) mm.set(ms.mc, { mc: ms.mc, actualSp: 0, eventCount: 0 });
        const mrow = mm.get(ms.mc);
        mrow.actualSp += Number(ms.actual_sp || 0);
        mrow.eventCount += Number(ms.event_count || 0);
      }

      // Breakdown kontribusi per BRAND (IM3/3ID) level BRANCH - diagregasi
      // naik dari event yg sama, dipakai utk bar "Kontribusi Brand" yg
      // LANGSUNG kelihatan di kartu branch tanpa expand.
      const bm = brandMaps.get(key);
      for (const ev of events) {
        const brandKey = (ev.brand || "lainnya").toLowerCase();
        if (!bm.has(brandKey)) bm.set(brandKey, { brand: brandKey, planSp: 0, actualSp: 0, eventCount: 0 });
        const bb = bm.get(brandKey);
        bb.planSp += Number(ev.target_sp || 0);
        bb.actualSp += Number(ev.actual_sp || 0);
        bb.eventCount += 1;
      }
    }
    return Array.from(map.values()).map((b) => {
      const brandStats = Array.from(brandMaps.get(b.branch).values()).sort((x, y) => y.actualSp - x.actualSp);
      const brandActualTotal = brandStats.reduce((n, x) => n + x.actualSp, 0) || 1;
      const mcLeaderboard = Array.from(mcMaps.get(b.branch).values()).sort((x, y) => y.actualSp - x.actualSp).slice(0, 5);
      return {
        ...b,
        kecList: b.kecList.slice().sort((x, y) =>
          (x.belum === y.belum ? 0 : x.belum ? -1 : 1) || y.pct - x.pct || x.kecamatan_name.localeCompare(y.kecamatan_name)
        ),
        brandStats: brandStats.map((x) => ({ ...x, share: Math.round((x.actualSp / brandActualTotal) * 100) })),
        mcLeaderboard,
      };
    });
  }, [scopedRows]);

  const total = useMemo(() => branches.reduce((acc, b) => ({
    kecCount: acc.kecCount + b.kecList.length,
    siteFocus: acc.siteFocus + b.siteFocus,
    aktivitasPlan: acc.aktivitasPlan + b.aktivitasPlan,
    planSp: acc.planSp + b.planSp,
    actualSp: acc.actualSp + b.actualSp,
    siteNol: acc.siteNol + b.siteNol,
    kecBelum: acc.kecBelum + b.kecBelum,
    prevPlanSp: acc.prevPlanSp + b.prevPlanSp,
    prevActualSp: acc.prevActualSp + b.prevActualSp,
    kecMangkrak: acc.kecMangkrak + b.kecMangkrak,
  }), { kecCount: 0, siteFocus: 0, aktivitasPlan: 0, planSp: 0, actualSp: 0, siteNol: 0, kecBelum: 0, prevPlanSp: 0, prevActualSp: 0, kecMangkrak: 0 }), [branches]);

  // Tren & "mangkrak" (idle streak) BUTUH data periode SEBELUMNYA - kalau
  // itu belum ada sama sekali (histori baru mulai terekam, blm ada bulan
  // pembanding), JANGAN tampilkan elemen2 yg butuh itu sama sekali (bukan
  // ditampilkan sbg placeholder "Blm ada pembanding") - user eksplisit
  // minta disembunyikan total drpd nampilin data kosong/tak berarti.
  const hasHistory = total.prevActualSp > 0 || total.prevPlanSp > 0;



  // Ranking branch berdasar pengerjaan Kecamatan Fokus - dinilai dari DUA
  // sisi sekaligus (bukan cuma Ach % SP, krn branch dgn Plan SP kecil bisa
  // gampang 100%+ tapi kecamatannya masih banyak yg belum tersentuh sama
  // sekali): (1) makin sedikit "Kec. 0 Aktivasi" (makin banyak kecamatan
  // yg SUDAH digarap), (2) makin tinggi Ach % SP. Rank ini FIXED (tidak
  // dipengaruhi pencarian) - "Peringkat Pengerjaan" SEKARANG jadi salah
  // satu opsi sort (malah jadi DEFAULT-nya), jadi begitu halaman dibuka
  // urutan tampilan otomatis SAMA dgn nomor badge-nya - tidak lagi
  // "berantakan" spt sebelumnya waktu badge (fixed) dipasangkan ke sort
  // lain (mis. Ach % Tertinggi) yg urutannya beda.
  const rankedBranches = useMemo(() => branches.slice().sort((a, b) => {
    const aKecRate = a.kecList.length > 0 ? (a.kecList.length - a.kecBelum) / a.kecList.length : 0;
    const bKecRate = b.kecList.length > 0 ? (b.kecList.length - b.kecBelum) / b.kecList.length : 0;
    return bKecRate - aKecRate || achPct(b.actualSp, b.planSp) - achPct(a.actualSp, a.planSp) || a.branch.localeCompare(b.branch);
  }), [branches]);

  const branchRank = useMemo(() => {
    const m = new Map();
    rankedBranches.forEach((b, i) => m.set(b.branch, i + 1));
    return m;
  }, [rankedBranches]);

  // Fitur pilihan sort dihapus atas permintaan user - urutan tampilan SELALU
  // sama dgn "Peringkat Pengerjaan" (rankedBranches), biar nomor rank di
  // badge dan urutan kartu selalu konsisten tanpa perlu dropdown lagi.
  const visibleBranches = rankedBranches;

  // Pencarian SEKARANG "meratakan" hasil - user eksplisit minta hasil cari
  // langsung kelihatan TANPA harus buka branch lalu buka kecamatan satu-satu
  // (dua gerbang klik). Begitu ada ketikan, tampilan pindah dari daftar
  // branch berjenjang ke DAFTAR KECAMATAN DATAR (lintas branch) yg cocok -
  // tiap kartu tinggal SATU klik lagi utk lihat detail event/site-nya.
  const kecSearchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out = [];
    for (const b of branches) {
      for (const kc of b.kecList) {
        const hit = b.branch.toLowerCase().includes(q) ||
          (kc.kecamatan_name || "").toLowerCase().includes(q) ||
          (kc.kabupaten || "").toLowerCase().includes(q);
        if (hit) out.push(kc);
      }
    }
    return out.sort((x, y) => (x.belum === y.belum ? 0 : x.belum ? -1 : 1) || y.pct - x.pct || x.kecamatan_name.localeCompare(y.kecamatan_name));
  }, [branches, query]);
  // Kartu KecEventCard SEKARANG SELALU tampil full detail (lihat komentar
  // di KecEventCard), jadi hasil pencarian - termasuk saat cuma satu match -
  // otomatis sudah "kebuka" tanpa perlu state/handling khusus lagi.

  const totalPct = achPct(total.actualSp, total.planSp);

  // Kontribusi brand GLOBAL (semua branch digabung) - dipakai poster share,
  // supaya orang yg terima report via WhatsApp langsung dapat gambaran
  // brand mana yg paling berkontribusi se-wilayah, bukan cuma per branch.
  const globalBrandStats = useMemo(() => {
    const m = new Map();
    for (const b of branches) {
      for (const bs of b.brandStats) {
        if (!m.has(bs.brand)) m.set(bs.brand, { brand: bs.brand, planSp: 0, actualSp: 0 });
        const g = m.get(bs.brand);
        g.planSp += bs.planSp;
        g.actualSp += bs.actualSp;
      }
    }
    const arr = Array.from(m.values()).sort((x, y) => y.actualSp - x.actualSp);
    const totalActual = arr.reduce((n, x) => n + x.actualSp, 0) || 1;
    return arr.map((x) => ({ ...x, share: Math.round((x.actualSp / totalActual) * 100) }));
  }, [branches]);

  // Export poster -> Share ke WhatsApp (atau kanal lain lewat share sheet
  // OS kalau tersedia file+gambar; fallback download gambar + buka wa.me
  // dgn teks siap kirim kalau browser tidak dukung Web Share API dgn file).
  // Tahap 1: render poster jadi gambar & TAMPILKAN PREVIEW dulu (belum
  // benar2 share apa pun) - label tombol ikut berubah per tahap
  // (SHARE_STAGE_LABEL) spy user tahu prosesnya masih berjalan & di tahap
  // mana, bukan cuma spinner diam tanpa keterangan.
  const handlePreviewShare = useCallback(async () => {
    if (!posterRef.current || sharing) return;
    setErr("");
    setShareStage("preparing");
    try {
      // requestAnimationFrame dulu spy label "Menyiapkan..." sempat kelihatan
      // minimal 1 frame sebelum html2canvas mulai kerja berat (blocking).
      await new Promise((r) => requestAnimationFrame(r));
      setShareStage("rendering");
      const html2canvas = (await import("html2canvas")).default;
      // scale 3 (bukan 2) - user minta hasil poster share SANGAT HD, worth
      // trade-off waktu render yg sedikit lebih lama krn cuma sekali per
      // share (bukan tiap render biasa).
      const canvas = await html2canvas(posterRef.current, { scale: 3, backgroundColor: "#FFFFFF", useCORS: true, logging: false });
      setShareStage("encoding");
      shareCanvasRef.current = canvas;
      const dataUrl = canvas.toDataURL("image/png");
      setPreviewImg(dataUrl);
      setShareStage("idle");
    } catch (e) {
      if (e?.name !== "AbortError") setErr("Gagal membuat preview report: " + (e?.message || String(e)));
      setShareStage("idle");
    }
  }, [sharing]);

  // Tahap 2: dipanggil dari tombol "Bagikan" DI DALAM sheet preview -
  // pakai canvas yg sudah dirender di tahap 1 (tidak render ulang), baru
  // di sini file/gambar beneran dikirim (Web Share API / fallback download
  // + wa.me).
  const handleConfirmShare = useCallback(async () => {
    const canvas = shareCanvasRef.current;
    if (!canvas) return;
    setShareStage("sending");
    try {
      const text = buildKecFokusShareText({ periodLabel, total, totalPct, rankedBranches, branchRank });
      const fileName = `report-kecamatan-fokus-${(period?.start || "").slice(0, 7)}.png`;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
      if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], text, title: "Report Kecamatan Fokus - MartaHub" });
      } else {
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
      }
      setPreviewImg(null);
      shareCanvasRef.current = null;
    } catch (e) {
      if (e?.name !== "AbortError") setErr("Gagal share report: " + (e?.message || String(e)));
    } finally {
      setShareStage("idle");
    }
  }, [periodLabel, total, totalPct, rankedBranches, branchRank, period]);

  const closePreview = useCallback(() => {
    setPreviewImg(null);
    shareCanvasRef.current = null;
  }, []);

  if (sessionLoading || rows === null) {
    return (
      <div style={{ padding: "20px 20px 0" }}><ShellSpinner /></div>
    );
  }

  return (
    <div style={{ padding: "14px 20px 28px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12, color: "#8A8A96", flex: 1 }}>
          {cfg.subtitle} - {periodLabel}.
        </div>
                {/* --- TOMBOL SHARE DI-HIDE SEMENTARA ---

        {branches.length > 0 && (
          <button onClick={handlePreviewShare} disabled={sharing}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 5, fontFamily: FF, cursor: sharing ? "default" : "pointer",
              background: "#fff", border: `1px solid ${cfg.accent}33`, borderRadius: 999, padding: "6px 12px",
              fontSize: 11, fontWeight: 800, color: cfg.accent, opacity: sharing ? 0.65 : 1, whiteSpace: "nowrap",
            }}>
            {sharing ? <Loader2 size={13} className="mh-spin" /> : <Share2 size={13} />}
            {sharing ? SHARE_STAGE_LABEL[shareStage] : "Share"}
          </button>
        )}
                  --------------------------------------- */}

      </div>
      <style>{`@keyframes mh-spin { to { transform: rotate(360deg); } } .mh-spin { animation: mh-spin .8s linear infinite; }`}</style>

      {err && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "#FFEBEE", border: "1px solid #F3C6D6", color: "#C62828", fontSize: 12.5 }}>{err}</div>
      )}

      {!err && branches.length === 0 && (
        <div style={{ marginTop: 40, textAlign: "center", color: "#8A8A96", fontSize: 13 }}>
          {cfg.emptyText(scope?.branchName)}
        </div>
      )}

      {branches.length > 0 && (
        <>
          <HeroSummaryCard cfg={cfg} branches={visibleBranches} total={total} totalPct={totalPct} hasHistory={hasHistory} />

          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px", position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={14} color="#B0B0BA" style={{ position: "absolute", left: 12, pointerEvents: "none" }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari branch, kecamatan, atau kabupaten..."
                style={{
                  width: "100%", background: "#F6F7F9", border: "1px solid #ECEDF0", borderRadius: 12,
                  padding: "9px 30px 9px 32px", fontSize: 12.5, color: "#17181C", fontFamily: FF, boxSizing: "border-box",
                }} />
              {query && (
                <button onClick={() => setQuery("")} style={{ position: "absolute", right: 8, background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}>
                  <X size={13} color="#B0B0BA" />
                </button>
              )}
            </div>
            {/* Filter region SELALU ditampilkan (dulu disembunyikan kalau
                cuma 1 region yg punya data Kecamatan Fokus saat ini) - biar
                selalu jelas region mana yg sedang dilihat/dipilih, dan
                otomatis siap begitu kecamatan fokus ditambah di region lain
                (CENTRAL/SOUTH SUMATERA) tanpa perlu ubah kode lagi. */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select value={effectiveRegion} onChange={(e) => setRegion(e.target.value)} disabled={regionOptions.length <= 1}
                style={{
                  appearance: "none", WebkitAppearance: "none", height: "100%", background: effectiveRegion === REGION_ALL ? "#EDF6FE" : "#F6F7F9",
                  border: `1px solid ${effectiveRegion === REGION_ALL ? "#BEE3FB" : "#ECEDF0"}`, borderRadius: 12, padding: "9px 28px 9px 10px",
                  fontSize: 11.5, fontWeight: 700, color: effectiveRegion === REGION_ALL ? "#0369A1" : "#17181C", fontFamily: FF,
                  cursor: regionOptions.length <= 1 ? "default" : "pointer", maxWidth: 150, opacity: regionOptions.length <= 1 ? 0.7 : 1,
                }}>
                {/* "Semua Sumatera" CUMA dirender kalau role ini memang bisa
                    akses >1 region (canAllRegions) - bukan default, tapi
                    tetap tersedia sbg pilihan eksplisit. */}
                {canAllRegions && <option value={REGION_ALL}>🌏 Semua Sumatera</option>}
                {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: effectiveRegion === REGION_ALL ? "#0369A1" : "#8A8A96" }} />
            </div>
          </div>

          {kecSearchResults ? (
            <>
              <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: "#8A8A96" }}>
                {kecSearchResults.length} kecamatan cocok dengan &quot;{query}&quot;
              </div>
              {kecSearchResults.length === 0 ? (
                <div style={{ marginTop: 20, textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>
                  Tidak ada hasil untuk &quot;{query}&quot;.
                </div>
              ) : (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {kecSearchResults.map((kc) => (
                    <KecEventCard key={kc.kec_key} kc={kc} cfg={cfg} showBranch hasHistory={hasHistory} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
              {visibleBranches.map((b) => {
                const pct = achPct(b.actualSp, b.planSp);
                const trend = trendInfo(b.actualSp, b.prevActualSp, b.prevPlanSp);
                const isOpen = openBranch === b.branch;
                const rank = branchRank.get(b.branch);
                const medal = RANK_MEDAL[rank];
                return (
                  <div key={b.branch} style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 18, boxShadow: "0 2px 10px rgba(23,24,28,0.04)" }}>
                    <button onClick={() => setOpenBranch(isOpen ? null : b.branch)}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px 8px", cursor: "pointer", fontFamily: FF }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          {/* Badge rank #1/2/3.. - peringkat FIXED pengerjaan
                              Kecamatan Fokus antar branch. Karena "Peringkat
                              Pengerjaan" sekarang jadi sort DEFAULT, urutan
                              tampilan normalnya SAMA dgn nomor ini - kalau
                              user ganti ke sort lain, badge tetap nomor yg
                              SAMA (bukan bug, cuma urutan tampilnya beda dari
                              urutan peringkat). Top 3 dpt warna medali. */}
                          <div style={{
                            flexShrink: 0, width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12.5, fontWeight: 800,
                            background: medal ? medal.bg : "#F1F2F5",
                            color: medal ? medal.fg : "#8A8A96",
                            border: medal ? `1.5px solid ${medal.border}` : "1px solid #ECEDF0",
                            boxShadow: medal ? `0 2px 6px ${medal.border}66` : "none",
                          }}>
                            {rank === 1 ? <Trophy size={14} strokeWidth={2.4} /> : rank}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: "0.06em" }}>Branch</div>
                              {b.kecBelum > 0 && <AlertTriangle size={11} color="#C62828" style={{ flexShrink: 0 }} />}
                            </div>
                            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.branch}</div>
                            {/* "Mangkrak" - kecamatan yg SUDAH 0 aktivitas
                                3 PERIODE BERTURUT-TURUT (bukan cuma periode
                                ini), paling perlu diprioritaskan drpd yg
                                baru sekali kelewat. */}
                            {hasHistory && b.kecMangkrak > 0 && (
                              <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800, color: "#C62828" }}>
                                <AlertTriangle size={9} strokeWidth={2.6} /> {b.kecMangkrak} kec. mangkrak ≥3 periode
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                            <span style={{ display: "flex", alignItems: "baseline", gap: 4, fontSize: 11.5, fontWeight: 800, color: achColor(pct), background: achBg(pct), borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
                              {pct}% <span style={{ fontSize: 8.5, fontWeight: 700, opacity: 0.75 }}>dari Plan SP</span>
                            </span>
                            {/* Tren vs periode sebelumnya - DISEMBUNYIKAN
                                total (bukan placeholder) kalau blm ada data
                                historis sama sekali di seluruh report. */}
                            {hasHistory && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: trend.dir > 0 ? "#2E7D32" : trend.dir < 0 ? "#C62828" : "#B0B0BA" }}>
                                {trend.dir > 0 ? "▲" : trend.dir < 0 ? "▼" : ""} {trend.label}
                              </span>
                            )}
                          </div>
                          <ChevronRight size={16} color="#B0B0BA" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" }} />
                        </div>
                      </div>

                      <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: "#F1F2F5", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: 999, background: achColor(pct) }} />
                      </div>
                    </button>

                    <div style={{ padding: "0 14px 10px" }}>
                      <div style={{ display: "flex", alignItems: "stretch", background: "#F8F9FB", border: "1px solid #F1F2F5", borderRadius: 10, padding: "7px 0" }}>
                        <MiniStat icon={MapPinned} dot={cfg.dotSite} label="Kecamatan" value={fmtInt(b.kecList.length)} />
                        <MiniStatDivider />
                        <MiniStat icon={ListChecks} dot="#2563EB" label="Plan SP" value={fmtInt(b.planSp)} />
                        <MiniStatDivider />
                        <MiniStat icon={CheckCircle2} dot={achColor(pct)} label="Actual SP" value={fmtInt(b.actualSp)} valueColor={achColor(pct)} />
                        <MiniStatDivider />
                        <MiniStat icon={AlertTriangle} dot={b.kecBelum > 0 ? "#C62828" : "#6B7280"} label="Kec. 0 Aktivasi" value={fmtInt(b.kecBelum)} valueColor={b.kecBelum > 0 ? "#C62828" : undefined} />
                      </div>
                    </div>

                    {/* Kontribusi per BRAND - LANGSUNG kelihatan tanpa expand.
                        BUKAN bar lagi sama sekali (user eksplisit minta
                        dihindari karena bikin bingung dibaca) - diganti KARTU
                        STAT berdampingan per brand, tiap kartu isinya warna
                        brand + SP + share% dlm satu angka yg jelas. */}
                    {b.brandStats.length > 0 && (
                      <div style={{ padding: "0 14px 10px", display: "flex", gap: 6 }}>
                        {b.brandStats.map((bs) => (
                          <div key={bs.brand} style={{
                            flex: 1, minWidth: 0, borderRadius: 10, padding: "6px 9px",
                            background: `${brandColor(bs.brand)}14`, border: `1px solid ${brandColor(bs.brand)}33`,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ width: 7, height: 7, borderRadius: "50%", background: brandColor(bs.brand), flexShrink: 0 }} />
                              <span style={{ fontSize: 10, fontWeight: 800, color: "#5A5A68", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brandLabel(bs.brand)}</span>
                              <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#17181C", flexShrink: 0 }}>{fmtInt(bs.actualSp)}</span>
                            </div>
                            <div style={{ marginTop: 1, fontSize: 8.5, fontWeight: 700, color: "#8A8A96" }}>{bs.share}% dari Actual SP</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tombol eksplisit "Lihat Detail Kecamatan Fokus" -
                        dulu satu-satunya cara buka detail cuma tap area
                        header (chevron kecil di kanan-atas), sekarang ada
                        tombol jelas & full-width jg di bawah ringkasan brand
                        biar affordance-nya tidak samar. */}
                    <div style={{ padding: "0 14px 12px" }}>
                      <button onClick={() => setOpenBranch(isOpen ? null : b.branch)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer",
                          background: isOpen ? cfg.softBg : "#F8F9FB", border: `1px solid ${isOpen ? cfg.accent + "55" : "#ECEDF0"}`,
                          borderRadius: 10, padding: "8px 10px", fontFamily: FF, fontSize: 10.5, fontWeight: 800, color: isOpen ? cfg.accent : "#4A4A55",
                        }}>
                        <MapPinned size={12.5} strokeWidth={2.4} />
                        {isOpen ? "Sembunyikan Detail" : "Lihat Detail Kecamatan Fokus"} ({fmtInt(b.kecList.length)})
                        <ChevronDown size={13} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease", marginLeft: 2 }} />
                      </button>
                    </div>

                    {isOpen && (
                      <div style={{ borderTop: "1px solid #F1F2F5", padding: "10px 16px 14px", background: "#FAFAFB", borderRadius: "0 0 18px 18px" }}>

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                            Kecamatan Fokus di {b.branch} ({b.kecList.length})
                          </div>
                          {b.kecBelum > 0 && (
                            <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, color: "#C62828", background: "#FFEBEE", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                              {b.kecBelum} belum ada event
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                          {b.kecList.map((kc) => (
                            <KecEventCard key={kc.kec_key} kc={kc} cfg={cfg} hasHistory={hasHistory} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Poster share - dirender OFF-SCREEN (posisi fixed di luar viewport,
          bukan display:none, spy html2canvas tetap bisa "melihat" & merender
          layoutnya) - tidak pernah kelihatan/mengganggu user, cuma jadi
          sumber gambar utk fitur Share. */}
      <div style={{ position: "fixed", top: 0, left: -99999, pointerEvents: "none" }} aria-hidden="true">
        <SharePosterKec ref={posterRef} cfg={cfg} periodLabel={periodLabel} total={total} totalPct={totalPct}
          rankedBranches={rankedBranches} branchRank={branchRank} globalBrandStats={globalBrandStats} />
      </div>

      {/* Sheet PREVIEW gambar poster - muncul SEBELUM apa pun benar2
          dibagikan, spy user bisa cek dulu hasilnya (kadang perlu ganti
          periode/filter kalau ternyata belum pas) & bisa Batal tanpa efek
          samping apa pun. Tombol "Bagikan" di sini yg baru men-trigger
          Web Share API/download+wa.me sesungguhnya. */}
      {previewImg && (
        <BottomSheet onClose={closePreview}>
          <div style={{ padding: "16px 18px 20px", fontFamily: FF }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: "#E4E5EA", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#17181C", marginBottom: 3 }}>Preview Report</div>
            <div style={{ fontSize: 11.5, color: "#8A8A96", marginBottom: 14 }}>Cek dulu hasilnya sebelum dibagikan.</div>
            <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #ECEDF0", boxShadow: "0 2px 10px rgba(23,24,28,0.06)", maxHeight: "50vh", overflowY: "auto" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewImg} alt="Preview poster report" style={{ display: "block", width: "100%", height: "auto" }} />
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button onClick={closePreview} disabled={shareStage === "sending"}
                style={{
                  flex: 1, height: 44, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#3A3A44",
                  fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: shareStage === "sending" ? "default" : "pointer",
                }}>
                Batal
              </button>
              <button onClick={handleConfirmShare} disabled={shareStage === "sending"}
                style={{
                  flex: 2, height: 44, borderRadius: 12, border: "none", background: cfg.accent, color: "#fff",
                  fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: shareStage === "sending" ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: shareStage === "sending" ? 0.7 : 1,
                }}>
                {shareStage === "sending" ? <Loader2 size={14} className="mh-spin" /> : <Share2 size={14} />}
                {shareStage === "sending" ? "Mengirim..." : "Bagikan"}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/** Teks pengantar siap-kirim WhatsApp - ringkasan report + top branch,
 * dikirim BARENGAN gambar poster (lewat Web Share API) atau, kalau browser
 * tidak dukung share file, dibuka sbg draft chat WhatsApp (wa.me) setelah
 * gambar didownload manual. */
function buildKecFokusShareText({ periodLabel, total, totalPct, rankedBranches, branchRank }) {
  const top = rankedBranches.slice(0, 3).map((b) => {
    const pct = achPct(b.actualSp, b.planSp);
    return `${branchRank.get(b.branch)}. ${b.branch} - ${pct}% (${fmtInt(b.kecList.length - b.kecBelum)}/${fmtInt(b.kecList.length)} kec. digarap)`;
  }).join("\n");
  return [
    `📍 *Report Kecamatan Fokus - ${periodLabel}*`,
    "",
    `Total *${fmtInt(total.kecCount)} Kecamatan Fokus* di ${rankedBranches.length} branch`,
    `Pencapaian SP: *${totalPct}%* (${fmtInt(total.actualSp)} / ${fmtInt(total.planSp)} SP)`,
    `Kecamatan belum ada aktivitas: ${fmtInt(total.kecBelum)}`,
    "",
    "*Peringkat Pengerjaan Branch:*",
    top,
    "",
    "_Dikirim otomatis dari MartaHub_",
  ].join("\n");
}

/** Poster gambar utk fitur Share (di-capture html2canvas) - dirancang
 * SEBAGAI GAMBAR (bukan halaman interaktif): header brand, angka hero
 * besar, ranking branch (medali+persen+kec digarap), breakdown brand
 * keseluruhan, footer sumber - biar begitu di-share ke WhatsApp, penerima
 * yg TIDAK buka app-nya sekalipun tetap dapat gambaran lengkap dari
 * gambarnya saja. forwardRef spy html2canvas bisa merender node aslinya. */
const SharePosterKec = forwardRef(function SharePosterKec(
  { cfg, periodLabel, total, totalPct, rankedBranches, branchRank, globalBrandStats }, ref
) {
  return (
    <div ref={ref} style={{ width: 720, background: "#FFFFFF", fontFamily: FF }}>
      <div style={{ padding: "28px 32px 24px", background: cfg.heroGradient }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MapPinned size={18} color="#fff" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>MartaHub</div>
        </div>
        <div style={{ marginTop: 16, fontSize: 24, fontWeight: 800, color: "#fff" }}>Report Kecamatan Fokus</div>
        <div style={{ marginTop: 3, fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>{periodLabel}</div>

        <div style={{ display: "flex", marginTop: 22, gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{fmtInt(total.kecCount)}</div>
            <div style={{ marginTop: 4, fontSize: 11.5, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>Kecamatan Fokus · {fmtInt(total.siteFocus)} site</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{totalPct}%</div>
            <div style={{ marginTop: 4, fontSize: 11.5, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>dari Plan SP</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#F5CD46", lineHeight: 1 }}>{fmtInt(total.kecBelum)}</div>
            <div style={{ marginTop: 4, fontSize: 11.5, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>Kec. Belum Ada Aktivitas</div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 12, gap: 14, fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
          <span>Plan SP: {fmtInt(total.planSp)}</span>
          <span>Actual SP: {fmtInt(total.actualSp)}</span>
        </div>
      </div>

      <div style={{ padding: "22px 32px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
          Peringkat Pengerjaan per Branch
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rankedBranches.map((b) => {
            const pct = achPct(b.actualSp, b.planSp);
            const rank = branchRank.get(b.branch);
            const medal = RANK_MEDAL[rank];
            const digarap = b.kecList.length - b.kecBelum;
            return (
              <div key={b.branch} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: "#F8F9FB", border: "1px solid #ECEDF0" }}>
                <div style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12.5, fontWeight: 800, background: medal ? medal.bg : "#EDEDF1", color: medal ? medal.fg : "#8A8A96",
                }}>{rank}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>{b.branch}</div>
                  <div style={{ fontSize: 11, color: "#8A8A96", fontWeight: 600, marginTop: 1 }}>{fmtInt(digarap)}/{fmtInt(b.kecList.length)} kecamatan sudah digarap</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: achColor(pct) }}>{pct}%</div>
              </div>
            );
          })}
        </div>

        {globalBrandStats.length > 0 && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", textTransform: "uppercase", letterSpacing: "0.04em", margin: "22px 0 10px" }}>
              Kontribusi Brand (Actual SP)
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {globalBrandStats.map((bs) => (
                <div key={bs.brand} style={{
                  flex: 1, minWidth: 0, borderRadius: 12, padding: "10px 12px", background: `${brandColor(bs.brand)}14`,
                  border: `1px solid ${brandColor(bs.brand)}33`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: brandColor(bs.brand) }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#5A5A68" }}>{brandLabel(bs.brand)}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: "#8A8A96" }}>{bs.share}%</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 17, fontWeight: 800, color: "#17181C" }}>{fmtInt(bs.actualSp)} <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8A96" }}>SP</span></div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 24, paddingTop: 14, borderTop: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>Dibuat otomatis dari MartaHub</span>
          <span style={{ fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>{new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
      </div>
    </div>
  );
});

/** Tabel ringkasan per-branch, MATCHING format tabel referensi user (Excel/
 * laporan lama): Branch | Kec Fokus | Aktivitas Plan | Plan SP | Actual SP
 * (+ tren vs periode sebelumnya) | Ach % | Kec Nol Aktivitas - + baris
 * TOTAL di bawah. Dipakai di halaman report (bukan cuma di poster share)
 * spy bisa langsung dibaca sekilas TANPA buka kartu branch satu-satu - versi
 * "spreadsheet" dari data yg sama dgn kartu branch di bawahnya. */
function BranchSummaryTable({ branches, total, cfg, hasHistory, embedded }) {
  const totalPct = achPct(total.actualSp, total.planSp);
  const totalTrend = trendInfo(total.actualSp, total.prevActualSp, total.prevPlanSp);
  // Diurutkan Ach % TERTINGGI dulu (bukan lagi ikut "Peringkat Pengerjaan"
  // yg juga mempertimbangkan Kec. 0 Aktivasi) - tabel ini murni ranking
  // pencapaian SP, beda tujuan dgn urutan kartu branch di bawahnya.
  const sortedBranches = branches.slice().sort((a, b) => achPct(b.actualSp, b.planSp) - achPct(a.actualSp, a.planSp));
  // `embedded` = true dipakai saat tabel ini dirender di sisi belakang
  // HeroSummaryCard (flip card) - header "Tabel Ringkasan per Branch" &
  // bungkus kartu putih terluar dilepas krn sudah ada judul "Branch
  // Summary" di header sisi flip itu sendiri (hindari judul dobel).
  return (
    <div style={embedded ? undefined : { marginTop: 14, borderRadius: 16, background: "#fff", border: "1px solid #ECEDF0", boxShadow: "0 2px 10px rgba(23,24,28,0.04)", overflow: "hidden" }}>
           {!embedded && (
        <div style={{ padding: "12px 14px 4px", fontSize: 11, fontWeight: 800, color: "#17181C", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Tabel Ringkasan per Branch
        </div>
      )}
      <style>{`.mh-hide-scrollbar::-webkit-scrollbar { display: none; height: 0; }`}</style>
      <div 
        className="mh-hide-scrollbar" 
        style={embedded 
          ? { overflowX: "auto", borderRadius: 14, background: "#fff", padding: "6px 6px 10px", scrollbarWidth: "none", msOverflowStyle: "none" } 
          : { overflowX: "auto", padding: "6px 6px 10px", scrollbarWidth: "none", msOverflowStyle: "none" }
        }
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FF, minWidth: 560 }}>

          <thead>
            <tr style={{ background: "#F6F7F9" }}>
              {(hasHistory
                ? ["Branch", "Kec Fokus", "Aktivitas Plan", "Plan SP", "Actual SP", "Tren", "Ach %", "Kec Nol Aktivitas"]
                : ["Branch", "Kec Fokus", "Aktivitas Plan", "Plan SP", "Actual SP", "Ach %", "Kec Nol Aktivitas"]
              ).map((h, idx) => (
                <th key={h} style={{
                  textAlign: idx === 0 ? "left" : "right", padding: "7px 10px", fontSize: 9.5, fontWeight: 800, color: "#8A8A96",
                  textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap", borderBottom: "1px solid #ECEDF0",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedBranches.map((b, i) => {
              const pct = achPct(b.actualSp, b.planSp);
              const trend = trendInfo(b.actualSp, b.prevActualSp, b.prevPlanSp);
              return (
                <tr key={b.branch} style={{ background: i % 2 === 1 ? "#FAFAFB" : "#fff" }}>
                  <td style={{ padding: "8px 10px", fontSize: 11.5, fontWeight: 800, color: "#17181C", whiteSpace: "nowrap", borderBottom: "1px solid #F1F2F5" }}>{b.branch}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11.5, color: "#3A3A44", textAlign: "right", borderBottom: "1px solid #F1F2F5" }}>{fmtInt(b.kecList.length)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11.5, color: "#3A3A44", textAlign: "right", borderBottom: "1px solid #F1F2F5" }}>{fmtInt(b.aktivitasPlan)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11.5, color: "#3A3A44", textAlign: "right", borderBottom: "1px solid #F1F2F5" }}>{fmtInt(b.planSp)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11.5, fontWeight: 800, color: "#17181C", textAlign: "right", borderBottom: "1px solid #F1F2F5" }}>{fmtInt(b.actualSp)}</td>
                  {hasHistory && (
                    <td style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #F1F2F5", color: trend.dir > 0 ? "#2E7D32" : trend.dir < 0 ? "#C62828" : "#B0B0BA" }}>
                      {trend.dir > 0 ? "▲" : trend.dir < 0 ? "▼" : ""} {trend.label}
                    </td>
                  )}
                  <td style={{ padding: "8px 10px", fontSize: 11.5, fontWeight: 800, textAlign: "right", borderBottom: "1px solid #F1F2F5", color: achColor(pct) }}>{pct}%</td>
                  <td style={{ padding: "8px 10px", fontSize: 11.5, fontWeight: 700, textAlign: "right", borderBottom: "1px solid #F1F2F5", color: b.kecBelum > 0 ? "#C62828" : "#3A3A44" }}>{fmtInt(b.kecBelum)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#17181C" }}>
              <td style={{ padding: "9px 10px", fontSize: 11.5, fontWeight: 800, color: "#fff", borderRadius: "0 0 0 10px" }}>TOTAL</td>
              <td style={{ padding: "9px 10px", fontSize: 11.5, fontWeight: 800, color: "#fff", textAlign: "right" }}>{fmtInt(total.kecCount)}</td>
              <td style={{ padding: "9px 10px", fontSize: 11.5, fontWeight: 800, color: "#fff", textAlign: "right" }}>{fmtInt(total.aktivitasPlan)}</td>
              <td style={{ padding: "9px 10px", fontSize: 11.5, fontWeight: 800, color: "#fff", textAlign: "right" }}>{fmtInt(total.planSp)}</td>
              <td style={{ padding: "9px 10px", fontSize: 11.5, fontWeight: 800, color: "#fff", textAlign: "right" }}>{fmtInt(total.actualSp)}</td>
              {hasHistory && (
                <td style={{ padding: "9px 10px", fontSize: 10, fontWeight: 800, textAlign: "right", whiteSpace: "nowrap", color: totalTrend.dir > 0 ? "#86EFAC" : totalTrend.dir < 0 ? "#FCA5A5" : "rgba(255,255,255,0.5)" }}>
                  {totalTrend.dir > 0 ? "▲" : totalTrend.dir < 0 ? "▼" : ""} {totalTrend.label}
                </td>
              )}
              <td style={{ padding: "9px 10px", fontSize: 11.5, fontWeight: 800, color: cfg.accentSoft, textAlign: "right" }}>{totalPct}%</td>
              <td style={{ padding: "9px 10px", fontSize: 11.5, fontWeight: 800, color: "#fff", textAlign: "right", borderRadius: "0 0 10px 0" }}>{fmtInt(total.kecBelum)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  );
}

/** Kartu hero TOTAL - SEKARANG kartu FLIP, pola SAMA PERSIS dgn
 * AchievementCard di Beranda (app/martahub/m/page.jsx): sisi depan =
 * ringkasan total yg sudah ada, sisi belakang = Tabel Ringkasan per Branch.
 * Ditumpuk pakai CSS Grid (gridArea sama) + diukur via ResizeObserver spy
 * tinggi kontainer selalu pas sisi yg sedang tampil, dianimasikan bareng
 * rotasi flip 3D (rotateY) - user eksplisit minta interaksi ini SAMA PERSIS
 * dgn kartu Achievement di Beranda. */
function HeroSummaryCard({ cfg, branches, total, totalPct, hasHistory }) {
  const [open, setOpen] = useState(false);
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const [frontH, setFrontH] = useState(null);
  const [backH, setBackH] = useState(null);

  useEffect(() => {
    const measure = () => {
      if (frontRef.current) setFrontH(frontRef.current.scrollHeight);
      if (backRef.current) setBackH(backRef.current.scrollHeight);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    return () => ro.disconnect();
  }, [total, totalPct, branches, hasHistory]);

  const faceBase = {
    gridArea: "1/1", alignSelf: "start", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
    position: "relative", borderRadius: 22, overflow: "hidden",
    background: cfg.heroGradient,
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 8px 20px rgba(17,17,20,0.16), 0 2px 5px rgba(17,17,20,0.1)",
  };

  return (
    <div style={{ marginTop: 14, perspective: 1600 }}>
      <div style={{
        position: "relative", display: "grid", transformStyle: "preserve-3d",
        height: (open ? backH : frontH) ?? undefined,
        transition: "transform .46s cubic-bezier(.34,1,.4,1), height .42s cubic-bezier(.22,1,.36,1)",
        transform: open ? "rotateY(180deg)" : "rotateY(0deg)",
      }}>
        {/* ── Depan: ringkasan total (sama spt sebelumnya) ── */}
        <div ref={frontRef} style={{ ...faceBase, padding: "20px 18px 18px", pointerEvents: open ? "none" : "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total {branches.length} Branch</div>
              <div style={{
                marginTop: 8, fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1,
                background: cfg.totalGradient,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>{fmtInt(total.kecCount)}</div>
              <div style={{ marginTop: 3, fontSize: 12.5, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>{cfg.totalUnitLabel}</div>
              <div style={{ marginTop: 2, fontSize: 10.5, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{fmtInt(total.siteFocus)} site fokus{total.kecBelum > 0 ? ` · ${fmtInt(total.kecBelum)} kec. belum ada event` : ""}</div>
            </div>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{totalPct}%</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.04em" }}>dari Plan SP</div>
            </div>
          </div>

          <div style={{ marginTop: 14, height: 9, borderRadius: 999, background: "rgba(0,0,0,0.25)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, totalPct)}%`, borderRadius: 999, background: cfg.barGradient }} />
          </div>

          <div style={{ display: "flex", marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
            <HeroStat icon={Target} dot="#FFFFFF" label="Aktivitas Plan" value={fmtInt(total.aktivitasPlan)} />
            <HeroDivider />
            <HeroStat icon={ListChecks} dot={cfg.accentSoft} label="Plan SP" value={fmtInt(total.planSp)} valueColor={cfg.accentSoft} />
            <HeroDivider />
            <HeroStat icon={CheckCircle2} dot={cfg.accent} label="Actual SP" value={fmtInt(total.actualSp)} valueColor={cfg.accent} />
            <HeroDivider />
            <HeroStat icon={AlertTriangle} dot="#F5CD46" label="Kec. 0 Aktivasi" value={fmtInt(total.kecBelum)} valueColor={total.kecBelum > 0 ? "#F5CD46" : undefined} />
          </div>

          {/* Trigger flip - konsisten dgn "Lihat Detail >" di kartu
              Achievement Beranda, supaya pola & bahasa antar halaman
              MartaHub tetap sama. */}
          <button onClick={() => setOpen(true)} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%",
            marginTop: 14, border: "none", cursor: "pointer",
            background: "rgba(255,255,255,0.1)", color: "#fff", borderRadius: 12, padding: "10px 0",
            fontFamily: FF, fontSize: 12, fontWeight: 800,
          }}>
            Lihat Branch Summary <ChevronRight size={14} />
          </button>
        </div>

        {/* ── Belakang: Tabel Ringkasan per Branch ── */}
        <div ref={backRef} style={{ ...faceBase, transform: "rotateY(180deg)", padding: "16px 14px 14px", pointerEvents: open ? "auto" : "none" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: 1, textTransform: "uppercase" }}>Branch Summary</div>
            <button onClick={() => setOpen(false)} aria-label="Kembali ke ringkasan"
              style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", borderRadius: 9, padding: "5px 9px 5px 7px", cursor: "pointer", fontFamily: FF, fontSize: 11, fontWeight: 700 }}>
              <ChevronLeft size={13} /> Ringkasan
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <BranchSummaryTable branches={branches} total={total} cfg={cfg} hasHistory={hasHistory} embedded />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Kartu satu KECAMATAN UNIK (kabupaten+kecamatan, level breakdown TERAKHIR
 * di report ini - TIDAK ada lagi drill-down ke site satu-satu sbg kartu).
 * Tertutup: nama kecamatan + kabupaten (baris TERPISAH biar rapi dibaca),
 * status "sudah/belum ada event", pencapaian SP, Plan/Actual SP langsung.
 * `showBranch` (dipakai mode hasil pencarian yg diratakan lintas branch) -
 * nampilin nama branch sbg eyebrow tambahan, biar konteksnya tetap jelas
 * walau kartu ini tidak lagi bersarang di dalam kartu branch.
 * Dibuka: (1) SUMMARY ringkas kecamatan ini sendiri + chip breakdown brand
 * (TEKS, bukan bar - lihat komentar branches useMemo di atas), (2) daftar
 * EVENT yg sudah/sedang dilakukan (kartu bergaya ActivityCard, lihat
 * EventActivityCard), (3) chip SITE (dgn site_id) sbg FILTER SAJA (bukan
 * aksi) utk mempersempit daftar event ke site tertentu. */
function KecEventCard({ kc, cfg, showBranch, hasHistory }) {
  const [siteFilter, setSiteFilter] = useState(null); // site_id terpilih, null = semua site di kecamatan ini
  const [showActivities, setShowActivities] = useState(false);
  const events = kc.events || [];
  const sites = (kc.sites || []).slice().sort((a, b) => {
    const aBelum = !(Number(a.aktivitas_plan || 0) > 0 || Number(a.actual_sp || 0) > 0);
    const bBelum = !(Number(b.aktivitas_plan || 0) > 0 || Number(b.actual_sp || 0) > 0);
    return (aBelum === bBelum ? 0 : aBelum ? -1 : 1) || (a.site_name || "").localeCompare(b.site_name || "");
  });
  const filteredEvents = siteFilter ? events.filter((ev) => ev.site_id === siteFilter) : events;

  const accentColor = kc.belum ? "#C62828" : achColor(kc.pct);
  const handleToggleActivities = () => {
    setShowActivities((prev) => !prev);
    setSiteFilter(null); // mulai dari "semua site" tiap kali dibuka lagi
  };

  // Kartu diringkas jadi SATU blok padding tunggal (dulu 2 blok terpisah
  // dgn border-top + info Plan/Actual SP diulang DUA kali: sekali di
  // header, sekali lagi di grid ringkasan). Sekarang cuma SATU baris strip
  // angka (site/plan/actual/event) dgn divider tipis, jadi tingginya jauh
  // lebih pendek tapi informasinya tetap lengkap & gampang dibaca sekilas.
  return (
    <div style={{ borderRadius: 14, background: "#fff", border: `1px solid ${kc.belum ? "#F3C6D6" : "#ECEDF0"}`, overflow: "hidden", borderLeft: `3px solid ${accentColor}`, boxShadow: "0 1px 4px rgba(23,24,28,0.03)" }}>
      <div style={{ padding: "11px 12px", fontFamily: FF }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, background: cfg.softBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MapPinned size={12} color={cfg.dotSite} strokeWidth={2.4} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kc.kecamatan_name}</span>
                {showBranch && <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, color: cfg.accent }}>· {kc.branch}</span>}
              </div>
              <div style={{ fontSize: 9.5, color: "#8A8A96", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kc.kabupaten || "-"}</div>
              {hasHistory && Number(kc.idle_streak || 0) >= 3 && (
                <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 3, fontSize: 8.5, fontWeight: 800, color: "#C62828" }}>
                  <AlertTriangle size={9} strokeWidth={2.6} /> Mangkrak ≥3 periode
                </div>
              )}
            </div>
          </div>
          <span style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: 3, fontSize: 11, fontWeight: 800, color: achColor(kc.pct), background: achBg(kc.pct), borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
            {kc.pct}% <span style={{ fontSize: 8, fontWeight: 700, opacity: 0.75 }}>dari Plan SP</span>
          </span>
        </div>

        {/* Strip angka ringkas - SATU baris, gantikan 3 bagian yg dulu
            terpisah (teks event/site, Plan/Actual inline, grid CardStat). */}
        <div style={{ marginTop: 9, display: "flex", alignItems: "stretch", background: "#FAFAFB", border: "1px solid #F1F2F5", borderRadius: 10, padding: "6px 0" }}>
          <MiniStat icon={RadioTower} dot={cfg.dotSite} label="Site" value={fmtInt(kc.site_count)} />
          <MiniStatDivider />
          <MiniStat icon={ListChecks} dot="#2563EB" label="Plan SP" value={fmtInt(kc.plan_sp)} />
          <MiniStatDivider />
          <MiniStat icon={CheckCircle2} dot={achColor(kc.pct)} label="Actual SP" value={fmtInt(kc.actual_sp)} valueColor={achColor(kc.pct)} />
          <MiniStatDivider />
          <MiniStat icon={CalendarRange} dot="#7C3AED" label="Event" value={fmtInt(events.length)} />
        </div>

        {/* Breakdown brand - chip kartu ringkas, bukan bar. */}
        {kc.brandStats?.length > 0 && (
          <div style={{ marginTop: 7, display: "flex", gap: 5 }}>
            {kc.brandStats.map((bs) => (
              <div key={bs.brand} style={{
                flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 700, color: "#5A5A68",
                background: `${brandColor(bs.brand)}14`, border: `1px solid ${brandColor(bs.brand)}33`, borderRadius: 8, padding: "4px 7px",
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: brandColor(bs.brand), flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brandLabel(bs.brand)}</span>
                <span style={{ marginLeft: "auto", color: "#17181C", fontWeight: 800, flexShrink: 0 }}>{fmtInt(bs.actualSp)}</span>
                <span style={{ flexShrink: 0 }}>({bs.share}%)</span>
              </div>
            ))}
          </div>
        )}

        {/* Tombol utk buka detail event + filter site. */}
        <button onClick={handleToggleActivities}
          style={{
            width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer",
            background: showActivities ? cfg.softBg : "#fff", border: `1px solid ${showActivities ? cfg.accent + "55" : "#ECEDF0"}`,
            borderRadius: 9, padding: "6px 10px", fontFamily: FF, fontSize: 10.5, fontWeight: 800, color: showActivities ? cfg.accent : "#4A4A55",
          }}>
          <CalendarRange size={12} strokeWidth={2.4} />
          {showActivities ? "Sembunyikan Aktivitas" : "Lihat Aktivitas"}
          {!kc.belum && ` (${fmtInt(events.length)})`}
          <ChevronDown size={12} style={{ transform: showActivities ? "rotate(180deg)" : "none", transition: "transform .15s ease", marginLeft: 2 }} />
        </button>
      </div>

      {showActivities && (
        <div style={{ borderTop: "1px solid #F1F2F5", padding: "10px 12px 12px", background: "#FAFAFB" }}>
          {/* Filter Site DROPDOWN + badge total aktivitas site terpilih. */}
          <div style={{ fontSize: 9.5, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
            Filter Site di {kc.kecamatan_name} ({sites.length})
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <select value={siteFilter || ""} onChange={(e) => setSiteFilter(e.target.value || null)}
                style={{
                  width: "100%", appearance: "none", WebkitAppearance: "none", background: siteFilter ? cfg.softBg : "#fff",
                  border: `1px solid ${siteFilter ? cfg.accent + "55" : "#ECEDF0"}`, borderRadius: 10,
                  padding: "8px 28px 8px 10px", fontSize: 11, fontWeight: 700, color: siteFilter ? cfg.accent : "#17181C",
                  fontFamily: FF, cursor: "pointer", boxSizing: "border-box",
                }}>
                <option value="">Semua Site ({events.length} aktivitas)</option>
                {sites.map((s) => {
                  const siteEventCount = events.filter((ev) => ev.site_id === s.site_id).length;
                  return (
                    <option key={s.site_id} value={s.site_id}>
                      {s.site_name || s.site_id} ({s.site_id}) - {siteEventCount} aktivitas
                    </option>
                  );
                })}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: siteFilter ? cfg.accent : "#8A8A96" }} />
            </div>
            {siteFilter && (
              <span style={{
                flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: "7px 10px", borderRadius: 10,
                background: filteredEvents.length > 0 ? "#DCFCE7" : "#FFE4E4", color: filteredEvents.length > 0 ? "#166534" : "#B91C1C",
              }}>{filteredEvents.length} aktivitas</span>
            )}
            <button onClick={() => setSiteFilter(null)} disabled={!siteFilter}
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap: 3, background: siteFilter ? cfg.softBg : "transparent",
                border: `1px solid ${siteFilter ? cfg.accent + "55" : "#ECEDF0"}`, borderRadius: 999, padding: "7px 9px",
                cursor: siteFilter ? "pointer" : "default", fontFamily: FF, fontSize: 9.5, fontWeight: 700,
                color: siteFilter ? cfg.accent : "#C4C4CC",
              }}>
              <X size={10} />
            </button>
          </div>

          <div style={{ fontSize: 9.5, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
            Event {kc.kecamatan_name} ({filteredEvents.length}{siteFilter ? `/${events.length}` : ""})
          </div>

          {filteredEvents.length === 0 ? (
            <div style={{ padding: "14px 8px", textAlign: "center", fontSize: 11.5, color: "#8A8A96" }}>
              {events.length === 0 ? cfg.eventsEmptyText : "Tidak ada event di site ini pada periode ini."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredEvents.map((ev) => <EventActivityCard key={ev.event_id} ev={ev} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Satu angka dlm strip ringkasan kecamatan (Site/Plan SP/Actual SP/Event) -
 * versi super-compact dari CardStat, tanpa icon, cuma label kecil + angka
 * bold, biar strip-nya tetap pendek walau 4 kolom. */
function MiniStat({ icon: Icon, dot, label, value, valueColor }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
        {Icon && <Icon size={9} color={dot || "#B0B0BA"} strokeWidth={2.4} style={{ flexShrink: 0 }} />}
        <div style={{ fontSize: 8, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      </div>
      <div style={{ marginTop: 3, fontSize: 12.5, fontWeight: 800, color: valueColor || "#17181C" }}>{value}</div>
    </div>
  );
}

function MiniStatDivider() {
  return <div style={{ width: 1, background: "#ECEDF0", flexShrink: 0 }} />;
}

function EventActivityCard({ ev }) {
  const router = useRouter();
  const stage = activityStage(ev);
  const hasActual = ev.actual_sp != null;
  const timeLabel = fmtTimeLabel(ev);
  const locLabel = [ev.site_name, ev.mc, ev.site_id].filter(Boolean).join(" · ");
  const openDetail = () => router.push(`/martahub/m/activities/${ev.event_id}`);
  // Kartu ini sekarang IKUT diklik ke halaman detail aktivitas - dulu cuma
  // kartu ringkas read-only tanpa aksi apa pun, padahal event di report ini
  // adalah aktivitas nyata yg sama persis dgn yg ada di menu Aktivitas, jadi
  // seharusnya bisa dibuka juga. Desain kartu disamakan PERSIS dgn
  // ActivityCard (activities/page.jsx): lokasi dipindah DI ATAS baris waktu
  // (dulu terbalik), badge Kecamatan Fokus/Site LRS ditambah (independen,
  // bisa tampil berdua/salah satu/tidak sama sekali), & baris Ringkasan
  // Actual skrg ikut menampilkan Rebuy (dulu cuma SP/FWA).
  return (
    <div role="button" tabIndex={0} onClick={openDetail}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(); } }}
      style={{
        position: "relative", background: "#FFFFFF", borderRadius: 16, overflow: "hidden", fontFamily: FF,
        border: "1px solid #EDEDF1", boxShadow: "0 2px 10px rgba(23,24,28,0.04), 0 1px 2px rgba(23,24,28,0.03)",
        cursor: "pointer",
      }}>
      <div style={{ padding: "13px 14px 12px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 13.5, fontWeight: 800, color: "#17181C", lineHeight: 1.32,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {ev.event_name || "Event"}
            </div>
            {ev.brand && (
              <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{
                  flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap",
                  background: BRAND_COLOR[ev.brand.toLowerCase()] || "#8A8A96",
                  color: ev.brand.toLowerCase() === "tri" ? "#FFFFFF" : "#17181C",
                }}>
                  {ev.brand.toLowerCase() === "tri" ? "3ID" : "IM3"}
                </span>
              </div>
            )}
          </div>
          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: stage.color, background: stage.bg, whiteSpace: "nowrap" }}>
            {stage.label}
          </span>
        </div>

        {/* Lokasi (site/mc/site_id) SEKARANG DI ATAS baris waktu - user
            eksplisit minta urutan ini di semua kartu aktivitas. */}
        <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#5A5A68", fontWeight: 600 }}>
          <MapPinned size={12} color="#B0B0BA" style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{locLabel || "-"}</span>
        </div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#5A5A68", fontWeight: 600 }}>
          <Clock size={12} color="#B0B0BA" style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(ev.plan_date)} · {timeLabel}</span>
        </div>

        <ActivityFlagBadges kecamatanFokus={!!ev.kecamatan_fokus} siteLrs={!!ev.site_lrs} style={{ marginTop: 7 }} />

        {hasActual && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 700, color: "#17181C", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <CardSim size={12} color="#DB2777" /> {fmtInt(ev.actual_sp)} <span style={{ color: "#8A8A96", fontWeight: 600 }}>SP</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <Router size={12} color="#2563EB" /> {fmtInt(ev.actual_fwa)} <span style={{ color: "#8A8A96", fontWeight: 600 }}>FWA</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
              <RefreshCw size={12} color="#B45309" style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtRp((ev.actual_rebuy_sp || 0) + (ev.actual_rebuy_fwa || 0))}</span>
              <span style={{ color: "#8A8A96", fontWeight: 600, flexShrink: 0 }}>Rebuy</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function FocusSiteReport({ mode, period, periodLabel }) {
  const cfg = FOCUS_MODES[mode];
  const { loading: sessionLoading, scope, email } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [openBranch, setOpenBranch] = useState(null);
  const [openKecamatan, setOpenKecamatan] = useState(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("ach_desc");
  const [region, setRegion] = useState("");
  const [openInfoId, setOpenInfoId] = useState(null);
  const toggleInfo = (id) => setOpenInfoId((prev) => (prev === id ? null : id));

  useEffect(() => {
    if (!openInfoId) return;
    const closeOnOutsideClick = (e) => {
      if (!e.target.closest || !e.target.closest("[data-info-trigger]")) {
        e.stopPropagation();
        e.preventDefault();
        setOpenInfoId(null);
      }
    };
    document.addEventListener("click", closeOnOutsideClick, true);
    return () => document.removeEventListener("click", closeOnOutsideClick, true);
  }, [openInfoId]);

  useEffect(() => {
    if (sessionLoading || !period || !email) return;
    let alive = true;
    setRows(null); setErr(""); setRegion("");
    (async () => {
      try {
        // Supabase/PostgREST caps a single response at the project's "Max Rows"
        // setting (default 1000) NO MATTER how large a .range() we ask for, so
        // one request isn't enough for this report (it can return 5000+ rows).
        // Page through with .range() until a page comes back short of PAGE_SIZE.
        const PAGE_SIZE = 1000;
        let all = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await supabaseMarta
            .rpc(cfg.rpc, {
              p_caller_email: email, p_period_start: period.start, p_period_end: period.end,
            })
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          const page = data || [];
          all = all.concat(page);
          if (page.length < PAGE_SIZE) break;
        }
        if (alive) setRows(all);
      } catch (e) {
        if (alive) { setErr(e.message || "Gagal memuat report"); setRows([]); }
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, period, email, cfg.rpc]);

  const regionOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows || []) { if (r.region) set.add(r.region); }
    return Array.from(set).sort();
  }, [rows]);

  const scopedRows = useMemo(() => {
    if (!region) return rows || [];
    return (rows || []).filter((r) => r.region === region);
  }, [rows, region]);

  const branches = useMemo(() => {
    const map = new Map();
    const noteSets = new Map();
    const kecMaps = new Map();
    for (const r of scopedRows) {
      const key = r.branch || "-";
      if (!map.has(key)) {
        map.set(key, { branch: key, siteList: [], aktivitasPlan: 0, planSp: 0, actualSp: 0, siteNol: 0 });
        noteSets.set(key, new Set());
        kecMaps.set(key, new Map());
      }
      const b = map.get(key);
      b.siteList.push(r);
      b.aktivitasPlan += Number(r.aktivitas_plan || 0);
      b.planSp += Number(r.plan_sp || 0);
      b.actualSp += Number(r.actual_sp || 0);
      if (Number(r.actual_sp || 0) === 0) b.siteNol += 1;
      if (r.kecamatan_name) noteSets.get(key).add(r.kecamatan_name);

      // Mapping berjenjang branch -> KECAMATAN (bukan langsung ke site):
      // sebelum lihat site satu-satu, kita perlu tahu di kecamatan fokus
      // mana saja di branch ini yang SUDAH ada aktivitas/event dan mana
      // yang belum, baru dari situ drill-down ke site di kecamatan itu.
      const kecKey = r.kecamatan_name || "-";
      const kMap = kecMaps.get(key);
      if (!kMap.has(kecKey)) {
        kMap.set(kecKey, { kecamatanName: kecKey, siteList: [], aktivitasPlan: 0, planSp: 0, actualSp: 0, siteNol: 0, siteAda: 0 });
      }
      const kc = kMap.get(kecKey);
      kc.siteList.push(r);
      kc.aktivitasPlan += Number(r.aktivitas_plan || 0);
      kc.planSp += Number(r.plan_sp || 0);
      kc.actualSp += Number(r.actual_sp || 0);
      const hasEvent = Number(r.aktivitas_plan || 0) > 0 || Number(r.actual_sp || 0) > 0;
      if (hasEvent) kc.siteAda += 1;
      if (Number(r.actual_sp || 0) === 0) kc.siteNol += 1;
    }
    return Array.from(map.values()).map((b) => {
      const kecamatanList = Array.from(kecMaps.get(b.branch).values())
        .map((kc) => ({ ...kc, kecAda: kc.siteAda > 0, pct: achPct(kc.actualSp, kc.planSp) }))
        .sort((x, y) => (y.kecAda - x.kecAda) || achPct(y.actualSp, y.planSp) - achPct(x.actualSp, x.planSp) || x.kecamatanName.localeCompare(y.kecamatanName));
      const kecBelum = kecamatanList.filter((kc) => !kc.kecAda).length;
      return { ...b, noteCount: noteSets.get(b.branch).size, kecamatanList, kecBelum };
    });
  }, [scopedRows]);

  const totalKecCount = useMemo(() => {
    const set = new Set();
    for (const r of scopedRows) { if (r.kecamatan_name) set.add(r.kecamatan_name); }
    return set.size;
  }, [scopedRows]);

  const total = useMemo(() => branches.reduce((acc, b) => ({
    siteFocus: acc.siteFocus + b.siteList.length,
    aktivitasPlan: acc.aktivitasPlan + b.aktivitasPlan,
    planSp: acc.planSp + b.planSp,
    actualSp: acc.actualSp + b.actualSp,
    siteNol: acc.siteNol + b.siteNol,
  }), { siteFocus: 0, aktivitasPlan: 0, planSp: 0, actualSp: 0, siteNol: 0 }), [branches]);

  const visibleBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = branches;
    if (q) {
      list = branches
        .map((b) => {
          const branchHit = b.branch.toLowerCase().includes(q);
          const siteList = branchHit ? b.siteList : b.siteList.filter((k) => (k.site_name || "").toLowerCase().includes(q) || (k.kecamatan_name || "").toLowerCase().includes(q));
          return siteList.length ? { ...b, siteList } : null;
        })
        .filter(Boolean);
    }
    const sorted = list.slice();
    if (sortKey === "ach_asc") {
      sorted.sort((a, b) => achPct(a.actualSp, a.planSp) - achPct(b.actualSp, b.planSp) || a.branch.localeCompare(b.branch));
    } else if (sortKey === "ach_desc") {
      sorted.sort((a, b) => achPct(b.actualSp, b.planSp) - achPct(a.actualSp, a.planSp) || a.branch.localeCompare(b.branch));
    } else if (sortKey === "kecnol_desc") {
      sorted.sort((a, b) => b.siteNol - a.siteNol || a.branch.localeCompare(b.branch));
    } else if (sortKey === "kecnol_asc") {
      sorted.sort((a, b) => a.siteNol - b.siteNol || a.branch.localeCompare(b.branch));
    } else {
      sorted.sort((a, b) => a.branch.localeCompare(b.branch));
    }
    return sorted;
  }, [branches, query, sortKey]);

  const totalPct = achPct(total.actualSp, total.planSp);

  if (sessionLoading || rows === null) {
    return (
      <div style={{ padding: "20px 20px 0" }}><ShellSpinner /></div>
    );
  }

  return (
    <div style={{ padding: "14px 20px 28px" }}>
      <div style={{ fontSize: 12, color: "#8A8A96" }}>
        {cfg.subtitle} - {periodLabel}.
      </div>

      {err && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "#FFEBEE", border: "1px solid #F3C6D6", color: "#C62828", fontSize: 12.5 }}>{err}</div>
      )}

      {!err && branches.length === 0 && (
        <div style={{ marginTop: 40, textAlign: "center", color: "#8A8A96", fontSize: 13 }}>
          {cfg.emptyText(scope?.branchName)}
        </div>
      )}

      {branches.length > 0 && (
        <>
          <div style={{
            marginTop: 14, position: "relative", borderRadius: 22, padding: "20px 18px 18px", overflow: "hidden",
            background: cfg.heroGradient,
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 8px 20px rgba(17,17,20,0.16), 0 2px 5px rgba(17,17,20,0.1)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total {branches.length} Branch</div>
                <div style={{
                  marginTop: 8, fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1,
                  background: cfg.totalGradient,
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>{fmtInt(cfg.totalEntity === "kecamatan" ? totalKecCount : total.siteFocus)}</div>
                <div style={{ marginTop: 3, fontSize: 12.5, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>{cfg.totalUnitLabel}</div>
                {cfg.totalEntity === "kecamatan" && (
                  <div style={{ marginTop: 2, fontSize: 10.5, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{fmtInt(total.siteFocus)} site fokus</div>
                )}
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{totalPct}%</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Ach SP</div>
              </div>
            </div>

            <div style={{ marginTop: 14, height: 9, borderRadius: 999, background: "rgba(0,0,0,0.25)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, totalPct)}%`, borderRadius: 999, background: cfg.barGradient }} />
            </div>

            <div style={{ display: "flex", marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
              <HeroStat icon={Target} dot="#FFFFFF" label="Aktivitas Plan" value={fmtInt(total.aktivitasPlan)} />
              <HeroDivider />
              <HeroStat icon={ListChecks} dot={cfg.accentSoft} label="Plan SP" value={fmtInt(total.planSp)} valueColor={cfg.accentSoft} />
              <HeroDivider />
              <HeroStat icon={CheckCircle2} dot={cfg.accent} label="Actual SP" value={fmtInt(total.actualSp)} valueColor={cfg.accent} />
              <HeroDivider />
              <HeroStat icon={AlertTriangle} dot="#F5CD46" label="Site 0 SP" value={fmtInt(total.siteNol)} valueColor={total.siteNol > 0 ? "#F5CD46" : undefined} />
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px", position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={14} color="#B0B0BA" style={{ position: "absolute", left: 12, pointerEvents: "none" }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari branch atau site..."
                style={{
                  width: "100%", background: "#F6F7F9", border: "1px solid #ECEDF0", borderRadius: 12,
                  padding: "9px 30px 9px 32px", fontSize: 12.5, color: "#17181C", fontFamily: FF, boxSizing: "border-box",
                }} />
              {query && (
                <button onClick={() => setQuery("")} style={{ position: "absolute", right: 8, background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}>
                  <X size={13} color="#B0B0BA" />
                </button>
              )}
            </div>
            {regionOptions.length > 1 && (
              <div style={{ position: "relative", flexShrink: 0 }}>
                <select value={region} onChange={(e) => setRegion(e.target.value)}
                  style={{
                    appearance: "none", WebkitAppearance: "none", height: "100%", background: region ? "#EDF6FE" : "#F6F7F9",
                    border: `1px solid ${region ? "#BEE3FB" : "#ECEDF0"}`, borderRadius: 12, padding: "9px 28px 9px 10px",
                    fontSize: 11.5, fontWeight: 700, color: region ? "#0369A1" : "#17181C", fontFamily: FF, cursor: "pointer", maxWidth: 130,
                  }}>
                  <option value="">Semua Region</option>
                  {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: region ? "#0369A1" : "#8A8A96" }} />
              </div>
            )}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}
                style={{
                  appearance: "none", WebkitAppearance: "none", height: "100%", background: "#F6F7F9", border: "1px solid #ECEDF0",
                  borderRadius: 12, padding: "9px 28px 9px 10px", fontSize: 11.5, fontWeight: 700, color: "#17181C",
                  fontFamily: FF, cursor: "pointer",
                }}>
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <ArrowUpDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8A8A96" }} />
            </div>
          </div>

          {visibleBranches.length === 0 && (
            <div style={{ marginTop: 30, textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>
              Tidak ada hasil untuk &quot;{query}&quot;.
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleBranches.map((b) => {
              const pct = achPct(b.actualSp, b.planSp);
              const isOpen = openBranch === b.branch;
              return (
                <div key={b.branch} style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 18, boxShadow: "0 2px 10px rgba(23,24,28,0.04)" }}>
                  <button onClick={() => { setOpenBranch(isOpen ? null : b.branch); setOpenKecamatan(null); }}
                    style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "15px 16px 10px", cursor: "pointer", fontFamily: FF }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.branch}</div>
                        {b.siteNol > 0 && <AlertTriangle size={12.5} color="#C62828" style={{ flexShrink: 0 }} />}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: achColor(pct), background: achBg(pct), borderRadius: 999, padding: "3px 9px" }}>{pct}%</span>
                        <ChevronRight size={16} color="#B0B0BA" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" }} />
                      </div>
                    </div>

                    <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: "#F1F2F5", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: 999, background: achColor(pct) }} />
                    </div>
                  </button>

                  <div style={{ padding: "0 16px 15px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                    <CardStat icon={RadioTower} dot={cfg.dotSite} label={cfg.unitLabel} value={fmtInt(b.siteList.length)} />
                    <CardStat icon={ListChecks} dot="#2563EB" label="Plan SP" value={fmtInt(b.planSp)}
                      info={`Mencakup ${fmtInt(b.siteList.length)} site · ${fmtInt(b.noteCount)} ${cfg.noteLabel}`}
                      infoId={`${b.branch}-plansp`} openInfoId={openInfoId} onToggleInfo={toggleInfo} />
                    <CardStat icon={CheckCircle2} dot={achColor(pct)} label="Actual SP" value={fmtInt(b.actualSp)}
                      info={`Mencakup ${fmtInt(b.siteList.length)} site · ${fmtInt(b.noteCount)} ${cfg.noteLabel}`}
                      infoId={`${b.branch}-actualsp`} openInfoId={openInfoId} onToggleInfo={toggleInfo} />
                    <CardStat icon={AlertTriangle} dot={b.siteNol > 0 ? "#C62828" : "#6B7280"} label="Site 0 SP" value={fmtInt(b.siteNol)} warn={b.siteNol > 0} />
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: "1px solid #F1F2F5", padding: "10px 16px 14px", background: "#FAFAFB", borderRadius: "0 0 18px 18px" }}>
                      {cfg.groupByKecamatan ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                              {cfg.detailTitle} {b.branch} ({b.kecamatanList.length})
                            </div>
                            {b.kecBelum > 0 && (
                              <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, color: "#C62828", background: "#FFEBEE", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                                {b.kecBelum} kec. belum ada event
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {b.kecamatanList.map((kc) => (
                              <KecamatanRow key={`${b.branch}-${kc.kecamatanName}`} branch={b.branch} kc={kc} cfg={cfg}
                                isOpen={openKecamatan === `${b.branch}::${kc.kecamatanName}`}
                                onToggle={() => setOpenKecamatan((prev) => prev === `${b.branch}::${kc.kecamatanName}` ? null : `${b.branch}::${kc.kecamatanName}`)} />
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
                            {cfg.detailTitle} {b.branch} ({b.siteList.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {b.siteList.slice().sort((x, y) => achPct(y.actual_sp, y.plan_sp) - achPct(x.actual_sp, x.plan_sp) || (x.site_name || "").localeCompare(y.site_name || "")).map((k) => (
                              <SiteRow key={`${b.branch}-${k.site_id}`} k={k} cfg={cfg} showKecamatan />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Baris satu KECAMATAN di dalam kartu branch (khusus mode groupByKecamatan,
 * yaitu Kecamatan Fokus) - level TENGAH sebelum drill-down ke site: nunjukin
 * apakah kecamatan fokus ini SUDAH ada event/aktivitas (badge "X/Y site
 * sudah ada event") atau BELUM SAMA SEKALI (badge merah "Belum ada event"),
 * baru kalau di-tap dia expand nampilin site-site di kecamatan itu (SiteRow,
 * sama persis dgn tampilan site-list lama) - jadi urutannya branch -> kecamatan
 * fokus -> site, bukan langsung branch -> site kayak sebelumnya. */
function KecamatanRow({ branch, kc, cfg, isOpen, onToggle }) {
  const belum = kc.siteAda === 0;
  return (
    <div style={{ borderRadius: 12, background: "#fff", border: `1px solid ${belum ? "#F3C6D6" : "#ECEDF0"}`, overflow: "hidden" }}>
      <button onClick={onToggle}
        style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 10px", cursor: "pointer", fontFamily: FF }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, background: cfg.softBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MapPinned size={12} color={cfg.dotSite} strokeWidth={2.4} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kc.kecamatanName}</div>
              <div style={{ fontSize: 10, color: belum ? "#C62828" : "#8A8A96", fontWeight: belum ? 700 : 400, marginTop: 1 }}>
                {belum ? "Belum ada event" : `${fmtInt(kc.siteAda)}/${fmtInt(kc.siteList.length)} site sudah ada event`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: achColor(kc.pct), background: achBg(kc.pct), borderRadius: 999, padding: "2px 8px" }}>{kc.pct}%</span>
            <ChevronRight size={14} color="#B0B0BA" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" }} />
          </div>
        </div>
      </button>
      {isOpen && (
        <div style={{ borderTop: "1px solid #F1F2F5", padding: "8px 10px 10px", background: "#FAFAFB", display: "flex", flexDirection: "column", gap: 6 }}>
          {kc.siteList.slice().sort((x, y) => achPct(y.actual_sp, y.plan_sp) - achPct(x.actual_sp, x.plan_sp) || (x.site_name || "").localeCompare(y.site_name || "")).map((k) => (
            <SiteRow key={`${branch}-${k.site_id}`} k={k} cfg={cfg} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Baris satu SITE - dipakai baik langsung di bawah branch (mode site-lrs,
 * showKecamatan=true supaya nama kecamatannya kelihatan) maupun di dalam
 * KecamatanRow (mode kecamatan-fokus, nama kecamatan sudah jadi header jadi
 * cukup nama site + jumlah aktivitas & Plan SP). Diekstrak dari markup lama
 * biar bisa dipakai ulang di dua level hierarki tanpa duplikasi. */
function SiteRow({ k, cfg, showKecamatan }) {
  const kPct = achPct(k.actual_sp, k.plan_sp);
  const zero = Number(k.actual_sp || 0) === 0;
  return (
    <div style={{ padding: "9px 10px", borderRadius: 10, background: "#fff", border: "1px solid #ECEDF0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: cfg.softBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RadioTower size={13} color={cfg.dotSite} strokeWidth={2.4} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.site_name || k.site_id || "-"}</div>
            <div style={{ fontSize: 10.5, color: "#8A8A96", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {showKecamatan ? `${k.kecamatan_name || "-"} · ` : ""}{fmtInt(k.aktivitas_plan)} aktivitas · {fmtInt(k.plan_sp)} Plan SP
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {zero && <span style={{ fontSize: 10, fontWeight: 800, color: "#C62828", background: "#FFEBEE", borderRadius: 999, padding: "2px 7px" }}>0 SP</span>}
          <span style={{ fontSize: 11.5, fontWeight: 800, color: achColor(kPct) }}>{fmtInt(k.actual_sp)} <span style={{ color: "#B0B0BA", fontWeight: 600 }}>({kPct}%)</span></span>
        </div>
      </div>
      <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: "#F1F2F5", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, kPct)}%`, borderRadius: 999, background: achColor(kPct) }} />
      </div>
    </div>
  );
}

/** Stat di dalam HERO (latar gradient gelap ala kartu Achievement) - badge ikon bulat translucent
 * putih di atas label+value, gaya SAMA PERSIS dgn QuadStat (kartu
 * Achievement Beranda, app/martahub/m/page.jsx) supaya "kartu summary" di
 * Report terasa satu bahasa visual dgn Beranda, bukan versi sendiri lagi. */
/** Badge ikon bulat translucent bertinta warna (dot) di atas label+value -
 * gaya SAMA PERSIS dgn QuadStat pd kartu Achievement Beranda (dot putih
 * utk Plan, pink utk Actual/Selesai, teal utk GA, kuning utk peringatan)
 * supaya kartu TOTAL di Report kelihatan satu bahasa visual dgn Beranda,
 * bukan versi merah/pink sendiri lagi. */
function HeroStat({ icon: Icon, dot = "#FFFFFF", label, value, valueColor }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
      <div style={{ width: 26, height: 26, borderRadius: 9, margin: "0 auto 6px", background: `${dot}26`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={13} color={dot} strokeWidth={2.4} />
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 14.5, fontWeight: 800, color: valueColor || "#FFFFFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
function HeroDivider() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.08)" }} />;
}

/** Stat di dalam kartu branch (latar putih) - versi terang dari HeroStat,
 * badge ikon bulat bertinta warna (dot) sesuai jenis metriknya - Actual GA
 * pakai warna dinamis sesuai pencapaian (achColor), sama spt warna pill %
 * di header kartu, supaya "hijau/oren/merah" konsisten di seluruh kartu. */
function CardStat({ icon: Icon, dot, label, value, warn, info, infoId, openInfoId, onToggleInfo }) {
  // Ikon info "i" (cuma dipasang kalau prop `info` diisi, mis. utk Plan
  // GA/Actual GA - jelasin GA itu ngerangkum berapa site & berapa
  // kecamatan). Tooltip SEKARANG "controlled" dari induk (openInfoId
  // dibandingkan ke infoId, bukan state lokal per CardStat lagi) - spy
  // cuma SATU tooltip yg bisa kebuka dlm satu waktu di SELURUH kartu
  // branch (bukan cuma per branch), dan klik di mana saja selain trigger
  // (lihat listener "click di luar" di KecamatanFokusReport) langsung
  // menutupnya. data-info-trigger dipasang di elemen ini spy listener itu
  // tau klik ini BUKAN "klik di luar".
  const isOpen = info && openInfoId === infoId;
  const clickable = !!info;
  return (
    <div
      data-info-trigger={clickable ? "" : undefined}
      onClick={clickable ? (e) => { e.stopPropagation(); onToggleInfo(infoId); } : undefined}
      role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined}
      style={{ textAlign: "center", position: "relative", cursor: clickable ? "pointer" : "default", zIndex: isOpen ? 30 : "auto" }}>
      <div style={{
        width: 24, height: 24, borderRadius: 8, margin: "0 auto 5px", background: `${dot}18`, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: isOpen ? `0 0 0 3px ${dot}30` : "none", transition: "box-shadow .15s ease",
      }}>
        <Icon size={12} color={dot} strokeWidth={2.4} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: "#8A8A96", textTransform: "uppercase", letterSpacing: 0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {info && <Info size={9} color={isOpen ? dot : "#B0B0BA"} style={{ flexShrink: 0 }} />}
      </div>
      <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 800, color: warn ? "#C62828" : "#17181C" }}>{value}</div>
      {isOpen && (
        <div data-info-trigger="" style={{
          position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 8, zIndex: 30,
          width: 148,
        }}>
          <div style={{
            width: 7, height: 7, background: "#17181C", transform: "translateX(-50%) rotate(45deg)",
            position: "absolute", top: -3, left: "50%", borderRadius: 1.5,
          }} />
          <div style={{
            background: "#17181C", color: "#FFFFFF", fontSize: 10, fontWeight: 700, lineHeight: 1.35, padding: "8px 10px", borderRadius: 10,
            textAlign: "center", boxShadow: "0 8px 20px rgba(23,24,28,0.28)",
          }}>
            {info}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Report: Campaign - LEADERBOARD BME/RGE utk 1 campaign terpilih (mis.
// "Market Blitz Sabtu") - dipilih lewat dropdown campaign (bukan month
// picker, krn campaign attach ke tanggalnya sendiri2, bukan periode).
// Data dari RPC mh_campaigns_list_for_me (utk isi dropdown) +
// mh_campaign_compliance_report(p_caller_email, p_campaign_id) - RPC yg
// sama dgn ComplianceModal CMS desktop, TAPI skr py 2 kolom tambahan
// (actual_sp, actual_fwa) khusus utk leaderboard ini.
//
// Ranking berdasar pencapaian GA (SP+FWA) TERBESAR - BUKAN cuma status
// ada-plan-atau-tidak spt versi sblmnya (grouped by branch). BME yg belum
// bikin plan sama sekali tetap MUNCUL di daftar (bukan disembunyikan) tapi
// ditandai badge "Belum Plan" merah, spy sekaligus kelihatan siapa yg
// perlu ditagih.
//
// actual_sp/actual_fwa DIAKUMULASI dari SEMUA aktivitas BME itu di tanggal
// yg SAMA dgn plan_date campaign (bukan cuma aktivitas yg campaign_id-nya
// match) - user (SPM/Head) minta ini eksplisit krn BME tetap WAJIB bikin
// plan tersendiri utk campaign (has_plan tetap dicek ketat via campaign_id),
// tapi pencapaian SP/FWA-nya boleh nyantol dari plan lain yg kebetulan
// sudah ada di hari itu, spy tidak maksa BME bikin plan duplikat cuma demi
// ke-hitung di leaderboard.
// ──────────────────────────────────────────────────────────────────────────

function CampaignComplianceReport({ monthKey, monthLabel }) {
  const { loading: sessionLoading, email } = useMartaSession();
  const [campaigns, setCampaigns] = useState(null);
  const [campaignId, setCampaignId] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  // List activity mentah pada tanggal campaign - toggle "Sertakan semua
  // activity hari ini" default AKTIF (nyambung dgn aturan akumulasi GA
  // leaderboard di atas yg emang dari awal include semua activity di
  // tanggal yg sama, bukan cuma yg campaign_id-nya match). Kalau
  // dimatikan, list ini persis sama dgn activity yg campaign_id-nya = campaign ini saja.
  const [includeAllActivities, setIncludeAllActivities] = useState(true);
  const [activities, setActivities] = useState(null);
  const [actErr, setActErr] = useState("");
  // Detail activity per orang DITUTUP secara default - bisa dibuka
  // satu-satu (Set, bukan satu state tunggal), BUKAN accordion yg cuma
  // bisa 1 terbuka dlm satu waktu, krn user eksplisit minta bisa buka
  // banyak baris sekaligus kalau perlu.
  const [openUserIds, setOpenUserIds] = useState(() => new Set());
  const toggleUserOpen = (userId) => {
    setOpenUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  useEffect(() => {
    if (sessionLoading || !email) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseMarta.rpc("mh_campaigns_list_for_me", { p_caller_email: email });
        if (error) throw error;
        if (!alive) return;
        setCampaigns(data || []);
      } catch (e) {
        if (alive) { setErr(e.message || "Gagal memuat campaign"); setCampaigns([]); }
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, email]);

  // Filter campaign berdasarkan bulan yg dipilih di header (posisi sama
  // persis dgn month picker Kecamatan Fokus) - dicocokkan ke plan_date
  // campaign, bukan created_at, krn plan_date itulah "tanggal campaign"
  // yg relevan buat user.
  const monthCampaigns = useMemo(() => {
    if (!monthKey) return campaigns || [];
    const { start, end } = monthKeyToRange(monthKey);
    return (campaigns || []).filter((c) => c.plan_date >= start && c.plan_date <= end);
  }, [campaigns, monthKey]);

  // Kalau campaignId yg lagi dipilih tidak (lagi) ada di bulan yg aktif
  // (mis. abis ganti bulan di header), fallback ke campaign active/pertama
  // di bulan itu - dihitung langsung (useMemo), BUKAN via setState di
  // effect, spy tidak nambah cascading-render lint error baru.
  const effectiveCampaignId = useMemo(() => {
    if (campaignId && monthCampaigns.some((c) => c.id === campaignId)) return campaignId;
    return monthCampaigns.find((c) => c.status === "active")?.id || monthCampaigns[0]?.id || "";
  }, [campaignId, monthCampaigns]);

  useEffect(() => {
    if (!email || !effectiveCampaignId) return;
    let alive = true;
    setRows(null); setErr("");
    (async () => {
      try {
        const { data, error } = await supabaseMarta.rpc("mh_campaign_compliance_report", { p_caller_email: email, p_campaign_id: effectiveCampaignId });
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) {
        if (alive) { setErr(e.message || "Gagal memuat kepatuhan campaign"); setRows([]); }
      }
    })();
    return () => { alive = false; };
  }, [email, effectiveCampaignId, campaigns]);

  useEffect(() => {
    if (!email || !effectiveCampaignId) return;
    let alive = true;
    (async () => {
      setActivities(null); setActErr("");
      try {
        const { data, error } = await supabaseMarta.rpc("mh_campaign_activity_list", {
          p_caller_email: email, p_campaign_id: effectiveCampaignId, p_include_all: includeAllActivities,
        });
        if (error) throw error;
        if (alive) setActivities(data || []);
      } catch (e) {
        if (alive) { setActErr(e.message || "Gagal memuat activity"); setActivities([]); }
      }
    })();
    return () => { alive = false; };
  }, [email, effectiveCampaignId, includeAllActivities, campaigns]);

  const campaign = (campaigns || []).find((c) => c.id === effectiveCampaignId);
  // Ranking leaderboard: GA (SP+FWA) terbesar di atas - tie-break nama
  // supaya urutan stabil (bukan acak) kalau ada yg GA-nya sama (mis.
  // sama2 0 krn belum lapor/belum plan).
  const ranked = useMemo(() => {
    return (rows || [])
      .map((r) => ({ ...r, ga: Number(r.actual_sp || 0) + Number(r.actual_fwa || 0) }))
      .sort((a, b) => b.ga - a.ga || a.user_name.localeCompare(b.user_name));
  }, [rows]);
  const totalDone = (rows || []).filter((r) => r.has_plan).length;
  const totalAll = (rows || []).length;
  const totalGa = ranked.reduce((acc, r) => acc + r.ga, 0);

  // Activity dikelompokkan per BME (bme_user_id) - dipakai buat detail
  // nested di bawah masing2 baris leaderboard, BUKAN lagi 1 list rata di
  // bawah semua leaderboard.
  const activitiesByUser = useMemo(() => {
    const map = new Map();
    for (const a of activities || []) {
      if (!map.has(a.bme_user_id)) map.set(a.bme_user_id, []);
      map.get(a.bme_user_id).push(a);
    }
    return map;
  }, [activities]);

  if (campaigns === null) {
    return <div style={{ padding: "60px 0" }}><ShellSpinner /></div>;
  }
  if (monthCampaigns.length === 0) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
        <Megaphone size={28} color="#C7C8D1" />
        <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: "#8A8A96" }}>Belum ada campaign di {monthLabel || "bulan ini"}.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 20px 32px" }}>
      <div style={{ position: "relative" }}>
        <select value={effectiveCampaignId} onChange={(e) => setCampaignId(e.target.value)}
          style={{
            width: "100%", appearance: "none", WebkitAppearance: "none", background: "#FFFFFF", border: "1px solid #E9EAEE",
            borderRadius: 14, padding: "12px 34px 12px 14px", fontSize: 13.5, fontWeight: 800, color: "#17181C",
            fontFamily: FF, cursor: "pointer", boxShadow: "0 1px 4px rgba(23,24,28,0.05)",
          }}>
          {monthCampaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {new Date(c.plan_date + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}{c.status !== "active" ? " (Arsip)" : ""}
            </option>
          ))}
        </select>
        <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8A8A96" }} />
      </div>

      {campaign && (
        <div style={{
          marginTop: 14, position: "relative", borderRadius: 22, padding: "20px 18px 18px", overflow: "hidden",
          background: "linear-gradient(150deg,#38383E 0%,#4A4A50 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 8px 20px rgba(17,17,20,0.16), 0 2px 5px rgba(17,17,20,0.1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Users size={15} color="#fff" />
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 0.3 }}>Total GA (SP+FWA)</div>
          </div>
          <div style={{
            marginTop: 8, fontSize: 32, fontWeight: 800, lineHeight: 1,
            background: "linear-gradient(120deg,#FFFFFF 0%,#F7D9E8 55%,#EC1E79 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            {rows === null ? "-" : totalGa}
          </div>
          <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
            {campaign.name} · {rows === null ? "-" : `${totalDone}/${totalAll} sudah bikin plan`}
          </div>
        </div>
      )}

      {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FFEBEE", color: "#C62828", fontSize: 12.5 }}>{err}</div>}

      {/* Toggle scope activity ("Sertakan semua activity hari ini",
          default AKTIF) - berlaku global utk SEMUA detail per-orang di
          bawah (bukan detail activitynya sendiri yg toggle buka/tutup,
          itu per baris & independen - lihat openUserIds). */}
      {campaign && (
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setIncludeAllActivities((v) => !v)}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999,
              background: includeAllActivities ? "#EDE9FE" : "#F1F2F5", border: `1px solid ${includeAllActivities ? "#DDD3FB" : "#E9EAEE"}`,
              cursor: "pointer", fontFamily: FF,
            }}>
            <ListFilter size={11} color={includeAllActivities ? "#7C3AED" : "#8A8A96"} />
            <span style={{ fontSize: 10.5, fontWeight: 800, color: includeAllActivities ? "#7C3AED" : "#8A8A96" }}>
              Semua Activity Hari Ini
            </span>
            <span style={{
              position: "relative", flexShrink: 0, width: 26, height: 15, borderRadius: 999,
              background: includeAllActivities ? "#7C3AED" : "#D0D1D8", transition: "background .15s ease",
            }}>
              <span style={{
                position: "absolute", top: 1.5, left: includeAllActivities ? 12.5 : 1.5, width: 12, height: 12, borderRadius: "50%",
                background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.25)", transition: "left .15s ease",
              }} />
            </span>
          </button>
        </div>
      )}
      {actErr && <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#FFEBEE", color: "#C62828", fontSize: 12.5 }}>{actErr}</div>}

      {/* Leaderboard - satu daftar ranking flat (bukan lagi dikelompokkan
          per branch spt versi sblmnya), diurutkan GA (SP+FWA) terbesar di
          atas. 3 rank teratas dikasih aksen medali (emas/perak/perunggu)
          spy langsung kebaca sbg "leaderboard" bukan cuma daftar biasa.
          BME yg belum bikin plan (has_plan=false) TETAP MUNCUL di daftar
          (bukan disembunyikan) - biasanya GA-nya 0 jadi otomatis turun ke
          bawah, tapi badge "Belum Plan" merah tetap ditampilkan tegas di
          sampingnya spy SPM/Head langsung tahu siapa yg perlu ditagih,
          terlepas dari urutan ranking-nya. Detail activity tiap orang
          DITUTUP default - klik baris utk expand/collapse, per baris
          independen (lihat openUserIds/toggleUserOpen). */}
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {rows === null ? (
          <div style={{ padding: "40px 0" }}><ShellSpinner /></div>
        ) : rows.length === 0 && !err ? (
          <div style={{ textAlign: "center", padding: 30, color: "#8A8A96", fontSize: 13 }}>Tidak ada BME/RGE dlm cakupan campaign ini.</div>
        ) : (
          ranked.map((p, i) => {
            const rank = i + 1;
            const medal = rank === 1 ? "#F5C518" : rank === 2 ? "#B0B4BC" : rank === 3 ? "#C97B3D" : null;
            const isOpen = openUserIds.has(p.user_id);
            const userActs = activitiesByUser.get(p.user_id) || [];
            return (
              <div key={p.user_id} style={{
                borderRadius: 14, background: "#FFFFFF", border: `1px solid ${medal ? medal + "55" : "#EEEFF2"}`, overflow: "hidden",
              }}>
                <button onClick={() => toggleUserOpen(p.user_id)}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "11px 12px", cursor: "pointer", fontFamily: FF, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    flexShrink: 0, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    background: medal || "#F1F2F5", color: medal ? "#FFFFFF" : "#8A8A96", fontSize: 11.5, fontWeight: 800, fontFamily: FF,
                  }}>
                    {rank}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.user_name} <span style={{ color: "#8A8A96", fontWeight: 500 }}>({p.brand === "tri" ? "3ID" : p.brand === "im3" ? "IM3" : p.brand})</span>
                    </div>
                    <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: "#8A8A96" }}>{p.branch_name}</span>
                      {!p.has_plan && (
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: "#C62828", background: "#FFEBEE", padding: "1px 6px", borderRadius: 999 }}>Belum Plan</span>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C" }}>{p.ga}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#B0B0BA", textTransform: "uppercase" }}>GA</div>
                  </div>
                  <ChevronRight size={15} color="#B0B0BA" style={{ flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" }} />
                </button>

                {isOpen && (
                  <div style={{ borderTop: "1px solid #F1F2F5", padding: "10px 12px 12px", background: "#FAFAFB" }}>
                    {activities === null ? (
                      <div style={{ padding: "16px 0" }}><ShellSpinner /></div>
                    ) : userActs.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 14, color: "#8A8A96", fontSize: 11.5 }}>
                        Tidak ada activity {includeAllActivities ? "di tanggal ini" : "yg dibuat khusus utk campaign ini"}.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {userActs.map((a) => {
                          const isThisCampaign = a.campaign_id === effectiveCampaignId;
                          const meta = statusMeta(a.status);
                          return (
                            <div key={a.activity_id} style={{ padding: "9px 10px", borderRadius: 10, background: "#fff", border: "1px solid #ECEDF0" }}>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ minWidth: 0 }}>
                                  {isThisCampaign ? (
                                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                      <Megaphone size={12} color="#EC1E79" style={{ flexShrink: 0, marginTop: 2 }} />
                                      <div className="mh-campaign-title-rpt" style={{
                                        fontSize: 12.5, fontWeight: 800, lineHeight: 1.32,
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                      }}>{(a.event_name || "-").replace(/_/g, " ")}</div>
                                    </div>
                                  ) : (
                                    <div style={{
                                      fontSize: 12.5, fontWeight: 800, color: "#17181C", lineHeight: 1.32,
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>{(a.event_name || "-").replace(/_/g, " ")}</div>
                                  )}
                                  <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    {a.brand && (
                                      <span style={{
                                        flexShrink: 0, fontSize: 9, fontWeight: 800, padding: "1.5px 6px", borderRadius: 999,
                                        background: a.brand.toLowerCase() === "tri" ? "#E23B86" : "#F5CD46",
                                        color: a.brand.toLowerCase() === "tri" ? "#FFFFFF" : "#17181C",
                                      }}>{a.brand.toLowerCase() === "tri" ? "3ID" : "IM3"}</span>
                                    )}
                                    <span style={{ fontSize: 10, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {[a.mc || a.site_id].filter(Boolean).join(" · ")}
                                    </span>
                                  </div>
                                  {a.start_time && (
                                    <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 4, color: "#B0B0BA" }}>
                                      <Clock size={9.5} />
                                      <span style={{ fontSize: 9.5, fontWeight: 600 }}>
                                        {a.start_time.slice(0, 5)}{a.end_time ? `-${a.end_time.slice(0, 5)}` : ""}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, padding: "2.5px 7px", borderRadius: 999, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
                                  {meta.label}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <style jsx>{`
        .mh-campaign-title-rpt {
          background: linear-gradient(90deg, #ED1C24 0%, #EC008C 25%, #F5CD46 50%, #ED1C24 75%, #EC008C 100%);
          background-size: 300% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: mhCampaignShimmerRpt 7s linear infinite;
        }
        @keyframes mhCampaignShimmerRpt { 0% { background-position: 0% 50%; } 100% { background-position: 300% 50%; } }
      `}</style>
    </div>
  );
}
