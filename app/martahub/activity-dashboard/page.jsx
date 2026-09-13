"use client";
/**
 * /martahub/activity-dashboard - "Activity Dashboard" (CMS desktop web).
 *
 * REDESIGN (this round): sebelumnya halaman ini berupa deretan card gaya
 * "app CMS" biasa. Sekarang kartu utamanya (`ReportPoster`) dibangun 1:1
 * meniru layout deck referensi bulanan tim ("Activity Report Summary" -
 * banner merah/navy diagonal, donut Achievement, paired-bar Target vs
 * Achieved per branch, Financial Summary strip, Top Performer trophy,
 * 3 insight footer) di dalam SATU kartu berukuran tetap (ukuran "slide"
 * 16:9) - supaya (a) hasilnya betul2 identik dgn deck yg selama ini
 * dibuat manual, (b) siap di-screenshot/export sbg gambar tunggal tanpa
 * terpotong scroll. Tombol "Export sebagai Gambar" (html2canvas) merender
 * poster ini jadi PNG yg langsung bisa diunduh/dibagikan - menggantikan
 * kebiasaan bikin deck manual tiap bulan sepenuhnya.
 *
 * Semua angka TETAP dihitung langsung dari `mh_activities` (SATU sumber,
 * sama persis dgn Beranda mobile & Approval Center) - definisi angka
 * (Plan/Achieved/Ratio/Avg per Event/Top Performer/Insight) tidak berubah
 * dari versi sebelumnya, cuma tampilannya yg dirombak total. Poster ini
 * dibuat RESPONSIVE lewat CSS `transform: scale()` yg menyesuaikan lebar
 * kontainer (poster punya lebar "native" 1400px, discale utuh spy proporsi
 * & posisi elemen tidak pernah berubah/pecah di layar sempit) - jadi tidak
 * ada lagi chart yg kepotong/berantakan di layar kecil.
 */
import { useState, useEffect, useCallback, useMemo, useRef, forwardRef } from "react";
import {
  Calendar, MapPin, Building2, Download, Loader2, TrendingUp, BarChart3,
  Trophy, Wallet, Target, Users, Sparkles, CardSim, Router as RouterIcon,
  Banknote, RefreshCw, Percent,
} from "lucide-react";
import MartaShell, { T, brandLabel } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";
import { unsnake } from "../m/_shared/planData";

// Warna badge region - konsisten per nama region spy user cepat kenali
// region mana yg sedang dilihat tanpa harus baca teks (dipakai di badge
// scope & di dropdown region).
const REGION_COLOR = {
  "NORTH SUMATERA": "#1565C0",
  "CENTRAL SUMATERA": "#7C3AED",
  "SOUTH SUMATERA": "#0E9F6E",
};
function regionColor(region) { return REGION_COLOR[region] || "#F57C00"; }
// Warna brand resmi dipakai KONSISTEN di semua elemen brand-specific di
// poster (donut distribusi brand, bar chart per-branch, financial summary
// per-brand) - IM3 = kuning/gold, 3ID (Tri) = magenta.
const BRAND_COLOR = { im3: "#F2B705", tri: "#D6249F" };
function regionShort(region) {
  if (region === "NORTH SUMATERA") return "North Sumatra";
  if (region === "CENTRAL SUMATERA") return "Central Sumatra";
  if (region === "SOUTH SUMATERA") return "South Sumatra";
  return region || "";
}
// Judul header poster - beda kalimat utk region spesifik ("NORTH SUMATRA
// REGION") vs saat user SENGAJA memilih "Semua Region" ("SEMUA REGION
// SUMATERA") - supaya kata "REGION" tidak pernah dobel/rancu.
function regionHeaderLabel(region) {
  const short = regionShort(region);
  return short ? `${short.toUpperCase()} REGION` : "SEMUA REGION SUMATERA";
}

// Logo resmi brand.
const BRAND_LOGO = { IM3: "/brand/logo-im3.png", "3ID": "/brand/logo-3id.png" };

const MONTH_NAME = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_NAME_UP = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
const COLS = "id,event_name,brand,branch_id,plan_date,status,actual_sp,actual_fwa,actual_rebuy_sp,actual_rebuy_fwa,cost_actual,actual_rev_3m,poi_type,event_category,event_categories";

function monthOptions() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: `${MONTH_NAME[d.getMonth()]} ${d.getFullYear()}`, m: d.getMonth(), y: d.getFullYear() });
  }
  return out;
}
function fmtInt(n) { return Number(n || 0).toLocaleString("id-ID"); }
function fmtRp(n) { return Number(n || 0).toLocaleString("id-ID"); }

export default function ActivityDashboardPage() {
  return (
    <MartaShell active="activity-dashboard" title="Activity Dashboard" subtitle="Ringkasan plan & report aktivitas bulanan - siap diekspor sebagai gambar, tanpa perlu bikin deck manual.">
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
  const [regionFilter, setRegionFilter] = useState("");
  const hasPickedRegion = useRef(false);
  // Kunci grouping utk card "Event Achievement per Branch" - Branch (default),
  // POI, atau Kategori Event. Ini murni state tampilan (toggle iOS-style di
  // toolbar), TIDAK ikut ke dalam poster yg diexport sbg gambar sebagai
  // kontrol interaktif - cuma hasil chart-nya yg berubah.
  const [groupBy, setGroupBy] = useState("branch");
  // Mode dataset utk 3 donut chart distribusi (Card #5) - Plan (semua
  // activity apapun statusnya) atau Actual (status completed saja),
  // terpisah dari toggle groupBy di atas krn donut ini SELALU tampil 3
  // sekaligus (POI / Kategori Event / Brand), bukan salah satu spt chart
  // per-branch.
  const [distMode, setDistMode] = useState("actual");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);
  const posterRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);

      const { data: bData } = await supabaseMarta.from("mh_branches").select("id, name, region");
      setBranches(bData || []);

      // Region yg AKTIF dipakai bulan ini - TIDAK PERNAH dibiarkan "semua
      // region sekaligus" (dulu bikin chart per-branch penuh sesak, isinya
      // puluhan branch dari 3 region berbeda jadi "0 0" semua). Role
      // scoped (bukan admin/spm_sumatera) dikunci ke region miliknya
      // sendiri seperti biasa; role unscoped (admin/spm_sumatera) atau
      // yg belum pernah memilih apa2 otomatis dikunci ke region PERTAMA
      // (alfabetis) begitu daftar branch termuat, BUKAN dibiarkan kosong/
      // "Semua Region" - opsi "Semua Region" tetap ada di dropdown kalau
      // user memang sengaja ingin melihat gabungan semua region.
      const lockedRegion = (sc && !sc.unscoped && sc.found && sc.region) ? sc.region : null;
      let activeRegion = lockedRegion || regionFilter;
      if (!activeRegion && !hasPickedRegion.current) {
        const avail = [...new Set((bData || []).map((b) => b.region).filter(Boolean))].sort();
        // Preferensi default: North Sumatera dulu (region "utama" tim ini),
        // baru fallback ke region pertama yg tersedia kalau North Sumatera
        // ternyata tidak ada datanya sama sekali.
        activeRegion = avail.includes("NORTH SUMATERA") ? "NORTH SUMATERA" : (avail[0] || "");
        if (activeRegion) setRegionFilter(activeRegion);
      }

      const start = `${monthKey}-01`;
      const [y, m] = monthKey.split("-").map(Number);
      const end = new Date(y, m, 1).toISOString().slice(0, 10);
      let q = supabaseMarta.from("mh_activities").select(COLS).gte("plan_date", start).lt("plan_date", end);
      q = await applyMartaScope(q, sc);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
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

  const branchIds = useMemo(() => {
    const pool = effectiveRegion ? branches.filter((b) => b.region === effectiveRegion) : branches;
    return pool.map((b) => b.id).sort((a, b) => (branchMap.get(a) || "").localeCompare(branchMap.get(b) || ""));
  }, [branches, effectiveRegion, branchMap]);

  const monthEntry = months.find((mm) => mm.key === monthKey);
  const monthLabel = monthEntry?.label || monthKey;
  const monthLabelUp = monthEntry ? `${MONTH_NAME_UP[monthEntry.m]} ${monthEntry.y}` : monthKey.toUpperCase();

  // ── Plan (event count per branch per brand, status apapun) ──
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

  // ── Achievement (status='completed') + finansial ──
  const completedRows = useMemo(() => rows.filter((r) => r.status === "completed"), [rows]);
  const totalAchieved = completedRows.length;
  const achievementPct = totalPlan > 0 ? Math.round((totalAchieved / totalPlan) * 100) : 0;
  const gap = Math.max(0, totalPlan - totalAchieved);

  const totalCost = completedRows.reduce((s, r) => s + (r.cost_actual || 0), 0);
  const totalSp = completedRows.reduce((s, r) => s + (r.actual_sp || 0), 0);
  const totalFwa = completedRows.reduce((s, r) => s + (r.actual_fwa || 0), 0);
  const totalRebuy = completedRows.reduce((s, r) => s + (r.actual_rebuy_sp || 0) + (r.actual_rebuy_fwa || 0), 0);
  const totalRev = completedRows.reduce((s, r) => s + (r.actual_rev_3m || 0), 0);
  const costRatioPct = totalRev > 0 ? Math.round((totalCost / totalRev) * 100) : null;
  const avgPerEvent = totalAchieved > 0 ? Math.round((totalSp + totalFwa) / totalAchieved) : 0;

  // "Achieved %" per event dipakai sbg proxy SP achieved terhadap target-nya
  // sendiri (data tidak punya target SP terpisah, jadi persentase memakai
  // proporsi SP/FWA/Rebuy terhadap totalnya sendiri - sama seperti "89%",
  // "61%", "50%" di deck referensi, yg juga rasio komponen finansial itu
  // sendiri, bukan target eksternal).
  const spPct = totalSp + totalFwa > 0 ? Math.round((totalSp / (totalSp + totalFwa)) * 100) : 0;

  // ── Financial Summary per-brand (IM3 vs 3ID) - dipakai Card #3 supaya
  // angka finansial dipecah per kategori/brand, bukan cuma 1 baris gabungan.
  const finByBrand = useMemo(() => {
    const mk = (brandKey) => {
      const rs = completedRows.filter((r) => (r.brand || "").toLowerCase() === brandKey);
      const cost = rs.reduce((s, r) => s + (r.cost_actual || 0), 0);
      const sp = rs.reduce((s, r) => s + (r.actual_sp || 0), 0);
      const fwa = rs.reduce((s, r) => s + (r.actual_fwa || 0), 0);
      const rebuy = rs.reduce((s, r) => s + (r.actual_rebuy_sp || 0) + (r.actual_rebuy_fwa || 0), 0);
      const rev = rs.reduce((s, r) => s + (r.actual_rev_3m || 0), 0);
      const ratio = rev > 0 ? Math.round((cost / rev) * 100) : null;
      return { cost, sp, fwa, rebuy, rev, ratio };
    };
    return { im3: mk("im3"), tri: mk("tri") };
  }, [completedRows]);

  const topPerformer = useMemo(() => {
    let best = null;
    for (const r of completedRows) {
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
  }, [completedRows, branchMap]);

  // Kunci grouping utk chart "Event Achievement per Branch": defaultnya
  // per Branch (spt sebelumnya), tapi bisa dialihkan ke per POI atau per
  // Kategori Event lewat toggle segmented (iOS-style) di toolbar - baik
  // utk hitungan Plan (target) MAUPUN Actual (achieved), dua2nya ikut
  // kunci yg sama supaya perbandingan target-vs-achieved tetap apple-to-
  // apple (mis. "berapa target vs actual utk kategori Direct Selling").
  function groupKeyOf(r) {
    if (groupBy === "poi") return r.poi_type || "__lainnya";
    if (groupBy === "category") {
      const arr = Array.isArray(r.event_categories) && r.event_categories.length ? r.event_categories : (r.event_category ? [r.event_category] : []);
      return arr[0] || "__lainnya";
    }
    return r.branch_id;
  }
  function groupLabelOf(key) {
    if (groupBy === "branch") return branchMap.get(key) || "-";
    return key === "__lainnya" ? "Lainnya" : unsnake(key);
  }
  const groupedRows = useMemo(() => {
    const build = (brandKey) => {
      const planMap = new Map();
      const achievedMap = new Map();
      for (const r of rows) {
        if ((r.brand || "").toLowerCase() !== brandKey) continue;
        const k = groupKeyOf(r);
        planMap.set(k, (planMap.get(k) || 0) + 1);
      }
      for (const r of completedRows) {
        if ((r.brand || "").toLowerCase() !== brandKey) continue;
        const k = groupKeyOf(r);
        achievedMap.set(k, (achievedMap.get(k) || 0) + 1);
      }
      // Utk POI/Kategori Event, batasi ke 8 kelompok teratas (diurutkan
      // dari plan terbanyak) - beda dgn Branch yg jumlahnya sudah pasti
      // wajar (per region), jumlah POI/kategori mentah bisa sangat banyak
      // & bikin chart penuh sesak/tidak rapi kalau ditampilkan semua.
      const keys = groupBy === "branch"
        ? branchIds
        : [...new Set([...planMap.keys(), ...achievedMap.keys()])]
            .sort((a, b) => (planMap.get(b) || 0) - (planMap.get(a) || 0))
            .slice(0, 8);
      return keys.map((k) => ({ id: k, name: groupLabelOf(k), target: planMap.get(k) || 0, achieved: achievedMap.get(k) || 0 }));
    };
    return { im3: build("im3"), tri: build("tri") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, completedRows, groupBy, branchIds, branchMap]);
  const im3Rows = groupedRows.im3;
  const triRows = groupedRows.tri;

  // ── Distribusi POI / Kategori Event / Brand (Card #5, 3 donut) ──
  // Palet warna generik dipakai bergiliran utk POI & Kategori (jumlah
  // kelompok bervariasi & datanya bebas/dinamis); Brand pakai warna resmi
  // IM3 (merah) / 3ID (magenta) spy konsisten dgn elemen lain di poster.
  const DIST_PALETTE = ["#1565C0", "#F5A623", "#2E7D32", "#7C3AED", "#0E9F6E", "#E23B86"];
  const distDataset = distMode === "plan" ? rows : completedRows;
  function buildDist(dataset, keyFn, labelFn) {
    const map = new Map();
    for (const r of dataset) {
      const k = keyFn(r);
      map.set(k, (map.get(k) || 0) + 1);
    }
    const total = dataset.length || 1;
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 5);
    const restSum = entries.slice(5).reduce((s, [, v]) => s + v, 0);
    const list = top.map(([k, v], i) => ({
      key: k, label: labelFn(k), value: v,
      pct: Math.round((v / total) * 100), color: DIST_PALETTE[i % DIST_PALETTE.length],
    }));
    if (restSum > 0) {
      list.push({ key: "__other", label: "Lainnya", value: restSum, pct: Math.round((restSum / total) * 100), color: "#C7CCDA" });
    }
    return list;
  }
  const distPoi = useMemo(
    () => buildDist(distDataset, (r) => r.poi_type || "__lainnya", (k) => (k === "__lainnya" ? "Lainnya" : unsnake(k))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [distDataset]
  );
  const distCategory = useMemo(
    () => buildDist(distDataset, (r) => {
      const arr = Array.isArray(r.event_categories) && r.event_categories.length ? r.event_categories : (r.event_category ? [r.event_category] : []);
      return arr[0] || "__lainnya";
    }, (k) => (k === "__lainnya" ? "Lainnya" : unsnake(k))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [distDataset]
  );
  const distBrand = useMemo(() => {
    const map = new Map();
    for (const r of distDataset) {
      const b = (r.brand || "").toLowerCase();
      const k = b === "im3" ? "im3" : b === "tri" ? "tri" : "__lainnya";
      map.set(k, (map.get(k) || 0) + 1);
    }
    const total = distDataset.length || 1;
    const COLOR = { im3: BRAND_COLOR.im3, tri: BRAND_COLOR.tri, __lainnya: "#8A93A8" };
    const LABEL = { im3: "IM3", tri: "3ID", __lainnya: "Lainnya" };
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ key: k, label: LABEL[k], value: v, pct: Math.round((v / total) * 100), color: COLOR[k] }));
  }, [distDataset]);

  // Kontributor terbesar = branch dgn TOTAL event (IM3+3ID) tertinggi -
  // dipakai di footer "KONTRIBUTOR TERBESAR", sama definisinya dgn slide
  // referensi ("Medan menjadi kontributor terbesar dengan 43 event").
  const topContributor = useMemo(() => {
    let best = null;
    for (const id of branchIds) {
      const n = (planByBrand.im3.get(id) || 0) + (planByBrand.tri.get(id) || 0);
      if (!best || n > best.n) best = { id, n };
    }
    return best && best.n > 0 ? { name: branchMap.get(best.id) || "-", n: best.n } : null;
  }, [branchIds, planByBrand, branchMap]);

  const rc = regionColor(effectiveRegion);

  const handleExport = useCallback(async () => {
    if (!posterRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(posterRef.current, {
        scale: 2, backgroundColor: "#FFFFFF", useCORS: true, logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity-report-summary-${monthKey}.png`;
      a.click();
    } catch (e) {
      setErr("Gagal export gambar: " + (e?.message || String(e)));
    } finally { setExporting(false); }
  }, [monthKey]);

  return (
    <div>
      <style>{`
        .mh-ad-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .mh-ad-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .mh-ad-pill select { border: none; background: transparent; outline: none; font-weight: 700; font-size: 12.5px; color: ${T.hi}; }
        .mh-ad-skel { position: relative; overflow: hidden; background: #EEF1F6; }
        .mh-ad-skel::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent); animation: mh-shimmer 1.3s infinite; }
        @keyframes mh-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
        @media (prefers-reduced-motion: reduce) { .mh-ad-skel::after { animation: none; } }
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
              onChange={(e) => { hasPickedRegion.current = true; setRegionFilter(e.target.value); }}
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
          <button onClick={handleExport} disabled={loading || exporting}
            style={{
              display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 10, border: "none",
              background: exporting || loading ? "#B0B7C6" : "linear-gradient(135deg,#ED1C24,#C6168D)",
              color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: exporting || loading ? "default" : "pointer",
            }}>
            {exporting ? <Loader2 size={15} style={{ animation: "mh-spin .8s linear infinite" }} /> : <Download size={15} />}
            {exporting ? "Membuat gambar..." : "Export sebagai Gambar"}
          </button>
          <style>{`@keyframes mh-spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>

      {/* Toggle segmented (iOS-style) - pilih dasar pengelompokan chart
          "Event Achievement per Branch": per Branch (default), per POI,
          atau per Kategori Event. Murni kontrol tampilan di LUAR poster -
          tidak ikut ter-export, cuma hasil chart di dalam poster yg
          berubah mengikuti pilihan ini. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.lo }}>Tampilkan Event Achievement per:</span>
        <SegmentedToggle
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: "branch", label: "Branch" },
            { value: "poi", label: "POI" },
            { value: "category", label: "Kategori Event" },
          ]}
        />
      </div>


      {loading ? (
        <div className="mh-ad-skel" style={{ borderRadius: 20, minHeight: 500, width: "100%" }} />
      ) : (
        <PosterScaler>
          <ReportPoster
            ref={posterRef}
            regionLabel={regionHeaderLabel(effectiveRegion)}
            monthLabelUp={monthLabelUp}
            groupByLabel={groupBy === "branch" ? "Branch" : groupBy === "poi" ? "POI" : "Kategori Event"}
            totalPlan={totalPlan} totalAchieved={totalAchieved} achievementPct={achievementPct} gap={gap}
            im3Plan={im3Plan} triPlan={triPlan} im3Rows={im3Rows} triRows={triRows}
            finByBrand={finByBrand}
            distMode={distMode} setDistMode={setDistMode} distPoi={distPoi} distCategory={distCategory} distBrand={distBrand}
            topPerformer={topPerformer} topContributor={topContributor}
          />
        </PosterScaler>
      )}
    </div>
  );
}

/** Toggle segmented gaya iOS - latar pill abu2, "thumb" putih dgn shadow
 * tipis yg bergeser (translateX, dihitung dari index opsi aktif / total
 * opsi) ke opsi yg sedang aktif, label di atasnya ikut berubah warna gelap
 * saat aktif. Dipakai utk memilih dasar pengelompokan chart Achievement
 * (Branch/POI/Kategori Event) - bukan bagian dari poster yg diexport. */
function SegmentedToggle({ value, onChange, options }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div style={{
      position: "relative", display: "inline-flex", padding: 3, borderRadius: 11,
      background: "#EDEEF3", border: "1px solid #E3E5EC",
    }}>
      <div style={{
        position: "absolute", top: 3, bottom: 3, left: 3,
        width: `calc(${100 / options.length}% - 2px)`,
        transform: `translateX(calc(${idx} * (100% + 2px)))`,
        background: "#FFFFFF", borderRadius: 8,
        boxShadow: "0 1px 3px rgba(16,24,40,0.16)",
        transition: "transform .2s cubic-bezier(.4,0,.2,1)",
      }} />
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          style={{
            position: "relative", zIndex: 1, border: "none", background: "transparent", cursor: "pointer",
            padding: "6px 14px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
            color: o.value === value ? "#17181C" : "#8A8FA3", transition: "color .2s",
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Membungkus poster - RESPONSIF SUNGGUHAN, bukan cuma di-scale seragam.
 * Sebelumnya poster dipaksa lebar native 1400px lalu di-`transform:
 * scale()` mengikuti lebar kontainer - visually proporsional tapi semua
 * teks ikut mengecil bareng saat window disempitkan (setengah layar jadi
 * nyaris tidak terbaca). Sekarang poster-nya sendiri FLUID (lebar 100%,
 * dibatasi maxWidth 1400px), dan setiap section di dalamnya pakai CSS
 * (flex-wrap + container query lewat class `.ap-*`, lihat <style> di
 * ReportPoster) supaya elemen benar2 MENYUSUN ULANG dirinya (bukan cuma
 * mengecil) ketika kontainer menyempit - baik krn window di-resize half
 * screen maupun full screen. `container-type: inline-size` di sini yg
 * bikin breakpoint di dalam ReportPoster bereaksi thd lebar KONTAINER ini,
 * bukan lebar viewport browser. */
function PosterScaler({ children }) {
  return (
    <div style={{
      width: "100%", borderRadius: 20, overflow: "hidden",
      boxShadow: "0 10px 30px rgba(16,24,40,0.10), 0 2px 8px rgba(16,24,40,0.06)",
      containerType: "inline-size", containerName: "ad-poster",
    }}>
      {children}
    </div>
  );
}

/** Kartu poster "Activity Report Summary" - layout 1:1 dgn deck referensi
 * bulanan tim: banner diagonal merah/navy, 4 kartu section (Achievement
 * donut, Achievement per Branch, Financial Summary, Top Performer), 3
 * insight footer. Lebar NATIVE 1400x810 (rasio ~16:9, sama spt slide
 * PowerPoint) - dibungkus forwardRef supaya html2canvas bisa merender node
 * DOM-nya langsung jadi PNG. */
const ReportPoster = forwardRef(function ReportPoster({
  regionLabel, monthLabelUp, groupByLabel, totalPlan, totalAchieved, achievementPct, gap,
  im3Plan, triPlan, im3Rows, triRows,
  finByBrand, distMode, setDistMode, distPoi, distCategory, distBrand, topPerformer, topContributor,
}, ref) {
  const NAVY = "#0D1B3E";
  const RED = "#ED1C24";
  return (
    <div ref={ref} style={{
      width: "100%", maxWidth: 1400, margin: "0 auto", background: "#F4F6FB", position: "relative", overflow: "hidden",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", display: "flex", flexDirection: "column",
    }}>
      {/* Breakpoint RESPONSIF SUNGGUHAN - berbasis lebar KONTAINER poster
          (container query, lihat containerType di PosterScaler), bukan
          lebar viewport, jadi tetap benar walau poster ada di panel yg
          lebih sempit dari window. Section2 disusun ulang (bukan sekadar
          mengecil) saat kontainer menyempit: header wrap, divider vertikal
          disembunyikan, Financial Summary & Top Performer jadi stack
          vertikal, footer insight jadi 1 kolom. */}
      <style>{`
        .ap-header { flex-wrap: wrap; row-gap: 10px; }
        .ap-donutrow { flex-wrap: wrap; row-gap: 16px; }
        .ap-row2 { flex-wrap: wrap; }
        .ap-fin { flex: 1.7 1 380px; min-width: 320px; }
        .ap-top { flex: 1 1 280px; min-width: 240px; }
        .ap-fincoins { flex-wrap: wrap; row-gap: 8px; }
        .ap-footer { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
        @container ad-poster (max-width: 860px) {
          .ap-title { font-size: 26px !important; }
          .ap-vdivider { display: none; }
          .ap-header { align-items: flex-start !important; }
        }
        @container ad-poster (max-width: 560px) {
          .ap-title { font-size: 21px !important; }
          .ap-subtitle { font-size: 12px !important; }
        }
      `}</style>
      {/* Diagonal corner accents - pojok kiri-atas & kanan-bawah, warna
          gold/red, meniru aksen sudut di deck referensi. Diperkecil &
          judul digeser ke kanan (lihat padding header di bawah) spy
          segitiga TIDAK LAGI menutupi huruf "A" di "ACTIVITY". */}
      <div style={{ position: "absolute", top: 0, left: 0, width: 56, height: 56, background: "linear-gradient(135deg,#F5A623,#ED1C24 60%)", clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, width: 130, height: 60, background: "linear-gradient(135deg,#ED1C24,#F5A623)", clipPath: "polygon(100% 100%, 100% 0, 0 100%)" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, background: "#0D1117" }} />

      {/* Header - padding kiri diperbesar (40->52) supaya judul tidak
          pernah tumpang tindih dgn segitiga aksen pojok kiri-atas. */}
      <div className="ap-header" style={{ padding: "24px 40px 14px 52px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div className="ap-title" style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
            <span style={{ color: NAVY }}>ACTIVITY REPORT </span>
            <span style={{ color: RED }}>SUMMARY</span>
          </div>
          <div className="ap-subtitle" style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: "#5A6478", letterSpacing: "0.02em" }}>
            {regionLabel} <span style={{ color: RED, margin: "0 6px" }}>|</span> {monthLabelUp}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 40, flexShrink: 0 }}>
          <PosterLogo src={BRAND_LOGO.IM3} alt="IM3" h={26} />
          <div style={{ width: 1, height: 24, background: "#D8DCE6" }} />
          <PosterLogo src={BRAND_LOGO["3ID"]} alt="3ID" h={30} />
        </div>
      </div>

      {/* Body grid - row 1 (Achievement + Achievement per Branch) pakai grid
          380px/1fr spy selaras kolom; row 2 (Financial Summary + Top
          Performer) sengaja dipisah jadi flex TERSENDIRI dgn rasio lebar
          berbeda (Financial lebih lebar spy angka per brand muat 1 baris,
          Top Performer diperkecil krn kontennya ringkas). */}
      <div style={{ padding: "0 32px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 1. Event Achievement vs Plan + 3 donut distribusi (POI /
            Kategori Event / Brand) DIGABUNG jadi 1 card - total 4 donut
            berdampingan, dgn toggle Plan/Actual kecil di header (menimpa
            dataset ke-3 donut distribusi; donut Achievement paling kiri
            selalu berbasis Plan-vs-Actual keseluruhan, tidak ikut toggle
            ini). */}
        <PosterCard icon={Target} accent="#1565C0" title="1. EVENT ACHIEVEMENT & DISTRIBUSI AKTIVITAS (REGION)"
          right={<MiniHeaderToggle value={distMode} onChange={setDistMode} options={[{ value: "plan", label: "Plan" }, { value: "actual", label: "Actual" }]} />}>
          <div className="ap-donutrow" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-evenly", gap: 16, padding: "4px 2px 0" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 128 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "#5A6478", letterSpacing: "0.03em" }}>ACHIEVEMENT VS PLAN</div>
              <MiniDonut pct={achievementPct} brandData={distBrand} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                <PosterStatMini icon={Calendar} color="#ED1C24" label="TOTAL ACTIVITY" value={fmtInt(totalPlan)} />
                <PosterStatMini icon={BarChart3} color="#1565C0" label="ACTUAL" value={fmtInt(totalAchieved)} />
                <PosterStatMini icon={TrendingUp} color="#F57C00" label="GAP" value={fmtInt(gap)} />
              </div>
            </div>
            <div className="ap-vdivider" style={{ width: 1, alignSelf: "stretch", background: "#EDEFF5" }} />
            <DonutDistBlock title="PER POI" data={distPoi} />
            <div className="ap-vdivider" style={{ width: 1, alignSelf: "stretch", background: "#EDEFF5" }} />
            <DonutDistBlock title="PER KATEGORI EVENT" data={distCategory} />
          </div>
          <div style={{ marginTop: 12, background: "#EAF3FF", border: "1px solid #CFE3FA", borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2E7D32", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, flexShrink: 0 }}>✓</div>
            <div style={{ fontSize: 11.5, color: "#3A4256", lineHeight: 1.3 }}>
              Total Activity actual <b style={{ color: NAVY }}>{fmtInt(totalAchieved)}</b> dari <b style={{ color: NAVY }}>{fmtInt(totalPlan)}</b> total plan
            </div>
          </div>
        </PosterCard>

        {/* 2. Event Achievement per Branch - sekarang full-width (row
            sendiri) krn Card #1 di atas sudah jauh lebih lebar stlh 4 donut
            digabung. */}
        <PosterCard icon={BarChart3} accent="#7C3AED" title={`2. EVENT ACHIEVEMENT PER ${groupByLabel.toUpperCase()}`} legend>
          <PosterBranchChart logo="im3" label="IM3" accent="#0D1B3E" barAccent={BRAND_COLOR.im3} total={im3Plan} rows={im3Rows} />
          <div style={{ height: 1, background: "#EDEFF5", margin: "8px 0" }} />
          <PosterBranchChart logo="3ID" label="TRI" accent="#0D1B3E" barAccent={BRAND_COLOR.tri} total={triPlan} rows={triRows} />
        </PosterCard>
      </div>

      {/* Row 2 - flex custom (bukan grid 380/1fr) spy Financial Summary bisa
          jauh lebih lebar drpd Top Performer yg konten intinya ringkas. */}
      <div className="ap-row2" style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        {/* 3. Financial Summary - dipecah per brand (IM3 / 3ID) supaya
            angkanya tidak digabung jadi 1 baris datar, dibuat lebar spy tiap
            baris brand pas 1 baris tanpa wrap. Ikon mengikuti set yg sama
            dgn KPI strip di halaman Activity Plan (Wallet=cost, CardSim=SP,
            Router=FWA, Banknote=revenue). Class ap-fin/.ap-top (lihat
            <style> di atas) yg bikin dua card ini stack vertikal saat
            kontainer poster menyempit, bukan cuma diperas jadi kecil. */}
        <div className="ap-fin" style={{ minWidth: 0 }}>
          <PosterCard icon={Wallet} accent="#2E7D32" title="3. FINANCIAL SUMMARY PER BRAND (REGION)">
            <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", justifyContent: "center" }}>
              <FinBrandRow logo={BRAND_LOGO.IM3} label="IM3" data={finByBrand.im3} accent={BRAND_COLOR.im3} />
              <div style={{ height: 1, background: "#EDEFF5" }} />
              <FinBrandRow logo={BRAND_LOGO["3ID"]} label="3ID" data={finByBrand.tri} accent={BRAND_COLOR.tri} />
            </div>
          </PosterCard>
        </div>

        {/* 4. Top Performer - diperkecil (kontennya ringkas) supaya Card #3
            di sebelahnya bisa jauh lebih lebar. */}
        <div className="ap-top" style={{ minWidth: 0 }}>
          <PosterCard icon={Trophy} accent="#D4A017" title="TOP PERFORMER EVENT">
            {topPerformer ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, height: "100%" }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>🏆</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: "#8A93A8", fontWeight: 700 }}>The best conversion rate activity</div>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{topPerformer.name}</div>
                  <div style={{ fontSize: 10, color: "#5A6478", fontWeight: 700, marginBottom: 5 }}>{topPerformer.branch} Branch</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 8, color: "#8A93A8", fontWeight: 800, textTransform: "uppercase" }}>Revenue</div>
                      <div style={{ fontSize: 11.5, fontWeight: 900, color: "#2E7D32" }}>Rp {fmtRp(topPerformer.revenue)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: "#8A93A8", fontWeight: 800, textTransform: "uppercase" }}>Cost Ratio</div>
                      <div style={{ fontSize: 11.5, fontWeight: 900, color: "#7C3AED" }}>{topPerformer.costRatio != null ? `${topPerformer.costRatio}%` : "-"}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "#8A93A8", fontSize: 12, padding: "10px 0" }}>Belum ada event completed dgn cost &amp; revenue tercatat.</div>
            )}
            {topPerformer && (
              <div style={{ marginTop: 7, background: "#2E7D32", color: "#fff", borderRadius: 999, textAlign: "center", padding: "4px 8px", fontSize: 9, fontWeight: 800, letterSpacing: "0.02em" }}>
                ★ MOST EFFECTIVE ACTIVITY ★
              </div>
            )}
          </PosterCard>
        </div>
      </div>

      </div>

      {/* Footer insight strip */}
      <div className="ap-footer" style={{ margin: "0 32px 20px", border: "1px solid #E3E8F0", borderRadius: 12, background: "#fff", padding: "12px 20px" }}>
        <FooterInsight icon={Target} color="#1565C0" title="PENCAPAIAN TARGET"
          body={`Region berhasil mencapai ${achievementPct}% dari total target bulanan.`} />
        <FooterInsight icon={Users} color="#7C3AED" title="KONTRIBUTOR TERBESAR"
          body={topContributor ? <><b style={{ color: "#7C3AED" }}>{topContributor.name}</b> menjadi kontributor terbesar dengan {topContributor.n} event.</> : "Belum ada data kontributor bulan ini."} divider />
        <FooterInsight icon={TrendingUp} color="#ED1C24" title="FOCUS PENINGKATAN"
          body={<>Fokus peningkatan <b>execution</b> di area yang masih gap untuk mencapai target.</>} divider />
      </div>
    </div>
  );
});

/** Badge logo brand resmi (IM3/3ID) di dalam poster - latar putih rounded
 * spy logo (yg banyak elemen merah/hitam) tetap kontras & rapi di atas
 * background apa pun (header abu2, ataupun label chart), TIDAK lagi
 * "digambar ulang" pakai teks manual yg gampang meleset dari logo asli. */
function PosterLogo({ src, alt, h = 24 }) {
  return (
    <div style={{ height: h, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} style={{ height: h, width: "auto", objectFit: "contain", display: "block" }} />
    </div>
  );
}

function PosterCard({ icon: Icon, accent, title, children, legend, right }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E3E8F0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#0D1B3E", padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {Icon && <Icon size={12} color="#fff" />}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{title}</div>
        </div>
        {legend && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, color: "#C7CCDA", fontWeight: 700 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: "#90A4C4", display: "inline-block" }} /> Target</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, color: "#C7CCDA", fontWeight: 700 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: "#ED7D31", display: "inline-block" }} /> Achieved</span>
          </div>
        )}
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
      <div style={{ padding: 14, flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

/** Toggle pill kecil bertema gelap (dipakai di header navy PosterCard) -
 * versi mini dari SegmentedToggle, utk pilih dataset Plan/Actual yg
 * mengisi 3 donut distribusi di Card #1 tanpa perlu kontrol terpisah di
 * luar poster. */
function MiniHeaderToggle({ value, onChange, options }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", background: "rgba(255,255,255,0.14)", borderRadius: 8, padding: 2, gap: 1 }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          style={{
            border: "none", cursor: "pointer", padding: "4px 11px", borderRadius: 6,
            fontSize: 10, fontWeight: 800, letterSpacing: "0.01em",
            background: o.value === value ? "#fff" : "transparent",
            color: o.value === value ? "#0D1B3E" : "#C7CCDA",
            transition: "background .2s ease, color .2s ease",
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Donut Achievement utama - dgn tambahan breakdown PER BRAND (IM3/3ID)
 * yg TIDAK ditampilkan sbg chart terpisah lagi, melainkan cuma muncul saat
 * di-hover (tooltip melayang di atas donut) - lebih rapi drpd sebelumnya
 * (donut ke-4 "PER BRAND" cuma berisi 2 baris legend, bikin baris donut
 * jadi timpang/kurang seimbang dibanding POI & Kategori Event). */
function MiniDonut({ pct, brandData }) {
  const [hover, setHover] = useState(false);
  const r = 46, c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, pct)) / 100 * c;
  const color = pct >= 90 ? "#1565C0" : pct >= 60 ? "#F57C00" : "#C62828";
  const hasBrand = Array.isArray(brandData) && brandData.length > 0;
  return (
    <div
      style={{ position: "relative", width: 116, height: 116, flexShrink: 0, cursor: hasBrand ? "pointer" : "default" }}
      onMouseEnter={() => hasBrand && setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg width={116} height={116} viewBox="0 0 116 116">
        <circle cx="58" cy="58" r={r} fill="none" stroke="#EEF2F9" strokeWidth={13} />
        <circle cx="58" cy="58" r={r} fill="none" stroke={color} strokeWidth={13}
          strokeDasharray={`${filled} ${c - filled}`} strokeLinecap="round"
          transform="rotate(-90 58 58)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: "#0D1117" }}>{pct}%</div>
        <div style={{ fontSize: 8, color: "#8A93A8", fontWeight: 700 }}>Achievement</div>
      </div>
      {hasBrand && (
        <div style={{
          position: "absolute", left: "50%", bottom: "calc(100% + 8px)", transform: `translateX(-50%) translateY(${hover ? 0 : 4}px)`,
          background: "#0D1117", color: "#fff", borderRadius: 8, padding: "7px 11px",
          fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", textAlign: "left",
          pointerEvents: "none", boxShadow: "0 8px 20px rgba(16,24,40,0.35)",
          opacity: hover ? 1 : 0, transition: "opacity .18s ease, transform .18s ease", zIndex: 6,
        }}>
          <div style={{ fontWeight: 900, marginBottom: 3, letterSpacing: "0.03em", color: "#C7CCDA" }}>PER BRAND</div>
          {brandData.map((d) => (
            <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: d.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{d.label}</span>
              <b>{d.value} &middot; {d.pct}%</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Stat kecil (ikon + label + value) dipakai di kolom kiri Card #1, setelah
 * digabung dgn 3 donut distribusi - supaya kolom Total Activity/Actual/Gap
 * tidak makan terlalu banyak lebar. */
function PosterStatMini({ icon: Icon, color, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ width: 21, height: 21, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {Icon && <Icon size={11} color="#fff" />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 7.5, fontWeight: 800, color: "#8A93A8", letterSpacing: "0.03em" }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#0D1117", lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  );
}

/** Bar chart Target vs Achieved per branch, satu brand - dipakai 2x
 * (IM3 & 3ID) di PosterCard #2, tinggi tetap spy 2 baris (im3+tri) selalu
 * pas di dalam card tanpa terpotong. */
function PosterBranchChart({ label, accent, barAccent, total, rows }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.target, r.achieved]));
  const H = 60;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 66, flexShrink: 0, textAlign: "center", paddingTop: 2 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 3 }}>
          <PosterLogo src={BRAND_LOGO[label === "IM3" ? "IM3" : "3ID"]} alt={label} h={18} />
        </div>
        <div style={{ fontSize: 8.5, color: "#8A93A8", fontWeight: 700 }}>({total} Event)</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 14, height: H + 30, overflowX: "auto" }}>
        {rows.length === 0 && <div style={{ color: "#8A93A8", fontSize: 11 }}>Belum ada data.</div>}
        {rows.map((r) => (
          <div key={r.id} style={{ flex: "0 0 auto", minWidth: 46, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: H }}>
              <MiniBar h={(r.target / max) * H} color="#90A4C4" value={r.target} />
              <MiniBar h={(r.achieved / max) * H} color={barAccent} value={r.achieved} />
            </div>
            <div style={{ fontSize: 8, color: "#5A6478", fontWeight: 700, marginTop: 4, textAlign: "center", lineHeight: 1.15, maxWidth: 50 }}>{r.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function MiniBar({ h, color, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
      <div style={{ fontSize: 9, fontWeight: 900, color: "#0D1117", marginBottom: 2 }}>{value}</div>
      <div style={{ width: 13, height: `${Math.max(3, h)}px`, background: color, borderRadius: "3px 3px 1px 1px" }} />
    </div>
  );
}

function FinCoin({ icon: Icon, color, label, value, sub }) {
  return (
    <div style={{ textAlign: "center", flex: "1 1 64px", minWidth: 64 }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${color}18`, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 5px" }}>
        {Icon && <Icon size={15} color={color} />}
      </div>
      <div style={{ fontSize: 8.5, fontWeight: 800, color: "#8A93A8", letterSpacing: "0.02em" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#0D1117", marginTop: 2, whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 8.5, color, fontWeight: 800 }}>{sub}</div>}
    </div>
  );
}

/** Satu baris brand (IM3 / 3ID) di dalam Card #3 Financial Summary - logo +
 * nama brand di kolom kiri (mirror gaya PosterBranchChart), lalu 6 FinCoin
 * (Total Cost, SP, FWA, Rebuy, Total Rev, Ratio) dgn ikon yg SAMA seperti
 * KPI strip di halaman Activity Plan (Wallet/CardSim/Router/Banknote). */
function FinBrandRow({ logo, label, data, accent }) {
  const spPctRow = data.sp + data.fwa > 0 ? Math.round((data.sp / (data.sp + data.fwa)) * 100) : 0;
  const fwaPctRow = data.sp + data.fwa > 0 ? 100 - spPctRow : 0;
  return (
    <div className="ap-fincoins" style={{ display: "flex", alignItems: "center", gap: 10, background: "#FAFBFD", border: "1px solid #EEF0F5", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ width: 54, flexShrink: 0, textAlign: "center" }}>
        <PosterLogo src={logo} alt={label} h={18} />
        <div style={{ fontSize: 9.5, fontWeight: 800, color: accent, marginTop: 3 }}>{label}</div>
      </div>
      <div className="ap-vdivider" style={{ width: 1, alignSelf: "stretch", background: "#EDEFF5" }} />
      <div style={{ flex: 1, display: "flex", gap: 6, minWidth: 140, flexWrap: "wrap" }}>
        <FinCoin icon={Wallet} color="#1565C0" label="TOTAL COST" value={fmtRp(data.cost)} />
        <FinCoin icon={CardSim} color="#2E7D32" label="SP" value={fmtInt(data.sp)} sub={`${spPctRow}%`} />
        <FinCoin icon={RouterIcon} color="#2E7D32" label="FWA" value={fmtInt(data.fwa)} sub={`${fwaPctRow}%`} />
        <FinCoin icon={RefreshCw} color="#F5A623" label="REBUY" value={fmtInt(data.rebuy)} />
        <FinCoin icon={Banknote} color="#1565C0" label="TOTAL REV" value={fmtRp(data.rev)} />
        <FinCoin icon={Percent} color="#7C3AED" label="RATIO" value={data.ratio != null ? `${data.ratio}%` : "-"} />
      </div>
    </div>
  );
}

function FooterInsight({ icon: Icon, color, title, body, divider }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "2px 16px", borderLeft: divider ? "1px solid #EDEFF5" : "none" }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {Icon && <Icon size={14} color={color} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#0D1117", letterSpacing: "0.01em", textDecoration: "underline", textDecorationColor: `${color}55` }}>{title}</div>
        <div style={{ fontSize: 10.5, color: "#5A6478", lineHeight: 1.35, marginTop: 2 }}>{body}</div>
    </div>
    </div>
  );
}

/** Donut chart multi-segmen (SVG stroke-dasharray, BUKAN CSS conic-gradient
 * - lebih aman utk direnderkan html2canvas saat export gambar) - dipakai
 * Card #5 utk memperlihatkan persentase pembagian per POI / Kategori Event
 * / Brand dari total activity yg sedang ditampilkan (Plan atau Actual). */
function MultiDonutSVG({ data, size = 118, stroke = 16, hoverIdx = null, onHover }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Hitung offset kumulatif per-segmen via reduce (bukan reassign variabel
  // `let` di scope luar) - dibutuhkan react-compiler/immutability rule.
  const segs = data.reduce((acc, d) => {
    const frac = d.value / total;
    const prev = acc.length ? acc[acc.length - 1] : null;
    const offset = prev ? prev.offset + prev.frac * c : 0;
    acc.push({ ...d, frac, offset });
    return acc;
  }, []);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, overflow: "visible" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF0F5" strokeWidth={stroke} />
      {segs.map((d, i) => {
        const len = Math.max(0, d.frac * c - (data.length > 1 ? 1.5 : 0));
        const active = hoverIdx === i;
        const dim = hoverIdx != null && !active;
        return (
          <circle key={d.key || i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color}
            strokeWidth={active ? stroke + 3 : stroke}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-d.offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round"
            onMouseEnter={() => onHover && onHover(i)}
            onMouseLeave={() => onHover && onHover(null)}
            style={{
              cursor: "pointer", opacity: dim ? 0.35 : 1,
              filter: active ? "drop-shadow(0 3px 8px rgba(16,24,40,0.30))" : "none",
              transition: "stroke-width .2s ease, opacity .2s ease, filter .2s ease, stroke-dasharray .6s cubic-bezier(.4,0,.2,1), stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)",
            }} />
        );
      })}
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fontSize={19} fontWeight="900" fill="#0D1117" style={{ transition: "opacity .15s ease" }}>{hoverIdx != null ? segs[hoverIdx].pct + "%" : total}</text>
      <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="700" fill="#8A93A8">{hoverIdx != null ? "SHARE" : "EVENT"}</text>
    </svg>
  );
}

/** Satu blok "donut + legend" di Card #5 - judul kecil, donut di tengah,
 * lalu daftar kelompok (dot warna + nama + %) di bawahnya. Tiga blok ini
 * (POI / Kategori Event / Brand) dipasang berdampingan dlm 1 card. */
function DonutDistBlock({ title, data }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const hovered = hoverIdx != null ? data[hoverIdx] : null;
  return (
    <div style={{ flex: "0 1 240px", width: 240, minWidth: 200, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#5A6478", letterSpacing: "0.03em" }}>{title}</div>
      <div style={{ position: "relative" }}>
        <MultiDonutSVG data={data} hoverIdx={hoverIdx} onHover={setHoverIdx} />
        {/* Tooltip hover - melayang tepat di atas donut, menampilkan nama
            kelompok + jumlah event (achievement) + persentasenya, muncul
            dgn transisi halus (fade + naik sedikit). */}
        <div style={{
          position: "absolute", left: "50%", bottom: "calc(100% + 6px)", transform: `translateX(-50%) translateY(${hovered ? 0 : 4}px)`,
          background: "#0D1117", color: "#fff", borderRadius: 8, padding: "6px 10px",
          fontSize: 10, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap",
          pointerEvents: "none", boxShadow: "0 8px 20px rgba(16,24,40,0.35)",
          opacity: hovered ? 1 : 0, transition: "opacity .18s ease, transform .18s ease", zIndex: 6,
        }}>
          {hovered && (<>
            <div style={{ fontWeight: 900 }}>{hovered.label}</div>
            <div style={{ color: hovered.color, fontWeight: 800 }}>{hovered.value} event &middot; {hovered.pct}%</div>
          </>)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", padding: "0 6px" }}>
        {data.length === 0 && <div style={{ fontSize: 10, color: "#8A93A8", textAlign: "center" }}>Belum ada data.</div>}
        {data.map((d, i) => (
          <div key={d.key}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 10, cursor: "pointer",
              borderRadius: 6, padding: "3px 5px", margin: "0 -5px",
              background: hoverIdx === i ? `${d.color}16` : "transparent",
              transition: "background .15s ease",
            }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0, transition: "transform .15s ease", transform: hoverIdx === i ? "scale(1.25)" : "scale(1)" }} />
            <div style={{ flex: 1, minWidth: 0, color: "#3A4256", fontWeight: hoverIdx === i ? 900 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
            <div style={{ fontWeight: 900, color: "#0D1117", flexShrink: 0 }}>{d.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
