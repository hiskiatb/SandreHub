"use client";
// Menu "POSMAT Stock" - Plan POSM (Register Installment Plan). Jenis
// Material, Stok & Mutasi, dan Validity MSISDN sudah dihapus dari CMS ini
// atas permintaan user (2026-08-31) - RPC & tabel DB-nya tidak disentuh,
// yang dihapus cuma UI-nya di halaman ini.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Package, ArrowLeft, Plus, Pencil, AlertTriangle, Loader2, Upload, Download, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import MartaShell, { T } from "../components/MartaShell";
import ExcelFilter from "../components/ExcelFilter";
import supabaseMarta from "../../../lib/supabaseMarta";
import { getMartaScope } from "../../../lib/martaScope";

const CAN_MANAGE_ROLES = ["head", "tmv", "spm_sumatera", "admin"];
const brandLabel = (b) => (b === "tri" ? "3ID" : b === "im3" ? "IM3" : String(b || "-").toUpperCase());

export default function PosmatStockPage() {
  return (
    <MartaShell active="posmat" title="Plan POSM" subtitle="Register Installment Plan per branch x brand.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [scope, setScope] = useState(null);

  useEffect(() => { if (email) getMartaScope(email).then(setScope); }, [email]);
  const canManage = CAN_MANAGE_ROLES.includes(scope?.role);

  return (
    <div>
      <style>{"@keyframes mh-spin { to { transform: rotate(360deg); } }"}</style>
      {!canManage && scope && (
        <div style={{ ...note, marginBottom: 16 }}>Mode lihat saja - hanya Head TMV, Brand TMV, atau SPM Sumatera yang dapat mengubah data di sini.</div>
      )}
      <PlanView email={email} canManage={canManage} scope={scope} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLAN POSM (Register Installment Plan) - menggantikan total Stok & Mutasi +
//  Target Terpasang lama. Sama persis pola RPC dgn mobile (mh_posm_*), cuma
//  UI-nya versi desktop. Region SUMATERA_REGIONS HARUS sama persis dgn
//  mh_sites.region (lihat komentar REGIONS di planData.js mobile).
// ═══════════════════════════════════════════════════════════════════════════
const PLAN_CATEGORIES = [
  { key: "retailer_installment", label: "Retailer Installment" },
  { key: "outdoor_installment", label: "Outdoor Installment" },
  { key: "customer_activation", label: "Customer Activation" },
];
const PLAN_CATEGORY_LABEL = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.key, c.label]));
const SUMATERA_REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const PLAN_STATUS_META = {
  draft: { label: "Draft", color: T.lo, bg: "#F1F2F5" },
  active: { label: "Aktif", color: T.success, bg: T.successBg },
  closed: { label: "Selesai", color: T.mid, bg: "#F1F2F5" },
};
const PLAN_VISUAL_BUCKET = "mh-photos";
function planVisualUrl(path) {
  if (!path) return null;
  return supabaseMarta.storage.from(PLAN_VISUAL_BUCKET).getPublicUrl(path).data.publicUrl;
}

function PlanView({ email, canManage, scope }) {
  const [plans, setPlans] = useState(null);
  const [selected, setSelected] = useState(null); // null=list, {...}=detail
  const [formOpen, setFormOpen] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [err, setErr] = useState("");

  async function openPlan(id) {
    setOpeningId(id); setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_posm_get_plan", { p_plan_id: id });
      if (error) throw error;
      setSelected(data);
    } catch (e) { setErr(e.message || "Gagal membuka Plan"); }
    finally { setOpeningId(null); }
  }

  const load = useCallback(async () => {
    const { data, error } = await supabaseMarta.rpc("mh_posm_list_plans", { p_category: null, p_brand: null, p_status: null });
    if (error) setErr(error.message); else setPlans(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (formOpen) {
    return <PlanCreateWizard email={email} scope={scope} onClose={() => setFormOpen(false)}
      onSaved={async (plan) => {
        setFormOpen(false); await load();
        const { data } = await supabaseMarta.rpc("mh_posm_get_plan", { p_plan_id: plan.id });
        if (data) setSelected(data);
      }} />;
  }

  if (selected) {
    return <PlanDetail plan={selected} email={email} canManage={canManage} scope={scope}
      onBack={() => { setSelected(null); load(); }} onChanged={(p) => setSelected(p)} />;
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.hi }}>Plan POSM</div>
        {canManage && <button onClick={() => setFormOpen(true)} style={{ ...pbtn, marginLeft: "auto" }}><Plus size={15} /> Plan Baru</button>}
      </div>
      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}

      {plans === null ? (
        <div style={card}><Spinner /></div>
      ) : plans.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: T.lo }}>Belum ada Plan POSM. Buat Plan pertama untuk mulai atur target &amp; alokasi.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {plans.map((p) => {
            const st = PLAN_STATUS_META[p.status] || PLAN_STATUS_META.draft;
            const url = planVisualUrl(p.visual_path);
            const pct = p.total_qty > 0 ? Math.min(100, Math.round((p.total_installed / p.total_qty) * 100)) : 0;
            const isOpening = openingId === p.id;
            return (
              <div key={p.id} onClick={() => !openingId && openPlan(p.id)}
                style={{ ...card, position: "relative", cursor: openingId ? "default" : "pointer", display: "flex", gap: 12, opacity: openingId && !isOpening ? 0.55 : 1, transition: "opacity .15s" }}>
                {isOpening && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.75)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Loader2 size={18} color={T.primary} style={{ animation: "mh-spin .8s linear infinite" }} />
                  </div>
                )}
                <div style={{ width: 56, height: 56, borderRadius: 10, background: "#F1F2F5", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Package size={18} color={T.lo} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: T.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 5 }}>
                    <span style={{ ...pill, color: "#B32E85", background: "rgba(179,46,133,0.10)" }}>{PLAN_CATEGORY_LABEL[p.category] || p.category}</span>
                    <span style={{ ...pill, color: T.hi, background: "#F1F2F5" }}>{brandLabel(p.brand)}</span>
                    <span style={{ ...pill, color: st.color, background: st.bg }}>{st.label}</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11, color: T.lo }}>{p.period_from} – {p.period_to}</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: T.mid, fontWeight: 600 }}>{p.material_count} material · {p.branch_count} branch · {p.total_installed}/{p.total_qty} ({pct}%)</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PosmRawDataTable />
    </div>
  );
}

// ── Raw Data POSM: seluruh baris alokasi (Plan x Branch x Material) lintas
// Plan, siap di-export .xlsx - dipakai buat cek/rekap manual di luar app.
function PosmRawDataTable() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [colFilters, setColFilters] = useState({});
  const [sortState, setSortState] = useState({ key: null, dir: "asc" });

  const load = useCallback(async () => {
    setErr("");
    const { data, error } = await supabaseMarta.rpc("mh_posm_list_raw_allocations");
    if (error) setErr(error.message); else setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const T_FILTER = { hi: T.hi, mid: T.mid, lo: T.lo, blue: T.primary, blueBg: T.primaryBg };

  const COLUMNS = useMemo(() => [
    { key: "plan", label: "Plan", width: 200, filter: true, get: (r) => r.plan_name || "-" },
    { key: "category", label: "Category", width: 140, filter: true, get: (r) => PLAN_CATEGORY_LABEL[r.category] || r.category || "-" },
    { key: "brand", label: "Brand", width: 80, filter: true, get: (r) => brandLabel(r.brand) },
    { key: "status", label: "Status", width: 100, filter: true, get: (r) => (PLAN_STATUS_META[r.status] || PLAN_STATUS_META.draft).label },
    { key: "period", label: "Period", width: 170, filter: true, get: (r) => `${r.period_from || "-"} – ${r.period_to || "-"}` },
    { key: "region", label: "Region", width: 140, filter: true, get: (r) => r.region || "-" },
    { key: "branch", label: "Branch", width: 150, filter: true, get: (r) => r.branch_name || "-" },
    { key: "material", label: "Material", width: 170, filter: true, get: (r) => r.material_name || "-" },
    { key: "qty", label: "Qty Alokasi", width: 110, numeric: true, filter: true, get: (r) => r.qty ?? 0 },
    { key: "installed", label: "Qty Terpasang", width: 120, numeric: true, filter: true, get: (r) => r.installed_qty ?? 0 },
    { key: "sisa", label: "Sisa", width: 90, numeric: true, filter: true, get: (r) => Math.max(0, (r.qty || 0) - (r.installed_qty || 0)) },
  ], []);

  const FILTER_COLS = useMemo(() => COLUMNS.filter((c) => c.filter), [COLUMNS]);

  const searchFiltered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => COLUMNS.some((c) => String(c.get(r)).toLowerCase().includes(term)));
  }, [rows, q, COLUMNS]);

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

  const filtered = useMemo(() => {
    let list = searchFiltered;
    for (const col of FILTER_COLS) {
      const sel = colFilters[col.key];
      if (sel && sel.length) list = list.filter((r) => sel.includes(col.get(r)));
    }
    if (sortState.key) {
      const col = COLUMNS.find((c) => c.key === sortState.key);
      if (col?.get) {
        list = [...list].sort((a, b) => {
          const va = col.get(a), vb = col.get(b);
          const cmp = col.numeric ? (Number(va) - Number(vb)) : String(va).localeCompare(String(vb), "id", { numeric: true });
          return sortState.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [searchFiltered, colFilters, FILTER_COLS, sortState, COLUMNS]);

  const activeFilterCount = Object.values(colFilters).filter((v) => v && v.length).length;
  const clearAllFilters = () => { setColFilters({}); setQ(""); };

  function exportXlsx() {
    if (!filtered.length) return;
    setExporting(true);
    try {
      const data = filtered.map((r) => ({
        "Plan": r.plan_name,
        "Category": PLAN_CATEGORY_LABEL[r.category] || r.category,
        "Brand": brandLabel(r.brand),
        "Status": PLAN_STATUS_META[r.status]?.label || r.status,
        "Period From": r.period_from,
        "Period To": r.period_to,
        "Region": r.region,
        "Branch": r.branch_name,
        "Material": r.material_name,
        "Qty Alokasi": r.qty,
        "Qty Terpasang": r.installed_qty,
        "Sisa": Math.max(0, (r.qty || 0) - (r.installed_qty || 0)),
        "Updated At": r.updated_at ? new Date(r.updated_at).toLocaleString("id-ID") : "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Raw Data POSM");
      XLSX.writeFile(wb, `raw_data_posm_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally { setExporting(false); }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.hi }}>Raw Data POSM</div>
        <div style={{ fontSize: 11.5, color: T.lo }}>{rows === null ? "" : `${filtered.length} baris`}</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari plan, branch, material…"
            style={{ ...inp, width: 240, padding: "7px 11px", fontSize: 12.5 }} />
          <button onClick={clearAllFilters} disabled={!activeFilterCount && !q} title="Hapus pencarian & semua filter kolom"
            style={{ ...btn, padding: "8px 12px", opacity: (activeFilterCount || q) ? 1 : 0.4, cursor: (activeFilterCount || q) ? "pointer" : "default" }}>
            Clear Filter{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
          <button onClick={load} title="Muat ulang" style={{ ...btn, padding: "8px 10px" }}><RefreshCw size={13} /></button>
          <button onClick={exportXlsx} disabled={!filtered.length || exporting}
            style={{ ...pbtn, opacity: (!filtered.length || exporting) ? 0.5 : 1, cursor: (!filtered.length || exporting) ? "default" : "pointer" }}>
            <Download size={14} /> {exporting ? "Menyiapkan…" : "Export .xlsx"}
          </button>
        </div>
      </div>

      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "72vh", overflowY: "auto" }}>
          {rows === null ? (
            <div style={{ padding: 24 }}><Spinner /></div>
          ) : (
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
                        <div style={{ display: "flex", alignItems: "center", justifyContent: col.numeric ? "flex-end" : "space-between", gap: 6 }}>
                          <span onClick={() => !col.filter && setSortState((s) => ({ key: col.key, dir: s.key === col.key && s.dir === "asc" ? "desc" : "asc" }))}
                            style={{ overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }} title={col.label}>
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
                {filtered.length === 0 && (
                  <tr><td colSpan={COLUMNS.length} style={{ padding: 20, textAlign: "center", color: T.lo }}>Belum ada data alokasi POSM.</td></tr>
                )}
                {filtered.map((r, i) => {
                  const sisa = Math.max(0, (r.qty || 0) - (r.installed_qty || 0));
                  return (
                    <tr key={`${r.plan_id}_${r.branch_id}_${i}`} style={{ borderTop: `1px solid ${T.line}` }}>
                      <td style={{ padding: "7px 12px", fontWeight: 700, color: T.hi, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", borderRight: `1px solid ${T.line}` }}>{r.plan_name}</td>
                      <td style={{ padding: "7px 12px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{PLAN_CATEGORY_LABEL[r.category] || r.category}</td>
                      <td style={{ padding: "7px 12px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{brandLabel(r.brand)}</td>
                      <td style={{ padding: "7px 12px", borderRight: `1px solid ${T.line}` }}>
                        <span style={{ ...pill, color: (PLAN_STATUS_META[r.status] || PLAN_STATUS_META.draft).color, background: (PLAN_STATUS_META[r.status] || PLAN_STATUS_META.draft).bg }}>
                          {(PLAN_STATUS_META[r.status] || PLAN_STATUS_META.draft).label}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px", color: T.lo, fontSize: 11.5, borderRight: `1px solid ${T.line}` }}>{r.period_from} – {r.period_to}</td>
                      <td style={{ padding: "7px 12px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{r.region}</td>
                      <td style={{ padding: "7px 12px", fontWeight: 700, color: T.hi, borderRight: `1px solid ${T.line}` }}>{r.branch_name}</td>
                      <td style={{ padding: "7px 12px", color: T.mid, borderRight: `1px solid ${T.line}` }}>{r.material_name}</td>
                      <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: T.hi, borderRight: `1px solid ${T.line}` }}>{r.qty}</td>
                      <td style={{ padding: "7px 12px", textAlign: "right", color: T.success, fontWeight: 700, borderRight: `1px solid ${T.line}` }}>{r.installed_qty}</td>
                      <td style={{ padding: "7px 12px", textAlign: "right", color: sisa > 0 ? T.warning : T.lo, fontWeight: 700 }}>{sisa}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
function PlanFormModal({ email, onClose, onSaved, plan }) {
  const isEdit = !!plan;
  const [name, setName] = useState(plan?.name || "");
  const [category, setCategory] = useState(plan?.category || PLAN_CATEGORIES[0].key);
  const [brand, setBrand] = useState(plan?.brand || "im3");
  const [periodFrom, setPeriodFrom] = useState(plan?.period_from || "");
  const [periodTo, setPeriodTo] = useState(plan?.period_to || "");
  const [status, setStatus] = useState(plan?.status || "active");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(plan?.visual_path ? planVisualUrl(plan.visual_path) : "");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!name.trim()) { setErr("Nama Plan wajib diisi."); return; }
    if (!file && !plan?.visual_path) { setErr("Visual wajib diunggah."); return; }
    if (!periodFrom || !periodTo) { setErr("Period From & To wajib diisi."); return; }
    if (periodTo <= periodFrom) { setErr("Period To harus lebih besar dari Period From."); return; }
    setSaving(true); setErr("");
    try {
      let visualPath = plan?.visual_path || null;
      if (file) {
        const path = `posm-plan-visual/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${(file.name.split(".").pop() || "jpg")}`;
        const { error: upErr } = await supabaseMarta.storage.from(PLAN_VISUAL_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg" });
        if (upErr) throw upErr;
        visualPath = path;
      }
      const { data, error } = await supabaseMarta.rpc("mh_posm_upsert_plan", {
        p_id: plan?.id || null, p_name: name.trim(), p_category: category, p_brand: brand, p_visual_path: visualPath,
        p_period_from: periodFrom, p_period_to: periodTo, p_status: status, p_caller_email: email,
      });
      if (error) throw error;
      onSaved(data);
    } catch (e) { setErr(e.message || "Gagal menyimpan Plan"); }
    finally { setSaving(false); }
  }

  return (
    <Modal onClose={onClose} title={isEdit ? "Edit Plan POSM" : "Plan POSM Baru"}>
      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      <Field label="Visual *">
        {preview ? (
          <div style={{ position: "relative", width: "100%", height: 120, borderRadius: 10, border: `1.5px solid ${T.line}`, background: "#F7F9FC", overflow: "hidden" }}>
            <img src={preview} alt="" onClick={() => setShowPreview(true)} style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "zoom-in" }} />
            <label style={{ position: "absolute", right: 6, bottom: 6, display: "flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 8, background: "rgba(255,255,255,0.92)", border: `1px solid ${T.line}`, fontSize: 11, fontWeight: 700, color: T.hi, cursor: "pointer" }}>
              <Upload size={12} /> Ganti
              <input type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 120, borderRadius: 10, border: `1.5px dashed ${T.line}`, background: "#F7F9FC", cursor: "pointer", overflow: "hidden" }}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 12, color: T.lo }}>
              <Upload size={22} color={T.lo} />
              Klik untuk unggah visual (ukuran bebas)
            </span>
            <input type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        )}
      </Field>
      {showPreview && preview && (
        <div onClick={() => setShowPreview(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          <img src={preview} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}
      <Field label="Nama Plan *"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Masukkan Nama Plan" /></Field>
      <Field label="Category *">
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          {PLAN_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Brand *">
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={selectStyle}>
          <option value="im3">IM3</option>
          <option value="tri">3ID</option>
        </select>
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Period From *"><input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} style={inp} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Period To *"><input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} style={inp} /></Field></div>
      </div>
      {isEdit && (
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
            <option value="draft">Draft</option>
            <option value="active">Aktif</option>
            <option value="closed">Selesai</option>
          </select>
        </Field>
      )}
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={btn}>Batal</button>
        <button onClick={save} disabled={saving} style={{ ...pbtn, ...(saving ? disabledPbtn : {}) }}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </Modal>
  );
}


// Wizard "Plan POSM Baru" - Info + pilih Material + set qty alokasi per
// branch untuk MASING-MASING material yang dipilih, sekaligus dalam 1 form
// (2026-08-31, atas permintaan user: sebelumnya Info/Material/Alokasi harus
// disimpan bertahap lewat 3 tab terpisah setelah Plan dibuat). Kolom qty
// dinamis mengikuti material yang dicentang - tiap branch bisa punya qty
// berbeda per material.
function PlanCreateWizard({ email, scope, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(PLAN_CATEGORIES[0].key);
  const [brand, setBrand] = useState("im3");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const [catalog, setCatalog] = useState(null);
  const [materialId, setMaterialId] = useState(null); // 1 Plan = 1 material
  const [branchRows, setBranchRows] = useState(null); // raw mh_branch_brand_list
  const [qty, setQty] = useState({}); // key: branchId -> qty

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");

  // Branch yang muncul di tabel alokasi tergantung siapa yang bikin Plan ini:
  // Head TMV / Brand TMV cuma lihat branch di region mereka sendiri, role
  // yang lebih tinggi (SPM Sumatera/admin) lihat semua branch se-Sumatera -
  // sama persis batasan yang sudah dipakai di tab Alokasi (PlanAlokasiTab).
  const isRegionRestricted = scope && ["head", "tmv"].includes(scope.role);
  const allowedRegions = isRegionRestricted && scope.region ? [scope.region] : SUMATERA_REGIONS;

  useEffect(() => {
    supabaseMarta.rpc("mh_posmat_list_types").then(({ data, error }) => { if (!error) setCatalog(data || []); else setErr(error.message); });
    // Sama seperti "Tambah Assignment" (User Management): tarik kombinasi
    // branch x brand lewat RPC mh_branch_brand_list (SECURITY DEFINER),
    // bukan query langsung ke mh_sites - RLS mh_sites butuh sesi Supabase
    // Auth asli (auth.uid()), yang tidak dipakai app ini, sehingga query
    // langsung selalu balik kosong ("Tidak ada branch aktif").
    supabaseMarta.rpc("mh_branch_brand_list")
      .then(({ data, error }) => {
        if (error) { setErr(error.message); return; }
        setBranchRows(data || []);
      });
  }, []);

  // Branch alokasi mengikuti Brand yang SUDAH dipilih di form (tidak perlu
  // pilih brand lagi per branch) - cukup filter kombinasi branch x brand
  // ke brand terpilih saja.
  const branches = useMemo(() => {
    if (branchRows === null) return null;
    const map = new Map();
    for (const r of branchRows) {
      if (!r.branch_id || !r.brand) continue;
      if (r.brand !== brand) continue;
      if (!allowedRegions.includes(r.region)) continue;
      if (!map.has(r.branch_id)) map.set(r.branch_id, { branch_id: r.branch_id, branch_name: r.branch || r.branch_id, region: r.region });
    }
    return Array.from(map.values()).sort((a, b) => a.region === b.region ? a.branch_name.localeCompare(b.branch_name) : a.region.localeCompare(b.region));
  }, [branchRows, brand, allowedRegions.join(",")]);

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function setQtyFor(branchId, val) {
    setQty((prev) => ({ ...prev, [branchId]: val }));
  }

  const selectedMaterial = useMemo(() => (catalog || []).find((t) => t.id === materialId) || null, [catalog, materialId]);

  async function save() {
    if (!name.trim()) { setErr("Nama Plan wajib diisi."); return; }
    if (!file) { setErr("Visual wajib diunggah."); return; }
    if (!materialId) { setErr("Material wajib dipilih."); return; }
    if (!periodFrom || !periodTo) { setErr("Period From & To wajib diisi."); return; }
    if (periodTo <= periodFrom) { setErr("Period To harus lebih besar dari Period From."); return; }
    setSaving(true); setErr("");
    let createdPlan = null;
    try {
      setProgress("Menyimpan info Plan…");
      let visualPath = null;
      if (file) {
        const path = `posm-plan-visual/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${(file.name.split(".").pop() || "jpg")}`;
        const { error: upErr } = await supabaseMarta.storage.from(PLAN_VISUAL_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg" });
        if (upErr) throw upErr;
        visualPath = path;
      }
      const { data: plan, error: planErr } = await supabaseMarta.rpc("mh_posm_upsert_plan", {
        p_id: null, p_name: name.trim(), p_category: category, p_brand: brand, p_visual_path: visualPath,
        p_period_from: periodFrom, p_period_to: periodTo, p_status: "active", p_caller_email: email,
      });
      if (planErr) throw planErr;
      createdPlan = plan;

      if (materialId) {
        setProgress("Menyimpan Material…");
        const { error: matErr } = await supabaseMarta.rpc("mh_posm_set_plan_materials", { p_plan_id: plan.id, p_posmat_type_ids: [materialId], p_caller_email: email });
        if (matErr) throw matErr;

        setProgress("Menyimpan alokasi…");
        const allocations = (branches || [])
          .map((b) => ({ branch_id: b.branch_id, branch_name: b.branch_name, region: b.region, qty: Number(qty[b.branch_id]) || 0 }))
          .filter((a) => a.qty > 0);
        if (allocations.length > 0) {
          const { error: allocErr } = await supabaseMarta.rpc("mh_posm_set_allocations_batch", { p_plan_id: plan.id, p_posmat_type_id: materialId, p_allocations: allocations, p_caller_email: email });
          if (allocErr) throw allocErr;
        }
      }
      onSaved(createdPlan);
    } catch (e) {
      setErr((e.message || "Gagal menyimpan Plan") + (createdPlan ? " - Plan sudah dibuat, lengkapi sisanya lewat tab Material/Alokasi." : ""));
      if (createdPlan) onSaved(createdPlan);
    } finally { setSaving(false); setProgress(""); }
  }

  return (
    <div style={{ width: "100%" }}>
      <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.mid, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali ke daftar Plan
      </button>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.hi, marginBottom: 16 }}>Plan POSM Baru</div>
      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}

      <div style={{ ...card, marginBottom: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        <div>
          <Field label="Visual *">
            {preview ? (
              <div style={{ position: "relative", width: "100%", height: 96, borderRadius: 10, border: `1.5px solid ${T.line}`, background: "#F7F9FC", overflow: "hidden" }}>
                <img src={preview} alt="" onClick={() => setShowPreview(true)} style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "zoom-in" }} />
                <label style={{ position: "absolute", right: 5, bottom: 5, display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 8, background: "rgba(255,255,255,0.92)", border: `1px solid ${T.line}`, fontSize: 10.5, fontWeight: 700, color: T.hi, cursor: "pointer" }}>
                  <Upload size={11} /> Ganti
                  <input type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
                </label>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 96, borderRadius: 10, border: `1.5px dashed ${T.line}`, background: "#F7F9FC", cursor: "pointer", overflow: "hidden" }}>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 12, color: T.lo }}>
                  <Upload size={22} color={T.lo} />
                  Klik untuk unggah visual
                </span>
                <input type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
              </label>
            )}
          </Field>
          {showPreview && preview && (
            <div onClick={() => setShowPreview(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
              <img src={preview} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }} />
            </div>
          )}
          <Field label="Nama Plan *"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Masukkan Nama Plan" /></Field>
        </div>
        <div>
          <Field label="Category *">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
              {PLAN_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Brand *">
            <select value={brand} onChange={(e) => setBrand(e.target.value)} style={selectStyle}>
              <option value="im3">IM3</option>
              <option value="tri">3ID</option>
            </select>
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Period From *"><input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} style={inp} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Period To *"><input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} style={inp} /></Field></div>
          </div>
        </div>
        <div>
          <Field label="Material *">
            {catalog === null ? <Spinner small label="Memuat material…" /> : (
              <MaterialPicker catalog={catalog} setCatalog={setCatalog} selectedId={materialId} onSelect={setMaterialId} email={email} />
            )}
          </Field>
        </div>
      </div>

      {materialId && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.hi, marginBottom: 8 }}>
            Alokasi qty "{selectedMaterial?.name}" per branch ({branches?.length ?? 0} branch) - isi berapa unit dialokasikan ke tiap branch. Kosongkan/0 kalau branch itu tidak dapat alokasi.
          </div>
          {branches === null ? <Spinner small label="Memuat branch…" /> : (
            <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "auto", maxHeight: 380 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "#F7F9FC", color: T.mid, position: "sticky", top: 0 }}>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Branch</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Region</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", minWidth: 140 }}>
                      Qty
                      <button type="button" onClick={() => {
                        const v = window.prompt(`Isi qty sama utk semua branch - material "${selectedMaterial?.name}":`, "0");
                        if (v == null) return;
                        const n = Number(v) || 0;
                        setQty((prev) => { const nx = { ...prev }; for (const b of branches) nx[b.branch_id] = n; return nx; });
                      }} style={{ marginLeft: 8, background: "none", border: "none", color: T.primary, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>isi semua</button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => (
                    <tr key={b.branch_id} style={{ borderTop: `1px solid ${T.line}` }}>
                      <td style={{ padding: "7px 12px", fontWeight: 700, color: T.hi }}>{b.branch_name}</td>
                      <td style={{ padding: "7px 12px", color: T.lo, fontSize: 11.5 }}>{b.region}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>
                        <input type="number" min="0" value={qty[b.branch_id] ?? ""} placeholder="0"
                          onChange={(e) => setQtyFor(b.branch_id, e.target.value)}
                          style={{ ...inp, width: 110, textAlign: "right", padding: "6px 10px" }} />
                      </td>
                    </tr>
                  ))}
                  {branches.length === 0 && <tr><td colSpan={3} style={{ padding: 16, textAlign: "center", color: T.lo }}>Tidak ada branch aktif.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, paddingBottom: 24 }}>
        <div style={{ fontSize: 11.5, color: T.lo }}>{saving ? progress : ""}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={btn}>Batal</button>
          <button onClick={save} disabled={saving} style={{ ...pbtn, ...(saving ? disabledPbtn : {}) }}>{saving ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </div>
    </div>
  );
}



// Combobox Material (nama, tag, +Add more) - menggantikan checkbox grid lama
// (2026-08-31, atas permintaan user - ikut pola sederhana yang dicontohkan:
// 1 input, klik buka dropdown daftar material + tombol "+Add more Material"
// utk bikin jenis material baru langsung dari sini tanpa halaman terpisah).
function MaterialPicker({ catalog, setCatalog, selectedId, onSelect, email, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setAdding(false); } }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = (catalog || []).find((t) => t.id === selectedId) || null;
  const filtered = (catalog || []).filter((t) => t.active !== false && t.name.toLowerCase().includes(q.trim().toLowerCase()));

  function pick(id) {
    onSelect(id);
    setOpen(false); setQ(""); setAdding(false);
  }

  async function createMaterial() {
    const nm = (newName.trim() || q.trim());
    if (!nm) return;
    setCreating(true); setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_posmat_upsert_type", {
        p_id: null, p_name: nm.toUpperCase(), p_category: null, p_stock_mode: "consumable", p_unit: "pcs", p_active: true, p_caller_email: email,
      });
      if (error) throw error;
      setCatalog((prev) => [...(prev || []), data]);
      pick(data.id);
    } catch (e) { setErr(e.message || "Gagal menambah material"); }
    finally { setCreating(false); }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div onClick={() => !disabled && setOpen((o) => !o)}
        style={{ ...inp, minHeight: 44, height: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, cursor: disabled ? "default" : "pointer", borderColor: open ? T.primary : T.line }}>
        {selected ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: T.hi }}>{selected.name}</span>
        ) : (
          <span style={{ color: T.lo }}>Pilih Material</span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selected && !disabled && (
            <span onClick={(e) => { e.stopPropagation(); onSelect(null); }} style={{ cursor: "pointer", color: T.lo, fontWeight: 800, fontSize: 15, lineHeight: 1 }}>×</span>
          )}
          <img src={CHEV} alt="" style={{ width: 13, height: 13, flexShrink: 0 }} />
        </div>
      </div>

      {open && !disabled && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.16)", zIndex: 30, maxHeight: 360, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 10, borderBottom: `1px solid ${T.line}` }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari material…" style={{ ...inp, padding: "8px 10px" }} />
          </div>
          {err && <div style={{ padding: "8px 12px", fontSize: 11.5, color: T.error }}>{err}</div>}
          <div style={{ overflow: "auto", flex: 1 }}>
            {filtered.map((t) => {
              const on = t.id === selectedId;
              return (
                <div key={t.id} onClick={() => pick(t.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, color: T.hi, cursor: "pointer", background: on ? "#FFF5F5" : "#fff" }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, border: `1.5px solid ${on ? T.primary : T.line}`, background: on ? T.primary : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {on && <span style={{ width: 7, height: 7, borderRadius: 999, background: "#fff" }} />}
                  </span>
                  <span>{t.name}</span>
                </div>
              );
            })}
            {filtered.length === 0 && (catalog || []).length > 0 && (
              <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: T.lo }}>Tidak ada material bernama "{q}".</div>
            )}
            {(catalog || []).length === 0 && <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: T.lo }}>Belum ada material.</div>}
          </div>
          <div style={{ borderTop: `1px solid ${T.line}` }}>
            {!adding ? (
              <div onClick={() => setAdding(true)} style={{ padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: T.primary, cursor: "pointer" }}>+ Add more Material{q.trim() ? ` "${q.trim().toUpperCase()}"` : ""}</div>
            ) : (
              <div style={{ display: "flex", gap: 6, padding: "8px 10px" }}>
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={q.trim() ? q.trim().toUpperCase() : "Nama material baru"}
                  onKeyDown={(e) => { if (e.key === "Enter") createMaterial(); }}
                  style={{ ...inp, padding: "6px 9px", fontSize: 12.5 }} />
                <button onClick={createMaterial} disabled={creating || (!newName.trim() && !q.trim())} style={{ ...pbtn, padding: "6px 10px", fontSize: 11.5 }}>{creating ? "…" : "Tambah"}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


const PLAN_TABS = [{ key: "info", label: "Info" }, { key: "material", label: "Material" }, { key: "alokasi", label: "Alokasi" }, { key: "instalasi", label: "Instalasi" }];

function PlanDetail({ plan, email, canManage, scope, onBack, onChanged }) {
  const [tab, setTab] = useState("info");
  const [editOpen, setEditOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const st = PLAN_STATUS_META[plan.status] || PLAN_STATUS_META.draft;
  const url = planVisualUrl(plan.visual_path);

  async function refresh() {
    const { data } = await supabaseMarta.rpc("mh_posm_get_plan", { p_plan_id: plan.id });
    if (data) onChanged(data);
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.mid, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali ke daftar Plan
      </button>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
        <div onClick={() => url && setShowPreview(true)} style={{ width: 56, height: 56, borderRadius: 10, background: "#F1F2F5", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: url ? "zoom-in" : "default" }}>
          {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Package size={18} color={T.lo} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.hi }}>{plan.name}</div>
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
            <span style={{ ...pill, color: "#B32E85", background: "rgba(179,46,133,0.10)" }}>{PLAN_CATEGORY_LABEL[plan.category] || plan.category}</span>
            <span style={{ ...pill, color: T.hi, background: "#F1F2F5" }}>{brandLabel(plan.brand)}</span>
            <span style={{ ...pill, color: st.color, background: st.bg }}>{st.label}</span>
            <span style={{ fontSize: 11, color: T.lo }}>{plan.period_from} – {plan.period_to}</span>
          </div>
        </div>
        {canManage && <button onClick={() => setEditOpen(true)} style={btn}><Pencil size={14} /> Edit</button>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {PLAN_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "7px 14px", borderRadius: 999, border: `1px solid ${tab === t.key ? T.hi : T.line}`, background: tab === t.key ? T.hi : "#fff", color: tab === t.key ? "#fff" : T.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <div style={card}>
          <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.8 }}>
            <div><b>Dibuat oleh:</b> {plan.created_by_name || "-"}</div>
            <div><b>Dibuat:</b> {new Date(plan.created_at).toLocaleString("id-ID")}</div>
            <div><b>Status:</b> {st.label} - ubah lewat tombol Edit di atas.</div>
          </div>
        </div>
      )}
      {tab === "material" && <PlanMaterialTab plan={plan} email={email} canManage={canManage} onSaved={refresh} />}
      {tab === "alokasi" && <PlanAlokasiTab plan={plan} email={email} canManage={canManage} scope={scope} onSaved={refresh} />}
      {tab === "instalasi" && <PlanInstallationsTab plan={plan} email={email} canManage={canManage} />}

      {editOpen && (
        <PlanFormModal email={email} plan={plan} onClose={() => setEditOpen(false)}
          onSaved={async () => { setEditOpen(false); await refresh(); }} />
      )}
      {showPreview && url && (
        <div onClick={() => setShowPreview(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          <img src={url} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

// ── Tab "Instalasi" - daftar Retailer Installment utk Plan ini, dgn hasil
// validasi geofence yang SUDAH TERSIMPAN (dihitung SEKALI server-side saat
// BME submit - lihat mh_md_submit_retailer_installation di migrasi
// retailer_install_auto_geofence). CMS di sini HANYA MEMBACA kolom
// location_status/location_distance_meters, TIDAK PERNAH menghitung ulang
// jarak tiap kali tab dibuka/refresh - supaya tidak boros.
const GEOFENCE_META = {
  valid: { label: "Dalam Radius", color: T.success, bg: T.successBg },
  mismatch: { label: "Di Luar Radius", color: T.error, bg: T.errorBg },
  no_reference: { label: "Tanpa Titik Referensi", color: T.lo, bg: "#F1F2F5" },
};
const REVIEW_META = {
  revision_needed: { label: "Diminta Revisi", color: T.error, bg: T.errorBg },
  revised: { label: "Sudah Diperbaiki", color: T.success, bg: T.successBg },
};
function installPhotoUrl(path) {
  return supabaseMarta.storage.from("mh-photos").getPublicUrl(path).data.publicUrl;
}
function PlanInstallationsTab({ plan, email, canManage }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [revisionFor, setRevisionFor] = useState(null); // id instalasi yg lagi diisi alasan revisi
  const [revisionNote, setRevisionNote] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const { data, error } = await supabaseMarta.rpc("mh_posm_list_plan_installations", { p_plan_id: plan.id });
    if (error) { setErr(error.message || "Gagal memuat instalasi"); return; }
    setRows(data || []);
  }, [plan.id]);
  useEffect(() => { load(); }, [load]);

  function openRevision(id) { setRevisionFor(id); setRevisionNote(""); }

  async function submitRevision() {
    if (!revisionNote.trim()) return;
    setBusyId(revisionFor);
    try {
      const { error } = await supabaseMarta.rpc("mh_web_request_retailer_revision", {
        p_id: revisionFor, p_notes: revisionNote.trim(), p_caller_email: email,
      });
      if (error) throw new Error(error.message);
      setRevisionFor(null); setRevisionNote("");
      await load();
    } catch (e) { setErr(e.message || "Gagal meminta revisi"); }
    finally { setBusyId(null); }
  }

  const filtered = (rows || []).filter((r) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "flagged") return r.review_status === "revision_needed";
    if (filterStatus === "revised") return r.review_status === "revised";
    return !r.review_status;
  });
  const mismatchCount = (rows || []).filter((r) => r.location_status === "mismatch").length;
  const flaggedCount = (rows || []).filter((r) => r.review_status === "revision_needed").length;

  return (
    <div>
      <div style={{ ...card, marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ fontSize: 12, color: T.mid, lineHeight: 1.7 }}>
          Validasi lokasi (jarak titik pemasangan ke titik outlet resmi di Mapping Outlet) dihitung <b>otomatis satu kali</b> saat BME submit, lalu hasilnya disimpan permanen - tidak dihitung ulang setiap kali halaman ini dibuka.
          {mismatchCount > 0 && <> <b style={{ color: T.error }}>{mismatchCount} pemasangan</b> di luar radius toleransi.</>}
          {" "}Kalau ada yang mencurigakan atau salah input, klik <b>Minta Revisi</b> - BME bisa perbaiki dari HP tanpa harus datang lagi ke lokasi.
        </div>
      </div>

      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 14 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["all", "Semua"], ["pending", "Belum Ditinjau"], ["flagged", `Diminta Revisi${flaggedCount > 0 ? ` (${flaggedCount})` : ""}`], ["revised", "Sudah Diperbaiki"]].map(([k, label]) => (
          <button key={k} onClick={() => setFilterStatus(k)}
            style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${filterStatus === k ? T.hi : T.line}`, background: filterStatus === k ? T.hi : "#fff", color: filterStatus === k ? "#fff" : T.mid, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {rows === null && <div style={{ ...card, textAlign: "center", color: T.lo }}>Memuat…</div>}
      {rows !== null && filtered.length === 0 && <div style={{ ...card, textAlign: "center", color: T.lo }}>Belum ada Retailer Installment untuk Plan ini.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((r) => {
          const geo = GEOFENCE_META[r.location_status] || { label: r.location_status || "-", color: T.lo, bg: "#F1F2F5" };
          const rv = REVIEW_META[r.review_status] || { label: "Belum Ditinjau", color: T.lo, bg: "#F1F2F5" };
          return (
            <div key={r.id} style={{ ...card, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: T.hi }}>{(r.outlet_name || "-").toUpperCase()}</div>
                  <div style={{ fontSize: 11, color: T.mid, marginTop: 2 }}>ID {r.outlet_code} · {r.branch_name}{r.mc ? ` · ${r.mc}` : ""}</div>
                  <div style={{ fontSize: 11, color: T.lo, marginTop: 2 }}>{r.recorder_name} · {new Date(r.created_at).toLocaleString("id-ID")}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                  <span style={{ ...pill, color: geo.color, background: geo.bg }}>
                    {geo.label}{r.location_distance_meters != null ? ` · ${Math.round(r.location_distance_meters)}m` : ""}
                  </span>
                  <span style={{ ...pill, color: rv.color, background: rv.bg }}>{rv.label}</span>
                </div>
              </div>

              {r.location_note && <div style={{ marginTop: 8, fontSize: 11.5, color: T.mid }}>{r.location_note}</div>}

              {r.items?.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {r.items.map((it, i) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 700, color: T.hi, background: "#F1F2F5", borderRadius: 999, padding: "3px 10px" }}>
                      {it.name} × {it.qty} {it.unit}
                    </span>
                  ))}
                </div>
              )}

              {r.note && <div style={{ marginTop: 8, fontSize: 11.5, color: T.mid, fontStyle: "italic" }}>"{r.note}"</div>}

              {r.photos?.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {r.photos.map((ph) => (
                    <a key={ph.id} href={installPhotoUrl(ph.storage_path)} target="_blank" rel="noreferrer"
                      style={{ width: 56, height: 56, borderRadius: 8, overflow: "hidden", display: "block", background: "#F1F2F5" }}>
                      <img src={installPhotoUrl(ph.storage_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </a>
                  ))}
                </div>
              )}

              {r.review_status === "revision_needed" && r.review_notes && (
                <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 11.5, fontWeight: 600, lineHeight: 1.6 }}>
                  <b>Alasan revisi:</b> {r.review_notes}
                </div>
              )}

              {canManage && !r.review_status && revisionFor !== r.id && (
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => openRevision(r.id)}
                    style={{ ...btn, background: "#fff", color: T.error, borderColor: T.error }}>
                    Minta Revisi
                  </button>
                </div>
              )}
              {canManage && revisionFor === r.id && (
                <div style={{ marginTop: 12 }}>
                  <textarea value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} rows={2} autoFocus
                    placeholder="Jelaskan apa yang mencurigakan/salah - mis. jumlah material tidak sesuai foto, salah pilih outlet, dll."
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 12.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button onClick={submitRevision} disabled={busyId === r.id || !revisionNote.trim()}
                      style={{ ...btn, background: T.error, color: "#fff", borderColor: T.error, opacity: (busyId === r.id || !revisionNote.trim()) ? 0.6 : 1 }}>
                      {busyId === r.id ? "Mengirim…" : "Kirim Permintaan Revisi"}
                    </button>
                    <button onClick={() => setRevisionFor(null)} disabled={busyId === r.id} style={btn}>Batal</button>
                  </div>
                </div>
              )}
              {r.reviewed_by_name && (
                <div style={{ marginTop: 10, fontSize: 10.5, color: T.lo }}>
                  Revisi diminta oleh {r.reviewed_by_name} · {new Date(r.reviewed_at).toLocaleString("id-ID")}
                  {r.review_status === "revised" && " · sudah diperbaiki BME"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanMaterialTab({ plan, email, canManage, onSaved }) {
  const [catalog, setCatalog] = useState(null);
  const [selectedId, setSelectedId] = useState(plan.materials[0]?.posmat_type_id || null); // 1 Plan = 1 material
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabaseMarta.rpc("mh_posmat_list_types").then(({ data, error }) => { if (!error) setCatalog(data || []); else setErr(error.message); });
  }, []);

  async function save() {
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_posm_set_plan_materials", { p_plan_id: plan.id, p_posmat_type_ids: selectedId ? [selectedId] : [], p_caller_email: email });
      if (error) throw error;
      await onSaved();
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  }

  if (catalog === null) return <div style={card}><Spinner /></div>;

  return (
    <div style={card}>
      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.hi, marginBottom: 10 }}>Material Plan ini - kalau sudah punya alokasi terpasang, tidak bisa diganti ke material lain dari sini (kurangi dulu qty-nya di tab Alokasi).</div>
      <MaterialPicker catalog={catalog} setCatalog={setCatalog} selectedId={selectedId} onSelect={setSelectedId} email={email} disabled={!canManage} />
      {canManage && (
        <button onClick={save} disabled={saving} style={{ ...pbtn, marginTop: 14, ...(saving ? disabledPbtn : {}) }}>{saving ? "Menyimpan…" : "Simpan Material"}</button>
      )}
    </div>
  );
}

function PlanAlokasiTab({ plan, email, canManage, scope, onSaved }) {
  const isRestricted = scope && ["head", "tmv"].includes(scope.role);
  const [materialId, setMaterialId] = useState(plan.materials[0]?.posmat_type_id || "");
  const [region, setRegion] = useState(isRestricted ? scope.region : SUMATERA_REGIONS[0]);
  const [branches, setBranches] = useState(null);
  const [qtyMap, setQtyMap] = useState({});
  const [remap, setRemap] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const allocByBranch = useMemo(() => {
    const m = {};
    for (const a of plan.allocations) if (a.posmat_type_id === materialId) m[a.branch_id] = a;
    return m;
  }, [plan.allocations, materialId]);
  const remapByBranch = useMemo(() => Object.fromEntries(remap.map((r) => [r.old_branch_id, r])), [remap]);

  useEffect(() => { supabaseMarta.rpc("mh_posm_list_branch_remap").then(({ data }) => setRemap(data || [])); }, []);

  useEffect(() => {
    if (!region) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabaseMarta.from("mh_sites").select("branch_id, branch, region").eq("active", true).eq("region", region).not("branch_id", "is", null);
      if (!alive) return;
      if (error) { setErr(error.message); return; }
      const map = new Map();
      for (const r of data || []) if (r.branch_id && !map.has(r.branch_id)) map.set(r.branch_id, r.branch || r.branch_id);
      const rows = Array.from(map, ([branch_id, branch_name]) => ({ branch_id, branch_name })).sort((a, b) => a.branch_name.localeCompare(b.branch_name));
      setBranches(rows);
      const init = {};
      for (const b of rows) init[b.branch_id] = allocByBranch[b.branch_id]?.qty ?? 0;
      setQtyMap(init);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, materialId]);

  async function save() {
    if (!materialId) { setErr("Pilih material dulu."); return; }
    setSaving(true); setErr(""); setOk(false);
    try {
      const allocations = (branches || []).map((b) => ({ branch_id: b.branch_id, branch_name: b.branch_name, region, qty: Number(qtyMap[b.branch_id]) || 0 }));
      const { error } = await supabaseMarta.rpc("mh_posm_set_allocations_batch", { p_plan_id: plan.id, p_posmat_type_id: materialId, p_allocations: allocations, p_caller_email: email });
      if (error) throw error;
      setOk(true);
      await onSaved();
    } catch (e) { setErr(e.message || "Gagal menyimpan alokasi"); }
    finally { setSaving(false); }
  }

  async function handleMove(alloc) {
    const info = remapByBranch[alloc.branch_id];
    if (!info) return;
    const qtyStr = window.prompt(`Pindahkan sisa alokasi "${alloc.branch_name}" ke "${info.new_branch_name}". Jumlah alokasi baru?`, String(Math.max(alloc.qty - alloc.installed_qty, 0)));
    if (qtyStr == null) return;
    const { error } = await supabaseMarta.rpc("mh_posm_move_allocation", {
      p_allocation_id: alloc.id, p_new_branch_id: info.new_branch_id, p_new_branch_name: info.new_branch_name,
      p_new_region: region, p_new_qty: Number(qtyStr) || 0, p_caller_email: email,
    });
    if (error) setErr(error.message); else await onSaved();
  }

  if (plan.materials.length === 0) {
    return <div style={{ ...card, color: T.lo }}>Pilih material dulu di tab Material sebelum mengatur alokasi.</div>;
  }

  return (
    <div style={card}>
      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      {ok && <div style={{ ...note, marginBottom: 12, background: T.successBg, borderColor: T.success, color: T.success }}>Alokasi tersimpan.</div>}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="Material *">
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} style={selectStyle}>
              {plan.materials.map((m) => <option key={m.posmat_type_id} value={m.posmat_type_id}>{m.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Region">
            <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={isRestricted} style={selectStyle}>
              {SUMATERA_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {branches === null ? (
        <Spinner label="Memuat branch…" />
      ) : (
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid }}>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Branch</th>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Terpasang</th>
              <th style={{ padding: "8px 12px", textAlign: "right" }}>Alokasi</th>
            </tr></thead>
            <tbody>
              {branches.map((b) => {
                const existing = allocByBranch[b.branch_id];
                const info = remapByBranch[b.branch_id];
                return (
                  <tr key={b.branch_id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: T.hi }}>
                      {b.branch_name}
                      {info && (
                        <button onClick={() => handleMove(existing)} disabled={!existing}
                          style={{ marginLeft: 8, background: "none", border: "none", cursor: existing ? "pointer" : "default", color: "#B8860B", fontSize: 10.5, fontWeight: 700 }}>
                          <AlertTriangle size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                          Digabung ke "{info.new_branch_name}" - pindahkan
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", color: T.mid }}>{existing?.installed_qty || 0}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <input type="number" min="0" disabled={!canManage} value={qtyMap[b.branch_id] ?? 0}
                        onChange={(e) => setQtyMap((prev) => ({ ...prev, [b.branch_id]: e.target.value }))}
                        style={{ ...inp, width: 90, textAlign: "right" }} />
                    </td>
                  </tr>
                );
              })}
              {branches.length === 0 && <tr><td colSpan={3} style={{ padding: 16, textAlign: "center", color: T.lo }}>Tidak ada branch di region ini.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <button onClick={save} disabled={saving || branches === null} style={{ ...pbtn, marginTop: 14, ...(saving ? disabledPbtn : {}) }}>
          {saving ? "Menyimpan…" : "Simpan Alokasi Region Ini"}
        </button>
      )}
    </div>
  );
}

function Spinner({ label = "Memuat…", small }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: small ? 10 : 24, color: T.lo, fontSize: 12.5, fontWeight: 600 }}>
      <Loader2 size={small ? 13 : 16} style={{ animation: "mh-spin .8s linear infinite" }} />
      {label}
    </div>
  );
}

// ── Bits bersama ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: wide ? 1180 : 420, maxWidth: "96vw", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  const isReq = typeof label === "string" && label.trim().endsWith("*");
  const labelText = isReq ? label.trim().slice(0, -1).trim() : label;
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.hi, marginBottom: 5 }}>
        {labelText}{isReq && <span style={{ color: T.error, marginLeft: 3 }}>*</span>}
      </div>
      {children}
    </label>
  );
}

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthInputValue(yyyymm) {
  if (!/^\d{6}$/.test(String(yyyymm || ""))) return "";
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
function monthLabel(yyyymm) {
  if (!/^\d{6}$/.test(String(yyyymm || ""))) return String(yyyymm || "-");
  return `${MONTH_NAMES[parseInt(yyyymm.slice(4, 6), 10) - 1]} ${yyyymm.slice(0, 4)}`;
}

const card = { background: "#FFFFFF", border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
const note = { background: "#FFFDE7", border: `1px solid #F0E3B0`, color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5 };
const btn = { padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1 };
const iconBtn = { ...btn, padding: "6px 8px" };
const GRAD = "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)";
const pbtn = { ...btn, background: GRAD, color: "#fff", border: "none", padding: "9px 16px" };
const disabledPbtn = { background: "#F1F2F5", color: T.lo, boxShadow: "none", cursor: "not-allowed" };
const pill = { fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, display: "inline-block" };
const CHEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";
const inp = { padding: "8px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, outline: "none", boxSizing: "border-box", width: "100%" };
const selectStyle = { ...inp, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: "pointer", backgroundImage: `url("${CHEV}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", backgroundSize: "13px", paddingRight: 32 };
