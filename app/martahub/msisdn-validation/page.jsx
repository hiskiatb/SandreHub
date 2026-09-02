"use client";
// Menu "Validasi MSISDN" - tabel tersentralisasi semua nomor MSISDN (SP & FWA)
// dari SELURUH activity (mh_dsf_sales_entries), tempat SPM Sumatera memvalidasi
// tiap nomor terhadap site GA. Hasil validasi (validation_status) ini yang
// dipakai sebagai "Geo Compliance" baru di skor Achievement/Productivity
// (lihat mh_leaderboard_summary) - menggantikan definisi lama yang berbasis
// radius check-in.
//
// TIDAK ADA status "Ditolak" - yang ada cuma 2 sinyal ketidakcocokan yang
// ditampilkan sbg kolom terpisah: GA Site tidak sesuai (dibanding Site ID
// Activity Plan - INI yang menentukan Valid/Menunggu) dan Org ID tidak sesuai
// (dibanding org_id submission asli - cuma info, tidak memblokir validasi).
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CheckCircle2, Clock, Loader2, RefreshCw, Search, Download, Upload, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx";
import MartaShell, { T, FONT, brandLabel } from "../components/MartaShell";
import ExcelFilter from "../components/ExcelFilter";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";

const TEMPLATE_HEADERS = ["MSISDN", "ORG_ID", "SITE_ID_GA"];

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  ws["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Validasi MSISDN");
  XLSX.writeFile(wb, "template_validasi_msisdn.xlsx");
}

function normMsisdn(v) {
  return String(v ?? "").replace(/[^0-9]/g, "").replace(/^0/, "62");
}
const norm = (v) => String(v ?? "").trim().toLowerCase();

const STATUS_TABS = [
  { key: "pending", label: "Menunggu Validasi" },
  { key: "valid", label: "Valid" },
  { key: "all", label: "Semua" },
];
const STATUS_STYLE = {
  pending: { bg: T.warningBg, fg: T.warning, icon: Clock, label: "Menunggu" },
  valid: { bg: "#E7F7EE", fg: T.success, icon: CheckCircle2, label: "Valid" },
};
function statusStyleOf(status) { return STATUS_STYLE[status] || STATUS_STYLE.pending; }

function MatchBadge({ ok, unknown }) {
  if (unknown) return <span style={{ color: T.lo, fontSize: 11 }}>-</span>;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 700,
      background: ok ? "#E7F7EE" : T.errorBg, color: ok ? T.success : T.error,
    }}>
      {ok ? "Sesuai" : "Tidak Sesuai"}
    </span>
  );
}

export default function MsisdnValidationPage() {
  return (
    <MartaShell active="msisdn-validation" title="Validasi MSISDN" subtitle="Rekonsiliasi nomor MSISDN SP/FWA dari semua Activity Plan terhadap site GA - hasilnya jadi Geo Compliance di skor Achievement/Productivity.">
      {(ctx) => <Body email={ctx?.session?.user?.email} role={ctx?.profile?.role} />}
    </MartaShell>
  );
}

function Body({ email, role }) {
  const canValidate = role === "spm_sumatera";
  const [entries, setEntries] = useState([]);
  const [activityMap, setActivityMap] = useState({});
  const [profileMap, setProfileMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("pending");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [colFilters, setColFilters] = useState({});
  const [sortState, setSortState] = useState({ key: null, dir: "asc" });
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data: rows, error } = await supabaseMarta
        .from("mh_dsf_sales_entries")
        .select("id, activity_id, msisdn, category, imei, org_id, validation_status, matched_org_id, ga_site_id, submitted_by_name, submitted_at, reconciled_by_name, reconciled_at, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw new Error(error.message);
      const list = rows || [];
      setEntries(list);

      const actIds = Array.from(new Set(list.map((r) => r.activity_id).filter(Boolean)));
      if (actIds.length) {
        const { data: acts } = await supabaseMarta.from("mh_activities").select("id, event_name, brand, site_id, bme_user_id").in("id", actIds);
        setActivityMap(Object.fromEntries((acts || []).map((a) => [a.id, a])));
        const bmeIds = Array.from(new Set((acts || []).map((a) => a.bme_user_id).filter(Boolean)));
        if (bmeIds.length) {
          const { data: profiles } = await supabaseMarta.from("mh_profiles").select("id, full_name").in("id", bmeIds);
          setProfileMap(Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name])));
        }
      } else {
        setActivityMap({}); setProfileMap({});
      }
    } catch (e) { setErr(e.message || "Gagal memuat data"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const COLUMNS = useMemo(() => [
    { key: "no", label: "No.", width: 44 },
    { key: "msisdn", label: "MSISDN", width: 130, filter: true, get: (e) => e.msisdn || "-" },
    { key: "category", label: "Kategori", width: 90, filter: true, get: (e) => String(e.category || "-").toUpperCase() },
    { key: "event", label: "Event", width: 200, filter: true, get: (e) => activityMap[e.activity_id]?.event_name || "-" },
    { key: "planSite", label: "Site ID (Plan)", width: 120, filter: true, get: (e) => activityMap[e.activity_id]?.site_id || "-" },
    { key: "gaSite", label: "Site ID (GA)", width: 120, filter: true, get: (e) => e.ga_site_id || "-" },
    { key: "siteMatch", label: "GA Site", width: 110, filter: true, get: (e) => {
        const plan = norm(activityMap[e.activity_id]?.site_id), ga = norm(e.ga_site_id);
        if (!ga) return "-"; return plan && ga === plan ? "Sesuai" : "Tidak Sesuai";
      } },
    { key: "orgId", label: "Org ID (Submit)", width: 120, filter: true, get: (e) => e.org_id || "-" },
    { key: "matchedOrgId", label: "Org ID (GA)", width: 120, filter: true, get: (e) => e.matched_org_id || "-" },
    { key: "orgMatch", label: "Org ID", width: 100, filter: true, get: (e) => {
        const a = norm(e.org_id), b = norm(e.matched_org_id);
        if (!a || !b) return "-"; return a === b ? "Sesuai" : "Tidak Sesuai";
      } },
    { key: "bme", label: "BME/RGE", width: 150, filter: true, get: (e) => profileMap[activityMap[e.activity_id]?.bme_user_id] || "-" },
    { key: "status", label: "Status", width: 100, filter: true, get: (e) => statusStyleOf(e.validation_status).label },
    { key: "aksi", label: "Aksi", width: 100 },
  ], [activityMap, profileMap]);

  const FILTER_COLS = useMemo(() => COLUMNS.filter((c) => c.filter), [COLUMNS]);

  const tabFiltered = useMemo(() => {
    return entries.filter((e) => tab === "all" || (e.validation_status || "pending") === tab);
  }, [entries, tab]);

  const searchFiltered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return tabFiltered;
    return tabFiltered.filter((e) => COLUMNS.filter((c) => c.get).some((c) => String(c.get(e)).toLowerCase().includes(term)));
  }, [tabFiltered, q, COLUMNS]);

  const filterOptionsMap = useMemo(() => {
    const map = {};
    for (const col of FILTER_COLS) {
      let list = searchFiltered;
      for (const oc of FILTER_COLS) {
        if (oc.key === col.key) continue;
        const sel = colFilters[oc.key];
        if (sel && sel.length) list = list.filter((e) => sel.includes(oc.get(e)));
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
      if (sel && sel.length) list = list.filter((e) => sel.includes(col.get(e)));
    }
    if (sortState.key) {
      const col = COLUMNS.find((c) => c.key === sortState.key);
      if (col?.get) {
        list = [...list].sort((a, b) => {
          const va = col.get(a), vb = col.get(b);
          const cmp = String(va).localeCompare(String(vb), "id", { numeric: true });
          return sortState.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [searchFiltered, colFilters, FILTER_COLS, sortState, COLUMNS]);

  const activeFilterCount = Object.values(colFilters).filter((v) => v && v.length).length;
  const clearAllFilters = () => { setColFilters({}); setQ(""); };

  const counts = useMemo(() => {
    const c = { pending: 0, valid: 0, all: entries.length };
    for (const e of entries) { const k = e.validation_status || "pending"; c[k] = (c[k] || 0) + 1; }
    return c;
  }, [entries]);

  async function setStatus(entryId, status) {
    if (!canValidate) return;
    setBusyId(entryId);
    try {
      const { error } = await supabaseMarta.rpc("mh_validate_msisdn_entry", { p_entry_id: entryId, p_status: status, p_caller_email: email });
      if (error) throw new Error(error.message);
      setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, validation_status: status, reconciled_by_name: "kamu", reconciled_at: new Date().toISOString() } : e)));
    } catch (e) { setErr(e.message || "Gagal menyimpan validasi"); }
    finally { setBusyId(null); }
  }

  async function handleUploadFile(file) {
    if (!canValidate || !file) return;
    setUploading(true); setErr(""); setUploadSummary(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const byMsisdn = new Map();
      for (const e of entries) byMsisdn.set(normMsisdn(e.msisdn), e);

      let validCount = 0, mismatchCount = 0, notFoundCount = 0;
      for (const row of rows) {
        const msisdnRaw = row.MSISDN ?? row.msisdn ?? row.Msisdn;
        const orgId = String(row.ORG_ID ?? row.org_id ?? "").trim() || null;
        const siteIdGa = String(row.SITE_ID_GA ?? row.site_id_ga ?? row.SITE_ID ?? "").trim() || null;
        if (!msisdnRaw) continue;
        const entry = byMsisdn.get(normMsisdn(msisdnRaw));
        if (!entry) { notFoundCount++; continue; }
        const act = activityMap[entry.activity_id];
        const planSiteId = String(act?.site_id || "").trim();
        const isMatch = siteIdGa && planSiteId && siteIdGa.toLowerCase() === planSiteId.toLowerCase();
        const status = isMatch ? "valid" : "pending";
        const note = isMatch ? null : `Upload: Site ID GA "${siteIdGa || "-"}" tidak sesuai dgn plan "${planSiteId || "-"}"`;
        const { error } = await supabaseMarta.rpc("mh_validate_msisdn_entry", {
          p_entry_id: entry.id, p_status: status, p_matched_org_id: orgId, p_ga_site_id: siteIdGa, p_note: note, p_caller_email: email,
        });
        if (error) { notFoundCount++; continue; }
        if (isMatch) validCount++; else mismatchCount++;
      }
      setUploadSummary({ valid: validCount, mismatch: mismatchCount, notFound: notFoundCount });
      await load();
    } catch (e) { setErr(e.message || "Gagal memproses file upload"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const T_FILTER = { hi: T.hi, mid: T.mid, lo: T.lo, blue: T.primary, blueBg: T.primaryBg };

  return (
    <div>
      {!MARTA_CONFIGURED && (
        <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>
          Supabase MartaHub belum dikonfigurasi - data tampil kosong.
        </div>
      )}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}
      {!canValidate && (
        <div style={{ ...card, marginBottom: 16, fontSize: 12.5, color: T.mid }}>
          Kamu bisa melihat & memfilter daftar ini, tapi hanya SPM Sumatera yang bisa menandai Valid.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, background: "#F1F2F5", padding: 4, borderRadius: 10 }}>
          {STATUS_TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "7px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: tab === t.key ? "#fff" : "transparent", color: tab === t.key ? T.hi : T.mid,
              boxShadow: tab === t.key ? "0 1px 3px rgba(13,17,23,0.12)" : "none",
            }}>
              {t.label} <span style={{ color: T.lo, fontWeight: 600 }}>({counts[t.key] || 0})</span>
            </button>
          ))}
        </div>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} color={T.lo} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari MSISDN / event / site / BME"
            style={{ width: "100%", padding: "9px 12px 9px 32px", borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 12.5, fontFamily: FONT, background: "#fff" }} />
        </div>
        <button onClick={clearAllFilters} disabled={!activeFilterCount && !q} title="Hapus pencarian & semua filter kolom"
          style={{ ...btn, opacity: (activeFilterCount || q) ? 1 : 0.4, cursor: (activeFilterCount || q) ? "pointer" : "default" }}>
          <RotateCcw size={13} /> Clear Filter
        </button>
        <button onClick={load} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 12.5, fontWeight: 700, cursor: loading ? "default" : "pointer" }}>
          {loading ? <Loader2 size={14} style={{ animation: "mh-spin .8s linear infinite" }} /> : <RefreshCw size={14} />} Muat ulang
        </button>
        <button onClick={downloadTemplate}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <Download size={14} /> Download Template
        </button>
        {canValidate && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleUploadFile(e.target.files[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 9, border: "none", background: T.primary, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.7 : 1 }}>
              {uploading ? <Loader2 size={14} style={{ animation: "mh-spin .8s linear infinite" }} /> : <Upload size={14} />} Upload Hasil Validasi
            </button>
          </>
        )}
        <div style={{ fontSize: 12, color: T.mid }}>
          <b style={{ color: T.hi }}>{filteredRows.length}</b> dari {tabFiltered.length}
          {activeFilterCount > 0 && <span style={{ marginLeft: 6, fontWeight: 700, color: T.primary }}>· {activeFilterCount} filter aktif</span>}
        </div>
      </div>
      <style>{"@keyframes mh-spin { to { transform: rotate(360deg); } }"}</style>

      {uploadSummary && (
        <div style={{ ...card, marginBottom: 16, fontSize: 12.5, color: T.mid, display: "flex", gap: 18, flexWrap: "wrap" }}>
          <span><b style={{ color: T.success }}>{uploadSummary.valid}</b> jadi Valid (site ID cocok)</span>
          <span><b style={{ color: T.warning }}>{uploadSummary.mismatch}</b> tetap Menunggu (site ID belum cocok)</span>
          {uploadSummary.notFound > 0 && <span><b style={{ color: T.error }}>{uploadSummary.notFound}</b> MSISDN tidak ditemukan/gagal</span>}
        </div>
      )}

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
                        <span onClick={() => col.get && !col.filter && setSortState((s) => ({ key: col.key, dir: s.key === col.key && s.dir === "asc" ? "desc" : "asc" }))}
                          style={{ overflow: "hidden", textOverflow: "ellipsis", cursor: col.get ? "pointer" : "default" }} title={col.label}>
                          {col.label}
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
              {!loading && filteredRows.length === 0 && <tr><td colSpan={COLUMNS.length} style={{ padding: 26, textAlign: "center", color: T.lo }}>Tidak ada data untuk filter saat ini.</td></tr>}
              {!loading && filteredRows.map((e, i) => {
                const act = activityMap[e.activity_id];
                const st = statusStyleOf(e.validation_status);
                const StIcon = st.icon;
                const planSite = norm(act?.site_id), gaSite = norm(e.ga_site_id);
                const siteKnown = !!gaSite;
                const siteOk = siteKnown && planSite === gaSite;
                const orgA = norm(e.org_id), orgB = norm(e.matched_org_id);
                const orgKnown = !!orgA && !!orgB;
                const orgOk = orgKnown && orgA === orgB;
                return (
                  <tr key={e.id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ padding: "8px 10px", color: T.lo, borderRight: `1px solid ${T.line}` }}>{i + 1}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: T.hi, borderRight: `1px solid ${T.line}` }}>{e.msisdn || "-"}</td>
                    <td style={{ padding: "8px 10px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{String(e.category || "-").toUpperCase()}</td>
                    <td style={{ padding: "8px 10px", color: T.mid, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", borderRight: `1px solid ${T.line}` }}>{act?.event_name || "-"}</td>
                    <td style={{ padding: "8px 10px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{act?.site_id || "-"}</td>
                    <td style={{ padding: "8px 10px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{e.ga_site_id || "-"}</td>
                    <td style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}` }}><MatchBadge ok={siteOk} unknown={!siteKnown} /></td>
                    <td style={{ padding: "8px 10px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{e.org_id || "-"}</td>
                    <td style={{ padding: "8px 10px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{e.matched_org_id || "-"}</td>
                    <td style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}` }}><MatchBadge ok={orgOk} unknown={!orgKnown} /></td>
                    <td style={{ padding: "8px 10px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{profileMap[act?.bme_user_id] || "-"}</td>
                    <td style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}` }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: st.bg, color: st.fg }}>
                        <StIcon size={11} /> {st.label}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {canValidate ? (
                        <button onClick={() => setStatus(e.id, "valid")} disabled={busyId === e.id || e.validation_status === "valid"}
                          style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: T.success, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: e.validation_status === "valid" ? 0.5 : 1 }}>
                          Valid
                        </button>
                      ) : <span style={{ color: T.lo, fontSize: 11 }}>-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const card = { background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: 16 };
const btn = { display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 12.5, fontWeight: 700 };
