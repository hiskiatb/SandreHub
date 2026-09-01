"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { X, MapPin, Image as ImageIcon, Phone, FileText, Layers, Search, Download, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx";
import MartaShell, { T, FONT, brandLabel } from "../components/MartaShell";
import ExcelFilter from "../components/ExcelFilter";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";

const CAT_LABEL = {
  directSelling: "Direct Selling", jointEvent: "Join Event", openBooth: "Open Booth",
  project: "Project", sponsorship: "Sponsorship", thematic: "Thematic",
};
const STATUS = {
  draft: ["Draft", T.mid, "#eef1f6"], submitted: ["Planned", T.blue, T.blueBg],
  approved: ["Disetujui", T.success, T.successBg], rejected: ["Ditolak", T.error, T.errorBg],
  completed: ["Selesai", T.success, T.successBg], inProgress: ["Berlangsung", T.warning, T.warningBg],
  plan_submitted: ["Menunggu Approval", T.blue, T.blueBg], revision_needed: ["Revisi Plan", T.warning, T.warningBg],
  pending_validation: ["Menunggu Validasi", T.blue, T.blueBg], revision_actual: ["Revisi Report", T.warning, T.warningBg],
};

const fmtDate = (s) => {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};
const fmtInt = (n) => (n == null ? "-" : Number(n).toLocaleString("id-ID"));
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
const LIST_COLS = "id,event_name,brand,mc,branch_id,event_categories,event_category,plan_date_start,plan_date,actual_date,site_id,network_category,area_potential,poi_type,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,target_rev_3m,cost_estimate,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,actual_rev_3m,cost_actual,insight,checkin_valid,created_by,created_at";

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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [colFilters, setColFilters] = useState({});
  const [sortState, setSortState] = useState({ key: null, dir: "asc" });

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

      const [{ data: branches }, { data: profiles }] = await Promise.all([
        supabaseMarta.from("mh_branches").select("id, name"),
        supabaseMarta.from("mh_profiles").select("id, full_name"),
      ]);
      setBranchMap(Object.fromEntries((branches || []).map((b) => [b.id, b.name])));
      setProfileMap(Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name])));

      const ids = list.map((r) => r.id);
      if (ids.length) {
        const { data: docs } = await supabaseMarta.from("mh_documents").select("activity_id, file_type").in("activity_id", ids).eq("file_type", "photo");
        const counts = {};
        (docs || []).forEach((d) => { counts[d.activity_id] = (counts[d.activity_id] || 0) + 1; });
        setDocCountMap(counts);
      } else {
        setDocCountMap({});
      }
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  const cats = useCallback((r) => {
    const arr = Array.isArray(r.event_categories) && r.event_categories.length ? r.event_categories : (r.event_category ? [r.event_category] : []);
    if (!arr.length) return "-";
    return arr.map((c) => CAT_LABEL[c] || c).join(", ");
  }, []);

  // ── Definisi kolom - SATU sumber utk header, filter (kolom berlabel
  //    filter:true dapat dropdown ExcelFilter Excel-style), sort, dan render
  //    sel. Urutan PERSIS sesuai daftar kolom yang diminta. ─────────────────
  const COLUMNS = useMemo(() => [
    { key: "no", label: "No.", width: 46 },
    { key: "month", label: "Month", width: 118, filter: true, get: (r) => monthLabel(r.plan_date_start || r.plan_date) },
    { key: "brand", label: "Brand", width: 66, filter: true, get: (r) => brandLabel(r.brand), badgeBrand: true },
    { key: "branch", label: "Branch", width: 140, filter: true, get: (r) => branchMap[r.branch_id] || "-" },
    { key: "brandBranch", label: "Brand_Branch", width: 160, filter: true, get: (r) => `${brandLabel(r.brand)} - ${branchMap[r.branch_id] || "-"}` },
    { key: "mc", label: "Micro Cluster", width: 120, filter: true, get: (r) => r.mc || "-" },
    { key: "creator", label: "BME/RGE", width: 150, filter: true, get: (r) => profileMap[r.created_by] || "-" },
    { key: "planDate", label: "Plan Date", width: 100, filter: true, get: (r) => fmtDate(r.plan_date_start || r.plan_date), sortVal: (r) => r.plan_date_start || r.plan_date || "" },
    { key: "actualDate", label: "Actual Date", width: 100, filter: true, get: (r) => fmtDate(r.actual_date), sortVal: (r) => r.actual_date || "" },
    { key: "eventCategory", label: "Event Category", width: 160, filter: true, get: (r) => cats(r) },
    { key: "status", label: "Status", width: 150, filter: true, get: (r) => (STATUS[r.status] || [r.status])[0], badgeStatus: true },
    { key: "network", label: "Network Category", width: 130, filter: true, get: (r) => r.network_category || "-" },
    { key: "eventName", label: "Event Name", width: 230, filter: true, get: (r) => r.event_name || "-" },
    { key: "areaPotential", label: "Area Potential", width: 120, filter: true, get: (r) => r.area_potential || "-" },
    { key: "siteId", label: "Site ID", width: 100, filter: true, get: (r) => r.site_id || "-" },
    { key: "long", label: "Long", width: 90, filter: true, get: (r) => (r.longitude ?? "-"), raw: (r) => r.longitude, numeric: true },
    { key: "lat", label: "Lat", width: 90, filter: true, get: (r) => (r.latitude ?? "-"), raw: (r) => r.latitude, numeric: true },
    { key: "poi", label: "POI", width: 110, filter: true, get: (r) => r.poi_type || "-" },
    { key: "address", label: "Address", width: 240, filter: true, get: (r) => r.address || "-" },
    { key: "targetSp", label: "Target_SP", width: 92, filter: true, get: (r) => fmtInt(r.target_sp), raw: (r) => r.target_sp, numeric: true },
    { key: "targetFwa", label: "Target_FWA", width: 96, filter: true, get: (r) => fmtInt(r.target_fwa), raw: (r) => r.target_fwa, numeric: true },
    { key: "targetRebuy", label: "Target_Rebuy", width: 110, filter: true, get: (r) => fmtRp(rebuySum(r.target_rebuy_pulsa, r.target_rebuy_data)), raw: (r) => rebuySum(r.target_rebuy_pulsa, r.target_rebuy_data), numeric: true },
    { key: "targetRev", label: "Target_Rev (3M)", width: 130, filter: true, get: (r) => fmtRp(r.target_rev_3m), raw: (r) => r.target_rev_3m, numeric: true },
    { key: "costEstimate", label: "Cost Estimate", width: 120, filter: true, get: (r) => fmtRp(r.cost_estimate), raw: (r) => r.cost_estimate, numeric: true },
    { key: "actualSp", label: "Actual_SP", width: 92, filter: true, get: (r) => fmtInt(r.actual_sp), raw: (r) => r.actual_sp, numeric: true },
    { key: "actualFwa", label: "Actual_FWA", width: 96, filter: true, get: (r) => fmtInt(r.actual_fwa), raw: (r) => r.actual_fwa, numeric: true },
    { key: "actualRebuy", label: "Actual_Rebuy", width: 110, filter: true, get: (r) => fmtRp(rebuySum(r.actual_rebuy_pulsa, r.actual_rebuy_data)), raw: (r) => rebuySum(r.actual_rebuy_pulsa, r.actual_rebuy_data), numeric: true },
    { key: "actualRev", label: "Actual_Rev (3M)", width: 130, filter: true, get: (r) => fmtRp(r.actual_rev_3m), raw: (r) => r.actual_rev_3m, numeric: true },
    { key: "costActual", label: "Cost Actual", width: 120, filter: true, get: (r) => fmtRp(r.cost_actual), raw: (r) => r.cost_actual, numeric: true },
    { key: "acvSp", label: "Acv_SP", width: 84, filter: true, get: (r) => pctLabel(r.actual_sp, r.target_sp), raw: (r) => pctVal(r.actual_sp, r.target_sp), numeric: true, acv: true },
    { key: "acvFwa", label: "ACV_FWA", width: 84, filter: true, get: (r) => pctLabel(r.actual_fwa, r.target_fwa), raw: (r) => pctVal(r.actual_fwa, r.target_fwa), numeric: true, acv: true },
    { key: "acvRebuy", label: "ACV_Rebuy", width: 92, filter: true, get: (r) => pctLabel(rebuySum(r.actual_rebuy_pulsa, r.actual_rebuy_data), rebuySum(r.target_rebuy_pulsa, r.target_rebuy_data)), raw: (r) => pctVal(rebuySum(r.actual_rebuy_pulsa, r.actual_rebuy_data), rebuySum(r.target_rebuy_pulsa, r.target_rebuy_data)), numeric: true, acv: true },
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
      map[col.key] = uniq.map((v) => ({ value: v, label: v }));
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
    const geoTracked = filteredRows.filter((r) => r.checkin_valid !== null && r.checkin_valid !== undefined);
    const geoOk = geoTracked.filter((r) => r.checkin_valid === true).length;
    const withTarget = filteredRows.filter((r) => r.target_sp);
    const achSum = withTarget.reduce((s, r) => s + (r.actual_sp ?? 0), 0);
    const tgtSum = withTarget.reduce((s, r) => s + (r.target_sp ?? 0), 0);
    return {
      total,
      geoPct: geoTracked.length ? Math.round((geoOk / geoTracked.length) * 100) : null,
      geoN: geoTracked.length,
      achPct: tgtSum > 0 ? Math.round((achSum / tgtSum) * 100) : null,
    };
  }, [filteredRows]);

  const statusStatusCounts = useMemo(() => {
    const m = new Map();
    for (const r of rows) { const lbl = (STATUS[r.status] || [r.status])[0]; m.set(lbl, (m.get(lbl) || 0) + 1); }
    return m;
  }, [rows]);
  const statusChips = useMemo(() => Object.entries(STATUS).map(([, v]) => v[0]).filter((lbl, i, arr) => arr.indexOf(lbl) === i && statusStatusCounts.has(lbl)), [statusStatusCounts]);
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

  // ── Export .xlsx - PERSIS mengikuti hasil filter yang sedang aktif
  //    (search + semua kolom filter + urutan sort), bukan seluruh data
  //    mentah. Kolom numerik/ACV diekspor sbg angka (bukan teks "Rp…"/"%")
  //    supaya bisa langsung dipakai rumus di Excel. ──────────────────────
  const exportXlsx = useCallback(() => {
    const headers = COLUMNS.map((c) => c.label);
    const aoa = [headers, ...filteredRows.map((r, i) => COLUMNS.map((c) => {
      if (c.key === "no") return i + 1;
      if (c.numeric && c.raw) {
        const v = c.raw(r);
        return v == null ? "" : Math.round(v * 100) / 100;
      }
      const v = c.get(r);
      return v === "-" ? "" : v;
    }))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = COLUMNS.map((c) => ({ wch: Math.max(10, Math.round((c.width || 100) / 7)) }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: headers.length - 1 } }) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Activity Plan");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `MartaHub_Activity_Plan_${stamp}.xlsx`);
  }, [COLUMNS, filteredRows]);

  const T_FILTER = { hi: T.hi, mid: T.mid, lo: T.lo, blue: T.primary, blueBg: T.primaryBg };

  return (
    <div>
      {!MARTA_CONFIGURED && (
        <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>
          Supabase MartaHub belum dikonfigurasi / project paused - data tampil kosong.
        </div>
      )}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      {/* KPI strip - pantauan cepat (dulu di menu "Activity Monitoring"
          terpisah), sekarang langsung di atas tabel Activity Plan supaya
          "pantau sekaligus lihat detail" bisa dalam satu layar. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 }}>
        <Kpi label="Total Plan" value={String(kpiStats.total)} color={T.blue} />
        <Kpi label="Achievement %" value={kpiStats.achPct == null ? "-" : `${kpiStats.achPct}%`} color={T.success} />
        <Kpi label="Geo Compliance" value={kpiStats.geoPct == null ? "-" : `${kpiStats.geoPct}%`} sub={kpiStats.geoN ? `${kpiStats.geoN} tercatat` : "belum ada check-in"} color="#0D9488" />
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
          position: "relative", display: "flex", alignItems: "center", width: 320, maxWidth: "100%",
          background: "#fff", border: `1.5px solid ${searchFocus ? T.primary : T.line}`, borderRadius: 11,
          boxShadow: searchFocus ? `0 0 0 3px ${T.primaryBg}` : "none", transition: "border-color .15s, box-shadow .15s",
        }}>
          <Search size={15} color={searchFocus ? T.primary : T.lo} style={{ position: "absolute", left: 11, pointerEvents: "none" }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            onFocus={() => setSearchFocus(true)} onBlur={() => setSearchFocus(false)}
            placeholder="Cari event, branch, MC, BME/RGE, site, alamat…"
            style={{ width: "100%", padding: "9px 34px 9px 34px", border: "none", outline: "none", background: "transparent", fontSize: 13, color: T.hi, fontFamily: FONT, borderRadius: 11, boxSizing: "border-box" }}
          />
          {q && (
            <button onClick={() => setQ("")} title="Bersihkan pencarian"
              style={{ position: "absolute", right: 8, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#F0F4FA", color: T.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={12} />
            </button>
          )}
        </div>

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

          <button onClick={exportXlsx} disabled={loading || filteredRows.length === 0} title="Export data sesuai filter yang sedang diterapkan"
            style={{ ...btn, opacity: (loading || filteredRows.length === 0) ? 0.5 : 1, cursor: (loading || filteredRows.length === 0) ? "default" : "pointer", background: "linear-gradient(135deg,#1E8E3E,#0F6B2C)", borderColor: "transparent", color: "#fff" }}>
            <Download size={13} /> Export .xlsx
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
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
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
                      const st = STATUS[r.status] || [r.status, T.mid, "#eef1f6"];
                      return <td key={col.key} style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}` }}><span style={{ fontSize: 10, fontWeight: 800, color: st[1], background: st[2], padding: "2px 8px", borderRadius: 999 }}>{st[0]}</span></td>;
                    }
                    if (col.badgeBrand) {
                      return <td key={col.key} style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}` }}>{r.brand ? <span style={{ fontSize: 10.5, fontWeight: 800, color: String(r.brand).toLowerCase() === "tri" ? T.tri : T.im3 }}>{brandLabel(r.brand)}</span> : "-"}</td>;
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

      {detailId && <ActivityDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

/** Modal detail satu activity plan - dibuka dgn klik baris tabel. Padanan
 * desktop dari /martahub/m/activities/[id] (mobile) yang sudah lebih dulu
 * punya ini - ringkasan plan, target vs actual, site, foto dokumentasi,
 * daftar MSISDN, & riwayat pengajuan revisi, supaya admin/TMV/Head bisa
 * "tracking dengan mudah" tanpa perlu buka app Flutter/mobile-web terpisah. */
function ActivityDetailModal({ id, onClose }) {
  const [a, setA] = useState(null);
  const [extraSites, setExtraSites] = useState([]);
  const [siteNames, setSiteNames] = useState({});
  const [branchName, setBranchName] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [entries, setEntries] = useState([]);
  const [editReqs, setEditReqs] = useState([]);
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    let alive = true;
    setA(null); setErr(""); setPhotos([]); setEntries([]); setEditReqs([]); setExtraSites([]); setSiteNames({}); setBranchName(null);
    (async () => {
      try {
        const [{ data: act, error: e1 }, { data: sites }, { data: docs }, { data: sales }, { data: edits }] = await Promise.all([
          supabaseMarta.from("mh_activities").select(DETAIL_COLS).eq("id", id).single(),
          supabaseMarta.from("mh_activity_sites").select("site_id, is_primary").eq("activity_id", id).eq("is_primary", false),
          supabaseMarta.from("mh_documents").select("id, storage_path, file_type, created_at").eq("activity_id", id).order("created_at"),
          supabaseMarta.from("mh_dsf_sales_entries").select("id, category, msisdn, validation_status").eq("activity_id", id).order("created_at"),
          supabaseMarta.from("mh_activity_edit_requests").select("id, status, reason, requested_by_name, decided_by_name, decision_notes, created_at, decided_at").eq("activity_id", id).order("created_at", { ascending: false }),
        ]);
        if (e1) throw e1;
        if (!alive) return;
        setA(act);
        setExtraSites((sites || []).map((s) => s.site_id));
        setEntries(sales || []);
        setEditReqs(edits || []);
        setPhotos((docs || []).filter((d) => d.file_type === "photo").map((d) => ({ ...d, url: photoUrl(d.storage_path) })));

        const allSiteIds = Array.from(new Set([act?.site_id, ...(sites || []).map((s) => s.site_id)].filter(Boolean)));
        if (allSiteIds.length > 0) {
          const { data: siteRows } = await supabaseMarta.from("mh_sites").select("site_id,site_name").in("site_id", allSiteIds);
          const map = {};
          (siteRows || []).forEach((s) => { map[s.site_id] = s.site_name; });
          if (alive) setSiteNames(map);
        }
        if (act?.branch_id) {
          const { data: b } = await supabaseMarta.from("mh_branches").select("name").eq("id", act.branch_id).maybeSingle();
          if (alive) setBranchName(b?.name || null);
        }
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat detail aktivitas");
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const st = a ? (STATUS[a.status] || [a.status, T.mid, "#eef1f6"]) : null;
  const categories = a ? (Array.isArray(a.event_categories) && a.event_categories.length ? a.event_categories : (a.event_category ? [a.event_category] : [])) : [];
  const spEntries = entries.filter((e) => e.category === "sp");
  const fwaEntries = entries.filter((e) => e.category === "fwa");

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 680, maxHeight: "88vh", background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {!a && !err ? (
          <div style={{ padding: 40, textAlign: "center", color: T.lo }}>Memuat…</div>
        ) : err ? (
          <div style={{ padding: 20 }}>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{err}</div>
            <button onClick={onClose} style={{ ...btn, marginTop: 14 }}>Tutup</button>
          </div>
        ) : (
          <>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                {a.brand && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: String(a.brand).toLowerCase() === "tri" ? T.tri : T.im3 }}>
                    {brandLabel(a.brand)}
                  </span>
                )}
                <div style={{ marginTop: 3, fontSize: 17, fontWeight: 800, color: T.hi }}>{a.event_name || "-"}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: T.lo }}>Dibuat {a.created_at ? new Date(a.created_at).toLocaleString("id-ID") : "-"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: st[1], background: st[2], padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{st[0]}</span>
                <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "#F0F4FA", color: T.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={14} /></button>
              </div>
            </div>

            <div style={{ padding: "16px 20px", overflowY: "auto" }}>
              {categories.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {categories.map((c, i) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", borderRadius: 999, padding: "3px 10px" }}>{CAT_LABEL[c] || c}</span>
                  ))}
                </div>
              )}

              {(a.validation_note || a.override_note || a.approval_notes) && (
                <div style={{ marginBottom: 14, padding: "10px 13px", borderRadius: 10, background: st[2], color: st[1], fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                  {a.validation_note || a.override_note || a.approval_notes}
                </div>
              )}

              <DetailSection title="Informasi Plan">
                <KVGrid>
                  <KV label="Branch" value={branchName || "-"} />
                  <KV label="Micro Cluster" value={a.mc || "-"} />
                  <KV label="Tanggal" value={planDateLabel(a)} />
                  <KV label="Waktu" value={a.is_all_day === false && a.start_time && a.end_time ? `${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)}` : "Seharian"} />
                  <KV label="POI" value={a.poi_type || "-"} />
                  <KV label="Kekuatan Sinyal" value={a.network_category || "-"} />
                  <KV label="Potensi Area" value={a.area_potential || "-"} />
                  {a.address && <KV label="Alamat" value={a.address} span2 />}
                </KVGrid>
              </DetailSection>

              {a.site_id && (
                <DetailSection title={`Site (${extraSites.length + 1})`} icon={<Layers size={13} />}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12.5, color: T.hi }}><b>Utama:</b> {a.site_id}{siteNames[a.site_id] ? ` · ${siteNames[a.site_id]}` : ""}</div>
                    {extraSites.map((s, i) => (
                      <div key={s} style={{ fontSize: 12.5, color: T.hi }}><b>Site {i + 2}:</b> {s}{siteNames[s] ? ` · ${siteNames[s]}` : ""}</div>
                    ))}
                  </div>
                </DetailSection>
              )}

              <DetailSection title="Target vs Actual">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead><tr style={{ color: T.mid, textAlign: "left" }}>
                      {["Metrik", "Target", "Actual"].map((h) => <th key={h} style={{ padding: "4px 10px 4px 0", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      <MetricRow label="SP" target={fmtInt(a.target_sp)} actual={entries.length ? fmtInt(spEntries.filter((e) => e.validation_status === "valid").length) : fmtInt(a.actual_sp)} />
                      <MetricRow label="FWA" target={fmtInt(a.target_fwa)} actual={entries.length ? fmtInt(fwaEntries.filter((e) => e.validation_status === "valid").length) : fmtInt(a.actual_fwa)} />
                      <MetricRow label="Rebuy Pulsa" target={fmtRp(a.target_rebuy_pulsa)} actual={fmtRp(a.actual_rebuy_pulsa)} />
                      <MetricRow label="Rebuy Data" target={fmtRp(a.target_rebuy_data)} actual={fmtRp(a.actual_rebuy_data)} />
                      <MetricRow label="Revenue 3 Bulan" target={fmtRp(a.target_rev_3m)} actual={fmtRp(a.actual_rev_3m)} />
                      <MetricRow label="Cost" target={fmtRp(a.cost_estimate)} actual={fmtRp(a.cost_actual)} />
                    </tbody>
                  </table>
                </div>
                {a.insight && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.lo, textTransform: "uppercase", marginBottom: 4 }}>Insight</div>
                    <div style={{ fontSize: 12.5, color: T.hi, lineHeight: 1.55 }}>{a.insight}</div>
                  </div>
                )}
              </DetailSection>

              {a.checkin_at && (
                <DetailSection title="Check In" icon={<MapPin size={13} />}>
                  <KVGrid>
                    <KV label="Status" value={a.checkin_valid ? "Valid (dalam radius)" : "Di luar radius"} valueColor={a.checkin_valid ? T.success : T.error} />
                    {a.checkin_distance != null && <KV label="Jarak" value={`${Math.round(a.checkin_distance)} meter`} />}
                    <KV label="Waktu" value={new Date(a.checkin_at).toLocaleString("id-ID")} span2 />
                  </KVGrid>
                </DetailSection>
              )}

              {photos.length > 0 && (
                <DetailSection title={`Dokumentasi Foto (${photos.length})`} icon={<ImageIcon size={13} />}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {photos.map((p) => (
                      <button key={p.id} onClick={() => setLightbox(p.url)}
                        style={{ padding: 0, border: "none", cursor: "pointer", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#F0F4FA" }}>
                        <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </button>
                    ))}
                  </div>
                </DetailSection>
              )}

              {(spEntries.length > 0 || fwaEntries.length > 0) && (
                <DetailSection title="Nomor Terdaftar" icon={<Phone size={13} />}>
                  {spEntries.length > 0 && <MsisdnList label={`SP (${spEntries.length})`} list={spEntries} />}
                  {fwaEntries.length > 0 && <MsisdnList label={`FWA (${fwaEntries.length})`} list={fwaEntries} />}
                </DetailSection>
              )}

              {editReqs.length > 0 && (
                <DetailSection title="Riwayat Pengajuan Revisi" icon={<FileText size={13} />}>
                  {editReqs.map((r) => (
                    <div key={r.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.hi }}>{r.requested_by_name || "-"}</div>
                        {badge(
                          r.status === "approved" ? "Disetujui" : r.status === "rejected" ? "Ditolak" : "Menunggu",
                          r.status === "approved" ? T.success : r.status === "rejected" ? T.error : T.warning,
                          r.status === "approved" ? T.successBg : r.status === "rejected" ? T.errorBg : T.warningBg
                        )}
                      </div>
                      {r.reason && <div style={{ marginTop: 3, fontSize: 11.5, color: T.lo }}>{r.reason}</div>}
                      <div style={{ marginTop: 3, fontSize: 10.5, color: T.lo }}>{new Date(r.created_at).toLocaleString("id-ID")}</div>
                      {r.decision_notes && (
                        <div style={{ marginTop: 5, fontSize: 11.5, color: T.mid, background: "#F7F9FC", borderRadius: 8, padding: "6px 9px" }}>
                          {r.decided_by_name ? `${r.decided_by_name}: ` : ""}{r.decision_notes}
                        </div>
                      )}
                    </div>
                  ))}
                </DetailSection>
              )}

              {(a.approved_by_name || a.override_by_name) && (
                <DetailSection title="Persetujuan">
                  <KVGrid>
                    {a.approved_by_name && <KV label="Disetujui oleh" value={a.approved_by_name} />}
                    {a.approved_at && <KV label="Tanggal" value={new Date(a.approved_at).toLocaleString("id-ID")} />}
                    {a.override_by_name && <KV label="Override oleh" value={a.override_by_name} />}
                  </KVGrid>
                </DetailSection>
              )}
            </div>
          </>
        )}
      </div>

      {lightbox && (
        <div onClick={(e) => { e.stopPropagation(); setLightbox(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

function planDateLabel(a) {
  if (a.plan_dates_multi) {
    const parts = a.plan_dates_multi.split(",").filter(Boolean);
    return `${parts.length} tanggal (${fmtDate(parts[0])}${parts.length > 1 ? ` – ${fmtDate(parts[parts.length - 1])}` : ""})`;
  }
  if (a.plan_date_start && a.plan_date_end) return `${fmtDate(a.plan_date_start)} – ${fmtDate(a.plan_date_end)}`;
  return fmtDate(a.plan_date);
}

function DetailSection({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        {icon}
        <div style={{ fontSize: 11, fontWeight: 800, color: T.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function KVGrid({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>{children}</div>;
}

function KV({ label, value, valueColor, span2 }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, gridColumn: span2 ? "1 / -1" : "auto" }}>
      <span style={{ fontSize: 12, color: T.lo }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor || T.hi, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function MetricRow({ label, target, actual }) {
  return (
    <tr style={{ borderTop: `1px solid ${T.line}` }}>
      <td style={{ padding: "6px 10px 6px 0", color: T.hi, fontWeight: 600 }}>{label}</td>
      <td style={{ padding: "6px 10px 6px 0", color: T.mid }}>{target}</td>
      <td style={{ padding: "6px 10px 6px 0", color: T.hi, fontWeight: 700 }}>{actual}</td>
    </tr>
  );
}

function MsisdnList({ label, list }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.lo, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {list.map((e) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.hi, fontVariantNumeric: "tabular-nums" }}>{e.msisdn}</span>
          {e.validation_status === "valid"
            ? badge("Valid", T.success, T.successBg)
            : e.validation_status === "pending"
              ? badge("Menunggu Validasi", T.warning, T.warningBg)
              : badge(e.validation_status || "-", T.error, T.errorBg)}
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ ...card, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: T.lo, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: T.lo, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const inp = { width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
const btn = { padding: "8px 13px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
const badge = (txt, c, bg) => <span style={{ fontSize: 10.5, fontWeight: 800, color: c, background: bg, border: `1px solid ${c}33`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{txt}</span>;
