"use client";
import { useState, useEffect, useCallback } from "react";
import MartaShell, { T, FONT } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";

const ROLES = [
  ["head", "Head Marcomm (Region)"],
  ["tmv", "TMV (Region × Brand)"],
  ["bme", "BME (Branch, urban)"],
  ["rge", "RGE (Branch, rural)"],
];
const REGIONS = [["north", "North Sumatera"], ["central", "Central Sumatera"], ["south", "South Sumatera"]];
const BRANDS = [["im3", "IM3"], ["tri", "3ID (TRI)"]];
const COVERAGE = [["urban", "Urban (BME)"], ["rural", "Rural (RGE)"]];

const badge = (txt, c, bg) => <span style={{ fontSize: 10.5, fontWeight: 800, color: c, background: bg, border: `1px solid ${c}33`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{txt}</span>;

export default function AssignmentsPage() {
  return (
    <MartaShell active="assignments" title="Assignments" subtitle="Pre-provision email BME/RGE ke branch-brand. Email = kunci login SSO.">
      {(ctx) => <Body canManage={ctx?.canManage} />}
    </MartaShell>
  );
}

function Body({ canManage }) {
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [a, p] = await Promise.all([
        supabaseMarta.from("mh_assignments").select("*").order("created_at", { ascending: false }),
        supabaseMarta.from("mh_profiles").select("id, email, full_name, status").eq("status", "pending"),
      ]);
      if (a.error) throw new Error(a.error.message);
      setRows(a.data || []);
      setPending(p.data || []);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addAssignment(form) {
    setErr(""); setInfo("");
    try {
      const payload = {
        email: form.email.trim().toLowerCase(),
        role: form.role, region: form.region || null, brand: form.brand || null,
        branch_id: form.branchId || null, branch_name: form.branchName || null,
        coverage: form.role === "bme" ? "urban" : form.role === "rge" ? "rural" : (form.coverage || null),
        status: "active",
      };
      const { error } = await supabaseMarta.from("mh_assignments").insert(payload);
      if (error) throw new Error(error.message);
      setInfo(`Email ${payload.email} di-assign sebagai ${payload.role}.`);
      setShowAdd(false);
      await load();
    } catch (e) { setErr(e.message); }
  }

  async function revoke(id) {
    try {
      const { error } = await supabaseMarta.from("mh_assignments").update({ status: "revoked" }).eq("id", id);
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
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: i ? `1px solid ${T.line}` : "none" }}>
              <span style={{ fontWeight: 700 }}>{u.email}</span>
              <span style={{ color: T.mid, fontSize: 12.5 }}>{u.full_name}</span>
              <button onClick={() => { navigator.clipboard?.writeText(u.email); }} style={{ ...btn, marginLeft: "auto" }}>Salin email</button>
            </div>
          ))}
        </div>
      )}

      {/* Assignments table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Daftar Assignment <span style={{ color: T.mid, fontWeight: 500 }}>· {rows.length}</span></div>
          {canManage && <button onClick={() => setShowAdd(true)} style={{ ...btn, background: T.primary, color: "#fff", borderColor: T.primary }}>+ Tambah</button>}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["Email", "Role", "Region", "Brand", "Branch", "Coverage", "Status", ""].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={8} style={{ padding: 26, textAlign: "center", color: T.lo }}>Belum ada assignment.</td></tr>}
              {!loading && rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.line}`, opacity: r.status === "active" ? 1 : 0.5 }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.email}</td>
                  <td style={{ padding: "10px 14px" }}>{badge((r.role || "").toUpperCase(), T.blue, T.blueBg)}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.region || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.brand ? badge(r.brand === "tri" ? "3ID" : "IM3", r.brand === "tri" ? T.tri : T.im3, "#fff0f4") : "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.branch_name || r.branch_id || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.coverage || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.status === "active" ? badge("Aktif", T.success, T.successBg) : badge(r.status, T.mid, "#eef1f6")}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    {canManage && r.status === "active" && <button onClick={() => revoke(r.id)} style={{ ...btn, color: T.error, borderColor: `${T.error}44` }}>Cabut</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSave={addAssignment} />}
    </div>
  );
}

function AddModal({ onClose, onSave }) {
  const [f, setF] = useState({ email: "", role: "bme", region: "north", brand: "im3", branchId: "", branchName: "", coverage: "urban" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const showBrand = f.role === "tmv" || f.role === "bme" || f.role === "rge";
  const showBranch = f.role === "bme" || f.role === "rge";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 800 }}>Tambah Assignment</div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Email *"><input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="nama@ioh.co.id" style={inp} /></Field>
          <Field label="Role"><select value={f.role} onChange={(e) => set("role", e.target.value)} style={inp}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Region"><select value={f.region} onChange={(e) => set("region", e.target.value)} style={inp}>{REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          {showBrand && <Field label="Brand"><select value={f.brand} onChange={(e) => set("brand", e.target.value)} style={inp}>{BRANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>}
          {showBranch && <>
            <Field label="Branch ID"><input value={f.branchId} onChange={(e) => set("branchId", e.target.value)} placeholder="branch-medan" style={inp} /></Field>
            <Field label="Branch Name"><input value={f.branchName} onChange={(e) => set("branchName", e.target.value)} placeholder="Medan" style={inp} /></Field>
            <Field label="Coverage"><select value={f.coverage} onChange={(e) => set("coverage", e.target.value)} style={inp}>{COVERAGE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </>}
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btn}>Batal</button>
          <button onClick={() => f.email.trim() && onSave(f)} style={{ ...btn, background: T.primary, color: "#fff", borderColor: T.primary }}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label style={{ display: "block" }}><div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>{children}</label>;
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const btn = { padding: "7px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT };
const inp = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
