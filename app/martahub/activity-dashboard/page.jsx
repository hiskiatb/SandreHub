"use client";
/**
 * /martahub/activity-dashboard - "Activity Dashboard" (CMS desktop web).
 *
 * Versi LIVE dari dua slide deck bulanan yang selama ini dibuat manual
 * ("Activity Plan - Total" & "Activity Report Summary") - tujuannya supaya
 * region/brand tidak perlu lagi bikin deck sendiri tiap bulan, tinggal buka
 * halaman ini & pilih bulan. Semua angka dihitung langsung dari
 * `mh_activities` (SATU sumber, sama persis dgn Beranda mobile & Approval
 * Center) - TIDAK ada data yang di-hardcode kecuali teks "Focus" & tagline
 * di footer (itu murni presentasional, bukan berasal dari data).
 *
 * Definisi angka (didiskusikan & disepakati dgn user sebelum dibangun):
 *  - "Plan"/Target event = SEMUA aktivitas bulan ybs (status apapun).
 *  - "Achieved" event = aktivitas yg sudah `status = 'approved'` (laporan
 *    actual-nya sudah disetujui/final).
 *  - "Ratio" finansial = Cost Actual ÷ Revenue Actual × 100 - SAMA PERSIS
 *    dgn definisi Cost Ratio yg sudah dipakai di Beranda mobile, supaya
 *    angka di CMS & mobile tidak pernah beda utk metrik yg namanya sama.
 *  - "Avg/Event" = rata-rata (SP+FWA unit actual) per event yg sudah achieved.
 *  - "Top Performer Event" = event approved dgn cost_actual>0 yg py rasio
 *    Revenue÷Cost TERTINGGI (disepakati eksplisit dgn user, bukan asumsi).
 *  - Insight box = kalimat template otomatis mengikuti branch dgn jumlah
 *    event tertinggi per brand bulan ybs (auto-generate, bukan diketik
 *    manual - juga sudah disepakati dgn user).
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar, MapPin, Smartphone, Wifi, Target, Trophy, Wallet, TrendingUp,
  PiggyBank, Percent, Zap, Sparkles, Award, Building2, ListChecks,
  Gauge, Banknote,
} from "lucide-react";
import MartaShell, { T, brandLabel } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";

// Warna badge region - konsisten per nama region spy user cepat kenali
// region mana yg sedang dilihat tanpa harus baca teks (dipakai di badge
// scope & di dropdown region).
const REGION_COLOR = {
  "NORTH SUMATERA": "#1565C0",
  "CENTRAL SUMATERA": "#7C3AED",
  "SOUTH SUMATERA": "#0E9F6E",
};
function regionColor(region) { return REGION_COLOR[region] || "#F57C00"; }

// Logo resmi brand - dipakai di kartu Plan/Stat spy langsung kelihatan
// logo asli IM3 & 3ID (bukan sekadar ikon generik), ditaruh di atas badge
// putih supaya kontras & sesuai warna asli logo tetap terjaga.
const BRAND_LOGO = { IM3: "/brand/logo-im3.png", "3ID": "/brand/logo-3id.png" };

const MONTH_NAME = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const COLS = "id,event_name,brand,branch_id,plan_date,status,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,cost_actual,actual_rev_3m";

function monthOptions() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: `${MONTH_NAME[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
function fmtInt(n) { return Number(n || 0).toLocaleString("id-ID"); }
function fmtRp(n) { return `Rp ${fmtInt(n)}`; }

export default function ActivityDashboardPage() {
  return (
    <MartaShell active="activity-dashboard" title="Activity Dashboard" subtitle="Ringkasan plan & report aktivitas bulanan - siap pakai tanpa perlu bikin deck manual.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const months = useMemo(monthOptions, []);
  const [monthKey, setMonthKey] = useState(months[0].key);
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [scope, setScope] = useState(null);
  // Region yg SEDANG ditampilkan - default "" (semua region) sebelum scope
  // diketahui. Begitu scope pengguna termuat & scoped (region tertentu),
  // otomatis dikunci ke region itu (pola SAMA dgn filter Branch/Brand di
  // Beranda mobile: role scoped dapat satu opsi non-interaktif, role
  // unscoped/spm_sumatera/admin bebas pilih region mana saja).
  const [regionFilter, setRegionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);
      // Role scoped (bukan admin/spm_sumatera) TIDAK bisa memilih region
      // lain - langsung dikunci ke region miliknya sendiri, sama seperti
      // field Branch/Brand yg non-interaktif di Beranda mobile utk role
      // scoped.
      if (sc && !sc.unscoped && sc.found && sc.region) {
        setRegionFilter((prev) => prev || sc.region);
      }

      const { data: bData } = await supabaseMarta.from("mh_branches").select("id, name, region");
      setBranches(bData || []);

      const start = `${monthKey}-01`;
      const [y, m] = monthKey.split("-").map(Number);
      const end = new Date(y, m, 1).toISOString().slice(0, 10);
      let q = supabaseMarta.from("mh_activities").select(COLS).gte("plan_date", start).lt("plan_date", end);
      q = await applyMartaScope(q, sc);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      // Region dipilih manual di sini (regionFilter) DILUAR scope profil -
      // applyMartaScope hanya tahu region MILIK pengguna sendiri, jadi
      // filter tambahan ini yg menangani pilihan region admin/spm_sumatera
      // di dropdown atas. Difilter via branch_id (bukan ulang query ke DB)
      // krn daftar branch per-region sudah ada di `bData`.
      const activeRegion = (sc && !sc.unscoped && sc.found && sc.region) ? sc.region : regionFilter;
      const allowedBranchIds = activeRegion ? new Set((bData || []).filter((b) => b.region === activeRegion).map((b) => b.id)) : null;
      setRows(allowedBranchIds ? (data || []).filter((r) => allowedBranchIds.has(r.branch_id)) : (data || []));
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email, monthKey, regionFilter]);
  useEffect(() => { load(); }, [load]);

  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const regions = useMemo(() => [...new Set(branches.map((b) => b.region).filter(Boolean))].sort(), [branches]);
  const isRegionLocked = !!(scope && !scope.unscoped && scope.found && scope.region);
  const effectiveRegion = isRegionLocked ? scope.region : regionFilter;

  // Branch yg ditampilkan = SEMUA master branch di region terpilih (bukan
  // cuma yg kebetulan punya baris aktivitas bulan ini) - kalau derivasinya
  // dari `rows`, branch yg brand-nya belum pernah diassign/belum ada event
  // sama sekali bulan ini akan hilang total dari chart & tabel, padahal
  // seharusnya tetap tampil dgn angka 0 spy jelas kelihatan "belum ada
  // aktivitas" alih2 seolah branch itu tidak ada. Urut alfabetis spy tata
  // letak deterministik, sama spt urutan branch di slide referensi.
  const branchIds = useMemo(() => {
    const pool = effectiveRegion ? branches.filter((b) => b.region === effectiveRegion) : branches;
    return pool.map((b) => b.id).sort((a, b) => (branchMap.get(a) || "").localeCompare(branchMap.get(b) || ""));
  }, [branches, effectiveRegion, branchMap]);

  const monthLabel = months.find((m) => m.key === monthKey)?.label || monthKey;

  // ── Section 1: Plan (event count per branch per brand, status apapun) ──
  const planByBrand = useMemo(() => {
    const out = { im3: new Map(), tri: new Map() };
    for (const r of rows) {
      const b = (r.brand || "").toLowerCase();
      if (b !== "im3" && b !== "tri") continue;
      out[b].set(r.branch_id, (out[b].get(r.branch_id) || 0) + 1);
    }
    return out;
  }, [rows]);
  const im3Plan = rows.filter((r) => (r.brand || "").toLowerCase() === "im3").length;
  const triPlan = rows.filter((r) => (r.brand || "").toLowerCase() === "tri").length;
  const totalPlan = rows.length;

  const topBranch = (map) => {
    let best = null;
    for (const [id, n] of map.entries()) if (!best || n > best.n) best = { id, n };
    return best ? { name: branchMap.get(best.id) || "-", n: best.n } : null;
  };
  const im3Top = topBranch(planByBrand.im3);
  const triTop = topBranch(planByBrand.tri);

  // ── Section 2: Achievement (status='approved') + finansial ──
  const approvedRows = useMemo(() => rows.filter((r) => r.status === "approved"), [rows]);
  const achievedByBrand = useMemo(() => {
    const out = { im3: new Map(), tri: new Map() };
    for (const r of approvedRows) {
      const b = (r.brand || "").toLowerCase();
      if (b !== "im3" && b !== "tri") continue;
      out[b].set(r.branch_id, (out[b].get(r.branch_id) || 0) + 1);
    }
    return out;
  }, [approvedRows]);
  const totalAchieved = approvedRows.length;
  const achievementPct = totalPlan > 0 ? Math.round((totalAchieved / totalPlan) * 100) : 0;

  const totalCost = approvedRows.reduce((s, r) => s + (r.cost_actual || 0), 0);
  const totalSp = approvedRows.reduce((s, r) => s + (r.actual_sp || 0), 0);
  const totalFwa = approvedRows.reduce((s, r) => s + (r.actual_fwa || 0), 0);
  const totalRebuy = approvedRows.reduce((s, r) => s + (r.actual_rebuy_pulsa || 0) + (r.actual_rebuy_data || 0), 0);
  const totalRev = approvedRows.reduce((s, r) => s + (r.actual_rev_3m || 0), 0);
  const costRatioPct = totalRev > 0 ? Math.round((totalCost / totalRev) * 100) : null;
  const avgPerEvent = totalAchieved > 0 ? Math.round((totalSp + totalFwa) / totalAchieved) : 0;

  const topPerformer = useMemo(() => {
    let best = null;
    for (const r of approvedRows) {
      if (!r.cost_actual || r.cost_actual <= 0) continue;
      const conv = (r.actual_rev_3m || 0) / r.cost_actual;
      if (!best || conv > best.conv) best = { r, conv };
    }
    if (!best) return null;
    return {
      name: best.r.event_name || "-",
      branch: branchMap.get(best.r.branch_id) || "-",
      revenue: best.r.actual_rev_3m || 0,
      costRatio: best.r.cost_actual > 0 ? Math.round(((best.r.cost_actual || 0) / (best.r.actual_rev_3m || 1)) * 100) : null,
    };
  }, [approvedRows, branchMap]);

  const rc = regionColor(effectiveRegion);

  return (
    <div>
      <style>{`
        .mh-ad-card { transition: box-shadow .18s ease, transform .18s ease; }
        .mh-ad-card:hover { box-shadow: 0 8px 24px rgba(16,24,40,0.08), 0 2px 6px rgba(16,24,40,0.05); transform: translateY(-2px); }
        .mh-ad-tile:hover { transform: translateY(-2px) scale(1.015); box-shadow: 0 6px 16px rgba(16,24,40,0.10); }
        .mh-ad-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .mh-ad-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .mh-ad-pill select { border: none; background: transparent; outline: none; font-weight: 700; font-size: 12.5px; color: ${T.hi}; }
        .mh-ad-grid-2 { display: grid; grid-template-columns: minmax(260px, 320px) 1fr; gap: 16px; }
        .mh-ad-grid-fin { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
        .mh-ad-plan-grid { display: grid; grid-template-columns: 1fr 260px; gap: 16px; }
        .mh-ad-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
        .mh-ad-fintiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
        .mh-ad-hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
        .mh-ad-skel { position: relative; overflow: hidden; background: #EEF1F6; }
        .mh-ad-skel::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent); animation: mh-shimmer 1.3s infinite; }
        @keyframes mh-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
        @media (prefers-reduced-motion: reduce) { .mh-ad-skel::after { animation: none; } }
        @media (max-width: 860px) {
          .mh-ad-grid-2, .mh-ad-grid-fin, .mh-ad-plan-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      <div className="mh-ad-toolbar" style={{ ...card, marginBottom: 18, background: `linear-gradient(120deg, ${rc}10, ${T.card} 55%)`, borderColor: `${rc}33` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: `linear-gradient(135deg, ${rc}, ${rc}99)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <MapPin size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: T.hi, lineHeight: 1.25 }}>
              {effectiveRegion || "Seluruh Region"}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.lo }}>
              {scope && !scope.unscoped && scope.found ? `Scope · ${brandLabel(scope.brand)}` : "Overview semua region"}
            </div>
          </div>
        </div>
        <div className="mh-ad-controls">
          <div className="mh-ad-pill" style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px 0 10px", borderRadius: 10, border: `1px solid ${T.line}`, background: isRegionLocked ? T.hover : T.card, opacity: isRegionLocked ? 0.8 : 1 }}>
            <Building2 size={15} color={rc} />
            <select value={effectiveRegion || ""} disabled={isRegionLocked}
              onChange={(e) => setRegionFilter(e.target.value)}
              style={{ cursor: isRegionLocked ? "not-allowed" : "pointer" }}>
              {!isRegionLocked && <option value="">Semua Region</option>}
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="mh-ad-pill" style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px 0 10px", borderRadius: 10, border: `1px solid ${T.line}`, background: T.card }}>
            <Calendar size={15} color={T.primary} />
            <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)} style={{ cursor: "pointer" }}>
              {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mh-ad-hero" style={{ marginBottom: 28 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="mh-ad-skel" style={{ ...card, height: 96 }} />
          ))}
        </div>
      ) : (
        <div className="mh-ad-hero" style={{ marginBottom: 28 }}>
          <HeroKpi icon={Gauge} label="Achievement" value={`${achievementPct}%`} sub={`${fmtInt(totalAchieved)} dari ${fmtInt(totalPlan)} event`} color={achievementPct >= 90 ? T.blue : achievementPct >= 60 ? "#F57C00" : T.error} />
          <HeroKpi icon={ListChecks} label="Total Plan" value={fmtInt(totalPlan)} sub={`IM3 ${fmtInt(im3Plan)} · 3ID ${fmtInt(triPlan)}`} color={T.hi} />
          <HeroKpi icon={Banknote} label="Total Revenue" value={fmtRp(totalRev)} sub={`Avg ${fmtInt(avgPerEvent)} unit/event`} color="#1565C0" />
          <HeroKpi icon={Percent} label="Cost Ratio" value={costRatioPct != null ? `${costRatioPct}%` : "-"} sub={`Total Cost ${fmtRp(totalCost)}`} color="#7C3AED" />
        </div>
      )}

      {/* ═══════════ SECTION 1 - ACTIVITY PLAN SUMMARY ═══════════ */}
      <SectionHeading label="Activity Plan Summary" desc={`Jumlah event yg diplan per branch & brand - ${monthLabel}.`} />

      <BrandPlanCard title="IM3" accent="#F57C00" total={im3Plan}
        byBranch={branchIds.map((id) => ({ id, name: branchMap.get(id) || "-", n: planByBrand.im3.get(id) || 0 }))}
        insight={im3Top ? `${im3Top.name} menjadi kontributor tertinggi untuk aktivitas IM3 di ${monthLabel} (${im3Top.n} event).` : "Belum ada data event IM3 bulan ini."} />

      <div style={{ height: 16 }} />

      <BrandPlanCard title="3ID" accent="#C6168D" total={triPlan}
        byBranch={branchIds.map((id) => ({ id, name: branchMap.get(id) || "-", n: planByBrand.tri.get(id) || 0 }))}
        insight={triTop ? `${triTop.name} memimpin aktivitas 3ID dengan jumlah event tertinggi di ${monthLabel} (${triTop.n} event).` : "Belum ada data event 3ID bulan ini."} />

      <div style={{ height: 20 }} />

      <div className="mh-ad-card" style={{ ...card, display: "grid", gridTemplateColumns: "minmax(300px,1.1fr) minmax(220px,1fr)", gap: 22, alignItems: "center" }}>
        <div className="mh-ad-stats">
          <StatChip icon={ListChecks} label="Total Plan" value={fmtInt(totalPlan)} sub="Both Brand · Event" color={T.hi} />
          <StatChip logo={BRAND_LOGO.IM3} label="IM3 Plan" value={fmtInt(im3Plan)} sub="Event" color="#F57C00" />
          <StatChip logo={BRAND_LOGO["3ID"]} label="3ID Plan" value={fmtInt(triPlan)} sub="Event" color="#C6168D" />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", color: T.lo, textTransform: "uppercase", marginBottom: 8 }}>
            <Sparkles size={13} color="#F57C00" /> Focus Bulan Ini
          </div>
          {["Meningkatkan penetrasi aktivitas di semua branch", "Mencapai target event sesuai rencana", "Eksekusi konsisten & kolaborasi optimal"].map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: T.mid, marginBottom: 4 }}>
              <span style={{ color: T.success, fontWeight: 800 }}>✓</span> {t}
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="mh-ad-card" style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "linear-gradient(90deg,#F7F9FC,#EFF3FA)", color: T.mid, textAlign: "left" }}>
              {["Branch", "IM3 Event", "3ID Event", "Total Event"].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {branchIds.length === 0 && <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: T.lo }}>Belum ada data.</td></tr>}
              {branchIds.map((id, i) => {
                const im3n = planByBrand.im3.get(id) || 0, trin = planByBrand.tri.get(id) || 0;
                return (
                  <tr key={id} style={{ borderTop: `1px solid ${T.line}`, background: i % 2 === 1 ? "#FBFCFE" : "transparent" }}>
                    <td style={{ padding: "9px 14px", fontWeight: 700 }}>{branchMap.get(id) || "-"}</td>
                    <td style={{ padding: "9px 14px", color: "#F57C00", fontWeight: 700 }}>{im3n}</td>
                    <td style={{ padding: "9px 14px", color: "#C6168D", fontWeight: 700 }}>{trin}</td>
                    <td style={{ padding: "9px 14px", fontWeight: 800 }}>{im3n + trin}</td>
                  </tr>
                );
              })}
              {branchIds.length > 0 && (
                <tr style={{ borderTop: `2px solid ${T.line}`, background: "#F7F9FC" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 800 }}>TOTAL</td>
                  <td style={{ padding: "9px 14px", fontWeight: 800, color: "#F57C00" }}>{im3Plan}</td>
                  <td style={{ padding: "9px 14px", fontWeight: 800, color: "#C6168D" }}>{triPlan}</td>
                  <td style={{ padding: "9px 14px", fontWeight: 800 }}>{totalPlan}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ height: 40 }} />

      {/* ═══════════ SECTION 2 - ACTIVITY REPORT SUMMARY ═══════════ */}
      <SectionHeading label="Activity Report Summary" desc={`Pencapaian actual vs plan & ringkasan finansial - ${monthLabel}.`} />

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: T.lo, textTransform: "uppercase" }}>Event Achievement vs Plan</div>
          <AchievementDonut pct={achievementPct} />
          <div style={{ fontSize: 12.5, color: T.mid, textAlign: "center" }}>
            Total Activity actual <b style={{ color: T.hi }}>{fmtInt(totalAchieved)}</b> dari <b style={{ color: T.hi }}>{fmtInt(totalPlan)}</b> total plan
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: T.lo, textTransform: "uppercase", marginBottom: 12 }}>Event Achievement per Branch</div>
          <TargetAchievedRow title={`IM3 (${im3Plan} Event)`} accent="#F57C00"
            rows={branchIds.map((id) => ({ name: branchMap.get(id) || "-", target: planByBrand.im3.get(id) || 0, achieved: achievedByBrand.im3.get(id) || 0 }))} />
          <div style={{ height: 14 }} />
          <TargetAchievedRow title={`3ID (${triPlan} Event)`} accent="#C6168D"
            rows={branchIds.map((id) => ({ name: branchMap.get(id) || "-", target: planByBrand.tri.get(id) || 0, achieved: achievedByBrand.tri.get(id) || 0 }))} />
        </div>
      </div>

      <div className="mh-ad-grid-fin">
        <div className="mh-ad-card" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: T.lo, textTransform: "uppercase", marginBottom: 12 }}>
            <Wallet size={13} color={T.primary} /> Financial Summary
          </div>
          <div className="mh-ad-fintiles">
            <FinTile icon={Wallet} label="Total Cost" value={fmtRp(totalCost)} color={T.blue} />
            <FinTile icon={Smartphone} label="SP" value={fmtInt(totalSp)} color="#F57C00" />
            <FinTile icon={Wifi} label="FWA" value={fmtInt(totalFwa)} color="#C6168D" />
            <FinTile icon={PiggyBank} label="Rebuy" value={fmtRp(totalRebuy)} color={T.success} />
            <FinTile icon={TrendingUp} label="Total Rev" value={fmtRp(totalRev)} color="#1565C0" />
            <FinTile icon={Percent} label="Ratio" value={costRatioPct != null ? `${costRatioPct}%` : "-"} color="#7C3AED" />
            <FinTile icon={Zap} label="Avg / Event" value={fmtInt(avgPerEvent)} color="#F57C00" />
          </div>
        </div>

        <div className="mh-ad-card" style={{ ...card, background: "linear-gradient(150deg,#FFF8E8,#FFFFFF 60%)", borderColor: "#F0D48A", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: "#B7791F", textTransform: "uppercase", marginBottom: 12, position: "relative" }}>
            <Trophy size={14} color="#D4A017" /> Top Performer Event
          </div>
          {topPerformer ? (
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 10.5, color: T.lo, marginBottom: 4 }}>Rasio Revenue ÷ Cost tertinggi</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.hi }}>{topPerformer.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.mid, marginBottom: 10 }}>
                <MapPin size={11} color={T.lo} /> {topPerformer.branch}
              </div>
              <div style={{ display: "flex", gap: 18 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.lo, fontWeight: 700, textTransform: "uppercase" }}>Revenue</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.success }}>{fmtRp(topPerformer.revenue)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.lo, fontWeight: 700, textTransform: "uppercase" }}>Cost Ratio</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#7C3AED" }}>{topPerformer.costRatio != null ? `${topPerformer.costRatio}%` : "-"}</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: T.lo, fontSize: 12.5, padding: "10px 0", position: "relative" }}>Belum ada event approved dgn cost &amp; revenue tercatat bulan ini.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Kartu KPI besar di paling atas halaman - ringkasan sekilas sebelum
 * masuk ke detail per-section, spy user langsung dapat gambaran umum. */
function HeroKpi({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="mh-ad-card" style={{ ...card, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 10, borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", color: T.lo, textTransform: "uppercase" }}>{label}</div>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${color}, ${color}AA)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {Icon && <Icon size={16} color="#fff" />}
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: T.hi, lineHeight: 1.1, position: "relative" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: T.mid, position: "relative" }}>{sub}</div>
    </div>
  );
}

/** Badge bulat/rounded putih berisi logo resmi brand (IM3/3ID) - dipakai
 * di header kartu Plan & stat chip spy identitas brand langsung dikenali
 * dari logo asli, bukan ikon generik. Latar putih + ring warna aksen brand
 * supaya logo (yg sebagian besar hitam/merah) tetap kontras & konsisten
 * dgn tema kartu di sekitarnya. */
function BrandLogoBadge({ src, alt, accent, size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: "#fff", border: `1.5px solid ${accent}40`, display: "flex", alignItems: "center", justifyContent: "center", padding: Math.round(size * 0.14), flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  );
}

function SectionHeading({ label, desc }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px" }}>
      <div style={{ width: 4, height: 20, borderRadius: 99, background: "linear-gradient(180deg,#ED1C24,#C6168D)", flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.hi, lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: T.lo, marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );
}

function TotalStat({ label, value, sub, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: T.lo, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: T.lo }}>{sub}</div>
    </div>
  );
}

/** Stat card ber-icon (badge bulat gradient) - dipakai di strip Total Plan. */
function StatChip({ icon: Icon, logo, label, value, sub, color }) {
  return (
    <div className="mh-ad-tile" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: `${color}0D`, border: `1px solid ${color}26`, transition: "transform .18s ease, box-shadow .18s ease" }}>
      {logo ? (
        <BrandLogoBadge src={logo} alt={label} accent={color} size={40} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: `linear-gradient(135deg, ${color}, ${color}AA)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icon && <Icon size={18} color="#fff" />}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em", color: T.lo, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.hi, lineHeight: 1.15 }}>{value}</div>
        <div style={{ fontSize: 10, color: T.lo }}>{sub}</div>
      </div>
    </div>
  );
}

/** Kartu satu brand di Section 1 - bar chart per-branch (kiri) + insight
 * box (kanan), pola grid 2 kolom persis referensi deck. */
function BrandPlanCard({ title, accent, total, byBranch, insight }) {
  const max = Math.max(1, ...byBranch.map((b) => b.n));
  return (
    <div className="mh-ad-plan-grid">
      <div className="mh-ad-card" style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <BrandLogoBadge src={BRAND_LOGO[title]} alt={title} accent={accent} size={44} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: accent }}>{title}</div>
            <div style={{ fontSize: 10.5, color: T.lo, fontWeight: 700 }}>{total} EVENT</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 130, overflowX: "auto" }}>
          {byBranch.length === 0 && <div style={{ color: T.lo, fontSize: 12.5 }}>Belum ada data.</div>}
          {byBranch.map((b) => (
            <div key={b.id} style={{ flex: "0 0 auto", minWidth: 56, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.hi }}>{b.n}</div>
              <div style={{ width: 30, height: `${Math.max(4, (b.n / max) * 88)}px`, background: `linear-gradient(180deg, ${accent}, ${accent}99)`, borderRadius: "6px 6px 2px 2px" }} />
              <div style={{ fontSize: 10, color: T.lo, fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>{b.name}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mh-ad-card" style={{ ...card, borderColor: `${accent}55`, background: `linear-gradient(160deg, ${accent}14, ${accent}05)`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.03em" }}>
          <Sparkles size={13} color={accent} /> Insight
        </div>
        <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.5 }}>{insight}</div>
      </div>
    </div>
  );
}

/** Donut achievement - SVG murni (stroke-dasharray), tanpa dependency
 * chart library, konsisten dgn pendekatan bar chart custom di halaman lain. */
function AchievementDonut({ pct }) {
  const r = 60, c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, pct)) / 100 * c;
  const color = pct >= 90 ? T.blue : pct >= 60 ? "#F57C00" : T.error;
  return (
    <div style={{ position: "relative", width: 150, height: 150 }}>
      <svg width={150} height={150} viewBox="0 0 150 150">
        <circle cx="75" cy="75" r={r} fill="none" stroke="#EEF2F9" strokeWidth={16} />
        <circle cx="75" cy="75" r={r} fill="none" stroke={color} strokeWidth={16}
          strokeDasharray={`${filled} ${c - filled}`} strokeLinecap="round"
          transform="rotate(-90 75 75)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: T.hi }}>{pct}%</div>
        <div style={{ fontSize: 10, color: T.lo, fontWeight: 700 }}>Achievement</div>
      </div>
    </div>
  );
}

/** Baris paired-bar Target vs Achieved per branch, satu brand - dipakai 2x
 * (IM3 & 3ID) di kartu "Event Achievement per Branch". */
function TargetAchievedRow({ title, accent, rows }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.target, r.achieved]));
  return (
    <div>
      <div style={{ display: "inline-block", fontSize: 10.5, fontWeight: 800, color: accent, background: `${accent}18`, borderRadius: 999, padding: "3px 10px", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, overflowX: "auto", paddingBottom: 2 }}>
        {rows.map((r) => (
          <div key={r.name} style={{ flex: "0 0 auto", minWidth: 64, textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, height: 70 }}>
              <Bar h={(r.target / max) * 60} color="#90A4C4" label={r.target} />
              <Bar h={(r.achieved / max) * 60} color={accent} label={r.achieved} />
            </div>
            <div style={{ fontSize: 9.5, color: T.lo, fontWeight: 600, marginTop: 4, lineHeight: 1.2 }}>{r.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Bar({ h, color, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
      <div style={{ fontSize: 9, fontWeight: 800, color, marginBottom: 2 }}>{label}</div>
      <div style={{ width: 14, height: `${Math.max(3, h)}px`, background: color, borderRadius: "3px 3px 1px 1px" }} />
    </div>
  );
}

function FinTile({ icon: Icon, label, value, color }) {
  return (
    <div className="mh-ad-tile" style={{ background: `${color}0D`, border: `1px solid ${color}26`, borderRadius: 12, padding: "10px 11px", transition: "transform .18s ease, box-shadow .18s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.03em", color: T.lo, textTransform: "uppercase" }}>
        {Icon && <Icon size={11} color={color} />} {label}
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color, marginTop: 4, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
