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
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronDown, ChevronRight, MapPinned, RadioTower, Search, X, ArrowUpDown,
  AlertTriangle, Target, ListChecks, CheckCircle2, Megaphone, Users, Clock, ListFilter, Info, Check, CalendarRange,
} from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF } from "../_shared/MobileShell";
import { fmtInt, statusMeta } from "../_shared/activityUi";

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
        {tab === "kecamatan-fokus" && <FocusSiteReport mode="kecamatan-fokus" period={kecPeriod} periodLabel={kecPeriodLabel} />}
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
function achColor(pct) { return pct >= 40 ? "#2E7D32" : pct >= 20 ? "#B45309" : "#C62828"; }
function achBg(pct) { return pct >= 40 ? "#E8F5E9" : pct >= 20 ? "#FFF3E0" : "#FFEBEE"; }

const SORTS = [
  { key: "ach_asc", label: "Ach % Terendah" },
  { key: "ach_desc", label: "Ach % Tertinggi" },
  { key: "kecnol_desc", label: "Site 0 SP Terbanyak" },
  { key: "kecnol_asc", label: "Site 0 SP Tersedikit" },
];

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
    accent: "#0EA5E9",
    accentSoft: "#8AE0EF",
    heroGradient: "linear-gradient(150deg,#1B3A4B 0%,#215065 100%)",
    totalGradient: "linear-gradient(120deg,#FFFFFF 0%,#BFEAFB 55%,#0EA5E9 100%)",
    barGradient: "linear-gradient(90deg,#0369A1,#0EA5E9)",
    dotSite: "#0EA5E9",
    softBg: "rgba(14,165,233,0.1)",
  },
};

function FocusSiteReport({ mode, period, periodLabel }) {
  const cfg = FOCUS_MODES[mode];
  const { loading: sessionLoading, scope, email } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [openBranch, setOpenBranch] = useState(null);
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
        const { data, error } = await supabaseMarta
          .rpc(cfg.rpc, {
            p_caller_email: email, p_period_start: period.start, p_period_end: period.end,
          })
          .range(0, 19999); // avoid PostgREST's default 1000-row cap; this report can return 1500+ rows
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

  const scopedRows = useMemo(() => {
    if (!region) return rows || [];
    return (rows || []).filter((r) => r.region === region);
  }, [rows, region]);

  const branches = useMemo(() => {
    const map = new Map();
    const noteSets = new Map();
    for (const r of scopedRows) {
      const key = r.branch || "-";
      if (!map.has(key)) { map.set(key, { branch: key, siteList: [], aktivitasPlan: 0, planSp: 0, actualSp: 0, siteNol: 0 }); noteSets.set(key, new Set()); }
      const b = map.get(key);
      b.siteList.push(r);
      b.aktivitasPlan += Number(r.aktivitas_plan || 0);
      b.planSp += Number(r.plan_sp || 0);
      b.actualSp += Number(r.actual_sp || 0);
      if (Number(r.actual_sp || 0) === 0) b.siteNol += 1;
      if (r.kecamatan_name) noteSets.get(key).add(r.kecamatan_name);
    }
    return Array.from(map.values()).map((b) => ({ ...b, noteCount: noteSets.get(b.branch).size }));
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
                  <button onClick={() => setOpenBranch(isOpen ? null : b.branch)}
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
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
                        {cfg.detailTitle} {b.branch} ({b.siteList.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {b.siteList.slice().sort((x, y) => achPct(y.actual_sp, y.plan_sp) - achPct(x.actual_sp, x.plan_sp) || (x.site_name || "").localeCompare(y.site_name || "")).map((k) => {
                          const kPct = achPct(k.actual_sp, k.plan_sp);
                          const zero = Number(k.actual_sp || 0) === 0;
                          return (
                            <div key={`${b.branch}-${k.site_id}`}
                              style={{ padding: "9px 10px", borderRadius: 10, background: "#fff", border: "1px solid #ECEDF0" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: cfg.softBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <RadioTower size={13} color={cfg.dotSite} strokeWidth={2.4} />
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.site_name || k.site_id || "-"}</div>
                                    <div style={{ fontSize: 10.5, color: "#8A8A96", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.kecamatan_name || "-"} · {fmtInt(k.aktivitas_plan)} aktivitas · {fmtInt(k.plan_sp)} Plan SP</div>
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
                        })}
                      </div>
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
