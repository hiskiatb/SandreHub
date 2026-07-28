"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, Plus, Check, Copy } from "lucide-react";
import MartaShell, { T, FONT } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";

// ✅ "Head" → "Head TMV" dan "TMV" → "Brand TMV" adalah relabel tampilan saja
// (MARTAHUB_ACTIVITY_USER_SPEC.md §4.5) — nilai role di database (head/tmv)
// TIDAK berubah. Role tl_dsf/dsf/md/spm_sumatera baru (§4.2/§4.5).
const ROLES = [
  ["spm_sumatera", "SPM Sumatera (Superadmin Nasional)"],
  ["head", "Head TMV (per Region)"],
  ["tmv", "Brand TMV (Region × Brand)"],
  ["bme", "BME (Branch)"],
  ["rge", "RGE (Branch)"],
  ["tl_dsf", "TL DSF (Team Leader DSF)"],
  ["dsf", "DSF (Field Sales)"],
  ["md", "MD (Material Distributor)"],
];
const REGIONS = [["NORTH SUMATERA", "NORTH SUMATERA"], ["CENTRAL SUMATERA", "CENTRAL SUMATERA"], ["SOUTH SUMATERA", "SOUTH SUMATERA"]];
const BRANDS = [["im3", "IM3"], ["tri", "3ID (TRI)"]];
const ROLE_LABEL = Object.fromEntries(ROLES);
const REGION_LABEL = Object.fromEntries(REGIONS);

// Role yang atasannya diisi lewat `supervisor_assignment_id` (§4.2/§4.5a),
// bukan lewat region/brand/branch manual — nilai = role atasan yang valid.
const SUPERVISOR_ROLES_FOR = {
  bme: ["tmv"], rge: ["tmv"],
  tl_dsf: ["bme", "rge"], md: ["bme", "rge"],
  dsf: ["tl_dsf"],
};
const isHierarchyRole = (role) => Object.prototype.hasOwnProperty.call(SUPERVISOR_ROLES_FOR, role);

const badge = (txt, c, bg) => <span style={{ fontSize: 10.5, fontWeight: 800, color: c, background: bg, border: `1px solid ${c}33`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{txt}</span>;

export default function AssignmentsPage() {
  return (
    <MartaShell active="assignments" title="User Management">
      {(ctx) => <Body canManage={ctx?.canManage} callerEmail={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ canManage, callerEmail }) {
  const [viewMode, setViewMode] = useState("table"); // "table" | "tree"
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  function copyEmail(u) {
    navigator.clipboard?.writeText(u.email);
    setCopiedId(u.id);
    setTimeout(() => setCopiedId((c) => (c === u.id ? null : c)), 1600);
  }

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [a, p] = await Promise.all([
        supabaseMarta.rpc("mh_list_assignments"),
        supabaseMarta.from("mh_profiles").select("id, email, full_name, status").eq("status", "pending"),
      ]);
      if (a.error) throw new Error(a.error.message);
      setRows(a.data || []);
      setPending(p.data || []);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Simpan satu / banyak assignment sekaligus (BME/RGE bisa pilih banyak branch×brand).
  async function addAssignments(items) {
    setErr(""); setInfo("");
    try {
      let ok = 0;
      for (const form of items) {
        const email = form.email.trim().toLowerCase();
        // Coverage urban/rural ditiadakan — BME & RGE fungsional identik (label saja).
        // Tulis lewat RPC SECURITY DEFINER: menghindari RLS (web pakai anon bridge).
        const { error } = await supabaseMarta.rpc("mh_assign_user", {
          p_email: email,
          p_role: form.role,
          p_region: form.region || null,
          p_brand: form.brand || null,
          p_branch_id: form.branchId || null,
          p_branch_name: form.branchName || null,
          p_coverage: null,
          p_note: null,
          p_full_name: form.fullName || null,
          p_supervisor_assignment_id: form.supervisorAssignmentId || null,
          p_dsf_org_id: form.dsfOrgId || null,
          p_caller_email: callerEmail || null,
        });
        if (error) throw new Error(error.message);
        ok += 1;
      }
      setInfo(ok === 1 ? "1 assignment tersimpan." : `${ok} assignment tersimpan.`);
      setShowAdd(false);
      await load();
    } catch (e) { setErr(e.message); }
  }

  async function updateAssignment(id, form) {
    setErr(""); setInfo("");
    try {
      const { error } = await supabaseMarta.rpc("mh_update_assignment", {
        p_id: id,
        p_role: form.role,
        p_region: form.region || null,
        p_brand: form.brand || null,
        p_branch_id: form.branchId || null,
        p_branch_name: form.branchName || null,
        p_full_name: form.fullName || null,
        p_supervisor_assignment_id: form.supervisorAssignmentId || null,
        p_dsf_org_id: form.dsfOrgId || null,
        p_caller_email: callerEmail || null,
      });
      if (error) throw new Error(error.message);
      setInfo("Assignment diperbarui.");
      setEditRow(null);
      await load();
    } catch (e) { setErr(e.message); }
  }

  async function removeAssignment(id) {
    try {
      const { error } = await supabaseMarta.rpc("mh_delete_assignment", { p_id: id, p_caller_email: callerEmail || null });
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e.message); }
  }

  async function dismiss(id) {
    try {
      const { error } = await supabaseMarta.rpc("mh_dismiss_pending", { p_id: id, p_caller_email: callerEmail || null });
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div>
      {!MARTA_CONFIGURED && (
        <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>
          Supabase MartaHub belum dikonfigurasi / project paused — data tampil kosong. Set env & restore project untuk data live.
        </div>
      )}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}
      {info && <div style={{ ...card, borderColor: T.success, background: T.successBg, color: T.success, marginBottom: 16 }}>{info}</div>}

      {/* Pending users */}
      {pending.length > 0 && (
        <div style={{ ...card, marginBottom: 18, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontWeight: 800, fontSize: 13.5, background: T.warningBg, color: "#7a5b00" }}>
            Menunggu di-assign ({pending.length})
          </div>
          {pending.map((u, i) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: i ? `1px solid ${T.line}` : "none" }}>
              <span style={{ fontWeight: 700 }}>{u.email}</span>
              <span style={{ color: T.mid, fontSize: 12.5 }}>{u.full_name}</span>
              <button onClick={() => copyEmail(u)} style={{ ...btn, marginLeft: "auto", ...(copiedId === u.id ? { color: T.success, border: `1px solid ${T.success}66` } : {}) }}>
                {copiedId === u.id ? <><Check size={14} /> Disalin</> : <><Copy size={14} /> Salin email</>}
              </button>
              {canManage && <button onClick={() => setConfirmState({ title: "Hapus dari antrian?", message: `Email ${u.email} akan dikeluarkan dari daftar menunggu. Jika user login lagi, ia bisa muncul kembali.`, confirmLabel: "Hapus", onConfirm: () => dismiss(u.id) })} style={{ ...btn, color: T.error, border: `1px solid ${T.error}44` }}>Hapus</button>}
            </div>
          ))}
        </div>
      )}

      {/* Assignments table / hierarki */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Daftar Assignment <span style={{ color: T.mid, fontWeight: 500 }}>· {rows.length}</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", border: `1px solid ${T.line}`, borderRadius: 9, overflow: "hidden" }}>
              <button onClick={() => setViewMode("table")} style={{ ...btn, border: "none", borderRadius: 0, background: viewMode === "table" ? T.hover || "#F0F2F5" : "#fff", fontWeight: viewMode === "table" ? 800 : 600 }}>Tabel</button>
              <button onClick={() => setViewMode("tree")} style={{ ...btn, border: "none", borderRadius: 0, background: viewMode === "tree" ? T.hover || "#F0F2F5" : "#fff", fontWeight: viewMode === "tree" ? 800 : 600 }}>Hierarki</button>
            </div>
            {canManage && <button onClick={() => setShowAdd(true)} style={pbtn}>Tambah <Plus size={15} /></button>}
          </div>
        </div>

        {viewMode === "tree" ? (
          <div style={{ padding: 16 }}>
            {loading ? (
              <div style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</div>
            ) : (
              <HierarchyTree rows={rows} />
            )}
          </div>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["Email", "Role", "Atasan", "Region", "Brand", "Branch", "Status", ""].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={8} style={{ padding: 26, textAlign: "center", color: T.lo }}>Belum ada assignment.</td></tr>}
              {!loading && rows.map((r) => {
                const sup = r.supervisor_assignment_id ? rows.find((x) => x.id === r.supervisor_assignment_id) : null;
                return (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                    {r.email}{r.full_name && <span style={{ color: T.mid, fontWeight: 500, marginLeft: 8, fontSize: 12 }}>{r.full_name}</span>}
                    {r.dsf_org_id && <span style={{ color: T.lo, fontWeight: 500, marginLeft: 8, fontSize: 11 }}>ID: {r.dsf_org_id}</span>}
                  </td>
                  <td style={{ padding: "10px 14px", color: T.hi, fontWeight: 600 }}>{ROLE_LABEL[r.role] || r.role}</td>
                  <td style={{ padding: "10px 14px", color: T.mid, fontSize: 12 }}>{sup ? (sup.full_name || sup.email) : "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{REGION_LABEL[r.region] || r.region || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.brand ? badge(r.brand === "tri" ? "3ID" : "IM3", r.brand === "tri" ? T.tri : T.im3, "#fff0f4") : "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.branch_name || r.branch_id || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.logged_in ? badge("Aktif", T.success, T.successBg) : badge("Menunggu login", "#8a5b00", T.warningBg)}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {canManage && <button onClick={() => setEditRow(r)} style={{ ...btn, marginRight: 6 }}>Edit</button>}
                    {canManage && <button onClick={() => setConfirmState({ title: "Hapus assignment?", message: `Akses ${r.email} untuk scope ini dihapus permanen & user tak bisa masuk lagi. Jika ada pengganti, cukup assign email baru ke branch/brand yang sama — data sebelumnya tetap dapat diakses karena terikat ke branch, bukan orang.`, confirmLabel: "Hapus", onConfirm: () => removeAssignment(r.id) })} style={{ ...btn, color: T.error, border: `1px solid ${T.error}44` }}>Hapus</button>}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSave={addAssignments} existing={rows} />}
      {editRow && <EditModal row={editRow} onClose={() => setEditRow(null)} onSave={updateAssignment} existing={rows} />}
      {confirmState && <ConfirmModal {...confirmState} onClose={() => setConfirmState(null)} />}
    </div>
  );
}

// Tampilan pohon hierarki (§4.2/§4.5a): SPM Sumatera → Head TMV (per region)
// → Brand TMV (region × brand) → BME/RGE → TL DSF/MD → DSF. Head↔Brand TMV
// dicocokkan lewat kesamaan `region` (bukan supervisor_assignment_id — lihat
// §4.5a); level di bawahnya lewat `supervisor_assignment_id`.
function HierarchyTree({ rows }) {
  const spm = rows.filter((r) => r.role === "spm_sumatera");
  const heads = rows.filter((r) => r.role === "head");
  const childrenOf = (id) => rows.filter((r) => r.supervisor_assignment_id === id);
  const tmvOfRegion = (region) => rows.filter((r) => r.role === "tmv" && r.region === region);

  const linkedIds = new Set();
  const NodeLine = ({ r, depth, roleColor }) => {
    linkedIds.add(r.id);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", paddingLeft: depth * 22 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: roleColor || T.mid, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 12.5, color: T.hi }}>{r.full_name || r.email}</span>
        <span style={{ fontSize: 10.5, color: T.mid }}>{ROLE_LABEL[r.role] || r.role}</span>
        {r.brand && badge(r.brand === "tri" ? "3ID" : "IM3", r.brand === "tri" ? T.tri : T.im3, "#fff0f4")}
        {r.branch_name && <span style={{ fontSize: 11, color: T.lo }}>{r.branch_name}</span>}
        {r.dsf_org_id && <span style={{ fontSize: 11, color: T.lo }}>ID: {r.dsf_org_id}</span>}
        {!r.logged_in && badge("Menunggu login", "#8a5b00", T.warningBg)}
      </div>
    );
  };

  const renderBmeSubtree = (bme, depth) => (
    <div key={bme.id}>
      <NodeLine r={bme} depth={depth} roleColor={T.primary} />
      {childrenOf(bme.id).map((c) => (
        <div key={c.id}>
          <NodeLine r={c} depth={depth + 1} roleColor={c.role === "md" ? T.blue : T.tri} />
          {c.role === "tl_dsf" && childrenOf(c.id).map((dsf) => <NodeLine key={dsf.id} r={dsf} depth={depth + 2} roleColor={T.mid} />)}
        </div>
      ))}
    </div>
  );

  const renderTmvSubtree = (tmv, depth) => (
    <div key={tmv.id}>
      <NodeLine r={tmv} depth={depth} roleColor={T.im3} />
      {childrenOf(tmv.id).filter((r) => r.role === "bme" || r.role === "rge").map((bme) => renderBmeSubtree(bme, depth + 1))}
    </div>
  );

  return (
    <div style={{ fontFamily: FONT }}>
      {spm.map((s) => <NodeLine key={s.id} r={s} depth={0} roleColor={T.error} />)}
      {heads.map((h) => (
        <div key={h.id}>
          <NodeLine r={h} depth={spm.length ? 1 : 0} roleColor={T.primaryD} />
          {tmvOfRegion(h.region).map((tmv) => renderTmvSubtree(tmv, (spm.length ? 1 : 0) + 1))}
        </div>
      ))}
      {(() => {
        // Brand TMV yang region-nya tidak cocok dengan Head TMV manapun +
        // baris lain yang belum sempat ter-render di atas → tampilkan rata
        // kiri supaya tidak "hilang" dari tampilan, sambil menandai belum
        // terhubung penuh ke hierarki.
        const dangling = rows.filter((r) => !linkedIds.has(r.id) && r.role !== "spm_sumatera" && r.role !== "head");
        if (dangling.length === 0) return null;
        return (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px dashed ${T.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.warning, textTransform: "uppercase", marginBottom: 4 }}>Belum terhubung penuh ke hierarki</div>
            {dangling.map((r) => <NodeLine key={r.id} r={r} depth={0} roleColor={T.warning} />)}
          </div>
        );
      })()}
      {rows.length === 0 && <div style={{ padding: 14, textAlign: "center", color: T.lo }}>Belum ada assignment.</div>}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel = "Hapus", danger = true, onConfirm, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: danger ? T.errorBg : T.primaryBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={18} color={danger ? T.error : T.primary} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.hi }}>{title}</div>
          </div>
          <div style={{ fontSize: 13.5, color: T.mid, lineHeight: 1.55 }}>{message}</div>
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btn}>Batal</button>
          <button onClick={() => { onConfirm(); onClose(); }} style={{ ...btn, background: danger ? T.error : T.primary, color: "#fff", border: `1px solid ${danger ? T.error : T.primary}` }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const BRAND_LABEL = { im3: "IM3", tri: "3ID" };

function AddModal({ onClose, onSave, existing }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("bme");
  const [region, setRegion] = useState("NORTH SUMATERA");
  const [brand, setBrand] = useState("im3");         // untuk role TM & Visibility
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set()); // "brand:branch_id"
  const [branchRows, setBranchRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [supervisorId, setSupervisorId] = useState("");
  const [dsfOrgId, setDsfOrgId] = useState("");
  const isBranchRole = role === "bme" || role === "rge";
  const isTmv = role === "tmv";
  const isDsf = role === "dsf";
  // tl_dsf/md/dsf tidak punya region/brand/branch sendiri — diwarisi dari
  // rantai supervisor (✅ dikonfirmasi §4.2/§4.5a), jadi form-nya disederhanakan.
  const isPureHierarchyRole = role === "tl_dsf" || role === "md" || role === "dsf";
  const needsSupervisor = isHierarchyRole(role);
  const supervisorOptions = useMemo(() => {
    const wanted = SUPERVISOR_ROLES_FOR[role];
    if (!wanted) return [];
    return (existing || []).filter((r) => wanted.includes(r.role))
      .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
  }, [existing, role]);

  // Semua kombinasi branch × brand dari Master Data (mh_sites aktif).
  useEffect(() => {
    let on = true; setLoading(true);
    supabaseMarta.rpc("mh_branch_brand_list")
      .then(({ data }) => { if (on) setBranchRows(data || []); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  // Kelompokkan per branch → { branch_id, branch, region, brands:{im3,tri} }
  const branches = useMemo(() => {
    const m = new Map();
    for (const r of branchRows) {
      if (!r.branch_id || !r.brand) continue;
      if (!m.has(r.branch_id)) m.set(r.branch_id, { branch_id: r.branch_id, branch: r.branch || r.branch_id, region: r.region, brands: {} });
      m.get(r.branch_id).brands[r.brand] = true;
    }
    let arr = [...m.values()].sort((a, b) => String(a.branch).localeCompare(String(b.branch)));
    const t = q.trim().toLowerCase();
    if (t) arr = arr.filter((b) => String(b.branch).toLowerCase().includes(t));
    return arr;
  }, [branchRows, q]);

  // Kombinasi yang SUDAH aktif untuk email ini → dikunci (cegah duplikat).
  const emailKey = email.trim().toLowerCase();
  const assignedSet = useMemo(() => {
    const s = new Set();
    if (!emailKey) return s;
    for (const a of existing || []) {
      if (String(a.email || "").toLowerCase() !== emailKey) continue;
      if (a.branch_id && a.brand) s.add(`${a.brand}:${a.branch_id}`);
    }
    return s;
  }, [existing, emailKey]);

  const toggle = (key) => setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const canSave = name.trim() && emailKey
    && (isBranchRole ? selected.size > 0 : true)
    && (needsSupervisor ? !!supervisorId : true)
    && (isDsf ? dsfOrgId.trim() : true);

  const save = () => {
    if (!canSave) return;
    if (isPureHierarchyRole) {
      // tl_dsf / md / dsf — tanpa region/brand/branch manual, atasan wajib.
      onSave([{
        email: emailKey, fullName: name.trim().toUpperCase(), role,
        region: null, brand: null, branchId: null, branchName: null,
        supervisorAssignmentId: supervisorId, dsfOrgId: isDsf ? dsfOrgId.trim() : null,
      }]);
    } else if (isBranchRole) {
      const items = [];
      for (const key of selected) {
        if (assignedSet.has(key)) continue;
        const [b, branch_id] = key.split(":");
        const br = branches.find((x) => x.branch_id === branch_id);
        items.push({
          email: emailKey, fullName: name.trim().toUpperCase(), role, region, brand: b,
          branchId: branch_id, branchName: br?.branch || "",
          supervisorAssignmentId: needsSupervisor ? supervisorId : null, dsfOrgId: null,
        });
      }
      if (items.length) onSave(items);
    } else {
      onSave([{
        email: emailKey, fullName: name.trim().toUpperCase(), role, region: role === "spm_sumatera" ? null : region,
        brand: isTmv ? brand : null, branchId: null, branchName: null,
        supervisorAssignmentId: null, dsfOrgId: null,
      }]);
    }
  };

  const Chip = ({ branchId, br }) => {
    const key = `${br}:${branchId}`;
    const isAssigned = assignedSet.has(key);
    const isSel = selected.has(key);
    const base = { padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: isAssigned ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: FONT };
    const style = isAssigned
      ? { ...base, background: T.successBg, color: T.success, border: `1px solid ${T.success}55`, cursor: "not-allowed" }
      : isSel
        ? { ...base, background: GRAD, color: "#fff", border: "1px solid transparent" }
        : { ...base, background: "#fff", color: T.mid, border: `1px solid ${T.line}` };
    return (
      <button type="button" disabled={isAssigned} onClick={() => toggle(key)} style={style} title={isAssigned ? "Sudah ter-assign untuk email ini" : ""}>
        {isAssigned && <Check size={11} />}
        {isSel && <Check size={11} />}
        {BRAND_LABEL[br] || br}
      </button>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 800 }}>Tambah Assignment</div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Nama *"><input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP" style={{ ...inp, textTransform: "uppercase" }} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Email *"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@ioh.co.id" style={inp} /></Field></div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Role">
                <select value={role} onChange={(e) => { setRole(e.target.value); setSelected(new Set()); setSupervisorId(""); setDsfOrgId(""); }} style={selectStyle}>
                  {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            </div>
            {role !== "spm_sumatera" && !isPureHierarchyRole && (
              <div style={{ flex: 1 }}><Field label="Region"><select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle}>{REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div>
            )}
          </div>
          {isTmv && <Field label="Brand"><select value={brand} onChange={(e) => setBrand(e.target.value)} style={selectStyle}>{BRANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>}

          {needsSupervisor && (
            <Field label={`Atasan Langsung ${SUPERVISOR_ROLES_FOR[role].map((r) => ROLE_LABEL[r]).join(" / ")} *`}>
              <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} style={selectStyle}>
                <option value="">— pilih atasan —</option>
                {supervisorOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name || s.email} ({ROLE_LABEL[s.role] || s.role}{s.branch_name ? ` · ${s.branch_name}` : ""})</option>
                ))}
              </select>
              {supervisorOptions.length === 0 && (
                <div style={{ fontSize: 11, color: T.warning, marginTop: 4 }}>Belum ada assignment {SUPERVISOR_ROLES_FOR[role].map((r) => ROLE_LABEL[r]).join("/")} yang bisa dipilih sebagai atasan — buat itu dulu.</div>
              )}
            </Field>
          )}
          {isDsf && (
            <Field label="ID DSF * (dipakai sebagai org_id di Validity MSISDN)">
              <input value={dsfOrgId} onChange={(e) => setDsfOrgId(e.target.value)} placeholder="mis. DSF-00123" style={inp} />
            </Field>
          )}

          {isBranchRole && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Pilih Branch × Brand</div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari branch…" style={{ ...inp, marginBottom: 8 }} />
              <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, maxHeight: 300, overflowY: "auto" }}>
                {loading && <div style={{ padding: 14, fontSize: 12.5, color: T.lo }}>Memuat branch…</div>}
                {!loading && branches.length === 0 && (
                  <div style={{ padding: 14, fontSize: 12, color: "#7a5b00" }}>Belum ada data branch. Import List Site dulu di menu <b>Master Data</b>.</div>
                )}
                {!loading && branches.map((b, i) => (
                  <div key={b.branch_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i ? `1px solid ${T.line}` : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.branch}</div>
                      {b.region && <div style={{ fontSize: 11, color: T.lo }}>{REGION_LABEL[b.region] || b.region}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {b.brands.im3 && <Chip branchId={b.branch_id} br="im3" />}
                      {b.brands.tri && <Chip branchId={b.branch_id} br="tri" />}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: T.lo, marginTop: 6 }}>
                <span style={{ color: T.success, fontWeight: 700 }}>✓ Hijau</span> = sudah ter-assign untuk email ini (tak bisa dipilih lagi). Satu email boleh memegang beberapa branch/brand.
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 12, color: T.mid, fontWeight: 700 }}>{isBranchRole && selected.size > 0 ? `${selected.size} dipilih` : ""}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btn}>Batal</button>
            <button onClick={save} disabled={!canSave} style={{ ...pbtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>
              Simpan{isBranchRole && selected.size > 0 ? ` (${selected.size})` : ""} <Check size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Edit satu assignment (email tetap; ubah role/region/brand/branch).
function EditModal({ row, onClose, onSave, existing }) {
  const [name, setName] = useState(row.full_name || "");
  const [role, setRole] = useState(row.role || "bme");
  const [region, setRegion] = useState(row.region || "NORTH SUMATERA");
  const [brand, setBrand] = useState(row.brand || "im3");
  const [branchId, setBranchId] = useState(row.branch_id || "");
  const [branchName, setBranchName] = useState(row.branch_name || "");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [supervisorId, setSupervisorId] = useState(row.supervisor_assignment_id || "");
  const [dsfOrgId, setDsfOrgId] = useState(row.dsf_org_id || "");
  const isBranchRole = role === "bme" || role === "rge";
  const isTmv = role === "tmv";
  const isDsf = role === "dsf";
  const isPureHierarchyRole = role === "tl_dsf" || role === "md" || role === "dsf";
  const needsSupervisor = isHierarchyRole(role);
  const supervisorOptions = useMemo(() => {
    const wanted = SUPERVISOR_ROLES_FOR[role];
    if (!wanted) return [];
    return (existing || []).filter((r) => wanted.includes(r.role) && r.id !== row.id)
      .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
  }, [existing, role, row.id]);

  useEffect(() => {
    let on = true; setLoading(true);
    supabaseMarta.rpc("mh_branch_brand_list")
      .then(({ data }) => { if (on) setData(data || []); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  // Branch unik yang punya brand terpilih.
  const branches = useMemo(() => {
    const seen = new Set(); const arr = [];
    for (const r of data) {
      if (r.brand !== brand || !r.branch_id || seen.has(r.branch_id)) continue;
      seen.add(r.branch_id); arr.push(r);
    }
    arr.sort((a, b) => String(a.branch).localeCompare(String(b.branch)));
    return arr;
  }, [data, brand]);

  const pickBranch = (id) => {
    const b = branches.find((x) => x.branch_id === id);
    setBranchId(id); setBranchName(b?.branch || "");
    if (b?.region) setRegion(b.region);
  };

  const canSave = name.trim() && row.email && (!isBranchRole || branchId)
    && (needsSupervisor ? !!supervisorId : true)
    && (isDsf ? dsfOrgId.trim() : true);
  const save = () => {
    if (!canSave) return;
    onSave(row.id, {
      role, region: isPureHierarchyRole || role === "spm_sumatera" ? null : region,
      fullName: name.trim().toUpperCase(),
      brand: (isTmv || isBranchRole) ? brand : null,
      branchId: isBranchRole ? branchId : null,
      branchName: isBranchRole ? branchName : null,
      supervisorAssignmentId: needsSupervisor ? supervisorId : null,
      dsfOrgId: isDsf ? dsfOrgId.trim() : null,
    });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 800 }}>Edit Assignment</div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Nama *"><input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP" style={{ ...inp, textTransform: "uppercase" }} /></Field>
          <Field label="Email"><input value={row.email} disabled style={{ ...inp, background: T.sub || "#F7F9FC", color: T.mid, cursor: "not-allowed" }} /></Field>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Role"><select value={role} onChange={(e) => { setRole(e.target.value); }} style={selectStyle}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div>
            {role !== "spm_sumatera" && !isPureHierarchyRole && (
              <div style={{ flex: 1 }}><Field label="Region"><select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle}>{REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div>
            )}
          </div>
          {(isTmv || isBranchRole) && (
            <Field label="Brand"><select value={brand} onChange={(e) => { setBrand(e.target.value); setBranchId(""); setBranchName(""); }} style={selectStyle}>{BRANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          )}
          {isBranchRole && (
            <Field label="Branch">
              <select value={branchId} onChange={(e) => pickBranch(e.target.value)} style={selectStyle} disabled={loading}>
                <option value="">{loading ? "Memuat branch…" : "— pilih branch —"}</option>
                {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch}</option>)}
              </select>
            </Field>
          )}
          {needsSupervisor && (
            <Field label={`Atasan Langsung ${SUPERVISOR_ROLES_FOR[role].map((r) => ROLE_LABEL[r]).join(" / ")} *`}>
              <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} style={selectStyle}>
                <option value="">— pilih atasan —</option>
                {supervisorOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name || s.email} ({ROLE_LABEL[s.role] || s.role}{s.branch_name ? ` · ${s.branch_name}` : ""})</option>
                ))}
              </select>
            </Field>
          )}
          {isDsf && (
            <Field label="ID DSF * (dipakai sebagai org_id di Validity MSISDN)">
              <input value={dsfOrgId} onChange={(e) => setDsfOrgId(e.target.value)} placeholder="mis. DSF-00123" style={inp} />
            </Field>
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btn}>Batal</button>
          <button onClick={save} disabled={!canSave} style={{ ...pbtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>Simpan <Check size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label style={{ display: "block" }}><div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>{children}</label>;
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const btn = { padding: "8px 13px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1 };
const GRAD = "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)";
const pbtn = { ...btn, background: GRAD, color: "#fff", border: "none", padding: "9px 16px" };
const inp = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
const CHEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";
const selectStyle = { ...inp, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: "pointer", backgroundImage: `url("${CHEV}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", backgroundSize: "13px", paddingRight: 32 };
