"use client";
/**
 * /martahub/m/posm/plans/[id] - Detail Plan POSM: info dasar, tab Material
 * (katalog yg dipilih utk Plan ini, dipilih ulang tiap Plan - TIDAK ikut
 * Category), dan tab Alokasi (target per branch, per region biar gampang
 * set banyak branch sekaligus - sumber branch dari mh_sites/data mapping
 * terbaru, BUKAN snapshot lama).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Image as ImageIcon, Loader2, CheckCircle2, X, Plus, Check, AlertTriangle, ArrowRightLeft } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../../_shared/MobileShell";
import { REGIONS, BRAND_DISPLAY } from "../../../_shared/planData";
import {
  getPlan, upsertPlan, setPlanMaterials, setAllocationsBatch, moveAllocation, listBranchRemap,
  posmPlanVisualUrl, listTypes, fetchBranchOptions, PLAN_CATEGORIES,
} from "../../../_shared/posmData";

const CATEGORY_LABEL = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.key, c.label]));
const TABS = [{ key: "info", label: "Info" }, { key: "material", label: "Material" }, { key: "alokasi", label: "Alokasi" }];

export default function PlanDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { loading: sessionLoading, email, scope } = useMartaSession();
  const [plan, setPlan] = useState(null);
  const [tab, setTab] = useState("info");
  const [err, setErr] = useState("");
  const [remap, setRemap] = useState([]);

  async function load() {
    try {
      const [p, r] = await Promise.all([getPlan(id), listBranchRemap()]);
      setPlan(p); setRemap(r || []);
    } catch (e) {
      setErr(e.message || "Gagal memuat Plan");
    }
  }

  useEffect(() => {
    if (sessionLoading || !id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, id]);

  if (sessionLoading || plan === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  const remapByBranch = Object.fromEntries(remap.map((r) => [r.old_branch_id, r]));
  const visualUrl = posmPlanVisualUrl(plan.visual_path);

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push("/martahub/m/posm/plans")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> Plan POSM
        </button>
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: "#F0F0F3", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {visualUrl ? <img src={visualUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageIcon size={18} color="#C4C4CE" />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.name}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 700 }}>{CATEGORY_LABEL[plan.category]} · {BRAND_DISPLAY[plan.brand] || plan.brand}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "8px 14px", borderRadius: 999, background: tab === t.key ? "#17181C" : "#FFFFFF", border: `1px solid ${tab === t.key ? "#17181C" : "#E9EAEE"}`, color: tab === t.key ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 100px" }}>
        {tab === "info" && <InfoTab plan={plan} callerEmail={email} onSaved={load} />}
        {tab === "material" && <MaterialTab plan={plan} callerEmail={email} onSaved={load} />}
        {tab === "alokasi" && <AlokasiTab plan={plan} scope={scope} callerEmail={email} remapByBranch={remapByBranch} onSaved={load} />}
      </div>
    </MobileShell>
  );
}

// ── Tab Info ───────────────────────────────────────────────────────────
function InfoTab({ plan, callerEmail, onSaved }) {
  const [periodFrom, setPeriodFrom] = useState(plan.period_from);
  const [periodTo, setPeriodTo] = useState(plan.period_to);
  const [status, setStatus] = useState(plan.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    try {
      await upsertPlan({ id: plan.id, name: plan.name, category: plan.category, brand: plan.brand, periodFrom, periodTo, status, callerEmail });
      onSaved();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {err && <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}
      <Label text="Status" />
      <div style={{ display: "flex", gap: 8 }}>
        {["draft", "active", "closed"].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ flex: 1, height: 38, borderRadius: 10, border: status === s ? "none" : "1.5px solid #ECEDF0", background: status === s ? BRAND : "#F6F7F9", color: status === s ? "#fff" : "#5A5A68", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", textTransform: "capitalize" }}>
            {s === "draft" ? "Draft" : s === "active" ? "Aktif" : "Selesai"}
          </button>
        ))}
      </div>
      <Label text="Period From" top />
      <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} style={selectBase} />
      <Label text="Period To" top />
      <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} style={selectBase} />
      <button onClick={save} disabled={busy}
        style={{ marginTop: 16, width: "100%", height: 46, borderRadius: 13, border: "none", cursor: busy ? "default" : "pointer", background: busy ? "#F0A8A8" : BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {busy && <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} />}
        {busy ? "Menyimpan…" : "Simpan"}
      </button>
    </Card>
  );
}

// ── Tab Material ───────────────────────────────────────────────────────
function MaterialTab({ plan, callerEmail, onSaved }) {
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState(new Set(plan.materials.map((m) => m.posmat_type_id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { listTypes().then((t) => setCatalog(t || [])).catch((e) => setErr(e.message)); }, []);

  function toggle(id) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function save() {
    setBusy(true); setErr("");
    try {
      await setPlanMaterials(plan.id, Array.from(selected), callerEmail);
      onSaved();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan material");
    } finally {
      setBusy(false);
    }
  }

  if (catalog === null) return <Card><ShellSpinner minHeight="120px" /></Card>;

  return (
    <Card>
      {err && <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}
      <Label text={`Material dipilih (${selected.size})`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {catalog.filter((t) => t.active !== false).map((t) => (
          <button key={t.id} onClick={() => toggle(t.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 12px", borderRadius: 11, border: selected.has(t.id) ? "1.5px solid #ED1C24" : "1.5px solid #ECEDF0", background: selected.has(t.id) ? "rgba(237,28,36,0.05)" : "#FFFFFF", cursor: "pointer", fontFamily: FF, textAlign: "left" }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, border: selected.has(t.id) ? "none" : "1.5px solid #D8D9E0", background: selected.has(t.id) ? BRAND : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {selected.has(t.id) && <Check size={13} color="#fff" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{t.name}</div>
              <div style={{ fontSize: 10.5, color: "#8A8A96" }}>{t.unit}</div>
            </div>
          </button>
        ))}
        {catalog.length === 0 && <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>Belum ada jenis material di katalog.</div>}
      </div>
      <button onClick={save} disabled={busy}
        style={{ marginTop: 16, width: "100%", height: 46, borderRadius: 13, border: "none", cursor: busy ? "default" : "pointer", background: busy ? "#F0A8A8" : BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {busy && <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} />}
        {busy ? "Menyimpan…" : "Simpan Material"}
      </button>
      <div style={{ marginTop: 8, fontSize: 10.5, color: "#B0B0BA" }}>Tidak menemukan jenis material? Tambah baru dulu lewat katalog di menu Stok (akan dipindah ke sini bertahap).</div>
    </Card>
  );
}

// ── Tab Alokasi ────────────────────────────────────────────────────────
function AlokasiTab({ plan, scope, callerEmail, remapByBranch, onSaved }) {
  const isRestricted = ["head", "tmv"].includes(scope?.role);
  const [materialId, setMaterialId] = useState(plan.materials[0]?.posmat_type_id || "");
  const [region, setRegion] = useState(isRestricted ? scope?.region : REGIONS[0].key);
  const [branches, setBranches] = useState(null);
  const [qtyMap, setQtyMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const allocByBranch = useMemo(() => {
    const m = {};
    for (const a of plan.allocations) if (a.posmat_type_id === materialId) m[a.branch_id] = a;
    return m;
  }, [plan.allocations, materialId]);

  useEffect(() => {
    if (!region) return;
    let alive = true;
    fetchBranchOptions(region).then((rows) => {
      if (!alive) return;
      setBranches(rows);
      const init = {};
      for (const b of rows) init[b.branch_id] = allocByBranch[b.branch_id]?.qty ?? 0;
      setQtyMap(init);
    }).catch((e) => setErr(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, materialId]);

  async function save() {
    if (!materialId) { setErr("Pilih material dulu."); return; }
    setBusy(true); setErr(""); setOk(false);
    try {
      const allocations = (branches || []).map((b) => ({ branch_id: b.branch_id, branch_name: b.branch_name, region, qty: qtyMap[b.branch_id] ?? 0 }));
      await setAllocationsBatch({ planId: plan.id, posmatTypeId: materialId, allocations, callerEmail });
      setOk(true);
      onSaved();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan alokasi");
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(alloc) {
    const remapInfo = remapByBranch[alloc.branch_id];
    if (!remapInfo) return;
    const qtyStr = window.prompt(`Pindahkan sisa alokasi "${alloc.branch_name}" ke "${remapInfo.new_branch_name}". Jumlah alokasi baru?`, String(Math.max(alloc.qty - alloc.installed_qty, 0)));
    if (qtyStr == null) return;
    try {
      await moveAllocation({ allocationId: alloc.id, newBranchId: remapInfo.new_branch_id, newBranchName: remapInfo.new_branch_name, newRegion: region, newQty: Number(qtyStr) || 0, callerEmail });
      onSaved();
    } catch (e) {
      setErr(e.message || "Gagal memindahkan alokasi");
    }
  }

  if (plan.materials.length === 0) {
    return <Card><div style={{ fontSize: 12, color: "#8A8A96" }}>Pilih material dulu di tab Material sebelum mengatur alokasi.</div></Card>;
  }

  return (
    <Card>
      {err && <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}
      {ok && <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(21,128,61,0.10)", color: "#15803D", fontSize: 12, fontWeight: 700 }}>Alokasi tersimpan.</div>}

      <Label text="Material" />
      <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} style={selectBase}>
        {plan.materials.map((m) => <option key={m.posmat_type_id} value={m.posmat_type_id}>{m.name}</option>)}
      </select>

      <Label text="Region" top />
      <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={isRestricted} style={selectBase}>
        {REGIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>

      <Label text={`Alokasi per Branch (${branches?.length ?? 0})`} top />
      {branches === null ? <ShellSpinner minHeight="80px" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {branches.map((b) => {
            const existing = allocByBranch[b.branch_id];
            const remapInfo = remapByBranch[b.branch_id];
            return (
              <div key={b.branch_id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "9px 11px", borderRadius: 11, background: "#F7F7F9" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#17181C" }}>{b.branch_name}</div>
                    {existing?.installed_qty > 0 && <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 600 }}>Terpasang: {existing.installed_qty}</div>}
                  </div>
                  <input type="number" min="0" value={qtyMap[b.branch_id] ?? 0}
                    onChange={(e) => setQtyMap((prev) => ({ ...prev, [b.branch_id]: e.target.value }))}
                    style={{ width: 64, height: 34, borderRadius: 9, border: "1.5px solid #ECEDF0", textAlign: "center", fontSize: 13, fontFamily: FF, outline: "none" }} />
                </div>
                {remapInfo && (
                  <button onClick={() => handleMove(existing)} disabled={!existing}
                    style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: existing ? "pointer" : "default", color: "#B8860B", fontSize: 10, fontWeight: 700, fontFamily: FF, padding: 0 }}>
                    <AlertTriangle size={11} /> Digabung ke "{remapInfo.new_branch_name}" <ArrowRightLeft size={10} />
                  </button>
                )}
              </div>
            );
          })}
          {branches.length === 0 && <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>Tidak ada branch di region ini.</div>}
        </div>
      )}

      <button onClick={save} disabled={busy || branches === null}
        style={{ marginTop: 16, width: "100%", height: 46, borderRadius: 13, border: "none", cursor: busy ? "default" : "pointer", background: busy ? "#F0A8A8" : BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {busy && <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} />}
        {busy ? "Menyimpan…" : "Simpan Alokasi Region Ini"}
      </button>
    </Card>
  );
}

function Card({ children }) {
  return <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: 15 }}>{children}</div>;
}
const selectBase = { width: "100%", height: 46, padding: "0 12px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 13, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };
function Label({ text, top }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96", marginTop: top ? 14 : 0, marginBottom: 7 }}>{text}</div>;
}
