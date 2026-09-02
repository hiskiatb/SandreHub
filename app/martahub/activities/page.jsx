"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Search, Download, RotateCcw, Wallet, FileCheck2, CardSim, Router as RouterIcon, TrendingUp, Banknote, Percent, RefreshCw, Loader2, Settings2 } from "lucide-react";
import ExcelJS from "exceljs";
import MartaShell, { T, FONT, brandLabel } from "../components/MartaShell";
import ExcelFilter from "../components/ExcelFilter";
import { ActivityDetailModal } from "../components/ActivityDetail";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";

const CAT_LABEL = {
  directSelling: "Direct Selling", jointEvent: "Join Event", openBooth: "Open Booth",
  project: "Project", sponsorship: "Sponsorship", thematic: "Thematic",
};
const STATUS = {
  draft: ["Draft", T.mid, "#eef1f6"], submitted: ["Laporan Masuk", T.blue, T.blueBg],
  approved: ["Disetujui", T.success, T.successBg], rejected: ["Ditolak", T.error, T.errorBg],
  completed: ["Selesai", T.success, T.successBg], inProgress: ["Berlangsung", T.warning, T.warningBg],
  plan_submitted: ["Menunggu Approval", T.blue, T.blueBg], revision_needed: ["Revisi Plan", T.warning, T.warningBg],
  pending_validation: ["Menunggu Validasi", T.blue, T.blueBg],
  revision_actual: ["Perlu Perbaikan Lokasi/Bukti", T.warning, T.warningBg],
};

// Status "approved" (Plan disetujui) mencakup 3 fase operasional berbeda yang
// dulu numpuk jadi satu label "Disetujui" - dipecah berdasarkan tanggal
// plan_date vs hari ini (murni tampilan, TIDAK mengubah kolom status di DB):
//   - belum sampai plan_date  -> "Menunggu Hari-H"
//   - hari ini persis plan_date -> "Hari-H / Berlangsung"
//   - sudah lewat plan_date tapi laporan aktual belum disubmit -> "Terlambat Lapor"
// Begitu laporan aktual disubmit, status DB pindah ke 'submitted' dst, jadi
// fungsi ini otomatis tidak lagi dipakai utk activity itu.
function deriveStatusInfo(r) {
  if (r?.status === "approved") {
    const planDateStr = r.plan_date_start || r.plan_date;
    if (planDateStr) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const planDate = new Date(planDateStr.slice(0, 10)); planDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today - planDate) / 86400000);
      if (diffDays < 0) return ["Menunggu Hari-H", T.blue, T.blueBg];
      if (diffDays === 0) return ["Hari-H / Berlangsung", T.warning, T.warningBg];
      return ["Terlambat Lapor", T.error, T.errorBg];
    }
  }
  return STATUS[r?.status] || [r?.status, T.mid, "#eef1f6"];
}

const fmtDate = (s) => {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};
const fmtInt = (n) => (n == null ? "-" : Number(n).toLocaleString("id-ID"));
// Label seragam utk kolom bertipe "tag" (POI, Event Category, Network Category):
// SEMUA HURUF BESAR, underscore diganti spasi (bukan "urban_area" tapi "URBAN AREA").
const fmtTag = (s) => (s ? String(s).replace(/_/g, " ").toUpperCase() : "-");

// Badge brand - SOLID & "pop", bukan teks warna transparan spt sebelumnya:
// IM3 = kuning solid + teks HITAM (kontras tinggi, sesuai identitas IM3),
// 3ID = magenta solid + teks putih. Dipakai di kolom Brand tabel & header
// modal detail supaya brand langsung kebaca sekilas dari jauh.
function BrandBadge({ brand }) {
  if (!brand) return <span style={{ color: T.lo }}>-</span>;
  const isTri = String(brand).toLowerCase() === "tri";
  const bg = isTri ? "#E6007E" : "#FFC700";
  const fg = isTri ? "#fff" : "#1A1300";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", fontSize: 10.5, fontWeight: 800,
      color: fg, background: bg, padding: "3px 9px", borderRadius: 7, letterSpacing: "0.02em",
    }}>
      {brandLabel(brand)}
    </span>
  );
}
const fmtRp = (n) => (n == null ? "-" : `Rp${Number(n).toLocaleString("id-ID")}`);
const rebuySum = (a, b) => { const x = Number(a || 0) + Number(b || 0); return x || null; };
const pctVal = (actual, target) => (!target ? null : (Number(actual || 0) / Number(target)) * 100);
const pctLabel = (actual, target) => { const v = pctVal(actual, target); return v == null ? "-" : `${Math.round(v)}%`; };
const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const monthLabel = (dateStr) => {
  if (!dateStr || dateStr.length < 7) return "-";
  const [y, m] = dateStr.slice(0, 7).split("-");
  return `${MONTHS_ID[(+m || 1) - 1]} ${y}`;
};

// Bucket foto POSM/aktivitas - SAMA PERSIS dgn pola yg sudah dipakai
// app/martahub/approval/page.jsx (mdPhotoUrl) - bucket publik, jadi cukup
// getPublicUrl langsung tanpa proxy otentikasi spt di mobile.
const PHOTO_BUCKET = "mh-photos";
function photoUrl(path) {
  return supabaseMarta.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

const DETAIL_COLS = "id,event_name,event_category,event_categories,brand,mc,branch_id,site_id,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,poi_type,network_category,area_potential,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,target_rev_3m,cost_estimate,expected_outcome,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,actual_rev_3m,cost_actual,insight,checkin_valid,checkin_distance,checkin_at,approved_by_name,approved_by_email,approved_at,approval_notes,validation_status,validation_note,validated_at,override_status,override_by_name,override_at,override_note,created_at";

// Kolom list mh_activities untuk tabel Excel-style di bawah - lebih ringkas
// dari DETAIL_COLS (dipakai modal) tapi mencakup semua field yg diminta utk
// tabel Activity Plan (target/actual/ACV/cost ratio/insight/dokumentasi).
const LIST_COLS = "id,event_name,brand,mc,branch_id,event_categories,event_category,plan_date_start,plan_date,actual_date,site_id,network_category,area_potential,poi_type,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,target_rev_3m,cost_estimate,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,actual_rev_3m,cost_actual,insight,checkin_valid,created_by,bme_user_id,created_at";

export default function ActivityPlanPage() {
  return (
    <MartaShell active="activities" title="Activity Plan" subtitle="Rencana, submission, & monitoring aktivitas - satu tempat, dari plan sampai selesai.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [rows, setRows] = useState([]);
  const [branchMap, setBranchMap] = useState({});
  const [profileMap, setProfileMap] = useState({});
  const [docCountMap, setDocCountMap] = useState({});
  const [docPhotoMap, setDocPhotoMap] = useState({}); // activity_id -> storage_path foto pertama (utk thumbnail export)
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [colFilters, setColFilters] = useState({});
  const [sortState, setSortState] = useState({ key: null, dir: "asc" });
  const [lbMap, setLbMap] = useState({}); // user_id -> { achievement_pct, productivity_pct }
  const [showKpiConfig, setShowKpiConfig] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);
      let query = supabaseMarta
        .from("mh_activities")
        .select(LIST_COLS)
        .order("created_at", { ascending: false })
        .limit(1000);
      query = await applyMartaScope(query, sc);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const list = data || [];
      setRows(list);

      const [{ data: branches }, { data: profiles }, { data: lbRows }] = await Promise.all([
        supabaseMarta.from("mh_branches").select("id, name"),
        supabaseMarta.from("mh_profiles").select("id, full_name"),
        supabaseMarta.from("mh_leaderboard_summary").select("user_id, achievement_pct, productivity_pct"),
      ]);
      setBranchMap(Object.fromEntries((branches || []).map((b) => [b.id, b.name])));
      setProfileMap(Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name])));
      setLbMap(Object.fromEntries((lbRows || []).map((l) => [l.user_id, l])));

      const ids = list.map((r) => r.id);
      if (ids.length) {
        const { data: docs } = await supabaseMarta.from("mh_documents").select("activity_id, file_type, storage_path, created_at").in("activity_id", ids).eq("file_type", "photo").order("created_at");
        const counts = {};
        const firstPhoto = {};
        (docs || []).forEach((d) => {
          counts[d.activity_id] = (counts[d.activity_id] || 0) + 1;
          if (!firstPhoto[d.activity_id]) firstPhoto[d.activity_id] = d.storage_path;
        });
        setDocCountMap(counts);
        setDocPhotoMap(firstPhoto);
      } else {
        setDocCountMap({});
        setDocPhotoMap({});
      }
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  const cats = useCallback((r) => {
    const arr = Array.isArray(r.event_categories) && r.event_categories.length ? r.event_categories : (r.event_category ? [r.event_category] : []);
    if (!arr.length) return "-";
    return arr.map((c) => fmtTag(CAT_LABEL[c] || c)).join(", ");
  }, []);

  // ── Definisi kolom - SATU sumber utk header, filter (kolom berlabel
  //    filter:true dapat dropdown ExcelFilter Excel-style), sort, dan render
  //    sel. Urutan PERSIS sesuai daftar kolom yang diminta. ─────────────────
  const COLUMNS = useMemo(() => [
    { key: "no", label: "No.", width: 46 },
    { key: "status", label: "Status", width: 150, filter: true, get: (r) => deriveStatusInfo(r)[0], badgeStatus: true },
    { key: "month", label: "Month", width: 118, filter: true, get: (r) => monthLabel(r.plan_date_start || r.plan_date) },
    { key: "brand", label: "Brand", width: 66, filter: true, get: (r) => brandLabel(r.brand), badgeBrand: true },
    { key: "branch", label: "Branch", width: 140, filter: true, get: (r) => branchMap[r.branch_id] || "-" },
    { key: "brandBranch", label: "Brand Branch", width: 160, filter: true, get: (r) => `${brandLabel(r.brand)} - ${branchMap[r.branch_id] || "-"}` },
    { key: "mc", label: "Micro Cluster", width: 120, filter: true, get: (r) => r.mc || "-" },
    { key: "creator", label: "BME/RGE", width: 150, filter: true, get: (r) => profileMap[r.created_by] || "-" },
    { key: "planDate", label: "Plan Date", width: 100, filter: true, get: (r) => fmtDate(r.plan_date_start || r.plan_date), sortVal: (r) => r.plan_date_start || r.plan_date || "" },
    { key: "actualDate", label: "Actual Date", width: 100, filter: true, get: (r) => fmtDate(r.actual_date), sortVal: (r) => r.actual_date || "" },
    { key: "eventCategory", label: "Event Category", width: 160, filter: true, get: (r) => cats(r) },
    { key: "network", label: "Network Category", width: 130, filter: true, get: (r) => fmtTag(r.network_category) },
    { key: "eventName", label: "Event Name", width: 230, filter: true, get: (r) => r.event_name || "-" },
    { key: "areaPotential", label: "Area Potential", width: 120, filter: true, get: (r) => fmtTag(r.area_potential) },
    { key: "siteId", label: "Site ID", width: 100, filter: true, get: (r) => r.site_id || "-" },
    { key: "long", label: "Long", width: 90, filter: true, get: (r) => (r.longitude != null ? String(r.longitude) : "-"), raw: (r) => r.longitude, numeric: true },
    { key: "lat", label: "Lat", width: 90, filter: true, get: (r) => (r.latitude != null ? String(r.latitude) : "-"), raw: (r) => r.latitude, numeric: true },
    { key: "poi", label: "POI", width: 110, filter: true, get: (r) => fmtTag(r.poi_type) },
    { key: "address", label: "Address", width: 240, filter: true, get: (r) => r.address || "-" },
    { key: "targetSp", label: "Target SP", width: 92, filter: true, get: (r) => fmtInt(r.target_sp), raw: (r) => r.target_sp, numeric: true },
    { key: "targetFwa", label: "Target FWA", width: 96, filter: true, get: (r) => fmtInt(r.target_fwa), raw: (r) => r.target_fwa, numeric: true },
    { key: "targetRebuy", label: "Target Rebuy", width: 110, filter: true, get: (r) => fmtRp(rebuySum(r.target_rebuy_pulsa, r.target_rebuy_data)), raw: (r) => rebuySum(r.target_rebuy_pulsa, r.target_rebuy_data), numeric: true },
    { key: "targetRev", label: "Target Rev (3M)", width: 130, filter: true, get: (r) => fmtRp(r.target_rev_3m), raw: (r) => r.target_rev_3m, numeric: true },
    { key: "costEstimate", label: "Cost Estimate", width: 120, filter: true, get: (r) => fmtRp(r.cost_estimate), raw: (r) => r.cost_estimate, numeric: true },
    { key: "actualSp", label: "Actual SP", width: 92, filter: true, get: (r) => fmtInt(r.actual_sp), raw: (r) => r.actual_sp, numeric: true },
    { key: "actualFwa", label: "Actual FWA", width: 96, filter: true, get: (r) => fmtInt(r.actual_fwa), raw: (r) => r.actual_fwa, numeric: true },
    { key: "actualRebuy", label: "Actual Rebuy", width: 110, filter: true, get: (r) => fmtRp(rebuySum(r.actual_rebuy_pulsa, r.actual_rebuy_data)), raw: (r) => rebuySum(r.actual_rebuy_pulsa, r.actual_rebuy_data), numeric: true },
    { key: "actualRev", label: "Actual Rev (3M)", width: 130, filter: true, get: (r) => fmtRp(r.actual_rev_3m), raw: (r) => r.actual_rev_3m, numeric: true },
    { key: "costActual", label: "Cost Actual", width: 120, filter: true, get: (r) => fmtRp(r.cost_actual), raw: (r) => r.cost_actual, numeric: true },
    { key: "acvSp", label: "ACV SP", width: 84, filter: true, get: (r) => pctLabel(r.actual_sp, r.target_sp), raw: (r) => pctVal(r.actual_sp, r.target_sp), numeric: true, acv: true },
    { key: "acvFwa", label: "ACV FWA", width: 84, filter: true, get: (r) => pctLabel(r.actual_fwa, r.target_fwa), raw: (r) => pctVal(r.actual_fwa, r.target_fwa), numeric: true, acv: true },
    { key: "acvRebuy", label: "ACV Rebuy", width: 92, filter: true, get: (r) => pctLabel(rebuySum(r.actual_rebuy_pulsa, r.actual_rebuy_data), rebuySum(r.target_rebuy_pulsa, r.target_rebuy_data)), raw: (r) => pctVal(rebuySum(r.actual_rebuy_pulsa, r.actual_rebuy_data), rebuySum(r.target_rebuy_pulsa, r.target_rebuy_data)), numeric: true, acv: true },
    { key: "costRatio", label: "Cost Ratio", width: 92, filter: true, get: (r) => pctLabel(r.cost_actual, r.cost_estimate), raw: (r) => pctVal(r.cost_actual, r.cost_estimate), numeric: true, acv: true, invertGood: true },
    { key: "insight", label: "Insight (Optional)", width: 220, filter: true, get: (r) => r.insight || "-" },
    { key: "documentation", label: "Documentation", width: 120, filter: true, get: (r) => (docCountMap[r.id] ? `${docCountMap[r.id]} foto` : "-") },
  ], [branchMap, profileMap, docCountMap, cats]);

  const FILTER_COLS = useMemo(() => COLUMNS.filter((c) => c.filter), [COLUMNS]);

  const term = q.trim().toLowerCase();
  const searchFiltered = useMemo(() => {
    if (!term) return rows;
    return rows.filter((r) =>
      (r.event_name || "").toLowerCase().includes(term) ||
      (r.mc || "").toLowerCase().includes(term) ||
      (r.site_id || "").toLowerCase().includes(term) ||
      (r.address || "").toLowerCase().includes(term) ||
      (branchMap[r.branch_id] || "").toLowerCase().includes(term) ||
      (profileMap[r.created_by] || "").toLowerCase().includes(term)
    );
  }, [rows, term, branchMap, profileMap]);

  // ── Chained faceted filter options - utk tiap kolom filter, opsi dihitung
  //    dari data yg SUDAH terfilter oleh kolom filter LAIN (bukan dirinya
  //    sendiri) + pencarian teks. Persis prinsip yg dipakai ExcelFilter di
  //    SandraHub (PNL_ControlCenter): pilihan yg ditampilkan selalu relevan
  //    dgn kombinasi filter aktif saat ini, bukan daftar statis semua data. */
  const filterOptionsMap = useMemo(() => {
    const map = {};
    for (const col of FILTER_COLS) {
      let list = searchFiltered;
      for (const oc of FILTER_COLS) {
        if (oc.key === col.key) continue;
        const sel = colFilters[oc.key];
        if (sel && sel.length) list = list.filter((r) => sel.includes(oc.get(r)));
      }
      const uniq = [...new Set(list.map(col.get).filter((v) => v && v !== "-"))].sort((a, b) => String(a).localeCompare(String(b), "id"));
      map[col.key] = uniq.map((v) => ({ value: v, label: String(v) }));
    }
    return map;
  }, [FILTER_COLS, searchFiltered, colFilters]);

  const filteredRows = useMemo(() => {
    let list = searchFiltered;
    for (const col of FILTER_COLS) {
      const sel = colFilters[col.key];
      if (sel && sel.length) list = list.filter((r) => sel.includes(col.get(r)));
    }
    if (sortState.key) {
      const col = COLUMNS.find((c) => c.key === sortState.key);
      if (col) {
        const valFn = col.raw || col.sortVal || col.get;
        const dir = sortState.dir === "asc" ? 1 : -1;
        list = [...list].sort((a, b) => {
          const av = valFn(a), bv = valFn(b);
          if (typeof av === "number" || typeof bv === "number") return dir * ((av ?? -Infinity) - (bv ?? -Infinity));
          return dir * String(av ?? "").localeCompare(String(bv ?? ""), "id");
        });
      }
    }
    return list;
  }, [searchFiltered, colFilters, sortState, FILTER_COLS, COLUMNS]);

  // ── Ringkasan KPI + status quick-filter (menggantikan menu terpisah
  //    "Activity Monitoring" & "Activity Submission" - keduanya cuma
  //    potongan/tampilan lain dari tabel mh_activities yang sama ini, jadi
  //    disatukan langsung di sini: pantauan cepat DAN detail per baris ada
  //    di satu tempat). Dihitung dari filteredRows supaya ikut mengikuti
  //    filter/pencarian yang sedang aktif. ─────────────────────────────────
  const kpiStats = useMemo(() => {
    const total = filteredRows.length;

    // Achievement & Productivity - rata-rata dari mh_leaderboard_summary
    // (dihitung server-side dari bobot mh_settings.leaderboard_weights),
    // discope ke BME/RGE yang punya activity di filteredRows saat ini.
    const bmeIds = Array.from(new Set(filteredRows.map((r) => r.bme_user_id).filter(Boolean)));
    const lbEntries = bmeIds.map((id) => lbMap[id]).filter(Boolean);
    const avgAchievement = lbEntries.length
      ? lbEntries.reduce((s, e) => s + (Number(e.achievement_pct) || 0), 0) / lbEntries.length
      : null;
    const avgProductivity = lbEntries.length
      ? lbEntries.reduce((s, e) => s + (Number(e.productivity_pct) || 0), 0) / lbEntries.length
      : null;

    // "Pengajuan" = target yg diajukan BME saat plan; "Tervalidasi" = actual
    // yg sudah direalisasikan/tervalidasi saat laporan disubmit. Ditampilkan
    // sbg ANGKA TOTAL (bukan %) sesuai permintaan - lebih mudah dibaca cepat.
    const sumPair = (tKey, aKey) => {
      const withTarget = filteredRows.filter((r) => r[tKey]);
      const tgt = withTarget.reduce((s, r) => s + (r[tKey] ?? 0), 0);
      const act = withTarget.reduce((s, r) => s + (r[aKey] ?? 0), 0);
      return { tgt, act, n: withTarget.length };
    };
    const sp = sumPair("target_sp", "actual_sp");
    const fwa = sumPair("target_fwa", "actual_fwa");

    const actualRebuy = filteredRows.reduce((s, r) => s + (rebuySum(r.actual_rebuy_pulsa, r.actual_rebuy_data) ?? 0), 0);
    const actualRev3m = filteredRows.reduce((s, r) => s + (r.actual_rev_3m ?? 0), 0);
    const targetRev3m = filteredRows.reduce((s, r) => s + (r.target_rev_3m ?? 0), 0);
    const totalCostActual = filteredRows.reduce((s, r) => s + (r.cost_actual ?? 0), 0);

    const withBudget = filteredRows.filter((r) => r.cost_estimate);
    const budgetEst = withBudget.reduce((s, r) => s + (r.cost_estimate ?? 0), 0);
    const budgetAct = withBudget.reduce((s, r) => s + (r.cost_actual ?? 0), 0);
    const costRatioPct = budgetEst > 0 ? Math.round((budgetAct / budgetEst) * 100) : null;

    const actualSubmittedCount = filteredRows.filter((r) => r.actual_date).length;

    return {
      total,
      spTervalidasi: sp.act, spPengajuan: sp.tgt,
      fwaTervalidasi: fwa.act, fwaPengajuan: fwa.tgt,
      actualRebuy, actualRev3m, targetRev3m, totalCostActual, budgetEst,
      costRatioPct, costOverBudget: budgetAct > budgetEst,
      actualSubmittedCount,
      avgAchievement, avgProductivity,
    };
  }, [filteredRows, lbMap]);

  const statusStatusCounts = useMemo(() => {
    const m = new Map();
    for (const r of rows) { const lbl = deriveStatusInfo(r)[0]; m.set(lbl, (m.get(lbl) || 0) + 1); }
    return m;
  }, [rows]);
  const statusChips = useMemo(() => Array.from(statusStatusCounts.keys()), [statusStatusCounts]);
  const selectedStatuses = colFilters.status || [];
  const toggleStatusChip = (lbl) => {
    setColFilters((p) => {
      const cur = p.status || [];
      const next = cur.includes(lbl) ? cur.filter((v) => v !== lbl) : [...cur, lbl];
      const n = { ...p };
      if (next.length) n.status = next; else delete n.status;
      return n;
    });
  };

  const activeFilterCount = Object.values(colFilters).reduce((n, v) => n + (v?.length ? 1 : 0), 0);
  const hasAnyFilter = activeFilterCount > 0 || !!term;
  const clearAllFilters = () => { setColFilters({}); setQ(""); setSortState({ key: null, dir: "asc" }); };
  const [searchFocus, setSearchFocus] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);

  // ── Saran pencarian - dibangun dari nilai unik yg SUDAH ada di data
  //    (event, branch, MC, BME/RGE, site, alamat - field yg sama persis dgn
  //    yg dicocokkan searchFiltered di atas), difilter oleh ketikan saat
  //    ini, maks 8 item, tanpa duplikat. ─────────────────────────────────
  const searchSuggestions = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const pool = [];
    for (const r of rows) {
      if (r.event_name) pool.push({ label: r.event_name, kind: "Event" });
      const branch = branchMap[r.branch_id];
      if (branch) pool.push({ label: branch, kind: "Branch" });
      if (r.mc) pool.push({ label: r.mc, kind: "MC" });
      const creator = profileMap[r.created_by];
      if (creator) pool.push({ label: creator, kind: "BME/RGE" });
      if (r.site_id) pool.push({ label: r.site_id, kind: "Site" });
      if (r.address) pool.push({ label: r.address, kind: "Alamat" });
    }
    const seen = new Set();
    const out = [];
    for (const item of pool) {
      const key = `${item.kind}:${item.label}`;
      if (seen.has(key)) continue;
      if (!item.label.toLowerCase().includes(term)) continue;
      if (item.label.toLowerCase() === term) continue; // sudah persis diketik, tak perlu disarankan
      seen.add(key);
      out.push(item);
      if (out.length >= 8) break;
    }
    return out;
  }, [q, rows, branchMap, profileMap]);

  // ── Export .xlsx - PERSIS mengikuti hasil filter yang sedang aktif
  //    (search + semua kolom filter + urutan sort), bukan seluruh data
  //    mentah. Kolom numerik/ACV diekspor sbg angka (bukan teks "Rp…"/"%")
  //    supaya bisa langsung dipakai rumus di Excel.
  //    Catatan (2026-09):
  //    - Long/Lat DULU dibulatkan 2 desimal spt kolom uang/ACV lain -> data
  //      GPS jadi keliru sampai ratusan meter. Sekarang diekspor APA ADANYA
  //      (presisi penuh), tidak lewat pembulatan generik.
  //    - Kolom Documentation DULU cuma teks "N foto". Sekarang foto PERTAMA
  //      tiap activity di-embed langsung sbg thumbnail di sel-nya (pakai
  //      ExcelJS, bukan lib `xlsx` yg tidak bisa taruh gambar di cell) -
  //      supaya kelihatan langsung tanpa buka link satu-satu.
  const exportXlsx = useCallback(async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Activity Plan", { views: [{ state: "frozen", ySplit: 1 }] });

      ws.columns = COLUMNS.map((c) => ({
        header: c.label,
        width: Math.max(10, Math.round((c.width || 100) / 7)),
      }));
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).alignment = { vertical: "middle" };

      const docCol = COLUMNS.findIndex((c) => c.key === "documentation") + 1; // 1-based utk ExcelJS
      const THUMB_PX = 54;

      // Baris teks dulu (cepat, sinkron) - gambar ditempel belakangan per baris
      filteredRows.forEach((r, i) => {
        const rowValues = COLUMNS.map((c) => {
          if (c.key === "no") return i + 1;
          if (c.key === "documentation") return ""; // diisi gambar, bukan teks
          if (c.key === "long" || c.key === "lat") {
            const v = c.raw(r);
            return v == null ? "" : v; // presisi penuh, TIDAK dibulatkan
          }
          if (c.numeric && c.raw) {
            const v = c.raw(r);
            return v == null ? "" : Math.round(v * 100) / 100;
          }
          const v = c.get(r);
          return v === "-" ? "" : v;
        });
        ws.addRow(rowValues);
      });

      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: filteredRows.length + 1, column: COLUMNS.length } };

      // Ambil & tempel thumbnail foto pertama tiap activity yg punya dokumentasi.
      // Jalan paralel (Promise.allSettled) supaya 1 foto gagal load tidak
      // menggagalkan seluruh export.
      if (docCol > 0) {
        await Promise.allSettled(filteredRows.map(async (r, i) => {
          const path = docPhotoMap[r.id];
          if (!path) return;
          try {
            const url = photoUrl(path);
            const res = await fetch(url);
            if (!res.ok) return;
            const buffer = await res.arrayBuffer();
            const ext = (path.split(".").pop() || "jpeg").toLowerCase();
            const extension = ["png", "jpeg", "jpg", "gif"].includes(ext) ? (ext === "jpg" ? "jpeg" : ext) : "jpeg";
            const imageId = wb.addImage({ buffer, extension });
            const rowIdx = i + 1; // 0-based row index di bawah header (baris data ke-1 = index 1 di sheet)
            ws.getRow(rowIdx + 1).height = Math.max(ws.getRow(rowIdx + 1).height || 0, THUMB_PX * 0.78);
            ws.addImage(imageId, {
              tl: { col: docCol - 1 + 0.05, row: rowIdx + 0.05 },
              ext: { width: THUMB_PX, height: THUMB_PX },
              editAs: "oneCell",
            });
          } catch { /* lewati foto yg gagal diambil, baris lain tetap lanjut */ }
        }));
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `MartaHub_Activity_Plan_${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e.message || "Gagal export .xlsx");
    } finally {
      setExporting(false);
    }
  }, [COLUMNS, filteredRows, docPhotoMap]);

  const T_FILTER = { hi: T.hi, mid: T.mid, lo: T.lo, blue: T.primary, blueBg: T.primaryBg };

  return (
    <div>
      <style>{"@keyframes mh-spin { to { transform: rotate(360deg); } }"}</style>
      {!MARTA_CONFIGURED && (
        <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>
          Supabase MartaHub belum dikonfigurasi / project paused - data tampil kosong.
        </div>
      )}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      {showKpiConfig && <KpiConfigModal email={email} canEdit={scope?.role === "spm_sumatera"} onClose={() => setShowKpiConfig(false)} />}

      {/* KPI strip - pantauan cepat (dulu di menu "Activity Monitoring"
          terpisah), sekarang langsung di atas tabel Activity Plan supaya
          "pantau sekaligus lihat detail" bisa dalam satu layar. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(172px,1fr))", gap: 14, marginBottom: 18 }}>
        <Kpi label="Total SP Tervalidasi" value={<KpiRatio main={fmtInt(kpiStats.spTervalidasi)} suffix={` / ${fmtInt(kpiStats.spPengajuan)} pengajuan`} />}
          sub={<KpiSubRow icon={RefreshCw} label="Rebuy SP" value={fmtRp(kpiStats.actualRebuy)} />}
          icon={CardSim} color={T.success} />
        <Kpi label="Total FWA Tervalidasi" value={<KpiRatio main={fmtInt(kpiStats.fwaTervalidasi)} suffix={` / ${fmtInt(kpiStats.fwaPengajuan)} pengajuan`} />}
          sub={<KpiSubRow icon={RefreshCw} label="Rebuy FWA" value={fmtRp(kpiStats.actualRebuy)} />}
          icon={RouterIcon} color={T.success} />
        <Kpi label="Total Revenue" value={fmtRp(kpiStats.actualRev3m)}
          sub={<KpiSubRow label="Total Revenue (3M)" value={fmtRp(kpiStats.actualRev3m)} />}
          icon={Banknote} color={T.blue} />
        <Kpi label="Total Cost Actual" value={fmtRp(kpiStats.totalCostActual)}
          sub={<KpiSubRow label="Cost Ratio" value={kpiStats.costRatioPct == null ? "-" : `${kpiStats.costRatioPct}%`} />}
          icon={Wallet} color={T.warning} />
        <Kpi label="Laporan Actual" value={<KpiRatio main={String(kpiStats.actualSubmittedCount)} suffix={` / ${kpiStats.total} plan`} />}
          sub={<AchProdSubRow achievement={kpiStats.avgAchievement} productivity={kpiStats.avgProductivity}
            canConfig={scope?.role === "spm_sumatera"} onConfig={() => setShowKpiConfig(true)} />}
          icon={FileCheck2} color="#7C3AED" />
      </div>

      {/* Status quick-filter - chip ini & dropdown filter kolom "Status" di
          header tabel SALING TERHUBUNG (sama-sama nulis ke colFilters.status),
          jadi klik chip di sini otomatis kelihatan juga sebagai filter aktif
          di kolom Status, dan sebaliknya. Menggantikan chip serupa yang dulu
          cuma ada di halaman "Activity Monitoring" terpisah. */}
      {statusChips.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {statusChips.map((lbl) => {
            const on = selectedStatuses.includes(lbl);
            return (
              <button key={lbl} onClick={() => toggleStatusChip(lbl)} className="mh-btn"
                style={{ padding: "5px 13px", borderRadius: 100, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${on ? "transparent" : T.line}`,
                  background: on ? "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)" : "#fff",
                  color: on ? "#fff" : T.mid }}>
                {lbl} <span style={{ opacity: 0.75 }}>· {statusStatusCounts.get(lbl) || 0}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {/* Search - dibungkus div supaya bisa taruh ikon + tombol clear di
            dalam kotaknya sendiri, dgn ring fokus yg jelas (bukan <input>
            polos spt sebelumnya). */}
        <div style={{
          position: "relative", display: "flex", alignItems: "center", width: 360, maxWidth: "100%",
          background: "#fff", border: `1.5px solid ${searchFocus ? T.primary : T.line}`, borderRadius: 11,
          boxShadow: searchFocus ? `0 0 0 3px ${T.primaryBg}` : "0 1px 2px rgba(13,17,23,0.04)", transition: "border-color .15s, box-shadow .15s",
        }}>
          <Search size={15} color={searchFocus ? T.primary : T.lo} style={{ position: "absolute", left: 12, pointerEvents: "none" }} />
          <input
            value={q} onChange={(e) => { setQ(e.target.value); setShowSuggest(true); }}
            onFocus={() => { setSearchFocus(true); setShowSuggest(true); }}
            onBlur={() => { setSearchFocus(false); setTimeout(() => setShowSuggest(false), 120); }}
            onKeyDown={(e) => { if (e.key === "Escape") { setShowSuggest(false); e.currentTarget.blur(); } }}
            placeholder="Cari Activity Plan"
            style={{ width: "100%", padding: "9px 34px 9px 36px", border: "none", outline: "none", background: "transparent", fontSize: 13, color: T.hi, fontFamily: FONT, borderRadius: 11, boxSizing: "border-box" }}
          />
          {q && (
            <button onClick={() => { setQ(""); setShowSuggest(false); }} title="Bersihkan pencarian"
              style={{ position: "absolute", right: 8, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#F0F4FA", color: T.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={12} />
            </button>
          )}

          {showSuggest && searchSuggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30,
              background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12,
              boxShadow: "0 12px 32px rgba(13,17,23,0.14)", overflow: "hidden",
            }}>
              {searchSuggestions.map((sug, i) => (
                <div key={`${sug.kind}-${sug.label}-${i}`}
                  onMouseDown={(e) => { e.preventDefault(); setQ(sug.label); setShowSuggest(false); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    padding: "8px 12px", fontSize: 12.5, color: T.hi, cursor: "pointer",
                    borderTop: i > 0 ? `1px solid ${T.line}` : "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F7F9FC"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sug.label}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: T.lo, background: "#F0F4FA", padding: "2px 7px", borderRadius: 999, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>{sug.kind}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={load} disabled={loading} title="Muat ulang data"
          style={{ ...btn, opacity: loading ? 0.6 : 1, cursor: loading ? "default" : "pointer", color: T.mid, flexShrink: 0 }}>
          {loading ? <Loader2 size={13} style={{ animation: "mh-spin .8s linear infinite" }} /> : <RefreshCw size={13} />} Refresh
        </button>

        {scope && !scope.unscoped && scope.found && (
          <div style={{ fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", border: `1px solid ${T.line}`, borderRadius: 100, padding: "2px 10px" }}>
            Scope: {scope.region || "-"} · {brandLabel(scope.brand)}
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: T.mid }}>
            <b style={{ color: T.hi }}>{filteredRows.length}</b> dari {rows.length} plan
            {activeFilterCount > 0 && <span style={{ marginLeft: 6, fontWeight: 700, color: T.primary }}>· {activeFilterCount} filter aktif</span>}
          </div>

          <button onClick={clearAllFilters} disabled={!hasAnyFilter} title="Hapus pencarian & semua filter kolom"
            style={{ ...btn, opacity: hasAnyFilter ? 1 : 0.4, cursor: hasAnyFilter ? "pointer" : "default", color: T.mid }}>
            <RotateCcw size={13} /> Clear All Filter
          </button>

          <button onClick={exportXlsx} disabled={loading || exporting || filteredRows.length === 0} title="Export data sesuai filter yang sedang diterapkan"
            style={{ ...btn, opacity: (loading || exporting || filteredRows.length === 0) ? 0.5 : 1, cursor: (loading || exporting || filteredRows.length === 0) ? "default" : "pointer", background: "linear-gradient(135deg,#1E8E3E,#0F6B2C)", borderColor: "transparent", color: "#fff" }}>
            <Download size={13} /> {exporting ? "Menyiapkan file…" : "Export .xlsx"}
          </button>
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "72vh", overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
                {COLUMNS.map((col) => {
                  const isSorted = sortState.key === col.key;
                  const filterConfig = col.filter ? {
                    options: filterOptionsMap[col.key] || [],
                    selected: colFilters[col.key] || [],
                    onApply: (vals) => setColFilters((p) => ({ ...p, [col.key]: vals })),
                    onClear: () => setColFilters((p) => { const n = { ...p }; delete n[col.key]; return n; }),
                    sortDir: isSorted ? sortState.dir : null,
                    onSort: (dir) => setSortState({ key: col.key, dir }),
                  } : null;
                  return (
                    <th key={col.key} style={{ position: "sticky", top: 0, zIndex: 5, width: col.width, minWidth: col.width, padding: "9px 10px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", color: isSorted ? T.primary : T.mid, background: "#F7F9FC", borderBottom: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: col.key === "brand" ? "center" : "space-between", gap: 6 }}>
                        <span onClick={() => !col.filter && col.key !== "no" && setSortState((s) => ({ key: col.key, dir: s.key === col.key && s.dir === "asc" ? "desc" : "asc" }))}
                          style={{ overflow: "hidden", textOverflow: "ellipsis", cursor: col.key === "no" ? "default" : "pointer" }} title={col.label}>
                          {col.label}{isSorted && !col.filter ? (sortState.dir === "asc" ? " ▲" : " ▼") : ""}
                        </span>
                        {filterConfig && <ExcelFilter {...filterConfig} t={T_FILTER} d={false} />}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={COLUMNS.length} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && filteredRows.length === 0 && <tr><td colSpan={COLUMNS.length} style={{ padding: 26, textAlign: "center", color: T.lo }}>Tidak ada activity plan untuk filter saat ini.</td></tr>}
              {!loading && filteredRows.map((r, i) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)} style={{ borderTop: `1px solid ${T.line}`, cursor: "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F7F9FC"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  {COLUMNS.map((col) => {
                    if (col.key === "no") return <td key="no" style={{ padding: "8px 10px", color: T.lo, borderRight: `1px solid ${T.line}` }}>{i + 1}</td>;
                    if (col.badgeStatus) {
                      const st = deriveStatusInfo(r);
                      return <td key={col.key} style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}` }}><span style={{ fontSize: 10, fontWeight: 800, color: st[1], background: st[2], padding: "2px 8px", borderRadius: 999 }}>{st[0]}</span></td>;
                    }
                    if (col.badgeBrand) {
                      return <td key={col.key} style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}`, textAlign: "center" }}><div style={{ display: "flex", justifyContent: "center" }}><BrandBadge brand={r.brand} /></div></td>;
                    }
                    if (col.acv) {
                      const v = col.raw(r);
                      const good = v == null ? null : (col.invertGood ? v <= 100 : v >= 100);
                      return <td key={col.key} style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}`, fontWeight: 700, color: good == null ? T.mid : good ? T.success : T.warning }}>{col.get(r)}</td>;
                    }
                    if (col.key === "eventName") return <td key={col.key} title={r.event_name} style={{ padding: "8px 10px", fontWeight: 700, color: T.hi, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", borderRight: `1px solid ${T.line}` }}>{col.get(r)}</td>;
                    return <td key={col.key} style={{ padding: "8px 10px", color: T.mid, borderRight: `1px solid ${T.line}`, textAlign: col.numeric ? "right" : "left" }}>{col.get(r)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailId && (
        <ActivityDetailModal id={detailId} onClose={() => setDetailId(null)} email={email}
          canDelete={scope?.role === "spm_sumatera"}
          onDeleted={(deletedId) => setRows((prev) => prev.filter((r) => r.id !== deletedId))} />
      )}
    </div>
  );
}

/** Modal detail satu activity plan - dibuka dgn klik baris tabel. Padanan
 * desktop dari /martahub/m/activities/[id] (mobile) yang sudah lebih dulu
 * punya ini - ringkasan plan, target vs actual, site, foto dokumentasi,
 * daftar MSISDN, & riwayat pengajuan revisi, supaya admin/TMV/Head bisa
 * "tracking dengan mudah" tanpa perlu buka app Flutter/mobile-web terpisah. */
// Kartu ringkasan - dirancang "premium tapi minimalis": tanpa strip warna
// tebal/angka warna-warni yg ramai, aksen warna cuma di chip ikon (gradient
// halus + border tipis), angka utama SATU warna tinta gelap netral, shadow
// lembut berlapis (bukan garis tegas) + sedikit lift saat hover.
function KpiRatio({ main, suffix }) {
  return (
    <>
      {main}
      <span style={{ fontSize: 13, fontWeight: 600, color: T.lo, marginLeft: 4 }}>{suffix}</span>
    </>
  );
}

// Card gabungan Achievement + Productivity - dua nilai (rata2 achievement_pct
// & productivity_pct dari view mh_leaderboard_summary, discope ke BME yang
// muncul di filteredRows saat ini) plus tombol buka KpiConfigModal untuk
// atur bobot rumusnya (hanya SPM Sumatera yang boleh mengubah).
function AchProdSubRow({ achievement, productivity, canConfig, onConfig }) {
  const fmtPct = (v) => (v == null ? "-" : `${v.toFixed(0)}%`);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, fontWeight: 500, color: T.lo }}>
      <span>
        %ACH = <span style={{ color: T.mid, fontWeight: 700 }}>{fmtPct(achievement)}</span>
        {"  |  "}
        %PROD = <span style={{ color: T.mid, fontWeight: 700 }}>{fmtPct(productivity)}</span>
      </span>
      <button
        onClick={onConfig}
        title={canConfig ? "Konfigurasi rumus perhitungan" : "Lihat rumus perhitungan"}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          border: `1px solid ${T.line}`, background: "#fff", color: T.mid, cursor: "pointer",
        }}
      >
        <Settings2 size={11} />
      </button>
    </div>
  );
}

const KPI_CONFIG_FIELDS = [
  { group: "Komposisi Skor Akhir", keys: [
    { key: "w_achievement", label: "Achievement" },
    { key: "w_productivity", label: "Produktivitas" },
    { key: "w_geo", label: "Geo Compliance" },
  ] },
];
const KPI_CONFIG_DEFAULTS = { w_achievement: 0.6, w_productivity: 0.2, w_geo: 0.2 };

// Modal konfigurasi rumus Achievement & Productivity - baca/tulis langsung
// ke mh_settings.leaderboard_weights (key yang sama dipakai mh_leaderboard_summary
// & halaman Settings > Bobot Skor Leaderboard, supaya tidak ada 2 sumber rumus
// yang beda utk angka yang sama). Tiap metrik punya toggle on/off - off = bobot
// disimpan 0 (otomatis dikeluarkan dari rata2 tertimbang di view), tapi nilai
// bobot sebelumnya diingat di form supaya gampang dinyalakan lagi.
function KpiConfigModal({ email, canEdit, onClose }) {
  const [values, setValues] = useState(KPI_CONFIG_DEFAULTS);
  const [enabled, setEnabled] = useState(() => {
    const e = {};
    for (const g of KPI_CONFIG_FIELDS) for (const f of g.keys) e[f.key] = true;
    return e;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const { data, error } = await supabaseMarta.rpc("mh_get_settings");
        if (error) throw error;
        const w = { ...KPI_CONFIG_DEFAULTS, ...(data?.leaderboard_weights || {}) };
        if (!alive) return;
        setValues(w);
        const e = {};
        for (const g of KPI_CONFIG_FIELDS) for (const f of g.keys) e[f.key] = Number(w[f.key]) > 0;
        setEnabled(e);
      } catch (ex) { if (alive) setErr(ex.message || "Gagal memuat konfigurasi"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  function setField(key, raw) { setValues((s) => ({ ...s, [key]: raw })); }
  function toggle(key) {
    setEnabled((s) => {
      const next = !s[key];
      if (!next) setValues((v) => ({ ...v, [key]: 0 }));
      else setValues((v) => ({ ...v, [key]: v[key] && Number(v[key]) > 0 ? v[key] : (KPI_CONFIG_DEFAULTS[key] ?? 0.2) }));
      return { ...s, [key]: next };
    });
  }

  async function save() {
    const cleaned = {};
    for (const g of KPI_CONFIG_FIELDS) for (const f of g.keys) {
      const n = enabled[f.key] ? Number(values[f.key]) : 0;
      if (Number.isNaN(n) || n < 0) { setErr(`Bobot ${f.label} harus angka >= 0`); return; }
      cleaned[f.key] = n;
    }
    setSaving(true); setErr(""); setSaved(false);
    try {
      const { error } = await supabaseMarta.rpc("mh_set_setting", { p_key: "leaderboard_weights", p_value: cleaned, p_caller_email: email });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (ex) { setErr(ex.message || "Gagal menyimpan konfigurasi"); }
    finally { setSaving(false); }
  }

  const sumOf = (keys) => keys.reduce((acc, f) => acc + (enabled[f.key] ? (Number(values[f.key]) || 0) : 0), 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,12,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 18, boxShadow: "0 24px 64px rgba(13,17,23,0.22)" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: T.hi, letterSpacing: "-0.01em" }}>Konfigurasi Achievement & Produktivitas</div>
            <div style={{ fontSize: 11.5, color: T.lo, marginTop: 3 }}>Rumus ini berlaku global - dipakai juga oleh Leaderboard.</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "#F1F2F5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: "18px 22px" }}>
          {err && <div style={{ fontSize: 12, color: T.error, marginBottom: 12 }}>{err}</div>}
          {loading ? (
            <div style={{ color: T.lo, fontSize: 12.5 }}>Memuat…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {KPI_CONFIG_FIELDS.map((g) => (
                <div key={g.group}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                    <span>{g.group}</span>
                    <span style={{ color: Math.abs(sumOf(g.keys) - 1) < 0.001 ? T.success : T.warning }}>Total: {sumOf(g.keys).toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {g.keys.map((f) => (
                      <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, width: 130, fontSize: 12, color: T.mid, cursor: canEdit ? "pointer" : "default" }}>
                          <input type="checkbox" checked={enabled[f.key]} disabled={!canEdit} onChange={() => toggle(f.key)} />
                          {f.label}
                        </label>
                        <input
                          type="number" step="0.05" min="0" max="1"
                          value={values[f.key]}
                          disabled={!canEdit || !enabled[f.key]}
                          onChange={(e) => setField(f.key, e.target.value)}
                          style={{
                            flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.line}`,
                            fontSize: 12.5, fontFamily: FONT, color: T.hi,
                            background: (canEdit && enabled[f.key]) ? "#fff" : "#F0F2F5",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!canEdit && (
                <div style={{ fontSize: 11.5, color: T.lo, background: "#F7F8FA", padding: "10px 12px", borderRadius: 9 }}>
                  Hanya SPM Sumatera yang bisa mengubah rumus ini. Kamu bisa melihat konfigurasi saat ini di atas.
                </div>
              )}
              <div style={{ fontSize: 11.5, color: T.lo, lineHeight: 1.5, background: "#F7F8FA", padding: "10px 12px", borderRadius: 9 }}>
                <b>Achievement</b> = Total Actual Revenue ÷ Total Target Revenue × 100.<br/>
                <b>Produktivitas</b> = Total Actual Revenue ÷ Total Cost Actual × 100.<br/>
                <b>Geo Compliance</b> = % nomor MSISDN (SP/FWA) yang sudah divalidasi "Valid" terhadap site GA, dari menu Validasi MSISDN.<br/>
                Kedua rasio di atas tidak dibatasi (tidak di-cap 150%) - bobot di atas hanya menentukan komposisi Final Score.
              </div>
              {canEdit && (
                <div>
                  <button onClick={save} disabled={saving} style={{
                    padding: "9px 18px", borderRadius: 9, border: "none", fontSize: 12.5, fontWeight: 700,
                    background: saved ? T.success : T.primary, color: "#fff", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
                  }}>
                    {saving ? "..." : saved ? "Tersimpan" : "Simpan Konfigurasi"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiSubRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, fontWeight: 500, color: T.lo }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {Icon && <Icon size={10.5} strokeWidth={2.2} />}
        {label}
      </span>
      <span style={{ color: T.mid, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function Kpi({ label, value, sub, color, icon: Icon }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 16,
        padding: "17px 18px", boxShadow: hover
          ? "0 2px 4px rgba(13,17,23,0.05), 0 12px 26px rgba(13,17,23,0.07)"
          : "0 1px 2px rgba(13,17,23,0.03), 0 6px 16px rgba(13,17,23,0.035)",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "transform .18s ease, box-shadow .18s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {Icon && (
          <div style={{
            width: 34, height: 34, borderRadius: 11, flexShrink: 0,
            background: `linear-gradient(135deg, ${color}24, ${color}0a)`,
            border: `1px solid ${color}2b`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={16} color={color} strokeWidth={2.2} />
          </div>
        )}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: T.lo, textTransform: "uppercase" }}>{label}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: T.hi, lineHeight: 1, letterSpacing: "-0.01em" }}>{value}</div>
      {sub && (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px dashed ${T.line}`, display: "flex", flexDirection: "column", gap: 5 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const inp = { width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
const btn = { padding: "8px 13px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
