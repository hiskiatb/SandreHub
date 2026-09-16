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
  ArrowLeft, ChevronDown, ChevronRight, MapPinned, Search, X, ArrowUpDown,
  AlertTriangle, Target, ListChecks, CheckCircle2, Megaphone, Check, Users,
} from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF } from "../_shared/MobileShell";
import { fmtInt } from "../_shared/activityUi";

const LAUNCH_YEAR = 2026, LAUNCH_MONTH = 7;
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
  { key: "kecamatan-fokus", label: "Kecamatan Fokus", icon: MapPinned, needsMonth: true },
  { key: "campaign", label: "Campaign", icon: Megaphone, needsMonth: false },
];

export default function ReportPage() {
  const router = useRouter();
  const [tab, setTab] = useState(REPORT_TABS[0].key);
  const months = useMemo(() => monthOptions(), []);
  const [monthKey, setMonthKey] = useState(() => months[0]?.key || "");
  const activeTab = REPORT_TABS.find((t) => t.key === tab) || REPORT_TABS[0];

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
        {tab === "kecamatan-fokus" && <KecamatanFokusReport monthKey={monthKey} monthLabel={months.find((o) => o.key === monthKey)?.label || ""} />}
        {tab === "campaign" && <CampaignComplianceReport />}
      </div>
    </MobileShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Report: Kecamatan Fokus - summary per Branch (Kec Focus, Aktivitas Plan,
// Plan GA, Actual GA, Ach%, Kec nol activity GA) + breakdown per branch
// berisi daftar kecamatan mana saja yg ditandai fokus.
//
// Data dari RPC `mh_kecamatan_fokus_report(p_caller_email, p_period_start,
// p_period_end)` (SECURITY DEFINER) - scoping visibilitas PERSIS pakai
// _mh_activity_calendar_rows() yg sudah dipakai Calendar CMS, bukan
// re-implement aturan role/region/branch dari nol.
//
// GA = SP+FWA (Plan GA = target_sp+target_fwa, Actual GA = actual_sp+
// actual_fwa) - definisi sama dgn Target/Actual SP&FWA yg sudah ada di
// seluruh MartaHub, bukan metrik baru.
//
// monthKey/monthLabel SEKARANG dioper dari ReportPage (header) - komponen
// ini TIDAK lagi punya month picker sendiri (lihat catatan v4 di atas).
// ──────────────────────────────────────────────────────────────────────────

function achPct(actual, plan) { return plan > 0 ? Math.round((actual / plan) * 100) : 0; }
function achColor(pct) { return pct >= 40 ? "#2E7D32" : pct >= 20 ? "#B45309" : "#C62828"; }
function achBg(pct) { return pct >= 40 ? "#E8F5E9" : pct >= 20 ? "#FFF3E0" : "#FFEBEE"; }

const SORTS = [
  { key: "branch", label: "Nama Branch" },
  { key: "ach_asc", label: "Ach % Terendah" },
  { key: "kecnol_desc", label: "Kec Nol GA Terbanyak" },
];

function KecamatanFokusReport({ monthKey, monthLabel }) {
  const { loading: sessionLoading, scope, email } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [openBranch, setOpenBranch] = useState(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("branch");

  useEffect(() => {
    if (sessionLoading || !monthKey || !email) return;
    let alive = true;
    setRows(null); setErr("");
    (async () => {
      try {
        const { start, end } = monthKeyToRange(monthKey);
        const { data, error } = await supabaseMarta.rpc("mh_kecamatan_fokus_report", {
          p_caller_email: email, p_period_start: start, p_period_end: end,
        });
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) {
        if (alive) { setErr(e.message || "Gagal memuat report"); setRows([]); }
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, monthKey, email]);

  const branches = useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      const key = r.branch || "-";
      if (!map.has(key)) map.set(key, { branch: key, kecList: [], aktivitasPlan: 0, planGa: 0, actualGa: 0, kecNol: 0 });
      const b = map.get(key);
      b.kecList.push(r);
      b.aktivitasPlan += Number(r.aktivitas_plan || 0);
      b.planGa += Number(r.plan_ga || 0);
      b.actualGa += Number(r.actual_ga || 0);
      if (Number(r.actual_ga || 0) === 0) b.kecNol += 1;
    }
    return Array.from(map.values());
  }, [rows]);

  const total = useMemo(() => branches.reduce((acc, b) => ({
    kecFocus: acc.kecFocus + b.kecList.length,
    aktivitasPlan: acc.aktivitasPlan + b.aktivitasPlan,
    planGa: acc.planGa + b.planGa,
    actualGa: acc.actualGa + b.actualGa,
    kecNol: acc.kecNol + b.kecNol,
  }), { kecFocus: 0, aktivitasPlan: 0, planGa: 0, actualGa: 0, kecNol: 0 }), [branches]);

  const visibleBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = branches;
    if (q) {
      list = branches
        .map((b) => {
          const branchHit = b.branch.toLowerCase().includes(q);
          const kecList = branchHit ? b.kecList : b.kecList.filter((k) => (k.kecamatan_name || "").toLowerCase().includes(q));
          return kecList.length ? { ...b, kecList } : null;
        })
        .filter(Boolean);
    }
    const sorted = list.slice();
    if (sortKey === "ach_asc") {
      sorted.sort((a, b) => achPct(a.actualGa, a.planGa) - achPct(b.actualGa, b.planGa) || a.branch.localeCompare(b.branch));
    } else if (sortKey === "kecnol_desc") {
      sorted.sort((a, b) => b.kecNol - a.kecNol || a.branch.localeCompare(b.branch));
    } else {
      sorted.sort((a, b) => a.branch.localeCompare(b.branch));
    }
    return sorted;
  }, [branches, query, sortKey]);

  const totalPct = achPct(total.actualGa, total.planGa);

  if (sessionLoading || rows === null) {
    return (
      <div style={{ padding: "20px 20px 0" }}><ShellSpinner /></div>
    );
  }

  return (
    <div style={{ padding: "14px 20px 28px" }}>
      <div style={{ fontSize: 12, color: "#8A8A96" }}>
        Pencapaian GA (SP+FWA) di kecamatan yang ditandai fokus, per branch - {monthLabel}.
      </div>

      {err && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "#FFEBEE", border: "1px solid #F3C6D6", color: "#C62828", fontSize: 12.5 }}>{err}</div>
      )}

      {!err && branches.length === 0 && (
        <div style={{ marginTop: 40, textAlign: "center", color: "#8A8A96", fontSize: 13 }}>
          Belum ada site yang ditandai Kecamatan Fokus{scope?.branchName ? ` di branch ${scope.branchName}` : ""} - tandai lewat CMS &gt; Master Data &gt; List Site.
        </div>
      )}

      {branches.length > 0 && (
        <>
          {/* HERO - gaya "kartu summary" SAMA dgn kartu Achievement di
              Beranda: badge ikon bulat translucent di atas tiap label+value
              (lihat QuadStat/DarkDetailRow di app/martahub/m/page.jsx),
              bukan lagi grid teks LABEL/value polos. */}
          <div style={{
            marginTop: 14, position: "relative", borderRadius: 22, padding: "20px 18px 18px", overflow: "hidden",
            background: "linear-gradient(150deg,#38383E 0%,#4A4A50 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 8px 20px rgba(17,17,20,0.16), 0 2px 5px rgba(17,17,20,0.1)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total {branches.length} Branch</div>
                <div style={{
                  marginTop: 8, fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1,
                  background: "linear-gradient(120deg,#FFFFFF 0%,#F7D9E8 55%,#EC1E79 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>{fmtInt(total.kecFocus)}</div>
                <div style={{ marginTop: 3, fontSize: 12.5, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>Kecamatan Fokus</div>
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{totalPct}%</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Ach GA</div>
              </div>
            </div>

            <div style={{ marginTop: 14, height: 9, borderRadius: 999, background: "rgba(0,0,0,0.25)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, totalPct)}%`, borderRadius: 999, background: "linear-gradient(90deg,#E63325,#EC1E79)" }} />
            </div>

            <div style={{ display: "flex", marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
              <HeroStat icon={Target} dot="#FFFFFF" label="Aktivitas Plan" value={fmtInt(total.aktivitasPlan)} />
              <HeroDivider />
              <HeroStat icon={ListChecks} dot="#7FD9C6" label="Plan GA" value={fmtInt(total.planGa)} valueColor="#7FD9C6" />
              <HeroDivider />
              <HeroStat icon={CheckCircle2} dot="#EC1E79" label="Actual GA" value={fmtInt(total.actualGa)} valueColor="#F286B4" />
              <HeroDivider />
              <HeroStat icon={AlertTriangle} dot="#F5CD46" label="Kec Nol GA" value={fmtInt(total.kecNol)} valueColor={total.kecNol > 0 ? "#F5CD46" : undefined} />
            </div>
          </div>

          {/* Pencarian + sort */}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={14} color="#B0B0BA" style={{ position: "absolute", left: 12, pointerEvents: "none" }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari branch atau kecamatan..."
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
              const pct = achPct(b.actualGa, b.planGa);
              const isOpen = openBranch === b.branch;
              return (
                <div key={b.branch} style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 10px rgba(23,24,28,0.04)" }}>
                  <button onClick={() => setOpenBranch(isOpen ? null : b.branch)}
                    style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "15px 16px", cursor: "pointer", fontFamily: FF }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.branch}</div>
                        {b.kecNol > 0 && <AlertTriangle size={12.5} color="#C62828" style={{ flexShrink: 0 }} />}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: achColor(pct), background: achBg(pct), borderRadius: 999, padding: "3px 9px" }}>{pct}%</span>
                        <ChevronRight size={16} color="#B0B0BA" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" }} />
                      </div>
                    </div>

                    <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: "#F1F2F5", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: 999, background: achColor(pct) }} />
                    </div>

                    <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                      <CardStat icon={MapPinned} dot="#6B7280" label="Kec Fokus" value={fmtInt(b.kecList.length)} />
                      <CardStat icon={ListChecks} dot="#2563EB" label="Plan GA" value={fmtInt(b.planGa)} />
                      <CardStat icon={CheckCircle2} dot={achColor(pct)} label="Actual GA" value={fmtInt(b.actualGa)} />
                      <CardStat icon={AlertTriangle} dot={b.kecNol > 0 ? "#C62828" : "#6B7280"} label="Kec Nol GA" value={fmtInt(b.kecNol)} warn={b.kecNol > 0} />
                    </div>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: "1px solid #F1F2F5", padding: "10px 16px 14px", background: "#FAFAFB" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
                        Kecamatan Fokus di {b.branch} ({b.kecList.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {b.kecList.slice().sort((x, y) => (x.kecamatan_name || "").localeCompare(y.kecamatan_name || "")).map((k) => {
                          const kPct = achPct(k.actual_ga, k.plan_ga);
                          const zero = Number(k.actual_ga || 0) === 0;
                          return (
                            <div key={`${b.branch}-${k.kecamatan_name}`}
                              style={{ padding: "9px 10px", borderRadius: 10, background: "#fff", border: "1px solid #ECEDF0" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.kecamatan_name || "-"}</div>
                                  <div style={{ fontSize: 10.5, color: "#8A8A96", marginTop: 1 }}>{fmtInt(k.aktivitas_plan)} aktivitas · {fmtInt(k.plan_ga)} Plan GA</div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  {zero && <span style={{ fontSize: 10, fontWeight: 800, color: "#C62828", background: "#FFEBEE", borderRadius: 999, padding: "2px 7px" }}>0 GA</span>}
                                  <span style={{ fontSize: 11.5, fontWeight: 800, color: achColor(kPct) }}>{fmtInt(k.actual_ga)} <span style={{ color: "#B0B0BA", fontWeight: 600 }}>({kPct}%)</span></span>
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
function CardStat({ icon: Icon, dot, label, value, warn }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ width: 24, height: 24, borderRadius: 8, margin: "0 auto 5px", background: `${dot}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={12} color={dot} strokeWidth={2.4} />
      </div>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: "#8A8A96", textTransform: "uppercase", letterSpacing: 0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 800, color: warn ? "#C62828" : "#17181C" }}>{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Report: Campaign - kepatuhan per BME/RGE utk 1 campaign terpilih (mis.
// "Market Blitz Sabtu") - dipilih lewat dropdown campaign (bukan month
// picker, krn campaign attach ke tanggalnya sendiri2, bukan periode).
// Data dari RPC mh_campaigns_list_for_me (utk isi dropdown) +
// mh_campaign_compliance_report(p_caller_email, p_campaign_id) (utk isi
// status has_plan per BME/RGE) - RPC SAMA PERSIS dgn yg dipakai
// ComplianceModal di CMS desktop /martahub/campaigns, cuma tampilannya
// versi mobile (kartu, bukan modal).
// ──────────────────────────────────────────────────────────────────────────

function CampaignComplianceReport() {
  const { loading: sessionLoading, email } = useMartaSession();
  const [campaigns, setCampaigns] = useState(null);
  const [campaignId, setCampaignId] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (sessionLoading || !email) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseMarta.rpc("mh_campaigns_list_for_me", { p_caller_email: email });
        if (error) throw error;
        if (!alive) return;
        const list = data || [];
        setCampaigns(list);
        setCampaignId((prev) => prev || list.find((c) => c.status === "active")?.id || list[0]?.id || "");
      } catch (e) {
        if (alive) { setErr(e.message || "Gagal memuat campaign"); setCampaigns([]); }
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, email]);

  useEffect(() => {
    if (!email || !campaignId) return;
    let alive = true;
    setRows(null); setErr("");
    (async () => {
      try {
        const { data, error } = await supabaseMarta.rpc("mh_campaign_compliance_report", { p_caller_email: email, p_campaign_id: campaignId });
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) {
        if (alive) { setErr(e.message || "Gagal memuat kepatuhan campaign"); setRows([]); }
      }
    })();
    return () => { alive = false; };
  }, [email, campaignId, campaigns]);

  const campaign = (campaigns || []).find((c) => c.id === campaignId);
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      const key = r.branch_name || "-";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  const totalDone = (rows || []).filter((r) => r.has_plan).length;
  const totalAll = (rows || []).length;

  if (campaigns === null) {
    return <div style={{ padding: "60px 0" }}><ShellSpinner /></div>;
  }
  if (campaigns.length === 0) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
        <Megaphone size={28} color="#C7C8D1" />
        <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: "#8A8A96" }}>Belum ada campaign.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 20px 32px" }}>
      <div style={{ position: "relative" }}>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}
          style={{
            width: "100%", appearance: "none", WebkitAppearance: "none", background: "#FFFFFF", border: "1px solid #E9EAEE",
            borderRadius: 14, padding: "12px 34px 12px 14px", fontSize: 13.5, fontWeight: 800, color: "#17181C",
            fontFamily: FF, cursor: "pointer", boxShadow: "0 1px 4px rgba(23,24,28,0.05)",
          }}>
          {campaigns.map((c) => (
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
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 0.3 }}>Kepatuhan Plan</div>
          </div>
          <div style={{
            marginTop: 8, fontSize: 32, fontWeight: 800, lineHeight: 1,
            background: "linear-gradient(120deg,#FFFFFF 0%,#F7D9E8 55%,#EC1E79 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            {rows === null ? "-" : `${totalDone}/${totalAll}`}
          </div>
          <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>BME/RGE sudah submit plan · {campaign.name}</div>
        </div>
      )}

      {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FFEBEE", color: "#C62828", fontSize: 12.5 }}>{err}</div>}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {rows === null ? (
          <div style={{ padding: "40px 0" }}><ShellSpinner /></div>
        ) : rows.length === 0 && !err ? (
          <div style={{ textAlign: "center", padding: 30, color: "#8A8A96", fontSize: 13 }}>Tidak ada BME/RGE dlm cakupan campaign ini.</div>
        ) : (
          grouped.map(([branch, people]) => (
            <div key={branch} style={{ background: "#FFFFFF", border: "1px solid #EEEFF2", borderRadius: 16, padding: "14px 14px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "#17181C", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>{branch}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {people.map((p) => (
                  <div key={p.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, background: p.has_plan ? "#E8F5E9" : "#F6F7F9" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{p.user_name} <span style={{ color: "#8A8A96", fontWeight: 500 }}>({p.brand === "tri" ? "3ID" : p.brand === "im3" ? "IM3" : p.brand})</span></span>
                    {p.has_plan ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: "#2E7D32" }}><Check size={13} /> Sudah</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#C62828" }}>Belum</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
