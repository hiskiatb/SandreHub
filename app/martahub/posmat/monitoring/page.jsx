"use client";
// /martahub/posmat/monitoring - "Monitoring Stok & Realisasi" (flowchart
// bagian C, Admin/Super-user "Kelola POSM"). Alokasi/Terpasang/Sisa Stok/
// Progress% per material PER BRANCH, dihitung real-time dari
// mh_posm_plan_allocations (alokasi aktif) dikurangi qty terpasang
// tervalidasi (review_status <> 'rejected') di mh_md_installation_items -
// BUKAN dari tabel stok lama (mh_posmat_stock/_movements, sudah dormant,
// UI-nya sudah dihapus 2026-08-31).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, ChevronRight, Store, Loader2 } from "lucide-react";
import MartaShell, { T } from "../../components/MartaShell";
import { fetchPosmMonitoringSummary, fetchPosmMonitoringDetail } from "../../m/_shared/posmData";

const PLAN_CATEGORIES = [
  { key: "retailer_installment", label: "Retailer Installment" },
  { key: "outdoor_installment", label: "Outdoor Installment" },
  { key: "customer_activation", label: "Customer Activation" },
];
const PLAN_CATEGORY_LABEL = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.key, c.label]));
const PLAN_STATUS_META = {
  draft: { label: "Draft", color: T.lo, bg: "#F1F2F5" },
  active: { label: "Aktif", color: T.success, bg: T.successBg },
  closed: { label: "Selesai", color: T.mid, bg: "#F1F2F5" },
};
const brandLabel = (b) => (b === "tri" ? "3ID" : b === "im3" ? "IM3" : String(b || "-").toUpperCase());
const fmt = (n) => Number(n || 0).toLocaleString("id-ID");

export default function PosmMonitoringPage() {
  return (
    <MartaShell active="posmat" title="Monitoring Stok & Realisasi" subtitle="Alokasi vs. terpasang per material &amp; branch, dihitung real-time.">
      {() => <Body />}
    </MartaShell>
  );
}

function Body() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("active");
  const [selected, setSelected] = useState(null); // plan summary row

  const load = async () => {
    setErr("");
    try { setRows(await fetchPosmMonitoringSummary(category || null, null, status || null)); }
    catch (e) { setErr(e.message || "Gagal memuat monitoring"); setRows([]); }
  };
  useEffect(() => { setRows(null); load(); }, [category, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return <PlanDetailMonitoring plan={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <button onClick={() => router.push("/martahub/posmat")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.mid, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali ke Plan POSM
      </button>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          <option value="">Semua Kategori</option>
          {PLAN_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="draft">Draft</option>
          <option value="closed">Selesai</option>
        </select>
      </div>

      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}

      {rows === null ? (
        <Spinner label="Memuat monitoring…" />
      ) : rows.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: T.lo }}>Tidak ada Plan POSM yang cocok dengan filter.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((p) => <PlanMonitorCard key={p.plan_id} p={p} onClick={() => setSelected(p)} />)}
        </div>
      )}
    </div>
  );
}

function PlanMonitorCard({ p, onClick }) {
  const st = PLAN_STATUS_META[p.status] || PLAN_STATUS_META.draft;
  return (
    <button onClick={onClick} style={{ ...card, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: T.hi, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.plan_name}</div>
        <span style={{ ...pill, color: "#B32E85", background: "rgba(179,46,133,0.10)" }}>{PLAN_CATEGORY_LABEL[p.category] || p.category}</span>
        <span style={{ ...pill, color: T.hi, background: "#F1F2F5" }}>{brandLabel(p.brand)}</span>
        <span style={{ ...pill, color: st.color, background: st.bg }}>{st.label}</span>
        <ChevronRight size={16} color={T.lo} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <Stat label="Alokasi" value={fmt(p.total_alloc)} />
        <Stat label="Terpasang" value={fmt(p.total_installed)} />
        <Stat label="Sisa Stok" value={fmt(p.total_sisa)} />
        <Stat label="Progress" value={`${p.progress_pct}%`} highlight />
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "#F1F2F5", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, Number(p.progress_pct) || 0)}%`, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", borderRadius: 999 }} />
      </div>
      {p.target_outlets != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.mid }}>
          <Store size={13} /> Target Program: {fmt(p.target_outlets)} outlet · Outlet sudah dipasang: {fmt(p.outlets_installed)}
          {p.target_outlets > 0 && ` (${Math.min(100, Math.round((p.outlets_installed / p.target_outlets) * 100))}%)`}
        </div>
      )}
    </button>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: T.lo, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: highlight ? T.primary : T.hi, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function PlanDetailMonitoring({ plan, onBack }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchPosmMonitoringDetail(plan.plan_id).then(setRows).catch((e) => { setErr(e.message || "Gagal memuat detail"); setRows([]); });
  }, [plan.plan_id]);

  const byMaterial = useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      if (!map.has(r.posmat_type_id)) map.set(r.posmat_type_id, { name: r.material_name, unit: r.unit, rows: [] });
      map.get(r.posmat_type_id).rows.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  return (
    <div style={{ maxWidth: 1200 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.mid, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali ke daftar Monitoring
      </button>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.hi, marginBottom: 2 }}>{plan.plan_name}</div>
      <div style={{ fontSize: 12.5, color: T.mid, marginBottom: 16 }}>{PLAN_CATEGORY_LABEL[plan.category] || plan.category} · {brandLabel(plan.brand)}</div>

      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}

      {rows === null ? (
        <Spinner label="Memuat detail per branch…" />
      ) : byMaterial.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: T.lo }}>Belum ada alokasi utk Plan ini.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {byMaterial.map((m, i) => (
            <div key={i} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Package size={15} color={T.mid} />
                <div style={{ fontSize: 13, fontWeight: 800, color: T.hi }}>{m.name}</div>
                <div style={{ fontSize: 11, color: T.lo }}>({m.unit})</div>
              </div>
              <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: "#F7F9FC", color: T.mid }}>
                    {["Region", "Branch", "Alokasi", "Terpasang", "Sisa Stok", "Progress"].map((h) => <th key={h} style={{ padding: "7px 10px", textAlign: h === "Region" || h === "Branch" ? "left" : "right" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {m.rows.map((r, ri) => (
                      <tr key={ri} style={{ borderTop: `1px solid ${T.line}` }}>
                        <td style={{ padding: "6px 10px", color: T.lo }}>{r.region || "-"}</td>
                        <td style={{ padding: "6px 10px", fontWeight: 700, color: T.hi }}>{r.branch_name || r.branch_id}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmt(r.alloc_qty)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmt(r.installed_qty)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: Number(r.sisa_qty) < 0 ? T.error : T.hi }}>{fmt(r.sisa_qty)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: T.primary }}>{r.progress_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.lo, fontSize: 13, padding: 30, justifyContent: "center" }}>
      <Loader2 size={18} style={{ animation: "mh-spin 1s linear infinite" }} /> {label}
      <style>{"@keyframes mh-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

const card = { background: "#FFFFFF", border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
const note = { background: "#FFFDE7", border: `1px solid #F0E3B0`, color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5 };
const pill = { fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, display: "inline-block", whiteSpace: "nowrap" };
const inp = { padding: "8px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, outline: "none", boxSizing: "border-box" };
const CHEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";
const selectStyle = { ...inp, appearance: "none", backgroundImage: `url("${CHEV}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 32, cursor: "pointer", minWidth: 180 };
